/* =========================
   Telegram + Storage helpers
========================= */

// ✅ основной ключ (НЕ МЕНЯЙ, иначе “пропадёт прогресс”)
const STORAGE_KEY = "spanish_trainer_progress_v1";

// ✅ если раньше был другой ключ — добавь сюда (миграция)
const LEGACY_KEYS = [
  "duo_like_progress_v1",
  "spanish_trainer_progress", // если вдруг было
];

function tg() {
  return window.Telegram?.WebApp;
}
function hasCloudStorage() {
  return !!tg()?.CloudStorage;
}
let _voicesReady = false;
let _bestEsVoice = null;
function $(id) { return document.getElementById(id); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function on(id, event, handler) {
  const el = $(id);
  if (!el) { console.warn(`[ui] missing #${id}`); return null; }
  el.addEventListener(event, handler);
  return el;
}

function showToast(text, ms = 2200) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = text;
  t.style.display = "block";
  clearTimeout(showToast._tm);
  showToast._tm = setTimeout(() => (t.style.display = "none"), ms);
}

let currentScreen = "home";

function go(screen) {
  currentScreen = screen;

  const screens = {
    home: $("screenHome"),
    path: $("screenPath"),
    practice: $("screenPractice"),
    stats: $("screenStats"),
  };

  Object.values(screens).forEach((sec) => sec && sec.classList.remove("isActive"));
  screens[screen] && screens[screen].classList.add("isActive");

  $all(".tab").forEach((b) => b.classList.toggle("isActive", b.dataset.go === screen));

  if (screen === "path") renderPathSpiral();
  if (screen === "stats") renderStats?.();
}

function initTabs() {
  $all(".tab").forEach((btn) => btn.addEventListener("click", () => go(btn.dataset.go)));
}

function initExit() {
  on("btnExit", "click", () => {
    try {
      if (window.Telegram?.WebApp) { window.Telegram.WebApp.close(); return; }
    } catch (e) {}
    go("home");
  });
}

function initHomeButtons() {
  on("btnContinue", "click", () => go("path"));

  on("btnExport", "click", () => showToast("Экспорт пока заглушка"));
  on("btnImport", "click", () => showToast("Импорт пока заглушка"));
  on("btnSync", "click", () => showToast("Синк в бота пока заглушка"));
}



function _scoreVoice(v) {
  const name = (v.name || "").toLowerCase();
  const lang = (v.lang || "").toLowerCase();

  let s = 0;

  // язык
  if (lang === "es-es") s += 50;
  if (lang.startsWith("es")) s += 30;

  // качество (часто лучше)
  if (name.includes("neural")) s += 25;
  if (name.includes("natural")) s += 20;
  if (name.includes("premium")) s += 15;

  // движки
  if (name.includes("google")) s += 18;
  if (name.includes("microsoft")) s += 16;

  // online голоса иногда лучше
  if (v.localService === false) s += 8;

  return s;
}

function _pickBestEsVoice() {
  const voices = window.speechSynthesis.getVoices() || [];
  const candidates = voices.filter(v => (v.lang || "").toLowerCase().startsWith("es"));
  candidates.sort((a, b) => _scoreVoice(b) - _scoreVoice(a));
  return candidates[0] || null;
}

function _primeVoicesOnce() {
  if (_voicesReady) return;
  _voicesReady = true;
  _bestEsVoice = _pickBestEsVoice();
}

window.speechSynthesis.onvoiceschanged = () => {
  _bestEsVoice = _pickBestEsVoice();
};

function speakES(text) {
  if (!text) return;

  _primeVoicesOnce();

  // важно: iOS/браузеры любят вызов из клика
  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "es-ES";

  // более “человечный” темп
  u.rate = 0.95;
  u.pitch = 1.0;
  u.volume = 1.0;

  // лучший доступный испанский голос
  u.voice = _bestEsVoice || _pickBestEsVoice() || null;

  window.speechSynthesis.speak(u);
}



