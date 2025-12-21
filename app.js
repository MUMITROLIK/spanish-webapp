// Spanish Trainer — простой “мини-дуо” без фреймворков.
// Если снова будет пусто — открой DevTools (F12) -> Console, там будет ошибка.
const TG = window.Telegram?.WebApp;
const CLOUD_KEY = "spanishTrainer_progress_v1";

function cloudAvailable() {
  return !!(TG && TG.CloudStorage && TG.CloudStorage.getItem && TG.CloudStorage.setItem);
}

function cloudGet(key) {
  return new Promise((resolve) => {
    TG.CloudStorage.getItem(key, (err, value) => {
      resolve({ err, value });
    });
  });
}

function cloudSet(key, value) {
  return new Promise((resolve) => {
    TG.CloudStorage.setItem(key, value, (err, ok) => {
      resolve({ err, ok });
    });
  });
}


(function () {
  const $ = (id) => document.getElementById(id);

  // ====== Data ======
  const COURSE = {
    title: "Spanish Trainer",
    units: [
      {
        id: "u1",
        title: "A1 • База",
        level: "A1",
        lessons: [
          { id: "a1_hello", title: "Базовые слова", xp: 10, q: "Как будет “Привет”?", options: ["Hola", "Gracias", "Adiós"], answer: "Hola" },
          { id: "a1_bye", title: "Прощание", xp: 12, q: "Как будет “Пока”?", options: ["Por favor", "Adiós", "Sí"], answer: "Adiós" },
          { id: "a1_polite", title: "Вежливые фразы", xp: 14, q: "Как будет “Спасибо”?", options: ["Gracias", "Hola", "No"], answer: "Gracias" },
          { id: "a1_cafe", title: "Заказ", xp: 16, q: "Как будет “Пожалуйста”?", options: ["Por favor", "Mañana", "Nunca"], answer: "Por favor" },
        ],
      },
      {
        id: "u2",
        title: "A2 • Дальше",
        level: "A2",
        lessons: [
          { id: "a2_plans", title: "Завтра/сегодня", xp: 18, q: "Как будет “Завтра”?", options: ["Ayer", "Mañana", "Siempre"], answer: "Mañana" },
          { id: "a2_yesno", title: "Да/нет", xp: 18, q: "Как будет “Да”?", options: ["Sí", "No", "Hola"], answer: "Sí" },
        ],
      },
    ],
  };

  // ====== State (localStorage) ======
  const STORAGE_KEY = "spanish_trainer_state_v2";

  const defaultState = () => ({
    xp: 0,
    streak: 0,
    completed: {},

    // today stats
    todayKey: todayKey(),
    todayAnswers: 0,
    todayCorrect: 0,
    wordsLearned: 0,
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const st = JSON.parse(raw);

      // reset daily counters if day changed
      if (st.todayKey !== todayKey()) {
        st.todayKey = todayKey();
        st.todayAnswers = 0;
        st.todayCorrect = 0;
      }
      // sanitize
      st.completed = st.completed || {};
      st.xp = Number(st.xp || 0);
      st.streak = Number(st.streak || 0);
      st.todayAnswers = Number(st.todayAnswers || 0);
      st.todayCorrect = Number(st.todayCorrect || 0);
      st.wordsLearned = Number(st.wordsLearned || 0);
      return st;
    } catch (e) {
      console.warn("State load error:", e);
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  let state = loadState();

  // ====== UI helpers ======
  function showToast(text) {
    const el = $("toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove("show"), 1400);
  }

  function accuracy() {
    if (!state.todayAnswers) return 0;
    return Math.round((state.todayCorrect / state.todayAnswers) * 100);
  }

  function computeNextLessonId() {
    // next = first not completed lesson across all units in order
    for (const u of COURSE.units) {
      for (const l of u.lessons) {
        if (!state.completed[l.id]) return l.id;
      }
    }
    return null; // all done
  }

  function isLevelUnlocked(level) {
    if (level === "A1") return true;
    // unlock A2 only if ALL A1 lessons completed
    const a1 = COURSE.units.find((u) => u.level === "A1");
    if (!a1) return true;
    return a1.lessons.every((l) => Boolean(state.completed[l.id]));
  }

  // ====== Render ======
  let currentTab = "home";

  function render() {
    const root = $("app");
    if (!root) return;

    root.innerHTML = `
      <div class="card header">
        <div class="heroCard">
          <div class="avatar"></div>
          <div>
            <div class="hTitle">${COURSE.title}</div>
            <div class="hSub">мини-дуо режим 😏 • без лимитов</div>
          </div>
          <div class="stats">
            <div class="pill"><span>⚡</span> ${state.xp}</div>
            <div class="pill"><span>🔥</span> ${state.streak}</div>
          </div>
        </div>

        <div class="tabs">
          ${tabBtn("home", "🏠", "Главная")}
          ${tabBtn("path", "🧭", "Путь")}
          ${tabBtn("practice", "🎯", "Практика")}
          ${tabBtn("league", "🏆", "Лига")}
          ${tabBtn("dict", "📚", "Словарь")}
        </div>
      </div>

      <div class="sectionGap"></div>

      <div id="screen"></div>
    `;

    // bind tabs
    root.querySelectorAll("[data-tab]").forEach((b) => {
      b.onclick = () => {
        currentTab = b.dataset.tab;
        render();
      };
    });

    const screen = root.querySelector("#screen");
    if (!screen) return;

    if (currentTab === "home") screen.innerHTML = renderHome();
    if (currentTab === "path") screen.innerHTML = renderPath();
    if (currentTab === "practice") screen.innerHTML = renderPractice();
    if (currentTab === "league") screen.innerHTML = renderLeague();
    if (currentTab === "dict") screen.innerHTML = renderDict();

    // bind screen actions
    bindScreenActions();
  }

  function tabBtn(key, icon, text) {
    const active = key === currentTab ? "active" : "";
    return `<div class="tab ${active}" data-tab="${key}">${icon} <span>${text}</span></div>`;
  }

  function renderHome() {
    const nextId = computeNextLessonId();
    const nextLesson = findLesson(nextId);

    const goal = 50;
    const progress = Math.min(100, Math.round((state.xp % goal) / goal * 100));

    return `
      <div class="card heroBig">
        <div class="bigTitle">Учись быстро,<br/>приятно и без<br/>духоты</div>
        <div class="bigText">Кликаешь узел → проходишь урок → получаешь XP. Сердечек нет, лимитов нет 😌</div>

        <div class="btnRow">
          <button class="btn btnPrimary" id="btnContinue">Продолжить</button>
          <button class="btn" id="btnPath">Синк в бота</button>
        </div>
      </div>

      <div class="sectionGap"></div>

      <div class="card dayCard">
        <div class="dayTop">
          <div class="dayTitle">Цель дня</div>
          <div class="badge">стандарт</div>
        </div>

        <div class="bar">
          <div class="barFill" style="width:${progress}%"></div>
        </div>

        <div class="subLine">${state.xp % goal} / ${goal} XP</div>

        <div class="kpi">
          <div class="kpiBox">
            <div class="kpiN">${state.todayAnswers}</div>
            <div class="kpiL">Сегодня ответов</div>
          </div>
          <div class="kpiBox">
            <div class="kpiN">${accuracy()}%</div>
            <div class="kpiL">Точность</div>
          </div>
        </div>

        <div class="kpiBox" style="margin-top:12px;">
          <div class="kpiN">${state.wordsLearned}</div>
          <div class="kpiL">Изучено слов</div>
        </div>

        <div class="subLine" style="margin-top:12px;">
          Следующий урок: <b>${nextLesson ? nextLesson.title : "всё пройдено ✅"}</b>
        </div>
      </div>

      <div class="sectionGap"></div>

      <div class="h2row">
        <div class="h2">Путь обучения</div>
        <div class="h2sub">модули → уроки → задания</div>
      </div>
    `;
  }

  function renderPath() {
    let html = `<div class="card pathWrap">`;

    COURSE.units.forEach((unit) => {
      const doneCount = unit.lessons.filter((l) => state.completed[l.id]).length;
      const lvlUnlocked = isLevelUnlocked(unit.level);

      html += `
        <div class="unitCard">
          <div class="unitHead">
            <div>
              <div class="unitTitle">${unit.title}</div>
              <div class="unitMeta">${doneCount} / ${unit.lessons.length} пройдено</div>
            </div>
            <div class="lockPill">${lvlUnlocked ? "открыто" : "закрыто пока A1 не пройден"}</div>
          </div>

          <div class="track">
            ${renderUnitTrack(unit, lvlUnlocked)}
          </div>
        </div>
      `;
    });

    html += `</div>`;
    return html;
  }
async function loadProgressFromCloud() {
  if (!cloudAvailable()) return null;

  const { err, value } = await cloudGet(CLOUD_KEY);
  if (err || !value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function saveProgressToCloud(progressObj) {
  if (!cloudAvailable()) return false;

  const payload = JSON.stringify(progressObj);
  const { err, ok } = await cloudSet(CLOUD_KEY, payload);
  return !err && !!ok;
}


  function renderUnitTrack(unit, lvlUnlocked) {
    const nextId = computeNextLessonId();
    let out = "";

    unit.lessons.forEach((lesson, i) => {
      const done = Boolean(state.completed[lesson.id]);
      const isNext = lesson.id === nextId;

      // locked node if level locked
      const locked = !lvlUnlocked;

      // alternate left/right like path
      const side = i % 2 === 0 ? "left" : "right";

      const nodeClass =
        "node" +
        (done ? " done" : "") +
        (isNext ? " next" : "") +
        (locked ? " locked" : "");

      const icon = done ? "✅" : isNext ? "➡️" : "⚡";
      const subtitle = done
        ? "пройдено"
        : isNext
        ? "следующий"
        : locked
        ? "закрыто"
        : "доступно";

      out += `
        <div class="nodeRow ${side}">
          <div class="${nodeClass}" data-lesson="${lesson.id}">
            <div class="icon">${icon}</div>
          </div>
          <div class="nodeLabel">
            <div class="t">${lesson.title}</div>
            <div class="s">${lesson.xp} XP • ${subtitle}</div>
          </div>
        </div>
      `;

      // small spacer lines feel
      if (i !== unit.lessons.length - 1) out += `<div class="nodeRow ${side}" style="min-height:12px; opacity:.0"></div>`;
    });

    return out;
  }

  function renderPractice() {
    const nextId = computeNextLessonId();
    const nextLesson = findLesson(nextId);

    return `
      <div class="card simpleCard">
        <div class="h2">Практика</div>
        <div class="h2sub">быстро набиваем XP</div>

        <div class="list">
          <div class="item">
            <div>
              <b>Случайный урок</b><br/>
              <span>рандом из доступных</span>
            </div>
            <button class="btn" id="btnRandom">Старт</button>
          </div>

          <div class="item">
            <div>
              <b>Следующий урок</b><br/>
              <span>${nextLesson ? nextLesson.title : "всё пройдено ✅"}</span>
            </div>
            <button class="btn btnPrimary" id="btnNext">Поехали</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderLeague() {
    return `
      <div class="card simpleCard">
        <div class="h2">Лига</div>
        <div class="h2sub">пока простая заглушка</div>

        <div class="list">
          <div class="item"><b>Твой XP</b><span>${state.xp}</span></div>
          <div class="item"><b>Серия</b><span>${state.streak} 🔥</span></div>
          <div class="item"><b>Точность сегодня</b><span>${accuracy()}%</span></div>
        </div>

        <div class="subLine" style="margin-top:12px;">
          Хочешь как в дуо — дальше добавим недельный график и ранги.
        </div>
      </div>
    `;
  }

  function renderDict() {
    // простейший словарь на основе пройденных уроков
    const learned = [];
    COURSE.units.forEach((u) => {
      u.lessons.forEach((l) => {
        if (state.completed[l.id]) {
          // вытаскиваем слово-ответ
          learned.push({ word: l.answer, from: l.title });
        }
      });
    });

    const list = learned.length
      ? learned
          .slice(-20)
          .reverse()
          .map((x) => `<div class="item"><b>${x.word}</b><span>${x.from}</span></div>`)
          .join("")
      : `<div class="item"><b>Пока пусто</b><span>пройди 1 урок</span></div>`;

    return `
      <div class="card simpleCard">
        <div class="h2">Словарь</div>
        <div class="h2sub">то, что ты уже закрепил</div>

        <div class="list">
          ${list}
        </div>

        <div class="btnRow" style="margin-top:12px;">
          <button class="btn" id="btnReset">Сбросить прогресс</button>
        </div>
      </div>
    `;
  }

  function bindScreenActions() {
    // Home buttons
    const btnContinue = $("btnContinue");
    if (btnContinue) btnContinue.onclick = () => {
      const nextId = computeNextLessonId();
      if (!nextId) return showToast("Всё пройдено ✅");
      openLesson(nextId);
    };

    const btnPath = $("btnPath");
    if (btnPath) btnPath.onclick = () => {
      currentTab = "path";
      render();
      setTimeout(() => showToast("Открыл путь 👇"), 200);
    };

    // Practice buttons
    const btnRandom = $("btnRandom");
    if (btnRandom) btnRandom.onclick = () => {
      const pool = getAvailableLessons();
      if (!pool.length) return showToast("Нет доступных уроков 😅");
      const pick = pool[Math.floor(Math.random() * pool.length)];
      openLesson(pick.id);
    };

    const btnNext = $("btnNext");
    if (btnNext) btnNext.onclick = () => {
      const nextId = computeNextLessonId();
      if (!nextId) return showToast("Всё пройдено ✅");
      openLesson(nextId);
    };

    // Dict reset
    const btnReset = $("btnReset");
    if (btnReset) btnReset.onclick = () => {
      if (!confirm("Точно сбросить прогресс?")) return;
      state = defaultState();
      saveState();
      render();
      showToast("Сбросил ✅");
    };

    // Path nodes
    document.querySelectorAll("[data-lesson]").forEach((el) => {
      el.onclick = () => {
        const id = el.getAttribute("data-lesson");
        if (!id) return;

        // check locked by level
        const unit = findUnitByLessonId(id);
        if (unit && !isLevelUnlocked(unit.level)) {
          return showToast("Сначала пройди A1 😉");
        }

        // rule: allow open if done OR is next OR earlier lessons done in same unlocked level
        const nextId = computeNextLessonId();
        const done = Boolean(state.completed[id]);
        if (!done && id !== nextId) {
          showToast("Сначала пройди следующий доступный узел 🙂");
          return;
        }

        openLesson(id);
      };
    });
  }

  function getAvailableLessons() {
    const nextId = computeNextLessonId();
    const out = [];
    COURSE.units.forEach((u) => {
      const lvlUnlocked = isLevelUnlocked(u.level);
      if (!lvlUnlocked) return;
      u.lessons.forEach((l) => {
        const done = Boolean(state.completed[l.id]);
        if (done || l.id === nextId) out.push(l);
      });
    });
    return out;
  }

  function findLesson(id) {
    if (!id) return null;
    for (const u of COURSE.units) {
      for (const l of u.lessons) if (l.id === id) return l;
    }
    return null;
  }

  function findUnitByLessonId(lessonId) {
    for (const u of COURSE.units) {
      if (u.lessons.some((l) => l.id === lessonId)) return u;
    }
    return null;
  }

  // ====== Lesson modal logic ======
  let activeLesson = null;
  let selected = null;
  let checked = false;

  function openLesson(lessonId) {
    const lesson = findLesson(lessonId);
    if (!lesson) return showToast("Урок не найден 😅");

    activeLesson = lesson;
    selected = null;
    checked = false;

    $("modalTitle").textContent = `${lesson.title} • ${lesson.xp} XP`;
    $("prompt").textContent = lesson.q;

    const options = $("options");
    options.innerHTML = "";

    lesson.options.forEach((opt) => {
      const b = document.createElement("button");
      b.className = "opt";
      b.textContent = opt;
      b.onclick = () => {
        if (checked) return;
        selected = opt;
        // paint active
        options.querySelectorAll(".opt").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        $("modalHint").textContent = "";
      };
      options.appendChild(b);
    });

    $("modalHint").textContent = "Выбери вариант и нажми “Проверить”.";
    $("btnCheck").textContent = "Проверить";

    openModal();
  }

  function openModal() {
    $("modal").classList.remove("hidden");
  }

  function closeModal() {
    $("modal").classList.add("hidden");
  }

  $("btnClose").onclick = closeModal;

  $("btnCheck").onclick = () => {
    if (!activeLesson) return;
    const options = $("options");

    if (!checked) {
      if (!selected) return showToast("Выбери вариант 🙂");

      checked = true;

      // mark ok/bad
      options.querySelectorAll(".opt").forEach((b) => {
        const t = b.textContent;
        b.classList.remove("active");
        if (t === activeLesson.answer) b.classList.add("ok");
        if (t === selected && t !== activeLesson.answer) b.classList.add("bad");
      });

      state.todayAnswers += 1;

      if (selected === activeLesson.answer) {
        state.todayCorrect += 1;
        $("modalHint").textContent = "✅ Верно! Забирай XP.";
        $("btnCheck").textContent = "Забрать XP";
      } else {
        $("modalHint").textContent = `❌ Неверно. Правильно: ${activeLesson.answer}`;
        $("btnCheck").textContent = "Понял";
      }

      saveState();
      return;
    }

    // after checked -> close & reward if correct and not already completed
    const wasDone = Boolean(state.completed[activeLesson.id]);
    const correct = selected === activeLesson.answer;

    if (correct && !wasDone) {
      state.completed[activeLesson.id] = true;
      state.xp += activeLesson.xp;
      state.wordsLearned += 1;
      state.streak = Math.max(1, state.streak + 1);
      showToast(`+${activeLesson.xp} XP 💚`);
    } else {
      showToast(wasDone ? "Уже пройдено ✅" : "Ок 🙂");
    }

    saveState();
    closeModal();
    render();
  };

  // close modal by clicking outside card
  $("modal").addEventListener("click", (e) => {
    if (e.target && e.target.id === "modal") closeModal();
  });

  // ====== Start ======
  try {
    render();
  } catch (e) {
    console.error(e);
    const root = $("app");
    if (root) root.innerHTML = `<div class="card simpleCard"><b>Ошибка в app.js</b><div class="subLine">${String(e)}</div></div>`;
  }
})();
