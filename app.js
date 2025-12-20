/* =========================
   Spanish Trainer (Duolingo-ish vibe)
   - Home "path" with lessons
   - Lesson flow: 5 questions
   - XP, streak, hearts
   - Saves progress in localStorage
   - Sends answer events to Telegram bot via WebApp.sendData()
   ========================= */

const LS_KEY = "spanish_trainer_state_v1";
const DAILY_XP_GOAL = 50;
const MAX_HEARTS = 5;

const $ = (id) => document.getElementById(id);

const homeView = $("homeView");
const lessonView = $("lessonView");
const pathEl = $("path");

const xpValue = $("xpValue");
const streakValue = $("streakValue");
const heartsValue = $("heartsValue");

const goalFill = $("goalFill");
const goalText = $("goalText");
const todayAnswers = $("todayAnswers");
const accuracyEl = $("accuracy");

const continueBtn = $("continueBtn");
const practiceBtn = $("practiceBtn");

const backHomeBtn = $("backHome");
const lessonTitle = $("lessonTitle");
const progressFill = $("progressFill");
const stepMeta = $("stepMeta");
const questionText = $("questionText");
const optionsEl = $("options");
const nextBtn = $("nextBtn");
const feedback = $("feedback");

const toast = $("toast");

// ---------- Telegram WebApp ----------
const tg = window.Telegram?.WebApp || null;
if (tg) {
  try {
    tg.ready();
    tg.expand();
  } catch {}
}

// ---------- Content (you can expand later) ----------
const COURSE = {
  units: [
    {
      title: "Модуль 1 • Основы",
      lessons: [
        {
          id: "u1l1",
          title: "Приветствия",
          xp: 10,
          questions: [
            { id: 1, ru: "привет", options: ["hola", "gracias", "por favor", "adiós"], correct: "hola" },
            { id: 2, ru: "пока", options: ["buenas", "adiós", "sí", "no"], correct: "adiós" },
            { id: 3, ru: "да", options: ["sí", "no", "hola", "gracias"], correct: "sí" },
            { id: 4, ru: "нет", options: ["por favor", "no", "hola", "buenas"], correct: "no" },
            { id: 5, ru: "спасибо", options: ["hola", "gracias", "por favor", "adiós"], correct: "gracias" },
          ],
        },
        {
          id: "u1l2",
          title: "Вежливость",
          xp: 12,
          questions: [
            { id: 6, ru: "пожалуйста", options: ["por favor", "gracias", "hola", "adiós"], correct: "por favor" },
            { id: 7, ru: "доброе утро", options: ["buenos días", "buenas noches", "hola", "gracias"], correct: "buenos días" },
            { id: 8, ru: "добрый вечер", options: ["buenas tardes", "buenas noches", "por favor", "adiós"], correct: "buenas tardes" },
            { id: 9, ru: "доброй ночи", options: ["buenos días", "buenas noches", "hola", "sí"], correct: "buenas noches" },
            { id: 10, ru: "извините", options: ["perdón", "por favor", "gracias", "adiós"], correct: "perdón" },
          ],
        },
        {
          id: "u1l3",
          title: "Кафе",
          xp: 14,
          questions: [
            { id: 11, ru: "кофе", options: ["café", "agua", "pan", "leche"], correct: "café" },
            { id: 12, ru: "вода", options: ["té", "agua", "café", "jugo"], correct: "agua" },
            { id: 13, ru: "молоко", options: ["pan", "leche", "azúcar", "sal"], correct: "leche" },
            { id: 14, ru: "хлеб", options: ["pan", "pollo", "pescado", "queso"], correct: "pan" },
            { id: 15, ru: "сахар", options: ["sal", "azúcar", "café", "leche"], correct: "azúcar" },
          ],
        },
      ],
    },
  ],
};

// ---------- State ----------
function defaultState() {
  return {
    xp: 0,
    hearts: MAX_HEARTS,
    streak: 0,
    lastActiveDay: null,        // "YYYY-MM-DD"
    todayXp: 0,
    todayAnswers: 0,
    todayCorrect: 0,
    // progress
    completed: {},              // lessonId -> { doneAtDay, score }
    lastLessonId: COURSE.units[0].lessons[0].id,
  };
}

