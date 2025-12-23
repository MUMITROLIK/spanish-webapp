/* =========================
   Telegram + Storage helpers
========================= */

const STORAGE_KEY = "spanish_trainer_progress_v1";
const LEGACY_KEYS = [
  "duo_like_progress_v1",
  "spanish_trainer_progress_v1",
  "spanish_trainer_progress"
];

function tg() {
  return window.Telegram?.WebApp;
}

function el(id) {
  return document.getElementById(id);
}

function safeParse(json) {
  try { return JSON.parse(json); } catch { return null; }
}

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
    lastActiveDay: null,

    answeredToday: 0,
    correctToday: 0,
    todayXp: 0,

    wordsLearned: 0
  };
}

function loadLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return safeParse(raw);

  // migration
  for (const k of LEGACY_KEYS) {
    const legacy = localStorage.getItem(k);
    if (legacy) {
      const parsed = safeParse(legacy);
      if (parsed) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        return parsed;
      }
    }
  }

  return null;
}

function saveLocal(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

// (опционально) cloud storage в Telegram
async function cloudSet(key, value) {
  const t = tg();
  if (!t?.CloudStorage) return false;
  return new Promise((resolve) => {
    t.CloudStorage.setItem(key, value, (err) => resolve(!err));
  });
}

async function cloudGet(key) {
  const t = tg();
  if (!t?.CloudStorage) return null;
  return new Promise((resolve) => {
    t.CloudStorage.getItem(key, (err, val) => resolve(err ? null : val));
  });
}

/* =========================
   Tasks
========================= */

const TASKS = [
  {
    label: "НОВОЕ СЛОВО",
    title: "Переведи предложение",
    prompt: "Francia y México.",
    words: ["Франция", "и", "Мексика"],
    correct: ["Франция", "и", "Мексика"]
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
  promptMask: "Нажми 🔊 и собери фразу 👂",
  audioOnly: true,
  words: ["Yo", "soy", "Ana", "encantada", "helado", "tú"],
  correct: ["Yo", "soy", "Ana", "encantada"]
}

];

/* =========================
   State
========================= */

let progress = defaultProgress();
let taskIndex = 0;
let currentTask = TASKS[0];
let picked = [];
let lastAnswerWasCorrect = false;

const DAILY_GOAL_XP = 50;

/* =========================
   UI helpers
========================= */

function setActiveTab(go) {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.classList.toggle("isActive", btn.dataset.go === go);
  });

  document.querySelectorAll(".screen").forEach(sec => {
    sec.classList.toggle("isActive", sec.id === `screen${cap(go)}`);
  });
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function resetDayIfNeeded() {
  const today = todayKey();
  if (progress.lastActiveDay !== today) {
    progress.answeredToday = 0;
    progress.correctToday = 0;
    progress.todayXp = 0;
    progress.lastActiveDay = today;
    saveLocal(progress);
  }
}

function calcAcc() {
  if (!progress.answeredToday) return 0;
  return Math.round((progress.correctToday / progress.answeredToday) * 100);
}

function renderTop() {
  // “энергия” в этой версии — просто остаток до цели (чтоб визуально было)
  const energy = Math.max(0, DAILY_GOAL_XP - progress.todayXp);

  el("energy").textContent = String(energy);
  el("streak").textContent = String(progress.streak);
  el("xpTotal").textContent = String(progress.xpTotal);

  el("homeEnergy").textContent = String(energy);
  el("homeStreak").textContent = String(progress.streak);

  el("todayXp").textContent = String(progress.todayXp);
  el("acc").textContent = String(calcAcc());

  // progress bar
  const pct = Math.max(0, Math.min(100, Math.round((progress.todayXp / DAILY_GOAL_XP) * 100)));
  el("barFill").style.width = `${pct}%`;

  // stats screen
  el("sXp").textContent = String(progress.xpTotal);
  el("sStreak").textContent = String(progress.streak);
  el("sAnswered").textContent = String(progress.answeredToday);
  el("sAcc").textContent = `${calcAcc()}%`;
  el("sWords").textContent = String(progress.wordsLearned);
}

function clearTaskUI() {
  picked = [];
  el("answerArea").innerHTML = "";
  el("feedback").textContent = "";
  el("btnCheck").disabled = true;
}

function renderPicked() {
  const area = el("answerArea");
  area.innerHTML = "";

  if (picked.length === 0) {
    const hint = document.createElement("div");
    hint.className = "answerHint";
    hint.textContent = "Нажимай на слова ниже 👇";
    area.appendChild(hint);
    el("btnCheck").disabled = true;
    return;
  }

  picked.forEach((w, idx) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "pickedChip";
    chip.textContent = w;

    chip.addEventListener("click", () => {
      picked.splice(idx, 1);
      renderPicked();
    });

    area.appendChild(chip);
  });

  el("btnCheck").disabled = false;
}

