// Browser regression checks for the prototype bugs found in the audit.
// Usage: node prototype/tests/regression.mjs <dir-with-index.html> [--baseline <original-dir>]
// Requires the `playwright` package and a Chromium (set CHROMIUM_PATH if not bundled).
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dir = path.resolve(args[0] ?? "prototype");
const baseIdx = args.indexOf("--baseline");
const baseline = baseIdx > -1 ? path.resolve(args[baseIdx + 1]) : null;

function serve(root, port) {
  return http
    .createServer((req, res) => {
      let p = path.join(root, decodeURIComponent(req.url.split("?")[0]));
      if (p.endsWith("/")) p += "index.html";
      fs.readFile(p, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.end(data);
      });
    })
    .listen(port);
}

const servers = [serve(dir, 8811)];
if (baseline) servers.push(serve(baseline, 8812));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--headless=new"],
});
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

async function page(url = "http://127.0.0.1:8811/", tz = "America/Chicago") {
  const ctx = await browser.newContext({ timezoneId: tz, viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on("pageerror", (e) => errors.push(e.message));
  await pg.goto(url);
  return { ctx, pg, errors };
}

// 1. Daylight saving: November episodes must exist for Central-time users.
{
  const { ctx, pg } = await page();
  const nov = await pg.evaluate(() => events(2026, 10).map((e) => `${e.id}:${e.d}`));
  const want = ["bear:4", "white:8", "bear:11", "white:15", "bear:18"];
  check("DST: November episodes appear in America/Chicago", want.every((w) => nov.includes(w)), nov.join(","));
  await ctx.close();
}
// 2. Skipped episode rating must not render as a red "undefined" bar after reload.
{
  const { ctx, pg } = await page();
  await pg.evaluate(() => { state.reactions.bear[5] = 4; state.progress.bear = 6; persist(); });
  await pg.reload();
  const label = await pg.evaluate(() => { detail("bear"); return document.querySelectorAll(".chart button")[4].getAttribute("aria-label"); });
  check("Skipped episode rating shows as unrated after reload", label === "Episode 5: unrated", label);
  await ctx.close();
}
// 3. Partial / corrupted stored state must not blank the app.
{
  const { ctx, pg, errors } = await page();
  await pg.evaluate(() => localStorage.setItem("frame-v1", '{"watching":["bear","nope"],"later":["bear","silo"],"ranks":[{"id":"x"}]}'));
  await pg.reload();
  const r = await pg.evaluate(() => ({ len: document.querySelector("#content").innerHTML.length, w: state.watching, l: state.later }));
  check("Partial state renders without errors", errors.length === 0 && r.len > 0, errors.join("; "));
  check("Watching / Watch Later stay mutually exclusive", !r.l.includes("bear") && !r.w.includes("nope"), JSON.stringify(r));
  await ctx.close();
}
// 4. "Don't remember this one" must not re-open an already-decided comparison.
{
  const { ctx, pg } = await page();
  const r = await pg.evaluate(() => {
    state.ranks = ["arrival", "interstellar", "knives", "tenet", "past"].map((id, i) => ({ id, score: (i + 1) * 1.5, reaction: "Good" }));
    beginCompare("dune", "Good");
    vote(false); // dune loses to knives (4.5)
    skipCompare(); // skip interstellar
    const asked = [];
    while (compareState.lo < compareState.hi) { asked.push(compareState.pool[compareState.mid].id); vote(true); }
    return { asked, score: state.ranks.find((x) => x.id === "dune").score };
  });
  check("Skip keeps placement below a title the user preferred", r.score < 4.5 && !r.asked.includes("knives"), JSON.stringify(r));
  await ctx.close();
}
// 5. All-time favorite (10.0) only offered to the top-placed Great title.
{
  const { ctx, pg } = await page();
  const r = await pg.evaluate(() => {
    const run = (id, reaction) => { beginCompare(id, reaction); while (compareState.lo < compareState.hi) vote(true); return /all-time favorite/.test(document.querySelector("#modal").innerHTML); };
    const bad = run("dune", "Bad");
    const great = run("past", "Great");
    favorite("past");
    state.ranks.find((x) => x.id === "interstellar").score = 10;
    favorite("past");
    const tens = state.ranks.filter((x) => x.score === 10 && item(x.id).type === "Movie").length;
    return { bad, great, tens };
  });
  check("10.0 not offered to a Bad reaction", r.bad === false, JSON.stringify(r));
  check("10.0 offered to top-placed Great", r.great === true, JSON.stringify(r));
  check("At most one 10.0 per pool", r.tens === 1, JSON.stringify(r));
  await ctx.close();
}
// 6. Discover tab opens (original recursed forever and stayed on Calendar).
{
  const { ctx, pg, errors } = await page();
  await pg.click('#nav button[aria-label="Discover"]');
  const text = await pg.evaluate(() => document.querySelector("#content").innerText);
  check("Discover tab opens without errors", errors.length === 0 && /Search|one more episode/i.test(text), errors.join("; "));
  await ctx.close();
}
// 7. UI unchanged: every tab renders pixel-identically to the baseline.
if (baseline) {
  // Discover is excluded: it never rendered in the original.
  for (const tab of ["Calendar", "My Watchlist", "Friends", "Profile"]) {
    const shots = [];
    for (const url of ["http://127.0.0.1:8811/", "http://127.0.0.1:8812/"]) {
      const { ctx, pg } = await page(url);
      await pg.evaluate((t) => go(t), tab);
      await pg.waitForTimeout(150);
      shots.push(await pg.screenshot({ fullPage: true }));
      await ctx.close();
    }
    check(`UI identical to baseline: ${tab}`, shots[0].equals(shots[1]));
  }
}
await browser.close();
servers.forEach((s) => s.close());
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : "  -> " + r.detail}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
