/* Storage & Telegram helpers */
const STORAGE_KEY = "spanish_trainer_progress_v1";
const SETTINGS_KEY = "spanish_trainer_settings_v1";
const LEGACY_KEYS = ["duo_like_progress_v1", "spanish_trainer_progress"];

function tg() {
  return window.Telegram?.WebApp;
}

function hasCloudStorage() {
  return !!tg()?.CloudStorage;
}

function $(id) { 
  return document.getElementById(id); 
}

function showToast(text, ms = 2200) {
  let t = document.querySelector(".toast");
  if (!t) { 
    t = document.createElement("div"); 
    t.className = "toast"; 
    document.body.appendChild(t); 
  }
  t.textContent = text;
  t.style.display = "block";
  clearTimeout(showToast._tm);
  showToast._tm = setTimeout(() => (t.style.display = "none"), ms);
}

/* Cloud Storage */
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

/* Local Storage */
function localGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function localSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function safeParse(json) {
  try { return JSON.parse(json); } catch { return null; }
}

/* Progress Model */
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
    lessonProgress: {},
    achievements: [],
    vocab: {},
    dayKey: todayKey(),
    lastActive: todayKey()
  };
}

function defaultSettings() {
  return {
    theme: 'light',
    sounds: true,
    vibration: true
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

/* Load/Save Progress */
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
  if (hasCloudStorage()) {
    await cloudSet(STORAGE_KEY, raw);
  }
}

async function loadSettings() {
  const raw = localGet(SETTINGS_KEY);
  return raw ? safeParse(raw) : defaultSettings();
}

async function saveSettings(settings) {
  const raw = JSON.stringify(settings);
  localSet(SETTINGS_KEY, raw);
}

/* Sounds */
let audioContext;
try {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
} catch (e) {
  console.warn('⚠️ AudioContext недоступен:', e);
  audioContext = null;
}

function playSound(type) {
  if (!settings.sounds || !audioContext) return;
  
  try {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    if (type === 'correct') {
      osc.frequency.setValueAtTime(523.25, audioContext.currentTime);
      osc.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1);
      osc.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      osc.start(audioContext.currentTime);
      osc.stop(audioContext.currentTime + 0.3);
    } else if (type === 'wrong') {
      osc.frequency.setValueAtTime(200, audioContext.currentTime);
      osc.frequency.setValueAtTime(150, audioContext.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      osc.start(audioContext.currentTime);
      osc.stop(audioContext.currentTime + 0.3);
    }
  } catch (e) {
    console.warn('⚠️ Ошибка воспроизведения звука:', e);
  }
}

function vibrate(pattern) {
  if (!settings || !settings.vibration) return;
  
  try {
    const TG = tg();
    if (TG?.HapticFeedback) {
      if (pattern === 'success') {
        TG.HapticFeedback.notificationOccurred('success');
      } else if (pattern === 'error') {
        TG.HapticFeedback.notificationOccurred('error');
      } else {
        TG.HapticFeedback.impactOccurred('medium');
      }
    } else if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch (e) {
    console.warn('⚠️ Ошибка вибрации:', e);
  }
}

/* TTS */
let _voicesReady = false;
let _bestEsVoice = null;

function _scoreVoice(v) {
  const name = (v.name || "").toLowerCase();
  const lang = (v.lang || "").toLowerCase();
  let s = 0;
  if (lang === "es-es") s += 50;
  if (lang.startsWith("es")) s += 30;
  if (name.includes("neural")) s += 25;
  if (name.includes("natural")) s += 20;
  if (name.includes("premium")) s += 15;
  if (name.includes("google")) s += 18;
  if (name.includes("microsoft")) s += 16;
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
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "es-ES";
  u.rate = 0.95;
  u.pitch = 1.0;
  u.volume = 1.0;
  u.voice = _bestEsVoice || _pickBestEsVoice() || null;
  window.speechSynthesis.speak(u);
}

/* Lessons organized in modules */
const MODULES = [
  {
    id: 1,
    name: "Модуль 1",
    color: "yellow",
    lessons: [
      { id: 1, title: "Урок 1", sub: "Заказывайте в кафе", xp: 20, icon: "🧩" },
      { id: 2, title: "Урок 2", sub: "Приветствия", xp: 20, icon: "👋" },
      { id: 3, title: "Урок 3", sub: "Происхождение", xp: 20, icon: "🌍" },
      { id: 4, title: "Урок 4", sub: "Числа 1-10", xp: 20, icon: "🔢" },
      { id: 5, title: "Урок 5", sub: "Цвета", xp: 30, icon: "🎨" },
    ]
  },
  {
    id: 2,
    name: "Модуль 2",
    color: "purple",
    lessons: [
      { id: 6, title: "Урок 6", sub: "Семья", xp: 20, icon: "👨‍👩‍👧" },
      { id: 7, title: "Урок 7", sub: "Еда и напитки", xp: 20, icon: "🍕" },
      { id: 8, title: "Урок 8", sub: "Животные", xp: 20, icon: "🐶" },
      { id: 9, title: "Урок 9", sub: "Одежда", xp: 20, icon: "👕" },
      { id: 10, title: "Урок 10", sub: "Дом", xp: 30, icon: "🏠" },
    ]
  },
  {
    id: 3,
    name: "Модуль 3",
    color: "green",
    lessons: [
      { id: 11, title: "Урок 11", sub: "Погода", xp: 20, icon: "☀️" },
      { id: 12, title: "Урок 12", sub: "Время", xp: 20, icon: "⏰" },
      { id: 13, title: "Урок 13", sub: "Транспорт", xp: 20, icon: "🚗" },
      { id: 14, title: "Урок 14", sub: "Город", xp: 20, icon: "🏙️" },
      { id: 15, title: "Урок 15", sub: "Профессии", xp: 30, icon: "👨‍💼" },
    ]
  },
  {
    id: 4,
    name: "Модуль 4",
    color: "blue",
    lessons: [
      { id: 16, title: "Урок 16", sub: "Хобби", xp: 20, icon: "⚽" },
      { id: 17, title: "Урок 17", sub: "Путешествия", xp: 20, icon: "✈️" },
      { id: 18, title: "Урок 18", sub: "Покупки", xp: 20, icon: "🛒" },
      { id: 19, title: "Урок 19", sub: "Ресторан", xp: 20, icon: "🍽️" },
      { id: 20, title: "Урок 20", sub: "Больница", xp: 30, icon: "🏥" },
    ]
  },
  {
    id: 5,
    name: "Модуль 5",
    color: "red",
    lessons: [
      { id: 21, title: "Урок 21", sub: "Эмоции", xp: 20, icon: "😊" },
      { id: 22, title: "Урок 22", sub: "Описание", xp: 20, icon: "📝" },
      { id: 23, title: "Урок 23", sub: "Глаголы", xp: 20, icon: "🏃" },
      { id: 24, title: "Урок 24", sub: "Вопросы", xp: 20, icon: "❓" },
      { id: 25, title: "Урок 25", sub: "Итоговый тест", xp: 50, icon: "🏆" },
    ]
  }
];

// Flatten all lessons for easier access
const lessons = MODULES.flatMap(m => m.lessons.map(l => ({ ...l, module: m.id, moduleColor: m.color })));

const TASK_POOL = [
  // Модуль 1: Базовое
  { type: "translate", label: "НОВОЕ СЛОВО", title: "Переведи", prompt: "Hola", image: "👋", words: ["Привет"], correct: ["Привет"], module: 1 },
  { type: "choice", label: "ВЫБЕРИ ПЕРЕВОД", title: "Что означает 'Adiós'?", prompt: "Adiós", image: "👋", choices: [{text: "Пока", correct: true}, {text: "Привет", correct: false}, {text: "Спасибо", correct: false}], module: 1 },
  { type: "translate", label: "СОБЕРИ ФРАЗУ", title: "Переведи", prompt: "Gracias", image: "🙏", words: ["Спасибо"], correct: ["Спасибо"], module: 1 },
  { type: "audio", label: "АУДИО", title: "Что услышал?", prompt: "Por favor", words: ["По", "жа", "луй", "ста", "спасибо"], correct: ["По", "жа", "луй", "ста"], module: 1 },
  { type: "match", label: "СОПОСТАВЬ", title: "Соедини пары", pairs: [{spanish: "Hola", russian: "Привет"}, {spanish: "Adiós", russian: "Пока"}, {spanish: "Gracias", russian: "Спасибо"}], module: 1 },
  
  { type: "translate", label: "ЧИСЛА", title: "Переведи число", prompt: "uno", image: "1️⃣", words: ["один"], correct: ["один"], module: 1 },
  { type: "choice", label: "ВЫБЕРИ", title: "Сколько это?", prompt: "cinco", image: "🔢", choices: [{text: "5", correct: true}, {text: "3", correct: false}, {text: "7", correct: false}], module: 1 },
  { type: "translate", label: "ЦВЕТА", title: "Какой цвет?", prompt: "rojo", image: "🔴", words: ["красный"], correct: ["красный"], module: 1 },
  
  // Модуль 2: Семья и еда
  { type: "choice", label: "СЕМЬЯ", title: "Кто это?", prompt: "madre", image: "👩", choices: [{text: "мама", correct: true}, {text: "папа", correct: false}, {text: "сестра", correct: false}], module: 2 },
  { type: "translate", label: "ЕДА", title: "Что это?", prompt: "pan", image: "🍞", words: ["хлеб"], correct: ["хлеб"], module: 2 },
  { type: "image", label: "НАПИТОК", title: "Выбери слово", image: "☕", imageDesc: "Кофе", choices: [{text: "café", correct: true}, {text: "té", correct: false}, {text: "agua", correct: false}], module: 2 },
  { type: "match", label: "ЕДА", title: "Соедини", pairs: [{spanish: "agua", russian: "вода"}, {spanish: "pan", russian: "хлеб"}, {spanish: "leche", russian: "молоко"}], module: 2 },
  { type: "audio", label: "ЖИВОТНЫЕ", title: "Что услышал?", prompt: "El perro es grande", words: ["Собака", "большая", "кот", "маленький"], correct: ["Собака", "большая"], module: 2 },
  
  // Модуль 3: Погода и время
  { type: "choice", label: "ПОГОДА", title: "Какая погода?", prompt: "sol", image: "☀️", choices: [{text: "солнечно", correct: true}, {text: "дождь", correct: false}, {text: "снег", correct: false}], module: 3 },
  { type: "translate", label: "ВРЕМЯ", title: "Сколько времени?", prompt: "Es la una", image: "⏰", words: ["Час", "дня"], correct: ["Час", "дня"], module: 3 },
  { type: "type", label: "НАПИШИ", title: "Как сказать 'машина'?", prompt: "машина", image: "🚗", correctAnswer: "coche", module: 3 },
  
  // Модуль 4: Путешествия
  { type: "translate", label: "ПУТЕШЕСТВИЯ", title: "Переведи", prompt: "el avión", image: "✈️", words: ["самолёт"], correct: ["самолёт"], module: 4 },
  { type: "choice", label: "ГОРОД", title: "Где это?", prompt: "museo", image: "🏛️", choices: [{text: "музей", correct: true}, {text: "парк", correct: false}, {text: "магазин", correct: false}], module: 4 },
  { type: "match", label: "МЕСТА", title: "Соедини", pairs: [{spanish: "playa", russian: "пляж"}, {spanish: "montaña", russian: "гора"}, {spanish: "río", russian: "река"}], module: 4 },
  
  // Модуль 5: Продвинутый
  { type: "audio", label: "ДИАЛОГ", title: "Что услышал?", prompt: "¿Cómo estás? Estoy bien", words: ["Как", "дела", "хорошо", "плохо"], correct: ["Как", "дела", "хорошо"], module: 5 },
  { type: "type", label: "НАПИШИ ФРАЗУ", title: "Переведи 'Я студент'", prompt: "Я студент", image: "🎓", correctAnswer: "soy estudiante", module: 5 },
  { type: "choice", label: "ГРАММАТИКА", title: "Выбери правильный глагол", prompt: "Yo ___ español", choices: [{text: "hablo", correct: true}, {text: "hablas", correct: false}, {text: "habla", correct: false}], module: 5 },
];

// Function to get tasks for a specific lesson
function getTasksForLesson(lessonId) {
  const lesson = lessons.find(l => l.id === lessonId);
  if (!lesson) return [];
  
  // Get tasks from the same module
  const moduleTasks = TASK_POOL.filter(t => t.module === lesson.module);
  
  // Shuffle and take 5 tasks
  const shuffled = moduleTasks.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5);
}

const TASKS = TASK_POOL; // Keep for backward compatibility

/* Achievements */
const ACHIEVEMENTS = [
  { id: 'first_lesson', name: 'Первый шаг', desc: 'Пройди первый урок', icon: '🎯', check: (p) => p.xpTotal >= 10 },
  { id: 'streak_3', name: 'На разогреве', desc: '3 дня подряд', icon: '🔥', check: (p) => p.streak >= 3 },
  { id: 'streak_7', name: 'Неделя силы', desc: '7 дней подряд', icon: '💪', check: (p) => p.streak >= 7 },
  { id: 'xp_100', name: 'Сотка!', desc: 'Набери 100 XP', icon: '⭐', check: (p) => p.xpTotal >= 100 },
  { id: 'accuracy_90', name: 'Снайпер', desc: '90%+ точность', icon: '🎯', check: (p) => p.answeredToday > 0 && (p.correctToday / p.answeredToday) >= 0.9 },
  { id: 'lessons_5', name: 'Знаток', desc: 'Пройди 5 уроков', icon: '🧠', check: (p) => Object.keys(p.completed).length >= 5 },
];

function checkAchievements(prog) {
  const newAchievements = [];
  ACHIEVEMENTS.forEach(a => {
    if (!prog.achievements.includes(a.id) && a.check(prog)) {
      prog.achievements.push(a.id);
      newAchievements.push(a);
    }
  });
  return newAchievements;
}

function showAchievement(achievement) {
  vibrate('success');
  playSound('correct');
  showToast(`🏆 Достижение: ${achievement.name}!`, 3000);
}

/* State */
let progress = defaultProgress();
let settings = defaultSettings();
let activeScreen = "home";
let taskIndex = 0;
let currentTask = TASKS[0];
let currentLessonTasks = []; // Задания текущего урока
let picked = [];
let lastAnswerWasCorrect = false;
let correctStreak = 0;
let selectedPairs = [];
let selectedChoice = null;

/* Theme */
function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
  settings.theme = theme;
  saveSettings(settings);
}

