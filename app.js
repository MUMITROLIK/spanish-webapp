/* =========================
   Telegram + Storage helpers
========================= */

// ✅ основной ключ (НЕ МЕНЯЙ, иначе “пропадёт прогресс”)
const STORAGE_KEY = "spanish_trainer_progress_v1";

// ✅ если раньше был другой ключ — добавь сюда (миграция)
const LEGACY_KEYS = [
  "duo_like_progress_v1",
  "spanish_trainer_progress",
];

function tg() {
  return window.Telegram?.WebApp;
}
function hasCloudStorage() {
  return !!tg()?.CloudStorage;
}

function cloudGet(key) {
  return new Promise((resolve) => {
    try {
      tg().CloudStorage.getItem(key, (err, value) => {
        if (err) return resolve(null);
        resolve(value ?? null);
      });
    } catch (_) {
      resolve(null);
    }
  });
}

function cloudSet(key, value) {
  return new Promise((resolve) => {
    try {
      tg().CloudStorage.setItem(key, value, () => resolve());
    } catch (_) {
      resolve();
    }
  });
}

function safeParse(json) {
  try { return JSON.parse(json); } catch { return null; }
}

/* =========================
   Dates + Progress model
========================= */
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultProgress() {
  return {
    version: 1,
    xpTotal: 0,
    streak: 0,
    answeredToday: 0,
    correctToday: 0,
    wordsLearned: 0,
    completed: {},
    vocab: {},
    dayKey: todayKey(),
    lastActive: todayKey(),
    lastLessonId: "m1r1",
  };
}

function ensureDay(prog) {
  const t = todayKey();
  if (prog.dayKey !== t) {
    prog.dayKey = t;
    prog.answeredToday = 0;
    prog.correctToday = 0;
  }
}

/* =========================
   ✅ Robust load/save (Cloud + Local mirror)
========================= */
function localGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function localSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

async function loadProgress() {
  if (hasCloudStorage()) {
    const cloudRaw = await cloudGet(STORAGE_KEY);
    const cloudObj = cloudRaw ? safeParse(cloudRaw) : null;
    if (cloudObj) return cloudObj;
  }

  const localRaw = localGet(STORAGE_KEY);
  const localObj = localRaw ? safeParse(localRaw) : null;
  if (localObj) return localObj;

  for (const k of LEGACY_KEYS) {
    if (hasCloudStorage()) {
      const raw = await cloudGet(k);
      const obj = raw ? safeParse(raw) : null;
      if (obj) return obj;
    }
    const raw2 = localGet(k);
    const obj2 = raw2 ? safeParse(raw2) : null;
    if (obj2) return obj2;
  }

  return defaultProgress();
}

async function saveProgress(prog) {
  const raw = JSON.stringify(prog);
  localSet(STORAGE_KEY, raw);
  if (hasCloudStorage()) await cloudSet(STORAGE_KEY, raw);
}

/* =========================
   Lessons + Tasks (логично для испанского)
   UI русский, ответы/слова — испанский
========================= */
const LESSONS = [
  { id: "m1r1", title: "Урок 1: База", sub: "3 задания · быстро · без лимитов", xp: 30 },
];

const TASKS = [
  {
    label: "ПЕРЕВОД",
    title: "Собери перевод на испанский",
    prompt: "Франция и Мексика.",
    say: "Francia y México.",
    words: ["Francia", "y", "México"],
    correct: ["Francia", "y", "México"],
    hidePromptInAudio: false,
  },
  {
    label: "ЗАКОНЧИ ФРАЗУ",
    title: "Выбери правильное слово",
    prompt: "Sí, yo soy de __.",
    say: "Sí, yo soy de Francia.",
    words: ["Francia", "México", "taco", "gracias", "chao"],
    correct: ["Francia"],
    hidePromptInAudio: false,
  },
  {
    label: "АУДИО",
    title: "Что вы услышали?",
    prompt: "Нажми 🔊 и собери фразу 👂",
    say: "Yo soy Ana, encantada.",
    words: ["Yo", "soy", "Ana", "encantada", "helado", "tú"],
    correct: ["Yo", "soy", "Ana", "encantada"],
    hidePromptInAudio: true,
  }
];

