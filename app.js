/* =========================
   Telegram + Storage helpers
========================= */

// ✅ основной ключ (НЕ МЕНЯЙ, иначе “пропадёт прогресс”)
const STORAGE_KEY = "spanish_trainer_progress_v1";

// ✅ если раньше был другой ключ — добавь сюда (миграция)
const LEGACY_KEYS = [
  "duo_like_progress_v1",
  "spanish_trainer_progress", // если вдруг было
];

function tg() {
  return window.Telegram?.WebApp;
}
function hasCloudStorage() {
  return !!tg()?.CloudStorage;
}

function cloudGet(key) {
  return new Promise((resolve) => {
    try{
      tg().CloudStorage.getItem(key, (err, value) => {
        if (err) return resolve(null);
        resolve(value ?? null);
      });
    }catch(_){
      resolve(null);
    }
  });
}

function cloudSet(key, value) {
  return new Promise((resolve) => {
    try{
      tg().CloudStorage.setItem(key, value, () => resolve());
    }catch(_){
      resolve();
    }
  });
}

function safeParse(json) {
  try { return JSON.parse(json); } catch { return null; }
}

/* =========================
   Progress model
========================= */
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
    vocab: {},
    dayKey: todayKey(),
    lastActive: todayKey()
  };
}

function ensureDay(prog) {
  const t = todayKey();
  if (prog.dayKey !== t) {
    // новый день
    prog.dayKey = t;
    prog.answeredToday = 0;
    prog.correctToday = 0;
  }
}

/* =========================
   ✅ Robust load/save (Cloud + Local mirror)
   - НЕ перетираем нулём при старте
   - миграция со старых ключей
========================= */
function localGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function localSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

async function loadProgress() {
  // 1) пробуем CloudStorage
  if (hasCloudStorage()) {
    const cloudRaw = await cloudGet(STORAGE_KEY);
    const cloudObj = cloudRaw ? safeParse(cloudRaw) : null;
    if (cloudObj) return cloudObj;
  }

  // 2) пробуем localStorage
  const localRaw = localGet(STORAGE_KEY);
  const localObj = localRaw ? safeParse(localRaw) : null;
  if (localObj) return localObj;

  // 3) миграция со старых ключей (сначала Cloud, потом Local)
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

  // 4) ничего нет → дефолт
  return defaultProgress();
}

async function saveProgress(prog) {
  const raw = JSON.stringify(prog);

  // ✅ пишем в local всегда (быстро/надёжно)
  localSet(STORAGE_KEY, raw);

  // ✅ и в Cloud (для синка между устройствами)
  if (hasCloudStorage()) {
    await cloudSet(STORAGE_KEY, raw);
  }
}

/* =========================
   Simple content (lessons)
========================= */
const LESSONS = [
  { id: "m1r1", title: "Модуль 1 · Раздел 1", sub: "Заказывайте в кафе", xp: 20 },
  { id: "m1r2", title: "Модуль 1 · Раздел 2", sub: "Приветствия", xp: 20 },
  { id: "m1r3", title: "Модуль 1 · Раздел 3", sub: "Происхождение", xp: 20 },
];

const TASKS = [
  {
    label: "НОВОЕ СЛОВО",
    title: "Переведи предложение",
    prompt: "Francia y México.",
    words: ["Франция", "и", "Мексика"]
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
    correct: ["Yo","soy","Ana","encantada"]
  }
];

/* =========================
   UI helpers
========================= */
const el = (id) => document.getElementById(id);

const screens = {
  home: el("screenHome"),
  path: el("screenPath"),
  practice: el("screenPractice"),
  stats: el("screenStats"),
};

function setActiveScreen(name) {
  Object.entries(screens).forEach(([k, node]) => {
    node.classList.toggle("isActive", k === name);
  });

  document.querySelectorAll(".tab").forEach(btn => {
    btn.classList.toggle("isActive", btn.dataset.go === name);
  });
}

function animateTaskSwap(fnRender) {
  const card = el("taskCard");
  card.classList.add("taskSwapOut");
  setTimeout(() => {
    fnRender();
    requestAnimationFrame(() => {
      card.classList.remove("taskSwapOut");
    });
  }, 180);
}