/* Navigation */
function setActiveScreen(name) {
  console.log('🔄 Переключение на экран:', name);
  activeScreen = name;
  
  const screens = {
    home: $("screenHome"),
    path: $("screenPath"),
    practice: $("screenPractice"),
    stats: $("screenStats"),
    settings: $("screenSettings"),
  };

  console.log('📱 Найденные экраны:', Object.keys(screens).map(k => `${k}: ${screens[k] ? 'найден' : 'НЕ НАЙДЕН'}`));

  Object.entries(screens).forEach(([k, node]) => {
    if (node) {
      const isActive = k === name;
      node.classList.toggle("isActive", isActive);
      console.log(`  ${k}: ${isActive ? '✅ показан' : '❌ скрыт'}`);
    } else {
      console.log(`  ${k}: ⛔ элемент НЕ НАЙДЕН в DOM`);
    }
  });

  document.querySelectorAll(".tab").forEach(btn => {
    btn.classList.toggle("isActive", btn.dataset.go === name);
  });

  if (name === "path") renderPath();
  if (name === "stats") { renderTop(); renderAchievements(); }
  if (name === "settings") {
    console.log('⚙️ Вызываем renderSettings()');
    renderSettings();
  }
}

/* Render UI */
function renderTop() {
  $("xpTotal").textContent = String(progress.xpTotal);
  $("streak").textContent = String(progress.streak);
  $("energy").textContent = String(25);
  $("homeStreak").textContent = String(progress.streak);
  $("homeEnergy").textContent = String(25);
  $("todayXp").textContent = String(progress.correctToday * 10);
  
  const acc = progress.answeredToday 
    ? Math.round((progress.correctToday / progress.answeredToday) * 100) 
    : 0;
  $("acc").textContent = String(acc);
  $("sXp").textContent = String(progress.xpTotal);
  $("sStreak").textContent = String(progress.streak);
  $("sAnswered").textContent = String(progress.answeredToday);
  $("sAcc").textContent = `${acc}%`;
  $("sWords").textContent = String(progress.wordsLearned);

  const fill = Math.min(100, (progress.correctToday * 20));
  $("barFill").style.width = `${fill}%`;
}

