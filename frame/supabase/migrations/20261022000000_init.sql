-- Frame — initial schema (Postgres 15+/Supabase). NOT APPLIED ANYWHERE YET.
--
-- Principles
--   * Catalog (titles, episodes, release events) is shared and read-only to
--     users; only server jobs (service_role, which bypasses RLS) write it.
--   * Everything a user creates is owned by them and protected by RLS.
--   * Raw history is append-only (watch events, comparisons) so scores and
--     progress can be recomputed. Client writes carry a client_event_id so
--     offline retries are idempotent.
--   * Invariants live in the schema, not in UI code:
--       - one list state per user+title (Watching vs Watch Later can't both be true)
--       - a ranking's pool must match the title's kind
--       - one all-time favorite per pool; contiguous list positions
--       - release dates carry explicit granularity; "TBA" is a real state

-- ───────────────────────────── Types ─────────────────────────────
create type title_kind        as enum ('movie', 'show');
create type list_state        as enum ('watching', 'watch_later', 'stopped', 'finished');
create type reaction          as enum ('bad', 'meh', 'fine', 'good', 'great'); -- ordered
create type release_kind      as enum ('episode', 'season_drop', 'theatrical', 'subscription', 'digital');
create type date_precision    as enum ('instant', 'day', 'month', 'year', 'tba');
create type release_status    as enum ('rumored', 'announced', 'confirmed', 'cancelled', 'removed');
create type comparison_outcome as enum ('a', 'b', 'tie', 'skip');
create type follow_status     as enum ('pending', 'accepted');
create type visibility        as enum ('private', 'friends');

-- ───────────────────────────── People ─────────────────────────────
-- Public-facing identity (visible to other signed-in users for search/follow).
create table profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  handle        text not null check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name  text not null check (char_length(display_name) between 1 and 50),
  created_at    timestamptz not null default now()
);
create unique index profiles_handle_key on profiles (handle);

-- Private settings (owner only).
create table user_settings (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  country          char(2) not null default 'US',
  time_zone        text not null default 'America/Chicago',
  services         text[] not null default '{}',      -- streaming_services.id the user has
  feed_visibility  visibility not null default 'friends',
  spoiler_guard    boolean not null default true,
  updated_at       timestamptz not null default now()
);

-- ───────────────────────────── Catalog (server-written) ─────────────────────────────
create table titles (
  id               uuid primary key default gen_random_uuid(),
  kind             title_kind not null,
  name             text not null,
  original_date    date,
  runtime_minutes  int check (runtime_minutes > 0),
  poster_url       text,
  overview         text,
  updated_at       timestamptz not null default now(),
  unique (id, kind)                                     -- target for pool-matching FK
);

create table title_external_ids (
  provider     text not null check (provider in ('tmdb', 'tvmaze', 'imdb')),
  external_id  text not null,
  title_id     uuid not null references titles (id) on delete cascade,
  primary key (provider, external_id),
  unique (title_id, provider)
);

create table episodes (
  id             uuid primary key default gen_random_uuid(),
  title_id       uuid not null references titles (id) on delete cascade,
  season_number  int not null check (season_number >= 0),   -- 0 = specials
  number         int not null check (number >= 1),
  name           text,
  airstamp       timestamptz,          -- precise instant when the source knows it
  airdate        date,                 -- calendar date in the source's region
  runtime_minutes int,
  unique (title_id, season_number, number)
);
create index episodes_title_order on episodes (title_id, season_number, number);

create table streaming_services (
  id    text primary key,              -- 'netflix', 'max', ...
  name  text not null
);

