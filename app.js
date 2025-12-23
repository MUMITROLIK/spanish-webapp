"use strict";

/* =========================================================
   Helpers
========================================================= */
const el = (id) => document.getElementById(id);

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => t.classList.add("hidden"), 2200);
}

function safeJSONParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

/* =========================================================
   Storage
========================================================= */
const STORAGE_KEY = "spanishTrainer.progress.v1";
const SETTINGS_KEY = "spanishTrainer.settings.v1";

const defaultProgress = () => ({
  totalXp: 0,
  stars: 0,
  streak: 0,

  // daily
  day: todayISO(),
  todayXp: 0,
  answersToday: 0,
  correctToday: 0,

  // learning
  wordsLearned: 0,

  // path
  lessonIndex: 0,
  taskIndex: 0,
});

const defaultSettings = () => ({
  voiceURI: "",
  autoSpeak: false,
});

function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? safeJSONParse(raw) : null;
  const p = parsed && typeof parsed === "object" ? parsed : defaultProgress();

  // day rollover without wiping everything
  const t = todayISO();
  if (p.day !== t) {
    p.day = t;
    p.todayXp = 0;
    p.answersToday = 0;
    p.correctToday = 0;
    // streak обновляем НЕ тут, а когда человек реально отвечает сегодня
  }

  return p;
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function loadSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  const parsed = raw ? safeJSONParse(raw) : null;
  const s = parsed && typeof parsed === "object" ? parsed : defaultSettings();

  if (typeof s.voiceURI !== "string") s.voiceURI = "";
  s.autoSpeak = !!s.autoSpeak;
  return s;
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/* =========================================================
   Data: lessons & tasks
   (пока 1 урок, но структура готова под расширение)
========================================================= */
const lessons = [
  {
    id: "base",
    title: "Урок 1: База",
    sub: "3 задания · быстро · без лимитов",
    tasks: [
      {
        type: "translate",
        badge: "НОВОЕ СЛОВО",
        title: "Перевод",
        promptRu: "Франция и Мексика.",
        answerEs: "Francia y México",
        ttsText: "Francia y México",
      },
      {
        type: "fill",
        badge: "ЗАКОНЧИ ФРАЗУ",
        title: "Выбери правильное слово",
        promptRu: "Sí, yo soy de __.",
        // правильный ответ — одно слово
        answerEs: "Francia",
        options: ["Francia", "México", "taco", "gracias", "chao"],
        ttsText: "Sí, yo soy de Francia.",
      },
      {
        type: "audio",
        badge: "АУДИО",
        title: "Что вы услышали?",
        promptRu: "Нажми 🔊 и собери фразу 👂",
        answerEs: "Yo soy Ana encantada",
        ttsText: "Yo soy Ana, encantada",
        extraWords: ["helado", "tú"],
      },
    ],
  },
];

/* =========================================================
   App state
========================================================= */
let progress = loadProgress();
let settings = loadSettings();

let currentScreen = "path";
let picked = [];     // выбранные слова
let bank = [];       // слова в банке
let lastAnswerWasCorrect = false;
let currentTask = null;

let userInteracted = false; // важно для автозвучки на мобиле/iOS

/* =========================================================
   TTS (speechSynthesis) — стабильный вариант без дублей
========================================================= */
let voicesCache = [];
let voicesReadyPromise = null;

function getVoicesSafe() {
  try {
    if (!("speechSynthesis" in window)) return [];
    return window.speechSynthesis.getVoices() || [];
  } catch {
    return [];
  }
}

function ensureVoicesReady() {
  if (!("speechSynthesis" in window)) return Promise.resolve([]);

  // если уже есть — ок
  const existing = getVoicesSafe();
  if (existing.length) {
    voicesCache = existing;
    return Promise.resolve(existing);
  }

  if (voicesReadyPromise) return voicesReadyPromise;

  voicesReadyPromise = new Promise((resolve) => {
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      const v = getVoicesSafe();
      if (v.length) voicesCache = v;
      resolve(v);
    };

    // voiceschanged
    try {
      window.speechSynthesis.onvoiceschanged = () => finish();
    } catch {}

    // fallback polling
    const start = Date.now();
    const timer = setInterval(() => {
      const v = getVoicesSafe();
      if (v.length || Date.now() - start > 2000) {
        clearInterval(timer);
        finish();
      }
    }, 120);
  });

  return voicesReadyPromise;
}

