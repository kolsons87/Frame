const catalog = [
  {
    id: "severance",
    title: "Severance",
    type: "Show",
    service: "Apple TV+",
    genre: "Mind-bending · Mystery",
    color: "#315752",
    art: "◉",
    reason: "Because you love slow-burn mysteries",
    episodes: 9,
  },
  {
    id: "bear",
    title: "The Bear",
    type: "Show",
    service: "Hulu",
    genre: "Drama · 30 min",
    color: "#3b5f83",
    art: "✳",
    reason: "Character-driven stories that stay with you",
    episodes: 10,
  },
  {
    id: "white",
    title: "The White Lotus",
    type: "Show",
    service: "HBO Max",
    genre: "Dark comedy · Drama",
    color: "#8c9657",
    art: "✿",
    reason: "A favorite in your friend circle",
    episodes: 8,
  },
  {
    id: "dune",
    title: "Dune: Part Two",
    type: "Movie",
    service: "HBO Max",
    genre: "Sci-fi · 166 min",
    color: "#ac693d",
    art: "◒",
    reason: "Because you ranked Arrival highly",
  },
  {
    id: "arrival",
    title: "Arrival",
    type: "Movie",
    service: "Sample provider",
    genre: "Sci-fi · 116 min",
    color: "#526565",
    art: "◖",
    reason: "Thoughtful science fiction",
  },
  {
    id: "interstellar",
    title: "Interstellar",
    type: "Movie",
    service: "Sample provider",
    genre: "Sci-fi · 169 min",
    color: "#53616f",
    art: "◎",
    reason: "Big ideas, bigger emotions",
  },
  {
    id: "past",
    title: "Past Lives",
    type: "Movie",
    service: "Sample provider",
    genre: "Romance · 106 min",
    color: "#7b8065",
    art: "↗",
    reason: "A quieter pick for your next movie night",
  },
  {
    id: "silo",
    title: "Silo",
    type: "Show",
    service: "Apple TV+",
    genre: "Sci-fi · Mystery",
    color: "#746d4e",
    art: "◉",
    reason: "Because you ranked Severance highly",
    episodes: 10,
  },
  {
    id: "odyssey",
    title: "The Odyssey",
    type: "Movie",
    service: "Theaters",
    genre: "Adventure · Upcoming example",
    color: "#355b70",
    art: "≈",
    reason: "A big-screen adventure to keep on your radar",
  },
  {
    id: "dark",
    title: "Dark",
    type: "Show",
    service: "Netflix",
    genre: "Mystery · Sci-fi",
    color: "#8b7950",
    art: "△",
    reason: "Because you love puzzle-box stories",
    episodes: 10,
  },
  {
    id: "knives",
    title: "Knives Out",
    type: "Movie",
    service: "Sample provider",
    genre: "Mystery · 130 min",
    color: "#9b704e",
    art: "✦",
    reason: "A mystery with a lighter touch",
  },
  {
    id: "tenet",
    title: "Tenet",
    type: "Movie",
    service: "Sample provider",
    genre: "Sci-fi · 150 min",
    color: "#5d7378",
    art: "↔",
    reason: "Twisty, ambitious science fiction",
  },
];
const initial = {
  watching: ["severance", "bear", "white"],
  later: ["silo", "odyssey", "past"],
  progress: { severance: 6, bear: 4, white: 2 },
  reactions: { severance: [4, 3, 3, 2, 4, 4], bear: [3, 4, 2, 3] },
  ranks: [
    { id: "interstellar", score: 9.7, reaction: "Great" },
    { id: "arrival", score: 9.2, reaction: "Great" },
    { id: "knives", score: 8.1, reaction: "Good" },
    { id: "tenet", score: 5.7, reaction: "Fine" },
    { id: "severance", score: 9.3, reaction: "Great" },
    { id: "dark", score: 8.7, reaction: "Great" },
    { id: "bear", score: 8.2, reaction: "Good" },
  ],
  follows: { odyssey: { theater: true, streaming: true } },
  likes: [],
  check: false,
  notifications: true,
};
const STORAGE_KEY = "frame-v1";
const REACTION_NAMES = ["Bad", "Meh", "Fine", "Good", "Great"];
// Validate and repair stored state so a partial, legacy or hand-edited value
// can never blank the app. Unknown IDs and out-of-range values are dropped.
function normalizeState(raw) {
  const base = structuredClone(initial);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const known = new Set(catalog.map((x) => x.id));
  const ids = (v) =>
    Array.isArray(v) ? [...new Set(v.filter((id) => known.has(id)))] : null;
  const s = {};
  s.watching = ids(raw.watching) ?? base.watching;
  // Watching and Watch Later are mutually exclusive; Watching wins.
  s.later = (ids(raw.later) ?? base.later).filter(
    (id) => !s.watching.includes(id),
  );
  s.progress = {};
  for (const [id, n] of Object.entries(raw.progress ?? base.progress)) {
    const x = catalog.find((c) => c.id === id);
    if (x?.episodes && Number.isInteger(n) && n > 0)
      s.progress[id] = Math.min(n, x.episodes);
  }
  s.reactions = {};
  for (const [id, arr] of Object.entries(raw.reactions ?? base.reactions)) {
    if (!known.has(id) || !Array.isArray(arr)) continue;
    // JSON turns unrated gaps into null; keep them as explicit nulls.
    s.reactions[id] = arr.map((v) =>
      Number.isInteger(v) && v >= 0 && v <= 4 ? v : null,
    );
  }
  const seen = new Set();
  s.ranks = (Array.isArray(raw.ranks) ? raw.ranks : base.ranks).filter(
    (r) =>
      r &&
      known.has(r.id) &&
      !seen.has(r.id) &&
      seen.add(r.id) &&
      typeof r.score === "number" &&
      r.score >= 0 &&
      r.score <= 10 &&
      REACTION_NAMES.includes(r.reaction),
  );
  s.follows = {};
  for (const [id, f] of Object.entries(raw.follows ?? base.follows)) {
    if (!known.has(id) || !f || typeof f !== "object") continue;
    s.follows[id] = {};
    for (const k of ["theater", "streaming", "rental"])
      if (typeof f[k] === "boolean") s.follows[id][k] = f[k];
  }
  s.likes = Array.isArray(raw.likes)
    ? raw.likes.filter((i) => Number.isInteger(i))
    : [];
  s.check = typeof raw.check === "boolean" ? raw.check : base.check;
  s.notifications =
    typeof raw.notifications === "boolean"
      ? raw.notifications
      : base.notifications;
  return s;
}
let state;
try {
  state = normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
} catch {
  state = structuredClone(initial);
}
let page = "Calendar",
  view = "Month",
  month = 9,
  year = 2026,
  filter = "All releases",
  discoverFilter = "For you",
  rankType = "Movie",
  query = "",
  episode = 0;
