const tg = window.Telegram.WebApp;
tg.expand();

const WORDS = [
  { id: "hola", ru: "привет", es: "hola" },
  { id: "gracias", ru: "спасибо", es: "gracias" },
  { id: "adios", ru: "пока", es: "adiós" },
  { id: "por_favor", ru: "пожалуйста", es: "por favor" },
];

const promptEl = document.getElementById("prompt");
const optionsEl = document.getElementById("options");
const hintEl = document.getElementById("hint");
const nextBtn = document.getElementById("nextBtn");

let current = null;
let chosen = null;

function shuffle(arr) {
  return arr.slice().sort(() => Math.random() - 0.5);
}

function renderQuestion() {
  chosen = null;
  nextBtn.disabled = true;
  hintEl.textContent = "";

  current = WORDS[Math.floor(Math.random() * WORDS.length)];

  promptEl.innerHTML = `Переведи на 🇪🇸 испанский:<br><b>${current.ru}</b>`;

  const correct = current.es;
  const wrong = shuffle(WORDS.filter(w => w.id !== current.id).map(w => w.es)).slice(0, 3);
  const options = shuffle([correct, ...wrong]);

  optionsEl.innerHTML = "";
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "opt";
    btn.textContent = opt;
    btn.onclick = () => selectOption(opt, correct);
    optionsEl.appendChild(btn);
  });
}

function selectOption(opt, correct) {
  chosen = opt;
  [...document.querySelectorAll(".opt")].forEach(b => b.classList.remove("active"));
  const btns = [...document.querySelectorAll(".opt")];
  btns.find(b => b.textContent === opt)?.classList.add("active");

  const ok = (opt === correct);
  hintEl.textContent = ok ? "✅ Верно!" : `❌ Неверно. Правильно: ${correct}`;
  nextBtn.disabled = false;

  // Отправим боту данные (в чат придет web_app_data)
  tg.sendData(JSON.stringify({
    type: "answer",
    wordId: current.id,
    chosen: opt,
    correct: ok
  }));
}

nextBtn.addEventListener("click", renderQuestion);

renderQuestion();
