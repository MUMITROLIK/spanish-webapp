/* =========================
   Telegram WebApp helper
========================= */
const TG = window.Telegram?.WebApp || null;
try {
  TG?.ready?.();
  TG?.expand?.();
} catch {}

/* =========================
   Storage keys
========================= */
const LS_KEY = "spanish_trainer_progress_v1";
const CLOUD_KEY = "spanish_trainer_progress_cloud_v1";

/* =========================
   Course (пример)
   (можешь расширять)
========================= */
const COURSE = [
  {
    id: "a1",
    title: "A1 • База",
    lessons: [
      {
        id: "a1_1",
        title: "Базовые слова",
        xp: 10,
        q: {
          prompt: "Как будет “привет” по-испански?",
          options: ["Adiós", "Hola", "Gracias"],
          correct: 1,
        },
        words: [["hola", "привет"]],
      },
      {
        id: "a1_2",
        title: "Прощание",
        xp: 12,
        q: {
          prompt: "Как будет “пока” по-испански?",
          options: ["Adiós", "Buenos días", "Por favor"],
          correct: 0,
        },
        words: [["adiós", "пока / до свидания"]],
      },
      {
        id: "a1_3",
        title: "Вежливые фразы",
        xp: 14,
        q: {
          prompt: "Как будет “спасибо” по-испански?",
          options: ["Gracias", "Lo siento", "De nada"],
          correct: 0,
        },
        words: [["gracias", "спасибо"]],
      },
      {
        id: "a1_4",
        title: "Заказ",
        xp: 16,
        q: {
          prompt: "Как будет “пожалуйста” (в просьбе) по-испански?",
          options: ["Por favor", "Buenas noches", "Vale"],
          correct: 0,
        },
        words: [["por favor", "пожалуйста"]],
      },
    ],
  },
  {
    id: "a2",
    title: "A2 • Дальше",
    lessons: [
      {
        id: "a2_1",
        title: "Завтра/сегодня",
        xp: 18,
        q: {
          prompt: "Как будет “сегодня” по-испански?",
          options: ["Mañana", "Hoy", "Ayer"],
          correct: 1,
        },
        words: [["hoy", "сегодня"]],
      },
      {
        id: "a2_2",
        title: "Да/нет",
        xp: 18,
        q: {
          prompt: "Как будет “да” по-испански?",
          options: ["No", "Sí", "Quizás"],
          correct: 1,
        },
        words: [["sí", "да"]],
      },
    ],
  },
];

/* =========================
   Progress model
========================= */
function makeDefaultProgress() {
  return {
    version: 1,
    xpTotal: 0,
    streak: 0,
    answeredToday: 0,
    correctToday: 0,
    wordsLearned: 0,
    completed: {},
    vocab: {},
    dayKey: getDayKey(),
    lastActive: getDayKey(),
  };
}

/* =========================
   CloudStorage wrappers
========================= */
function cloudAvailable() {
  return !!(TG && TG.CloudStorage && typeof TG.CloudStorage.getItem === "function");
}

function cloudGetItem(key) {
  return new Promise((resolve) => {
    if (!cloudAvailable()) return resolve(null);
    TG.CloudStorage.getItem(key, (err, value) => {
      if (err) return resolve(null);
      resolve(value ?? null);
    });
  });
}

function cloudSetItem(key, value) {
  return new Promise((resolve) => {
    if (!cloudAvailable()) return resolve(false);
    TG.CloudStorage.setItem(key, value, (err, ok) => {
      if (err) return resolve(false);
      resolve(!!ok);
    });
  });
}

/* =========================
   Serialize/parse
========================= */
function serializeProgress(p) {
  return JSON.stringify(p);
}

function parseProgress(raw) {
  const obj = JSON.parse(raw);
  if (!obj || typeof obj !== "object") return null;
  if (obj.version !== 1) return null;
  if (typeof obj.xpTotal !== "number") return null;
  if (!obj.completed || typeof obj.completed !== "object") obj.completed = {};
  if (!obj.vocab || typeof obj.vocab !== "object") obj.vocab = {};
  return obj;
}

/* =========================
   Migration: try other keys
========================= */
function tryLoadFromLocalCandidates() {
  const keys = [
    LS_KEY,
    "progress",
    "state",
    "stats",
    "duo_progress",
    "spanish_progress",
  ];

  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const p = parseProgress(raw);
      if (p) return p;
    } catch {}
  }
  return null;
}

