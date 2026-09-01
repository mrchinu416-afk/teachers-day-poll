const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ============ EDIT THESE BEFORE THE EVENT ============
const TEACHERS = [
  "ABHIJEET SINGH CHUNDAWAT", "AJIT SINGH", "ALKESH CHOUHAN", "ANITA CHITTORA",
  "ANITA KASOTIYA", "ANITA SHARMA", "ANJANA SINGH", "ANKITA S.", "AREEBA AHMAD", "ARIFA SAIF",
  "ARPITA CHHABRA", "ARZOO SAWLANI", "ASHA DAK", "ASHIYA BANU", "BASANTA PALIWAL",
  "CHANDRA JYOTSNA GOSWAMI", "CHETNA ARYA", "DEEPANSHI DHAKAR", "DEEPA KOTHARI",
  "DEEPIKA DHAYBHAI", "DEEPIKA SHARMA", "DEEPIKA WADHWANI", "DEVANSHI PANDYA",
  "DEVANSHU CHAUHAN", "DHARMISHTHA SINGH", "DIKSHA KEWLANI", "DIKSHA SHARMA", "DISHA KATARIA",
  "DIVYA GULABANI", "DIVYA RANA", "DIVYANSHI VAIRAGI", "GAURAV KUMAR PANDIT", "GIRISH K NAIR",
  "GURLEEN ARORA", "HARSHA VASHISTHA", "HEMANDRA DAVE", "JAGDISH CHANDRA", "JAHNAVI RAJANI",
  "JAYA MUKERJI", "KALINDI BHATNAGAR", "KALPANA SHARMA", "KAVITA SHARMA", "KHUSHBOO JAIN",
  "LALIT KUMAR GUPTA", "LALITA JOSHI", "LALITA JOSHI (PPY)", "MAHESH GANDHARV", "LIBY MATHEW",
  "MADHAVI MOD", "LIVANSHI CHOUHAN", "MANASI GHOSAL", "MANISHA SHARMA", "MINKLE VEERWANI",
  "MANOJ KUMAR KALOSHIA", "MEETU BHATT", "MONIKA BHARGAVA", "MONIKA KHATURIA",
  "MONIKA SHARMA", "MONIKA TALDAR", "MOHAMMED TAUFIQ SHEIKH", "MOON BAGCHI", "NAFISA BANU",
  "NAMEERA SIRAJ", "NEETU SINGH RAJPUT", "NIDHI SHARMA", "NIKITA KHERA", "PADMINI RAO",
  "NINGTHOUJAM SILVIYA DEVI", "POOJA RANAWAT", "POONAM FAUZDAR", "POONAM PALIWAL",
  "PRABUDDHA PANDEY", "PREETI ASAWARA", "PRACHI TAK", "PRATIBHA MANDAWAT", "PREETI SHRIDHAR",
  "PRERNA KHANNA", "PRITI MATHUR", "PRIYANKA MAKWANA", "PURVA MISHRA", "PUSHPA CHOUHAN",
  "PUSHPENDRA SINGH SOLANKI", "RADHA RANI", "RAGINI PANERI", "RATIKA SAXENA", "RENU SISODIYA",
  "RUCHITA RAO", "RUKSAR SHEIKH", "SAKINA", "SAKINA MODI", "SANDHYA RANI", "SANDHYA S.",
  "SEEMA YADAV", "SHABBIR MODI", "SHAHID MOHAMMAD", "SHAHINA SHARIF", "SHANKAR DAS",
  "SHEETAL DHAWAN", "SHIPRA CHATERJEE", "SHIPRA HARKAWAT", "SHIVANI SHRIMALI",
  "SHIVANI YADAV", "SHYAM NATH PUROHIT", "SNIGDHA MEHTA", "SOUDAMINI KARMAKAR",
  "SURBHI SHRIMALI", "SUSHMA BHATI", "SUSHMA MATHUR", "SUSHMITA RAJ", "VARSHA AGRAWAL",
  "SWETA MANISH JAIN", "VEENA SISODIYA", "VIBHUTI SHRIMALI", "VINEETHA NAIR", "YUKTI SHARMA",
  "ZIA SHEIKH"
];