function pickSpanishVoice(voices) {
  if (!voices || !voices.length) return null;

  // 1) если выбран конкретный voiceURI
  if (settings.voiceURI) {
    const exact = voices.find(v => v.voiceURI === settings.voiceURI);
    if (exact) return exact;
  }

  // 2) авто: любой испанский
  const es = voices.filter(v => (v.lang || "").toLowerCase().startsWith("es"));
  if (es.length) {
    // чуть приоритетнее «Google/Apple/Microsoft»
    const preferred = es.find(v => /google|apple|microsoft/i.test(v.name));
    return preferred || es[0];
  }

  // 3) если нет испанского — вернём любой
  return voices[0];
}

async function speak(text, { lang = "es-ES" } = {}) {
  if (!text || !text.trim()) return;

  if (!("speechSynthesis" in window)) {
    toast("Озвучка недоступна в этом браузере");
    return;
  }

  try {
    userInteracted = true;

    await ensureVoicesReady();
    const voices = voicesCache.length ? voicesCache : getVoicesSafe();
    const voice = pickSpanishVoice(voices);

    // сбросим предыдущие
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;

    if (voice) u.voice = voice;

    // слегка мягче звучит
    u.rate = 0.95;
    u.pitch = 1.0;

    // иногда iOS "залипает" на paused
    try { window.speechSynthesis.resume(); } catch {}

    window.speechSynthesis.speak(u);
  } catch (e) {
    console.error(e);
    toast("Не получилось озвучить 😕");
  }
}

/* =========================================================
   UI: screens
========================================================= */
function setActiveTab(screen) {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.classList.toggle("isActive", btn.dataset.go === screen);
  });
}

function setActiveScreen(screen) {
  currentScreen = screen;
  setActiveTab(screen);

  document.querySelectorAll(".screen").forEach(s => s.classList.remove("isActive"));
  const map = {
    path: "screenPath",
    practice: "screenPractice",
    stats: "screenStats",
    settings: "screenSettings",
  };
  el(map[screen]).classList.add("isActive");

  // при уходе из практики — чистим только временное
  if (screen !== "practice") {
    picked = [];
    bank = [];
    currentTask = null;
    hideResultSheet();
    el("btnCheck").disabled = true;
  }

  // ререндер нужного экрана
  if (screen === "path") renderPath();
  if (screen === "stats") renderStats();
  if (screen === "settings") renderSettings();
  if (screen === "practice") openPracticeFromProgress();
}

/* =========================================================
   Top UI
========================================================= */
function updateTopBar() {
  el("chipXp").textContent = String(progress.totalXp);
  el("chipStreak").textContent = String(progress.streak);
  el("chipStars").textContent = String(progress.stars);

  // условный прогресс-бар: 50 XP цель дня
  const pct = clamp((progress.todayXp / 50) * 100, 0, 100);
  el("barFill").style.width = `${pct}%`;

  el("miniTodayXp").textContent = String(progress.todayXp);

  const acc = progress.answersToday > 0
    ? Math.round((progress.correctToday / progress.answersToday) * 100)
    : 0;
  el("miniAccuracy").textContent = String(acc);
}

/* =========================================================
   Path
========================================================= */
function renderPath() {
  updateTopBar();

  const list = el("pathList");
  list.innerHTML = "";

  lessons.forEach((lesson, idx) => {
    const row = document.createElement("div");
    row.className = "lessonRow " + (idx % 2 === 0 ? "left" : "right");

    const card = document.createElement("div");
    card.className = "lessonCard";

    const left = document.createElement("div");
    left.className = "lessonLeft";
    left.innerHTML = `
      <div class="lessonTitle">${lesson.title}</div>
      <div class="lessonSub">${lesson.sub}</div>
    `;

    const btn = document.createElement("button");
    btn.className = "lessonBtn";
    btn.type = "button";

    const isLocked = idx > progress.lessonIndex;
    const isCurrent = idx === progress.lessonIndex;

    if (isLocked) {
      btn.textContent = "Закрыто";
      btn.classList.add("locked");
      btn.disabled = true;
    } else {
      btn.textContent = isCurrent ? "Продолжить" : "Открыть";
      btn.addEventListener("click", () => {
        progress.lessonIndex = idx;
        // если открываем новый урок — начинаем с 0 задания
        if (!isCurrent) progress.taskIndex = 0;
        saveProgress();
        setActiveScreen("practice");
      });
    }

    card.appendChild(left);
    card.appendChild(btn);
    row.appendChild(card);
    list.appendChild(row);
  });
}

