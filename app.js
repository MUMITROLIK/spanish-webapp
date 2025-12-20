/* Duolingo-like Spanish Trainer (WebApp)
   - Home path UI (left/center/right)
   - Lessons: MCQ / Tiles / Input
   - Saves progress in localStorage
   - Sends stats to Telegram bot via WebApp.sendData()
*/

"use strict";

/* ===========================
   Telegram WebApp integration
=========================== */
const TG = window.Telegram?.WebApp || null;

function sendToBot(payload) {
  try {
    if (!TG) return;
    const data = JSON.stringify(payload);
    TG.sendData(data);
  } catch (e) {
    // ignore
  }
}

function getUserTag() {
  // Telegram mini app: we can’t directly read user id in JS securely without initData parsing.
  // We keep it "unknown" but bot still receives sendData event when user does actions.
  return "webapp";
}

/* ===========================
   Helpers
=========================== */
function $(id) {
  return document.getElementById(id);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uniq(arr) {
  return [...new Set(arr)];
}

function normalizeAnswer(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function showToast(text) {
  const el = $("toast");
  if (!el) {
    console.log("TOAST:", text);
    return;
  }
  el.textContent = text;
  el.classList.add("toast--show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("toast--show"), 1600);
}

/* ===========================
   Course content
=========================== */

// Мини-курс. Можешь расширять как хочешь.
const COURSE = {
  title: "Spanish Trainer",
  units: [
    {
      id: "u1",
      title: "Приветствия",
      level: "A1",
      lessons: [
        {
          id: "l1",
          title: "Базовые слова",
          xp: 10,
          pairs: [
            { ru: "привет", es: "hola" },
            { ru: "пока", es: "adiós" },
            { ru: "спасибо", es: "gracias" },
            { ru: "пожалуйста", es: "por favor" },
            { ru: "да", es: "sí" },
            { ru: "нет", es: "no" }
          ]
        },
        {
          id: "l2",
          title: "Вежливость",
          xp: 12,
          pairs: [
            { ru: "доброе утро", es: "buenos días" },
            { ru: "добрый день", es: "buenas tardes" },
            { ru: "добрый вечер", es: "buenas noches" },
            { ru: "извини", es: "perdón" },
            { ru: "как дела?", es: "¿cómo estás?" },
            { ru: "хорошо", es: "bien" }
          ]
        }
      ]
    },
    {
      id: "u2",
      title: "Кафе",
      level: "A1",
      lessons: [
        {
          id: "l3",
          title: "Заказ",
          xp: 14,
          pairs: [
            { ru: "кофе", es: "café" },
            { ru: "вода", es: "agua" },
            { ru: "чай", es: "té" },
            { ru: "счёт", es: "la cuenta" },
            { ru: "я хочу", es: "quiero" },
            { ru: "можно?", es: "¿puedo?" }
          ]
        }
      ]
    },
    {
      id: "u3",
      title: "A2 (закрыто пока A1 не пройден)",
      level: "A2",
      lessons: [
        {
          id: "l4",
          title: "Планы",
          xp: 18,
          pairs: [
            { ru: "сегодня", es: "hoy" },
            { ru: "завтра", es: "mañana" },
            { ru: "вчера", es: "ayer" },
            { ru: "я иду", es: "voy" },
            { ru: "мы идём", es: "vamos" },
            { ru: "потому что", es: "porque" }
          ]
        }
      ]
    }
  ]
};

function getAllPairs() {
  return COURSE.units.flatMap((u) => u.lessons.flatMap((l) => l.pairs));
}

function findLessonById(id) {
  for (const u of COURSE.units) {
    for (const l of u.lessons) {
      if (l.id === id) return { unit: u, lesson: l };
    }
  }
  return null;
}

/* ===========================
   State (localStorage)
=========================== */
const STORAGE_KEY = "spanish_trainer_state_v3";

function defaultState() {
  return {
    xp: 0,
    streak: 1,

    // day tracking
    day: dayKey(),
    todayXp: 0,
    todayAnswers: 0,
    todayCorrect: 0,
    dailyGoal: 50,

    // progress
    completed: {}, // lessonId -> true
    xpByDay: {}, // day -> xp earned

    // vocab stats
    vocab: {
      // es -> { seen, correct }
    },

    // daily quests
    dailyQuests: { day: null, done: {} }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

function resetIfNewDay() {
  const today = dayKey();
  if (state.day !== today) {
    // streak: если вчера тоже был xp > 0, оставим, иначе сбросим на 1
    // (упрощённо)
    state.streak = (state.todayXp > 0 ? state.streak + 1 : 1);

    state.day = today;
    state.todayXp = 0;
    state.todayAnswers = 0;
    state.todayCorrect = 0;

    // daily quests reset
    state.dailyQuests.day = today;
    state.dailyQuests.done = {};

    saveState();
  } else {
    // ensure quests initialized
    if (state.dailyQuests.day !== today) {
      state.dailyQuests.day = today;
      state.dailyQuests.done = {};
      saveState();
    }
  }
}

resetIfNewDay();

/* ===========================
   UI references (optional)
=========================== */
const ui = {
  // top stats (optional ids)
  xp: $("xpVal"),
  streak: $("streakVal"),
  goalBar: $("goalBar"),
  goalText: $("goalText"),
  todayAnswers: $("todayAnswers"),
  accuracy: $("accuracy"),

  // views
  homeView: $("homeView"),
  lessonView: $("lessonView"),
  vocabView: $("vocabView"),
  trainView: $("trainView"),
  profileView: $("profileView"),

  // home
  units: $("units"),

  // lesson
  lessonTitle: $("lessonTitle"),
  prompt: $("prompt"),
  options: $("options"),
  tilesArea: $("tilesArea"),
  tilesPicked: $("tilesPicked"),
  input: $("answerInput"),
  checkBtn: $("checkBtn"),
  nextBtn: $("nextBtn"),
  backBtn: $("backBtn"),

  // vocab
  vocabList: $("vocabList")
};

// If your HTML doesn’t have these IDs, app will still run,
// because we generate minimal UI if missing.
function ensureBasicLayout() {
  if ($("appRoot")) return;

  // minimal shell
  const root = document.createElement("div");
  root.id = "appRoot";
  root.style.padding = "14px";
  root.style.color = "white";
  root.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <div style="font-weight:900;font-size:18px;">Spanish Trainer</div>
      <div style="display:flex;gap:10px;opacity:.9;">
        <div>⚡ <span id="xpVal">0</span></div>
        <div>🔥 <span id="streakVal">1</span></div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <button class="tabBtn" data-tab="home">Путь</button>
      <button class="tabBtn" data-tab="train">Тренировка</button>
      <button class="tabBtn" data-tab="vocab">Словарь</button>
    </div>

    <div id="homeView">
      <div style="margin:10px 0;opacity:.8;">Цель дня: <span id="goalText"></span></div>
      <div style="height:10px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden;margin-bottom:12px;">
        <div id="goalBar" style="height:100%;width:0;background:rgba(44,226,107,.75);"></div>
      </div>
      <div id="units"></div>
    </div>

    <div id="lessonView" style="display:none;">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <button id="backBtn">←</button>
        <div id="lessonTitle" style="font-weight:900;"></div>
      </div>
      <div id="prompt" style="font-size:18px;font-weight:900;margin:12px 0;"></div>
      <div id="options" style="display:grid;gap:10px;"></div>

      <div id="tilesArea" style="display:none;margin-top:14px;">
        <div id="tilesPicked" style="min-height:44px;padding:10px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);margin-bottom:10px;"></div>
        <div id="tilesBank" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
      </div>

      <div id="inputWrap" style="display:none;margin-top:12px;">
        <input id="answerInput" placeholder="Введи ответ..." style="width:100%;padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.25);color:white;">
      </div>

      <div style="display:flex;gap:10px;margin-top:14px;">
        <button id="checkBtn">Проверить</button>
        <button id="nextBtn" disabled>Дальше</button>
      </div>
    </div>

    <div id="trainView" style="display:none;">
      <div style="font-weight:900;margin:8px 0 14px;">Тренировка</div>
      <div style="opacity:.8;">Нажми “Старт”, чтобы повторять слова из словаря.</div>
      <button id="trainStart" style="margin-top:12px;">Старт</button>
    </div>

    <div id="vocabView" style="display:none;">
      <div style="font-weight:900;margin:8px 0 14px;">Словарь</div>
      <div id="vocabList" style="display:grid;gap:10px;"></div>
    </div>

    <div id="toast" class="toast"></div>
  `;
  document.body.appendChild(root);

  // rebind ui
  ui.xp = $("xpVal");
  ui.streak = $("streakVal");
  ui.goalBar = $("goalBar");
  ui.goalText = $("goalText");

  ui.homeView = $("homeView");
  ui.lessonView = $("lessonView");
  ui.vocabView = $("vocabView");
  ui.trainView = $("trainView");

  ui.units = $("units");
  ui.lessonTitle = $("lessonTitle");
  ui.prompt = $("prompt");
  ui.options = $("options");
  ui.tilesArea = $("tilesArea");
  ui.tilesPicked = $("tilesPicked");
  ui.input = $("answerInput");
  ui.checkBtn = $("checkBtn");
  ui.nextBtn = $("nextBtn");
  ui.backBtn = $("backBtn");
  ui.vocabList = $("vocabList");
}

ensureBasicLayout();

/* ===========================
   Top UI sync
=========================== */
function syncTopUI() {
  if (ui.xp) ui.xp.textContent = String(state.xp);
  if (ui.streak) ui.streak.textContent = String(state.streak);

  const goal = state.dailyGoal || 50;
  const pct = clamp(Math.round((state.todayXp / goal) * 100), 0, 100);

  if (ui.goalBar) ui.goalBar.style.width = `${pct}%`;
  if (ui.goalText) ui.goalText.textContent = `${state.todayXp} / ${goal} XP`;

  if (ui.todayAnswers) ui.todayAnswers.textContent = String(state.todayAnswers);

  if (ui.accuracy) {
    const acc = state.todayAnswers > 0 ? Math.round((state.todayCorrect / state.todayAnswers) * 100) : 0;
    ui.accuracy.textContent = `${acc}%`;
  }
}

syncTopUI();

/* ===========================
   Level lock A1/A2
=========================== */
function isLevelUnlocked(level) {
  if (level === "A1") return true;
  if (level === "A2") {
    const a1Lessons = COURSE.units
      .filter((u) => u.level === "A1")
      .flatMap((u) => u.lessons);
    return a1Lessons.every((l) => Boolean(state.completed[l.id]));
  }
  return true;
}

/* ===========================
   Home rendering (PATH)
=========================== */
function findNextLessonId() {
  for (const u of COURSE.units) {
    for (const l of u.lessons) {
      if (!state.completed[l.id]) return l.id;
    }
  }
  // all completed: return first for practice
  return COURSE.units[0]?.lessons[0]?.id || null;
}

function renderHome() {
  syncTopUI();

  const container = ui.units;
  if (!container) return;

  container.innerHTML = "";

  const nextId = findNextLessonId();

  COURSE.units.forEach((unit) => {
    const wrap = document.createElement("div");
    wrap.className = "unit";

    // head
    const doneCount = unit.lessons.filter((l) => Boolean(state.completed[l.id])).length;
    const head = document.createElement("div");
    head.className = "unitHead";
    head.innerHTML = `<b>${unit.title}</b><span>${doneCount} / ${unit.lessons.length} пройдено</span>`;
    wrap.appendChild(head);

    const unlocked = isLevelUnlocked(unit.level);

    // path
    const path = document.createElement("div");
    path.className = "path";

    unit.lessons.forEach((lesson, i) => {
      const done = Boolean(state.completed[lesson.id]);
      const isNext = lesson.id === nextId;

      const node = document.createElement("div");
      const pos =
        i % 3 === 0
          ? "pathNode"
          : i % 3 === 1
          ? "pathNode pathNode--center"
          : "pathNode pathNode--right";
      node.className = pos;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "nodeBtn " + (done ? "nodeBtn--done" : isNext ? "nodeBtn--next" : "");
      btn.innerHTML = done ? "✅" : isNext ? "➡️" : "⚡";
      if (!unlocked) btn.style.opacity = "0.45";

      btn.onclick = () => {
        if (!unlocked) {
          showToast("🔒 Сначала закрой A1, потом откроется A2");
          return;
        }
        startLesson(lesson.id, { practice: false });
      };

      const info = document.createElement("div");
      info.style.width = "110px";
      info.innerHTML = `
        <div class="nodeText">${lesson.title}</div>
        <div class="nodeSub">${lesson.xp} XP</div>
      `;

      const col = document.createElement("div");
      col.style.display = "grid";
      col.style.justifyItems = "center";
      col.appendChild(btn);
      col.appendChild(info);

      node.appendChild(col);
      path.appendChild(node);
    });

    wrap.appendChild(path);
    container.appendChild(wrap);
  });
}

/* ===========================
   Lesson engine
=========================== */
let active = {
  lessonId: null,
  lesson: null,
  unit: null,
  mode: "lesson", // lesson|practice
  queue: [],
  index: 0,
  current: null,
  answered: false,
  correct: false,

  // tiles
  tilesPicked: [],
  tilesBank: []
};

function buildTaskQueue(lesson, mode) {
  const pairs = lesson.pairs.slice();

  // In practice mode: mix with all known words too
  let pool = pairs;
  if (mode === "practice") {
    const all = getAllPairs();
    pool = shuffle(all).slice(0, 10);
  }

  const tasks = [];
  pool.forEach((p, idx) => {
    // rotate task types to keep it fun
    const t = idx % 3; // 0 mcq, 1 tiles, 2 input
    if (t === 0) tasks.push({ type: "mcq", pair: p });
    if (t === 1) tasks.push({ type: "tiles", pair: p });
    if (t === 2) tasks.push({ type: "input", pair: p });
  });

  return shuffle(tasks);
}

function showView(name) {
  const map = {
    home: ui.homeView,
    lesson: ui.lessonView,
    vocab: ui.vocabView,
    train: ui.trainView,
    profile: ui.profileView
  };

  Object.entries(map).forEach(([k, el]) => {
    if (!el) return;
    el.style.display = k === name ? "" : "none";
  });
}

function setButtonsState() {
  if (ui.nextBtn) ui.nextBtn.disabled = !active.answered;
  if (ui.checkBtn) ui.checkBtn.disabled = active.answered;
}

function setLessonHeader() {
  if (!ui.lessonTitle) return;
  const title = active.mode === "practice" ? "Тренировка" : active.lesson.title;
  ui.lessonTitle.textContent = title;
}

function renderTask() {
  active.answered = false;
  active.correct = false;
  active.tilesPicked = [];
  active.tilesBank = [];

  setButtonsState();
  setLessonHeader();

  const task = active.queue[active.index];
  active.current = task;

  // clear
  if (ui.options) ui.options.innerHTML = "";
  const tilesBankEl = $("tilesBank");
  if (tilesBankEl) tilesBankEl.innerHTML = "";
  if (ui.tilesPicked) ui.tilesPicked.textContent = "";
  if (ui.input) ui.input.value = "";

  // hide/show areas
  if (ui.tilesArea) ui.tilesArea.style.display = "none";
  const inputWrap = $("inputWrap");
  if (inputWrap) inputWrap.style.display = "none";

  // prompt
  if (ui.prompt) ui.prompt.textContent = "";

  if (!task) {
    finishLesson();
    return;
  }

  if (task.type === "mcq") {
    const ru = task.pair.ru;
    if (ui.prompt) ui.prompt.textContent = `Переведи на ES: ${ru}`;

    const correct = task.pair.es;
    const distractors = shuffle(
      uniq(getAllPairs().map((x) => x.es)).filter((x) => x !== correct)
    ).slice(0, 3);

    const choices = shuffle([correct, ...distractors]);

    choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.className = "optionBtn";
      btn.type = "button";
      btn.textContent = choice;

      btn.onclick = () => {
        if (active.answered) return;
        active.answered = true;
        active.correct = normalizeAnswer(choice) === normalizeAnswer(correct);
        // highlight
        const allBtns = ui.options?.querySelectorAll("button") || [];
        allBtns.forEach((b) => (b.disabled = true));
        btn.classList.add(active.correct ? "optionBtn--ok" : "optionBtn--bad");
        setButtonsState();
      };

      ui.options.appendChild(btn);
    });
    return;
  }

  if (task.type === "tiles") {
    const ru = task.pair.ru;
    if (ui.prompt) ui.prompt.textContent = `Собери фразу (ES): ${ru}`;

    if (ui.tilesArea) ui.tilesArea.style.display = "";

    const words = task.pair.es.split(" ").filter(Boolean);
    const bank = shuffle(words);

    active.tilesBank = bank.slice();

    const bankEl = $("tilesBank");
    const pickedEl = ui.tilesPicked;

    function rerenderPicked() {
      if (!pickedEl) return;
      pickedEl.textContent = active.tilesPicked.join(" ");
      // when fully built, allow check
      if (active.tilesPicked.length === words.length) {
        // enable check button (not answered yet)
      }
    }

    function renderBank() {
      if (!bankEl) return;
      bankEl.innerHTML = "";
      active.tilesBank.forEach((w, idx) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tileBtn";
        b.textContent = w;

        b.onclick = () => {
          if (active.answered) return;
          // pick tile
          active.tilesPicked.push(w);
          active.tilesBank.splice(idx, 1);
          renderBank();
          rerenderPicked();
        };

        bankEl.appendChild(b);
      });

      // add backspace
      const back = document.createElement("button");
      back.type = "button";
      back.className = "tileBtn tileBtn--muted";
      back.textContent = "⌫";

      back.onclick = () => {
        if (active.answered) return;
        const last = active.tilesPicked.pop();
        if (last) active.tilesBank.push(last);
        active.tilesBank = shuffle(active.tilesBank);
        renderBank();
        rerenderPicked();
      };
      bankEl.appendChild(back);
    }

    renderBank();
    rerenderPicked();

    // For tiles task: user presses "Проверить"
    return;
  }

  if (task.type === "input") {
    const ru = task.pair.ru;
    if (ui.prompt) ui.prompt.textContent = `Введи по-испански: ${ru}`;

    const inputWrap = $("inputWrap");
    if (inputWrap) inputWrap.style.display = "";

    if (ui.input) {
      ui.input.focus();
      ui.input.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (!active.answered) onCheck();
        }
      };
    }
    return;
  }
}

function gradeCurrent() {
  const task = active.current;
  if (!task) return { ok: false, expected: "" };

  if (task.type === "mcq") {
    // already graded on click
    return { ok: active.correct, expected: task.pair.es };
  }

  if (task.type === "tiles") {
    const expected = task.pair.es;
    const got = active.tilesPicked.join(" ");
    const ok = normalizeAnswer(got) === normalizeAnswer(expected);
    return { ok, expected };
  }

  if (task.type === "input") {
    const expected = task.pair.es;
    const got = ui.input ? ui.input.value : "";
    const ok = normalizeAnswer(got) === normalizeAnswer(expected);
    return { ok, expected };
  }

  return { ok: false, expected: "" };
}

function addXp(amount) {
  const d = dayKey();
  state.xp += amount;
  state.todayXp += amount;
  state.xpByDay[d] = (state.xpByDay[d] || 0) + amount;
  saveState();
  syncTopUI();
}

function updateVocab(pair, ok) {
  const key = pair.es;
  state.vocab[key] = state.vocab[key] || { seen: 0, correct: 0, ru: pair.ru };
  state.vocab[key].seen += 1;
  if (ok) state.vocab[key].correct += 1;
  saveState();
}

function onCheck() {
  if (active.answered) return;

  // For tiles/input: grade now
  if (active.current?.type === "tiles" || active.current?.type === "input") {
    const res = gradeCurrent();
    active.answered = true;
    active.correct = res.ok;

    // show feedback
    if (!res.ok) showToast(`❌ Правильно: ${res.expected}`);
    else showToast("✅ Верно!");

    setButtonsState();
    return;
  }

  // For mcq user selects option; check button does nothing
  showToast("Выбери вариант 👇");
}

function onNext() {
  if (!active.answered) return;

  // apply stats for this task
  const task = active.current;
  const res = gradeCurrent();
  const ok = Boolean(res.ok);

  state.todayAnswers += 1;
  if (ok) state.todayCorrect += 1;

  // xp per task
  const xpGain = ok ? 5 : 2;
  addXp(xpGain);

  if (task?.pair) updateVocab(task.pair, ok);

  saveState();
  syncTopUI();

  // send to bot
  sendToBot({
    type: "answer",
    user: getUserTag(),
    day: state.day,
    ok,
    xpGain,
    lessonId: active.lessonId,
    mode: active.mode,
    ru: task?.pair?.ru || "",
    es: task?.pair?.es || ""
  });

  // daily quests
  checkDailyQuests();

  // next task
  active.index += 1;
  renderTask();
}

function startLesson(lessonId, opts = { practice: false }) {
  const found = findLessonById(lessonId);
  if (!found) {
    showToast("Не найден урок");
    return;
  }

  active.lessonId = lessonId;
  active.lesson = found.lesson;
  active.unit = found.unit;
  active.mode = opts.practice ? "practice" : "lesson";
  active.queue = buildTaskQueue(found.lesson, active.mode);
  active.index = 0;

  // bind buttons
  if (ui.backBtn) {
    ui.backBtn.onclick = () => {
      showView("home");
      renderHome();
    };
  }
  if (ui.checkBtn) ui.checkBtn.onclick = onCheck;
  if (ui.nextBtn) ui.nextBtn.onclick = onNext;

  showView("lesson");
  renderTask();

  sendToBot({
    type: "lesson_open",
    user: getUserTag(),
    day: state.day,
    lessonId,
    mode: active.mode
  });
}

function finishLesson() {
  // mark completed only in lesson mode
  if (active.mode === "lesson") {
    state.completed[active.lessonId] = true;
    saveState();
  }

  // lesson bonus
  const bonus = active.mode === "lesson" ? active.lesson.xp : 0;
  if (bonus > 0) addXp(bonus);

  // quest: close 1 lesson today
  if (active.mode === "lesson") {
    grantQuest("lesson1", 20, "Закрыл 1 урок сегодня");
  }

  sendToBot({
    type: "lesson_finish",
    user: getUserTag(),
    day: state.day,
    lessonId: active.lessonId,
    mode: active.mode,
    bonusXp: bonus
  });

  showToast(active.mode === "lesson" ? "🏁 Урок пройден!" : "🏁 Тренировка завершена");
  showView("home");
  renderHome();
}

/* ===========================
   Daily quests
=========================== */
function grantQuest(id, rewardXp, text) {
  if (state.dailyQuests.done[id]) return;
  state.dailyQuests.done[id] = true;

  addXp(rewardXp);
  saveState();
  syncTopUI();

  showToast(`🎁 Квест: ${text} (+${rewardXp} XP)`);
  sendToBot({
    type: "quest_done",
    user: getUserTag(),
    day: state.day,
    questId: id,
    rewardXp,
    text
  });
}

function checkDailyQuests() {
  // 10 answers
  if (state.todayAnswers >= 10) {
    grantQuest("answers10", 10, "10 ответов за день");
  }

  // 80% accuracy with 10+ answers
  if (state.todayAnswers >= 10) {
    const acc = Math.round((state.todayCorrect / state.todayAnswers) * 100);
    if (acc >= 80) {
      grantQuest("acc80", 15, "Точность 80%+");
    }
  }
}

/* ===========================
   Vocab render
=========================== */
function renderVocab() {
  syncTopUI();

  if (!ui.vocabList) return;
  ui.vocabList.innerHTML = "";

  const entries = Object.entries(state.vocab || {})
    .map(([es, st]) => ({ es, ...st }))
    .sort((a, b) => (b.seen || 0) - (a.seen || 0));

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.textContent = "Пока пусто. Пройди пару уроков 🙂";
    ui.vocabList.appendChild(empty);
    return;
  }

  entries.forEach((w) => {
    const acc = w.seen ? Math.round((w.correct / w.seen) * 100) : 0;

    const card = document.createElement("div");
    card.className = "vocabCard";
    card.innerHTML = `
      <div class="vocabRow">
        <div>
          <div class="vocabEs">${w.es}</div>
          <div class="vocabRu">${w.ru || ""}</div>
        </div>
        <div class="vocabStat">
          <div>${acc}%</div>
          <div class="muted">${w.correct || 0}/${w.seen || 0}</div>
        </div>
      </div>
    `;
    ui.vocabList.appendChild(card);
  });
}

/* ===========================
   Training
=========================== */
function startTraining() {
  // pick random words from vocab or all
  const pairs = getAllPairs();
  const queue = shuffle(pairs).slice(0, 10).map((p, idx) => {
    const t = idx % 3;
    if (t === 0) return { type: "mcq", pair: p };
    if (t === 1) return { type: "tiles", pair: p };
    return { type: "input", pair: p };
  });

  active.lessonId = "practice";
  active.lesson = { title: "Тренировка", xp: 0, pairs: pairs };
  active.unit = { title: "Тренировка" };
  active.mode = "practice";
  active.queue = shuffle(queue);
  active.index = 0;

  if (ui.backBtn) {
    ui.backBtn.onclick = () => {
      showView("home");
      renderHome();
    };
  }
  if (ui.checkBtn) ui.checkBtn.onclick = onCheck;
  if (ui.nextBtn) ui.nextBtn.onclick = onNext;

  showView("lesson");
  renderTask();
}

/* ===========================
   Tabs / navigation
=========================== */
function bindTabs() {
  // if there are buttons with data-tab, use them
  const tabs = document.querySelectorAll("[data-tab]");
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      if (tab === "home") {
        showView("home");
        renderHome();
      } else if (tab === "vocab") {
        showView("vocab");
        renderVocab();
      } else if (tab === "train") {
        showView("train");
      } else if (tab === "profile") {
        showView("profile");
      }
    });
  });

  const trainStart = $("trainStart");
  if (trainStart) {
    trainStart.onclick = () => startTraining();
  }
}

bindTabs();

/* ===========================
   Initial render
=========================== */
renderHome();

// Telegram theming (optional)
try {
  if (TG) {
    TG.ready();
    TG.expand();
  }
} catch {}

/* ===========================
   Styles fallback (only if your CSS doesn't have these)
=========================== */
(function injectSmallCssIfMissing() {
  // If your styles.css already has these classes, this won't break anything,
  // it just helps if something is missing.
  if (document.getElementById("appjsStyle")) return;
  const style = document.createElement("style");
  style.id = "appjsStyle";
  style.textContent = `
    .toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);
      padding:10px 14px;border-radius:14px;background:rgba(0,0,0,.72);
      border:1px solid rgba(255,255,255,.10);opacity:0;pointer-events:none;
      transition:opacity .16s ease; z-index:9999; color:#fff; font-weight:800;}
    .toast--show{opacity:1;}
    .optionBtn{padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.06);color:#fff;font-weight:900;cursor:pointer;}
    .optionBtn--ok{outline:2px solid rgba(44,226,107,.65);}
    .optionBtn--bad{outline:2px solid rgba(255,80,80,.65);}
    .tileBtn{padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.06);color:#fff;font-weight:900;cursor:pointer;}
    .tileBtn--muted{opacity:.8;}
    .unit{margin:16px 0;padding:14px;border-radius:18px;background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.08);}
    .unitHead{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;}
    .unitHead span{opacity:.7;font-size:12px;}
    .path{display:flex;flex-direction:column;gap:14px;padding:10px 4px 18px 4px;}
    .pathNode{width:100%;display:flex;justify-content:flex-start;}
    .pathNode--right{justify-content:flex-end;}
    .pathNode--center{justify-content:center;}
    .nodeBtn{width:74px;height:74px;border-radius:999px;border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.06);display:grid;place-items:center;cursor:pointer;
      transition:transform .12s ease, filter .12s ease;color:#fff;font-size:22px;}
    .nodeBtn:hover{transform:translateY(-2px);filter:brightness(1.05);}
    .nodeBtn--done{background:rgba(44,226,107,.15);border-color:rgba(44,226,107,.25);}
    .nodeBtn--next{background:rgba(74,163,255,.14);border-color:rgba(74,163,255,.25);}
    .nodeText{margin-top:8px;text-align:center;font-weight:900;color:#fff;}
    .nodeSub{text-align:center;opacity:.75;font-size:12px;}
    .vocabCard{padding:14px;border-radius:18px;background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.08);}
    .vocabRow{display:flex;justify-content:space-between;align-items:center;gap:10px;}
    .vocabEs{font-weight:900;font-size:18px;}
    .vocabRu{opacity:.75;margin-top:4px;}
    .vocabStat{text-align:right;}
    .muted{opacity:.75;font-size:12px;}
  `;
  document.head.appendChild(style);
})();
