const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]);
}

async function request(url, options = {}) {
  const response = await fetch(url, { headers:{ "Content-Type":"application/json" }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

function resultList(votes) {
  if (!votes) return "<p class=\"muted\">Die Antworten bleiben verborgen, bis du sie aufdeckst.</p>";
  const max = Math.max(1, ...Object.values(votes));
  return Object.entries(votes).sort((a,b) => b[1]-a[1]).map(([name,count]) => `<div class="result"><strong>${escapeHtml(name)}</strong><div class="bar"><i style="width:${count / max * 100}%"></i></div><span>${count}</span></div>`).join("");
}

function questionQueue(state) {
  return state.questions.map((question, index) => {
    const current = state.started && index === state.currentQuestion;
    const played = state.started && index < state.currentQuestion;
    const label = current ? "Aktuell" : played ? "Gespielt" : "Als Nächstes";
    const locked = state.started && index <= state.currentQuestion;
    return `<div class="queue-item ${current ? "current" : ""}"><span class="queue-number">${index + 1}</span><span class="queue-question">${escapeHtml(question)}<small>${label}</small></span><button class="queue-delete" data-index="${index}" ${locked || state.questions.length === 1 ? "disabled" : ""}>Löschen</button></div>`;
  }).join("");
}

function render(state) {
  $("#status").textContent = state.started ? `Aktiv: Frage ${state.currentQuestion + 1}/${state.totalQuestions} · ${state.players.length} Mitspielende${state.revealed ? " · aufgedeckt" : " · Abstimmung läuft"}` : `${state.players.length} Mitspielende warten auf den Start.`;
  $("#roster-count").textContent = state.players.length;
  $("#roster-players").innerHTML = state.players.length ? state.players.map((name) => `<span class="chip">${escapeHtml(name)}</span>`).join("") : "<span class=\"empty-roster\">Noch niemand im Raum.</span>";
  $("#vote-count").textContent = state.started ? `${state.votesCast} von ${state.players.length} Stimmen eingegangen` : "Noch keine laufende Abstimmung.";
  $("#question-queue").innerHTML = questionQueue(state);
  $("#results").innerHTML = resultList(state.votes);
  $("#start").disabled = state.started;
  $("#reveal").disabled = !state.started || state.revealed;
  $("#next").disabled = !state.revealed || state.currentQuestion >= state.totalQuestions - 1;
  document.querySelectorAll(".queue-delete").forEach((button) => button.onclick = () => updateQuestions("delete", Number(button.dataset.index)));
}

async function action(action) {
  try { render((await request("/api/admin/action", { method:"POST", body:JSON.stringify({ action }) })).state); }
  catch (error) { $("#admin-error").textContent = error.message; }
}

async function updateQuestions(action, index) {
  try {
    const body = { action, index };
    if (action === "add") body.question = $("#new-question").value;
    const { state } = await request("/api/admin/questions", { method:"POST", body:JSON.stringify(body) });
    if (action === "add") $("#new-question").value = "";
    $("#admin-error").textContent = "";
    render(state);
  } catch (error) { $("#admin-error").textContent = error.message; }
}

$("#start").onclick = () => action("start");
$("#reveal").onclick = () => action("reveal");
$("#next").onclick = () => action("next");
$("#reset").onclick = () => { if (confirm("Alle Mitspielenden und Stimmen löschen?")) action("reset"); };
$("#add-question").onsubmit = (event) => { event.preventDefault(); updateQuestions("add"); };

async function refresh() { try { render(await request("/api/admin/state")); } catch {} }
refresh(); setInterval(refresh, 2000);
