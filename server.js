const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ============ EDIT THESE BEFORE THE EVENT ============
const TEACHERS = [
  "Teacher A", "Teacher B", "Teacher C", "Teacher D", "Teacher E",
  "Teacher F", "Teacher G", "Teacher H", "Teacher I", "Teacher J",
];

// Order matters: earlier categories get first claim on a teacher's name
// if that teacher tops the vote count in more than one category.
const CATEGORIES = [
  { id: "punctuality", label: "Punctuality" },
  { id: "approachable", label: "Most Approachable" },
  { id: "teaching", label: "Best Teaching Quality" },
  { id: "discipline", label: "Discipline" },
  { id: "mentor", label: "Best Mentor" },
];

const PORT = process.env.PORT || 3000;
// =======================================================

const DATA_FILE = path.join(__dirname, "votes.json");

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch (e) {
      console.error("votes.json is corrupted, starting fresh:", e.message);
    }
  }
  return { voted: {}, votes: [] }; // votes: [{voter, category, teacher}]
}

let data = loadData();

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function normalize(name) {
  return name.trim().toLowerCase();
}

function computeResults() {
  // raw counts per category, excluding self-votes (shouldn't exist, but defense in depth)
  const counts = {};
  CATEGORIES.forEach((c) => (counts[c.id] = {}));
  data.votes.forEach((v) => {
    if (normalize(v.voter) === normalize(v.teacher)) return;
    counts[v.category][v.teacher] = (counts[v.category][v.teacher] || 0) + 1;
  });

  const used = new Set();
  const finalResults = {};
  CATEGORIES.forEach((c) => {
    const ranked = Object.entries(counts[c.id] || {})
      .filter(([name]) => !used.has(name))
      .sort((a, b) => b[1] - a[1]);
    const top3 = ranked.slice(0, 3);
    top3.forEach(([name]) => used.add(name));
    finalResults[c.id] = {
      label: c.label,
      top3: top3.map(([name, count]) => ({ name, count })),
      allCounts: Object.entries(counts[c.id] || {})
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    };
  });

  return { totalVoters: Object.keys(data.voted).length, results: finalResults };
}

