// Runs the migration on an in-process Postgres 16 (PGlite) with minimal stubs
// for Supabase's auth schema, then checks permissions and invariants as real
// signed-in users. Nothing here touches a hosted database.
//   npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(path.join(here, "../migrations/20261022000000_init.sql"), "utf8");

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const M = (n) => `10000000-0000-0000-0000-00000000000${n}`; // movies
const S1 = "20000000-0000-0000-0000-000000000001";          // show
const E = (n) => `30000000-0000-0000-0000-00000000000${n}`; // S1 episodes
const uuid = () => crypto.randomUUID();

let db;
async function admin(sql, params) {
  await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  return params ? db.query(sql, params) : db.exec(sql);
}
async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec("reset role;"); }
}
const rows = async (uid, sql, params) => (await as(uid, sql, params)).rows;

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(migration);
  await admin(`
    insert into auth.users values ('${A}'), ('${B}');
    insert into profiles values ('${A}', 'kyle', 'Kyle'), ('${B}', 'alex', 'Alex');
    insert into titles (id, kind, name) values
      ('${M(1)}', 'movie', 'Arrival'), ('${M(2)}', 'movie', 'Dune: Part Two'),
      ('${M(3)}', 'movie', 'Past Lives'), ('${M(4)}', 'movie', 'Tenet'),
      ('${S1}', 'show', 'Severance');
    insert into episodes (id, title_id, season_number, number) values
      ('${E(1)}', '${S1}', 1, 1), ('${E(2)}', '${S1}', 1, 2), ('${E(3)}', '${S1}', 1, 3);
    insert into streaming_services values ('max', 'Max');
    insert into release_events (stable_key, title_id, episode_id, kind, country, granularity, instant, source) values
      -- 02:00 UTC on Nov 2 is still Nov 1 in Chicago
      ('t:e3:US', '${S1}', '${E(3)}', 'episode', 'US', 'instant', '2026-11-02T02:00:00Z', 'test');
    insert into release_events (stable_key, title_id, kind, country, granularity, local_date, source) values
      ('t:m2:theater:US', '${M(2)}', 'theatrical', 'US', 'day', '2026-10-23', 'test');
    insert into release_events (stable_key, title_id, kind, country, service_id, granularity, source) values
      ('t:m2:sub:US', '${M(2)}', 'subscription', 'US', 'max', 'tba', 'test');
  `);
});

test("owner isolation: another user can't read or write my list", async () => {
  await as(A, "select set_list_state($1, 'watching')", [S1]);
  assert.equal((await rows(B, "select * from user_titles")).length, 0);
  await assert.rejects(as(B, "insert into user_titles values ($1, $2, 'watching')", [A, M(1)]));
});

test("catalog is read-only to users", async () => {
  assert.ok((await rows(A, "select * from titles")).length >= 5);
  await assert.rejects(as(A, "insert into titles (kind, name) values ('movie', 'x')"));
  await assert.rejects(as(A, "update titles set name = 'hacked' where id = $1", [M(1)]), /permission denied/);
});

test("Watching and Watch Later are mutually exclusive by construction", async () => {
  await as(A, "select set_list_state($1, 'watch_later')", [M(3)]);
  await as(A, "select set_list_state($1, 'watching')", [M(3)]);
  const r = await rows(A, "select state from user_titles where title_id = $1", [M(3)]);
  assert.deepEqual(r, [{ state: "watching" }]);
});

test("a ranking's pool must match the title's kind", async () => {
  await assert.rejects(as(A, "insert into rankings (user_id, title_id, pool, position, reaction) values ($1, $2, 'show', 1, 'good')", [A, M(4)]));
});

test("record_ranking: exact placement, idempotent retries, rerank retires old answers", async () => {
  const rank = (title, slot, comps, session = uuid()) =>
    as(A, "select record_ranking($1, 'great', $2, $3, $4, $5)", [title, slot, JSON.stringify(comps), session, uuid()]);
  await rank(M(1), 0, []);
  await rank(M(2), 0, [{ other: M(1), outcome: "a" }]);
  const s3 = uuid();
  await rank(M(3), 1, [{ other: M(2), outcome: "b" }, { other: M(1), outcome: "a" }], s3);
  await rank(M(3), 1, [{ other: M(2), outcome: "b" }], s3); // retry: no-op
  const order = async () => (await rows(A, "select title_id, position from rankings where pool = 'movie' order by position")).map((r) => r.title_id);
  assert.deepEqual(await order(), [M(2), M(3), M(1)]);
  assert.equal((await rows(A, "select * from comparisons")).length, 3);

  await rank(M(1), 0, [{ other: M(2), outcome: "a" }]);   // rerank Arrival to the top
  assert.deepEqual(await order(), [M(1), M(2), M(3)]);
  const positions = (await rows(A, "select position from rankings where pool = 'movie' order by position")).map((r) => r.position);
  assert.deepEqual(positions, [1, 2, 3]);
  const active = await rows(A, "select * from comparisons where superseded_at is null");
  assert.equal(active.length, 2, "old answers involving the reranked title are retired, not deleted");
  assert.equal((await rows(A, "select * from comparisons")).length, 4);
});

test("comparisons can't cross pools", async () => {
  await assert.rejects(as(A, "select record_ranking($1, 'good', 0, $2, $3, $4)",
    [M(4), JSON.stringify([{ other: S1, outcome: "a" }]), uuid(), uuid()]), /pool/);
});

test("only one all-time favorite per pool", async () => {
  await as(A, "select set_favorite($1, true)", [M(1)]);
  await as(A, "select set_favorite($1, true)", [M(2)]);
  const favs = await rows(A, "select title_id from rankings where favorite");
  assert.deepEqual(favs.map((r) => r.title_id), [M(2)]);
});