-- One row per real-world release milestone. stable_key comes from the source
-- (e.g. 'tvmaze:episode:12345:US') so refreshes update rather than duplicate.
create table release_events (
  id               uuid primary key default gen_random_uuid(),
  stable_key       text not null unique,
  title_id         uuid not null references titles (id) on delete cascade,
  episode_id       uuid references episodes (id) on delete cascade,
  season_number    int,
  kind             release_kind not null,
  country          char(2) not null,
  service_id       text references streaming_services (id),
  granularity        date_precision not null,
  local_date       date,               -- day/month/year granularity (first of month/year)
  instant          timestamptz,        -- only for 'instant' granularity
  status           release_status not null default 'announced',
  source           text not null,      -- 'tvmaze', 'tmdb', 'manual'
  last_checked_at  timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((granularity = 'instant') = (instant is not null)),
  check ((granularity in ('day', 'month', 'year')) = (local_date is not null)),
  check (kind <> 'episode' or episode_id is not null),
  check (kind not in ('subscription') or service_id is not null)
);
create index release_events_calendar on release_events (country, local_date);
create index release_events_instant  on release_events (country, instant);
create index release_events_title    on release_events (title_id);

-- Audit trail of date changes (drives "date changed" notices, prevents duplicates).
create table release_event_changes (
  id                bigint generated always as identity primary key,
  release_event_id  uuid not null references release_events (id) on delete cascade,
  changed_at        timestamptz not null default now(),
  old_value         jsonb not null,
  new_value         jsonb not null
);

-- ───────────────────────────── Personal data ─────────────────────────────
-- Single row per user+title: the state column makes Watching / Watch Later
-- mutually exclusive by construction. History lives elsewhere and survives
-- every state change.
create table user_titles (
  user_id           uuid not null references auth.users (id) on delete cascade,
  title_id          uuid not null references titles (id) on delete cascade,
  state             list_state not null,
  state_changed_at  timestamptz not null default now(),
  primary key (user_id, title_id)
);

create table watch_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  title_id         uuid not null references titles (id) on delete cascade,
  episode_id       uuid references episodes (id) on delete cascade,  -- null = the movie itself
  watched_at       timestamptz not null default now(),
  source           text not null default 'manual' check (source in ('manual', 'bulk', 'import')),
  is_rewatch       boolean not null default false,
  client_event_id  uuid not null,
  deleted_at       timestamptz,                                       -- undo = tombstone
  unique (user_id, client_event_id)
);
create index watch_events_progress on watch_events (user_id, title_id) where deleted_at is null;

create table episode_reactions (
  user_id     uuid not null references auth.users (id) on delete cascade,
  episode_id  uuid not null references episodes (id) on delete cascade,
  reaction    reaction not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, episode_id)
);

-- The user's ordered list per pool. position is authoritative (1 = top);
-- score/theta are derived by the ranking engine and may be recomputed.
create table rankings (
  user_id        uuid not null references auth.users (id) on delete cascade,
  title_id       uuid not null,
  pool           title_kind not null,
  position       int not null check (position >= 1),
  reaction       reaction not null,
  favorite       boolean not null default false,
  score          numeric(3, 1) check (score between 0 and 10),
  theta          double precision,
  provisional    boolean not null default true,
  model_version  text,
  scored_at      timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (user_id, title_id),
  foreign key (title_id, pool) references titles (id, kind) on delete cascade,
  constraint rankings_position_unique unique (user_id, pool, position) deferrable initially deferred
);
create unique index rankings_one_favorite on rankings (user_id, pool) where favorite;

-- Every answered comparison, forever. superseded_at marks history retired by a rerank.
create table comparisons (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  pool             title_kind not null,
  a_title_id       uuid not null references titles (id) on delete cascade,
  b_title_id       uuid not null references titles (id) on delete cascade,
  outcome          comparison_outcome not null,
  session_id       uuid not null,
  client_event_id  uuid not null,
  created_at       timestamptz not null default now(),
  superseded_at    timestamptz,
  check (a_title_id <> b_title_id),
  unique (user_id, client_event_id)
);
create index comparisons_active on comparisons (user_id, pool) where superseded_at is null;