let state = loadState();
syncTopUI();
renderHome();

// ---------- Helpers ----------
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
    // new day: reset daily counters
    state.todayXp = 0;
    state.todayAnswers = 0;
    state.todayCorrect = 0;
    state.lastActiveDay = today;
    saveState();
  }
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("toast--show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("toast--show"), 1500);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

// ---------- UI ----------
function syncTopUI() {
  resetIfNewDay();

  xpValue.textContent = String(state.xp);
  heartsValue.textContent = String(state.hearts);
  streakValue.textContent = String(state.streak);

  // goal
  const pct = clamp((state.todayXp / DAILY_XP_GOAL) * 100, 0, 100);
  goalFill.style.width = `${pct}%`;
  goalText.textContent = `${state.todayXp} / ${DAILY_XP_GOAL} XP`;

  todayAnswers.textContent = `${state.todayAnswers} ответов`;

  const acc = state.todayAnswers > 0
    ? Math.round((state.todayCorrect / state.todayAnswers) * 100)
    : null;
  accuracyEl.textContent = acc === null ? "—" : `${acc}%`;

  // Continue button should point to next not-done lesson (or last)
  const nextId = getNextLessonId();
  state.lastLessonId = nextId;
  saveState();
}

function setView(which) {
  homeView.classList.toggle("view--active", which === "home");
  lessonView.classList.toggle("view--active", which === "lesson");
}

function renderHome() {
  syncTopUI();

  pathEl.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "pathGrid";

  const lessons = COURSE.units.flatMap(u => u.lessons);

  lessons.forEach((lesson, idx) => {
    const done = Boolean(state.completed[lesson.id]);
    const next = lesson.id === getNextLessonId();

    const node = document.createElement("div");
    node.className = "node";
    node.setAttribute("role", "button");
    node.tabIndex = 0;

    const badge = document.createElement("div");
    badge.className = "badge " + (done ? "badge--done" : (next ? "badge--next" : ""));
    badge.textContent = done ? "✓" : String(idx + 1);

    const titleWrap = document.createElement("div");
    titleWrap.className = "nodeTitle";
    titleWrap.innerHTML = `<b>${lesson.title}</b><span>${lesson.xp} XP • ${done ? "пройдено" : "урок"}</span>`;

    const inner = document.createElement("div");
    inner.className = "node__inner";
    inner.appendChild(badge);
    inner.appendChild(titleWrap);

    node.appendChild(inner);

    node.addEventListener("click", () => startLesson(lesson.id));
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") startLesson(lesson.id);
    });

    grid.appendChild(node);
  });

  pathEl.appendChild(grid);

  continueBtn.onclick = () => startLesson(getNextLessonId());
  practiceBtn.onclick = () => {
    // quick practice: pick random lesson even if done, but no path progress
    const all = COURSE.units.flatMap(u => u.lessons);
    const random = all[Math.floor(Math.random() * all.length)];
    startLesson(random.id, { practice: true });
  };
}

function getNextLessonId() {
  const lessons = COURSE.units.flatMap(u => u.lessons);
  for (const l of lessons) {
    if (!state.completed[l.id]) return l.id;
  }
  // all done => loop to last
  return lessons[lessons.length - 1].id;
}

// ---------- Lesson Engine ----------
let currentLesson = null;
let currentIndex = 0;
let locked = false;
let selected = null;
let isPractice = false;

function startLesson(lessonId, opts = {}) {
  const lessons = COURSE.units.flatMap(u => u.lessons);
  const lesson = lessons.find(l => l.id === lessonId) || lessons[0];

  currentLesson = lesson;
  currentIndex = 0;
  locked = false;
  selected = null;
  isPractice = Boolean(opts.practice);

  // If hearts 0, block (classic duo vibe)
  if (state.hearts <= 0) {
    showToast("❤️ Закончились сердечки. Тренировка попозже 😄");
    return;
  }

  lessonTitle.textContent = isPractice ? `Тренировка • ${lesson.title}` : lesson.title;
  setView("lesson");
  renderQuestion();
}

