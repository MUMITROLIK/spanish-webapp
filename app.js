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


function dayKeyOffset(deltaDays) {
  const d = new Date();
  d.setDate(d.getDate() + (deltaDays || 0));
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
// RESULT SHEET refs
const resultSheet = el("resultSheet");
const resultTitle = el("resultTitle");
const resultSub = el("resultSub");
const btnNext = el("btnNext");
const confettiBox = el("confetti");

let lastAnswerWasCorrect = false;


let modalResolver = null;
function clearConfetti(){
  confettiBox.innerHTML = "";
}

function fireConfetti(){
  clearConfetti();
  const pieces = 18; // можно 30 если хочешь плотнее

  for (let i = 0; i < pieces; i++) {
    const p = document.createElement("div");
    p.className = "confettiPiece";
    p.style.left = Math.random() * 100 + "%";
    p.style.transform = `translateY(0) rotate(${Math.random()*180}deg)`;
    p.style.background = `hsl(${Math.floor(Math.random()*360)}, 90%, 60%)`;
    p.style.animationDelay = (Math.random() * 0.10) + "s";
    confettiBox.appendChild(p);
  }

  setTimeout(clearConfetti, 1100);
}

function showResultSheet({ ok, title, sub }) {
  // темы
  resultSheet.classList.toggle("good", ok);
  resultSheet.classList.toggle("bad", !ok);

  resultTitle.textContent = title;
  resultSub.textContent = sub;

  resultSheet.classList.remove("hidden");

  if (ok) fireConfetti();
}

function hideResultSheet() {
  resultSheet.classList.add("hidden");
}


function openModal({ title, body, okText = "Ок", cancelText = "Отмена", showCancel = true }) {
  modalTitle.textContent = title || "Сообщение";

  // body может быть строкой или DOM-элементом
  modalBody.innerHTML = "";
  if (body instanceof HTMLElement) {
    modalBody.appendChild(body);
  } else {
    modalBody.textContent = body || "";
  }
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

// =========================
// TTS (speechSynthesis)
// =========================
let ttsVoicesReady = false;
let lastAutoSpokenIndex = -1;

function ensureVoicesLoaded() {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve(false);

    const synth = window.speechSynthesis;
    const done = () => {
      ttsVoicesReady = true;
      resolve(true);
    };

    const voices = synth.getVoices();
    if (voices && voices.length) return done();

    const handler = () => {
      synth.removeEventListener("voiceschanged", handler);
      done();
    };
    synth.addEventListener("voiceschanged", handler);

    setTimeout(() => {
      synth.removeEventListener("voiceschanged", handler);
      done();
    }, 600);
  });
}

function pickVoice(lang = "es-ES") {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  const langLC = String(lang).toLowerCase();

  let v = voices.find(x => String(x.lang).toLowerCase() === langLC);
  if (v) return v;

  const prefix = langLC.split("-")[0];
  v = voices.find(x => String(x.lang).toLowerCase().startsWith(prefix));
  return v || null;
}

function speak(text, lang = "es-ES") {
  if (!text) return;
  if (!("speechSynthesis" in window)) {
    openModal({ title: "Аудио", body: "На этом устройстве нет поддержки озвучки (speechSynthesis).", showCancel: false });
    return;
  }

  const synth = window.speechSynthesis;
  try { synth.cancel(); } catch {}

  const u = new SpeechSynthesisUtterance(String(text));
  u.lang = lang;

  const voice = pickVoice(lang);
  if (voice) u.voice = voice;

  u.rate = 1.0;
  u.pitch = 1.0;

  synth.speak(u);
}

