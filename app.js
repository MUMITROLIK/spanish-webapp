/* Spanish Trainer v2:
   - NO hearts (no limits)
   - Units/modules tree
   - Task types: mc / tiles / audio / input
   - Vocab & review
   - League in chat via sendData
*/

const LS_KEY = "spanish_trainer_state_v2";
const DAILY_XP_GOAL = 50;

const $ = (id) => document.getElementById(id);

const views = {
  home: $("homeView"),
  practice: $("practiceView"),
  league: $("leagueView"),
  vocab: $("vocabView"),
  lesson: $("lessonView"),
};

const tabs = [...document.querySelectorAll(".tab")];

const xpValue = $("xpValue");
const streakValue = $("streakValue");
const goalFill = $("goalFill");
const goalText = $("goalText");
const todayAnswers = $("todayAnswers");
const accuracyEl = $("accuracy");
const vocabCount = $("vocabCount");

const unitsEl = $("units");

const continueBtn = $("continueBtn");
const openLeagueChatBtn = $("openLeagueChatBtn");

const practiceBtn = $("practiceBtn");
const reviewBtn = $("reviewBtn");
const leagueBtn = $("leagueBtn");
const vocabChatBtn = $("vocabChatBtn");

const backHomeBtn = $("backHome");
const lessonTitle = $("lessonTitle");
const progressFill = $("progressFill");
const stepMeta = $("stepMeta");
const questionText = $("questionText");
const promptLabel = $("promptLabel");

const audioRow = $("audioRow");
const playAudioBtn = $("playAudioBtn");

const mcBlock = $("mcBlock");
const optionsEl = $("options");

const tilesBlock = $("tilesBlock");
const tilesEl = $("tiles");
const builtEl = $("built");
const clearTilesBtn = $("clearTilesBtn");

const inputBlock = $("inputBlock");
const textAnswer = $("textAnswer");

const nextBtn = $("nextBtn");
const feedback = $("feedback");

const vocabList = $("vocabList");
const toast = $("toast");

// Telegram WebApp
const tg = window.Telegram?.WebApp || null;
if (tg) {
  try { tg.ready(); tg.expand(); } catch {}
}

// ------------------- Course -------------------
const COURSE = {
  units: [
    {
      title: "Модуль 1 • База",
      lessons: [
        { id: "u1l1", title: "Приветствия", xp: 12 },
        { id: "u1l2", title: "Вежливость", xp: 14 },
        { id: "u1l3", title: "Кафе", xp: 16 },
      ],
    },
    {
      title: "Модуль 2 • Люди",
      lessons: [
        { id: "u2l1", title: "Семья", xp: 16 },
        { id: "u2l2", title: "Чувства", xp: 18 },
      ],
    },
  ],
};

// База заданий (мы расширим позже — но уже есть все типы)
const TASKS = {
  u1l1: [
    // mc
    { type:"mc", id: 1, ru:"спасибо", right:"gracias", options:["hola","gracias","por favor","adiós"] },
    // tiles
    { type:"tiles", id: 2, ru:"доброе утро", right:"buenos días" },
    // input
    { type:"input", id: 3, ru:"пожалуйста", right:"por favor" },
    // audio (играем испанский)
    { type:"audio", id: 4, ru:"привет", right:"hola", options:["hola","gracias","por favor","adiós"] },
    { type:"mc", id: 5, ru:"пока", right:"adiós", options:["buenas","adiós","sí","no"] },
  ],
  u1l2: [
    { type:"input", id: 6, ru:"извините", right:"perdón" },
    { type:"mc", id: 7, ru:"да", right:"sí", options:["sí","no","hola","gracias"] },
    { type:"tiles", id: 8, ru:"спасибо большое", right:"muchas gracias" },
    { type:"audio", id: 9, ru:"нет", right:"no", options:["por favor","no","hola","buenas"] },
    { type:"mc", id: 10, ru:"доброй ночи", right:"buenas noches", options:["buenos días","buenas noches","hola","sí"] },
  ],
  u1l3: [
    { type:"mc", id: 11, ru:"кофе", right:"café", options:["café","agua","pan","leche"] },
    { type:"mc", id: 12, ru:"вода", right:"agua", options:["té","agua","café","jugo"] },
    { type:"input", id: 13, ru:"молоко", right:"leche" },
    { type:"tiles", id: 14, ru:"я хочу кофе", right:"quiero café" },
    { type:"audio", id: 15, ru:"хлеб", right:"pan", options:["pan","pollo","pescado","queso"] },
  ],
  u2l1: [
    { type:"mc", id: 16, ru:"мама", right:"madre", options:["madre","padre","hermano","amigo"] },
    { type:"mc", id: 17, ru:"папа", right:"padre", options:["madre","padre","hermana","amiga"] },
    { type:"input", id: 18, ru:"друг", right:"amigo" },
    { type:"tiles", id: 19, ru:"моя семья", right:"mi familia" },
    { type:"audio", id: 20, ru:"брат", right:"hermano", options:["hermano","hermana","amigo","padre"] },
  ],
  u2l2: [
    { type:"mc", id: 21, ru:"я счастлив", right:"estoy feliz", options:["estoy feliz","estoy triste","tengo hambre","tengo sueño"] },
    { type:"tiles", id: 22, ru:"мне грустно", right:"estoy triste" },
    { type:"input", id: 23, ru:"я устал", right:"estoy cansado" },
    { type:"audio", id: 24, ru:"я голоден", right:"tengo hambre", options:["tengo hambre","tengo sueño","estoy feliz","por favor"] },
    { type:"mc", id: 25, ru:"я хочу спать", right:"tengo sueño", options:["tengo sueño","tengo hambre","hola","adiós"] },
  ],
};