/* =========================
   Load / Save progress
========================= */
async function loadProgress() {
  // 1) Try Telegram Cloud (shared across devices)
  try {
    const cloudRaw = await cloudGetItem(CLOUD_KEY);
    if (cloudRaw) {
      const p = parseProgress(cloudRaw);
      if (p) return p;
    }
  } catch {}

  // 2) Try localStorage
  try {
    const local = tryLoadFromLocalCandidates();
    if (local) return local;
  } catch {}

  // 3) Default
  return makeDefaultProgress();
}

async function saveProgress() {
  const raw = serializeProgress(progress);

  // local
  try {
    localStorage.setItem(LS_KEY, raw);
  } catch {}

  // cloud
  try {
    await cloudSetItem(CLOUD_KEY, raw);
  } catch {}
}

/* =========================
   Daily logic
========================= */
function getDayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ensureDay() {
  const dk = getDayKey();
  if (progress.dayKey !== dk) {
    progress.dayKey = dk;
    progress.answeredToday = 0;
    progress.correctToday = 0;
  }
}

function bumpActivity() {
  const dk = getDayKey();
  if (progress.lastActive !== dk) {
    progress.lastActive = dk;
    progress.streak += 1;
  }
}

/* =========================
   UI refs
========================= */
const tabs = document.getElementById("tabs");
const screen = document.getElementById("screen");
const xpTop = document.getElementById("xpTop");
const streakTop = document.getElementById("streakTop");

const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const btnPrimary = document.getElementById("btnPrimary");
const btnSecondary = document.getElementById("btnSecondary");
const btnX = document.getElementById("btnX");

const toast = document.getElementById("toast");

/* =========================
   Global state
========================= */
let currentTab = "home";
let progress = makeDefaultProgress();

/* =========================
   Toast
========================= */
let toastTimer = null;
function showToast(text) {
  toast.textContent = text;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 1800);
}

/* =========================
   Modal (кликабельный)
========================= */
function openModal(title, bodyHtml, primaryText = "Ок", secondaryText = "Отмена") {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  btnPrimary.textContent = primaryText;
  btnSecondary.textContent = secondaryText;

  // ВАЖНО: снять прошлые обработчики (чтоб не накапливались)
  btnPrimary.onclick = null;
  btnSecondary.onclick = null;

  // показать
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  modalBody.innerHTML = "";
}

btnX.onclick = closeModal;

// клик по затемнению — закрыть, но не по карточке
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

/* =========================
   Helpers
========================= */
function screenWrap(html) {
  screen.innerHTML = html;
}

function setActiveTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${tab}"]`)?.classList.add("active");
}

/* =========================
   Course helpers
========================= */
function findLesson(lessonId) {
  for (const unit of COURSE) {
    for (const lesson of unit.lessons) {
      if (lesson.id === lessonId) return { unit, lesson };
    }
  }
  return null;
}

function unitCompletedCount(unit) {
  let done = 0;
  for (const l of unit.lessons) if (progress.completed[l.id]) done++;
  return done;
}

function isUnitLocked(unit) {
  // A1 открыт всегда, A2 закрыт пока A1 не пройден
  if (unit.id === "a1") return false;
  const a1 = COURSE.find(u => u.id === "a1");
  return unitCompletedCount(a1) < a1.lessons.length;
}

function nextLessonId() {
  for (const unit of COURSE) {
    if (isUnitLocked(unit)) continue;
    for (const l of unit.lessons) {
      if (!progress.completed[l.id]) return l.id;
    }
  }
  return null;
}

/* =========================
   Render: Top + screens
========================= */
function renderTop() {
  xpTop.textContent = progress.xpTotal;
  streakTop.textContent = progress.streak;
}