function cloudGet(key) {
  return new Promise((resolve) => {
    try{
      tg().CloudStorage.getItem(key, (err, value) => {
        if (err) return resolve(null);
        resolve(value ?? null);
      });
    }catch(_){
      resolve(null);
    }
  });
}

function cloudSet(key, value) {
  return new Promise((resolve) => {
    try{
      tg().CloudStorage.setItem(key, value, () => resolve());
    }catch(_){
      resolve();
    }
  });
}

function safeParse(json) {
  try { return JSON.parse(json); } catch { return null; }
}

/* =========================
   Progress model
========================= */
function todayKey() {
  const d = new Date();
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
    lastActive: todayKey()
  };
}

function ensureDay(prog) {
  const t = todayKey();
  if (prog.dayKey !== t) {
    // новый день
    prog.dayKey = t;
    prog.answeredToday = 0;
    prog.correctToday = 0;
  }
}

/* =========================
   ✅ Robust load/save (Cloud + Local mirror)
   - НЕ перетираем нулём при старте
   - миграция со старых ключей
========================= */
function localGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function localSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

async function loadProgress() {
  // 1) пробуем CloudStorage
  if (hasCloudStorage()) {
    const cloudRaw = await cloudGet(STORAGE_KEY);
    const cloudObj = cloudRaw ? safeParse(cloudRaw) : null;
    if (cloudObj) return cloudObj;
  }

  // 2) пробуем localStorage
  const localRaw = localGet(STORAGE_KEY);
  const localObj = localRaw ? safeParse(localRaw) : null;
  if (localObj) return localObj;

  // 3) миграция со старых ключей (сначала Cloud, потом Local)
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

  // 4) ничего нет → дефолт
  return defaultProgress();
}

async function saveProgress(prog) {
  const raw = JSON.stringify(prog);

  // ✅ пишем в local всегда (быстро/надёжно)
  localSet(STORAGE_KEY, raw);

  // ✅ и в Cloud (для синка между устройствами)
  if (hasCloudStorage()) {
    await cloudSet(STORAGE_KEY, raw);
  }
}

/* =========================
   Simple content (lessons)
========================= */
const LESSONS = [
  { id: "m1r1", title: "Модуль 1 · Раздел 1", sub: "Заказывайте в кафе", xp: 20 },
  { id: "m1r2", title: "Модуль 1 · Раздел 2", sub: "Приветствия", xp: 20 },
  { id: "m1r3", title: "Модуль 1 · Раздел 3", sub: "Происхождение", xp: 20 },
];