function renderQuestion() {
  const q = currentLesson.questions[currentIndex];
  selected = null;
  locked = false;
  nextBtn.disabled = true;

  feedback.className = "feedback";
  feedback.textContent = "";

  questionText.textContent = q.ru;

  // progress
  const total = currentLesson.questions.length;
  stepMeta.textContent = `${currentIndex + 1} / ${total}`;
  progressFill.style.width = `${((currentIndex) / total) * 100}%`;

  optionsEl.innerHTML = "";
  q.options.forEach((opt) => {
    const b = document.createElement("button");
    b.className = "opt";
    b.type = "button";
    b.textContent = opt;

    b.addEventListener("click", () => onSelectOption(b, opt));
    optionsEl.appendChild(b);
  });
}

function onSelectOption(btn, value) {
  if (locked) return;

  // clear prev selection
  [...optionsEl.children].forEach(el => el.classList.remove("opt--selected"));
  btn.classList.add("opt--selected");

  selected = value;
  nextBtn.disabled = false;
}

function gradeAnswer() {
  const q = currentLesson.questions[currentIndex];
  const correct = q.correct;

  locked = true;

  let isCorrect = selected === correct;

  // mark all options
  [...optionsEl.children].forEach(el => {
    const v = el.textContent;
    el.classList.remove("opt--selected");
    if (v === correct) el.classList.add("opt--correct");
    if (v === selected && v !== correct) el.classList.add("opt--wrong");
    el.disabled = true;
  });

  // update state
  resetIfNewDay();
  state.todayAnswers += 1;

  if (isCorrect) {
    state.todayCorrect += 1;
    const gain = 2; // per question
    state.xp += gain;
    state.todayXp += gain;
    feedback.classList.add("feedback--ok");
    feedback.textContent = `✅ Верно! +${gain} XP`;
  } else {
    state.hearts = Math.max(0, state.hearts - 1);
    feedback.classList.add("feedback--bad");
    feedback.textContent = `❌ Неверно. Правильно: ${correct}`;
  }

  // Telegram sendData (for bot stats)
  sendToBot({
    type: "answer",
    wordId: q.id,
    chosen: selected,
    correct: isCorrect,
    ru: q.ru,
    right: correct,
    lessonId: currentLesson.id,
    step: currentIndex + 1,
  });

  saveState();
  syncTopUI();

  // progress visual
  const total = currentLesson.questions.length;
  progressFill.style.width = `${((currentIndex + 1) / total) * 100}%`;
}

function finishLesson() {
  const today = dayKey();

  // streak logic: if you completed a lesson today, streak++
  // (very simplified but nice)
  if (state.lastStreakDay !== today) {
    state.streak += 1;
    state.lastStreakDay = today;
  }

  if (!isPractice) {
    state.completed[currentLesson.id] = {
      doneAtDay: today,
      score: {
        todayAnswers: state.todayAnswers,
        todayCorrect: state.todayCorrect
      }
    };
    state.lastLessonId = getNextLessonId();
  }

  // bonus XP for finishing lesson
  const bonus = isPractice ? 6 : currentLesson.xp;
  state.xp += bonus;
  state.todayXp += bonus;

  saveState();
  syncTopUI();

  sendToBot({
    type: "lesson_end",
    lessonId: currentLesson.id,
    practice: isPractice,
    bonusXp: bonus,
    day: today
  });

  showToast(`🏁 Урок завершён! +${bonus} XP`);
  setTimeout(() => {
    setView("home");
    renderHome();
  }, 450);
}

function sendToBot(payload) {
  if (!tg) return;
  try {
    tg.sendData(JSON.stringify(payload));
  } catch {}
}

// ---------- Buttons ----------
nextBtn.addEventListener("click", () => {
  if (!locked) {
    // first click after selecting = grade
    if (!selected) return;
    gradeAnswer();
    nextBtn.textContent = (currentIndex === currentLesson.questions.length - 1) ? "Завершить" : "Дальше";
    nextBtn.disabled = false;
    return;
  }

  // already graded -> go next
  currentIndex += 1;
  nextBtn.textContent = "Дальше";
  if (currentIndex >= currentLesson.questions.length) {
    finishLesson();
    return;
  }

  renderQuestion();
});

backHomeBtn.addEventListener("click", () => {
  setView("home");
  renderHome();
});

// initial
setView("home");