/* =========================================================
   Practice
========================================================= */
function getCurrentLesson() {
  const idx = clamp(progress.lessonIndex, 0, lessons.length - 1);
  return lessons[idx];
}

function getCurrentTask() {
  const lesson = getCurrentLesson();
  const ti = clamp(progress.taskIndex, 0, lesson.tasks.length - 1);
  return lesson.tasks[ti];
}

function openPracticeFromProgress() {
  updateTopBar();
  currentTask = getCurrentTask();
  renderTask(currentTask);

  // важное: на мобиле голоса могут грузиться позже
  ensureVoicesReady().then(() => {
    if (currentScreen === "settings") renderSettings();
  });
}

function normalizeText(s) {
  return (s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildBankForTask(task) {
  if (task.type === "translate") {
    // ответ — фраза, банк — слова из ответа + 2 лишних
    const words = task.answerEs.split(" ");
    const extra = ["hola", "por", "favor"];
    return shuffle([...words, ...extra.slice(0, 2)]);
  }

  if (task.type === "fill") {
    return shuffle([...(task.options || [])]);
  }

  if (task.type === "audio") {
    const words = task.answerEs.split(" ");
    const extra = task.extraWords || [];
    return shuffle([...words, ...extra]);
  }

  return [];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderTask(task) {
  hideResultSheet();
  lastAnswerWasCorrect = false;

  picked = [];
  bank = buildBankForTask(task);

  // UI labels
  el("taskBadge").textContent = task.badge || "Задание";
  el("taskTitle").textContent = task.title || "—";

  // prompt
  if (task.type === "translate") {
    el("taskPrompt").textContent = `Собери перевод на испанский: ${task.promptRu}`;
  } else if (task.type === "fill") {
    el("taskPrompt").textContent = task.promptRu;
  } else if (task.type === "audio") {
    el("taskPrompt").textContent = task.promptRu;
  } else {
    el("taskPrompt").textContent = "—";
  }

  // draw slots/bank
  redrawSlots();
  redrawBank();

  el("btnCheck").disabled = true;

  // автоозвучка только после реального взаимодействия пользователя
  if (settings.autoSpeak && userInteracted && task.type === "audio") {
    speak(task.ttsText || task.answerEs);
  }
}

function redrawSlots() {
  const slots = el("answerSlots");
  slots.innerHTML = "";
  picked.forEach((w, idx) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "word";
    b.textContent = w;
    b.addEventListener("click", () => {
      // вернуть слово обратно в банк
      const removed = picked.splice(idx, 1)[0];
      bank.push(removed);
      redrawSlots();
      redrawBank();
      el("btnCheck").disabled = picked.length === 0;
    });
    slots.appendChild(b);
  });
}

function redrawBank() {
  const wrap = el("wordBank");
  wrap.innerHTML = "";
  bank.forEach((w, idx) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "word";
    b.textContent = w;
    b.addEventListener("click", () => {
      userInteracted = true;

      // убрать из банка и добавить в ответ
      const word = bank.splice(idx, 1)[0];
      picked.push(word);
      redrawSlots();
      redrawBank();
      el("btnCheck").disabled = picked.length === 0;
    });
    wrap.appendChild(b);
  });
}

function expectedAnswer(task) {
  // правильный ответ
  if (task.type === "fill") return task.answerEs;
  return task.answerEs;
}

function currentAnswer() {
  return picked.join(" ");
}

function awardXp(xp) {
  const t = todayISO();
  // если новый день — дневные счетчики уже обнулены в loadProgress,
  // но streak обновляем на первом ответе в день:
  if (progress.day !== t) {
    progress.day = t;
    progress.todayXp = 0;
    progress.answersToday = 0;
    progress.correctToday = 0;
  }

  // streak: если это первый ответ сегодня
  const firstAnswerToday = progress.answersToday === 0;
  if (firstAnswerToday) {
    const y = yesterdayISO();
    // если вчера тоже был прогресс — увеличиваем, иначе начинаем с 1
    // (мы не знаем точно был ли прогресс вчера, но streak логика тут простая)
    // Более точная — хранить lastActiveDay; пока так.
    if (progress.streak === 0) progress.streak = 1;
    else {
      // если вчера был активен, то streak++ (приближенно)
      // если хочешь точнее — добавим lastActiveDay в следующем шаге
      progress.streak = progress.streak + 1;
    }
  }

  progress.totalXp += xp;
  progress.todayXp += xp;
  saveProgress();
  updateTopBar();
}

function recordAnswer(isCorrect) {
  progress.answersToday += 1;
  if (isCorrect) progress.correctToday += 1;
  saveProgress();
  updateTopBar();
}

/* =========================================================
   Result sheet
========================================================= */
function showResultSheet({ ok, title, sub }) {
  const sheet = el("resultSheet");
  el("resultTitle").textContent = title;
  el("resultSub").textContent = sub;

  // зелёная плашка всегда зелёная (как ты хотел),
  // но текст меняется: ок/ошибка
  sheet.classList.remove("hidden");
  el("btnCheck").style.visibility = "hidden";
}

function hideResultSheet() {
  const sheet = el("resultSheet");
  sheet.classList.add("hidden");
  el("btnCheck").style.visibility = "visible";
}

/* =========================================================
   Move next task/lesson
========================================================= */
function goNextAfterCorrect() {
  const lesson = getCurrentLesson();
  const lastTaskIndex = lesson.tasks.length - 1;

  if (progress.taskIndex < lastTaskIndex) {
    progress.taskIndex += 1;
    saveProgress();
    currentTask = getCurrentTask();
    renderTask(currentTask);
    return;
  }

  // урок завершен → звезда + открываем следующий урок (если есть)
  progress.stars += 1;

  if (progress.lessonIndex < lessons.length - 1) {
    progress.lessonIndex += 1;
    progress.taskIndex = 0;
  } else {
    // если это последний урок — просто оставим на конце
    progress.taskIndex = lastTaskIndex;
  }

  saveProgress();
  setActiveScreen("path");
  toast("Урок завершён 🎉");
}

/* =========================================================
   Stats & Settings
========================================================= */
function renderStats() {
  updateTopBar();

  el("stTotalXp").textContent = String(progress.totalXp);
  el("stStreak").textContent = String(progress.streak);
  el("stAnswersToday").textContent = String(progress.answersToday);

  const acc = progress.answersToday > 0
    ? Math.round((progress.correctToday / progress.answersToday) * 100)
    : 0;
  el("stAccuracyToday").textContent = `${acc}%`;

  el("stWordsLearned").textContent = String(progress.wordsLearned);
}

async function renderSettings() {
  updateTopBar();

  el("chkAutoSpeak").checked = !!settings.autoSpeak;

  // voices
  const select = el("voiceSelect");

  // не ломаем текущий selected при ререндере
  const currentValue = settings.voiceURI || "";

  await ensureVoicesReady();
  const voices = voicesCache.length ? voicesCache : getVoicesSafe();
  const esVoices = voices.filter(v => (v.lang || "").toLowerCase().startsWith("es"));

  select.innerHTML = `<option value="">Авто (лучший испанский)</option>`;
  esVoices.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} — ${v.lang}`;
    select.appendChild(opt);
  });

  select.value = esVoices.some(v => v.voiceURI === currentValue) ? currentValue : "";
}

/* =========================================================
   Export / Import / Sync
========================================================= */
function makeExportPayload() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    progress,
    settings,
  };
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

/* =========================================================
   Init / Events
========================================================= */
function wireTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      userInteracted = true;
      setActiveScreen(btn.dataset.go);
    });
  });
}

function wirePractice() {
  el("btnSpeak").addEventListener("click", () => {
    userInteracted = true;
    const task = currentTask || getCurrentTask();
    speak(task.ttsText || task.answerEs);
  });

  el("btnCheck").addEventListener("click", () => {
    userInteracted = true;
    if (!currentTask) return;

    const want = normalizeText(expectedAnswer(currentTask));
    const got = normalizeText(currentAnswer());

    const ok = got === want;

    recordAnswer(ok);

    if (ok) {
      lastAnswerWasCorrect = true;

      // XP + условно считаем "слова выучены" по первому заданию
      awardXp(10);

      // words learned: грубо — +1 за правильный ответ в translate
      if (currentTask.type === "translate") {
        progress.wordsLearned += 1;
        saveProgress();
      }

      showResultSheet({
        ok: true,
        title: "Потрясающе! ✅",
        sub: "+10 XP",
      });
    } else {
      lastAnswerWasCorrect = false;
      showResultSheet({
        ok: false,
        title: "Почти! 😅",
        sub: "Попробуй ещё раз",
      });
    }
  });

  el("btnNext").addEventListener("click", () => {
    userInteracted = true;
    hideResultSheet();

    if (lastAnswerWasCorrect) {
      goNextAfterCorrect();
    } else {
      // оставить то же задание, просто дать пробовать ещё
      el("btnCheck").disabled = picked.length === 0;
    }
  });
}

function wireSettings() {
  el("chkAutoSpeak").addEventListener("change", (e) => {
    userInteracted = true;
    settings.autoSpeak = !!e.target.checked;
    saveSettings();
    toast("Сохранено");
  });

  el("voiceSelect").addEventListener("change", (e) => {
    userInteracted = true;
    settings.voiceURI = String(e.target.value || "");
    saveSettings();
    toast("Голос сохранён");
  });

  el("btnExport").addEventListener("click", () => {
    userInteracted = true;
    const payload = makeExportPayload();
    downloadJSON(payload, `spanish-trainer-export-${todayISO()}.json`);
    toast("Экспорт готов ✅");
  });

  el("btnImport").addEventListener("click", () => {
    userInteracted = true;
    el("importFile").click();
  });

  el("importFile").addEventListener("change", async (e) => {
    userInteracted = true;
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = safeJSONParse(text);

      if (!parsed || typeof parsed !== "object") {
        toast("Файл не похож на JSON 😕");
        return;
      }

      // поддержим и полный экспорт, и просто прогресс
      const importedProgress = parsed.progress || parsed;
      const importedSettings = parsed.settings;

      if (importedProgress && typeof importedProgress === "object") {
        progress = { ...defaultProgress(), ...importedProgress };

        // day rollover
        const t = todayISO();
        if (progress.day !== t) {
          progress.day = t;
          progress.todayXp = 0;
          progress.answersToday = 0;
          progress.correctToday = 0;
        }

        saveProgress();
      }

      if (importedSettings && typeof importedSettings === "object") {
        settings = { ...defaultSettings(), ...importedSettings };
        saveSettings();
      }

      updateTopBar();
      renderPath();
      renderStats();
      renderSettings();
      toast("Импорт применён ✅");
    } catch (err) {
      console.error(err);
      toast("Ошибка импорта 😕");
    } finally {
      e.target.value = "";
    }
  });

  el("btnSync").addEventListener("click", async () => {
    userInteracted = true;

    // простой “синк в бота”: копируем JSON-код, который можно вставить в бота
    const payload = makeExportPayload();
    const code = JSON.stringify(payload);

    const ok = await copyToClipboard(code);
    if (ok) toast("Код синка скопирован ✅");
    else toast("Не удалось скопировать 😕");
  });

  el("btnReset").addEventListener("click", () => {
    userInteracted = true;
    if (!confirm("Точно сбросить прогресс?")) return;

    progress = defaultProgress();
    settings = { ...settings }; // настройки не сбрасываем
    saveProgress();
    updateTopBar();
    renderPath();
    renderStats();
    toast("Прогресс сброшен");
  });
}

function wireClose() {
  el("btnClose").addEventListener("click", () => {
    userInteracted = true;

    // Telegram WebApp close (если доступно)
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg && typeof tg.close === "function") {
      tg.close();
      return;
    }

    // fallback
    toast("Закрыть можно из вкладки/приложения");
  });
}

function init() {
  // общий "unlock" для автозвучки: фикс iOS/Telegram
  document.addEventListener("pointerdown", () => { userInteracted = true; }, { once: true });

  wireTabs();
  wireClose();
  wirePractice();
  wireSettings();

  updateTopBar();
  renderPath();

  // стартовый экран — путь
  setActiveScreen("path");
}

init();