const TASKS = [
  {
    label: "НОВОЕ СЛОВО",
    title: "Переведи предложение",
    prompt: "Francia y México.",
    words: ["Франция", "и", "Мексика"]
  },
  {
    label: "ЗАКОНЧИТЕ ПРЕДЛОЖЕНИЕ",
    title: "Собери фразу",
    prompt: "Sí, yo soy de __.",
    words: ["Франция", "Мексика", "taco", "gracias", "chao"],
    correct: ["Франция"]
  },
  {
    label: "АУДИО",
    title: "Что вы услышали?",
    prompt: "Yo soy Ana, encantada.",
    words: ["Yo", "soy", "Ana", "encantada", "helado", "tú"],
    correct: ["Yo","soy","Ana","encantada"]
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
function getActiveScreenName() {
  for (const [name, node] of Object.entries(screens)) {
    if (node?.classList.contains("isActive")) return name;
  }
  return "home";
}

function isRealTelegramWebApp() {
  const TG = tg();
  return !!(TG && typeof TG.initData === "string" && TG.initData.length > 0);
}

function exitOrBack() {
  const active = getActiveScreenName();

  // если не на главной — крестик = "назад на главную"
  if (active !== "home") {
    setActiveScreen("home");
    return;
  }

  // если на главной — закрываем только внутри реального Telegram WebApp
  if (isRealTelegramWebApp()) tg().close();
}



let activeScreen = "home";

function setActiveScreen(name) {
  activeScreen = name;

  Object.entries(screens).forEach(([k, node]) => {
    if (!node) return;
    node.classList.toggle("isActive", k === name);
  });

  document.querySelectorAll(".tab").forEach(btn => {
    btn.classList.toggle("isActive", btn.dataset.go === name);
  });

  if (name === "path") renderPathSpiral();
  if (name === "stats") renderTop(); // чтобы цифры точно обновлялись
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
   Modal (clickable fix)
========================= */
const modal = el("modal");
const modalTitle = el("modalTitle");
const modalBody = el("modalBody");
const modalOk = el("modalOk");
const modalCancel = el("modalCancel");
const modalX = el("modalX");
// RESULT SHEET refs
const resultSheet = el("resultSheet");
const resultTitle = el("resultTitle");
const resultSub = el("resultSub");
const btnNext = el("btnNext");
const confettiBox = el("confetti");

let lastAnswerWasCorrect = false;


let modalResolver = null;
function clearConfetti(){
  confettiBox.innerHTML = "";
}

function fireConfetti(){
  clearConfetti();
  const pieces = 18; // можно 30 если хочешь плотнее

  for (let i = 0; i < pieces; i++) {
    const p = document.createElement("div");
    p.className = "confettiPiece";
    p.style.left = Math.random() * 100 + "%";
    p.style.transform = `translateY(0) rotate(${Math.random()*180}deg)`;
    p.style.background = `hsl(${Math.floor(Math.random()*360)}, 90%, 60%)`;
    p.style.animationDelay = (Math.random() * 0.10) + "s";
    confettiBox.appendChild(p);
  }

  setTimeout(clearConfetti, 1100);
}

function showResultSheet({ ok, title, sub }) {
  const btn = el("btnResultNext");

  resultSheet.classList.toggle("good", ok);
  resultSheet.classList.toggle("bad", !ok);

  resultTitle.textContent = title;
  resultSub.textContent = sub;

  // кнопка меняется как в дуо:
  // если ошибка — "ПОНЯЛ", если верно — "ДАЛЕЕ"
  if (btn) btn.textContent = ok ? "ДАЛЕЕ" : "ПОНЯЛ";

  resultSheet.classList.remove("hidden");

  if (ok) fireConfetti();
}


function hideResultSheet() {
  resultSheet.classList.add("hidden");
}


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
   Practice logic
========================= */
let progress = defaultProgress();

let taskIndex = 0;
let currentTask = TASKS[0];
let picked = [];

function renderTop() {
  el("xpTotal").textContent = String(progress.xpTotal);
  el("streak").textContent = String(progress.streak);
  el("energy").textContent = String(25); // просто визуально

  el("homeStreak").textContent = String(progress.streak);
  el("homeEnergy").textContent = String(25);

  el("todayXp").textContent = String(progress.correctToday * 10); // условно
  const acc = progress.answeredToday ? Math.round((progress.correctToday / progress.answeredToday) * 100) : 0;
  el("acc").textContent = String(acc);

  el("sXp").textContent = String(progress.xpTotal);
  el("sStreak").textContent = String(progress.streak);
  el("sAnswered").textContent = String(progress.answeredToday);
  el("sAcc").textContent = `${acc}%`;
  el("sWords").textContent = String(progress.wordsLearned);

  // progress bar
  const fill = Math.min(100, (progress.correctToday * 20));
  el("barFill").style.width = `${fill}%`;
}
function exitOrBack() {
  // если мы не на главной — крестик = “назад на главную”
  if (activeScreen !== "home") {
    setActiveScreen("home");
    return;
  }

  // если уже на главной — в телеге закрываем, в браузере просто ничего
  const TG = tg();
  if (TG) TG.close();
}


function renderPath() {
  const list = el("pathList");
  list.innerHTML = "";

  LESSONS.forEach((l, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pathItem pathTile";
    btn.innerHTML = `
      <div class="pathTileTop">
        <div class="pathTileIcon">${["🧩","🧠","🗣️","☕","🧭","⭐"][idx % 6]}</div>
        <div class="pathTileXp">+${l.xp} XP</div>
      </div>
      <div class="pathName">${l.title}</div>
      <div class="pathSub">${l.sub}</div>
    `;

    btn.addEventListener("click", () => {
      // без модалки — сразу старт
      startPractice();
    });

    list.appendChild(btn);
  });
}

let ttsVoice = null;

function pickSpanishVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  ttsVoice =
    voices.find(v => /^es(-|_)/i.test(v.lang) && /Google|Neural|Natural/i.test(v.name)) ||
    voices.find(v => /^es(-|_)/i.test(v.lang)) ||
    null;
}

function speakEs(text) {
  if (!("speechSynthesis" in window)) return showToast("TTS недоступен");
  if (!text || !text.trim()) return;

  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (ttsVoice) u.voice = ttsVoice;
  u.lang = ttsVoice?.lang || "es-ES";
  u.rate = 0.95;
  u.pitch = 1.0;
  u.volume = 1.0;
  window.speechSynthesis.speak(u);
}

function initTTS() {
  pickSpanishVoice();
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = pickSpanishVoice;

  on("btnAudio", "click", () => {
    const text = $("promptText")?.textContent || "";
    speakEs(text);
  });
}



function renderTask() {
  currentTask = TASKS[taskIndex % TASKS.length];

  // теперь храним не просто слова, а связку слово+индекс чипа
  picked = [];

  el("taskLabel").textContent = currentTask.label;
  el("taskTitle").textContent = currentTask.title;
  el("promptText").textContent = currentTask.prompt;

  // кнопка озвучки = озвучиваем prompt
  const btnAudio = el("btnAudio");
  if (btnAudio) btnAudio.onclick = () => speakES(currentTask.prompt);

  const chips = el("chips");
  chips.innerHTML = "";

  currentTask.words.forEach((w, idx) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = w;
    b.dataset.idx = String(idx);

    b.addEventListener("click", () => {
      if (b.disabled) return;

      picked.push({ w, idx });

      b.disabled = true;
      b.classList.add("isPicked");

      renderAnswer();
      el("btnCheck").disabled = picked.length === 0;
    });

    chips.appendChild(b);
  });

  renderAnswer();
  el("feedback").textContent = "";
  el("btnCheck").disabled = true;
}



function renderAnswer() {
  const area = el("answerArea");
  area.innerHTML = "";

  if (picked.length === 0) {
    const hint = document.createElement("div");
    hint.className = "answerHint";
    hint.textContent = "Собери ответ из слов ниже…";
    area.appendChild(hint);
    return;
  }

  picked.forEach((p, pos) => {
    const t = document.createElement("button");
    t.type = "button";
    t.className = "answerToken";
    t.textContent = p.w;
    t.title = "Нажми, чтобы убрать слово";

    t.addEventListener("click", () => {
      const removed = picked.splice(pos, 1)[0];

      // возвращаем именно тот чип по индексу
      const chipBtn = el("chips").querySelector(`.chip[data-idx="${removed.idx}"]`);
      if (chipBtn) {
        chipBtn.disabled = false;
        chipBtn.classList.remove("isPicked");
      }

      renderAnswer();
      el("btnCheck").disabled = picked.length === 0;
    });

    area.appendChild(t);
  });
}

const lessons = [
  { id: 1, title: "Модуль 1 · Раздел 1", sub: "Заказывайте в кафе", xp: 20, icon: "🧩", done: false },
  { id: 2, title: "Модуль 1 · Раздел 2", sub: "Приветствия", xp: 20, icon: "🧠", done: false },
  { id: 3, title: "Модуль 1 · Раздел 3", sub: "Происхождение", xp: 20, icon: "🧪", done: false },
  { id: 4, title: "Модуль 1 · Раздел 4", sub: "Покупки", xp: 20, icon: "🛒", done: false },
];

function renderPathSpiral() {
  const host = $("pathList");
  if (!host) return;

  host.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "pathSpiral";

  lessons.forEach((l, i) => {
    const row = document.createElement("div");
    row.className = "pathRow " + (i % 2 === 0 ? "left" : "right");
    if (i === lessons.length - 1) row.classList.add("isLast");

    const node = document.createElement("button");
    node.type = "button";
    node.className = "pathNode" + (l.done ? " done" : "");

    node.innerHTML = `
      <div class="nodeIcon">${l.icon || "📘"}</div>
      <div class="nodeText">
        <div class="nodeTitle">${l.title}</div>
        <div class="nodeSub">${l.sub || ""}</div>
      </div>
      <div class="nodeXp">+${l.xp} XP</div>
    `;

    node.addEventListener("click", () => {
      showToast(`Выбран урок: ${l.title}`);
      startPractice(l.id);          // стартуем практику
    });

    row.appendChild(node);
    wrap.appendChild(row);
  });

  host.appendChild(wrap);
}


async function checkAnswer() {
  progress.answeredToday++;

  const userArr = picked.map(x => x.w);
  const correctArr = (currentTask.correct || currentTask.words);

  const ok = JSON.stringify(userArr) === JSON.stringify(correctArr);
  lastAnswerWasCorrect = ok;

  // блокируем повторную проверку — ждём “ДАЛЕЕ”
  el("btnCheck").disabled = true;

  if (ok) {
    progress.correctToday++;
    progress.xpTotal += 10;

    showResultSheet({
      ok: true,
      title: "Потрясающе! ✅",
      sub: "+10 XP"
    });
  } else {
    showResultSheet({
      ok: false,
      title: "Не засчитано 😅",
      sub: "Попробуй ещё раз"
    });
  }

  progress.lastActive = todayKey();

  renderTop();
  await saveProgress(progress);
}




function startPractice(lessonId = null) {
  // если нажали урок — запомним какой
  if (lessonId) {
    progress._activeLessonId = lessonId;
  } else {
    progress._activeLessonId = progress._activeLessonId || null;
  }

  // старт задания
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
  setActiveScreen("home");

  // tabs (теперь они глобальные)
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => setActiveScreen(btn.dataset.go));
  });

  // home
  el("btnContinue").addEventListener("click", startPractice);

  el("btnExport").addEventListener("click", async () => {
    const raw = JSON.stringify(progress, null, 2);
    await openModal({ title: "Экспорт", body: raw, showCancel: false, okText: "Закрыть" });
  });

  el("btnImport").addEventListener("click", async () => {
    await openModal({
      title: "Импорт",
      body: "Импорт сделаем красиво отдельным полем. Скажи — добавлю.",
      showCancel: false,
      okText: "Ок"
    });
  });

  el("btnSync").addEventListener("click", async () => {
    await saveProgress(progress);
    await openModal({ title: "Синк", body: "Сохранил в CloudStorage + localStorage ✅", showCancel: false });
  });

  // practice
  el("btnCheck").addEventListener("click", checkAnswer);

  // result “ДАЛЕЕ”
  const btnResultNext = el("btnResultNext");
  if (btnResultNext) {
    btnResultNext.addEventListener("click", () => {
      hideResultSheet();

      if (lastAnswerWasCorrect) {
        taskIndex++;
        animateTaskSwap(() => renderTask());
      } else {
        // остаёмся на текущем задании
        el("btnCheck").disabled = picked.length === 0;
        el("feedback").textContent = "";
      }
    });
  }

  // stats
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
    renderPath();
    await openModal({ title: "Готово", body: "Прогресс сброшен ✅", showCancel: false });
  });

  // topbar X
  el("btnExit").addEventListener("click", exitOrBack);
}


document.addEventListener("DOMContentLoaded", () => {
  init().catch((e) => {
    console.error(e);
    showToast("JS упал: смотри Console (F12)");
  });
});