function send(res, status, contentType, body) {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

function sendJSON(res, status, obj) {
  send(res, status, "application/json", JSON.stringify(obj));
}

function votePageHTML() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Teacher's Day Poll</title>
<style>
  :root { --bg:#16281F; --panel:#1F3A2E; --border:#2C4436; --cream:#F3EFE4; --gold:#C9A24B; --muted:#CFC9B8; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--cream); font-family: 'Segoe UI', sans-serif; display:flex; justify-content:center; padding:24px 16px; }
  .wrap { width:100%; max-width:480px; }
  h1 { font-family: Georgia, serif; font-size:24px; margin:0 0 4px; }
  .eyebrow { color:var(--gold); font-size:14px; font-family: Georgia, serif; }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:22px; margin-top:20px; }
  button { width:100%; padding:12px; font-size:15px; border-radius:6px; border:1px solid var(--border); margin-top:8px; }
  button.primary { background:var(--gold); color:var(--bg); font-weight:700; border:none; cursor:pointer; }
  button.primary:disabled { background:#5C5643; }
  .cat-label { font-size:13px; color:#A8B0A5; margin-bottom:6px; }
  .cat-block { margin-bottom:18px; }
  .msg { color:#E08585; font-size:13px; }
  .ok { color:#8FCB9B; font-size:14px; }
  .picker-input { width:100%; padding:12px; font-size:15px; border-radius:6px; border:1px solid var(--border); background:#0F1F17; color:var(--cream); }
  .picker-input:disabled { opacity:0.5; }
  .picker-results { max-height:220px; overflow-y:auto; border:1px solid var(--border); border-top:none; border-radius:0 0 6px 6px; background:#0F1F17; }
  .picker-result { display:block; width:100%; text-align:left; padding:10px 12px; background:none; border:none; border-top:1px solid var(--border); color:var(--cream); font-size:14px; margin:0; border-radius:0; cursor:pointer; }
  .picker-result:hover, .picker-result:active { background:#182E22; }
  .picker-empty { padding:10px 12px; color:#8B9188; font-size:13px; }
  .chip { display:flex; align-items:center; justify-content:space-between; background:#0F1F17; border:1px solid var(--gold); border-radius:6px; padding:10px 12px; font-size:15px; }
  .chip button { width:auto; margin:0; padding:4px 10px; font-size:12px; background:none; border:1px solid var(--border); color:var(--muted); }
</style></head>
<body><div class="wrap">
<div class="eyebrow">Teacher's Day</div>
<h1>Staff Recognition Poll</h1>

<div class="card" id="nameCard">
  <p style="color:var(--muted); margin-top:0;">Search and select your name. You won't see your own name as an option below.</p>
  <div id="voterPicker"></div>
</div>

<div class="card" id="voteCard" style="display:none;">
  <div id="voteForm"></div>
  <button class="primary" id="submitBtn" disabled>Submit ballot</button>
  <div id="msg"></div>
</div>

<div class="card" id="doneCard" style="display:none;">
  <h2>Ballot submitted</h2>
  <p style="color:var(--muted);">Thanks. Your votes are recorded.</p>
</div>

<script>
const ALL_TEACHERS = ${JSON.stringify(TEACHERS)};
const CATEGORIES = ${JSON.stringify(CATEGORIES)};
let voterName = null;
const picks = {};

// Reusable type-to-search picker. Replaces a native <select>, since a
// scrolling dropdown of 116+ names is unusable on a phone.
function createPicker(container, { placeholder, excludeNames, onSelect }) {
  container.innerHTML =
    '<input class="picker-input" type="text" placeholder="' + placeholder + '" autocomplete="off">' +
    '<div class="picker-results"></div>';
  const input = container.querySelector('.picker-input');
  const results = container.querySelector('.picker-results');

  function render(query) {
    const q = query.trim().toLowerCase();
    const excluded = new Set((excludeNames() || []).map(n => n.toLowerCase().trim()));
    const matches = ALL_TEACHERS.filter(t =>
      !excluded.has(t.toLowerCase().trim()) && (q === '' || t.toLowerCase().includes(q))
    ).slice(0, 30);
    if (matches.length === 0) {
      results.innerHTML = '<div class="picker-empty">No matching names.</div>';
      return;
    }
    results.innerHTML = matches.map(t =>
      '<button type="button" class="picker-result" data-name="' + t.replace(/"/g,'&quot;') + '">' + t + '</button>'
    ).join('');
  }

  input.addEventListener('focus', () => render(input.value));
  input.addEventListener('input', () => render(input.value));
  results.addEventListener('click', (e) => {
    const btn = e.target.closest('.picker-result');
    if (!btn) return;
    onSelect(btn.dataset.name);
  });
  render('');
}

function selectedChip(container, name, onChange) {
  container.innerHTML =
    '<div class="chip"><span>' + name + '</span><button type="button">Change</button></div>';
  container.querySelector('.chip button').addEventListener('click', onChange);
}

// --- voter picker ---
const voterPickerEl = document.getElementById('voterPicker');
setupVoterPicker();

function setupVoterPicker() {
  createPicker(voterPickerEl, {
    placeholder: 'Search your name…',
    excludeNames: () => [],
    onSelect: onVoterChosen
  });
}

async function onVoterChosen(name) {
  const res = await fetch('/api/status?voter=' + encodeURIComponent(name));
  const status = await res.json();
  if (status.alreadyVoted) {
    document.getElementById('nameCard').style.display = 'none';
    document.getElementById('doneCard').style.display = 'block';
    document.getElementById('doneCard').querySelector('p').textContent = name + ' has already voted.';
    return;
  }
  voterName = name;
  selectedChip(voterPickerEl, name, () => { voterName = null; setupVoterPicker(); document.getElementById('voteCard').style.display = 'none'; document.getElementById('submitBtn').disabled = true; });
  document.getElementById('voteCard').style.display = 'block';
  buildCategoryPickers();
}

function buildCategoryPickers() {
  const form = document.getElementById('voteForm');
  form.innerHTML = CATEGORIES.map(c =>
    '<div class="cat-block"><div class="cat-label">' + c.label + '</div><div id="picker-' + c.id + '"></div></div>'
  ).join('');
  CATEGORIES.forEach(c => setupCategoryPicker(c.id));
}

function setupCategoryPicker(catId) {
  const el = document.getElementById('picker-' + catId);
  createPicker(el, {
    placeholder: 'Search a teacher…',
    excludeNames: () => [
      voterName,
      ...Object.entries(picks).filter(([k, v]) => k !== catId && v).map(([, v]) => v)
    ],
    onSelect: (name) => {
      picks[catId] = name;
      selectedChip(el, name, () => {
        delete picks[catId];
        checkReady();
        setupCategoryPicker(catId);
      });
      checkReady();
    }
  });
}

function checkReady() {
  const done = CATEGORIES.every(c => picks[c.id]);
  document.getElementById('submitBtn').disabled = !done;
}

document.getElementById('submitBtn').addEventListener('click', async () => {
  const msg = document.getElementById('msg');
  document.getElementById('submitBtn').disabled = true;
  const res = await fetch('/api/vote', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ voter: voterName, picks })
  });
  const out = await res.json();
  if (out.ok) {
    document.getElementById('voteCard').style.display = 'none';
    document.getElementById('doneCard').style.display = 'block';
  } else {
    msg.className = 'msg'; msg.textContent = out.error || 'Submission failed.';
    document.getElementById('submitBtn').disabled = false;
  }
});
</script>
</div></body></html>`;
}

function resultsPageHTML() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Live Results</title>
<style>
  body { margin:0; background:#16281F; color:#F3EFE4; font-family: 'Segoe UI', sans-serif; padding:32px; }
  h1 { font-family: Georgia, serif; }
  .sub { color:#A8B0A5; margin-top:-8px; }
  .cat { margin-top:28px; }
  .cat h2 { font-family: Georgia, serif; font-size:20px; margin-bottom:10px; }
  .row { display:flex; align-items:center; gap:12px; margin-bottom:6px; }
  .name { width:180px; font-size:15px; }
  .bar-bg { flex:1; background:#2C4436; border-radius:4px; overflow:hidden; height:26px; }
  .bar { height:100%; border-radius:4px; }
  .count { width:30px; text-align:right; font-size:14px; color:#CFC9B8; }
  .gold { background:#C9A24B; } .silver { background:#9AA5A0; } .bronze { background:#8C6A4A; }
</style></head>
<body>
<h1>Staff Recognition Poll — Live Results</h1>
<p class="sub" id="voterCount"></p>
<div id="content"></div>
<script>
async function refresh() {
  const res = await fetch('/api/results');
  const data = await res.json();
  document.getElementById('voterCount').textContent = data.totalVoters + ' ballots submitted';
  const content = document.getElementById('content');
  content.innerHTML = Object.values(data.results).map(cat => {
    const max = Math.max(1, ...cat.top3.map(t => t.count));
    const rows = cat.top3.map((t, i) => {
      const cls = i === 0 ? 'gold' : i === 1 ? 'silver' : 'bronze';
      const pct = Math.round((t.count / max) * 100);
      return '<div class="row"><div class="name">' + t.name + '</div><div class="bar-bg"><div class="bar ' + cls + '" style="width:' + pct + '%"></div></div><div class="count">' + t.count + '</div></div>';
    }).join('') || '<p style="color:#8B9188;">No votes yet.</p>';
    return '<div class="cat"><h2>' + cat.label + '</h2>' + rows + '</div>';
  }).join('');
}
refresh();
setInterval(refresh, 4000);
</script>
</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/") {
    return send(res, 200, "text/html", votePageHTML());
  }

  if (req.method === "GET" && url.pathname === "/results") {
    return send(res, 200, "text/html", resultsPageHTML());
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    const voter = url.searchParams.get("voter") || "";
    return sendJSON(res, 200, { alreadyVoted: !!data.voted[normalize(voter)] });
  }

  if (req.method === "GET" && url.pathname === "/api/results") {
    return sendJSON(res, 200, computeResults());
  }

  if (req.method === "POST" && url.pathname === "/api/vote") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { voter, picks } = JSON.parse(body);
        if (!voter || !TEACHERS.includes(voter)) {
          return sendJSON(res, 400, { ok: false, error: "Invalid voter." });
        }
        if (data.voted[normalize(voter)]) {
          return sendJSON(res, 400, { ok: false, error: "You've already voted." });
        }
        const seen = new Set();
        for (const c of CATEGORIES) {
          const teacher = picks[c.id];
          if (!teacher || !TEACHERS.includes(teacher)) {
            return sendJSON(res, 400, { ok: false, error: "Missing pick for " + c.label + "." });
          }
          if (normalize(teacher) === normalize(voter)) {
            return sendJSON(res, 400, { ok: false, error: "You can't vote for yourself." });
          }
          if (seen.has(normalize(teacher))) {
            return sendJSON(res, 400, { ok: false, error: "You picked " + teacher + " in more than one category. Choose a different teacher for each." });
          }
          seen.add(normalize(teacher));
        }
        CATEGORIES.forEach((c) => {
          data.votes.push({ voter, category: c.id, teacher: picks[c.id] });
        });
        data.voted[normalize(voter)] = true;
        saveData();
        return sendJSON(res, 200, { ok: true });
      } catch (e) {
        return sendJSON(res, 400, { ok: false, error: "Bad request." });
      }
    });
    return;
  }

  send(res, 404, "text/plain", "Not found");
});

server.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) addrs.push(net.address);
    }
  }
  console.log("\nServer running.");
  console.log("Voting page (share this via QR code, phones must be on the same WiFi):");
  addrs.forEach((a) => console.log("  http://" + a + ":" + PORT + "/"));
  console.log("Results page (open this on the laptop, mirror to projector):");
  addrs.forEach((a) => console.log("  http://" + a + ":" + PORT + "/results"));
  console.log("");
});
