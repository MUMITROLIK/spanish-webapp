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
/* Progress Model with Timezone Support */
function getTodayKeyWithTimezone() {
  // Получаем текущую дату в локальном часовом поясе пользователя
  const now = new Date();
  
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayKey() {
  return getTodayKeyWithTimezone();
}

function getYesterdayKey() {
  const now = new Date();
  // Вычитаем один день
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  const y = yesterday.getFullYear();
  const m = String(yesterday.getMonth() + 1).padStart(2, "0");
  const day = String(yesterday.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDaysDifference(date1Key, date2Key) {
  // Преобразуем строки формата "YYYY-MM-DD" в даты
  const [y1, m1, d1] = date1Key.split('-').map(Number);
  const [y2, m2, d2] = date2Key.split('-').map(Number);
  
  const dateA = new Date(y1, m1 - 1, d1);
  const dateB = new Date(y2, m2 - 1, d2);
  
  const diffTime = Math.abs(dateB - dateA);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

function saveUserTimezone() {
  // Вызываем после инициализации progress
  if (progress && !progress._userTimezone) {
    progress._userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    progress._timezoneOffset = new Date().getTimezoneOffset();
  }
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
    vocab: {}, // ВАЖНО: инициализируем пустым объектом
    dayKey: todayKey(),
    lastActive: todayKey(),
    _userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    _timezoneOffset: new Date().getTimezoneOffset()
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
  u.rate = 0.85; // Медленнее для лучшего понимания
  u.pitch = 1.0;
  u.volume = 0.9; // Чуть тише
  
  const voice = _bestEsVoice || _pickBestEsVoice();
  if (voice) {
    u.voice = voice;
  }
  
  // Добавляем обработчики событий для отладки
  u.onerror = (e) => console.warn("⚠️ TTS error:", e);
  u.onend = () => console.log("✅ TTS finished");
  
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
  
  // Проверяем, что массив достижений существует
  if (!prog.achievements) {
    prog.achievements = [];
  }
  
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
let wrongAnswers = []; // Массив неправильных ответов для повторения
let isReviewMode = false; // Режим повторения ошибок
let originalTasksCount = 0; // Количество заданий до начала повторения

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
    vocab: $("screenVocab"),
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
  if (name === "vocab") {
    console.log('📚 Вызываем renderVocab(), progress.vocab:', progress.vocab);
    renderVocab();
  }
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
    // Заголовок модуля с прогрессом
    const moduleHeader = document.createElement("div");
    moduleHeader.className = "moduleHeader";
    const moduleProgress = getModuleProgress(module.id);
    const isModuleComplete = moduleProgress === module.lessons.length;
    
    moduleHeader.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
        <div style="flex: 1;">
          <div class="moduleName" style="font-size: 20px; font-weight: 800; color: var(--text); margin-bottom: 4px;">
            ${module.name}
          </div>
          <div style="font-size: 14px; color: var(--text-light);">
            ${moduleProgress} / ${module.lessons.length} уроков
          </div>
        </div>
        ${isModuleComplete ? '<div style="font-size: 32px;">🏆</div>' : ''}
      </div>
      <div style="background: var(--bg-gray); height: 8px; border-radius: 999px; overflow: hidden; margin-bottom: 32px;">
        <div style="height: 100%; width: ${(moduleProgress / module.lessons.length) * 100}%; background: linear-gradient(90deg, ${getModuleColor(module.color)} 0%, ${getModuleColorDark(module.color)} 100%); border-radius: 999px; transition: width 0.5s ease;"></div>
      </div>
    `;
    list.appendChild(moduleHeader);

    // Уроки модуля
    module.lessons.forEach((l, idx) => {
      const row = document.createElement("div");
      row.className = "pathRow " + (idx % 2 === 0 ? "left" : "right");

      const node = document.createElement("button");
      const isCompleted = progress.completed[l.id] === true;
      const isPrevCompleted = idx === 0 ? (moduleIdx === 0 || getModuleProgress(MODULES[moduleIdx - 1].id) === MODULES[moduleIdx - 1].lessons.length) : progress.completed[module.lessons[idx - 1].id];
      const isLocked = !isPrevCompleted;
      const isCurrent = !isCompleted && isPrevCompleted;
      
      node.className = `pathNode pathNode-${module.color}`;
      if (isCompleted) node.classList.add("completed");
      if (isLocked) node.classList.add("locked");
      if (isCurrent) node.classList.add("current");
      
      node.innerHTML = `
        <div class="nodeIcon">${l.icon}</div>
        <div class="nodeXp">+${l.xp} XP</div>
        ${isCompleted ? '<div class="nodeStars">⭐</div>' : ''}
        ${isLocked ? '<div class="nodeLock">🔒</div>' : ''}
        ${isCurrent ? '<div class="nodePulse"></div>' : ''}
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

function getModuleColor(color) {
  const colors = {
    yellow: '#FFC800',
    purple: '#CE82FF',
    green: '#58CC02',
    blue: '#1CB0F6',
    red: '#FF4B4B'
  };
  return colors[color] || colors.green;
}

function getModuleColorDark(color) {
  const colors = {
    yellow: '#E6B000',
    purple: '#A855F7',
    green: '#46A302',
    blue: '#1290C6',
    red: '#CC3939'
  };
  return colors[color] || colors.green;
}

function renderVocab() {
  const vocabList = $("vocabList");
  if (!vocabList) return;
  
  vocabList.innerHTML = "";
  
  // Инициализируем vocab если его нет
  if (!progress.vocab) {
    progress.vocab = {};
  }
  
  const words = Object.entries(progress.vocab)
    .sort((a, b) => {
      // Сначала новые слова
      if (a[1].isNew && !b[1].isNew) return -1;
      if (!a[1].isNew && b[1].isNew) return 1;
      // Потом по дате добавления (новые первые)
      return b[1].firstSeen - a[1].firstSeen;
    });
  
  if (words.length === 0) {
    vocabList.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--text-light);">
        <div style="font-size: 64px; margin-bottom: 20px;">📚</div>
        <div style="font-size: 20px; font-weight: 800; margin-bottom: 12px; color: var(--text);">Словарь пуст</div>
        <div style="font-size: 16px; line-height: 1.6;">
          Начни учить слова в уроках,<br>и они появятся здесь!
        </div>
      </div>
    `;
    return;
  }
  
  // Статистика сверху
  const statsCard = document.createElement("div");
  statsCard.style.cssText = `
    background: linear-gradient(135deg, #CE82FF 0%, #A855F7 100%);
    border-radius: 20px;
    padding: 24px;
    margin-bottom: 24px;
    color: white;
  `;
  
  const newWordsCount = words.filter(([, data]) => data.isNew).length;
  const learnedWordsCount = words.filter(([, data]) => !data.isNew).length;
  
  statsCard.innerHTML = `
    <div style="font-size: 16px; opacity: 0.9; margin-bottom: 16px;">Твой прогресс</div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
      <div style="background: rgba(255,255,255,0.2); padding: 16px; border-radius: 12px; backdrop-filter: blur(10px);">
        <div style="font-size: 32px; font-weight: 800; margin-bottom: 4px;">${newWordsCount}</div>
        <div style="font-size: 13px; opacity: 0.9;">Новых слов</div>
      </div>
      <div style="background: rgba(255,255,255,0.2); padding: 16px; border-radius: 12px; backdrop-filter: blur(10px);">
        <div style="font-size: 32px; font-weight: 800; margin-bottom: 4px;">${learnedWordsCount}</div>
        <div style="font-size: 13px; opacity: 0.9;">Изучено</div>
      </div>
    </div>
  `;
  
  vocabList.appendChild(statsCard);
  
  // Список слов
  words.forEach(([key, data]) => {
    const wordCard = document.createElement("div");
    wordCard.className = "vocabCard";
    
    if (data.isNew) {
      wordCard.style.borderLeft = "4px solid #CE82FF";
    }
    
    const date = new Date(data.firstSeen);
    const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    
    wordCard.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <div style="font-size: 22px; font-weight: 800; color: var(--text);">
              ${data.spanish || data.word}
            </div>
            ${data.isNew ? '<span style="background: linear-gradient(135deg, #CE82FF 0%, #A855F7 100%); color: white; font-size: 10px; font-weight: 800; padding: 4px 8px; border-radius: 6px; text-transform: uppercase;">Новое</span>' : ''}
          </div>
          <div style="font-size: 13px; color: var(--text-light); display: flex; align-items: center; gap: 12px;">
            <span>✅ ${data.timesCorrect} раз</span>
            <span>•</span>
            <span>📅 ${dateStr}</span>
          </div>
        </div>
        <button class="iconBtn" onclick="speakES('${data.spanish || data.word}'); vibrate(50);" style="flex-shrink: 0;">
          🔊
        </button>
      </div>
    `;
    
    vocabList.appendChild(wordCard);
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
  
  // Обновляем информацию о часовом поясе
  const timezoneDisplay = $("timezoneDisplay");
  const currentTimeDisplay = $("currentTimeDisplay");
  const todayKeyDisplay = $("todayKeyDisplay");
  const lastActiveDisplay = $("lastActiveDisplay");
  const streakDisplay = $("streakDisplay");
  
  if (timezoneDisplay) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offset = -new Date().getTimezoneOffset() / 60;
    const offsetStr = offset >= 0 ? `+${offset}` : offset;
    timezoneDisplay.textContent = `${timezone} (UTC${offsetStr})`;
  }
  
  if (currentTimeDisplay) {
    const now = new Date();
    currentTimeDisplay.textContent = now.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
  
  if (todayKeyDisplay) {
    todayKeyDisplay.textContent = todayKey();
  }
  
  if (lastActiveDisplay) {
    lastActiveDisplay.textContent = progress.lastActive || 'никогда';
  }
  
  if (streakDisplay) {
    streakDisplay.textContent = `${progress.streak} ${getDaysWord(progress.streak)}`;
  }
  
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
  
  console.log('⏰ Timezone info:', {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offset: -new Date().getTimezoneOffset() / 60,
    today: todayKey(),
    lastActive: progress.lastActive,
    streak: progress.streak
  });
}

function renderTask() {
  // Используем задания текущего урока или все задания
  const tasksPool = currentLessonTasks.length > 0 ? currentLessonTasks : TASKS;
  
  if (taskIndex >= tasksPool.length) {
    // Урок завершен!
    if (progress._activeLessonId) {
      const lesson = lessons.find(l => l.id === progress._activeLessonId);
      progress.completed[progress._activeLessonId] = true;
      progress.xpTotal += lesson ? lesson.xp : 20;
      saveProgress(progress);
      
      showToast(`🎉 Урок завершен! +${lesson ? lesson.xp : 20} XP`, 3000);
      setTimeout(() => {
        setActiveScreen("path");
      }, 2000);
    } else {
      showToast("✅ Все задания выполнены!");
      setActiveScreen("home");
    }
    return;
  }
  
  currentTask = tasksPool[taskIndex];
  picked = [];
  selectedChoice = null;
  selectedPairs = [];

  $("taskLabel").textContent = currentTask.label || "ЗАДАНИЕ";
  $("taskTitle").textContent = currentTask.title || "Переведи";
  $("promptText").textContent = currentTask.prompt || "";

  // Очищаем все контейнеры
  const chips = $("chips");
  const answerArea = $("answerArea");
  chips.innerHTML = "";
  answerArea.innerHTML = "";

  // Рендерим в зависимости от типа задания
  switch (currentTask.type) {
    case "translate":
    case "audio":
    case "fill":
      renderTranslateTask();
      break;
      
    case "choice":
    case "image":
      renderChoiceTask();
      break;
      
    case "match":
      renderMatchTask();
      break;
      
    case "type":
      renderTypeTask();
      break;
      
    default:
      renderTranslateTask();
  }

  $("feedback").textContent = "";
  $("btnCheck").disabled = true;
}

function renderTranslateTask() {
  const chips = $("chips");
  const words = currentTask.words || [];
  
  words.forEach((w, idx) => {
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
}

function renderChoiceTask() {
  const chips = $("chips");
  chips.innerHTML = "";
  
  const choicesContainer = document.createElement("div");
  choicesContainer.className = "choices";
  
  (currentTask.choices || []).forEach((choice, idx) => {
    const btn = document.createElement("button");
    btn.className = "choiceBtn";
    btn.textContent = choice.text;
    btn.dataset.idx = String(idx);
    
    btn.addEventListener("click", () => {
      vibrate(50);
      document.querySelectorAll(".choiceBtn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedChoice = idx;
      $("btnCheck").disabled = false;
    });
    
    choicesContainer.appendChild(btn);
  });
  
  chips.appendChild(choicesContainer);
  
  const answerArea = $("answerArea");
  answerArea.innerHTML = '<div class="answerHint">Выбери правильный ответ</div>';
}

function renderMatchTask() {
  const chips = $("chips");
  chips.innerHTML = "";
  
  const matchContainer = document.createElement("div");
  matchContainer.className = "matchPairs";
  matchContainer.innerHTML = '<div class="matchHint">Соедини пары</div>';
  
  const leftColumn = document.createElement("div");
  leftColumn.className = "matchColumn";
  
  const rightColumn = document.createElement("div");
  rightColumn.className = "matchColumn";
  
  const pairs = currentTask.pairs || [];
  const shuffledRight = [...pairs].sort(() => Math.random() - 0.5);
  
  pairs.forEach((pair, idx) => {
    const leftBtn = document.createElement("button");
    leftBtn.className = "matchBtn";
    leftBtn.textContent = pair.spanish;
    leftBtn.dataset.idx = String(idx);
    leftBtn.dataset.side = "left";
    
    leftBtn.addEventListener("click", () => handleMatchClick(leftBtn, idx, "left"));
    leftColumn.appendChild(leftBtn);
  });
  
  shuffledRight.forEach((pair, idx) => {
    const rightIdx = pairs.findIndex(p => p.russian === pair.russian);
    const rightBtn = document.createElement("button");
    rightBtn.className = "matchBtn";
    rightBtn.textContent = pair.russian;
    rightBtn.dataset.idx = String(rightIdx);
    rightBtn.dataset.side = "right";
    
    rightBtn.addEventListener("click", () => handleMatchClick(rightBtn, rightIdx, "right"));
    rightColumn.appendChild(rightBtn);
  });
  
  matchContainer.appendChild(leftColumn);
  matchContainer.appendChild(rightColumn);
  chips.appendChild(matchContainer);
  
  const answerArea = $("answerArea");
  answerArea.innerHTML = '<div class="answerHint">Нажми на испанское слово, затем на его перевод</div>';
}

let matchSelection = null;
/* Review Mode */
function startReviewMode() {
  isReviewMode = true;
  currentLessonTasks = [...wrongAnswers];
  wrongAnswers = [];
  taskIndex = 0;
  
  showToast(`📝 Повторим ошибки (${currentLessonTasks.length} заданий)`, 2500);
  
  setTimeout(() => {
    animateTaskSwap(() => renderTask());
  }, 2000);
}

function finishLesson() {
  if (progress._activeLessonId) {
    const lesson = lessons.find(l => l.id === progress._activeLessonId);
    progress.completed[progress._activeLessonId] = true;
    progress.xpTotal += lesson ? lesson.xp : 20;
    
    // Проверяем серию (streak)
    updateStreak();
    
    saveProgress(progress);
    
    // Показываем экран завершения урока
    showLessonCompleteScreen(lesson);
  } else {
    showToast("✅ Все задания выполнены!");
    setActiveScreen("home");
  }
}

function updateStreak() {
  const today = todayKey();
  const yesterday = getYesterdayKey();
  
  console.log('🔥 Проверка streak:', {
    today,
    yesterday,
    lastActive: progress.lastActive,
    currentStreak: progress.streak
  });
  
  // Если уже занимались сегодня, серия не меняется
  if (progress.lastActive === today) {
    console.log('✅ Уже занимались сегодня, streak не меняется');
    return;
  }
  
  // Если занимались вчера, продолжаем серию
  if (progress.lastActive === yesterday) {
    progress.streak++;
    console.log('🔥 Занимались вчера, продолжаем серию:', progress.streak);
  } 
  // Если это первое занятие или пропустили день
  else if (!progress.lastActive || progress.lastActive === '') {
    progress.streak = 1;
    console.log('⭐ Первое занятие, начинаем серию');
  }
  // Если пропустили больше одного дня
  else {
    const daysSinceLastActive = getDaysDifference(progress.lastActive, today);
    console.log('📅 Дней с последнего занятия:', daysSinceLastActive);
    
    if (daysSinceLastActive === 1) {
      // Вчера
      progress.streak++;
      console.log('🔥 Продолжаем серию:', progress.streak);
    } else {
      // Пропустили день(и)
      progress.streak = 1;
      console.log('💔 Пропустили день, сбрасываем серию');
    }
  }
  
  progress.lastActive = today;
  saveProgress(progress);
}

function getYesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function showLessonCompleteScreen(lesson) {
  const modal = $("modal");
  const modalCard = modal.querySelector(".modalCard");
  
  modalCard.innerHTML = `
    <div style="padding: 40px; text-align: center; background: linear-gradient(135deg, #58CC02 0%, #46A302 100%); border-radius: 20px;">
      <div style="font-size: 80px; margin-bottom: 20px;">🎉</div>
      <div style="font-size: 32px; font-weight: 800; color: white; margin-bottom: 12px;">
        Урок завершён!
      </div>
      <div style="font-size: 20px; color: rgba(255,255,255,0.9); margin-bottom: 24px;">
        ${lesson ? lesson.title : 'Отличная работа'}
      </div>
      <div style="background: rgba(255,255,255,0.2); padding: 20px; border-radius: 16px; backdrop-filter: blur(10px); margin-bottom: 24px;">
        <div style="font-size: 48px; font-weight: 800; color: white;">
          +${lesson ? lesson.xp : 20} XP
        </div>
      </div>
      ${progress.streak > 0 ? `
        <div style="background: rgba(255,255,255,0.2); padding: 16px; border-radius: 16px; backdrop-filter: blur(10px); margin-bottom: 24px;">
          <div style="font-size: 40px; margin-bottom: 8px;">🔥</div>
          <div style="font-size: 24px; font-weight: 700; color: white;">
            Серия: ${progress.streak} ${getDaysWord(progress.streak)}
          </div>
          <div style="font-size: 14px; color: rgba(255,255,255,0.8); margin-top: 4px;">
            Огонь не угасает!
          </div>
        </div>
      ` : ''}
      <button class="btnPrimary" onclick="closeModal(); setActiveScreen('path');" style="width: 100%; background: white; color: var(--duo-green); margin-top: 8px;">
        Продолжить обучение
      </button>
    </div>
  `;
  
  modal.classList.remove("hidden");
  fireConfetti();
  playSound('correct');
  vibrate('success');
}

function getDaysWord(days) {
  if (days % 10 === 1 && days % 100 !== 11) return 'день';
  if ([2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100)) return 'дня';
  return 'дней';
}

function handleMatchClick(btn, idx, side) {
  if (btn.classList.contains("matched")) return;
  
  vibrate(50);
  
  if (!matchSelection) {
    matchSelection = { idx, side, btn };
    btn.classList.add("selected");
  } else {
    if (matchSelection.side === side) {
      matchSelection.btn.classList.remove("selected");
      matchSelection = { idx, side, btn };
      btn.classList.add("selected");
    } else {
      if (matchSelection.idx === idx) {
        matchSelection.btn.classList.remove("selected");
        matchSelection.btn.classList.add("matched");
        btn.classList.add("matched");
        selectedPairs.push({ left: matchSelection.idx, right: idx });
        
        playSound('correct');
        vibrate('success');
        
        matchSelection = null;
        
        if (selectedPairs.length === currentTask.pairs.length) {
          $("btnCheck").disabled = false;
        }
      } else {
        matchSelection.btn.classList.add("wrong");
        btn.classList.add("wrong");
        
        playSound('wrong');
        vibrate('error');
        
        setTimeout(() => {
          matchSelection.btn.classList.remove("selected", "wrong");
          btn.classList.remove("wrong");
          matchSelection = null;
        }, 500);
      }
    }
  }
}

function renderTypeTask() {
  const chips = $("chips");
  chips.innerHTML = "";
  
  const typeContainer = document.createElement("div");
  typeContainer.className = "typeInput";
  
  const input = document.createElement("input");
  input.type = "text";
  input.className = "typeAnswer";
  input.id = "typeAnswer";
  input.placeholder = "Напиши ответ...";
  
  input.addEventListener("input", () => {
    $("btnCheck").disabled = input.value.trim().length === 0;
  });
  
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && input.value.trim().length > 0) {
      checkAnswer();
    }
  });
  
  typeContainer.appendChild(input);
  chips.appendChild(typeContainer);
  
  const answerArea = $("answerArea");
  answerArea.innerHTML = '<div class="answerHint">Введи перевод</div>';
  
  setTimeout(() => input.focus(), 100);
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
      const correctArr = currentTask.correct || currentTask.words || [];
      ok = JSON.stringify(userArr) === JSON.stringify(correctArr);
      break;
      
    case "choice":
    case "image":
      ok = currentTask.choices && currentTask.choices[selectedChoice]?.correct === true;
      break;
      
    case "match":
      ok = selectedPairs.length === (currentTask.pairs?.length || 0);
      break;
      
    case "type":
      const userAnswer = $("typeAnswer")?.value.trim().toLowerCase() || "";
      const correctAnswer = (currentTask.correctAnswer || "").toLowerCase();
      ok = userAnswer === correctAnswer;
      break;
  }

  lastAnswerWasCorrect = ok;
  $("btnCheck").disabled = true;

  if (ok) {
    correctStreak++;
    progress.correctToday++;
    progress.xpTotal += 10;
    
    // Подсветка новых слов фиолетовым
    highlightNewWords();
    
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
    correctStreak = 0;
    
    // Добавляем неправильный ответ для повторения
    if (!isReviewMode && !wrongAnswers.find(t => t === currentTask)) {
      wrongAnswers.push(currentTask);
    }
    
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
/* Highlight New Words */
/* Highlight New Words */
function highlightNewWords() {
  console.log('🔤 highlightNewWords вызвана для задания:', currentTask);
  
  if (!currentTask) {
    console.log('❌ currentTask не определен');
    return;
  }
  
  // Инициализируем vocab если его нет
  if (!progress.vocab) {
    progress.vocab = {};
    console.log('📚 Инициализирован пустой vocab');
  }
  
  let wordsToAdd = [];
  
  // Извлекаем слова в зависимости от типа задания
  console.log('📋 Тип задания:', currentTask.type);
  
  switch (currentTask.type) {
    case "translate":
    case "audio":
    case "fill":
      // Из prompt (испанский текст)
      if (currentTask.prompt) {
        console.log('📝 Prompt:', currentTask.prompt);
        wordsToAdd.push(...currentTask.prompt.split(' '));
      }
      break;
      
    case "choice":
    case "image":
      if (currentTask.prompt) {
        console.log('📝 Prompt:', currentTask.prompt);
        wordsToAdd.push(...currentTask.prompt.split(' '));
      }
      break;
      
    case "match":
      if (currentTask.pairs) {
        currentTask.pairs.forEach(pair => {
          console.log('🔗 Пара:', pair.spanish);
          wordsToAdd.push(pair.spanish);
        });
      }
      break;
      
    case "type":
      if (currentTask.correctAnswer) {
        console.log('✍️ Правильный ответ:', currentTask.correctAnswer);
        wordsToAdd.push(...currentTask.correctAnswer.split(' '));
      }
      break;
  }
  
  console.log('📦 Слова для добавления:', wordsToAdd);
  
  // Обрабатываем каждое слово
  const newWords = [];
  wordsToAdd.forEach(word => {
    const cleanWord = word.toLowerCase()
      .replace(/[¿?¡!,.:;()]/g, '') // Убираем пунктуацию
      .trim();
    
    if (!cleanWord || cleanWord.length < 2) {
      console.log('⏭️ Пропускаем короткое слово:', word);
      return;
    }
    
    if (!progress.vocab[cleanWord]) {
      progress.vocab[cleanWord] = {
        word: word,
        spanish: word,
        firstSeen: Date.now(),
        timesCorrect: 1,
        isNew: true
      };
      newWords.push(word);
      console.log('✨ Добавлено новое слово:', cleanWord, progress.vocab[cleanWord]);
    } else {
      progress.vocab[cleanWord].timesCorrect++;
      // Помечаем как не новое после 3 правильных ответов
      if (progress.vocab[cleanWord].timesCorrect >= 3) {
        progress.vocab[cleanWord].isNew = false;
      }
      console.log('📈 Обновлено слово:', cleanWord, progress.vocab[cleanWord]);
    }
  });
  
  // Обновляем счетчик изученных слов
  progress.wordsLearned = Object.keys(progress.vocab).length;
  console.log('📊 Всего слов в словаре:', progress.wordsLearned);
  
  // Показываем уведомления о новых словах
  if (newWords.length > 0) {
    console.log('🎉 Новые слова для уведомлений:', newWords);
    setTimeout(() => {
      newWords.forEach((word, idx) => {
        setTimeout(() => {
          showNewWordNotification(word);
        }, idx * 500);
      });
    }, 800);
  }
  
  saveProgress(progress);
}
function showNewWordNotification(word) {
  const bubble = document.querySelector('.bubble');
  if (!bubble) return;
  
  const wordSpan = document.createElement('span');
  wordSpan.textContent = word;
  wordSpan.style.cssText = `
    display: inline-block;
    background: linear-gradient(135deg, #CE82FF 0%, #A855F7 100%);
    color: white;
    padding: 4px 12px;
    border-radius: 8px;
    font-weight: 700;
    font-size: 14px;
    margin: 0 4px;
    animation: newWordPulse 0.5s ease;
  `;
  
  // Добавляем анимацию
  const style = document.createElement('style');
  style.textContent = `
    @keyframes newWordPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
  `;
  document.head.appendChild(style);
}
/* Start Practice */
function startPractice(lessonId = null) {
  if (lessonId) {
    progress._activeLessonId = lessonId;
    // Получаем задания для конкретного урока
    currentLessonTasks = getTasksForLesson(lessonId);
    taskIndex = 0;
    
    if (currentLessonTasks.length === 0) {
      showToast("❌ Для этого урока пока нет заданий");
      return;
    }
  } else {
    // Если урок не указан, используем все задания
    currentLessonTasks = TASKS;
    taskIndex = 0;
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
  
  // Сохраняем часовой пояс пользователя
  saveUserTimezone();
  
  ensureDay(progress);
  await saveProgress(progress);
  
  // ... остальной код
  
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
      
      // Проверяем, закончились ли основные задания
      if (!isReviewMode && taskIndex >= currentLessonTasks.length) {
        if (wrongAnswers.length > 0) {
          // Начинаем режим повторения ошибок
          startReviewMode();
        } else {
          // Урок полностью завершен
          finishLesson();
        }
      } else if (isReviewMode && taskIndex >= currentLessonTasks.length) {
        // Повторение завершено
        finishLesson();
      } else {
        animateTaskSwap(() => renderTask());
      }
    } else {
      // При ошибке разрешаем попробовать снова
      $("btnCheck").disabled = false;
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