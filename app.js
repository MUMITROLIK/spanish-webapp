/* =========================================
   Spanish WebApp — app.js (FULL)
   ========================================= */

/* ---------- Helpers ---------- */

function el(id) {
  return document.getElementById(id);
}

function qs(sel, root = document) {
  return root.querySelector(sel);
}

function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function on(target, event, handler) {
  if (!target) return;
  target.addEventListener(event, handler);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function todayKeyLocal() {
  // YYYY-MM-DD in local time
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ---------- Storage ---------- */

const PROGRESS_KEY = "spanish_webapp_progress_v2";
const SETTINGS_KEY = "spanish_webapp_settings_v1";

const DAY_GOAL_XP = 50;

const DEFAULT_PROGRESS = {
  totalXP: 0,
  streak: 0,
  lastActiveDay: "",

  // day stats
  dayKey: "",
  dayXP: 0,
  answersToday: 0,
  correctToday: 0,

  // learning
  learnedWords: {},

  // practice state
  inLesson: false,
  lessonId: "lesson_1",
  taskIndex: 0
};

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PROGRESS, ...parsed };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function resetDayIfNeeded() {
  const tk = todayKeyLocal();
  if (progress.dayKey !== tk) {
    progress.dayKey = tk;
    progress.dayXP = 0;
    progress.answersToday = 0;
    progress.correctToday = 0;
  }
}

/* ---------- Settings (TTS) ---------- */

let settings = loadSettings();

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { autoSpeak: false, voiceURI: "" };
    const parsed = JSON.parse(raw);
    return {
      autoSpeak: !!parsed.autoSpeak,
      voiceURI: typeof parsed.voiceURI === "string" ? parsed.voiceURI : ""
    };
  } catch {
    return { autoSpeak: false, voiceURI: "" };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/* ---------- TTS (speechSynthesis) ---------- */

let cachedVoices = []; // ONLY ONCE
let voicesReady = false;

function getVoicesSafe() {
  try {
    if (!("speechSynthesis" in window)) return [];
    return window.speechSynthesis.getVoices() || [];
  } catch {
    return [];
  }
}

function refreshVoices() {
  cachedVoices = getVoicesSafe();
  voicesReady = cachedVoices.length > 0;
}

function pickSpanishVoice() {
  const voices = cachedVoices.length ? cachedVoices : getVoicesSafe();
  if (!voices.length) return null;

  // 1) user chosen
  if (settings.voiceURI) {
    const exact = voices.find(v => v.voiceURI === settings.voiceURI);
    if (exact) return exact;
  }

  // 2) lang starts with es
  const esByLang = voices.find(v => (v.lang || "").toLowerCase().startsWith("es"));
  if (esByLang) return esByLang;

  // 3) by name fallback
  const esByName = voices.find(v => {
    const name = (v.name || "").toLowerCase();
    return name.includes("spanish") || name.includes("español") || name.includes("espanol");
  });
  if (esByName) return esByName;

  // 4) any
  return voices[0];
}

function initTTS() {
  if (!("speechSynthesis" in window)) return;
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = () => refreshVoices();
}

function speakText(text, opts = {}) {
  if (!("speechSynthesis" in window)) return;
  if (!text || typeof text !== "string") return;

  const { rate = 1, pitch = 1, volume = 1 } = opts;

  try { window.speechSynthesis.cancel(); } catch {}

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "es-ES";
  u.rate = clamp(rate, 0.6, 1.4);
  u.pitch = clamp(pitch, 0.6, 1.4);
  u.volume = clamp(volume, 0, 1);

  const voice = pickSpanishVoice();
  if (voice) u.voice = voice;

  window.speechSynthesis.speak(u);
}

/* ---------- Telegram WebApp (optional) ---------- */

function isTelegramWebApp() {
  return typeof window.Telegram !== "undefined" &&
         window.Telegram &&
         window.Telegram.WebApp;
}

function tgHaptic(type = "impact") {
  if (!isTelegramWebApp()) return;
  try {
    const h = window.Telegram.WebApp.HapticFeedback;
    if (!h) return;
    if (type === "success") h.notificationOccurred("success");
    else if (type === "error") h.notificationOccurred("error");
    else h.impactOccurred("light");
  } catch {}
}

/* ---------- App State ---------- */

let progress = loadProgress();
resetDayIfNeeded();

const screens = {
  home: el("screenHome"),
  path: el("screenPath"),
  practice: el("screenPractice"),
  stats: el("screenStats"),
  settings: el("screenSettings") // optional if you add later
};

let currentScreen = "home";

// Practice runtime
let lesson = null;
let taskIndex = 0;

let picked = [];      // picked chips
let pool = [];        // remaining chips
let lastAnswerWasCorrect = false;
let currentTask = null;

/* ---------- Lesson Data (demo) ---------- */
/*
  Ты потом легко расширишь: добавляй уроки/уровни/спираль.
  Сейчас 1 урок = 3 задания.
*/

const LESSONS = {
  lesson_1: {
    id: "lesson_1",
    title: "Урок 1: База",
    subtitle: "3 задания • быстро • без лимитов",
    tasks: [
      {
        type: "translate",
        title: "ПЕРЕВОД",
        subtitle: "Собери перевод на испанский",
        promptRu: "Франция и Мексика.",
        phraseEs: "Francia y México.",
        chips: ["Francia", "y", "México"],
        speak: "Francia y México."
      },
      {
        type: "choose",
        title: "ЗАКОНЧИ ФРАЗУ",
        subtitle: "Выбери правильное слово",
        promptEs: "Sí, yo soy de __.",
        correct: "Francia",
        options: ["Francia", "México", "taco", "gracias", "chao"],
        speak: "Sí, yo soy de Francia."
      },
      {
        type: "audio",
        title: "АУДИО",
        subtitle: "Нажми 🔊 и собери фразу",
        promptHint: "Нажми 🔊 и собери фразу 👂",
        phraseEs: "Yo soy Ana, encantada.",
        chips: ["Yo", "soy", "Ana", "encantada"],
        noise: ["helado", "tú"],
        speak: "Yo soy Ana, encantada."
      }
    ]
  }
};

function getLessonById(id) {
  return LESSONS[id] || LESSONS.lesson_1;
}

/* ---------- UI: Tabs & Screens ---------- */

function goScreen(name) {
  currentScreen = name;

  // hide all
  Object.values(screens).forEach(sec => {
    if (sec) sec.classList.remove("isActive");
  });

  // show chosen
  const sec = screens[name];
  if (sec) sec.classList.add("isActive");

  // set active tab style
  qsa("nav.tabs .tab").forEach(btn => btn.classList.remove("isActive"));
  const tabBtn = qs(`nav.tabs .tab[data-go="${name}"]`);
  if (tabBtn) tabBtn.classList.add("isActive");

  // screen enter hooks
  if (name === "home") renderHome();
  if (name === "path") renderPath();
  if (name === "stats") renderStats();
  if (name === "practice") {
    // если пришли в practice без урока — стартуем урок
    if (!progress.inLesson) startLesson(progress.lessonId || "lesson_1");
    else resumeLesson();
  }

  saveProgress();
}

function bindTabs() {
  qsa("nav.tabs .tab").forEach(btn => {
    on(btn, "click", () => {
      const target = btn.dataset.go;
      if (!target) return;
      goScreen(target);
    });
  });
}

/* ---------- UI: Home / Path / Stats ---------- */

function renderHome() {
  resetDayIfNeeded();

  // Mini stats (если есть id в HTML)
  if (el("todayXp")) el("todayXp").textContent = String(progress.dayXP);
  if (el("todayGoal")) el("todayGoal").textContent = String(DAY_GOAL_XP);

  if (el("miniAccuracy")) {
    const acc = progress.answersToday ? Math.round((progress.correctToday / progress.answersToday) * 100) : 0;
    el("miniAccuracy").textContent = `${acc}%`;
  }

  // optional
  if (el("miniPathValue")) el("miniPathValue").textContent = "1";
  if (el("miniLessonValue")) el("miniLessonValue").textContent = "1";
}

function renderPath() {
  const l = getLessonById("lesson_1");

  // Если у тебя в HTML есть элементы для урока — заполним.
  if (el("pathLessonTitle")) el("pathLessonTitle").textContent = l.title;
  if (el("pathLessonSub")) el("pathLessonSub").textContent = l.subtitle;

  // Кнопка "Начать" обычно есть — попробуем несколько id
  const btnStart = el("btnStartLesson") || el("btnStart") || qs('[data-action="startLesson"]');
  if (btnStart) btnStart.disabled = false;
}

function renderStats() {
  resetDayIfNeeded();

  if (el("statTotalXP")) el("statTotalXP").textContent = String(progress.totalXP);
  if (el("statStreak")) el("statStreak").textContent = String(progress.streak);
  if (el("statAnswersToday")) el("statAnswersToday").textContent = String(progress.answersToday);

  const acc = progress.answersToday ? Math.round((progress.correctToday / progress.answersToday) * 100) : 0;
  if (el("statAccuracyToday")) el("statAccuracyToday").textContent = `${acc}%`;

  const learnedCount = Object.keys(progress.learnedWords || {}).length;
  if (el("statLearned")) el("statLearned").textContent = String(learnedCount);
}

/* ---------- XP & Streak ---------- */

function touchStreak() {
  const today = todayKeyLocal();
  if (progress.lastActiveDay === today) return;

  // yesterday check
  const d = new Date();
  const todayDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const yesterdayDate = new Date(todayDate.getTime() - 86400000);
  const yKey = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, "0")}-${String(yesterdayDate.getDate()).padStart(2, "0")}`;

  if (progress.lastActiveDay === yKey) progress.streak = (progress.streak || 0) + 1;
  else progress.streak = 1;

  progress.lastActiveDay = today;
}

function addXP(xp) {
  resetDayIfNeeded();
  touchStreak();

  progress.totalXP = (progress.totalXP || 0) + xp;
  progress.dayXP = (progress.dayXP || 0) + xp;

  saveProgress();
  renderHome();
  renderStats();
}

/* ---------- Result Sheet (Потрясающе + Далее) ---------- */

function showResultSheet({ ok, title, sub }) {
  const sheet = el("resultSheet");
  const t = el("resultTitle");
  const s = el("resultSub");

  // Если у тебя нет resultSheet в HTML — просто показываем feedback
  if (!sheet) {
    const fb = el("feedback");
    if (fb) {
      fb.textContent = title || (ok ? "Потрясающе!" : "Попробуй ещё раз");
      fb.classList.toggle("good", !!ok);
      fb.classList.toggle("bad", !ok);
    }
    return;
  }

  sheet.classList.toggle("good", !!ok);
  sheet.classList.toggle("bad", !ok);

  if (t) t.textContent = title || (ok ? "Потрясающе!" : "Ошибка");
  if (s) s.textContent = sub || "";

  sheet.classList.remove("hidden");

  // прячем кнопку "Проверить", чтобы не наезжало
  if (el("btnCheck")) el("btnCheck").style.visibility = "hidden";

  if (ok) {
    tgHaptic("success");
    try { fireConfetti(); } catch {}
  } else {
    tgHaptic("error");
  }
}

function hideResultSheet() {
  const sheet = el("resultSheet");
  if (sheet) sheet.classList.add("hidden");
  if (el("btnCheck")) el("btnCheck").style.visibility = "visible";

  const fb = el("feedback");
  if (fb) fb.textContent = "";
}

/* ---------- Practice Engine ---------- */

function resetPracticeUI() {
  hideResultSheet();

  picked = [];
  pool = [];
  lastAnswerWasCorrect = false;
  currentTask = null;

  if (el("pickedRow")) el("pickedRow").innerHTML = "";
  if (el("chipPool")) el("chipPool").innerHTML = "";

  if (el("btnNext")) el("btnNext").disabled = true;
  if (el("btnCheck")) el("btnCheck").disabled = true;

  const fb = el("feedback");
  if (fb) fb.textContent = "";
}

function startLesson(lessonId) {
  progress.inLesson = true;
  progress.lessonId = lessonId;
  progress.taskIndex = 0;

  lesson = getLessonById(lessonId);
  taskIndex = 0;

  resetPracticeUI();
  goScreen("practice");
  renderTask();
}

function resumeLesson() {
  lesson = getLessonById(progress.lessonId || "lesson_1");
  taskIndex = progress.taskIndex || 0;

  resetPracticeUI();
  renderTask();
}

function finishLesson() {
  progress.inLesson = false;
  progress.taskIndex = 0;
  saveProgress();

  // Если у тебя есть модалка "урок завершён" — покажем, иначе просто в путь
  const modal = el("lessonDoneModal");
  if (modal) {
    modal.classList.remove("hidden");
  } else {
    goScreen("path");
  }
}

function renderTask() {
  resetDayIfNeeded();

  const tasks = lesson?.tasks || [];
  if (taskIndex >= tasks.length) {
    finishLesson();
    return;
  }

  currentTask = tasks[taskIndex];
  progress.taskIndex = taskIndex;
  saveProgress();

  // Headers
  if (el("taskTitle")) el("taskTitle").textContent = currentTask.title || "";
  if (el("taskSubtitle")) el("taskSubtitle").textContent = currentTask.subtitle || "";

  // Prompt text
  const prompt = el("promptText");
  if (prompt) {
    if (currentTask.type === "translate") {
      prompt.textContent = currentTask.promptRu || "";
    } else if (currentTask.type === "choose") {
      prompt.textContent = currentTask.promptEs || "";
    } else if (currentTask.type === "audio") {
      prompt.textContent = currentTask.promptHint || "Нажми 🔊 и собери фразу 👂";
    } else {
      prompt.textContent = "";
    }
  }

  // Audio button
  const btnAudio = el("btnAudio") || qs('[data-action="audio"]');
  if (btnAudio) {
    btnAudio.disabled = false;
  }

  // Build chips
  resetPracticeUI();
  buildTaskChips(currentTask);

  // Auto speak (optional)
  if (settings.autoSpeak && currentTask.speak) {
    speakText(currentTask.speak, { rate: 1 });
  }
}

function buildTaskChips(task) {
  const poolWrap = el("chipPool");
  const pickedWrap = el("pickedRow");

  // fallback if HTML uses other ids
  const poolAlt = qs('[data-role="chipPool"]');
  const pickedAlt = qs('[data-role="pickedRow"]');

  const poolEl = poolWrap || poolAlt;
  const pickedEl = pickedWrap || pickedAlt;

  if (!poolEl || !pickedEl) return;

  picked = [];
  pool = [];

  if (task.type === "translate") {
    pool = [...task.chips];
  } else if (task.type === "choose") {
    pool = [...task.options];
  } else if (task.type === "audio") {
    pool = [...task.chips, ...(task.noise || [])];
  } else {
    pool = [];
  }

  // shuffle pool a bit (simple)
  pool = pool
    .map(v => ({ v, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map(x => x.v);

  renderChips(poolEl, pickedEl);
  updateButtonsState();
}

function renderChips(poolEl, pickedEl) {
  poolEl.innerHTML = "";
  pickedEl.innerHTML = "";

  // picked
  picked.forEach((word, idx) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip picked";
    chip.textContent = word;

    on(chip, "click", () => {
      // remove from picked -> back to pool
      picked.splice(idx, 1);
      pool.push(word);
      renderChips(poolEl, pickedEl);
      updateButtonsState();
    });

    pickedEl.appendChild(chip);
  });

  // pool
  pool.forEach((word, idx) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = word;

    on(chip, "click", () => {
      pool.splice(idx, 1);
      picked.push(word);
      renderChips(poolEl, pickedEl);
      updateButtonsState();
    });

    poolEl.appendChild(chip);
  });
}

function updateButtonsState() {
  const btnCheck = el("btnCheck");
  const btnNext = el("btnNext");

  if (btnNext) btnNext.disabled = true;

  if (!btnCheck) return;

  if (!currentTask) {
    btnCheck.disabled = true;
    return;
  }

  if (currentTask.type === "choose") {
    // for choose: allow check after 1 pick
    btnCheck.disabled = picked.length !== 1;
  } else {
    // for translate/audio: allow check after at least 1 word
    btnCheck.disabled = picked.length === 0;
  }
}

/* ---------- Check Answer ---------- */

function checkAnswer() {
  if (!currentTask) return;

  const btnNext = el("btnNext");
  const btnCheck = el("btnCheck");

  // update stats counters
  progress.answersToday = (progress.answersToday || 0) + 1;

  let ok = false;
  let gainedXP = 0;

  if (currentTask.type === "translate") {
    const answer = picked.join(" ").trim();
    ok = answer === currentTask.phraseEs.replace(".", "").trim() ||
         answer + "." === currentTask.phraseEs.trim();
    gainedXP = ok ? 10 : 0;

    if (ok) {
      // learned words
      currentTask.chips.forEach(w => progress.learnedWords[w.toLowerCase()] = true);
    }
  }

  if (currentTask.type === "choose") {
    ok = picked[0] === currentTask.correct;
    gainedXP = ok ? 10 : 0;

    if (ok) {
      progress.learnedWords[(currentTask.correct || "").toLowerCase()] = true;
    }
  }

  if (currentTask.type === "audio") {
    const answer = picked.join(" ").trim();
    ok = answer === currentTask.phraseEs.replace(".", "").trim() ||
         answer + "." === currentTask.phraseEs.trim();
    gainedXP = ok ? 10 : 0;

    if (ok) {
      currentTask.chips.forEach(w => progress.learnedWords[w.toLowerCase()] = true);
    }
  }

  if (ok) progress.correctToday = (progress.correctToday || 0) + 1;

  saveProgress();
  renderStats();
  renderHome();

  lastAnswerWasCorrect = ok;

  if (btnCheck) btnCheck.disabled = true;
  if (btnNext) btnNext.disabled = !ok; // дальше — только если ок

  if (ok) addXP(gainedXP);

  const title = ok ? "Потрясающе!" : "Почти. Попробуй ещё раз 🙂";
  const sub = ok ? `+${gainedXP} XP` : "";

  showResultSheet({ ok, title, sub });
}

/* ---------- Next Task ---------- */

function nextTask() {
  hideResultSheet();

  if (lastAnswerWasCorrect) {
    taskIndex += 1;
    progress.taskIndex = taskIndex;
    saveProgress();
    renderTask();
  } else {
    // если ошибка — оставляем задание, просто разрешаем снова проверять
    if (el("btnCheck")) el("btnCheck").disabled = picked.length === 0;
    if (el("btnNext")) el("btnNext").disabled = true;
  }
}

/* ---------- Audio Click ---------- */

function playCurrentAudio() {
  if (!currentTask) return;
  const text = currentTask.speak || currentTask.phraseEs || "";
  if (!text) return;
  speakText(text, { rate: 1 });
}

/* ---------- Import/Export ---------- */

function exportJSON() {
  const payload = {
    progress,
    settings
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "spanish_webapp_backup.json";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function importJSON() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";

  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (parsed.progress) {
        progress = { ...DEFAULT_PROGRESS, ...parsed.progress };
        resetDayIfNeeded();
        saveProgress();
      }

      if (parsed.settings) {
        settings = {
          autoSpeak: !!parsed.settings.autoSpeak,
          voiceURI: typeof parsed.settings.voiceURI === "string" ? parsed.settings.voiceURI : ""
        };
        saveSettings();
      }

      // Refresh UI
      renderHome();
      renderPath();
      renderStats();

      alert("Импорт успешно ✅");
    } catch (e) {
      console.error(e);
      alert("Не получилось импортировать файл ❌");
    }
  };

  input.click();
}

function syncToBot() {
  // Пока без реального бэкенда: просто копируем JSON в буфер
  const payload = { progress, settings };
  const text = JSON.stringify(payload);

  navigator.clipboard?.writeText(text)
    .then(() => alert("Данные скопированы ✅\n(позже подключим реальный синк в бота)"))
    .catch(() => alert("Не удалось скопировать 😕"));
}

/* ---------- Confetti (optional) ---------- */

function fireConfetti() {
  // Если у тебя уже есть конфетти — оно отработает.
  // Если нет — просто ничего не будет.
  if (typeof window.confetti === "function") {
    window.confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 } });
  }
}

/* ---------- Buttons Binding ---------- */

function bindHomeButtons() {
  on(el("btnContinue"), "click", () => {
    // Если мы в уроке — идём в practice, иначе в путь
    if (progress.inLesson) goScreen("practice");
    else goScreen("path");
  });

  on(el("btnExport"), "click", exportJSON);
  on(el("btnImport"), "click", importJSON);
  on(el("btnSync"), "click", syncToBot);
}

function bindPathButtons() {
  const btnStart = el("btnStartLesson") || el("btnStart") || qs('[data-action="startLesson"]');
  on(btnStart, "click", () => startLesson("lesson_1"));
}

function bindPracticeButtons() {
  on(el("btnCheck"), "click", checkAnswer);
  on(el("btnNext"), "click", nextTask);

  const btnAudio = el("btnAudio") || qs('[data-action="audio"]');
  on(btnAudio, "click", playCurrentAudio);

  // Optional "X" close button (если есть)
  const btnClose = el("btnClose") || qs('[data-action="close"]') || qs(".btnClose");
  on(btnClose, "click", () => {
    // выходим в путь
    progress.inLesson = false;
    progress.taskIndex = 0;
    saveProgress();
    goScreen("path");
  });

  // Lesson done modal buttons (если есть)
  on(el("btnDoneToPath"), "click", () => {
    const modal = el("lessonDoneModal");
    if (modal) modal.classList.add("hidden");
    goScreen("path");
  });

  on(el("btnDoneRepeat"), "click", () => {
    const modal = el("lessonDoneModal");
    if (modal) modal.classList.add("hidden");
    startLesson("lesson_1");
  });
}

function bindStatsButtons() {
  const btnReset = el("btnResetProgress") || qs('[data-action="resetProgress"]');
  on(btnReset, "click", () => {
    const ok = confirm("Сбросить прогресс? Это действие нельзя отменить.");
    if (!ok) return;
    progress = { ...DEFAULT_PROGRESS };
    resetDayIfNeeded();
    saveProgress();
    renderHome();
    renderPath();
    renderStats();
    goScreen("path");
  });
}

/* ---------- Init ---------- */

async function init() {
  initTTS();
  resetDayIfNeeded();

  bindTabs();
  bindHomeButtons();
  bindPathButtons();
  bindPracticeButtons();
  bindStatsButtons();

  renderHome();
  renderPath();
  renderStats();

  // стартовый экран:
  // если хочешь убрать "Главную" позже — просто ставь goScreen("path")
  goScreen("home");
}

document.addEventListener("DOMContentLoaded", init);
