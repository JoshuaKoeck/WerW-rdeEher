const http = require("http");
const fs = require("fs");
const path = require("path");
const pocketbase = require("./pocketbase");

const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const stateFile = path.join(dataDir, "game.json");
const defaultQuestions = [
  "Wer würde eher aus Versehen berühmt werden?",
  "Wer würde eher einen Monat ohne Handy überleben?",
  "Wer würde eher einen Roadtrip spontan planen?"
];

let state = loadState();

fs.mkdirSync(dataDir, { recursive: true });

async function importPlayers() {
  const records = await pocketbase.list("players");
  for (const name of state.players) {
    if (records.some((record) => record.name.toLocaleLowerCase("de") === name.toLocaleLowerCase("de"))) continue;
    await pocketbase.add("players", { name, normalized_name: name.toLocaleLowerCase("de") });
  }
}

async function clearPlayers() {
  const records = await pocketbase.list("players");
  for (const record of records) await pocketbase.remove("players", record.id);
}

async function syncQuestions() {
  const records = await pocketbase.list("questions");
  for (const record of records) await pocketbase.remove("questions", record.id);
  for (const [index, text] of state.questions.entries()) {
    await pocketbase.add("questions", { text, position: index + 1 });
  }
}

async function initialize() {
  await pocketbase.ensureCollections();
  const [players, questions] = await Promise.all([
    pocketbase.list("players"),
    pocketbase.list("questions", "+position")
  ]);

  // Import the existing file-backed data once, then use PocketBase as the source
  // of truth for participants and the question queue.
  if (!players.length && state.players.length) await importPlayers();
  else state.players = players.map((record) => record.name);
  if (!questions.length && state.questions.length) await syncQuestions();
  else if (questions.length) state.questions = questions.map((record) => record.text);
  saveState();
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    return { started: false, currentQuestion: 0, revealed: false, players: [], questions: defaultQuestions, votes: {} };
  }
}

function saveState() {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function publicState() {
  const question = state.questions[state.currentQuestion] || null;
  return {
    started: state.started,
    currentQuestion: state.currentQuestion,
    totalQuestions: state.questions.length,
    question,
    players: state.players,
    revealed: state.revealed,
    votes: state.revealed && question ? tallyVotes(state.currentQuestion) : null
  };
}

function adminState() {
  return {
    ...publicState(),
    questions: state.questions,
    votesCast: Object.keys(state.votes[state.currentQuestion] || {}).length
  };
}

function tallyVotes(questionIndex) {
  const tally = Object.fromEntries(state.players.map((player) => [player, 0]));
  Object.values(state.votes[questionIndex] || {}).forEach((target) => {
    if (target in tally) tally[target] += 1;
  });
  return tally;
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Ungültige Daten")); }
    });
  });
}

function cleanText(value, maxLength = 80) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function serveFile(res, file) {
  const filePath = path.join(publicDir, file);
  const type = file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "application/javascript" : "text/html";
  fs.readFile(filePath, (error, content) => {
    if (error) { res.writeHead(404); return res.end("Nicht gefunden"); }
    res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "GET" && url.pathname === "/") return serveFile(res, "index.html");
  if (req.method === "GET" && url.pathname === "/admin") return serveFile(res, "admin.html");
  if (req.method === "GET" && url.pathname === "/app.css") return serveFile(res, "app.css");
  if (req.method === "GET" && url.pathname === "/game.js") return serveFile(res, "game.js");
  if (req.method === "GET" && url.pathname === "/admin.js") return serveFile(res, "admin.js");
  if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, publicState());
  if (req.method === "GET" && url.pathname === "/api/admin/state") return json(res, 200, adminState());

  try {
    const body = await readBody(req);
    if (req.method === "POST" && url.pathname === "/api/join") {
      const name = cleanText(body.name, 30);
      if (!name) return json(res, 400, { error: "Bitte gib einen Namen ein." });
      if (state.started) return json(res, 400, { error: "Die Runde läuft bereits. Warte auf die nächste Runde." });
      const existingPlayer = state.players.find((player) => player.toLocaleLowerCase("de") === name.toLocaleLowerCase("de"));
      if (existingPlayer && existingPlayer !== name) return json(res, 400, { error: "Dieser Name ist bereits im Raum." });
      if (!existingPlayer) {
        await pocketbase.add("players", { name, normalized_name: name.toLocaleLowerCase("de") });
        state.players.push(name);
      }
      saveState();
      return json(res, 200, { name: existingPlayer || name, state: publicState() });
    }
    if (req.method === "POST" && url.pathname === "/api/vote") {
      const voter = cleanText(body.voter, 30);
      const target = cleanText(body.target, 30);
      if (!state.started || state.revealed) return json(res, 400, { error: "Die Abstimmung ist gerade nicht geöffnet." });
      if (!state.players.includes(voter) || !state.players.includes(target)) return json(res, 400, { error: "Spieler nicht gefunden." });
      state.votes[state.currentQuestion] ||= {};
      state.votes[state.currentQuestion][voter] = target;
      saveState();
      return json(res, 200, { state: publicState() });
    }
    if (req.method === "POST" && url.pathname === "/api/admin/questions") {
      if (body.action === "add") {
        const question = cleanText(body.question, 180);
        if (!question) return json(res, 400, { error: "Bitte gib eine Frage ein." });
        state.questions.push(question);
      }
      if (body.action === "delete") {
        const index = Number(body.index);
        if (!Number.isInteger(index) || index < 0 || index >= state.questions.length) return json(res, 400, { error: "Frage nicht gefunden." });
        if (state.started && index <= state.currentQuestion) return json(res, 400, { error: "Die aktuelle oder eine bereits gespielte Frage kann nicht gelöscht werden." });
        if (state.questions.length === 1) return json(res, 400, { error: "Mindestens eine Frage muss in der Runde bleiben." });
        state.questions.splice(index, 1);
      }
      await syncQuestions();
      saveState();
      return json(res, 200, { state: adminState() });
    }
    if (req.method === "POST" && url.pathname === "/api/admin/action") {
      if (body.action === "start") {
        if (state.players.length < 2) return json(res, 400, { error: "Warte, bis mindestens zwei Personen im Raum sind." });
        state.started = true; state.currentQuestion = 0; state.revealed = false; state.votes = {};
      }
      if (body.action === "reveal" && state.started) state.revealed = true;
      if (body.action === "next" && state.revealed && state.currentQuestion < state.questions.length - 1) { state.currentQuestion += 1; state.revealed = false; }
      if (body.action === "reset") state = { started: false, currentQuestion: 0, revealed: false, players: [], questions: state.questions, votes: {} };
      if (body.action === "reset") await clearPlayers();
      saveState();
      return json(res, 200, { state: adminState() });
    }
    return json(res, 404, { error: "Nicht gefunden." });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
});

initialize().then(() => {
  server.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("Wer würde eher läuft auf Port 3000"));
}).catch((error) => {
  console.error(`PocketBase startup failed: ${error.message}`);
  process.exit(1);
});