// Order matters: earlier categories get first claim on a teacher's name
// if that teacher tops the vote count in more than one category.
const CATEGORIES = [
  { id: "calm_in_chaos", label: "Calm in Chaos" },
  { id: "walking_encyclopedia", label: "Walking Encyclopedia" },
  { id: "one_more_question", label: "Master of \u2018One More Question\u2019" },
  { id: "deadline_detective", label: "Deadline Detective" },
  { id: "silent_classroom_control", label: "The Silent Classroom Control" },
  { id: "walking_attendance_register", label: "Walking Attendance Register" },
  { id: "crisis_manager", label: "The Crisis Manager" },
  { id: "energy_booster", label: "The Energy Booster" },
  { id: "eyes_back_of_head", label: "The Eyes in the Back of the Head" },
  { id: "corridor_surveillance", label: "The Corridor Surveillance Award" },
  { id: "multitasking_marvel", label: "The Multitasking Marvel Award" },
  { id: "most_approachable", label: "The Most Approachable Award" },
  { id: "colgate_smile", label: "The Colgate Smile Award" },
];

const PORT = process.env.PORT || 3000;
// =======================================================

const DATA_FILE = path.join(__dirname, "votes.json");

const crypto = require("crypto");

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch (e) {
      console.error("votes.json is corrupted, starting fresh:", e.message);
    }
  }
  return { voted: {}, votes: [] }; // voted: {sid: true}, votes: [{sid, category, teacher}]
}

let data = loadData();

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// One vote per device: identified by a random id stored in a cookie, not
// by name, since students voting aren't in any name list we control.
// Caveat, stated plainly: this is per-browser, not per-physical-device.
// A student using a different browser or incognito on the same phone can
// vote again. Good enough for a school poll's honor-system baseline, not
// airtight against a determined repeat-voter.
function getSessionId(req, res) {
  const cookies = parseCookies(req.headers.cookie || "");
  if (cookies.sid) return cookies.sid;
  const sid = crypto.randomUUID();
  res.setHeader("Set-Cookie", `sid=${sid}; Path=/; Max-Age=31536000; SameSite=Lax`);
  return sid;
}