function renderHome() {
  screenWrap(`
    <div class="card">
      <div class="heroTitle">Учись быстро,<br/>приятно и без<br/>духоты</div>
      <div class="heroSub">
        Кликаешь узел → проходишь урок → получаешь XP. Сердечек нет, лимитов нет 😉
      </div>

      <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn" id="btnContinue">Продолжить</button>
        <button class="btn ghost" id="btnSyncCloud">Синк (в Telegram)</button>
        <button class="btn ghost" id="btnLoadCloud">Загрузить</button>
        <button class="btn ghost" id="btnExport">Экспорт</button>
        <button class="btn ghost" id="btnImport">Импорт</button>
      </div>

      <div class="list">
        <div class="item">
          <div>
            <div style="font-weight:1100;">Цель дня</div>
            <div class="muted">${progress.answeredToday} / 50 XP</div>
          </div>
          <div class="muted">точность: ${progress.answeredToday ? Math.round((progress.correctToday / progress.answeredToday) * 100) : 0}%</div>
        </div>

        <div class="item">
          <div>
            <div style="font-weight:1100;">Сегодня ответов</div>
            <div class="muted">${progress.answeredToday}</div>
          </div>
          <div>
            <div style="font-weight:1100;">Изучено слов</div>
            <div class="muted">${progress.wordsLearned}</div>
          </div>
        </div>

        <div class="item">
          <div>
            <div style="font-weight:1100;">Следующий урок</div>
            <div class="muted">${(nextLessonId() ? findLesson(nextLessonId()).lesson.title : "всё пройдено 🎉")}</div>
          </div>
          <button class="btn small" id="btnGoNext">Поехали</button>
        </div>
      </div>
    </div>
  `);

  document.getElementById("btnContinue").onclick = () => {
    const next = nextLessonId();
    if (!next) return showToast("Ты всё прошёл 🎉");
    startLesson(next);
  };

  document.getElementById("btnGoNext").onclick = () => {
    const next = nextLessonId();
    if (!next) return showToast("Ты всё прошёл 🎉");
    startLesson(next);
  };

  // Cloud sync (shared across devices)
  document.getElementById("btnSyncCloud").onclick = async () => {
    await saveProgress();
    showToast(cloudAvailable() ? "Сохранено в Telegram ✅" : "Сохранено локально ✅");
  };

  document.getElementById("btnLoadCloud").onclick = async () => {
    const p = await loadProgress();
    progress = p;
    ensureDay();
    await saveProgress();
    render();
    showToast(cloudAvailable() ? "Загружено из Telegram ✅" : "Загружено ✅");
  };

  document.getElementById("btnExport").onclick = showExport;
  document.getElementById("btnImport").onclick = showImport;
}

function renderPathCardHtml(unitLocked) {
  let html = `<div class="card"><div style="font-size:24px;font-weight:1100;">Путь обучения</div><div class="muted">модули → уроки → задания</div>`;

  for (const unit of COURSE) {
    const locked = isUnitLocked(unit);
    const done = unitCompletedCount(unit);
    const total = unit.lessons.length;

    html += `
      <div style="margin-top:16px; font-weight:1100; display:flex; justify-content:space-between; align-items:center;">
        <div>${unit.title}</div>
        <div class="muted">${locked ? "закрыто" : "открыто"} • ${done}/${total}</div>
      </div>
    `;

    for (const lesson of unit.lessons) {
      html += renderNodeRow(unit, lesson, locked);
    }
  }

  html += `</div>`;
  return html;
}

function renderNodeRow(unit, lesson, unitLocked) {
  const done = !!progress.completed[lesson.id];
  const next = (!unitLocked && !done && lesson.id === nextLessonId());
  const locked = unitLocked;

  const iconClass = locked ? "lock" : (done ? "done" : (next ? "next" : ""));
  const icon = locked ? "🔒" : (done ? "✅" : (next ? "➡️" : "⚡"));

  const sub = done ? "пройдено" : (next ? "следующий" : "доступно");
  const pillAttrs = locked ? "" : `data-lesson="${lesson.id}"`;

  return `
    <div class="nodeRow">
      <div class="nodeIcon ${iconClass}">${icon}</div>
      <div class="nodePill" ${pillAttrs}>
        <div class="nodeMain">
          <div class="nodeTitle">${lesson.title}</div>
          <div class="nodeSub">${lesson.xp} XP • ${sub}</div>
        </div>
        ${locked ? `<div class="lockText">закрыто</div>` : `<div class="lockText">играть</div>`}
      </div>
    </div>
  `;
}

function renderPath() {
  screenWrap(renderPathCardHtml(false));
  document.querySelectorAll("[data-lesson]").forEach(el => {
    el.onclick = () => startLesson(el.getAttribute("data-lesson"));
  });
}