// ------------------- State -------------------
function defaultState() {
  return {
    xp: 0,
    streak: 0,
    lastActiveDay: null,   // YYYY-MM-DD
    lastStreakDay: null,   // YYYY-MM-DD
    todayXp: 0,
    todayAnswers: 0,
    todayCorrect: 0,

    completed: {},         // lessonId -> doneAtDay
    lastLessonId: "u1l1",

    vocab: {
      // "ru|es": {ru, es, correct, wrong, lastSeenDay}
    },
  };
}

let state = loadState();

// ------------------- Utils -------------------
function dayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function resetIfNewDay() {
  const today = dayKey();
  if (state.lastActiveDay !== today) {
    state.todayXp = 0;
    state.todayAnswers = 0;
    state.todayCorrect = 0;
    state.lastActiveDay = today;
    saveState();
  }
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("toast--show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("toast--show"), 1500);
}

function normalizeText(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[¡!¿?.,;:]/g, "");
}

function vocabKey(ru, es) {
  return `${ru}|${es}`;
}

function addVocab(ru, es, isCorrect) {
  const k = vocabKey(ru, es);
  const v = state.vocab[k] || { ru, es, correct: 0, wrong: 0, lastSeenDay: dayKey() };
  v.lastSeenDay = dayKey();
  if (isCorrect) v.correct += 1;
  else v.wrong += 1;
  state.vocab[k] = v;
}

function getVocabStats() {
  const arr = Object.values(state.vocab);
  const count = arr.length;
  // words with worse mastery first
  const sorted = arr.sort((a, b) => (b.wrong - b.correct) - (a.wrong - a.correct));
  return { count, sorted };
}

// ------------------- Views / Tabs -------------------
function setView(name) {
  Object.keys(views).forEach(k => views[k].classList.toggle("view--active", k === name));
  tabs.forEach(t => t.classList.toggle("tab--active", t.dataset.tab === name));
}

tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (tab) {
      setView(tab);
      if (tab === "home") renderHome();
      if (tab === "vocab") renderVocab();
    }
  });
});

// ------------------- Home (Units tree) -------------------
function allLessonsFlat() {
  return COURSE.units.flatMap(u => u.lessons);
}

function getNextLessonId() {
  const lessons = allLessonsFlat();
  for (const l of lessons) {
    if (!state.completed[l.id]) return l.id;
  }
  return lessons[lessons.length - 1]?.id || "u1l1";
}

function syncTopUI() {
  resetIfNewDay();

  xpValue.textContent = String(state.xp);
  streakValue.textContent = String(state.streak);

  const pct = clamp((state.todayXp / DAILY_XP_GOAL) * 100, 0, 100);
  goalFill.style.width = `${pct}%`;
  goalText.textContent = `${state.todayXp} / ${DAILY_XP_GOAL} XP`;

  todayAnswers.textContent = `${state.todayAnswers} ответов`;
  const acc = state.todayAnswers > 0
    ? Math.round((state.todayCorrect / state.todayAnswers) * 100)
    : null;
  accuracyEl.textContent = acc === null ? "—" : `${acc}%`;

  const vs = getVocabStats();
  vocabCount.textContent = String(vs.count);

  state.lastLessonId = getNextLessonId();
  saveState();
}