/* =========================
   UI helpers
========================= */
const el = (id) => document.getElementById(id);

const screens = {
  home: el("screenHome"),
  path: el("screenPath"),
  practice: el("screenPractice"),
  stats: el("screenStats"),
};

function setActiveScreen(name) {
  Object.entries(screens).forEach(([k, node]) => {
    node.classList.toggle("isActive", k === name);
  });

  document.querySelectorAll(".tab").forEach(btn => {
    btn.classList.toggle("isActive", btn.dataset.go === name);
  });
}

function animateTaskSwap(fnRender) {
  const card = el("taskCard");
  card.classList.add("taskSwapOut");
  setTimeout(() => {
    fnRender();
    requestAnimationFrame(() => {
      card.classList.remove("taskSwapOut");
    });
  }, 180);
}

/* =========================
   Modal
========================= */
const modal = el("modal");
const modalTitle = el("modalTitle");
const modalBody = el("modalBody");
const modalOk = el("modalOk");
const modalCancel = el("modalCancel");
const modalX = el("modalX");

let modalResolver = null;

function openModal({ title, body, okText = "Ок", cancelText = "Отмена", showCancel = true }) {
  modalTitle.textContent = title || "Сообщение";
  modalBody.textContent = body || "";
  modalOk.textContent = okText;
  modalCancel.textContent = cancelText;
  modalCancel.style.display = showCancel ? "" : "none";

  document.body.classList.add("modalOpen");
  modal.classList.remove("hidden");

  return new Promise((resolve) => {
    modalResolver = resolve;
  });
}

function closeModal(result) {
  modal.classList.add("hidden");
  document.body.classList.remove("modalOpen");
  if (modalResolver) {
    modalResolver(result);
    modalResolver = null;
  }
}

modalOk.addEventListener("click", () => closeModal(true));
modalCancel.addEventListener("click", () => closeModal(false));
modalX.addEventListener("click", () => closeModal(false));
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal(false);
});

/* =========================
   Result sheet (Duolingo-like)
========================= */
const resultSheet = el("resultSheet");
const resultTitle = el("resultTitle");
const resultSub = el("resultSub");
const btnResultNext = el("btnResultNext");
const confettiBox = el("confetti");

let lastAnswerWasCorrect = false;

function clearConfetti(){
  confettiBox.innerHTML = "";
}
function fireConfetti(){
  clearConfetti();
  const pieces = 18;
  for (let i = 0; i < pieces; i++) {
    const p = document.createElement("div");
    p.className = "confettiPiece";
    p.style.left = Math.random() * 100 + "%";
    p.style.background = `hsl(${Math.floor(Math.random()*360)}, 90%, 60%)`;
    p.style.animationDelay = (Math.random() * 0.10) + "s";
    confettiBox.appendChild(p);
  }
  setTimeout(clearConfetti, 1100);
}

function showResultSheet({ ok, title, sub }) {
  resultSheet.classList.toggle("good", ok);
  resultSheet.classList.toggle("bad", !ok);

  resultTitle.textContent = title;
  resultSub.textContent = sub;

  // ✅ чтобы “ПРОВЕРИТЬ” не торчала под шторкой
  el("btnCheck").style.visibility = "hidden";

  resultSheet.classList.remove("hidden");
  if (ok) fireConfetti();
}

function hideResultSheet() {
  resultSheet.classList.add("hidden");
  el("btnCheck").style.visibility = "visible";
}

/* =========================
   TTS (speechSynthesis)
========================= */
let cachedVoices = [];
let voicesReady = false;

function refreshVoices() {
  try {
    cachedVoices = window.speechSynthesis?.getVoices?.() || [];
    voicesReady = cachedVoices.length > 0;
  } catch {
    cachedVoices = [];
    voicesReady = false;
  }
}

if ("speechSynthesis" in window) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = () => refreshVoices();
}

