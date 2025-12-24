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

/* Lessons & Tasks */
const lessons = [
  { id: 1, title: "Урок 1", sub: "Заказывайте в кафе", xp: 20, icon: "🧩", done: false },
  { id: 2, title: "Урок 2", sub: "Приветствия", xp: 20, icon: "🧠", done: false },
  { id: 3, title: "Урок 3", sub: "Происхождение", xp: 20, icon: "🧪", done: false },
  { id: 4, title: "Урок 4", sub: "Покупки", xp: 20, icon: "🛒", done: false },
];

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
    words: ["Yo", "soy", "Ana", "encantada", "helado", "tú"],
    correct: ["Yo", "soy", "Ana", "encantada"]
  },
  {
    label: "ВЫБЕРИ ПРАВИЛЬНЫЙ ПЕРЕВОД",
    title: "Что означает это слово?",
    prompt: "¿Qué significa 'Hola'?",
    words: ["Привет", "Пока", "Спасибо", "Пожалуйста"],
    correct: ["Привет"]
  }
];

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
let settings = defaultSettings(); // Инициализируем сразу значениями по умолчанию
let activeScreen = "home";
let taskIndex = 0;
let currentTask = TASKS[0];
let picked = [];
let lastAnswerWasCorrect = false;

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

  lessons.forEach((l, idx) => {
    const row = document.createElement("div");
    row.className = "pathRow " + (idx % 2 === 0 ? "left" : "right");

    const node = document.createElement("button");
    const isCompleted = progress.completed[l.id] === true;
    const isLocked = idx > 0 && !progress.completed[lessons[idx - 1].id];
    
    node.className = "pathNode";
    if (isCompleted) node.classList.add("completed");
    if (isLocked) node.classList.add("locked");
    
    node.innerHTML = `
      <div class="nodeIcon">${l.icon}</div>
      <div class="nodeXp">+${l.xp} XP</div>
      ${isCompleted ? '<div class="nodeStars">⭐</div>' : ''}
    `;

    if (!isLocked) {
      node.addEventListener("click", () => {
        vibrate(50);
        showToast(`Выбран: ${l.title}`);
        startPractice(l.id);
      });
    }

    row.appendChild(node);
    list.appendChild(row);
  });
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
  const pieces = 30;
  const box = $("confetti");
  const colors = ['#58CC02', '#1CB0F6', '#FFC800', '#CE82FF', '#FF4B4B'];

  for (let i = 0; i < pieces; i++) {
    const p = document.createElement("div");
    p.className = "confettiPiece";
    p.style.left = Math.random() * 100 + "%";
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDelay = (Math.random() * 0.2) + "s";
    p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    box.appendChild(p);
  }

  setTimeout(clearConfetti, 1300);
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
  const userArr = picked.map(x => x.w);
  const correctArr = currentTask.correct || currentTask.words;
  const ok = JSON.stringify(userArr) === JSON.stringify(correctArr);
  lastAnswerWasCorrect = ok;
  $("btnCheck").disabled = true;

  if (ok) {
    progress.correctToday++;
    progress.xpTotal += 10;
    
    // Mark lesson as completed
    if (progress._activeLessonId) {
      progress.completed[progress._activeLessonId] = true;
    }
    
    showResultSheet({
      ok: true,
      title: "Потрясающе! ✅",
      sub: "+10 XP"
    });
    
    // Check achievements
    const newAchievements = checkAchievements(progress);
    if (newAchievements.length > 0) {
      setTimeout(() => {
        newAchievements.forEach(a => showAchievement(a));
      }, 1500);
    }
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