function renderPath() {
  const list = $("pathList");
  list.innerHTML = "";

  MODULES.forEach((module, moduleIdx) => {
    // Module header
    const moduleHeader = document.createElement("div");
    moduleHeader.className = "moduleHeader";
    moduleHeader.innerHTML = `
      <div class="moduleName">${module.name}</div>
      <div class="moduleProgress">${getModuleProgress(module.id)}/5</div>
    `;
    list.appendChild(moduleHeader);

    // Module lessons
    module.lessons.forEach((l, idx) => {
      const row = document.createElement("div");
      row.className = "pathRow " + (idx % 2 === 0 ? "left" : "right");

      const node = document.createElement("button");
      const isCompleted = progress.completed[l.id] === true;
      const isPrevCompleted = idx === 0 || progress.completed[module.lessons[idx - 1].id];
      const isLocked = !isPrevCompleted && moduleIdx > 0;
      
      node.className = `pathNode pathNode-${module.color}`;
      if (isCompleted) node.classList.add("completed");
      if (isLocked) node.classList.add("locked");
      
      node.innerHTML = `
        <div class="nodeIcon">${l.icon}</div>
        <div class="nodeXp">+${l.xp} XP</div>
        ${isCompleted ? '<div class="nodeStars">⭐</div>' : ''}
        ${isLocked ? '<div class="nodeLock">🔒</div>' : ''}
      `;

      if (!isLocked) {
        node.addEventListener("click", () => {
          vibrate(50);
          showToast(`Начинаем: ${l.title}`);
          startPractice(l.id);
        });
      } else {
        node.addEventListener("click", () => {
          vibrate("error");
          showToast("Сначала пройди предыдущий урок!");
        });
      }

      row.appendChild(node);
      list.appendChild(row);
    });
  });
}