/* =========================
   Modal (clickable fix)
========================= */
const modal = el("modal");
const modalTitle = el("modalTitle");
const modalBody = el("modalBody");
const modalOk = el("modalOk");
const modalCancel = el("modalCancel");
const modalX = el("modalX");

let modalResolver = null;

function openModal({ title, body, okText = "Ок", cancelText = "Отмена", showCancel = true }) {
  modalTitle.textContent = title || "Сообщение";
  modalBody.textContent = body || "";
  modalOk.textContent = okText;
  modalCancel.textContent = cancelText;
  modalCancel.style.display = showCancel ? "" : "none";

  document.body.classList.add("modalOpen");
  modal.classList.remove("hidden");

  return new Promise((resolve) => {
    modalResolver = resolve;
  });
}

function closeModal(result) {
  modal.classList.add("hidden");
  document.body.classList.remove("modalOpen");
  if (modalResolver) {
    modalResolver(result);
    modalResolver = null;
  }
}

modalOk.addEventListener("click", () => closeModal(true));
modalCancel.addEventListener("click", () => closeModal(false));
modalX.addEventListener("click", () => closeModal(false));
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal(false);
});

/* =========================
   Practice logic
========================= */
let progress = defaultProgress();

let taskIndex = 0;
let currentTask = TASKS[0];
let picked = [];

function renderTop() {
  el("xpTotal").textContent = String(progress.xpTotal);
  el("streak").textContent = String(progress.streak);
  el("energy").textContent = String(25); // просто визуально

  el("homeStreak").textContent = String(progress.streak);
  el("homeEnergy").textContent = String(25);

  el("todayXp").textContent = String(progress.correctToday * 10); // условно
  const acc = progress.answeredToday ? Math.round((progress.correctToday / progress.answeredToday) * 100) : 0;
  el("acc").textContent = String(acc);

  el("sXp").textContent = String(progress.xpTotal);
  el("sStreak").textContent = String(progress.streak);
  el("sAnswered").textContent = String(progress.answeredToday);
  el("sAcc").textContent = `${acc}%`;
  el("sWords").textContent = String(progress.wordsLearned);

  // progress bar
  const fill = Math.min(100, (progress.correctToday * 20));
  el("barFill").style.width = `${fill}%`;
}

function renderPath() {
  const list = el("pathList");
  list.innerHTML = "";
  LESSONS.forEach(l => {
    const div = document.createElement("div");
    div.className = "pathItem";
    div.innerHTML = `
      <div>
        <div class="pathName">${l.title}</div>
        <div class="pathSub">${l.sub} · +${l.xp} XP</div>
      </div>
      <div>›</div>
    `;
    div.addEventListener("click", async () => {
      await openModal({
        title: l.sub,
        body: `Начать урок? Получишь +${l.xp} XP за прохождение.`,
        okText: "НАЧАТЬ",
        cancelText: "Отмена"
      });
      // стартуем практику
      startPractice();
    });
    list.appendChild(div);
  });
}

function renderTask() {
  currentTask = TASKS[taskIndex % TASKS.length];
  picked = [];

  el("taskLabel").textContent = currentTask.label;
  el("taskTitle").textContent = currentTask.title;
  el("promptText").textContent = currentTask.prompt;

  const chips = el("chips");
  chips.innerHTML = "";
  currentTask.words.forEach(w => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = w;
    b.addEventListener("click", () => {
      picked.push(w);
      renderAnswer();
      b.disabled = true;
      b.style.opacity = ".45";
      el("btnCheck").disabled = picked.length === 0;
    });
    chips.appendChild(b);
  });

  renderAnswer();
  el("feedback").textContent = "";
  el("btnCheck").disabled = true;
}

function renderAnswer() {
  const area = el("answerArea");
  area.innerHTML = "";
  if (picked.length === 0) {
    area.textContent = "Собери ответ из слов снизу…";
    return;
  }

  picked.forEach((w, idx) => {
    const t = document.createElement("div");
    t.className = "answerToken";
    t.textContent = w;
    t.addEventListener("click", () => {
      // вернуть слово назад
      picked.splice(idx, 1);
      renderTaskRebuildChips();
    });
    area.appendChild(t);
  });
}

