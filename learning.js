import { LEVELS, questionsFor, grade } from "./redox-data.js";
import { learningApi } from "./learning-api.js";
const esc = (s = "") =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function createLearning({ store, state, navigate, render, shell }) {
  const api = learningApi(store);
  let game = null,
    rows = null,
    rowsUser = null,
    loadError = "",
    loading = false,
    epoch = 0;
  const path = () =>
    location.pathname.replace(/\/himya-platforma/, "").replace(/\/$/, "") ||
    "/";
  const steps = (active) =>
    `<nav class="learn-steps" aria-label="Оқу қадамдары">${[
      ["/learn/redox", "01", "Түсіну"],
      ["/games/redox", "02", "Тәжірибе"],
      ["/results", "03", "Нәтиже"],
      ["/kabinet", "04", "Кабинет"],
    ]
      .map(
        ([url, n, title]) =>
          `<a href="${url}" ${active === url ? 'aria-current="step"' : ""}><span>${n}</span>${title}</a>`,
      )
      .join("")}</nav>`;
  const login = () =>
    `<section class="learn-panel"><h1>Нәтижеңіз өзіңізбен бірге</h1><p>Жеке деректерді көру және сақтау үшін аккаунтыңызға кіріңіз.</p><a class="primary-button" href="/login">Жүйеге кіру</a></section>`;
  const intro = () =>
    `${steps("/learn/redox")}<section class="learn-hero"><div><span class="learn-kicker">Виртуалды зертхана · 8 минут</span><h1>Бір элемент.<br>Үш түрлі өзгеріс.</h1><p>Перманганаттың түсі неге өзгереді? Ортаны салыстырып, электрондардың қозғалысын түсініңіз.</p><a class="primary-button" href="/games/redox">Білімімді тексеру →</a></div>${tubes()}</section><section class="learn-grid">${[
      [
        "Қышқыл орта",
        "Mn²⁺ · +2",
        "5 электрон қабылдайды. Күлгін түс жойылады; Mn²⁺ түсі өте әлсіз қызғылт.",
      ],
      [
        "Бейтарап орта",
        "MnO₂ · +4",
        "3 электрон қабылдайды. Қоңыр тұнба түзіледі.",
      ],
      [
        "Күшті сілтілі орта",
        "MnO₄²⁻ · +6",
        "1 электрон қабылдайды. Жасыл манганат түзіледі.",
      ],
    ]
      .map(
        ([a, b, c], i) =>
          `<article class="learn-panel"><span class="learn-kicker">0${i + 1} / ${a}</span><h2>${b}</h2><p>${c}</p></article>`,
      )
      .join(
        "",
      )}</section><section class="learn-panel"><h2>Электрондық баланс қалай құрылады?</h2><ol><li>Тотығу дәрежесінің өзгерісін табыңыз: Fe²⁺ → Fe³⁺ бір электрон береді.</li><li>Қышқыл ортада Mn⁷⁺ → Mn²⁺ бес электрон қабылдайды.</li><li>Электрон санын теңестіріңіз: 5Fe²⁺ үшін 1MnO₄⁻ қажет.</li><li>Атомдар мен толық зарядтың екі жақта бірдей екенін тексеріңіз.</li></ol><p class="equation">5Fe²⁺ + MnO₄⁻ + 8H⁺ → 5Fe³⁺ + Mn²⁺ + 4H₂O</p><p>Бұл — оқу моделі. Нақты өнім концентрацияға, pH пен реагентке тәуелді. Бейтарап және сілтілі ортада темір гидроксидтері, ал иод үшін қосымша реакциялар болуы мүмкін. Сондықтан ойынның сол орталардағы толық теңдеулері сульфитпен берілген.</p><p><strong>Виртуалды тәжірибе:</strong> бұл бет үйде химиялық тәжірибе жасауға арналған нұсқаулық емес.</p><a class="primary-button" href="/games/redox">Ойынға өту →</a></section>`;
  function tubes(tone) {
    return `<div class="lab-visual" aria-label="Перманганат өнімдерінің түстері"><span class="lab-label">Mn / 25</span><div class="tube-row">${[
      ["acid", "Mn²⁺", "Қышқыл"],
      ["neutral", "MnO₂", "Бейтарап"],
      ["alkaline", "MnO₄²⁻", "Күшті сілті"],
    ]
      .map(
        ([t, f, l]) =>
          `<div class="tube-cell"><div class="lab-tube ${tone && tone !== "pending" && tone !== t ? "dim" : ""}"><div class="liquid ${tone === "pending" ? "pending" : t}"></div></div><strong>${tone === "pending" ? "MnO₄⁻" : f}</strong><small>${l}</small></div>`,
      )
      .join("")}</div><span class="lab-label">+7 → +2 / +4 / +6</span></div>`;
  }
  function gameView() {
    if (!game)
      return `${steps("/games/redox")}<section class="learn-hero"><div><span class="learn-kicker">REDOX LAB / Білімді тәжірибеге айналдыр</span><h1>Түсті болжа.<br>Реакцияны түсін.</h1><p>3 тапсырма. Әр дұрыс жауапқа 100 ұпай. Уақыт шектеуі жоқ. Жауаптан кейін түсіндірмені оқып, келесі қадамға өтіңіз.</p><p>Алғаш рет пе? <a href="/learn/redox">Қысқа сабақты оқыңыз →</a></p></div>${tubes()}</section><section class="learn-grid">${Object.entries(
        LEVELS,
      )
        .map(
          ([v, l], i) =>
            `<article class="learn-panel"><span class="learn-kicker">0${i + 1} / 3 тапсырма</span><h2>${l}</h2><p>${["Түс пен реакция өнімін ажырату.", "Электрон мен мольдік қатынасты түсіну.", "Иондық теңдеулерді теңестіру."][i]}</p><button class="primary-button" data-level="${v}">${l} деңгейді бастау →</button></article>`,
        )
        .join(
          "",
        )}</section><p>${state.user ? "Аяқталған нәтижені аккаунтыңызға сақтай аласыз." : "Қонақ ретінде ойнауға болады. Бұл режимде нәтиже серверге сақталмайды."}</p>`;
    const qs = questionsFor(game.level),
      q = qs[game.index];
    if (game.answers.length === qs.length && game.finished) {
      const r = grade(game.level, game.answers);
      return `${steps("/results")}<section class="learn-panel game-result"><span class="learn-kicker">Тәжірибе аяқталды · ${LEVELS[game.level]}</span><h1>${r.score}<small> / ${r.max_score} ұпай</small></h1><h2>${r.correct === r.total ? "Электрондар тепе-теңдікте!" : "Тағы бір қадам алға"}</h2><p>${r.correct} дұрыс жауап · ${r.total - r.correct} қайта қарауға арналған тапсырма</p><div class="learn-actions">${state.user ? `<button class="primary-button" data-save-game ${game.saved || game.saving ? "disabled" : ""}>${game.saved ? "Нәтиже сақталды ✓" : game.saving ? "Сақталуда…" : "Нәтижені сақтау"}</button>` : '<a class="primary-button" href="/login?next=/games/redox">Нәтижені сақтау үшін кіру</a>'}<button data-replay>Қайта ойнау</button><a href="/results">Менің нәтижелерім →</a></div><p role="status">${esc(game.message || (!state.user ? "Қонақ нәтижесі тек осы ашық бетте сақталады." : ""))}</p></section><section class="learn-grid">${qs.map((x, i) => `<article class="learn-panel"><span>${game.answers[i] === x.answer ? "✓ Дұрыс" : "↻ Қайталау"}</span><h3>${x.prompt}</h3><p><strong>${x.options[x.answer]}</strong></p><p>${x.explanation}</p></article>`).join("")}</section>`;
    }
    const answered = game.answers.length > game.index,
      correct = answered && game.answers[game.index] === q.answer;
    return `${steps("/games/redox")}<section class="game-head"><span>${LEVELS[game.level]} деңгей</span><span>${game.index + 1} / ${qs.length}</span></section><progress aria-label="Ойын прогресі" max="${qs.length}" value="${game.answers.length}"></progress><section class="game-layout"><div class="learn-panel"><span class="learn-kicker">Болжам жасаңыз</span><h1 class="question-title" tabindex="-1">${q.prompt}</h1><div class="answer-options">${q.options.map((o, i) => `<button data-answer="${i}" ${answered ? "disabled" : ""} class="${answered && i === q.answer ? "is-correct" : answered && i === game.answers[game.index] ? "is-wrong" : ""}"><span>${String.fromCharCode(65 + i)}</span>${o}${answered && i === q.answer ? " ✓" : ""}</button>`).join("")}</div>${answered ? `<div class="answer-feedback" role="status"><strong>${correct ? "Дұрыс! +100 ұпай" : "Бұл жолы қате. Себебін түсінейік."}</strong><p>${q.explanation}</p><p class="equation">${q.equation}</p></div><button class="primary-button" data-next>${game.index === qs.length - 1 ? "Нәтижені көру" : "Келесі тапсырма"} →</button>` : "<p>Бір жауапты таңдаңыз. Пернетақтада Tab және Enter қолдануға болады.</p>"}</div>${tubes(answered ? q.tone : "pending")}</section>`;
  }
  function formPage(mode) {
    const reset = mode === "reset-password",
      profile = mode === "profile";
    if ((reset || profile) && !state.user) return login();
    const title = profile
      ? "Профильді өңдеу"
      : reset
        ? "Жаңа құпиясөз"
        : "Құпиясөзді қалпына келтіру";
    return `<section class="auth-layout"><section class="auth-card"><a href="${profile ? "/kabinet" : "/login"}">← Артқа</a><h1>${title}</h1><p>${profile ? "Оқу нәтижелерінде көрсетілетін атыңыз." : reset ? "Кемінде 8 таңба қолданыңыз." : "Email мекенжайыңызды енгізіңіз. Қалпына келтіру сілтемесін жібереміз."}</p><form data-learning-form="${mode}"><label>${profile ? "Аты-жөні" : reset ? "Жаңа құпиясөз" : "Email"}<input name="value" type="${profile ? "text" : reset ? "password" : "email"}" autocomplete="${profile ? "name" : reset ? "new-password" : "email"}" ${profile ? 'maxlength="100"' : reset ? 'minlength="8"' : ""} value="${profile ? esc(state.user.display_name) : ""}" required></label>${reset ? '<label>Құпиясөзді қайталаңыз<input name="confirm" type="password" autocomplete="new-password" minlength="8" required></label>' : ""}<p role="status" class="form-status"></p><button class="primary-button" type="submit">${profile ? "Сақтау" : reset ? "Құпиясөзді жаңарту" : "Сілтеме жіберу"}</button></form></section></section>`;
  }
  function resultView() {
    if (!state.user) return login();
    ensureResults();
    return `${steps("/results")}<section class="catalog-head"><div><span class="learn-kicker">Жеке оқу журналы</span><h1>Менің нәтижелерім</h1><p>Әр тәжірибе — жаңа түсінікке бір қадам.</p></div><a class="primary-button" href="/games/redox">Ойынды бастау →</a></section>${
      loading
        ? '<p role="status">Нәтижелер жүктелуде…</p>'
        : loadError
          ? `<section class="learn-panel"><p role="alert">${esc(loadError)}</p><button data-retry-results>Қайта жүктеу</button></section>`
          : !rows?.length
            ? '<section class="learn-panel"><h2>Алғашқы тәжірибе алда</h2><p>Ойынды аяқтап, «Нәтижені сақтау» батырмасын басыңыз.</p><a href="/learn/redox">Сабақтан бастау →</a></section>'
            : `<section class="learn-panel"><h2>Жетістіктер</h2><p>✓ Алғашқы тәжірибе ${rows.some((r) => r.score === r.max_score) ? " · ★ Мінсіз нәтиже" : ""} ${new Set(rows.map((r) => r.level)).size === 3 ? " · ◆ Үш деңгейді бағындырды" : ""}</p></section><div class="learn-grid">${rows
                .map(
                  (r) =>
                    `<article class="learn-panel"><span>${esc(LEVELS[r.level] || r.level)}</span><h2>${Number(r.score)} / ${Number(r.max_score)}</h2><p>${esc(new Date(r.created_at).toLocaleString("kk-KZ"))}</p><details><summary>Жауаптарды ашу</summary>${questionsFor(
                      r.level,
                    )
                      .map(
                        (q, i) =>
                          `<p><strong>${q.prompt}</strong><br>Сіздің жауабыңыз: ${esc(q.options[r.answers[i]])}<br>Дұрыс жауап: ${q.options[q.answer]}<br>${q.explanation}</p>`,
                      )
                      .join("")}</details></article>`,
                )
                .join("")}</div>`
    }`;
  }
  function ensureResults() {
    if (rowsUser === state.user.id && (rows || loading || loadError)) return;
    const id = state.user.id,
      version = ++epoch;
    rowsUser = id;
    rows = null;
    loading = true;
    loadError = "";
    api
      .results()
      .then((r) => {
        if (version === epoch && state.user?.id === id) rows = r;
      })
      .catch((e) => {
        if (version === epoch && state.user?.id === id)
          loadError = "Нәтижелерді жүктеу мүмкін болмады. " + e.message;
      })
      .finally(() => {
        if (version === epoch && state.user?.id === id) {
          loading = false;
          render();
        }
      });
  }
  function bind(root) {
    if (rowsUser && rowsUser !== state.user?.id) {
      epoch++;
      rowsUser = null;
      rows = null;
      loadError = "";
      loading = false;
    }
    root.querySelectorAll("[data-level]").forEach(
      (b) =>
        (b.onclick = () => {
          game = {
            id: crypto.randomUUID(),
            level: b.dataset.level,
            index: 0,
            answers: [],
            owner: state.user?.id || null,
          };
          render();
          root.querySelector("h1")?.focus();
        }),
    );
    root.querySelectorAll("[data-answer]").forEach(
      (b) =>
        (b.onclick = () => {
          if (game.answers.length > game.index) return;
          game.answers.push(Number(b.dataset.answer));
          render();
          root.querySelector("[data-next]")?.focus();
        }),
    );
    root.querySelector("[data-next]")?.addEventListener("click", () => {
      if (game.index === 2) game.finished = true;
      else game.index++;
      render();
      root.querySelector("h1")?.focus();
    });
    root.querySelector("[data-replay]")?.addEventListener("click", () => {
      game = null;
      render();
    });
    root
      .querySelector("[data-save-game]")
      ?.addEventListener("click", async () => {
        if (game.saving || game.saved) return;
        const attempt = game,
          user = state.user?.id;
        if (attempt.owner && attempt.owner !== user) {
          attempt.message =
            "Бұл ойын басқа аккаунтта басталған. Жаңа ойын бастаңыз.";
          render();
          return;
        }
        attempt.owner = user;
        attempt.saving = true;
        render();
        try {
          await api.save(attempt.id, attempt.level, attempt.answers);
          if (state.user?.id === user) {
            attempt.saved = true;
            attempt.message = "Нәтиже аккаунтыңызға сақталды.";
            rows = null;
            loadError = "";
          }
        } catch (e) {
          attempt.message =
            "Сақталмады: " + e.message + " Қайта әрекет жасаңыз.";
        } finally {
          attempt.saving = false;
          if (state.user?.id === user) render();
        }
      });
    root
      .querySelector("[data-retry-results]")
      ?.addEventListener("click", () => {
        loadError = "";
        rows = null;
        render();
      });
    root
      .querySelector("[data-learning-form]")
      ?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = e.currentTarget,
          b = f.querySelector("button[type=submit]"),
          msg = f.querySelector(".form-status");
        if (b.disabled) return;
        const d = new FormData(f),
          value = String(d.get("value")),
          mode = f.dataset.learningForm;
        msg.textContent = "";
        if (mode === "reset-password" && value !== d.get("confirm")) {
          msg.textContent = "Құпиясөздер сәйкес келмейді";
          return;
        }
        b.disabled = true;
        try {
          if (mode === "profile") {
            const user = state.user.id;
            const updated = await api.profile(value);
            if (state.user?.id === user)
              state.user = {
                ...state.user,
                display_name: updated.display_name,
              };
            msg.textContent = "Профиль сақталды.";
          } else if (mode === "reset-password") {
            await api.password(value);
            f.reset();
            msg.textContent = "Құпиясөз жаңартылды. Жеке кабинетке өте аласыз.";
          } else {
            await api.recover(value.trim());
            msg.textContent =
              "Осы email үшін аккаунт бар болса, қалпына келтіру сілтемесі жіберіледі.";
          }
        } catch (error) {
          msg.textContent = error.message;
        } finally {
          b.disabled = false;
        }
      });
    root
      .querySelector("[data-resend]")
      ?.addEventListener("click", async (e) => {
        const email = root.querySelector("[name=email]");
        if (!email?.value.includes("@")) {
          root.querySelector("#auth-error").textContent =
            "Растау үшін email мекенжайыңызды енгізіңіз";
          return;
        }
        const b = e.currentTarget;
        b.disabled = true;
        try {
          await api.resend(email.value.trim());
          root.querySelector("#auth-error").textContent =
            "Растау хаты сұралды. Поштаңызды тексеріңіз.";
        } catch (err) {
          root.querySelector("#auth-error").textContent = err.message;
        } finally {
          b.disabled = false;
        }
      });
  }
  return {
    callback: api.callback,
    bind,
    route(p) {
      if (game?.owner && game.owner !== state.user?.id) game = null;
      if (p === "/learn/redox") return shell(intro());
      if (p === "/games/redox") return shell(gameView());
      if (p === "/results") return shell(resultView());
      if (["/forgot-password", "/reset-password", "/profile"].includes(p))
        return shell(formPage(p.slice(1)));
      return null;
    },
    home: () =>
      `<section class="learn-home"><div><span class="learn-kicker">Химияны түсін. Тәжірибеде қолдан.</span><h1>Кішкентай тәжірибе.<br>Үлкен жаңалық.</h1><p>Теорияны оқыңыз, реакцияны болжаңыз, нәтижеден үйреніңіз.</p><div class="learn-actions"><a class="primary-button" href="/learn/redox">Оқуды бастау →</a><a href="/materials">Материалдар кітапханасы ↗</a></div></div>${tubes()}</section>${steps("")}`,
    profile: () =>
      `<section class="learn-panel"><h2>Оқу жолым</h2><div class="learn-actions"><a class="primary-button" href="/results">Ойын нәтижелері мен жетістіктер</a><a href="/profile">Профильді өңдеу →</a><a href="/learn/redox">Оқуды жалғастыру →</a></div></section>`,
  };
}