function renderChips() {
  const box = el("chips");
  box.innerHTML = "";

  currentTask.words.forEach((w) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = w;

    b.addEventListener("click", () => {
      picked.push(w);
      renderPicked();
    });

    box.appendChild(b);
  });
}

function renderTask() {
  currentTask = TASKS[Math.min(taskIndex, TASKS.length - 1)];

  el("taskLabel").textContent = currentTask.label;
  el("taskTitle").textContent = currentTask.title;

  // ✅ ВАЖНО: не показываем “что услышали” текстом на аудио-задании
  if (currentTask.audioOnly) {
    el("promptText").textContent = currentTask.promptMask || "Нажми 🔊 и собери фразу 👂";
  } else {
    el("promptText").textContent = currentTask.prompt;
  }

  hideResultSheet();
  clearTaskUI();
  renderChips();
  renderPicked();

  // ✅ Автопопытка озвучки только на АУДИО (может блокироваться браузером)
  if (currentTask.audioOnly) {
    trySpeak(currentTask.prompt, { preferAuto: true });
  }
}


function showResultSheet({ ok, title, sub }) {
  const sheet = el("resultSheet");
  sheet.classList.remove("hidden");

  el("resultTitle").textContent = title;
  el("resultSub").textContent = sub;

  sheet.classList.toggle("isOk", !!ok);
  sheet.classList.toggle("isBad", !ok);

  // ✅ чтобы результат не наезжал на кнопку — прячем "ПРОВЕРИТЬ"
  const checkBtn = el("btnCheck");
  if (checkBtn) checkBtn.style.visibility = "hidden";

  if (ok) spawnConfetti();
}


function hideResultSheet() {
  el("resultSheet").classList.add("hidden");
  clearConfetti();

  // ✅ возвращаем "ПРОВЕРИТЬ"
  const checkBtn = el("btnCheck");
  if (checkBtn) checkBtn.style.visibility = "visible";
}



function spawnConfetti() {
  const box = el("confetti");
  box.innerHTML = "";

  const pieces = 40;
  for (let i = 0; i < pieces; i++) {
    const p = document.createElement("div");
    p.className = "confettiPiece";
    p.style.left = Math.random() * 100 + "%";
    p.style.animationDelay = (Math.random() * 0.15) + "s";
    p.style.transform = `rotate(${Math.random() * 180}deg)`;
    box.appendChild(p);
  }

  setTimeout(clearConfetti, 900);
}

function clearConfetti() {
  const box = el("confetti");
  if (box) box.innerHTML = "";
}

/* =========================
   Answer logic
========================= */

function arraysEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function updateStreakOnCorrect() {
  const today = todayKey();

  // streak: увеличиваем если вчера/сегодня было действие и сегодня первый раз правильно
  // упрощённо: если сегодня есть хотя бы 1 правильный — streak >= 1
  // + если вчера тоже было активность — streak++ (самое простое поведение)
  if (progress.correctToday === 1) {
    // первый правильный сегодня
    if (!progress._lastStreakDay) {
      progress.streak = Math.max(progress.streak, 1);
    } else {
      // если вчера
      const prev = new Date(progress._lastStreakDay);
      const cur = new Date(today);
      const diffDays = Math.round((cur - prev) / 86400000);

      if (diffDays === 1) progress.streak += 1;
      else if (diffDays > 1) progress.streak = 1;
      else progress.streak = Math.max(progress.streak, 1);
    }
    progress._lastStreakDay = today;
  }
}

function checkAnswer() {
  progress.answeredToday++;

  const correctArr = currentTask.correct || currentTask.words;
  const ok = arraysEqual(picked, correctArr);

  lastAnswerWasCorrect = ok;

  // блокируем повторную проверку, пока не нажмут "ДАЛЕЕ"
  el("btnCheck").disabled = true;

  if (ok) {
    progress.correctToday++;
    progress.xpTotal += 10;
    progress.todayXp += 10;

    // условно считаем “выучил слово” на заданиях "НОВОЕ СЛОВО"
    if (currentTask.label === "НОВОЕ СЛОВО") progress.wordsLearned++;

    updateStreakOnCorrect();
    saveLocal(progress);
    renderTop();

    showResultSheet({
      ok: true,
      title: "Потрясающе! ✅",
      sub: "+10 XP"
    });
  } else {
    saveLocal(progress);
    renderTop();

    el("feedback").textContent = "Есть ошибка. Попробуй ещё раз 🙃";
    showResultSheet({
      ok: false,
      title: "Почти…",
      sub: "Попробуй ещё раз"
    });
  }
}

