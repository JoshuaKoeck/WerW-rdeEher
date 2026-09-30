const $ = (selector) => document.querySelector(selector);
let player = localStorage.getItem("wwe-player") || "";
let selectedVote = null;
let questionIndex = null;

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]);
}

function roster(players) {
  return players.length ? players.map((name) => `<span class="chip">${escapeHtml(name)}</span>`).join("") : "<span class=\"empty-roster\">Noch niemand im Raum.</span>";
}

async function request(url, options = {}) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

function drawResults(votes) {
  const max = Math.max(1, ...Object.values(votes));
  $("#results").innerHTML = `<p class="kicker">Auflösung</p><h2>Die Gruppe hat entschieden</h2>${Object.entries(votes).sort((a,b) => b[1]-a[1]).map(([name,count]) => `<div class="result"><strong>${name}</strong><div class="bar"><i style="width:${count / max * 100}%"></i></div><span>${count}</span></div>`).join("")}`;
}

function render(state) {
  if (player && !state.players.includes(player)) {
    player = "";
    localStorage.removeItem("wwe-player");
    selectedVote = null;
  }
  $("#join-view").classList.toggle("hidden", Boolean(player));
  $("#game-view").classList.toggle("hidden", !player);
  $("#lobby-count").textContent = state.players.length;
  $("#lobby-players").innerHTML = roster(state.players);
  if (!player) return;
  if (questionIndex !== state.currentQuestion) {
    questionIndex = state.currentQuestion;
    selectedVote = null;
    $("#vote-message").textContent = "";
  }
  $("#round-label").textContent = state.started ? `Frage ${state.currentQuestion + 1} von ${state.totalQuestions}` : "Warte auf die Runde";
  $("#player-count").textContent = `${state.players.length} dabei`;
  $("#question").textContent = state.question || "Die Runde wurde noch nicht gestartet.";
  const votingOpen = state.started && !state.revealed;
  $("#voting").classList.toggle("hidden", !votingOpen);
  $("#waiting").classList.toggle("hidden", state.started);
  $("#results").classList.toggle("hidden", !state.revealed);
  if (state.revealed) drawResults(state.votes);
  if (votingOpen) {
    $("#people").innerHTML = state.players.map((name) => `<button class="person ${selectedVote === name ? "selected" : ""}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("");
    document.querySelectorAll(".person").forEach((button) => button.onclick = () => vote(button.dataset.name));
  }
}

async function vote(target) {
  try {
    selectedVote = target;
    const { state } = await request("/api/vote", { method:"POST", body:JSON.stringify({ voter:player, target }) });
    $("#vote-message").textContent = `Deine Stimme für ${target} ist gespeichert.`;
    render(state);
  } catch (error) { $("#vote-message").textContent = error.message; }
}

$("#join-form").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const { name, state } = await request("/api/join", { method:"POST", body:JSON.stringify({ name:$("#name").value }) });
    player = name; localStorage.setItem("wwe-player", name); render(state);
  } catch (error) { $("#join-error").textContent = error.message; }
};

async function refresh() { try { render(await request("/api/state")); } catch {} }
refresh(); setInterval(refresh, 2000);
