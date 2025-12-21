/* =========================
   Telegram WebApp helpers (SAFE)
========================= */
const TG = window.Telegram?.WebApp || null;

if (TG) {
  TG.ready();
  TG.expand();
}

const CLOUD_KEY = "spanishTrainer_progress_v1";
const LS_KEY = "spanishTrainer_progress_local_v1";

// Флаг: смогли ли мы ВООБЩЕ прочитать CloudStorage без ошибки
let cloudReadable = false;

function cloudAvailable() {
  return !!(TG && TG.CloudStorage && typeof TG.CloudStorage.getItem === "function");
}

function cloudGet(key) {
  return new Promise((resolve) => {
    if (!cloudAvailable()) return resolve({ ok: false, value: null });

    TG.CloudStorage.getItem(key, (err, val) => {
      if (err) return resolve({ ok: false, value: null });
      resolve({ ok: true, value: val ?? null });
    });
  });
}

function cloudSet(key, value) {
  return new Promise((resolve) => {
    if (!cloudAvailable()) return resolve({ ok: false });

    TG.CloudStorage.setItem(key, value, (err) => {
      resolve({ ok: !err });
    });
  });
}

/* =========================
   Utils
========================= */
function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

/* =========================
   Data model
========================= */
const COURSE = [
  {
    id: "A1",
    title: "A1 • База",
    lessons: [
      { id: "A1_1", title: "Базовые слова", xp: 10, q: { prompt: "Как будет «Привет» по-испански?", options:["Hola","Gracias","Adiós","Por favor"], correct:0 }, words:[["hola","привет"]] },
      { id: "A1_2", title: "Прощание", xp: 12, q: { prompt: "Как будет «Пока»?", options:["Adiós","Hola","Sí","No"], correct:0 }, words:[["adiós","пока"]] },
      { id: "A1_3", title: "Вежливые фразы", xp: 14, q: { prompt: "Как будет «Спасибо»?", options:["Gracias","Lo siento","Por favor","De nada"], correct:0 }, words:[["gracias","спасибо"]] },
      { id: "A1_4", title: "Заказ", xp: 16, q: { prompt: "Как будет «Пожалуйста»?", options:["Por favor","Adiós","Hola","Buenas"], correct:0 }, words:[["por favor","пожалуйста"]] },
    ],
  },
  {
    id: "A2",
    title: "A2 • Дальше",
    lessons: [
      { id: "A2_1", title: "Завтра/сегодня", xp: 18, q: { prompt: "Как будет «Сегодня»?", options:["Hoy","Mañana","Ayer","Siempre"], correct:0 }, words:[["hoy","сегодня"]] },
      { id: "A2_2", title: "Да/нет", xp: 18, q: { prompt: "Как будет «Да»?", options:["Sí","No","Hola","Vale"], correct:0 }, words:[["sí","да"]] },
    ],
    lockedByUnit: "A1",
  }
];

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
    dayKey: todayKey(),
    lastActive: todayKey(),
  };
}

let progress = makeDefaultProgress();

/* =========================
   UI refs
========================= */
const screen = document.getElementById("screen");
const tabs = document.getElementById("tabs");

const xpTop = document.getElementById("xpTop");
const streakTop = document.getElementById("streakTop");

const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");

const btnCloseModal = document.getElementById("btnCloseModal");
const btnPrimary = document.getElementById("btnPrimary");
const btnSecondary = document.getElementById("btnSecondary");

const toast = document.getElementById("toast");

let currentTab = "home";

/* =========================
   Toast
========================= */
let toastTimer = null;
function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1700);
}

/* =========================
   Modal
========================= */
function openModal(title, bodyHtml, primaryText = "Ок", secondaryText = "Закрыть") {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  btnPrimary.textContent = primaryText;
  btnSecondary.textContent = secondaryText;
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  modalBody.innerHTML = "";
  btnPrimary.onclick = null;
  btnSecondary.onclick = null;
}

btnCloseModal.onclick = closeModal;
btnSecondary.onclick = closeModal;
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

/* =========================
   Day reset + streak
========================= */
function ensureDay() {
  const dk = todayKey();
  if (progress.dayKey !== dk) {
    progress.dayKey = dk;
    progress.answeredToday = 0;
    progress.correctToday = 0;
  }
}

function bumpActivity() {
  const dk = todayKey();
  const last = progress.lastActive;

  const a = new Date(dk + "T00:00:00");
  const b = new Date(last + "T00:00:00");
  const diffDays = Math.round((a - b) / (1000 * 60 * 60 * 24));

  if (diffDays > 1) progress.streak = 0;
  if (diffDays >= 1) progress.streak += 1;

  progress.lastActive = dk;
}