async function goNextFromResult() {
  hideResultSheet();

  if (lastAnswerWasCorrect) {
    taskIndex++;

    // ✅ дошли до конца урока — выбор: Повторить или Путь
    if (taskIndex >= TASKS.length) {
      const choice = await openModal({
        title: "Урок завершён 🎉",
        body: "Хочешь повторить урок или перейти в «Путь»?",
        showCancel: true,
        okText: "Повторить",
        cancelText: "Путь"
      });

      if (choice) {
        taskIndex = 0;
        renderTask();
      } else {
        setActiveTab("path");
        renderPath();
        renderTop();
      }
      return;
    }

    renderTask();
  } else {
    // если ошибка — остаёмся на текущем задании
    el("btnCheck").disabled = picked.length === 0;
    el("feedback").textContent = "";
  }
}


/* =========================
   TTS (speechSynthesis)
========================= */

let cachedVoice = null;

function pickSpanishVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  if (!voices.length) return null;

  const norm = (s) => (s || "").toLowerCase();

  const esES = voices.find(v => norm(v.lang).startsWith("es-es"));
  if (esES) return esES;

  const anyEs = voices.find(v => norm(v.lang).startsWith("es"));
  if (anyEs) return anyEs;

  return voices[0] || null;
}


let lastSpeakAt = 0;

function trySpeak(text, { preferAuto = false } = {}) {
  if (!("speechSynthesis" in window)) {
    if (!preferAuto) {
      openModal({ title: "Аудио", body: "speechSynthesis не поддерживается.", showCancel: false });
    }
    return;
  }

  // анти-спам кликов (чтобы не путалось)
  const now = Date.now();
  if (now - lastSpeakAt < 200) return;
  lastSpeakAt = now;

  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);

  // ✅ фиксируем язык, чтобы не “переобувалось”
  u.lang = "es-ES";

  // ✅ выбираем испанский голос
  cachedVoice = pickSpanishVoice();
  if (cachedVoice) u.voice = cachedVoice;

  u.rate = 0.95;
  u.pitch = 1.0;

  try {
    window.speechSynthesis.speak(u);
  } catch {
    // в некоторых webview может падать — игнорим
  }
}


// важно для некоторых браузеров: голоса грузятся асинхронно
if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = pickSpanishVoice();
  };
}

/* =========================
   Modal
========================= */

function openModal({ title, body, showCancel = true, okText = "Ок", cancelText = "Отмена" }) {
  return new Promise((resolve) => {
    const modal = el("modal");
    el("modalTitle").textContent = title;

    const bodyEl = el("modalBody");
    bodyEl.innerHTML = "";
    if (typeof body === "string") {
      const div = document.createElement("div");
      div.textContent = body;
      bodyEl.appendChild(div);
    } else {
      bodyEl.appendChild(body);
    }

    const btnOk = el("modalOk");
    const btnCancel = el("modalCancel");
    const btnX = el("modalX");

    btnOk.textContent = okText;
    btnCancel.textContent = cancelText;

    btnCancel.style.display = showCancel ? "" : "none";

    function close(val) {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");

      btnOk.onclick = null;
      btnCancel.onclick = null;
      btnX.onclick = null;

      resolve(val);
    }

    btnOk.onclick = () => close(true);
    btnCancel.onclick = () => close(false);
    btnX.onclick = () => close(false);

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  });
}

async function importModal() {
  const wrap = document.createElement("div");

  const p = document.createElement("div");
  p.textContent = "Вставь JSON прогресса сюда:";
  p.style.marginBottom = "10px";

  const ta = document.createElement("textarea");
  ta.style.width = "100%";
  ta.style.height = "160px";
  ta.style.resize = "vertical";
  ta.placeholder = "{ ... }";

  wrap.appendChild(p);
  wrap.appendChild(ta);

  const ok = await openModal({
    title: "Импорт",
    body: wrap,
    showCancel: true,
    okText: "Импортировать",
    cancelText: "Отмена"
  });

  if (!ok) return;

  const parsed = safeParse(ta.value.trim());
  if (!parsed) {
    await openModal({ title: "Ошибка", body: "Не смог прочитать JSON. Проверь формат.", showCancel: false });
    return;
  }

  // мягкая валидация
  progress = { ...defaultProgress(), ...parsed };
  resetDayIfNeeded();
  saveLocal(progress);
  renderTop();

  await openModal({ title: "Готово ✅", body: "Импорт выполнен.", showCancel: false });
}