create table release_follows (
  user_id   uuid not null references auth.users (id) on delete cascade,
  title_id  uuid not null references titles (id) on delete cascade,
  kind      release_kind not null check (kind in ('theatrical', 'subscription', 'digital', 'season_drop')),
  created_at timestamptz not null default now(),
  primary key (user_id, title_id, kind)
);

-- "Still watching?" bookkeeping. The prompt itself is computed by a daily job.
create table checkins (
  user_id           uuid not null references auth.users (id) on delete cascade,
  title_id          uuid not null references titles (id) on delete cascade,
  snoozed_until     timestamptz,
  last_prompted_at  timestamptz,
  primary key (user_id, title_id)
);

-- ───────────────────────────── Notifications ─────────────────────────────
create table notification_prefs (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  release_alerts     boolean not null default true,
  daily_digest       boolean not null default false,
  digest_local_time  time not null default '09:00',
  checkin_prompts    boolean not null default true
);

create table devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  apns_token    text not null unique,
  environment   text not null check (environment in ('sandbox', 'production')),
  app_version   text,
  last_seen_at  timestamptz not null default now()
);

-- Written only by the scheduler. dedupe_key = user + event + kind (NOT the date),
-- so a rescheduled release never double-alerts.
create table notification_jobs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  release_event_id  uuid references release_events (id) on delete cascade,
  kind              text not null check (kind in ('release', 'date_changed', 'digest', 'checkin')),
  dedupe_key        text not null unique,
  scheduled_for     timestamptz not null,
  status            text not null default 'pending' check (status in ('pending', 'sent', 'cancelled', 'failed')),
  attempts          int not null default 0,
  last_error        text,
  sent_at           timestamptz
);
create index notification_jobs_due on notification_jobs (scheduled_for) where status = 'pending';