function renderHome() {
  syncTopUI();
  unitsEl.innerHTML = "";

  const nextId = getNextLessonId();

  COURSE.units.forEach((unit) => {
    const wrap = document.createElement("div");
    wrap.className = "unit";

    const doneCount = unit.lessons.filter(l => state.completed[l.id]).length;

    const head = document.createElement("div");
    head.className = "unitHead";
    head.innerHTML = `<b>${unit.title}</b><span>${doneCount} / ${unit.lessons.length} пройдено</span>`;
    wrap.appendChild(head);

    const list = document.createElement("div");
    list.className = "lessonList";

    unit.lessons.forEach((lesson) => {
      const done = Boolean(state.completed[lesson.id]);
      const isNext = lesson.id === nextId;

      const card = document.createElement("div");
      card.className = "lessonCard";
      card.innerHTML = `
        <div class="lessonTopRow">
          <b>${lesson.title}</b>
          <span class="tag ${done ? "tag--done" : (isNext ? "tag--next" : "")}">
            ${done ? "✓" : (isNext ? "next" : `${lesson.xp} XP`)}
          </span>
        </div>
        <div class="lessonMeta">Заданий: 5 • XP за урок: ${lesson.xp}</div>
      `;
      card.addEventListener("click", () => startLesson(lesson.id, { practice:false }));
      list.appendChild(card);
    });

    wrap.appendChild(list);
    unitsEl.appendChild(wrap);
  });

  continueBtn.onclick = () => startLesson(getNextLessonId(), { practice:false });
  openLeagueChatBtn.onclick = () => sendToBot({ type:"open_league" });
}

// ------------------- Vocab view -------------------
function renderVocab() {
  syncTopUI();
  const { sorted } = getVocabStats();
  vocabList.innerHTML = "";

  if (sorted.length === 0) {
    vocabList.innerHTML = `<div class="muted">Пока пусто. Пройди пару уроков — и тут появятся слова 😉</div>`;
    return;
  }

  sorted.slice(0, 100).forEach(v => {
    const mastery = v.correct + v.wrong === 0 ? 0 : Math.round((v.correct / (v.correct + v.wrong)) * 100);
    const el = document.createElement("div");
    el.className = "vocabItem";
    el.innerHTML = `
      <b>${v.ru} → ${v.es}</b>
      <div class="muted">✅ ${v.correct} • ❌ ${v.wrong} • мастерство ${mastery}%</div>
    `;
    vocabList.appendChild(el);
  });
}

// ------------------- Practice view handlers -------------------
practiceBtn.onclick = () => {
  const all = allLessonsFlat();
  const random = all[Math.floor(Math.random() * all.length)];
  startLesson(random.id, { practice:true, mix:true });
};

reviewBtn.onclick = () => startReview();

leagueBtn.onclick = () => sendToBot({ type:"open_league" });
vocabChatBtn.onclick = () => sendToBot({ type:"open_vocab" });

// ------------------- Lesson engine -------------------
let currentLessonId = null;
let tasks = [];
let idx = 0;
let locked = false;
let selected = null;

// tiles state
let tilesLeft = [];
let built = [];

// input state
let typed = "";

// audio state
let audioText = "";

function buildTasks(lessonId, opts) {
  const base = TASKS[lessonId] ? [...TASKS[lessonId]] : [];
  // if mix, shuffle types a bit
  if (opts?.mix) base.sort(() => Math.random() - 0.5);
  return base;
}

function getLessonMeta(lessonId) {
  const all = allLessonsFlat();
  return all.find(l => l.id === lessonId) || all[0];
}

function startLesson(lessonId, opts = {}) {
  currentLessonId = lessonId;
  tasks = buildTasks(lessonId, opts);
  idx = 0;
  locked = false;
  selected = null;
  tilesLeft = [];
  built = [];
  typed = "";
  audioText = "";

  const meta = getLessonMeta(lessonId);
  lessonTitle.textContent = (opts.practice ? `Тренировка • ${meta.title}` : meta.title);

  setView("lesson");
  renderTask();
}