function speakPrompt(auto = false) {
  const lang = currentTask.ttsLang || "es-ES";
  if (auto) {
    if (taskIndex === lastAutoSpokenIndex) return;
    lastAutoSpokenIndex = taskIndex;
  }
  speak(currentTask.prompt, lang);
}

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
      const ok = await openModal({
        title: l.sub,
        body: `Начать урок? Получишь +${l.xp} XP за прохождение.`,
        okText: "НАЧАТЬ",
        cancelText: "Отмена"
      });
      if (ok) startPractice();
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

  // Авто-озвучка для заданий "АУДИО" (если браузер разрешит)
  if (currentTask.label === "АУДИО") {
    ensureVoicesLoaded().then(() => speakPrompt(true));
  }

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
  ensureDay(progress);

  progress.answeredToday++;

  // если нет correct — считаем правильным любой ответ (демо)
  const correctArr = currentTask.correct || currentTask.words;
  const ok = JSON.stringify(picked) === JSON.stringify(correctArr);

  lastAnswerWasCorrect = ok;

  // блокируем повторную проверку, пока не нажмут "ДАЛЕЕ"
  el("btnCheck").disabled = true;

  if (ok) {
    // начисления
    progress.correctToday++;
    progress.xpTotal += 10;

    // streak: обновляем только на первом правильном за день
    if (progress.correctToday === 1) {
      const today = todayKey();
      const yesterday = dayKeyOffset(-1);

      if (!progress.streak || progress.streak < 1) {
        progress.streak = 1;
      } else if (progress.lastActive === yesterday) {
        progress.streak += 1;
      } else if (progress.lastActive === today) {
        progress.streak = Math.max(progress.streak, 1);
      } else {
        progress.streak = 1;
      }

      progress.lastActive = today;
    } else {
      progress.lastActive = todayKey();
    }

    showResultSheet({
      ok: true,
      title: "Потрясающе! ✅",
      sub: "+10 XP"
    });
  } else {
    showResultSheet({
      ok: false,
      title: "Непочтёёёт 😅",
      sub: "Попробуй ещё раз"
    });
  }

  renderTop();
  await saveProgress(progress);

  // ⚠️ ВАЖНО: НЕ перелистываем задание автоматически.
  // Переход к следующему — только по кнопке «ДАЛЕЕ».
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
    await ensureVoicesLoaded();
    speakPrompt(false);
  });

  el("btnExport").addEventListener("click", async () => {
    const raw = JSON.stringify(progress, null, 2);
    await openModal({ title: "Экспорт", body: raw, showCancel: false, okText: "Закрыть" });
  });

  el("btnImport").addEventListener("click", async () => {
    const wrap = document.createElement("div");
    wrap.className = "importWrap";

    const hint = document.createElement("div");
    hint.className = "importHint";
    hint.textContent = "Вставь JSON прогресса (из «Экспорт»), затем нажми «Импортировать».";

    const ta = document.createElement("textarea");
    ta.className = "importArea";
    ta.placeholder = '{"xpTotal": 120, "...": "..."}';
    ta.spellcheck = false;

    wrap.appendChild(hint);
    wrap.appendChild(ta);

    const ok = await openModal({
      title: "Импорт",
      body: wrap,
      okText: "Импортировать",
      cancelText: "Отмена",
      showCancel: true
    });

    if (!ok) return;

    const raw = (ta.value || "").trim();
    if (!raw) {
      await openModal({ title: "Импорт", body: "Пусто 😅 Вставь JSON и попробуй ещё раз.", showCancel: false });
      return;
    }

    try {
      const data = JSON.parse(raw);

      const merged = { ...defaultProgress(), ...data };
      merged.xpTotal = Number(merged.xpTotal) || 0;
      merged.streak = Number(merged.streak) || 0;
      merged.answeredToday = Number(merged.answeredToday) || 0;
      merged.correctToday = Number(merged.correctToday) || 0;
      merged.wordsLearned = Number(merged.wordsLearned) || 0;
      merged.dayKey = merged.dayKey || todayKey();
      merged.lastActive = merged.lastActive || merged.dayKey;

      progress = merged;
      ensureDay(progress);

      await saveProgress(progress);
      renderTop();

      await openModal({ title: "Импорт", body: "Готово ✅ Прогресс загружен.", showCancel: false });
    } catch (e) {
      await openModal({
        title: "Ошибка импорта",
        body: "Не получилось прочитать JSON. Проверь, что ты вставил именно JSON без лишних символов.",
        showCancel: false
      });
    }
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
  // Кнопка "ДАЛЕЕ" на экране результата
const btnNext = el("btnNext");
if (btnNext) {
  btnNext.addEventListener("click", () => {
    hideResultSheet();

    if (lastAnswerWasCorrect) {
      taskIndex++;
      animateTaskSwap(() => renderTask()); // или renderTask(), если без анимации
    } else {
      // если ошибка — остаёмся на том же задании
      el("btnCheck").disabled = picked.length === 0;
      el("feedback").textContent = "";
    }
  });
}


  setActiveScreen("home");
}

init();