function renderPractice() {
  const nextId = nextLessonId();
  const next = nextId ? findLesson(nextId)?.lesson : null;

  screenWrap(`
    <div class="card">
      <div style="font-size:24px; font-weight:1100;">Практика</div>
      <div class="muted">быстро набиваем XP</div>

      <div class="list">
        <div class="item">
          <div>
            <div style="font-weight:1100;">Случайный урок</div>
            <div class="muted">рандом из доступных</div>
          </div>
          <button class="btn ghost small" id="btnRandom">Старт</button>
        </div>

        <div class="item">
          <div>
            <div style="font-weight:1100;">Следующий урок</div>
            <div class="muted">${next ? next.title : "всё пройдено 🎉"}</div>
          </div>
          <button class="btn small" id="btnNext">${next ? "Поехали" : "Ок"}</button>
        </div>

        <div class="item">
          <div>
            <div style="font-weight:1100;">Экспорт/Импорт</div>
            <div class="muted">перенос прогресса строкой</div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn ghost small" id="btnExport2">Экспорт</button>
            <button class="btn ghost small" id="btnImport2">Импорт</button>
          </div>
        </div>
      </div>
    </div>
  `);

  document.getElementById("btnRandom").onclick = () => {
    const available = [];
    for (const unit of COURSE) {
      if (isUnitLocked(unit)) continue;
      for (const l of unit.lessons) {
        if (!progress.completed[l.id]) available.push(l.id);
      }
    }
    if (!available.length) return showToast("Всё уже пройдено 🎉");
    const rnd = available[Math.floor(Math.random() * available.length)];
    startLesson(rnd);
  };

  document.getElementById("btnNext").onclick = () => {
    if (!nextId) return showToast("Ты всё прошёл 🎉");
    startLesson(nextId);
  };

  document.getElementById("btnExport2").onclick = showExport;
  document.getElementById("btnImport2").onclick = showImport;
}

function renderVocab() {
  const entries = Object.entries(progress.vocab || {});
  const body = entries.length
    ? entries.map(([w, t]) => `
        <div class="item">
          <div style="font-weight:1100;">${w}</div>
          <div class="muted">${t}</div>
        </div>
      `).join("")
    : `<div class="item"><div style="font-weight:1100;">Пока пусто</div><div class="muted">пройди 1 урок</div></div>`;

  screenWrap(`
    <div class="card">
      <div style="font-size:24px; font-weight:1100;">Словарь</div>
      <div class="muted">то, что ты уже закрепил</div>

      <div class="list">${body}</div>

      <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn ghost" id="btnReset">Сбросить прогресс</button>
        <button class="btn ghost" id="btnSendBot">Синк в бота</button>
      </div>
    </div>
  `);

  document.getElementById("btnReset").onclick = () => {
    openModal(
      "Сброс",
      `<div class="qTitle">Точно сбросить прогресс?</div>
       <div class="muted">Это удалит XP, стрик и пройденные уроки.</div>`,
      "Да, сбросить",
      "Отмена"
    );

    btnPrimary.onclick = async () => {
      progress = makeDefaultProgress();
      await saveProgress();
      closeModal();
      showToast("Сброшено ✅");
      render();
    };

    btnSecondary.onclick = closeModal;
  };

  document.getElementById("btnSendBot").onclick = syncToBot;
}

function render() {
  ensureDay();
  renderTop();

  if (currentTab === "home") renderHome();
  if (currentTab === "path") renderPath();
  if (currentTab === "practice") renderPractice();
  if (currentTab === "vocab") renderVocab();
}

