/* Spanish Trainer – mini-duo style
   - no hearts / limits
   - 3 task types: mcq / tiles / input
   - progress saved in localStorage
   - sends stats to Telegram bot via WebApp.sendData (optional)
*/

const STORAGE_KEY = "spanish_trainer_state_v4";
const BUILD = "v5"; // меняй число когда пушишь


/** ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeAnswer(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function showToast(text) {
  const el = $("toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("toast--show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("toast--show"), 1400);
}

function getWeekKey(d = new Date()) {
  // ISO-ish week key: YYYY-W##
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function isTelegramWebApp() {
  return typeof window.Telegram !== "undefined" && window.Telegram.WebApp;
}

function tgUserId() {
  try {
    if (!isTelegramWebApp()) return null;
    return window.Telegram.WebApp.initDataUnsafe?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** ---------- course content ---------- */
const COURSE = {
  title: "Spanish Trainer",
  levels: [
    {
      id: "A1",
      title: "A1 • База",
      locked: false,
      units: [
        {
          id: "u1",
          title: "Приветствия",
          lessons: [
            {
              id: "l1",
              title: "Базовые слова",
              xp: 10,
              tasks: [
                {
                  type: "mcq",
                  q: "Переведи на ES: «спасибо»",
                  a: "gracias",
                  options: ["hola", "gracias", "por favor", "adiós"],
                  vocab: ["gracias"]
                },
                {
                  type: "tiles",
                  q: "Собери фразу: «Пожалуйста»",
                  a: "por favor",
                  tiles: ["por", "favor", "gracias", "hola"],
                  vocab: ["por", "favor"]
                },
                {
                  type: "input",
                  q: "Напиши по-испански: «привет»",
                  a: "hola",
                  placeholder: "введи ответ…",
                  vocab: ["hola"]
                },
              ],
            },
            {
              id: "l2",
              title: "Прощание",
              xp: 12,
              tasks: [
                {
                  type: "mcq",
                  q: "Переведи на ES: «пока»",
                  a: "adiós",
                  options: ["adiós", "gracias", "buenos días", "hola"],
                  vocab: ["adiós"]
                },
                {
                  type: "input",
                  q: "Напиши по-испански: «доброе утро»",
                  a: "buenos días",
                  placeholder: "введи ответ…",
                  vocab: ["buenos", "días"]
                },
              ],
            },
          ],
        },
        {
          id: "u2",
          title: "Вежливость",
          lessons: [
            {
              id: "l3",
              title: "Вежливые фразы",
              xp: 14,
              tasks: [
                {
                  type: "tiles",
                  q: "Собери фразу: «Извините»",
                  a: "perdón",
                  tiles: ["perdón", "hola", "por", "favor"],
                  vocab: ["perdón"]
                },
                {
                  type: "mcq",
                  q: "Переведи на ES: «пожалуйста»",
                  a: "por favor",
                  options: ["por favor", "adiós", "gracias", "buenas noches"],
                  vocab: ["por", "favor"]
                },
              ],
            },
          ],
        },
        {
          id: "u3",
          title: "Кафе",
          lessons: [
            {
              id: "l4",
              title: "Заказ",
              xp: 16,
              tasks: [
                {
                  type: "mcq",
                  q: "Переведи на ES: «кофе»",
                  a: "café",
                  options: ["café", "agua", "pan", "leche"],
                  vocab: ["café"]
                },
                {
                  type: "tiles",
                  q: "Собери фразу: «Один кофе, пожалуйста»",
                  a: "un café por favor",
                  tiles: ["un", "café", "por", "favor", "gracias"],
                  vocab: ["un", "café", "por", "favor"]
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "A2",
      title: "A2 • Дальше",
      locked: true,
      lockText: "закрыто пока A1 не пройден",
      units: [
        {
          id: "u4",
          title: "Планы",
          lessons: [
            {
              id: "l5",
              title: "Завтра/сегодня",
              xp: 18,
              tasks: [
                {
                  type: "mcq",
                  q: "Переведи на ES: «завтра»",
                  a: "mañana",
                  options: ["mañana", "hoy", "ayer", "siempre"],
                  vocab: ["mañana"]
                },
                {
                  type: "input",
                  q: "Напиши по-испански: «сегодня»",
                  a: "hoy",
                  placeholder: "введи ответ…",
                  vocab: ["hoy"]
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/** ---------- state ---------- */
const defaultState = () => ({
  userId: tgUserId(),
  xpTotal: 0,
  streak: 0,
  lastActiveDate: null,

  // daily
  day: todayISO(),
  dayGoal: 50,
  dayXp: 0,
  dayAnswers: 0,
  dayCorrect: 0,

  // weekly
  weekKey: getWeekKey(),
  weekXp: 0,

  // progress
  completed: {}, // lessonId -> true

  // vocab: word -> {seen, correct, last}
  vocab: {},

  // ui
  tab: "home",
});

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);

    // sync dates / reset daily+weekly if needed
    const t = todayISO();
    if (s.day !== t) {
      s.day = t;
      s.dayXp = 0;
      s.dayAnswers = 0;
      s.dayCorrect = 0;
    }

    const wk = getWeekKey();
    if (s.weekKey !== wk) {
      s.weekKey = wk;
      s.weekXp = 0;
    }

    // keep userId if telegram
    s.userId = tgUserId() ?? s.userId ?? null;

    return { ...defaultState(), ...s };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** ---------- streak & activity ---------- */
function touchActivity() {
  const t = todayISO();
  const last = state.lastActiveDate;

  if (last === t) {
    // same day, no change
  } else {
    // diff days -> update streak
    const prev = last ? new Date(last) : null;
    const now = new Date(t);
    if (!prev) {
      state.streak = 1;
    } else {
      const diffDays = Math.round((now - prev) / 86400000);
      if (diffDays === 1) state.streak = Math.max(1, state.streak + 1);
      else state.streak = 1;
    }
    state.lastActiveDate = t;
  }

  saveState();
}

/** ---------- telegram sync ---------- */
function tgReady() {
  if (!isTelegramWebApp()) return;
  const tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();
}

function tgSendStats(reason = "progress") {
  if (!isTelegramWebApp()) return;
  const tg = window.Telegram.WebApp;

  const payload = {
    type: "stats",
    reason,
    userId: state.userId,
    day: state.day,
    dayXp: state.dayXp,
    dayAnswers: state.dayAnswers,
    dayCorrect: state.dayCorrect,
    weekKey: state.weekKey,
    weekXp: state.weekXp,
    xpTotal: state.xpTotal,
    streak: state.streak,
    learnedWords: Object.keys(state.vocab).length,
  };

  // sendData has size limit; payload is small
  tg.sendData(JSON.stringify(payload));
}

/** ---------- UI rendering ---------- */
function setTab(tab) {
  state.tab = tab;
  saveState();
  render();
}

function courseDoneA1() {
  const a1 = COURSE.levels.find(l => l.id === "A1");
  if (!a1) return false;
  const allLessons = a1.units.flatMap(u => u.lessons);
  return allLessons.every(ls => state.completed[ls.id]);
}

function computeNextLessonId() {
  // next = first uncompleted lesson in unlocked levels (A2 locked until A1 done)
  for (const lvl of COURSE.levels) {
    const locked = lvl.locked && !courseDoneA1();
    if (locked) continue;
    for (const unit of lvl.units) {
      for (const lesson of unit.lessons) {
        if (!state.completed[lesson.id]) return lesson.id;
      }
    }
  }
  return null;
}

function lessonById(id) {
  for (const lvl of COURSE.levels) {
    for (const unit of lvl.units) {
      for (const lesson of unit.lessons) {
        if (lesson.id === id) return { lvl, unit, lesson };
      }
    }
  }
  return null;
}

function unitProgress(unit) {
  const total = unit.lessons.length;
  const done = unit.lessons.filter(l => state.completed[l.id]).length;
  return { done, total };
}

function renderTopBar() {
  const wrap = document.createElement("div");
  wrap.className = "topBar";

  const left = document.createElement("div");
  left.className = "brand";
  left.innerHTML = `
    <div class="logo"></div>
    <div>
      <div class="brandTitle">${COURSE.title}</div>
      <div class="brandSub">мини-дуо режим 😏 • без лимитов</div>
    </div>
  `;

  const right = document.createElement("div");
  right.className = "pills";
  right.innerHTML = `
    <div class="pill"><span class="ico">⚡</span><span id="xpTotal">${state.xpTotal}</span></div>
    <div class="pill"><span class="ico">🔥</span><span id="streak">${state.streak}</span></div>
  `;

  wrap.appendChild(left);
  wrap.appendChild(right);
  return wrap;
}

function renderNav() {
  const nav = document.createElement("div");
  nav.className = "nav";

  const items = [
    ["home", "🏠", "Главная"],
    ["practice", "🎯", "Практика"],
    ["league", "🏆", "Лига"],
    ["vocab", "📚", "Словарь"],
  ];

  for (const [id, ico, label] of items) {
    const b = document.createElement("button");
    b.className = state.tab === id ? "active" : "";
    b.innerHTML = `<span>${ico}</span><span>${label}</span>`;
    b.onclick = () => setTab(id);
    nav.appendChild(b);
  }
  return nav;
}

function renderHome() {
  const grid = document.createElement("div");
  grid.className = "grid";

  // hero
  const hero = document.createElement("div");
  hero.className = "hero";

  hero.innerHTML = `
    <h1>Учись быстро, приятно и без духоты</h1>
    <p>Кликаешь узел → проходишь урок → получаешь XP. Сердечек нет, лимитов нет 😌</p>
    <div class="heroActions">
      <button class="btn" id="btnContinue">Продолжить</button>
      <button class="btnGhost" id="btnSync">Синк в бота</button>
    </div>
  `;

  // right card
  const nextId = computeNextLessonId();
  const stats = document.createElement("div");
  stats.className = "card";
  stats.innerHTML = `
    <div class="cardTitle">
      <span>Цель дня</span>
      <span class="small">стандарт</span>
    </div>
    <div class="progressBar"><div id="goalBar"></div></div>
    <div class="small" style="margin-top:8px">${state.dayXp} / ${state.dayGoal} XP</div>

    <div class="kpis">
      <div class="kpi">
        <div class="v">${state.dayAnswers}</div>
        <div class="t">Сегодня ответов</div>
      </div>
      <div class="kpi">
        <div class="v">${state.dayAnswers ? Math.round((state.dayCorrect/state.dayAnswers)*100) : 0}%</div>
        <div class="t">Точность</div>
      </div>
    </div>

    <div class="kpi" style="margin-top:10px">
      <div class="v">${Object.keys(state.vocab).length}</div>
      <div class="t">Изучено слов</div>
    </div>

    <div class="small" style="margin-top:12px">
      Следующий урок: <b>${nextId ? lessonById(nextId).lesson.title : "всё пройдено ✅"}</b>
    </div>
  `;

  // path
  const path = document.createElement("div");
  path.className = "pathWrap";

  const header = document.createElement("div");
  header.className = "cardTitle";
  header.innerHTML = `
    <span>Путь обучения</span>
    <span class="small">модули → уроки → задания</span>
  `;
  path.appendChild(header);

  const pathColumn = document.createElement("div");
  pathColumn.className = "pathColumn";

  const nextLesson = computeNextLessonId();

  for (const lvl of COURSE.levels) {
    const lvlLocked = lvl.locked && !courseDoneA1();

    const lvlHead = document.createElement("div");
    lvlHead.className = "levelHeader";
    lvlHead.innerHTML = `
      <div class="levelTitle">${lvl.title}</div>
      ${lvlLocked ? `<div class="levelLock">${lvl.lockText || "закрыто"}</div>` : `<div class="levelLock">открыто</div>`}
    `;
    pathColumn.appendChild(lvlHead);

    for (const unit of lvl.units) {
      const row = document.createElement("div");
      row.className = "unitRow";

      const p = unitProgress(unit);
      row.innerHTML = `
        <div class="unitTop">
          <div class="uTitle">${unit.title}</div>
          <div class="uProg">${p.done}/${p.total} пройдено</div>
        </div>
      `;

      const nodes = document.createElement("div");
      nodes.className = "nodes";

      unit.lessons.forEach((lesson, idx) => {
        const done = Boolean(state.completed[lesson.id]);
        const isNext = lesson.id === nextLesson;
        const locked = lvlLocked || (!done && nextLesson !== lesson.id && !state.completed[lesson.id] && computeNextLessonId() !== lesson.id && !isNext);

        // zigzag offset pattern
        const offsets = [0, 140, 60, 180, 30, 160];
        const offset = offsets[idx % offsets.length];

        const nodeRow = document.createElement("div");
        nodeRow.className = "nodeRow";
        nodeRow.classList.add(i % 2 === 0 ? "left" : "right");
        nodeRow.style.marginLeft = `${offset}px`;

        const node = document.createElement("div");
        node.className = "node" + (done ? " done" : "") + (isNext ? " next" : "") + (lvlLocked ? " locked" : "");
        node.setAttribute("role", "button");
        node.setAttribute("aria-disabled", lvlLocked ? "true" : "false");
        node.innerHTML = `
        
          <div class="icon">${done ? "✅" : (isNext ? "➡️" : "⚡")}</div>
          <div class="label">
            <div class="t">${lesson.title}</div>
            <div class="s">${lesson.xp} XP • ${done ? "пройдено" : (isNext ? "следующий" : (lvlLocked ? "закрыто" : "доступно"))}</div>
          </div>
        `;

        node.onclick = () => {
          if (lvlLocked) return;
          // allow open if done or next, or if earlier lessons done in unlocked level (простая логика)
          const mustBe = computeNextLessonId();
          if (!done && mustBe && mustBe !== lesson.id) {
            showToast("Сначала пройди следующий доступный узел 🙂");
            return;
          }
          openLesson(lesson.id);
        };

        nodes.appendChild(nodeRow);
        nodeRow.appendChild(node);

        // connector
        if (idx < unit.lessons.length - 1) {
          const c = document.createElement("div");
          c.className = "connector";
          c.style.marginLeft = `${offset + 43}px`;
          nodes.appendChild(c);
        }
      });

      row.appendChild(nodes);
      pathColumn.appendChild(row);
    }
  }

  path.appendChild(pathColumn);

  grid.appendChild(hero);
  grid.appendChild(stats);

  const wrap = document.createElement("div");
  wrap.appendChild(grid);
  wrap.appendChild(path);

  // hooks
  setTimeout(() => {
    const bar = $("goalBar");
    if (bar) {
      const pct = Math.min(100, Math.round((state.dayXp / Math.max(1, state.dayGoal)) * 100));
      bar.style.width = pct + "%";
    }

    $("btnContinue")?.addEventListener("click", () => {
      const id = computeNextLessonId();
      if (!id) return showToast("Всё пройдено ✅");
      openLesson(id);
    });

    $("btnSync")?.addEventListener("click", () => {
      if (!isTelegramWebApp()) return showToast("Открой это в Telegram Mini App");
      tgSendStats("manual_sync");
      showToast("Отправил статистику боту ✅");
    });
  }, 0);

  return wrap;
}

function renderPractice() {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="cardTitle">
      <span>Практика</span>
      <span class="small">повторение</span>
    </div>
    <div class="small">Выбирай случайные задания из уже пройденных уроков.</div>
    <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn" id="btnPractice">Старт практики</button>
      <button class="btnGhost" id="btnPracticeHard">Хард режим</button>
    </div>
  `;

  setTimeout(() => {
    $("btnPractice")?.addEventListener("click", () => startPractice(false));
    $("btnPracticeHard")?.addEventListener("click", () => startPractice(true));
  }, 0);

  return card;
}

function renderLeague() {
  const card = document.createElement("div");
  card.className = "card";

  const pct = state.dayAnswers ? Math.round((state.dayCorrect / state.dayAnswers) * 100) : 0;

  card.innerHTML = `
    <div class="cardTitle">
      <span>Лига</span>
      <span class="small">неделя</span>
    </div>

    <div class="kpi">
      <div class="v">${state.weekXp} XP</div>
      <div class="t">Твоя неделя (${state.weekKey})</div>
    </div>

    <div class="kpis" style="margin-top:10px">
      <div class="kpi">
        <div class="v">${state.xpTotal}</div>
        <div class="t">Всего XP</div>
      </div>
      <div class="kpi">
        <div class="v">${pct}%</div>
        <div class="t">Точность сегодня</div>
      </div>
    </div>

    <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn" id="btnSendLeague">Отправить в бота</button>
      <button class="btnGhost" id="btnResetWeek">Сбросить неделю (локально)</button>
    </div>

    <div class="small" style="margin-top:10px">
      <b>Глобальная</b> лига (топ всех пользователей) считает бот — по тем данным, что ты отправляешь “Отправить в бота”.
    </div>
  `;

  setTimeout(() => {
    $("btnSendLeague")?.addEventListener("click", () => {
      if (!isTelegramWebApp()) return showToast("Открой в Telegram Mini App");
      tgSendStats("league_sync");
      showToast("Отправил ✅");
    });
    $("btnResetWeek")?.addEventListener("click", () => {
      state.weekXp = 0;
      saveState();
      showToast("Сбросил неделю локально");
      render();
    });
  }, 0);

  return card;
}

function renderVocab() {
  const card = document.createElement("div");
  card.className = "card";

  const words = Object.entries(state.vocab)
    .map(([w, o]) => ({ w, ...o }))
    .sort((a, b) => (b.last || "").localeCompare(a.last || ""));

  card.innerHTML = `
    <div class="cardTitle">
      <span>Словарь</span>
      <span class="small">${words.length} слов</span>
    </div>

    <div class="inputRow">
      <input id="vocabSearch" placeholder="поиск…" />
      <button class="btnGhost" id="btnClearVocab">Очистить</button>
    </div>

    <div id="vocabList" style="margin-top:12px;display:flex;flex-direction:column;gap:10px"></div>
  `;

  function draw(filter = "") {
    const list = $("vocabList");
    if (!list) return;
    list.innerHTML = "";

    const f = normalizeAnswer(filter);
    const filtered = words.filter(x => normalizeAnswer(x.w).includes(f));

    if (!filtered.length) {
      const e = document.createElement("div");
      e.className = "small";
      e.textContent = "Пока пусто. Проходи уроки — слова будут появляться тут.";
      list.appendChild(e);
      return;
    }

    for (const it of filtered) {
      const row = document.createElement("div");
      row.className = "kpi";
      const acc = it.seen ? Math.round((it.correct / it.seen) * 100) : 0;
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div>
            <div class="v" style="font-size:18px">${it.w}</div>
            <div class="t">видел: ${it.seen} • верно: ${it.correct} • ${acc}%</div>
          </div>
          <button class="btnGhost" data-word="${it.w}">Повторить</button>
        </div>
      `;
      row.querySelector("button")?.addEventListener("click", () => startVocabReview(it.w));
      list.appendChild(row);
    }
  }

  setTimeout(() => {
    const inp = $("vocabSearch");
    inp?.addEventListener("input", () => draw(inp.value));

    $("btnClearVocab")?.addEventListener("click", () => {
      if (!confirm("Точно очистить словарь (локально)?")) return;
      state.vocab = {};
      saveState();
      showToast("Очистил словарь");
      render();
    });

    draw("");
  }, 0);

  return card;
}

function render() {
  const root = $("app");
  root.innerHTML = "";

  root.appendChild(renderTopBar());
  root.appendChild(renderNav());

  if (state.tab === "home") root.appendChild(renderHome());
  if (state.tab === "practice") root.appendChild(renderPractice());
  if (state.tab === "league") root.appendChild(renderLeague());
  if (state.tab === "vocab") root.appendChild(renderVocab());
}

/** ---------- lesson modal engine ---------- */
let lessonRuntime = null;

function openLesson(lessonId) {
  const data = lessonById(lessonId);
  if (!data) return;

  const { lesson } = data;

  lessonRuntime = {
    lessonId,
    lesson,
    idx: 0,
    selected: null,
    tilePool: [],
    tilePick: [],
    inputVal: "",
    checked: false,
    lastCorrect: null,
  };

  $("modal").classList.remove("hidden");
  $("modalClose").onclick = closeLesson;
  $("btnSkip").onclick = skipTask;
  $("btnCheck").onclick = checkOrNext;

  drawTask();
}

function closeLesson() {
  $("modal").classList.add("hidden");
  lessonRuntime = null;
  $("modalHint").textContent = "";
  $("modalHint").className = "hint";
}

function currentTask() {
  if (!lessonRuntime) return null;
  return lessonRuntime.lesson.tasks[lessonRuntime.idx] || null;
}

function drawTask() {
  const rt = lessonRuntime;
  if (!rt) return;

  const total = rt.lesson.tasks.length;
  const idx = rt.idx + 1;

  $("modalTitle").textContent = rt.lesson.title;
  $("modalSub").textContent = `${idx}/${total} • ${rt.lesson.xp} XP за урок`;
  $("modalHint").textContent = "";
  $("modalHint").className = "hint";

  const body = $("modalBody");
  body.innerHTML = "";

  const task = currentTask();
  if (!task) {
    // lesson finished
    finishLesson();
    return;
  }

  rt.checked = false;
  rt.lastCorrect = null;
  rt.selected = null;
  rt.inputVal = "";
  rt.tilePick = [];
  rt.tilePool = [];

  const box = document.createElement("div");
  box.className = "taskBox";
  box.innerHTML = `
    <div class="taskQ">${task.q}</div>
    <div class="taskHelp">${task.type === "tiles" ? "кликай слова, собери ответ" :
                           task.type === "input" ? "введи ответ и жми проверить" :
                           "выбери вариант"}</div>
  `;

  if (task.type === "mcq") {
    const opts = document.createElement("div");
    opts.className = "options";
    task.options.forEach((t) => {
      const b = document.createElement("div");
      b.className = "opt";
      b.textContent = t;
      b.onclick = () => {
        if (rt.checked) return;
        rt.selected = t;
        [...opts.children].forEach(x => x.classList.remove("selected"));
        b.classList.add("selected");
      };
      opts.appendChild(b);
    });
    box.appendChild(opts);
  }

  if (task.type === "tiles") {
    const wrap = document.createElement("div");
    wrap.className = "tilesWrap";

    const topLine = document.createElement("div");
    topLine.className = "tileLine";
    topLine.id = "tilePick";

    const botLine = document.createElement("div");
    botLine.className = "tileLine";
    botLine.id = "tilePool";

    const tiles = shuffle(task.tiles);
    rt.tilePool = tiles;

    function redrawTiles() {
      topLine.innerHTML = "";
      botLine.innerHTML = "";

      rt.tilePick.forEach((w, i) => {
        const t = document.createElement("div");
        t.className = "tile";
        t.textContent = w;
        t.onclick = () => {
          if (rt.checked) return;
          rt.tilePick.splice(i, 1);
          rt.tilePool.push(w);
          redrawTiles();
        };
        topLine.appendChild(t);
      });

      rt.tilePool.forEach((w, i) => {
        const t = document.createElement("div");
        t.className = "tile";
        t.textContent = w;
        t.onclick = () => {
          if (rt.checked) return;
          rt.tilePool.splice(i, 1);
          rt.tilePick.push(w);
          redrawTiles();
        };
        botLine.appendChild(t);
      });
    }

    redrawTiles();
    wrap.appendChild(topLine);
    wrap.appendChild(botLine);
    box.appendChild(wrap);
  }

  if (task.type === "input") {
    const row = document.createElement("div");
    row.className = "inputRow";
    row.innerHTML = `
      <input id="answerInput" placeholder="${task.placeholder || "введи ответ…"}" />
      <button class="btnGhost" id="btnClearInput">Очистить</button>
    `;
    box.appendChild(row);

    setTimeout(() => {
      const inp = $("answerInput");
      inp?.focus();
      inp?.addEventListener("input", () => (rt.inputVal = inp.value));
      $("btnClearInput")?.addEventListener("click", () => {
        rt.inputVal = "";
        if (inp) inp.value = "";
        inp?.focus();
      });
    }, 0);
  }

  body.appendChild(box);

  // button label
  $("btnCheck").textContent = "Проверить";
}

function skipTask() {
  if (!lessonRuntime) return;
  lessonRuntime.idx++;
  drawTask();
}

function checkOrNext() {
  const rt = lessonRuntime;
  if (!rt) return;

  if (rt.checked) {
    // next
    rt.idx++;
    drawTask();
    return;
  }

  const task = currentTask();
  if (!task) return;

  // Build user answer
  let userAnswer = "";
  if (task.type === "mcq") userAnswer = rt.selected ?? "";
  if (task.type === "tiles") userAnswer = rt.tilePick.join(" ");
  if (task.type === "input") userAnswer = rt.inputVal ?? "";

  const ok = normalizeAnswer(userAnswer) === normalizeAnswer(task.a);
  rt.checked = true;
  rt.lastCorrect = ok;

  // update daily stats
  touchActivity();
  state.dayAnswers += 1;
  if (ok) state.dayCorrect += 1;

  // vocab update
  if (Array.isArray(task.vocab)) {
    for (const w of task.vocab) {
      const key = w.trim();
      if (!key) continue;
      const obj = state.vocab[key] || { seen: 0, correct: 0, last: null };
      obj.seen += 1;
      if (ok) obj.correct += 1;
      obj.last = new Date().toISOString();
      state.vocab[key] = obj;
    }
  }

  // UI feedback
  const hint = $("modalHint");
  if (ok) {
    hint.textContent = `✅ Верно! +XP`;
    hint.className = "hint ok";
  } else {
    hint.textContent = `❌ Неверно. Правильно: ${task.a}`;
    hint.className = "hint bad";
  }

  // style options if mcq
  if (task.type === "mcq") {
    const opts = document.querySelectorAll(".opt");
    opts.forEach(el => {
      const txt = el.textContent;
      if (normalizeAnswer(txt) === normalizeAnswer(task.a)) el.classList.add("correct");
      if (rt.selected && normalizeAnswer(txt) === normalizeAnswer(rt.selected) && !ok) el.classList.add("wrong");
    });
  }

  // XP only if correct (можно поменять позже)
  if (ok) {
    const gain = Math.max(1, Math.round(rt.lesson.xp / rt.lesson.tasks.length));
    state.xpTotal += gain;
    state.dayXp += gain;
    state.weekXp += gain;
  }

  saveState();

  $("btnCheck").textContent = "Дальше";
}

function finishLesson() {
  const rt = lessonRuntime;
  if (!rt) return;

  // mark lesson complete
  state.completed[rt.lessonId] = true;

  // bonus XP for completion
  const bonus = Math.max(2, Math.round(rt.lesson.xp * 0.3));
  state.xpTotal += bonus;
  state.dayXp += bonus;
  state.weekXp += bonus;

  saveState();

  // show finish screen
  const body = $("modalBody");
  body.innerHTML = `
    <div class="taskBox">
      <div class="taskQ">Урок пройден ✅</div>
      <div class="taskHelp">+${bonus} XP бонусом за завершение. Можешь идти дальше.</div>

      <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" id="btnFinishNext">Следующий урок</button>
        <button class="btnGhost" id="btnFinishClose">На главную</button>
      </div>
    </div>
  `;

  $("btnSkip").style.display = "none";
  $("btnCheck").style.display = "none";

  setTimeout(() => {
    $("btnFinishClose")?.addEventListener("click", () => {
      closeLesson();
      $("btnSkip").style.display = "";
      $("btnCheck").style.display = "";
      render();
    });

    $("btnFinishNext")?.addEventListener("click", () => {
      const next = computeNextLessonId();
      if (!next) {
        showToast("Пока всё пройдено ✅");
        closeLesson();
        $("btnSkip").style.display = "";
        $("btnCheck").style.display = "";
        render();
        return;
      }

      $("btnSkip").style.display = "";
      $("btnCheck").style.display = "";
      openLesson(next);
      render();
    });

    // send stats to bot (not spammy)
    if (isTelegramWebApp()) {
      tgSendStats("lesson_complete");
    }
  }, 0);
}

function startPractice(hard = false) {
  // practice picks random tasks from completed lessons (or all if none)
  const completedIds = Object.keys(state.completed).filter(id => state.completed[id]);
  let lessons = [];

  if (completedIds.length) {
    lessons = completedIds.map(id => lessonById(id)?.lesson).filter(Boolean);
  } else {
    // if nothing complete, use first A1 lesson
    lessons = [lessonById("l1")?.lesson].filter(Boolean);
  }

  const tasks = lessons.flatMap(l => l.tasks.map(t => ({ ...t, _lesson: l.title })));
  if (!tasks.length) return showToast("Пока нечего практиковать");

  const pick = shuffle(tasks).slice(0, hard ? 8 : 5);

  // open pseudo lesson
  const pseudo = {
    id: "practice",
    title: hard ? "Практика • Хард" : "Практика",
    xp: hard ? 18 : 12,
    tasks: pick.map(t => ({
      ...t,
      q: `${t.q} <span style="opacity:.55;font-size:12px">(${t._lesson})</span>`
    })),
  };

  lessonRuntime = {
    lessonId: "__practice__",
    lesson: pseudo,
    idx: 0,
    selected: null,
    tilePool: [],
    tilePick: [],
    inputVal: "",
    checked: false,
    lastCorrect: null,
  };

  $("modal").classList.remove("hidden");
  $("modalClose").onclick = closeLesson;
  $("btnSkip").onclick = skipTask;
  $("btnCheck").onclick = checkOrNext;
  $("btnSkip").style.display = "";
  $("btnCheck").style.display = "";

  drawTask();
}

function startVocabReview(word) {
  const w = word;
  const pseudo = {
    id: "vocab",
    title: `Повторение • ${w}`,
    xp: 10,
    tasks: [
      {
        type: "input",
        q: `Напиши слово: «${w}»`,
        a: w,
        placeholder: "введи то же слово…",
        vocab: [w]
      },
      {
        type: "mcq",
        q: `Выбери слово: «${w}»`,
        a: w,
        options: shuffle([w, "hola", "gracias", "por favor", "adiós"]).slice(0, 4),
        vocab: [w]
      }
    ]
  };

  lessonRuntime = {
    lessonId: "__vocab__",
    lesson: pseudo,
    idx: 0,
    selected: null,
    tilePool: [],
    tilePick: [],
    inputVal: "",
    checked: false,
    lastCorrect: null,
  };

  $("modal").classList.remove("hidden");
  $("modalClose").onclick = closeLesson;
  $("btnSkip").onclick = skipTask;
  $("btnCheck").onclick = checkOrNext;
  $("btnSkip").style.display = "";
  $("btnCheck").style.display = "";

  drawTask();
}

/** ---------- init ---------- */
function boot() {
  tgReady();
  render();

  // daily/weekly sanity
  touchActivity();
  saveState();

  // small note
  if (isTelegramWebApp()) {
    showToast("Telegram Mini App: OK ✅");
  } else {
    showToast("Локально: OK ✅");
  }
}
boot();