test("feed visibility: requires an accepted follow, respects blocks and privacy", async () => {
  await as(B, "insert into activity (actor_id, verb, title_id, score, reaction, client_event_id) values ($1, 'ranked', $2, 9.1, 'great', $3)", [B, M(2), uuid()]);
  const feed = async () => (await rows(A, "select * from friends_feed()")).length;
  assert.equal(await feed(), 0, "strangers see nothing");

  await as(A, "insert into follows (follower_id, followee_id) values ($1, $2)", [A, B]);
  assert.equal(await feed(), 0, "pending request sees nothing");
  await as(A, "update follows set status = 'accepted' where follower_id = $1", [A]);
  assert.equal(await feed(), 0, "requester can't accept their own request");
  await assert.rejects(as(A, "insert into follows (follower_id, followee_id, status) values ($1, $2, 'accepted')", [B, A]));

  await as(B, "update follows set status = 'accepted' where follower_id = $1 and followee_id = $2", [A, B]);
  assert.equal(await feed(), 1, "accepted follower sees friends-only activity");

  await as(B, "insert into user_settings (user_id, feed_visibility) values ($1, 'private')", [B]);
  assert.equal(await feed(), 0, "private profile hides activity");
  await as(B, "update user_settings set feed_visibility = 'friends' where user_id = $1", [B]);

  await as(B, "insert into blocks values ($1, $2)", [B, A]);
  assert.equal(await feed(), 0, "block hides activity");
  assert.equal((await rows(A, "select * from profiles where id = $1", [B])).length, 0, "and the profile");
  await as(B, "delete from blocks where blocker_id = $1", [B]);
});

test("spoiler masking: episode details hidden until the viewer has watched that far", async () => {
  await as(B, "insert into activity (actor_id, verb, title_id, episode_id, reaction, note, client_event_id) values ($1, 'reacted_episode', $2, $3, 'great', 'that ending!', $4)", [B, S1, E(3), uuid()]);
  const ep = async () => (await rows(A, "select masked, episode_number, note from friends_feed() where verb = 'reacted_episode'"))[0];
  await as(A, "insert into watch_events (user_id, title_id, episode_id, client_event_id) values ($1, $2, $3, $4)", [A, S1, E(1), uuid()]);
  assert.deepEqual(await ep(), { masked: true, episode_number: null, note: null });
  await as(A, "insert into watch_events (user_id, title_id, episode_id, client_event_id) values ($1, $2, $3, $4)", [A, S1, E(3), uuid()]);
  assert.deepEqual(await ep(), { masked: false, episode_number: 3, note: "that ending!" });
});

test("privileged helpers only answer about the signed-in user", async () => {
  const mine = async (uid) => (await rows(uid, "select watched_through($1) as n", [S1]))[0].n;
  assert.ok((await mine(A)) > 0, "A sees own progress");
  assert.equal(await mine(B), -1, "B gets B's (empty) progress, never A's");
  await assert.rejects(as(B, "select watched_through($1, $2)", [A, S1]), /does not exist/);
  await assert.rejects(as(B, "select can_see($1, $2)", [A, B]), /does not exist/);
});

test("watch events are idempotent per client_event_id", async () => {
  const id = uuid();
  await as(A, "insert into watch_events (user_id, title_id, episode_id, client_event_id) values ($1, $2, $3, $4)", [A, S1, E(2), id]);
  await assert.rejects(as(A, "insert into watch_events (user_id, title_id, episode_id, client_event_id) values ($1, $2, $3, $4)", [A, S1, E(2), id]));
});

test("release dates must declare precision honestly", async () => {
  await assert.rejects(admin(`insert into release_events (stable_key, title_id, kind, country, granularity, source) values ('bad', '${M(1)}', 'theatrical', 'US', 'day', 'test')`));
  await assert.rejects(admin(`insert into release_events (stable_key, title_id, kind, country, granularity, local_date, source) values ('bad2', '${S1}', 'episode', 'US', 'day', '2026-11-01', 'test')`));
});

test("calendar: user's time zone, watching shows, explicit follows, pause removes episodes", async () => {
  const cal = async () => (await rows(A, "select kind, local_day::text as day from my_calendar('2026-10-01', '2026-11-30')"));
  // A is watching Severance (set earlier); no movie follows yet.
  assert.deepEqual(await cal(), [{ kind: "episode", day: "2026-11-01" }], "02:00Z Nov 2 shows on Nov 1 in Chicago");

  await as(A, "insert into release_follows values ($1, $2, 'theatrical')", [A, M(2)]);
  await as(A, "insert into release_follows values ($1, $2, 'subscription')", [A, M(2)]);
  assert.deepEqual(await cal(), [{ kind: "theatrical", day: "2026-10-23" }, { kind: "episode", day: "2026-11-01" }],
    "TBA subscription date is followed but not invented onto the calendar");

  await as(A, "select set_list_state($1, 'watch_later')", [S1]);
  assert.deepEqual(await cal(), [{ kind: "theatrical", day: "2026-10-23" }], "pausing removes episodes");
});

test("account deletion removes all personal data", async () => {
  await admin(`delete from auth.users where id = '${A}'`);
  for (const t of ["user_titles", "rankings", "comparisons", "watch_events", "release_follows", "follows"]) {
    const r = await admin(`select count(*)::int as n from ${t} where ${t === "follows" ? "follower_id" : "user_id"} = '${A}'`, []);
    assert.equal(r.rows[0].n, 0, t);
  }
});