function getModuleProgress(moduleId) {
  const module = MODULES.find(m => m.id === moduleId);
  if (!module) return 0;
  return module.lessons.filter(l => progress.completed[l.id]).length;
}

function renderAchievements() {
  const grid = $("achievementGrid");
  grid.innerHTML = "";

  ACHIEVEMENTS.forEach(a => {
    const card = document.createElement("div");
    const unlocked = progress.achievements.includes(a.id);
    card.className = "achievementCard" + (unlocked ? " unlocked" : "");
    
    card.innerHTML = `
      <div class="achievementIcon">${a.icon}</div>
      <div class="achievementName">${a.name}</div>
      <div class="achievementDesc">${a.desc}</div>
    `;
    
    grid.appendChild(card);
  });
}

function renderSettings() {
  console.log('renderSettings called', settings);
  
  // Theme buttons
  const themeBtns = document.querySelectorAll('.themeBtn');
  console.log('Found theme buttons:', themeBtns.length);
  
  themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === settings.theme);
    btn.onclick = () => {
      vibrate(50);
      applyTheme(btn.dataset.theme);
      renderSettings();
    };
  });

  // Toggle switches
  const toggles = document.querySelectorAll('.toggle');
  console.log('Found toggles:', toggles.length);
  
  toggles.forEach(toggle => {
    const setting = toggle.dataset.setting;
    if (settings[setting] !== undefined) {
      toggle.classList.toggle('active', settings[setting]);
      toggle.onclick = () => {
        settings[setting] = !settings[setting];
        saveSettings(settings);
        vibrate(50);
        renderSettings();
      };
    }
  });
}