let compareState;
const $ = (s) => document.querySelector(s),
  item = (id) => catalog.find((x) => x.id === id),
  persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked (e.g. private browsing): keep working in memory.
      toast("Couldn't save changes in this browser");
    }
  };
const reactions = ["Bad", "Meh", "Fine", "Good", "Great"];
const tone = (r) =>
  r === "Bad" ? "red" : ["Fine", "Meh"].includes(r) ? "yellow" : "green";
const art = (x, size = "") =>
  `<div class="poster ${size}" style="background-color:${x.color}"><span class="art">${x.art}</span><strong>${x.title}</strong></div>`;
const navs = [
  ["Calendar", "▦"],
  ["Watching", "▷"],
  ["Watch Later", "⌑"],
  ["Discover", "✧"],
  ["Rankings", "≋"],
  ["Friends", "◌"],
];
function go(p) {
  page = p;
  query = "";
  if ($("#search")) $("#search").value = "";
  render();
}
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").style.display = "block";
  clearTimeout(window.tt);
  window.tt = setTimeout(() => ($("#toast").style.display = "none"), 3000);
}
function show(title, body) {
  $("#modal").innerHTML =
    `<div class="modalhead"><b>${title}</b><button class="plain" aria-label="Close dialog" onclick="document.querySelector('#modal').close()">✕</button></div><div class="modalbody">${body}</div>`;
  if (!$("#modal").open) $("#modal").showModal();
}
function head(title, desc, extra = "") {
  return `<div class="heading"><div><div class="eyebrow">Your watching life</div><h1>${title}</h1><p>${desc}</p></div>${extra}</div>`;
}
function events(y, m) {
  let rows = [];
  for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) {
    let w = new Date(y, m, d).getDay();
    if (w === 5 && state.watching.includes("severance"))
      rows.push({
        d,
        id: "severance",
        kind: "episode",
        text: `S1 · E${Math.ceil(d / 7) + 4}`,
      });
    if (w === 3 && state.watching.includes("bear"))
      rows.push({
        d,
        id: "bear",
        kind: "episode",
        text: `S1 · E${Math.ceil(d / 7) + 3}`,
      });
    if (w === 0 && state.watching.includes("white"))
      rows.push({
        d,
        id: "white",
        kind: "episode",
        text: `S1 · E${Math.ceil(d / 7) + 1}`,
      });
  }
  if (state.follows.odyssey?.theater && m === 9 && y === 2026)
    rows.push({
      d: 23,
      id: "odyssey",
      kind: "theater",
      text: "Theater premiere",
    });
  if (state.follows.odyssey?.streaming && m === 11 && y === 2026)
    rows.push({
      d: 18,
      id: "odyssey",
      kind: "streaming",
      text: "Subscription premiere",
    });
  return rows
    .filter(
      (e) =>
        filter === "All releases" ||
        (filter === "Episodes" && e.kind === "episode") ||
        (filter === "Theaters" && e.kind === "theater") ||
        (filter === "Streaming" && e.kind === "streaming"),
    )
    .sort((a, b) => a.d - b.d);
}
function changeMonth(n) {
  month += n;
  if (month > 11) {
    month = 0;
    year++;
  }
  if (month < 0) {
    month = 11;
    year--;
  }
  render();
}
function calendar() {
  let es = events(year, month),
    start = (new Date(year, month, 1).getDay() + 6) % 7,
    days = new Date(year, month + 1, 0).getDate();
  let grid =
    '<div class="calendar">' +
    ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
      .map((d) => `<div class="weekday">${d}</div>`)
      .join("");
  for (let n = 0; n < Math.ceil((days + start) / 7) * 7; n++) {
    let d = n - start + 1;
    grid += `<div class="day ${d === 22 && month === 9 && year === 2026 ? "today" : ""}">${
      d > 0 && d <= days
        ? `<span class="daynum">${d}</span>${es
            .filter((e) => e.d === d)
            .map(
              (e) =>
                `<button class="event ${e.kind}" onclick="detail('${e.id}')"><b>${item(e.id).title}</b>${e.text}</button>`,
            )
            .join("")}`
        : ""
    }</div>`;
  }
  grid += "</div>";
  let agenda = "";
  for (let offset = 0; offset < 3; offset++) {
    let date = new Date(year, month + offset, 1),
      m = date.getMonth(),
      y = date.getFullYear();
    let ev = events(y, m);
    agenda += `<div style="padding:18px 20px;background:#f0eee7"><b>${date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</b></div>`;
    for (let d of [...new Set(ev.map((e) => e.d))])
      agenda += `<div class="agendaday"><div class="agendadate"><small>${new Date(y, m, d).toLocaleDateString("en-US", { weekday: "short" })}</small><strong>${d}</strong></div><div class="agendaevents">${ev
        .filter((e) => e.d === d)
        .map(
          (e) =>
            `<button onclick="detail('${e.id}')"><span><b>${item(e.id).title}</b><br><small>${e.text}</small></span><small>${e.kind === "episode" ? item(e.id).service : e.kind}</small></button>`,
        )
        .join("")}</div></div>`;
    if (!ev.length)
      agenda += '<div class="empty">No followed releases in this month.</div>';
  }
  return (
    head(
      "Make room for the good stuff.",
      "Your shows. Your movie nights. All in one place.",
      `<button onclick="settings()">♧ &nbsp; Reminders</button>`,
    ) +
    `<div class="toolbar"><div class="row"><h2>${new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2><button aria-label="Previous month" onclick="changeMonth(-1)">‹</button><button aria-label="Next month" onclick="changeMonth(1)">›</button></div><div class="tabs">${["Month", "Agenda"].map((v) => `<button class="${view === v ? "active" : ""}" onclick="view='${v}';render()">${v}</button>`).join("")}</div></div><div class="chips" style="margin-bottom:20px">${["All releases", "Episodes", "Theaters", "Streaming"].map((f) => `<button class="${filter === f ? "active" : ""}" onclick="filter='${f}';render()">${f}</button>`).join("")}</div><div class="layout"><div><div class="panel">${view === "Month" ? grid : `<div class="agenda">${agenda}</div>`}</div><div class="legend"><span><i class="dot"></i>New episode</span><span><i class="dot" style="background:#dbac83"></i>In theaters</span><span><i class="dot" style="background:#91b79f"></i>On streaming</span></div><p class="footer">Illustrative dates and provider labels only — not a real release schedule. Agenda scrolls across three months; arrows move the window.</p></div><aside class="rail"><div class="panel rightbox"><h2>Your next episodes</h2>${state.watching.map((id) => `<div class="mini">${art(item(id), "tiny")}<div><b>${item(id).title}</b><br><small>Up next · S1 E${(state.progress[id] || 0) + 1}</small><br><button class="plain" style="font-size:11px;color:#6f5c9a" onclick="detail('${id}')">View progress →</button></div></div>`).join("")}</div><div class="note"><div class="eyebrow">On your radar</div><h3 style="margin-top:8px">The theater. Then your couch.</h3><p>Follow both releases of a movie. We'll keep a place for its streaming debut.</p><button class="soft" onclick="detail('odyssey')">Manage movie alerts →</button></div><div style="padding:22px 5px"><h3>Better with friends.</h3><p class="muted">See what made their top ten.</p><button onclick="go('Friends')">Explore your feed →</button></div></aside></div>`
  );
}
function save(id) {
  if (state.later.includes(id)) {
    state.later = state.later.filter((x) => x !== id);
    toast("Removed from Watch Later");
  } else {
    state.later.push(id);
    toast("Saved to Watch Later");
  }
  persist();
  render();
}
function start(id) {
  state.later = state.later.filter((x) => x !== id);
  if (!state.watching.includes(id)) state.watching.push(id);
  persist();
  $("#modal").close();
  go("Watching");
  toast("Added to Watching");
}
function cards(list) {
  return `<div class="cards">${list.map((x) => `<article class="card"><div role="button" tabindex="0" aria-label="View ${x.title}" onclick="detail('${x.id}')" onkeydown="if(event.key==='Enter')detail('${x.id}')">${art(x)}</div><h3>${x.title}</h3><small>${x.type} · ${x.genre}</small><p>${x.reason}</p><button class="save" onclick="save('${x.id}')">${state.later.includes(x.id) ? "✓ Saved" : "＋ Watch Later"}</button></article>`).join("")}</div>`;
}
function watch() {
  return (
    head(
      "In your rotation.",
      "Keep your place. Find your next favorite episode.",
    ) +
    (!state.check && state.watching.includes("white")
      ? `<div class="note" style="margin:0 0 24px;display:flex;justify-content:space-between;align-items:center;gap:15px"><div><b>Still watching The White Lotus?</b><br><small>You have a few unwatched episodes. Keep it in your calendar?</small></div><button class="soft" onclick="checkin()">Check in →</button></div>`
      : "") +
    `<div class="panel">${
      state.watching
        .map((id) => {
          let x = item(id),
            p = state.progress[id] || 0;
          return `<div class="watchrow">${art(x, "medium")}<div class="watchinfo"><span class="pill">${p >= x.episodes ? "Caught up" : "Currently watching"}</span><h2>${x.title}</h2><small>${x.service} · Season 1</small><div class="progress"><span style="width:${(p / x.episodes) * 100}%"></span></div><small>${p} of ${x.episodes} episodes watched</small><div class="buttonrow"><button class="primary" onclick="watched('${id}')" ${p >= x.episodes ? "disabled" : ""}>${p >= x.episodes ? "Caught up" : "✓ Watched E" + (p + 1)}</button><button onclick="detail('${id}')">Episode chart</button><button class="plain" onclick="pause('${id}')">Pause</button></div></div></div>`;
        })
        .join("") ||
      '<div class="empty">Your next great show is waiting in Discover.</div>'
    }</div>`
  );
}
function pause(id) {
  state.watching = state.watching.filter((x) => x !== id);
  if (!state.later.includes(id)) state.later.push(id);
  if (id === "white") state.check = true;
  persist();
  $("#modal").close();
  render();
  toast("Moved to Watch Later · calendar paused");
}
function watched(id) {
  let x = item(id);
  state.progress[id] = Math.min((state.progress[id] || 0) + 1, x.episodes);
  persist();
  render();
  episode = state.progress[id] - 1;
  rateEpisode(id);
}
function checkin() {
  show(
    "Still watching?",
    `<h1>The White Lotus</h1><p class="muted">A few episodes have gone unwatched. What would you like to do?</p><div class="buttonrow"><button class="primary" onclick="state.check=true;persist();document.querySelector('#modal').close();render()">Still watching</button><button onclick="caughtup()">I'm caught up</button><button onclick="pause('white')">Pause for now</button><button onclick="stopShow()">Stopped watching</button></div><p class="footer">Pausing keeps your episode history and ratings, but removes upcoming calendar entries.</p>`,
  );
}
function caughtup() {
  show(
    "Confirm watched episodes",
    `<p>Mark all 8 sample Season 1 episodes of The White Lotus watched?</p><button class="primary" onclick="state.progress.white=8;state.check=true;persist();document.querySelector('#modal').close();render()">Mark all 8 watched</button>`,
  );
}
function stopShow() {
  state.watching = state.watching.filter((x) => x !== "white");
  state.check = true;
  persist();
  $("#modal").close();
  render();
  toast("Stopped tracking · history preserved");
}
function discover() {
  let list = catalog.filter((x) => !state.watching.includes(x.id));
  if (discoverFilter === "Movies")
    list = list.filter((x) => x.type === "Movie");
  if (discoverFilter === "Shows") list = list.filter((x) => x.type === "Show");
  if (discoverFilter === "Coming soon")
    list = list.filter((x) => x.id === "odyssey");
  if (query)
    list = catalog.filter((x) =>
      x.title.toLowerCase().includes(query.toLowerCase()),
    );
  return (
    head(
      query ? "Search results" : "Your next “one more episode.”",
      query
        ? "Search the sample catalog."
        : "Find something worth making time for.",
    ) +
    (!query
      ? `<div class="hero"><div><div class="eyebrow">Picked for your taste · Demo</div><h2>There’s more beneath the surface.</h2><p>If you loved the uneasy mysteries of Severance, put Silo on your list.</p><button onclick="detail('silo')">Explore Silo →</button></div><div class="heroart">◎</div></div><div class="toolbar"><div class="chips">${["For you", "Movies", "Shows", "Coming soon"].map((f) => `<button class="${discoverFilter === f ? "active" : ""}" onclick="discoverFilter='${f}';render()">${f}</button>`).join("")}</div><small>Curated examples, not live recommendations</small></div>`
      : "") +
    (list.length
      ? cards(list)
      : '<div class="empty">No sample titles match. Live catalog search comes with the data connection.</div>')
  );
}
function rankings() {
  let rs = state.ranks
    .filter((r) => item(r.id).type === rankType)
    .sort((a, b) => b.score - a.score);
  return (
    head(
      "Your taste, in order.",
      "Built from comparisons. Entirely yours.",
      `<button class="primary" onclick="pickRank()">＋ Rank a title</button>`,
    ) +
    `<div class="toolbar"><div class="tabs">${["Movie", "Show"].map((t) => `<button class="${rankType === t ? "active" : ""}" onclick="rankType='${t}';render()">${t === "Movie" ? "Movies" : "TV shows"}</button>`).join("")}</div><small>0.0–10.0 · ${rs.length} ranked</small></div><div class="panel">${rs.map((r, i) => `<div class="rankrow"><span class="place">${i + 1}</span>${art(item(r.id), "tiny")}<div class="info"><h3>${item(r.id).title}</h3><small>${r.reaction} ${r.provisional ? "· Provisional" : ""}</small></div><span class="score ${tone(r.reaction)}">${r.score.toFixed(1)}</span><button class="plain" onclick="rank('${r.id}')" aria-label="Rerank ${item(r.id).title}">↗</button></div>`).join("")}</div><div class="legend"><span style="color:var(--green)">● Great / Good</span><span style="color:var(--yellow)">● Fine / Meh</span><span style="color:var(--red)">● Bad</span></div><p class="footer">Your reaction sets the color. Comparisons determine placement. This prototype interpolates between sample scores; production calibration is still to be built.</p>`
  );
}
function pickRank() {
  show(
    "What did you watch?",
    `<p class="muted">Pick a sample title to try the comparison flow.</p><div class="buttonrow">${catalog.map((x) => `<button onclick="rank('${x.id}')">${x.title}</button>`).join("")}</div>`,
  );
}
function rank(id) {
  show(
    "How did it feel?",
    `<div class="detailtop">${art(item(id), "medium")}<div><div class="eyebrow">Your first impression</div><h1>${item(id).title}</h1><p class="muted">Pick a reaction. Then compare to find its place.</p></div></div><div class="options">${["Great", "Good", "Fine", "Meh", "Bad"].map((r) => `<button class="${tone(r)}" onclick="beginCompare('${id}','${r}')">${r}</button>`).join("")}</div><small>No fixed score bands. A great movie can earn an 8.2.</small>`,
  );
}
function beginCompare(id, reaction) {
  let pool = state.ranks
    .filter((r) => r.id !== id && item(r.id).type === item(id).type)
    .sort((a, b) => a.score - b.score);
  compareState = { id, reaction, pool, lo: 0, hi: pool.length, steps: 0 };
  let same = pool
    .map((r, i) => (r.reaction === reaction ? i : -1))
    .filter((i) => i >= 0);
  compareState.mid = same.length
    ? same[Math.floor(same.length / 2)]
    : Math.floor(pool.length / 2);
  comparison();
}
function comparison() {
  let c = compareState;
  if (c.lo >= c.hi || !c.pool.length) {
    finishCompare();
    return;
  }
  let other = c.pool[c.mid];
  show(
    "Which did you prefer?",
    `<div class="eyebrow">${item(c.id).type} comparisons · ${c.steps + 1}</div><p class="muted">Go with your gut. We’ll find its place in your ranking.</p><div class="compare"><button onclick="vote(true)">${art(item(c.id))}<b>${item(c.id).title}</b></button><small>OR</small><button onclick="vote(false)">${art(item(other.id))}<b>${item(other.id).title}</b><br><span class="score ${tone(other.reaction)}">${other.score.toFixed(1)}</span></button></div><div class="buttonrow"><button onclick="finishCompare(compareState.pool[compareState.mid].score)">Too close to call</button><button onclick="skipCompare()">Don't remember this one</button></div>`,
  );
}
function vote(win) {
  let c = compareState;
  if (win) c.lo = c.mid + 1;
  else c.hi = c.mid;
  c.steps++;
  c.mid = Math.floor((c.lo + c.hi) / 2);
  comparison();
}
function skipCompare() {
  let c = compareState;
  // mid is always inside [lo, hi), so removing it shrinks the open window by
  // one. Clamping to pool.length instead let an already-decided title back in.
  c.pool.splice(c.mid, 1);
  c.hi--;
  c.mid = Math.floor((c.lo + c.hi) / 2);
  comparison();
}
function finishCompare(tie) {
  let c = compareState;
  let low = c.pool[c.lo - 1]?.score,
    high = c.pool[c.lo]?.score;
  let score =
    tie ??
    (low !== undefined && high !== undefined
      ? (low + high) / 2
      : low !== undefined
        ? Math.min(9.9, low + 0.2)
        : high !== undefined
          ? Math.max(0, high - 0.2)
          : { Great: 8.2, Good: 7, Fine: 5, Meh: 3, Bad: 1 }[c.reaction]);
  score = Math.round(score * 10) / 10;
  state.ranks = state.ranks.filter((r) => r.id !== c.id);
  state.ranks.push({
    id: c.id,
    score,
    reaction: c.reaction,
    provisional: !c.pool.length,
  });
  persist();
  render();
  // 10.0 is only offered to a Great title that won every comparison. (Stored
  // scores can't decide this: inserting above a 9.9 also yields a 9.9 tie.)
  const topOfPool =
    c.reaction === "Great" &&
    tie === undefined &&
    c.pool.length > 0 &&
    c.lo === c.pool.length;
  show(
    "Found its place.",
    `<div style="text-align:center"><div class="eyebrow">Your ${c.reaction.toLowerCase()} ${item(c.id).type.toLowerCase()}</div><h1>${item(c.id).title}</h1><div class="score ${tone(c.reaction)}" style="font-size:72px">${score.toFixed(1)}</div><p class="muted">${c.pool.length ? "Placed using your comparisons." : "Provisional starting score. Add more titles to compare."}</p>${topOfPool ? `<button onclick="favorite('${c.id}')">This is an all-time favorite · 10.0</button>` : ""}<div class="buttonrow" style="justify-content:center"><button class="primary" onclick="document.querySelector('#modal').close();rankType=item('${c.id}').type;go('Rankings')">See my rankings →</button></div></div>`,
  );
}
function favorite(id) {
  // Only one 10.0 per pool: a previous favorite steps down to 9.9.
  for (const r of state.ranks)
    if (r.id !== id && r.score === 10 && item(r.id).type === item(id).type)
      r.score = 9.9;
  state.ranks.find((r) => r.id === id).score = 10;
  persist();
  $("#modal").close();
  go("Rankings");
  toast("Marked as a personal all-time favorite");
}
function detail(id) {
  let x = item(id),
    r = state.ranks.find((r) => r.id === id);
  let body = `<div class="detailtop">${art(x, "medium")}<div><div class="eyebrow">${x.type} · ${x.genre}</div><h1>${x.title}</h1><p class="muted">${x.reason}</p>${r ? `<span class="score ${tone(r.reaction)}">${r.score.toFixed(1)}</span> <small>Your ranking · ${r.reaction}</small>` : ""}</div></div><div class="buttonrow"><button class="primary" onclick="save('${id}');detail('${id}')">${state.later.includes(id) ? "✓ Saved to Watch Later" : "＋ Watch Later"}</button>${x.type === "Show" && !state.watching.includes(id) ? `<button onclick="start('${id}')">Start watching</button>` : ""}<button onclick="rank('${id}')">${r ? "Rerank" : "Rank"} ${x.type.toLowerCase()}</button></div>`;
  if (x.type === "Movie") {
    let f = state.follows[id] || {};
    body += `<div class="sectionhead"><h2>Follow the release</h2></div><label class="check"><input type="checkbox" ${f.theater ? "checked" : ""} onchange="follow('${id}','theater',this.checked)"> Theater release ${id === "odyssey" ? "<small>Oct 23 · example</small>" : ""}</label><label class="check"><input type="checkbox" ${f.streaming ? "checked" : ""} onchange="follow('${id}','streaming',this.checked)"> Subscription streaming ${id === "odyssey" ? "<small>Dec 18 · example</small>" : ""}</label><label class="check"><input type="checkbox" ${f.rental ? "checked" : ""} onchange="follow('${id}','rental',this.checked)"> Digital rental / purchase</label><small>${id === "odyssey" ? "Demo dates show how separate releases appear on the calendar." : "No upcoming dates in this sample. Following saves your preference for when a date is announced."}</small>`;
  } else {
    let vals = state.reactions[id] || [];
    body += `<div class="sectionhead"><h2>Your episode journey</h2><span class="pill">Season 1</span></div><small>Tap a watched episode to rate it. Unwatched reactions stay hidden.</small><div class="chart">${Array.from(
      { length: x.episodes },
      (_, i) => {
        let v = vals[i],
          seen = i < (state.progress[id] || 0),
          // Skipped ratings are stored as null (or a gap); treat both as unrated.
          rated = seen && Number.isInteger(v);
        return `<button aria-label="Episode ${i + 1}: ${rated ? reactions[v] : seen ? "unrated" : "unwatched"}" onclick="episode=${i};${seen ? `rateEpisode('${id}')` : `toast('Mark this episode watched before rating')`}"><span class="bar" style="height:${rated ? 25 + v * 23 : 8}px;background:${rated ? (v >= 3 ? "#6fa68b" : v >= 1 ? "#d7bc68" : "#c77979") : "#deded8"}"></span><span>E${i + 1}</span></button>`;
      },
    ).join(
      "",
    )}</div><div class="legend"><span>Great ↑</span><span>Bad ↓</span><span>Gray = unrated / unwatched</span></div><button style="margin-top:16px" onclick="favorites('${id}')">♡ My favorite episodes</button>`;
  }
  show(x.title, body);
}
function follow(id, type, on) {
  state.follows[id] ??= {};
  state.follows[id][type] = on;
  persist();
  render();
  toast(
    on
      ? "Release alert followed · demo preference saved"
      : "Release alert removed",
  );
}
function rateEpisode(id) {
  show(
    "A quick episode reaction",
    `<div class="eyebrow">${item(id).title} · Season 1</div><h1>Episode ${episode + 1}</h1><p class="muted">No comparisons. Just how it felt.</p><div class="options">${reactions.map((r, i) => `<button class="${tone(r)}" onclick="state.reactions['${id}']??=[];state.reactions['${id}'][${episode}]=${i};persist();detail('${id}')">${r}</button>`).join("")}</div><button class="plain" onclick="detail('${id}')">Skip rating →</button>`,
  );
}
function favorites(id) {
  let a = (state.reactions[id] || [])
    .map((v, i) => ({ v, i }))
    .filter((x) => x.v === 4);
  show(
    "Your favorite episodes",
    `<h2>${item(id).title}</h2>${a.length ? a.map((x) => `<div class="mini"><b>Season 1 · Episode ${x.i + 1}</b><span style="color:var(--green);margin-left:auto">Great</span></div>`).join("") : '<p class="muted">Rate an episode Great to find it here.</p>'}<button style="margin-top:20px" onclick="detail('${id}')">Back to chart</button>`,
  );
}
function friends() {
  let posts = [
    {
      person: "Alex Morgan",
      initial: "AM",
      action: "ranked a movie",
      id: "dune",
      score: "9.1",
      reaction: "Great",
      time: "2h ago",
      text: "The kind of movie that reminds you why theaters exist.",
    },
    {
      person: "Jamie Chen",
      initial: "JC",
      action: "is watching",
      id: "severance",
      time: "4h ago",
      text: "Finally starting this. Going in completely blind.",
    },
    {
      person: "Sam Taylor",
      initial: "ST",
      action: "added to Watch Later",
      id: "past",
      time: "Yesterday",
      text: "Next movie night, sorted.",
    },
  ];
  return (
    head(
      "Good taste travels.",
      "See what your people are watching, loving, and saving.",
    ) +
    `<div class="layout"><div class="feed">${posts.map((p, i) => `<article class="panel feedpost"><div class="feedtitle"><span class="avatar" style="background:${["#e5dccb", "#dce6dc", "#dcdff0"][i]}">${p.initial}</span><div style="flex:1"><b>${p.person}</b> <span class="muted">${p.action}</span><br><small>${p.time} · Sample friend</small></div><span>↗</span></div><div class="feedmovie">${art(item(p.id), "medium")}<div><small>${item(p.id).type}</small><h2>${item(p.id).title}</h2>${p.score ? `<span class="score">${p.score}</span> <small>Great · #4 in their movies</small>` : '<span class="pill">' + (i === 1 ? "Started Season 1" : "On their list") + "</span>"}<p>${p.text}</p></div></div><div class="feedactions"><button class="plain" onclick="like(${i})">${state.likes.includes(i) ? "♥ Liked" : "♡ Like"} · ${[12, 8, 5][i] + (state.likes.includes(i) ? 1 : 0)}</button><button class="plain" onclick="save('${p.id}')">${state.later.includes(p.id) ? "✓ Saved" : "＋ Save to Watch Later"}</button><button class="plain" onclick="detail('${p.id}')">View title →</button></div></article>`).join("")}</div><aside class="rail"><div class="panel rightbox"><div class="eyebrow">Your circle</div><h2 style="margin-top:10px">A shared love of stories.</h2><p class="muted">Friend activity is illustrative in this prototype. Accounts and following come next.</p><div class="mini"><span class="avatar">AM</span><div><b>Alex Morgan</b><br><small>Also loves sci-fi</small></div></div><div class="mini"><span class="avatar">JC</span><div><b>Jamie Chen</b><br><small>Mystery enthusiast</small></div></div></div><div class="note"><b>Spoilers stay backstage.</b><p>Episode reactions stay inside each show, behind your watch progress.</p></div></aside></div>`
  );
}
function like(i) {
  state.likes = state.likes.includes(i)
    ? state.likes.filter((x) => x !== i)
    : [...state.likes, i];
  persist();
  render();
}
function settings() {
  show(
    "Your reminders",
    `<h2>A calendar that fits your life.</h2><p class="muted">United States · America/Chicago</p><label class="check"><input type="checkbox" ${state.notifications ? "checked" : ""} onchange="state.notifications=this.checked;persist()"> Daily release digest</label><p class="muted">Individual movie release alerts are managed on each title.</p><div class="note"><b>Prototype preview</b><p>Preferences save in this browser. No real notifications are sent and no live release data is connected.</p></div><button style="margin-top:20px" onclick="resetConfirm()">Reset demo changes</button>`,
  );
}
function resetConfirm() {
  show(
    "Reset this demo?",
    `<p>This resets your local sample watchlists, ratings, and preferences.</p><button class="primary" onclick="state=structuredClone(initial);persist();document.querySelector('#modal').close();render();toast('Demo reset')">Reset demo</button>`,
  );
}
function render() {
  $("#nav").innerHTML = navs
    .map(
      ([p, i]) =>
        `<button class="${page === p ? "active" : ""}" onclick="go('${p}')"><span class="navicon">${i}</span>${p}</button>`,
    )
    .join("");
  $("#content").innerHTML =
    page === "Calendar"
      ? calendar()
      : page === "Watching"
        ? watch()
        : page === "Discover"
          ? discover()
          : page === "Rankings"
            ? rankings()
            : page === "Friends"
              ? friends()
              : head(
                  "Saved for a good night.",
                  "Everything you want to watch. Nothing you have to remember.",
                ) +
                `<div class="sectionhead"><h2>Your shortlist <span class="muted">${state.later.length}</span></h2><button onclick="go('Discover')">Discover more →</button></div>` +
                (state.later.length
                  ? cards(state.later.map(item))
                  : '<div class="empty">Save your first title from Discover.</div>');
}
$("#search")?.addEventListener("input", (e) => {
  query = e.target.value;
  page = "Discover";
  render();
});
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) {
    let r = $("#modal").getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      $("#modal").close();
  }
});
render();