function renderTask() {
  resetIfNewDay();

  locked = false;
  selected = null;
  typed = "";
  built = [];
  tilesLeft = [];
  audioText = "";

  nextBtn.disabled = true;
  nextBtn.textContent = "Дальше";

  feedback.className = "feedback";
  feedback.textContent = "";

  const t = tasks[idx];
  const total = tasks.length;

  stepMeta.textContent = `${idx + 1} / ${total}`;
  progressFill.style.width = `${(idx / total) * 100}%`;

  // label
  promptLabel.innerHTML = `Переведи на <b>ES</b>:`;
  questionText.textContent = t.ru;

  // hide all blocks
  audioRow.classList.add("hidden");
  mcBlock.classList.add("hidden");
  tilesBlock.classList.add("hidden");
  inputBlock.classList.add("hidden");

  // reset blocks
  optionsEl.innerHTML = "";
  tilesEl.innerHTML = "";
  builtEl.innerHTML = "";
  textAnswer.value = "";

  if (t.type === "mc") {
    mcBlock.classList.remove("hidden");
    renderMC(t);
  } else if (t.type === "audio") {
    audioRow.classList.remove("hidden");
    mcBlock.classList.remove("hidden");
    audioText = t.right;
    playAudioBtn.onclick = () => speakSpanish(audioText);
    renderMC(t);
  } else if (t.type === "tiles") {
    tilesBlock.classList.remove("hidden");
    renderTiles(t);
  } else if (t.type === "input") {
    inputBlock.classList.remove("hidden");
    renderInput(t);
  }
}

function renderMC(t) {
  t.options.forEach(opt => {
    const b = document.createElement("button");
    b.className = "opt";
    b.type = "button";
    b.textContent = opt;
    b.addEventListener("click", () => {
      if (locked) return;
      [...optionsEl.children].forEach(el => el.classList.remove("opt--selected"));
      b.classList.add("opt--selected");
      selected = opt;
      nextBtn.disabled = false;
    });
    optionsEl.appendChild(b);
  });
}

function renderTiles(t) {
  // split by spaces
  const correctTokens = t.right.split(" ").filter(Boolean);
  const shuffled = [...correctTokens].sort(() => Math.random() - 0.5);

  tilesLeft = shuffled;
  built = [];

  function rerender() {
    builtEl.innerHTML = "";
    built.forEach((w, i) => {
      const chip = document.createElement("button");
      chip.className = "tile";
      chip.textContent = w;
      chip.title = "Нажми чтобы убрать";
      chip.onclick = () => {
        if (locked) return;
        built.splice(i, 1);
        tilesLeft.push(w);
        rerender();
      };
      builtEl.appendChild(chip);
    });

    tilesEl.innerHTML = "";
    tilesLeft.forEach((w, i) => {
      const tile = document.createElement("button");
      tile.className = "tile";
      tile.textContent = w;
      tile.onclick = () => {
        if (locked) return;
        built.push(w);
        tilesLeft.splice(i, 1);
        rerender();
      };
      tilesEl.appendChild(tile);
    });

    nextBtn.disabled = built.length === 0;
  }

  clearTilesBtn.onclick = () => {
    if (locked) return;
    tilesLeft = tilesLeft.concat(built);
    built = [];
    rerender();
  };

  rerender();
}

function renderInput(t) {
  textAnswer.oninput = () => {
    if (locked) return;
    typed = textAnswer.value;
    nextBtn.disabled = normalizeText(typed).length === 0;
  };
}

function speakSpanish(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES";
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    showToast("🔊 Слушай внимательно!");
  } catch {
    showToast("Браузер не дал озвучку 😅");
  }
}

