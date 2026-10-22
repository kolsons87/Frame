const icons = {
  Calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18M8 15h2m4 0h2"/>',
  Discover:
    '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
  "My Watchlist":
    '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/>',
  Friends:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3"/>',
  Profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
};
const svg = (n) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[n]}</svg>`;
let watchTab = "Watching",
  agendaMonths = 2,
  selectedDay = null;
view = "Agenda";
const oldDiscover = discover,
  oldWatch = watch,
  oldRanks = rankings;
function go(p) {
  if (p === "Watching" || p === "Watch Later") {
    watchTab = p;
    p = "My Watchlist";
  }
  if (p === "Rankings") p = "Profile";
  page = p;
  query = "";
  render();
  $("#scrollmain").scrollTop = 0;
}
function calendar() {
  let date = new Date(year, month, 1);
  let header = head(
    "Something to look forward to.",
    "Your next episodes. Your next movie night.",
  );
  let toolbar = `<div class="toolbar"><span class="month-title">${date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span><div class="row"><button class="month-arrow" aria-label="Previous month" onclick="selectedDay=null;changeMonth(-1)">‹</button><button class="month-arrow" aria-label="Next month" onclick="selectedDay=null;changeMonth(1)">›</button></div></div><div class="tabs">${["Agenda", "Month"].map((v) => `<button class="${view === v ? "active" : ""}" onclick="view='${v}';selectedDay=null;render()">${v}</button>`).join("")}</div><div class="chips" style="margin-top:17px">${["All releases", "Episodes", "Theaters", "Streaming"].map((f) => `<button class="${filter === f ? "active" : ""}" onclick="filter='${f}';render()">${f}</button>`).join("")}</div><div class="sample-line"><span><i class="dot"></i> Following your watching list</span><span>Sample schedule · CT</span></div>`;
  let grid = "";
  if (view === "Month") {
    let start = (date.getDay() + 6) % 7,
      days = new Date(year, month + 1, 0).getDate(),
      es = events(year, month);
    grid =
      '<div class="month-grid">' +
      ["M", "T", "W", "T", "F", "S", "S"]
        .map((x) => `<span class="wk">${x}</span>`)
        .join("") +
      Array.from({ length: start }, () => "<span></span>").join("") +
      Array.from(
        { length: days },
        (_, i) =>
          `<button class="${selectedDay === i + 1 ? "selected" : ""}" onclick="selectedDay=${i + 1};render()" aria-label="Show releases on ${i + 1}">${i + 1}${es.some((e) => e.d === i + 1) ? "<i></i>" : ""}</button>`,
      ).join("") +
      "</div>";
  }
  let agenda = "";
  for (let o = 0; o < (view === "Agenda" ? agendaMonths : 1); o++) {
    let dt = new Date(year, month + o, 1),
      ev = events(dt.getFullYear(), dt.getMonth());
    if (view === "Month" && selectedDay)
      ev = ev.filter((e) => e.d === selectedDay);
    if (o)
      agenda += `<div class="month-divider">${dt.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>`;
    for (let d of [...new Set(ev.map((e) => e.d))])
      agenda += `<div class="release-day"><div class="date-label"><small>${new Date(dt.getFullYear(), dt.getMonth(), d).toLocaleDateString("en-US", { weekday: "short" })}</small><b>${d}</b></div><div>${ev
        .filter((e) => e.d === d)
        .map(
          (e) =>
            `<button class="release-card" onclick="detail('${e.id}')">${art(item(e.id), "tiny")}<div class="release-text"><b>${item(e.id).title}</b><small>${e.text}</small><br><span class="release-tag ${e.kind}">${e.kind === "episode" ? "NEW EPISODE · " + item(e.id).service : e.kind === "theater" ? "IN THEATERS" : "ON SUBSCRIPTION"}</span></div><span style="color:#b2aaa0;align-self:center">›</span></button>`,
        )
        .join("")}</div></div>`;
    if (!ev.length)
      agenda +=
        '<div class="empty">A little room in your calendar.<br>Follow a title in Discover to keep it on your radar.</div>';
  }
  return (
    header +
    toolbar +
    grid +
    `<div class="release-list">${agenda}</div>` +
    (view === "Agenda"
      ? `<button class="load-more" onclick="agendaMonths++;let y=document.querySelector('#scrollmain').scrollTop;render();document.querySelector('#scrollmain').scrollTop=y">See the next month ↓</button>`
      : "") +
    '<p class="sample-notice">Illustrative releases, not actual dates or availability.</p>'
  );
}
function myWatchlist() {
  return (
    head(
      "Your kind of downtime.",
      "A place for what’s on now, and what’s next.",
    ) +
    `<div class="tabs watch-tabs">${["Watching", "Watch Later"].map((t) => `<button class="${watchTab === t ? "active" : ""}" onclick="watchTab='${t}';render()">${t} <span style="opacity:.5;margin-left:5px">${t === "Watching" ? state.watching.length : state.later.length}</span></button>`).join("")}</div>` +
    (watchTab === "Watching"
      ? oldWatch().replace(/^.*?(?=<div class="note"|<div class="panel">)/s, "")
      : cards(state.later.map(item))) +
    (watchTab === "Watch Later" && state.later.length === 0
      ? '<div class="empty">Your next favorite is out there.<br>Save something from Discover.</div>'
      : "")
  );
}
function profile() {
  let n = state.ranks.length;
  return (
    `<div class="profilehero"><span class="avatar">KO</span><h1>Kyle Olson</h1><p>A soft spot for a good story.</p><div class="stats"><div><b>${n}</b><small>Titles ranked</small></div><div><b>${Object.values(state.progress).reduce((a, b) => a + b, 0)}</b><small>Episodes watched</small></div><div><b>${state.later.length}</b><small>Saved for later</small></div></div></div><div class="profilehead"><h2>Your taste, in order.</h2><button class="soft" onclick="pickRank()">＋ Rank</button></div><p class="rankintro">Your comparisons find the score.<br>Your reaction gives it color.</p>` +
    oldRanks().replace(/^.*?(?=<div class="toolbar">)/s, "")
  );
}
// Assigned (not declared) on purpose: a `function discover()` declaration is
// hoisted above `const oldDiscover = discover`, so oldDiscover pointed at this
// function and the Discover tab recursed until the stack overflowed.
discover = function () {
  return (
    `<div class="search-wrap"><input id="search" class="search" aria-label="Search sample movies and shows" placeholder="Search movies & shows" value="${query.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}"></div><div class="add-row"><button class="soft" onclick="titleForm()">＋ Add a movie or show</button></div>` +
    oldDiscover()
  );
};
function render() {
  let active =
    page === "Rankings"
      ? "Profile"
      : page === "Watching" || page === "Watch Later"
        ? "My Watchlist"
        : page;
  $("#nav").innerHTML = Object.keys(icons)
    .map(
      (p) =>
        `<button class="${active === p ? "active" : ""}" aria-label="${p}" onclick="go('${p}')">${svg(p)}<span>${p}</span></button>`,
    )
    .join("");
  $("#content").innerHTML =
    active === "Calendar"
      ? calendar()
      : active === "My Watchlist"
        ? myWatchlist()
        : active === "Discover"
          ? discover()
          : active === "Profile"
            ? profile()
            : friends();
  let input = $("#search");
  if (input)
    input.addEventListener("input", (e) => {
      let pos = e.target.selectionStart;
      query = e.target.value;
      render();
      let field = $("#search");
      field.focus();
      field.setSelectionRange(pos, pos);
    });
}
// Keep watching and saved-for-later mutually exclusive.
function save(id) {
  if (state.watching.includes(id)) {
    toast("Already in Watching · pause it to save for later");
    return;
  }
  if (state.later.includes(id)) {
    state.later = state.later.filter((x) => x !== id);
    toast("Removed from Watch Later");
  } else {
    state.later.push(id);
    toast("Saved for a good night");
  }
  persist();
  render();
}
function pause(id) {
  state.watching = state.watching.filter((x) => x !== id);
  if (!state.later.includes(id)) state.later.push(id);
  if (id === "white") state.check = true;
  persist();
  $("#modal").close();
  render();
  toast("Saved for later · calendar paused");
}
render();
// A finite illustrative season: episode numbering does not restart each month.
// Day arithmetic uses UTC calendar dates so daylight-saving changes (e.g. the
// Nov 1 fall-back in Central time) can't produce fractional weeks.
function dayNumber(y, m, d) {
  return Date.UTC(y, m, d) / 86400000;
}
function events(y, m) {
  let rows = [];
  for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) {
    let day = dayNumber(y, m, d);
    for (let [id, first, ep] of [
      ["severance", dayNumber(2026, 9, 2), 5],
      ["bear", dayNumber(2026, 9, 7), 4],
      ["white", dayNumber(2026, 9, 4), 2],
    ]) {
      let weeks = (day - first) / 7;
      let n = ep + weeks;
      if (
        Number.isInteger(weeks) &&
        weeks >= 0 &&
        state.watching.includes(id) &&
        item(id) &&
        n <= item(id).episodes
      )
        rows.push({ d, id, kind: "episode", text: `S1 · E${n}` });
    }
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