function pickSpanishVoice() {
  if (!cachedVoices.length) return null;

  const prefer = cachedVoices.find(v => /es(-|_)?(ES|MX|US)?/i.test(v.lang) && /Google|Microsoft|Siri|Natural/i.test(v.name));
  if (prefer) return prefer;

  const anyEs = cachedVoices.find(v => /^es/i.test(v.lang));
  if (anyEs) return anyEs;

  return cachedVoices[0] || null;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;

  // ✅ важно: Telegram иногда “накладывает” фразы, поэтому cancel
  try { window.speechSynthesis.cancel(); } catch {}

  const u = new SpeechSynthesisUtterance(text);
  const v = pickSpanishVoice();
  if (v) u.voice = v;

  // легкая настройка (можно подкрутить)
  u.rate = 0.95;
  u.pitch = 1.0;

  window.speechSynthesis.speak(u);
}

/* =========================
   Practice logic
========================= */
let progress = defaultProgress();

let taskIndex = 0;
let currentTask = TASKS[0];
let picked = [];
const DAILY_GOAL_XP = 50;

function calcAcc() {
  return progress.answeredToday
    ? Math.round((progress.correctToday / progress.answeredToday) * 100)
    : 0;
}

function renderTop() {
  el("xpTotal").textContent = String(progress.xpTotal);
  el("streak").textContent = String(progress.streak);

  // “энергия” просто как декор
  el("energy").textContent = String(25);
  el("homeEnergy").textContent = String(25);

  el("homeStreak").textContent = String(progress.streak);

  el("todayXp").textContent = String(progress.correctToday * 10);
  el("acc").textContent = String(calcAcc());

  el("sXp").textContent = String(progress.xpTotal);
  el("sStreak").textContent = String(progress.streak);
  el("sAnswered").textContent = String(progress.answeredToday);
  el("sAcc").textContent = `${calcAcc()}%`;
  el("sWords").textContent = String(progress.wordsLearned);

  // progress bar = цель дня
  const todayXp = progress.correctToday * 10;
  const fill = Math.max(0, Math.min(100, Math.round((todayXp / DAILY_GOAL_XP) * 100)));
  el("barFill").style.width = `${fill}%`;
}

function renderPath() {
  const list = el("pathList");
  list.innerHTML = "";

  LESSONS.forEach(l => {
    const div = document.createElement("div");
    div.className = "pathItem";
    div.innerHTML = `
      <div>
        <div class="pathName">${l.title}</div>
        <div class="pathSub">${l.sub}</div>
      </div>
      <button class="btnPrimary" style="padding:12px 18px;">Начать</button>
    `;
    div.addEventListener("click", async () => {
      const ok = await openModal({
        title: l.title,
        body: `Начать урок сейчас?`,
        okText: "НАЧАТЬ",
        cancelText: "Отмена"
      });
      if (!ok) return;

      progress.lastLessonId = l.id;
      await saveProgress(progress);

      startPractice();
    });
    list.appendChild(div);
  });
}

function setCheckEnabled() {
  el("btnCheck").disabled = picked.length === 0;
}

function renderAnswer() {
  const area = el("answerArea");
  area.innerHTML = "";

  if (picked.length === 0) {
    area.textContent = "Нажимай на слова ниже 👇";
    return;
  }

  picked.forEach((w, idx) => {
    const t = document.createElement("div");
    t.className = "answerToken";
    t.textContent = w;
    t.addEventListener("click", () => {
      picked.splice(idx, 1);
      renderTaskRebuildChips();
    });
    area.appendChild(t);
  });
}

function renderTaskRebuildChips(){
  const chips = el("chips");
  chips.innerHTML = "";

  currentTask.words.forEach(w => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = w;

    // если слово уже выбрано столько же раз — дизейблим
    const usedCount = picked.filter(x => x === w).length;
    if (usedCount > 0) {
      b.disabled = true;
      b.style.opacity = ".45";
    }

    b.addEventListener("click", () => {
      picked.push(w);
      renderTaskRebuildChips();
    });

    chips.appendChild(b);
  });

  renderAnswer();
  setCheckEnabled();
}

function renderTask() {
  hideResultSheet();

  currentTask = TASKS[taskIndex];
  picked = [];

  el("taskLabel").textContent = currentTask.label;
  el("taskTitle").textContent = currentTask.title;
  el("promptText").textContent = currentTask.prompt;

  el("feedback").textContent = "";
  el("btnCheck").disabled = true;

  renderTaskRebuildChips();
}