function grade() {
  const t = tasks[idx];
  locked = true;

  let isCorrect = false;
  let userAnswer = "";

  if (t.type === "mc" || t.type === "audio") {
    userAnswer = selected || "";
    isCorrect = userAnswer === t.right;

    // mark options
    [...optionsEl.children].forEach(el => {
      const v = el.textContent;
      el.classList.remove("opt--selected");
      if (v === t.right) el.classList.add("opt--correct");
      if (v === userAnswer && v !== t.right) el.classList.add("opt--wrong");
      el.disabled = true;
    });
  }

  if (t.type === "tiles") {
    userAnswer = built.join(" ").trim();
    isCorrect = normalizeText(userAnswer) === normalizeText(t.right);
  }

  if (t.type === "input") {
    userAnswer = typed || "";
    isCorrect = normalizeText(userAnswer) === normalizeText(t.right);
  }

  // stats
  state.todayAnswers += 1;
  if (isCorrect) state.todayCorrect += 1;

  // XP
  const xpGain = isCorrect ? 2 : 0;
  state.xp += xpGain;
  state.todayXp += xpGain;

  // vocab tracking
  addVocab(t.ru, t.right, isCorrect);

  saveState();
  syncTopUI();

  // feedback
  if (isCorrect) {
    feedback.classList.add("feedback--ok");
    feedback.textContent = `✅ Верно! +${xpGain} XP`;
  } else {
    feedback.classList.add("feedback--bad");
    feedback.textContent = `❌ Неверно. Правильно: ${t.right}`;
  }

  // send to bot
  sendToBot({
    type: "answer",
    wordId: t.id,
    taskType: t.type,
    lessonId: currentLessonId,
    ru: t.ru,
    right: t.right,
    chosen: userAnswer,
    correct: isCorrect,
    xpGain,
    step: idx + 1,
  });

  // progress bar
  const total = tasks.length;
  progressFill.style.width = `${((idx + 1) / total) * 100}%`;

  // allow next
  nextBtn.disabled = false;
  nextBtn.textContent = (idx === tasks.length - 1) ? "Завершить" : "Дальше";
}

function finishLesson() {
  const today = dayKey();
  const meta = getLessonMeta(currentLessonId);

  // streak: +1 раз в день после любого урока
  if (state.lastStreakDay !== today) {
    state.streak += 1;
    state.lastStreakDay = today;
  }

  // mark completed
  state.completed[currentLessonId] = today;
  state.lastLessonId = getNextLessonId();

  // bonus XP
  const bonusXp = meta?.xp || 10;
  state.xp += bonusXp;
  state.todayXp += bonusXp;

  saveState();
  syncTopUI();

  sendToBot({
    type: "lesson_end",
    lessonId: currentLessonId,
    bonusXp,
    day: today,
  });

  showToast(`🏁 Урок завершён! +${bonusXp} XP`);
  setTimeout(() => {
    setView("home");
    renderHome();
  }, 450);
}

function startReview() {
  // pick up to 5 worst words
  const { sorted } = getVocabStats();
  if (sorted.length === 0) {
    showToast("Словарь пуст. Пройди уроки сначала 🙂");
    return;
  }

  const picks = sorted.slice(0, 5);

  // build review tasks: mix input + mc
  currentLessonId = "review";
  tasks = picks.map((v, i) => {
    const type = i % 2 === 0 ? "input" : "mc";
    if (type === "input") return { type:"input", id: 1000 + i, ru: v.ru, right: v.es };
    // mc options: include right + random from vocab
    const pool = sorted.map(x => x.es).filter(x => x !== v.es);
    const opts = [v.es];
    while (opts.length < 4 && pool.length) {
      const r = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      if (!opts.includes(r)) opts.push(r);
    }
    return { type:"mc", id: 1000 + i, ru: v.ru, right: v.es, options: opts.sort(() => Math.random() - 0.5) };
  });

  idx = 0;
  lessonTitle.textContent = "Повторение • Словарь";
  setView("lesson");
  renderTask();
}

function sendToBot(payload) {
  if (!tg) return;
  try { tg.sendData(JSON.stringify(payload)); } catch {}
}

// Buttons
nextBtn.addEventListener("click", () => {
  // if not graded yet -> grade
  if (!locked) {
    // validation per type
    const t = tasks[idx];
    if (t.type === "mc" || t.type === "audio") {
      if (!selected) return;
    }
    if (t.type === "tiles") {
      if (!built.length) return;
    }
    if (t.type === "input") {
      if (!normalizeText(typed).length) return;
    }
    grade();
    return;
  }

  // go next
  idx += 1;
  locked = false;
  selected = null;

  if (idx >= tasks.length) {
    // if review -> just toast and go home
    if (currentLessonId === "review") {
      showToast("✅ Повторение завершено!");
      setView("practice");
      return;
    }
    finishLesson();
    return;
  }

  renderTask();
});

backHomeBtn.addEventListener("click", () => {
  setView("home");
  renderHome();
});

// Init
syncTopUI();
renderHome();
setView("home");
renderVocab(); // prefill if user opens