async function exportModal() {
  const wrap = document.createElement("div");

  const p = document.createElement("div");
  p.textContent = "Скопируй JSON:";
  p.style.marginBottom = "10px";

  const ta = document.createElement("textarea");
  ta.style.width = "100%";
  ta.style.height = "160px";
  ta.style.resize = "vertical";
  ta.value = JSON.stringify(progress, null, 2);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "Скопировать";
  copyBtn.style.marginTop = "10px";

  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(ta.value);
      copyBtn.textContent = "Скопировано ✅";
      setTimeout(() => (copyBtn.textContent = "Скопировать"), 900);
    } catch {
      copyBtn.textContent = "Не вышло :(";
      setTimeout(() => (copyBtn.textContent = "Скопировать"), 900);
    }
  };

  wrap.appendChild(p);
  wrap.appendChild(ta);
  wrap.appendChild(copyBtn);

  await openModal({ title: "Экспорт", body: wrap, showCancel: false, okText: "Закрыть" });
}

/* =========================
   Path screen
========================= */

function renderPath() {
  const list = el("pathList");
  list.innerHTML = "";

  const lesson = document.createElement("div");
  lesson.className = "pathItem";

  lesson.innerHTML = `
    <div class="pathLeft">
      <div class="pathTitle">Урок 1: База</div>
      <div class="pathSub">3 задания · быстро · без лимитов</div>
    </div>
    <button class="btnPrimary pathBtn" type="button">Начать</button>
  `;

  lesson.querySelector("button").addEventListener("click", async () => {
    const ok = await openModal({
      title: "Начать урок?",
      body: "Открываем практику и идём по заданиям.",
      showCancel: true,
      okText: "НАЧАТЬ",
      cancelText: "Отмена"
    });

    if (!ok) return;
    startPractice();
  });

  list.appendChild(lesson);
}

/* =========================
   Navigation
========================= */

function startPractice() {
  taskIndex = 0;
  setActiveTab("practice");
  renderTask();
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const go = btn.dataset.go;
      setActiveTab(go);

      if (go === "path") renderPath();
      if (go === "practice") renderTask();
      renderTop();
    });
  });
}

/* =========================
   Init
========================= */

async function init() {
  // Telegram setup
  const t = tg();
  if (t) {
    try {
      t.ready();
      t.expand();
      t.setHeaderColor?.("#0b1c22");
      t.setBackgroundColor?.("#0b1c22");
    } catch {}
  }

  progress = loadLocal() || defaultProgress();
  resetDayIfNeeded();
  saveLocal(progress);

  setupTabs();
  renderPath();
  renderTop();

  // buttons
  el("btnContinue").addEventListener("click", startPractice);
  el("btnCheck").addEventListener("click", checkAnswer);
  el("btnNext").addEventListener("click", goNextFromResult);

  el("btnAudio").addEventListener("click", () => {
    trySpeak(currentTask.prompt);
  });

  el("btnExport").addEventListener("click", exportModal);
  el("btnImport").addEventListener("click", importModal);

  el("btnSync").addEventListener("click", async () => {
    saveLocal(progress);
    const ok = await cloudSet(STORAGE_KEY, JSON.stringify(progress));
    await openModal({
      title: "Синк",
      body: ok ? "Сохранил в Telegram CloudStorage ✅" : "CloudStorage недоступен (но локально сохранено).",
      showCancel: false
    });
  });

  el("btnReset").addEventListener("click", async () => {
    const ok = await openModal({
      title: "Сбросить прогресс?",
      body: "Удалим XP/статы и начнём с нуля.",
      showCancel: true,
      okText: "СБРОСИТЬ",
      cancelText: "Отмена"
    });
    if (!ok) return;

    progress = defaultProgress();
    resetDayIfNeeded();
    saveLocal(progress);
    renderTop();
    await openModal({ title: "Готово", body: "Прогресс сброшен.", showCancel: false });
  });

  el("btnExit").addEventListener("click", () => {
    if (t?.close) t.close();
    else openModal({ title: "Выход", body: "Закрыть можно вкладку/окно.", showCancel: false });
  });

  // Попробуем подтянуть из CloudStorage, если локально пусто (не обязательно)
  const cloudRaw = await cloudGet(STORAGE_KEY);
  if (cloudRaw) {
    const cloudParsed = safeParse(cloudRaw);
    if (cloudParsed && (!loadLocal() || loadLocal().xpTotal === 0)) {
      progress = { ...defaultProgress(), ...cloudParsed };
      resetDayIfNeeded();
      saveLocal(progress);
      renderTop();
    }
  }

  // стартовый рендер задачи (чтоб Практика не была пустой)
  renderTask();
}

document.addEventListener("DOMContentLoaded", init);