/* =========================
   Lesson flow
========================= */
function startLesson(lessonId) {
  const found = findLesson(lessonId);
  if (!found) return showToast("Урок не найден");

  const { lesson } = found;
  let selected = null;

  openModal(
    lesson.title,
    `
      <div class="qTitle">${lesson.q.prompt}</div>
      <div class="opts">
        ${lesson.q.options.map((t, i) => `<button class="opt" data-opt="${i}">${t}</button>`).join("")}
      </div>
      <div class="muted" style="margin-top:10px;">Награда: ${lesson.xp} XP</div>
    `,
    "Проверить",
    "Закрыть"
  );

  modalBody.querySelectorAll("[data-opt]").forEach(btn => {
    btn.onclick = () => {
      modalBody.querySelectorAll(".opt").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      selected = Number(btn.getAttribute("data-opt"));
      TG?.HapticFeedback?.selectionChanged?.();
    };
  });

  btnPrimary.onclick = async () => {
    if (selected === null) return showToast("Выбери вариант 🙂");

    ensureDay();
    progress.answeredToday += 1;

    const correct = (selected === lesson.q.correct);
    if (correct) progress.correctToday += 1;

    if (!correct) {
      TG?.HapticFeedback?.notificationOccurred?.("error");
      showToast("Неверно 😅");
      return;
    }

    TG?.HapticFeedback?.notificationOccurred?.("success");

    bumpActivity();

    if (!progress.completed[lesson.id]) {
      progress.xpTotal += lesson.xp;
      progress.completed[lesson.id] = true;

      if (lesson.words && Array.isArray(lesson.words)) {
        for (const [w, t] of lesson.words) {
          if (!progress.vocab[w]) {
            progress.vocab[w] = t;
            progress.wordsLearned += 1;
          }
        }
      }
    }

    await saveProgress();
    closeModal();
    showToast(`+${lesson.xp} XP ✅`);
    render();
  };

  btnSecondary.onclick = closeModal;
}

/* =========================
   Export / Import
========================= */
function showExport() {
  const data = serializeProgress(progress);

  openModal(
    "Экспорт прогресса",
    `
      <div class="muted" style="margin-bottom:10px;">
        Скопируй строку и вставь на другом устройстве в “Импорт”.
      </div>
      <textarea class="textarea" id="exportBox" readonly></textarea>
      <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
        <button class="btn ghost" id="btnCopy">Копировать</button>
        <button class="btn ghost" id="btnSaveCloud">Синк (Telegram)</button>
        <button class="btn ghost" id="btnSendBot2">Синк в бота</button>
      </div>
    `,
    "Закрыть",
    "Ок"
  );

  const box = document.getElementById("exportBox");
  box.value = data;

  document.getElementById("btnCopy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(data);
      showToast("Скопировано ✅");
    } catch {
      box.focus();
      box.select();
      showToast("Скопируй вручную ✍️");
    }
  };

  document.getElementById("btnSaveCloud").onclick = async () => {
    await saveProgress();
    showToast(cloudAvailable() ? "Сохранено в Telegram ✅" : "Сохранено локально ✅");
  };

  document.getElementById("btnSendBot2").onclick = syncToBot;

  btnPrimary.onclick = closeModal;
  btnSecondary.onclick = closeModal;
}

function showImport() {
  openModal(
    "Импорт прогресса",
    `
      <div class="muted" style="margin-bottom:10px;">
        Вставь строку (JSON) из “Экспорт”.
      </div>
      <textarea class="textarea" id="importBox" placeholder="Вставь сюда..."></textarea>
    `,
    "Импортировать",
    "Отмена"
  );

  btnPrimary.onclick = async () => {
    const raw = document.getElementById("importBox").value.trim();
    if (!raw) return showToast("Пусто 🙂");

    let p = null;
    try { p = parseProgress(raw); } catch {}

    if (!p) return showToast("Не похоже на прогресс 😅");

    progress = p;
    ensureDay();
    await saveProgress();
    closeModal();
    showToast("Импортировано ✅");
    render();
  };

  btnSecondary.onclick = closeModal;
}

/* =========================
   Sync to bot (sendData)
========================= */
function syncToBot() {
  const data = serializeProgress(progress);
  if (TG && typeof TG.sendData === "function") {
    TG.sendData(data);
    showToast("Отправил в бота ✅");
  } else {
    showToast("Telegram WebApp не найден 🤷‍♂️");
  }
}

/* =========================
   Tabs
========================= */
tabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  setActiveTab(btn.dataset.tab);
  TG?.HapticFeedback?.selectionChanged?.();
  render();
});

/* =========================
   Init
========================= */
(async function init() {
  try {
    progress = await loadProgress();
    ensureDay();
    await saveProgress(); // фиксируем в cloud/local
    render();
  } catch (e) {
    console.error(e);
    showToast("Ошибка инициализации 😵");
  }
})();