function renderTask() {
  currentTask = TASKS[taskIndex % TASKS.length];
  picked = [];

  $("taskLabel").textContent = currentTask.label;
  $("taskTitle").textContent = currentTask.title;
  $("promptText").textContent = currentTask.prompt;

  const chips = $("chips");
  chips.innerHTML = "";

  currentTask.words.forEach((w, idx) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = w;
    b.dataset.idx = String(idx);

    b.addEventListener("click", () => {
      if (b.disabled) return;
      vibrate(50);
      picked.push({ w, idx });
      b.disabled = true;
      b.classList.add("isPicked");
      renderAnswer();
      $("btnCheck").disabled = picked.length === 0;
    });

    chips.appendChild(b);
  });

  renderAnswer();
  $("feedback").textContent = "";
  $("btnCheck").disabled = true;
}

function renderAnswer() {
  const area = $("answerArea");
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
    t.className = "answerToken";
    t.textContent = p.w;

    t.addEventListener("click", () => {
      vibrate(50);
      const removed = picked.splice(pos, 1)[0];
      const chipBtn = $("chips").querySelector(`.chip[data-idx="${removed.idx}"]`);
      if (chipBtn) {
        chipBtn.disabled = false;
        chipBtn.classList.remove("isPicked");
      }
      renderAnswer();
      $("btnCheck").disabled = picked.length === 0;
    });

    area.appendChild(t);
  });
}