function renderTaskRebuildChips(){
  // пересобираем чипсы: какие выбраны — отключаем
  const chosen = new Set(picked);
  const chips = el("chips");
  chips.innerHTML = "";
  currentTask.words.forEach(w => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = w;

    const usedCount = picked.filter(x => x === w).length;
    if (usedCount > 0) {
      b.disabled = true;
      b.style.opacity = ".45";
    }

    b.addEventListener("click", () => {
      picked.push(w);
      renderTaskRebuildChips();
    });
    chips.appendChild(b);
  });

  const area = el("answerArea");
  area.innerHTML = "";
  if (picked.length === 0) area.textContent = "Собери ответ из слов снизу…";
  else {
    picked.forEach((w, idx) => {
      const t = document.createElement("div");
      t.className = "answerToken";
      t.textContent = w;
      t.addEventListener("click", () => {
        picked.splice(idx, 1);
        renderTaskRebuildChips();
      });
      area.appendChild(t);
    });
  }

  el("btnCheck").disabled = picked.length === 0;
}

async function checkAnswer() {
  progress.answeredToday++;

  // если нет correct — считаем правильным любой ответ (демо)
  const correctArr = currentTask.correct || currentTask.words;
  const ok = JSON.stringify(picked) === JSON.stringify(correctArr);

  if (ok) {
    progress.correctToday++;
    progress.xpTotal += 10;
    progress.wordsLearned += 1;
    el("feedback").textContent = "Потрясающе! ✅";
  } else {
    el("feedback").textContent = "Почти! Попробуй ещё раз 🙂";
  }

  // streak логика простая
  progress.lastActive = todayKey();
  if (progress.correctToday === 1) progress.streak = Math.max(progress.streak, 1);

  renderTop();
  await saveProgress(progress);

  if (ok) {
    // плавно к следующему заданию
    taskIndex++;
    setTimeout(() => {
      animateTaskSwap(() => renderTask());
    }, 350);
  }
}

function startPractice() {
  setActiveScreen("practice");
  animateTaskSwap(() => renderTask());
}

/* =========================
   App init
========================= */
async function init() {
  const TG = tg();
  if (TG) {
    TG.ready();
    TG.expand();
  }

  progress = await loadProgress();
  ensureDay(progress);

  // ✅ ВАЖНО: не перетирать нулём чужие данные.
  // Сохраняем только если реально есть что сохранить:
  await saveProgress(progress);

  renderTop();
  renderPath();

  // tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      setActiveScreen(btn.dataset.go);
    });
  });

  el("btnContinue").addEventListener("click", startPractice);

  el("btnCheck").addEventListener("click", checkAnswer);

  el("btnAudio").addEventListener("click", async () => {
    // демо
    await openModal({ title: "Аудио", body: "Тут можно подключить озвучку (TTS).", showCancel: false });
  });

  el("btnExport").addEventListener("click", async () => {
    const raw = JSON.stringify(progress, null, 2);
    await openModal({ title: "Экспорт", body: raw, showCancel: false, okText: "Закрыть" });
  });

  el("btnImport").addEventListener("click", async () => {
    const ok = await openModal({
      title: "Импорт",
      body: "Импорт сделаем через отдельное поле/textarea. Скажи — добавлю красиво.",
      showCancel: false,
      okText: "Ок"
    });
    return ok;
  });

  el("btnSync").addEventListener("click", async () => {
    await saveProgress(progress);
    await openModal({ title: "Синк", body: "Сохранил в CloudStorage + localStorage ✅", showCancel: false });
  });

  el("btnReset").addEventListener("click", async () => {
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
    await openModal({ title: "Готово", body: "Прогресс сброшен ✅", showCancel: false });
  });

  el("btnExit").addEventListener("click", () => {
    const TG = tg();
    if (TG) TG.close();
    else setActiveScreen("home");
  });

  setActiveScreen("home");
}

init();