/* =========================
   Save/Load (SAFE)
========================= */
function serializeProgress(obj) {
  return JSON.stringify(obj);
}

function parseProgress(str) {
  const obj = JSON.parse(str);
  if (!obj || typeof obj !== "object") return null;
  if (typeof obj.xpTotal !== "number") return null;
  if (!obj.completed || typeof obj.completed !== "object") return null;
  if (!obj.vocab || typeof obj.vocab !== "object") obj.vocab = {};
  if (typeof obj.wordsLearned !== "number") obj.wordsLearned = Object.keys(obj.vocab).length;
  if (!obj.dayKey) obj.dayKey = todayKey();
  if (!obj.lastActive) obj.lastActive = todayKey();
  return obj;
}

// ВАЖНО: на старте НЕ пишем в облако, если мы его не смогли прочитать
async function loadProgress() {
  // 1) Cloud
  const c = await cloudGet(CLOUD_KEY);
  if (c.ok) cloudReadable = true;

  if (c.ok && c.value) {
    const p = parseProgress(c.value);
    if (p) return p;
  }

  // 2) LocalStorage
  const ls = localStorage.getItem(LS_KEY);
  if (ls) {
    const p = parseProgress(ls);
    if (p) return p;
  }

  // 3) Default
  return makeDefaultProgress();
}

async function saveProgress({ forceCloud = false } = {}) {
  const str = serializeProgress(progress);

  // local всегда
  localStorage.setItem(LS_KEY, str);

  // cloud только если:
  // - cloudReadable === true (мы смогли прочитать облако без ошибки)
  //   или forceCloud (пользователь явно захотел синк)
  if ((cloudReadable || forceCloud) && cloudAvailable()) {
    const res = await cloudSet(CLOUD_KEY, str);
    if (res.ok) cloudReadable = true;
  }
}

/* =========================
   Course helpers
========================= */
function isUnitLocked(unit) {
  if (!unit.lockedByUnit) return false;
  const req = COURSE.find(u => u.id === unit.lockedByUnit);
  if (!req) return false;
  return !req.lessons.every(lsn => progress.completed[lsn.id]);
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

function findLesson(lessonId) {
  for (const unit of COURSE) {
    for (const l of unit.lessons) {
      if (l.id === lessonId) return { unit, lesson: l };
    }
  }
  return null;
}

/* =========================
   Rendering
========================= */
function updateTopStats() {
  ensureDay();
  xpTop.textContent = String(progress.xpTotal || 0);
  streakTop.textContent = String(progress.streak || 0);
}

function renderTabs() {
  [...tabs.querySelectorAll(".tab")].forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === currentTab);
  });
}

function screenWrap(innerHtml) {
  screen.innerHTML = innerHtml;
}

function calcAccuracy() {
  if (!progress.answeredToday) return 0;
  return Math.round((progress.correctToday / progress.answeredToday) * 100);
}

function renderHome() {
  ensureDay();

  const acc = calcAccuracy();
  const goal = 50;
  const xpTodayApprox = progress.answeredToday * 10;
  const barPct = clamp(Math.round((xpTodayApprox / goal) * 100), 0, 100);

  const nextId = nextLessonId();
  const nextTitle = nextId ? (findLesson(nextId)?.lesson?.title || "урок") : "всё пройдено 🎉";

  screenWrap(`
    <div class="card hero">
      <h1>Учись быстро,<br/>приятно и без<br/>духоты</h1>
      <p>Кликаешь узел → проходишь урок → получаешь XP. Сердечек нет, лимитов нет 😉</p>

      <div class="heroActions">
        <button class="btn" id="btnContinue">Продолжить</button>
        <button class="btn ghost" id="btnSyncBot">Синк в бота</button>
        <button class="btn ghost" id="btnSyncCloud">Синк в облако</button>
        <button class="btn ghost" id="btnExport">Экспорт</button>
        <button class="btn ghost" id="btnImport">Импорт</button>
      </div>
    </div>

    <div class="card goal">
      <div class="goalTop">
        <div class="goalTitle">Цель дня</div>
        <div class="pill">стандарт</div>
      </div>
      <div class="bar"><div style="width:${barPct}%"></div></div>
      <div class="goalMeta">
        <div>${xpTodayApprox} / ${goal} XP</div>
        <div class="muted">точность: ${acc}%</div>
      </div>

      <div class="row2" style="margin-top:12px;">
        <div class="miniCard">
          <div class="bigNum">${progress.answeredToday}</div>
          <div class="muted">Сегодня ответов</div>
        </div>
        <div class="miniCard">
          <div class="bigNum">${acc}%</div>
          <div class="muted">Точность</div>
        </div>
      </div>

      <div class="miniCard" style="margin-top:12px;">
        <div class="bigNum">${progress.wordsLearned}</div>
        <div class="muted">Изучено слов</div>
      </div>

      <div style="margin-top:10px; color: var(--muted); font-weight: 900;">
        Следующий урок: <span style="color: var(--text)">${nextTitle}</span>
      </div>
    </div>

    <div class="sectionHead">
      <h2>Путь обучения</h2>
      <div class="hint">модули → уроки → задания</div>
    </div>

    <div class="card pathCard" id="homePreview"></div>
  `);

  // preview A1
  document.getElementById("homePreview").innerHTML = renderPathCardHtml(true);

  document.getElementById("btnContinue").onclick = () => {
    currentTab = "path";
    render();
  };

  document.getElementById("btnSyncBot").onclick = syncToBot;
  document.getElementById("btnSyncCloud").onclick = async () => {
    await saveProgress({ forceCloud: true });
    showToast("Сохранено в облако ✅");
  };

  document.getElementById("btnExport").onclick = showExport;
  document.getElementById("btnImport").onclick = showImport;
}