function animateTaskSwap(fnRender) {
  const card = $("taskCard");
  card.classList.add("taskSwapOut");
  setTimeout(() => {
    fnRender();
    requestAnimationFrame(() => {
      card.classList.remove("taskSwapOut");
    });
  }, 180);
}

/* Confetti */
function clearConfetti() {
  $("confetti").innerHTML = "";
}

function fireConfetti() {
  clearConfetti();
  const pieces = 50; // Больше частиц!
  const box = $("confetti");
  const colors = ['#58CC02', '#1CB0F6', '#FFC800', '#CE82FF', '#FF4B4B', '#FF6B9D'];
  const shapes = ['❤️', '⭐', '✨', '🎉', '🎊', '💚', '💙', '💛', '💜'];

  for (let i = 0; i < pieces; i++) {
    const p = document.createElement("div");
    p.className = "confettiPiece";
    
    // Случайная позиция по горизонтали
    p.style.left = Math.random() * 100 + "%";
    
    // Случайный цвет или эмодзи
    if (Math.random() > 0.5) {
      p.textContent = shapes[Math.floor(Math.random() * shapes.length)];
      p.style.fontSize = (10 + Math.random() * 20) + "px";
    } else {
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.width = (8 + Math.random() * 12) + "px";
      p.style.height = (8 + Math.random() * 12) + "px";
    }
    
    // Случайная форма
    p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    
    // Случайная задержка
    p.style.animationDelay = (Math.random() * 0.3) + "s";
    
    // Случайная длительность
    p.style.animationDuration = (0.8 + Math.random() * 0.6) + "s";
    
    box.appendChild(p);
  }

  setTimeout(clearConfetti, 1500);
}