function parseCookies(header) {
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function computeResults() {
  const counts = {};
  CATEGORIES.forEach((c) => (counts[c.id] = {}));
  data.votes.forEach((v) => {
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
  :root { --bg:#F5F1E6; --panel:#FFFFFF; --border:#DDD5BE; --field:#FAF8F1; --ink:#2A3B2F; --gold:#B8863A; --muted:#6E7A6A; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family: 'Segoe UI', sans-serif; display:flex; justify-content:center; padding:24px 16px; }
  .wrap { width:100%; max-width:480px; }
  h1 { font-family: Georgia, serif; font-size:24px; margin:0 0 4px; }
  .eyebrow { color:var(--gold); font-size:14px; font-family: Georgia, serif; }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:22px; margin-top:20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  button { width:100%; padding:12px; font-size:15px; border-radius:6px; border:1px solid var(--border); margin-top:8px; }
  button.primary { background:var(--gold); color:#FFFFFF; font-weight:700; border:none; cursor:pointer; }
  button.primary:disabled { background:#C9C2AC; }
  .cat-label { font-size:13px; color:var(--muted); margin-bottom:6px; }
  .cat-block { margin-bottom:18px; }
  .msg { color:#B4453D; font-size:13px; }
  .ok { color:#4F8F5B; font-size:14px; }
  .picker-input { width:100%; padding:12px; font-size:15px; border-radius:6px; border:1px solid var(--border); background:var(--field); color:var(--ink); }
  .picker-input:disabled { opacity:0.5; }
  .picker-results { max-height:220px; overflow-y:auto; border:1px solid var(--border); border-top:none; border-radius:0 0 6px 6px; background:var(--field); }
  .picker-result { display:block; width:100%; text-align:left; padding:10px 12px; background:none; border:none; border-top:1px solid var(--border); color:var(--ink); font-size:14px; margin:0; border-radius:0; cursor:pointer; }
  .picker-result:hover, .picker-result:active { background:#F0EBDA; }
  .picker-empty { padding:10px 12px; color:var(--muted); font-size:13px; }
  .chip { display:flex; align-items:center; justify-content:space-between; background:var(--field); border:1px solid var(--gold); border-radius:6px; padding:10px 12px; font-size:15px; }
  .chip button { width:auto; margin:0; padding:4px 10px; font-size:12px; background:none; border:1px solid var(--border); color:var(--muted); }
</style></head>
<body><div class="wrap">
<div class="eyebrow">Teacher's Day</div>
<h1>Staff Recognition Poll</h1>

<div class="card" id="voteCard" style="display:none;">
  <div id="voteForm"></div>
  <button class="primary" id="submitBtn" disabled>Submit ballot</button>
  <div id="msg"></div>
</div>

<div class="card" id="doneCard" style="display:none;">
  <h2 id="doneHeading">Ballot submitted</h2>
  <p style="color:var(--muted);" id="doneText">Thanks. Your votes are recorded.</p>
</div>

<script>
const ALL_TEACHERS = ${JSON.stringify(TEACHERS)};
const CATEGORIES = ${JSON.stringify(CATEGORIES)};
const picks = {};

// One vote per device, tracked by a cookie the server sets automatically.
// This is checked on every page load, so refreshing does not reset it.
(async function init() {
  const res = await fetch('/api/status');
  const status = await res.json();
  if (status.alreadyVoted) {
    document.getElementById('doneHeading').textContent = 'Already voted';
    document.getElementById('doneText').textContent = 'This device has already submitted a ballot. One vote per device.';
    document.getElementById('doneCard').style.display = 'block';
    return;
  }
  document.getElementById('voteCard').style.display = 'block';
  buildCategoryPickers();
})();

// Reusable type-to-search picker. Replaces a native <select>, since a
// scrolling dropdown of 116+ names is unusable on a phone.
function createPicker(container, { placeholder, excludeNames, onSelect }) {
  container.innerHTML =
    '<input class="picker-input" type="text" placeholder="' + placeholder + '" autocomplete="off">' +
    '<div class="picker-results"></div>';

  function render(query) {
    const input = container.querySelector('.picker-input');
    const results = container.querySelector('.picker-results');
    if (!input || !results) return; // this slot now shows a selected chip, nothing to render
    const q = (query !== undefined ? query : input.value).trim().toLowerCase();
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

  const input = container.querySelector('.picker-input');
  input.addEventListener('focus', () => render());
  input.addEventListener('input', () => render());
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.picker-result');
    if (!btn) return;
    // Defense in depth: re-check against current exclusions even if this
    // button came from a list that was rendered before another category
    // took this name. A stale click gets ignored and the list refreshed,
    // instead of letting the same teacher through twice.
    const excluded = new Set((excludeNames() || []).map(n => n.toLowerCase().trim()));
    if (excluded.has(btn.dataset.name.toLowerCase().trim())) {
      render();
      return;
    }
    onSelect(btn.dataset.name);
  });
  render('');

  return render; // exposed so other pickers can be told to refresh
}

function selectedChip(container, name, onChange) {
  container.innerHTML =
    '<div class="chip"><span>' + name + '</span><button type="button">Change</button></div>';
  container.querySelector('.chip button').addEventListener('click', onChange);
}

function buildCategoryPickers() {
  const form = document.getElementById('voteForm');
  form.innerHTML = CATEGORIES.map(c =>
    '<div class="cat-block"><div class="cat-label">' + c.label + '</div><div id="picker-' + c.id + '"></div></div>'
  ).join('');
  CATEGORIES.forEach(c => setupCategoryPicker(c.id));
}

const categoryRefreshers = {};

function refreshAllCategoryPickers() {
  Object.values(categoryRefreshers).forEach(fn => fn && fn());
}

function setupCategoryPicker(catId) {
  const el = document.getElementById('picker-' + catId);
  const refresh = createPicker(el, {
    placeholder: 'Search a teacher…',
    excludeNames: () => Object.entries(picks).filter(([k, v]) => k !== catId && v).map(([, v]) => v),
    onSelect: (name) => {
      picks[catId] = name;
      selectedChip(el, name, () => {
        delete picks[catId];
        checkReady();
        setupCategoryPicker(catId);
        refreshAllCategoryPickers();
      });
      checkReady();
      refreshAllCategoryPickers();
    }
  });
  categoryRefreshers[catId] = refresh;
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
    body: JSON.stringify({ picks })
  });
  const out = await res.json();
  if (out.ok) {
    document.getElementById('voteCard').style.display = 'none';
    document.getElementById('doneHeading').textContent = 'Ballot submitted';
    document.getElementById('doneText').textContent = 'Thanks. Your votes are recorded.';
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
  body { margin:0; background:#F5F1E6; color:#2A3B2F; font-family: 'Segoe UI', sans-serif; padding:32px; }
  h1 { font-family: Georgia, serif; }
  .sub { color:#6E7A6A; margin-top:-8px; }
  .cat { margin-top:28px; }
  .cat h2 { font-family: Georgia, serif; font-size:20px; margin-bottom:10px; }
  .row { display:flex; align-items:center; gap:12px; margin-bottom:6px; }
  .name { width:180px; font-size:15px; }
  .bar-bg { flex:1; background:#E4DDC8; border-radius:4px; overflow:hidden; height:26px; }
  .bar { height:100%; border-radius:4px; }
  .count { width:30px; text-align:right; font-size:14px; color:#6E7A6A; }
  .gold { background:#C9A24B; } .silver { background:#A9B0A4; } .bronze { background:#A9825C; }
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
    }).join('') || (
      cat.allCounts.length > 0
        ? '<p style="color:#8B9188;">Votes came in, but everyone voted for was already recognized in an earlier category.</p>'
        : '<p style="color:#8B9188;">No votes yet.</p>'
    );
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
  const sid = getSessionId(req, res); // ensures every response carries a device cookie

  if (req.method === "GET" && url.pathname === "/") {
    return send(res, 200, "text/html", votePageHTML());
  }

  if (req.method === "GET" && url.pathname === "/results") {
    return send(res, 200, "text/html", resultsPageHTML());
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    return sendJSON(res, 200, { alreadyVoted: !!data.voted[sid] });
  }

  if (req.method === "GET" && url.pathname === "/api/results") {
    return sendJSON(res, 200, computeResults());
  }

  if (req.method === "POST" && url.pathname === "/api/vote") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { picks } = JSON.parse(body);
        if (data.voted[sid]) {
          return sendJSON(res, 400, { ok: false, error: "This device has already voted." });
        }
        const seen = new Set();
        for (const c of CATEGORIES) {
          const teacher = picks[c.id];
          if (!teacher || !TEACHERS.includes(teacher)) {
            return sendJSON(res, 400, { ok: false, error: "Missing pick for " + c.label + "." });
          }
          if (seen.has(teacher.toLowerCase().trim())) {
            return sendJSON(res, 400, { ok: false, error: "You picked " + teacher + " in more than one category. Choose a different teacher for each." });
          }
          seen.add(teacher.toLowerCase().trim());
        }
        CATEGORIES.forEach((c) => {
          data.votes.push({ sid, category: c.id, teacher: picks[c.id] });
        });
        data.voted[sid] = true;
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