function renderPathCardHtml(previewOnly = false) {
  let html = "";

  for (const unit of COURSE) {
    const locked = isUnitLocked(unit);
    const doneCount = unit.lessons.filter(l => progress.completed[l.id]).length;

    html += `
      <div class="unitHead">
        <div>
          <div class="unitTitle">${unit.title}</div>
          <div class="unitSub">${doneCount} / ${unit.lessons.length} пройдено</div>
        </div>
        <div class="unitBadge">${locked ? "закрыто" : "открыто"}</div>
      </div>

      ${locked ? `<div class="lockText">закрыто пока ${unit.lockedByUnit} не пройден</div>` : ""}

      <div class="nodeList">
        ${unit.lessons.map(l => renderNodeRow(unit, l, locked)).join("")}
      </div>
    `;

    if (previewOnly) break;
    html += `<div style="height:14px;"></div>`;
  }

  return html;
}

function renderNodeRow(unit, lesson, unitLocked) {
  const done = !!progress.completed[lesson.id];
  const next = (!unitLocked && !done && lesson.id === nextLessonId());
  const locked = unitLocked;

  const icon = locked ? "🔒" : (done ? "✅" : (next ? "➡️" : "⚡"));
  const sub = done ? "пройдено" : (next ? "следующий" : "доступно");

  const attrs = locked ? "" : `data-lesson="${lesson.id}"`;

  return `
    <div class="nodeRow">
      <div class="nodeIcon">${icon}</div>
      <div class="nodePill" ${attrs}>
        <div class="nodeTitle">${lesson.title}</div>
        <div class="nodeSub">${lesson.xp} XP • ${sub}</div>
      </div>
    </div>
  `;
}

function renderPath() {
  screenWrap(`
    <div class="card pathCard">
      ${renderPathCardHtml(false)}
    </div>
  `);

  document.querySelectorAll("[data-lesson]").forEach(el => {
    el.onclick = () => startLesson(el.getAttribute("data-lesson"));
  });
}

function renderPractice() {
  const nextId = nextLessonId();
  const next = nextId ? findLesson(nextId)?.lesson : null;

  screenWrap(`
    <div class="card">
      <div style="font-size:24px; font-weight:1000;">Практика</div>
      <div class="muted">быстро набиваем XP</div>

      <div class="list">
        <div class="item">
          <div>
            <div style="font-weight:1000;">Случайный урок</div>
            <div class="muted">рандом из доступных</div>
          </div>
          <button class="btn ghost small" id="btnRandom">Старт</button>
        </div>

        <div class="item">
          <div>
            <div style="font-weight:1000;">Следующий урок</div>
            <div class="muted">${next ? next.title : "всё пройдено 🎉"}</div>
          </div>
          <button class="btn small" id="btnNext">${next ? "Поехали" : "Ок"}</button>
        </div>

        <div class="item">
          <div>
            <div style="font-weight:1000;">Перенос</div>
            <div class="muted">экспорт/импорт строкой</div>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn ghost small" id="btnExport2">Экспорт</button>
            <button class="btn ghost small" id="btnImport2">Импорт</button>
          </div>
        </div>

        <div class="item">
          <div>
            <div style="font-weight:1000;">Облако</div>
            <div class="muted">синк между устройствами</div>
          </div>
          <button class="btn ghost small" id="btnSyncCloud2">Синк</button>
        </div>
      </div>
    </div>
  `);

  document.getElementById("btnRandom").onclick = () => {
    const available = [];
    for (const unit of COURSE) {
      if (isUnitLocked(unit)) continue;
      for (const l of unit.lessons) if (!progress.completed[l.id]) available.push(l.id);
    }
    if (!available.length) return showToast("Всё уже пройдено 🎉");
    startLesson(available[Math.floor(Math.random() * available.length)]);
  };

  document.getElementById("btnNext").onclick = () => {
    if (!nextId) return showToast("Ты всё прошёл 🎉");
    startLesson(nextId);
  };

  document.getElementById("btnExport2").onclick = showExport;
  document.getElementById("btnImport2").onclick = showImport;

  document.getElementById("btnSyncCloud2").onclick = async () => {
    await saveProgress({ forceCloud: true });
    showToast("Сохранено в облако ✅");
  };
}