/* Result Sheet */
function showResultSheet({ ok, title, sub }) {
  const sheet = $("resultSheet");
  sheet.classList.toggle("good", ok);
  sheet.classList.toggle("bad", !ok);
  $("resultTitle").textContent = title;
  $("resultSub").textContent = sub;
  $("btnResultNext").textContent = ok ? "ДАЛЕЕ" : "ПОНЯЛ";
  sheet.classList.remove("hidden");
  
  if (ok) {
    playSound('correct');
    vibrate('success');
    fireConfetti();
    $("taskCard").classList.add("correct");
    setTimeout(() => $("taskCard").classList.remove("correct"), 500);
  } else {
    playSound('wrong');
    vibrate('error');
    $("taskCard").classList.add("wrong");
    setTimeout(() => $("taskCard").classList.remove("wrong"), 500);
  }
}

function hideResultSheet() {
  $("resultSheet").classList.add("hidden");
}

/* Check Answer */
async function checkAnswer() {
  progress.answeredToday++;
  let ok = false;

  switch (currentTask.type) {
    case "translate":
    case "fill":
    case "audio":
      const userArr = picked.map(x => x.w);
      const correctArr = currentTask.correct || currentTask.words;
      ok = JSON.stringify(userArr) === JSON.stringify(correctArr);
      break;
      
    case "choice":
    case "image":
      ok = currentTask.choices[selectedChoice]?.correct === true;
      break;
      
    case "match":
      ok = selectedPairs.length === currentTask.pairs.length;
      break;
      
    case "type":
      const userAnswer = $("typeAnswer")?.value.trim().toLowerCase();
      const correctAnswer = currentTask.correctAnswer.toLowerCase();
      ok = userAnswer === correctAnswer;
      break;
  }

  lastAnswerWasCorrect = ok;
  $("btnCheck").disabled = true;

  if (ok) {
    correctStreak++;
    progress.correctToday++;
    progress.xpTotal += 10;
    
    if (progress._activeLessonId) {
      progress.completed[progress._activeLessonId] = true;
    }
    
    showResultSheet({
      ok: true,
      title: "Потрясающе! ✅",
      sub: "+10 XP"
    });
    
    const newAchievements = checkAchievements(progress);
    if (newAchievements.length > 0) {
      setTimeout(() => {
        newAchievements.forEach(a => showAchievement(a));
      }, 1500);
    }
  } else {
    correctStreak = 0; // Сбрасываем серию при ошибке
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

/* Start Practice */
function startPractice(lessonId = null) {
  if (lessonId) {
    progress._activeLessonId = lessonId;
  }
  setActiveScreen("practice");
  animateTaskSwap(() => renderTask());
}

/* Modal */
let modalResolver = null;

function openModal({ title, body, okText = "Ок", cancelText = "Отмена", showCancel = true }) {
  $("modalTitle").textContent = title || "Сообщение";
  $("modalBody").textContent = body || "";
  $("modalOk").textContent = okText;
  $("modalCancel").textContent = cancelText;
  $("modalCancel").style.display = showCancel ? "" : "none";
  $("modal").classList.remove("hidden");

  return new Promise((resolve) => {
    modalResolver = resolve;
  });
}

function closeModal(result) {
  $("modal").classList.add("hidden");
  if (modalResolver) {
    modalResolver(result);
    modalResolver = null;
  }
}

/* Exit/Back */
function exitOrBack() {
  if (activeScreen !== "home") {
    setActiveScreen("home");
    return;
  }
  const TG = tg();
  if (TG && typeof TG.initData === "string" && TG.initData.length > 0) {
    TG.close();
  }
}

/* Init */
async function init() {
  const TG = tg();
  if (TG) {
    TG.ready();
    TG.expand();
  }

  progress = await loadProgress();
  settings = await loadSettings();
  
  ensureDay(progress);
  await saveProgress(progress);
  
  applyTheme(settings.theme);
  renderTop();
  renderPath();
  setActiveScreen("home");

  // Tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => setActiveScreen(btn.dataset.go));
  });

  // Home
  const btnContinue = $("btnContinue");
  if (btnContinue) {
    btnContinue.addEventListener("click", () => startPractice());
  } else {
    console.error("❌ btnContinue не найдена");
  }

  const btnExport = $("btnExport");
  if (btnExport) {
    btnExport.addEventListener("click", async () => {
      const raw = JSON.stringify(progress, null, 2);
      await openModal({ title: "Экспорт", body: raw, showCancel: false, okText: "Закрыть" });
    });
  }

  const btnImport = $("btnImport");
  if (btnImport) {
    btnImport.addEventListener("click", async () => {
      await openModal({
        title: "Импорт",
        body: "Импорт сделаем красиво отдельным полем. Скажи — добавлю.",
        showCancel: false,
        okText: "Ок"
      });
    });
  }

  const btnSync = $("btnSync");
  if (btnSync) {
    btnSync.addEventListener("click", async () => {
      await saveProgress(progress);
      await openModal({ title: "Синк", body: "Сохранил в CloudStorage + localStorage ✅", showCancel: false });
    });
  }

  // Practice
  const btnCheck = $("btnCheck");
  if (btnCheck) {
    btnCheck.addEventListener("click", checkAnswer);
  }

  const btnAudio = $("btnAudio");
  if (btnAudio) {
    btnAudio.addEventListener("click", () => {
      vibrate(50);
      speakES(currentTask.prompt);
    });
  }

  const btnResultNext = $("btnResultNext");
  if (btnResultNext) {
    btnResultNext.addEventListener("click", () => {
      hideResultSheet();
      if (lastAnswerWasCorrect) {
        taskIndex++;
        animateTaskSwap(() => renderTask());
      } else {
        $("btnCheck").disabled = picked.length === 0;
        $("feedback").textContent = "";
      }
    });
  }

  // Stats & Settings - только одна кнопка сброса в настройках
  const btnResetSettings = $("btnResetSettings");
  if (btnResetSettings) {
    btnResetSettings.addEventListener("click", async () => {
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
      renderAchievements();
      await openModal({ title: "Готово", body: "Прогресс сброшен ✅", showCancel: false });
    });
  } else {
    console.warn("⚠️ btnResetSettings не найдена (это нормально, если ещё не зашли в настройки)");
  }

  // Force reload button
  const btnForceReload = $("btnForceReload");
  if (btnForceReload) {
    btnForceReload.addEventListener("click", async () => {
      showToast("Обновление приложения...", 1500);
      
      // Очистка Service Worker кэша
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
        }
      }
      
      // Очистка всех кэшей
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      
      setTimeout(() => {
        window.location.reload(true);
      }, 500);
    });
  }

  // Exit
  const btnExit = $("btnExit");
  if (btnExit) {
    btnExit.addEventListener("click", exitOrBack);
  }

  // Modal
  const modalOk = $("modalOk");
  if (modalOk) {
    modalOk.addEventListener("click", () => closeModal(true));
  }

  const modalCancel = $("modalCancel");
  if (modalCancel) {
    modalCancel.addEventListener("click", () => closeModal(false));
  }

  const modalX = $("modalX");
  if (modalX) {
    modalX.addEventListener("click", () => closeModal(false));
  }

  const modal = $("modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal(false);
    });
  }

  console.log("✅ Инициализация завершена");
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((e) => {
    console.error("❌ Критическая ошибка:", e);
    console.error("Stack trace:", e.stack);
    
    // Показываем пользователю читаемую ошибку
    const errorMsg = `Ошибка инициализации: ${e.message}`;
    showToast(errorMsg, 5000);
    
    // Пытаемся показать хотя бы главный экран
    try {
      const home = document.getElementById("screenHome");
      if (home) home.classList.add("isActive");
    } catch (e2) {
      console.error("Не удалось показать главный экран:", e2);
    }
  });
});

// Глобальный обработчик ошибок
window.addEventListener('error', (e) => {
  console.error('🔥 Глобальная ошибка:', e.error);
  console.error('В файле:', e.filename, 'строка:', e.lineno);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('🔥 Необработанный Promise:', e.reason);
});