-- ───────────────────────────── Social ─────────────────────────────
-- Follow requests need approval; an accepted follow is what "friends" means here.
create table follows (
  follower_id  uuid not null references auth.users (id) on delete cascade,
  followee_id  uuid not null references auth.users (id) on delete cascade,
  status       follow_status not null default 'pending',
  created_at   timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create table blocks (
  blocker_id  uuid not null references auth.users (id) on delete cascade,
  blocked_id  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table activity (
  id               uuid primary key default gen_random_uuid(),
  actor_id         uuid not null references auth.users (id) on delete cascade,
  verb             text not null check (verb in ('ranked', 'started', 'saved', 'finished', 'reacted_episode')),
  title_id         uuid not null references titles (id) on delete cascade,
  episode_id       uuid references episodes (id) on delete cascade,
  score            numeric(3, 1),
  reaction         reaction,
  note             text check (char_length(note) <= 280),
  visibility       visibility not null default 'friends',
  client_event_id  uuid not null,
  created_at       timestamptz not null default now(),
  unique (actor_id, client_event_id)
);
create index activity_feed on activity (actor_id, created_at desc);

create table activity_likes (
  user_id      uuid not null references auth.users (id) on delete cascade,
  activity_id  uuid not null references activity (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, activity_id)
);

create table reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references auth.users (id) on delete cascade,
  target_kind  text not null check (target_kind in ('activity', 'profile')),
  target_id    uuid not null,
  reason       text not null check (char_length(reason) between 1 and 500),
  status       text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at   timestamptz not null default now()
);

-- ───────────────────────────── Helpers ─────────────────────────────
-- These helpers are SECURITY DEFINER (they read rows RLS would hide from the
-- caller), so each one is bound to auth.uid() and never takes a "viewer"
-- argument; otherwise any user could probe other people's follows or progress.

-- True when the signed-in user and `other` have blocked each other (either way).
create function is_blocked(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks b
                 where (b.blocker_id = auth.uid() and b.blocked_id = other)
                    or (b.blocker_id = other and b.blocked_id = auth.uid()));
$$;

-- True when the signed-in user may see `owner`'s friends-only content.
create function can_see(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() = owner or (
    exists (select 1 from follows f
            where f.follower_id = auth.uid() and f.followee_id = owner and f.status = 'accepted')
    and not is_blocked(owner)
    and coalesce((select s.feed_visibility from user_settings s where s.user_id = owner), 'friends') = 'friends'
  );
$$;

-- Furthest episode the signed-in user has watched for a show (spoiler masking).
create function watched_through(show uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(max(e.season_number * 10000 + e.number), -1)
  from watch_events w join episodes e on e.id = w.episode_id
  where w.user_id = auth.uid() and w.title_id = show and w.deleted_at is null;
$$;

-- ───────────────────────────── Row-level security ─────────────────────────────
alter table profiles              enable row level security;
alter table user_settings         enable row level security;
alter table titles                enable row level security;
alter table title_external_ids    enable row level security;
alter table episodes              enable row level security;
alter table streaming_services    enable row level security;
alter table release_events        enable row level security;
alter table release_event_changes enable row level security;
alter table user_titles           enable row level security;
alter table watch_events          enable row level security;
alter table episode_reactions     enable row level security;
alter table rankings              enable row level security;
alter table comparisons           enable row level security;
alter table release_follows       enable row level security;
alter table checkins              enable row level security;
alter table notification_prefs    enable row level security;
alter table devices               enable row level security;
alter table notification_jobs     enable row level security;
alter table follows               enable row level security;
alter table blocks                enable row level security;
alter table activity              enable row level security;
alter table activity_likes        enable row level security;
alter table reports               enable row level security;

-- Catalog: read-only for signed-in users. No write policies => only service_role writes.
create policy catalog_read on titles                for select to authenticated using (true);
create policy catalog_read on title_external_ids    for select to authenticated using (true);
create policy catalog_read on episodes              for select to authenticated using (true);
create policy catalog_read on streaming_services    for select to authenticated using (true);
create policy catalog_read on release_events        for select to authenticated using (true);
create policy catalog_read on release_event_changes for select to authenticated using (true);

-- Profiles: anyone signed in can find people, except across a block.
create policy profiles_read on profiles for select to authenticated using (
  not is_blocked(id)
);
create policy profiles_write on profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Owner-only tables.
create policy own on user_settings      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on user_titles        for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on watch_events       for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on episode_reactions  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on rankings           for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on comparisons        for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on release_follows    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on checkins           for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on notification_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on devices            for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on blocks             for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy own_read on notification_jobs for select to authenticated using (user_id = auth.uid());

-- Follows: request as yourself (pending only); the followee accepts; either side removes.
create policy follows_read   on follows for select to authenticated using (auth.uid() in (follower_id, followee_id));
create policy follows_insert on follows for insert to authenticated with check (follower_id = auth.uid() and status = 'pending');
create policy follows_accept on follows for update to authenticated using (followee_id = auth.uid()) with check (followee_id = auth.uid());
create policy follows_delete on follows for delete to authenticated using (auth.uid() in (follower_id, followee_id));

-- Activity: friends-only content goes through can_see(); private stays private.
create policy activity_read on activity for select to authenticated using (
  actor_id = auth.uid() or (visibility = 'friends' and can_see(actor_id))
);
create policy activity_write on activity for all to authenticated
  using (actor_id = auth.uid()) with check (actor_id = auth.uid());

create policy likes_read on activity_likes for select to authenticated using (
  exists (select 1 from activity a where a.id = activity_id)   -- inherits activity_read
);
create policy likes_write on activity_likes for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from activity a where a.id = activity_id)
);
create policy likes_delete on activity_likes for delete to authenticated using (user_id = auth.uid());

create policy reports_insert on reports for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_read   on reports for select to authenticated using (reporter_id = auth.uid());

-- ───────────────────────────── API functions (RPC) ─────────────────────────────
-- Set list state. Pausing = 'watch_later'; stopping = 'stopped'. History untouched.
create function set_list_state(p_title uuid, p_state list_state) returns void
language sql security invoker as $$
  insert into user_titles (user_id, title_id, state)
  values (auth.uid(), p_title, p_state)
  on conflict (user_id, title_id)
  do update set state = excluded.state, state_changed_at = now()
  where user_titles.state is distinct from excluded.state;
$$;

-- Save a finished comparison session atomically: place the title at p_slot
-- (0 = top) in its pool, store every answer, retire comparisons from any
-- previous ranking of the same title. Safe to retry with the same p_client_event.
create function record_ranking(
  p_title uuid, p_reaction reaction, p_slot int, p_comparisons jsonb,
  p_session uuid, p_client_event uuid
) returns void
language plpgsql security invoker as $$
declare
  v_uid  uuid := auth.uid();
  v_pool title_kind;
  v_old  int;
  v_n    int;
  c      jsonb;
  i      int := 0;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  -- Idempotency: the session's comparisons carry client ids derived from p_client_event.
  if exists (select 1 from comparisons where user_id = v_uid and session_id = p_session) then
    return;
  end if;
  select kind into v_pool from titles where id = p_title;
  if v_pool is null then raise exception 'unknown title'; end if;

  -- Remove the previous placement (rerank) and close the gap.
  select position into v_old from rankings where user_id = v_uid and title_id = p_title;
  if v_old is not null then
    delete from rankings where user_id = v_uid and title_id = p_title;
    update rankings set position = position - 1
      where user_id = v_uid and pool = v_pool and position > v_old;
    update comparisons set superseded_at = now()
      where user_id = v_uid and superseded_at is null
        and p_title in (a_title_id, b_title_id);
  end if;

  select count(*) into v_n from rankings where user_id = v_uid and pool = v_pool;
  p_slot := greatest(0, least(p_slot, v_n));
  update rankings set position = position + 1
    where user_id = v_uid and pool = v_pool and position > p_slot;
  insert into rankings (user_id, title_id, pool, position, reaction)
  values (v_uid, p_title, v_pool, p_slot + 1, p_reaction);

  for c in select * from jsonb_array_elements(coalesce(p_comparisons, '[]'::jsonb)) loop
    i := i + 1;
    if (select kind from titles where id = (c ->> 'other')::uuid) is distinct from v_pool then
      raise exception 'comparison % is not in the % pool', i, v_pool;
    end if;
    insert into comparisons (user_id, pool, a_title_id, b_title_id, outcome, session_id, client_event_id)
    values (v_uid, v_pool, p_title, (c ->> 'other')::uuid, (c ->> 'outcome')::comparison_outcome,
            p_session, md5(p_client_event::text || ':' || i)::uuid);
  end loop;
  -- Scores are recomputed by the ranking engine after this commits.
end;
$$;

-- Mark (or unmark) the all-time favorite in a pool. Clears any previous one.
create function set_favorite(p_title uuid, p_on boolean) returns void
language plpgsql security invoker as $$
declare v_pool title_kind;
begin
  select pool into v_pool from rankings where user_id = auth.uid() and title_id = p_title;
  if v_pool is null then raise exception 'title is not ranked'; end if;
  update rankings set favorite = false where user_id = auth.uid() and pool = v_pool and favorite;
  if p_on then
    update rankings set favorite = true where user_id = auth.uid() and title_id = p_title;
  end if;
end;
$$;

-- Friends feed with spoiler masking: episode details are hidden unless the
-- viewer has watched at least that far (or has spoiler_guard off).
create function friends_feed(p_before timestamptz default now(), p_limit int default 30)
returns table (
  id uuid, actor_id uuid, handle text, display_name text, verb text,
  title_id uuid, episode_id uuid, season_number int, episode_number int,
  score numeric, reaction reaction, note text, created_at timestamptz,
  likes bigint, liked_by_me boolean, masked boolean
)
language sql stable security invoker as $$
  with me as (
    select auth.uid() as uid,
           coalesce((select spoiler_guard from user_settings where user_id = auth.uid()), true) as guard
  )
  select a.id, a.actor_id, p.handle, p.display_name, a.verb, a.title_id,
         case when m.hide then null else a.episode_id end,
         case when m.hide then null else e.season_number end,
         case when m.hide then null else e.number end,
         a.score,
         case when m.hide then null else a.reaction end,
         case when m.hide then null else a.note end,
         a.created_at,
         (select count(*) from activity_likes l where l.activity_id = a.id),
         exists (select 1 from activity_likes l where l.activity_id = a.id and l.user_id = (select uid from me)),
         m.hide
  from activity a                                   -- RLS limits rows to what I may see
  join profiles p on p.id = a.actor_id
  left join episodes e on e.id = a.episode_id
  cross join lateral (
    select (a.episode_id is not null and a.actor_id <> (select uid from me) and (select guard from me)
            and watched_through(a.title_id) < e.season_number * 10000 + e.number) as hide
  ) m
  where a.actor_id <> (select uid from me) and a.created_at < p_before
  order by a.created_at desc
  limit least(p_limit, 100);
$$;

-- Calendar for a date range in the user's own time zone. Shows in Watching
-- contribute their episodes automatically; anything else appears only through
-- an explicit release follow. Paused (watch_later) shows drop out. TBA and
-- month/year-granularity items are listed separately by the client.
create function my_calendar(p_from date, p_to date)
returns table (
  release_event_id uuid, title_id uuid, kind release_kind, episode_id uuid,
  service_id text, granularity date_precision, local_day date, instant timestamptz,
  status release_status, watched boolean
)
language sql stable security invoker as $$
  with me as (
    select auth.uid() as uid,
           coalesce(s.country, 'US') as country,
           coalesce(s.time_zone, 'America/Chicago') as tz
    from (select 1) one left join user_settings s on s.user_id = auth.uid()
  ), ev as (
    select r.*, case when r.granularity = 'instant' then (r.instant at time zone me.tz)::date
                     else r.local_date end as day, me.uid
    from release_events r cross join me
    where r.country = me.country
      and r.status not in ('removed', 'cancelled')
      and r.granularity in ('instant', 'day')
      and (
        (r.kind in ('episode', 'season_drop') and exists (
           select 1 from user_titles u
           where u.user_id = me.uid and u.title_id = r.title_id and u.state = 'watching'))
        or exists (
           select 1 from release_follows f
           where f.user_id = me.uid and f.title_id = r.title_id and f.kind = r.kind)
      )
  )
  select ev.id, ev.title_id, ev.kind, ev.episode_id, ev.service_id, ev.granularity, ev.day, ev.instant, ev.status,
         exists (select 1 from watch_events w
                 where w.user_id = ev.uid and w.episode_id = ev.episode_id and w.deleted_at is null)
  from ev
  where ev.day between p_from and p_to
  order by ev.day, ev.instant nulls last;
$$;

-- Grants (Supabase exposes tables to these roles; RLS does the filtering).
grant usage on schema public to authenticated;
grant select on titles, title_external_ids, episodes, streaming_services, release_events, release_event_changes to authenticated;
grant select, insert, update, delete on profiles, user_settings, user_titles, watch_events, episode_reactions,
  rankings, comparisons, release_follows, checkins, notification_prefs, devices, follows, blocks,
  activity, activity_likes to authenticated;
grant select, insert on reports to authenticated;
grant select on notification_jobs to authenticated;
revoke all on function can_see(uuid), is_blocked(uuid), watched_through(uuid) from public;
grant execute on function can_see(uuid), is_blocked(uuid), watched_through(uuid) to authenticated;
grant execute on function set_list_state(uuid, list_state), record_ranking(uuid, reaction, int, jsonb, uuid, uuid),
  set_favorite(uuid, boolean), friends_feed(timestamptz, int), my_calendar(date, date) to authenticated;