function renderVocab() {
  const entries = Object.entries(progress.vocab || {});
  const body = entries.length
    ? entries.map(([w, t]) => `
        <div class="item">
          <div style="min-width:0;">
            <div style="font-weight:1000;">${w}</div>
            <div class="muted">${t}</div>
          </div>
        </div>
      `).join("")
    : `
        <div class="item">
          <div style="min-width:0;">
            <div style="font-weight:1000;">Пока пусто</div>
            <div class="muted">пройди 1 урок</div>
          </div>
        </div>
      `;

  screenWrap(`
    <div class="card">
      <div style="font-size:24px; font-weight:1000;">Словарь</div>
      <div class="muted">то, что ты уже закрепил</div>

      <div class="list">${body}</div>

      <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn ghost" id="btnReset">Сбросить прогресс</button>
        <button class="btn ghost" id="btnSyncBot2">Синк в бота</button>
        <button class="btn ghost" id="btnSyncCloud3">Синк в облако</button>
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
      await saveProgress({ forceCloud: true }); // сброс осознанно синкаем
      closeModal();
      showToast("Сброшено ✅");
      render();
    };

    btnSecondary.onclick = closeModal;
  };

  document.getElementById("btnSyncBot2").onclick = syncToBot;
  document.getElementById("btnSyncCloud3").onclick = async () => {
    await saveProgress({ forceCloud: true });
    showToast("Сохранено в облако ✅");
  };
}

function render() {
  updateTopStats();
  renderTabs();
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
      if (TG?.HapticFeedback) TG.HapticFeedback.selectionChanged();
    };
  });

  btnPrimary.onclick = async () => {
    if (selected === null) return showToast("Выбери вариант 🙂");

    ensureDay();
    progress.answeredToday += 1;

    const correct = (selected === lesson.q.correct);
    if (correct) progress.correctToday += 1;

    if (!correct) {
      if (TG?.HapticFeedback) TG.HapticFeedback.notificationOccurred("error");
      showToast("Неверно 😅");
      return;
    }

    if (TG?.HapticFeedback) TG.HapticFeedback.notificationOccurred("success");

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

    await saveProgress(); // обычное сохранение (в облако только если оно читается)
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
        <button class="btn ghost" id="btnSendBot">Синк в бота</button>
        <button class="btn ghost" id="btnSaveCloud">Синк в облако</button>
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

  document.getElementById("btnSendBot").onclick = () => syncToBot();
  document.getElementById("btnSaveCloud").onclick = async () => {
    await saveProgress({ forceCloud: true });
    showToast("Сохранено в облако ✅");
  };

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
    try { p = parseProgress(raw); } catch { p = null; }
    if (!p) return showToast("Не похоже на прогресс 😅");

    progress = p;
    // импорт — это осознанное действие, можно синкнуть в облако
    await saveProgress({ forceCloud: true });

    closeModal();
    showToast("Импортировано ✅");
    render();
  };

  btnSecondary.onclick = closeModal;
}

/* =========================
   Sync to bot
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

  currentTab = btn.dataset.tab;
  if (TG?.HapticFeedback) TG.HapticFeedback.selectionChanged();
  render();
});

/* =========================
   Init (SAFE: no auto cloud overwrite)
========================= */
(async function init() {
  progress = await loadProgress();
  ensureDay();

  // ВАЖНО: тут НЕ делаем saveProgress() сразу, чтобы не стереть облако дефолтом
  // Сохранять будем только при изменениях / синке / импорте

  render();
})();