function applyCorrectReward() {
  progress.xpTotal += 10;
  progress.correctToday += 1;
  progress.wordsLearned += 1;

  const t = todayKey();
  const y = yesterdayKey();

  // streak: если вчера был активен → +1, иначе начинаем заново
  if (progress.lastActive === y) progress.streak = (progress.streak || 0) + 1;
  else if (progress.lastActive !== t) progress.streak = 1;

  progress.lastActive = t;
}

async function checkAnswer() {
  ensureDay(progress);
  progress.answeredToday += 1;

  const ok = JSON.stringify(picked) === JSON.stringify(currentTask.correct);
  lastAnswerWasCorrect = ok;

  // ✅ блокируем кнопку проверки до “ДАЛЕЕ”
  el("btnCheck").disabled = true;

  if (ok) {
    applyCorrectReward();
    showResultSheet({
      ok: true,
      title: "Потрясающе! ✅",
      sub: "+10 XP"
    });
  } else {
    showResultSheet({
      ok: false,
      title: "Почти 😅",
      sub: "Попробуй ещё раз"
    });
  }

  renderTop();
  await saveProgress(progress);
}

async function onResultNext() {
  hideResultSheet();

  if (!lastAnswerWasCorrect) {
    // остаёмся на текущем задании
    setCheckEnabled();
    return;
  }

  // ✅ правильный ответ → следующий шаг
  taskIndex += 1;

  // конец урока
  if (taskIndex >= TASKS.length) {
    taskIndex = 0;

    const goPath = await openModal({
      title: "Урок завершён 🎉",
      body: "Перейти в «Путь» или на «Главную»?",
      okText: "В Путь",
      cancelText: "На главную",
      showCancel: true
    });

    setActiveScreen(goPath ? "path" : "home");
    return;
  }

  animateTaskSwap(() => renderTask());
}

function startPractice() {
  taskIndex = 0;
  setActiveScreen("practice");
  animateTaskSwap(() => renderTask());
}

/* =========================
   App init
========================= */
async function init() {
  const TG = tg();
  if (TG) {
    TG.ready();
    TG.expand();
  }

  progress = await loadProgress();
  ensureDay(progress);
  await saveProgress(progress);

  renderTop();
  renderPath();

  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => setActiveScreen(btn.dataset.go));
  });

  el("btnContinue").addEventListener("click", startPractice);
  el("btnCheck").addEventListener("click", checkAnswer);

  el("btnAudio").addEventListener("click", () => {
    const text = currentTask?.say || "";
    if (!text) return;

    // если voices ещё не подгрузились — подождём чуть-чуть
    if (!voicesReady) refreshVoices();

    speak(text);
  });

  btnResultNext.addEventListener("click", onResultNext);

  el("btnExport").addEventListener("click", async () => {
    const raw = JSON.stringify(progress, null, 2);
    await openModal({ title: "Экспорт", body: raw, showCancel: false, okText: "Закрыть" });
  });

  el("btnImport").addEventListener("click", async () => {
    await openModal({
      title: "Импорт",
      body: "Дальше сделаем нормальное окно импорта (textarea + кнопка).",
      showCancel: false,
      okText: "Ок"
    });
  });

  el("btnSync").addEventListener("click", async () => {
    await saveProgress(progress);
    await openModal({ title: "Синк", body: "Сохранил в CloudStorage + localStorage ✅", showCancel: false });
  });

  el("btnReset").addEventListener("click", async () => {
    const ok = await openModal({
      title: "Сброс",
      body: "Точно сбросить прогресс? Это действие нельзя отменить.",
      okText: "СБРОСИТЬ",
      cancelText: "Отмена"
    });
    if (!ok) return;

    progress = defaultProgress();
    await saveProgress(progress);
    renderTop();
    await openModal({ title: "Готово", body: "Прогресс сброшен ✅", showCancel: false });
  });

  el("btnExit").addEventListener("click", () => {
    const TG = tg();
    if (TG) TG.close();
    else setActiveScreen("home");
  });

  setActiveScreen("home");
}

init();
