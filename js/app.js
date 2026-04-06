
(() => {
  const STORAGE_KEYS = {
    users: "physics_users",
    currentUser: "physics_current_user",
    progress: "physics_progress_by_user",
    theme: "physics_theme"
  };

  const state = {
    data: null,
    users: [],
    currentUser: null,
    progressByUser: {},
    theme: "dark",
    loading: true,
    booted: false,
    sidebarOpen: false,
    sidebarCollapsed: false,
    quizSession: null
  };

  const els = {
    view: document.getElementById("view"),
    unitsTree: document.getElementById("unitsTree"),
    toast: document.getElementById("toast"),
    sidebar: document.getElementById("sidebar"),
    backdrop: document.getElementById("backdrop"),
    menuToggle: document.getElementById("menuToggle"),
    sidebarCollapseBtn: document.getElementById("sidebarCollapseBtn"),
    themeToggle: document.getElementById("themeToggle"),
    authLink: document.getElementById("authLink"),
    globalSearch: document.getElementById("globalSearch"),
    searchGoBtn: document.getElementById("searchGoBtn"),
    continueBtn: document.getElementById("continueBtn")
  };

  const safeParse = (value, fallback) => {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
  };

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const normalizeText = (value) => String(value ?? "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[ـًٌٍَُِّْ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const saveStorage = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const loadStorage = (key, fallback) => safeParse(localStorage.getItem(key), fallback);

  function readJsonScript(id) {
    const node = document.getElementById(id);
    if (!node) return null;
    return safeParse(node.textContent, null);
  }

  function loadAppData() {
    const embedded = readJsonScript("app-data");
    if (embedded) return embedded;
    throw new Error("لم يتم العثور على بيانات التطبيق");
  }

  function loadSeedUsers() {
    const embedded = readJsonScript("seed-users");
    return Array.isArray(embedded) ? embedded : [];
  }

  function initStorage() {
    state.users = loadStorage(STORAGE_KEYS.users, null) || loadSeedUsers();
    saveStorage(STORAGE_KEYS.users, state.users);

    state.currentUser = localStorage.getItem(STORAGE_KEYS.currentUser) || "";
    state.progressByUser = loadStorage(STORAGE_KEYS.progress, {});

    state.theme = localStorage.getItem(STORAGE_KEYS.theme) || "dark";
    applyTheme(state.theme);
  }

  function saveUsers() {
    saveStorage(STORAGE_KEYS.users, state.users);
  }

  function saveProgress() {
    saveStorage(STORAGE_KEYS.progress, state.progressByUser);
  }

  function applyTheme(theme) {
    state.theme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = state.theme;
    localStorage.setItem(STORAGE_KEYS.theme, state.theme);
    els.themeToggle.textContent = state.theme === "dark" ? "☾" : "☀";
  }

  function toggleTheme() {
    applyTheme(state.theme === "dark" ? "light" : "dark");
    toast(state.theme === "dark" ? "تم تفعيل الوضع الداكن" : "تم تفعيل الوضع الفاتح", "success");
  }

  function getRoute() {
    const raw = location.hash || "#/home";
    const [pathPart, queryPart = ""] = raw.replace(/^#/, "").split("?");
    const parts = pathPart.split("/").filter(Boolean);
    const page = parts[0] || "home";
    const params = new URLSearchParams(queryPart);
    if (parts[0] === "lesson" && parts[1]) params.set("id", parts[1]);
    return { page, parts, params, raw };
  }

  function navigate(hash) {
    location.hash = hash;
    closeSidebar();
  }

  function getData() {
    return state.data;
  }

  function units() {
    return getData().units || [];
  }

  function lessons() {
    return getData().lessons || [];
  }

  function unitById(id) {
    return units().find((u) => u.id === id);
  }

  function lessonById(id) {
    return lessons().find((l) => l.id === id);
  }

  function lessonsForUnit(unitId) {
    return lessons().filter((l) => l.unitId === unitId);
  }

  function currentUserRecord() {
    return state.users.find((u) => u.email === state.currentUser) || null;
  }

  function ensureProgress(email) {
    if (!email) return null;
    if (!state.progressByUser[email]) {
      state.progressByUser[email] = {
        completedLessons: [],
        lastLessonId: "",
        lessonMiniAnswers: {},
        quizHistory: []
      };
      saveProgress();
    }
    return state.progressByUser[email];
  }

  function currentProgress() {
    return ensureProgress(state.currentUser);
  }

  function isAuthed() {
    return !!currentUserRecord();
  }

  function markVisitedLesson(lessonId) {
    const progress = currentProgress();
    if (!progress) return;
    progress.lastLessonId = lessonId;
    saveProgress();
    updateContinueButton();
  }

  function markLessonComplete(lessonId) {
    const progress = currentProgress();
    if (!progress) return;
    if (!progress.completedLessons.includes(lessonId)) {
      progress.completedLessons.push(lessonId);
    }
    progress.lastLessonId = lessonId;
    saveProgress();
    toast("تم حفظ تقدمك في هذا الدرس", "success");
    renderSidebar();
    render();
  }

  function saveMiniAnswer(lessonId, choice) {
    const progress = currentProgress();
    if (!progress) return;
    progress.lessonMiniAnswers[lessonId] = choice;
    saveProgress();
  }

  function recordQuizScore(unitId, score, total) {
    const progress = currentProgress();
    if (!progress) return;
    progress.quizHistory.unshift({
      unitId,
      score,
      total,
      date: new Date().toISOString()
    });
    progress.quizHistory = progress.quizHistory.slice(0, 20);
    saveProgress();
  }

  function completedCount() {
    const progress = currentProgress();
    return progress ? progress.completedLessons.length : 0;
  }

  function completionPercent() {
    const total = lessons().length || 1;
    return Math.round((completedCount() / total) * 100);
  }

  function averageScore() {
    const progress = currentProgress();
    if (!progress || !progress.quizHistory.length) return 0;
    const sum = progress.quizHistory.reduce((acc, item) => acc + (item.score / item.total), 0);
    return Math.round((sum / progress.quizHistory.length) * 100);
  }

  function bestScore() {
    const progress = currentProgress();
    if (!progress || !progress.quizHistory.length) return 0;
    return Math.max(...progress.quizHistory.map((item) => Math.round((item.score / item.total) * 100)));
  }

  function getNextLessonId() {
    const progress = currentProgress();
    const ordered = lessons();
    const nextUncompleted = ordered.find((lesson) => !progress?.completedLessons.includes(lesson.id));
    return nextUncompleted ? nextUncompleted.id : ordered[0]?.id || "";
  }

  function getContinueLessonId() {
    const progress = currentProgress();
    return progress?.lastLessonId || getNextLessonId();
  }

  function searchLessons(query) {
    const q = normalizeText(query);
    if (!q) return [];
    return lessons().filter((lesson) => {
      const unit = unitById(lesson.unitId);
      const haystack = normalizeText([
        lesson.title,
        lesson.subtitle,
        lesson.explanation,
        lesson.example,
        lesson.keyPoints.join(" "),
        unit?.title,
        unit?.subtitle
      ].join(" "));
      return haystack.includes(q);
    });
  }

  function unitCompletion(unitId) {
    const items = lessonsForUnit(unitId);
    const progress = currentProgress();
    const total = items.length || 1;
    const completed = items.filter((lesson) => progress?.completedLessons.includes(lesson.id)).length;
    return Math.round((completed / total) * 100);
  }

  function getRecentActivity() {
    const progress = currentProgress();
    if (!progress) return [];
    const completed = (progress.completedLessons || []).slice(0, 4).map((lessonId) => {
      const lesson = lessonById(lessonId);
      return lesson ? { type: "lesson", title: lesson.title, id: lesson.id } : null;
    }).filter(Boolean);
    const quizzes = (progress.quizHistory || []).slice(0, 3).map((item) => ({
      type: "quiz",
      title: `${item.score}/${item.total} في اختبار ${unitById(item.unitId)?.title || "سريع"}`,
      id: item.date
    }));
    return [...completed, ...quizzes].slice(0, 5);
  }

  function formatDate(iso) {
    try {
      return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function progressBadgeClass(percent) {
    if (percent >= 75) return "success";
    if (percent >= 40) return "warn";
    return "";
  }

  function pageFrame(title, subtitle, content, actions = "") {
    return `
      <section class="page">
        <header class="hero">
          <div class="hero-grid">
            <div>
              <p class="eyebrow">منصة تعليم الفيزياء</p>
              <h1 class="section-title">${title}</h1>
              <p>${subtitle}</p>
              <div class="hero-actions">${actions}</div>
            </div>
            <div class="kpis">
              <div class="kpi">
                <strong>${lessons().length}</strong>
                <span>درسًا متاحًا</span>
              </div>
              <div class="kpi">
                <strong>${units().length}</strong>
                <span>وحدات رئيسية</span>
              </div>
              <div class="kpi">
                <strong>${completionPercent()}%</strong>
                <span>نسبة الإنجاز</span>
              </div>
            </div>
          </div>
        </header>
        ${content}
      </section>
    `;
  }

  function getRecommendedLesson() {
    const next = getNextLessonId();
    return lessonById(next) || lessons()[0] || null;
  }

  function renderHome() {
    const progress = currentProgress();
    const continueId = getContinueLessonId();
    const continueLesson = lessonById(continueId) || getRecommendedLesson();
    const greeting = isAuthed()
      ? `مرحبًا ${escapeHtml(currentUserRecord()?.name || "بك")}، جاهز نكمّل رحلة الفيزياء؟`
      : "ابدأ رحلة الفيزياء بثبات ووضوح من أول خطوة.";
    const body = `
      <div class="card-grid">
        <article class="card card-lg">
          <div class="badge-row">
            <span class="badge"><span class="badge-icon"><i class="fa fa-graduation-cap" aria-hidden="true"></i></span>تعلم واضح ومختصر</span>
            <span class="badge"><span class="badge-icon"><i class="fa fa-compass" aria-hidden="true"></i></span>تنقل سريع بين الدروس</span>
            <span class="badge"><span class="badge-icon"><i class="fa fa-bullseye" aria-hidden="true"></i></span>اختبارات فورية</span>
          </div>
          <h3>${greeting}</h3>
          <p>${isAuthed() ? "أنت الآن في مساحة تعلم مرتبة تساعدك على الوصول لأي درس أو اختبار خلال ثوانٍ." : "سجّل دخولك لتحفظ تقدمك وتكمل من حيث توقفت، أو استكشف الوحدات المتاحة مباشرة."}</p>
          <div class="card-actions">
            <button class="primary-btn" data-action="continue">متابعة من حيث توقفت</button>
            <a class="ghost-btn" href="#/units">استعرض الوحدات</a>
            <a class="ghost-btn" href="#/quiz">اختبار سريع</a>
          </div>
        </article>

        <article class="card card-md">
          <h3>ملخص سريع</h3>
          <div class="progress-shell">
            <div>
              <div class="stats-row">
                <span class="badge-pill">التقدم: ${completionPercent()}%</span>
                <span class="badge-pill">المتوسط: ${averageScore()}%</span>
              </div>
              <div class="progress-bar" aria-label="شريط التقدم"><span style="width:${completionPercent()}%"></span></div>
            </div>
            <p class="small-muted">أنجزت ${completedCount()} درسًا من أصل ${lessons().length} درسًا.</p>
          </div>
        </article>

        <article class="card card-full">
          <div class="split">
            <div>
              <h3>الدرس المقترح الآن</h3>
              <p class="lesson-text">${continueLesson ? `${continueLesson.title} - ${continueLesson.subtitle}` : "لا توجد دروس بعد."}</p>
              <div class="card-actions">
                ${continueLesson ? `<a class="primary-btn" href="#/lesson/${continueLesson.id}">افتح الدرس الآن</a>` : ""}
                <a class="ghost-btn" href="#/search">ابحث بسرعة</a>
              </div>
            </div>
            <div>
              <h3>اختصارات مفيدة</h3>
              <div class="quick-links">
                <a class="badge-pill" href="#/dashboard">لوحة الطالب</a>
                <a class="badge-pill" href="#/progress">التقدم</a>
                <a class="badge-pill" href="#/settings">الإعدادات</a>
                <a class="badge-pill" href="#/search">البحث</a>
              </div>
            </div>
          </div>
        </article>

        <article class="card card-full">
          <h3>الوحدات الأساسية</h3>
          <div class="card-grid" style="margin-top: 12px;">
            ${units().map((unit) => `
              <div class="card card-md" style="grid-column: span 4;">
                <div class="badge-row">
                  <span class="badge"><span class="badge-icon">${escapeHtml(unit.icon)}</span>${escapeHtml(unit.title)}</span>
                  <span class="badge ${progressBadgeClass(unitCompletion(unit.id))}">${unitCompletion(unit.id)}%</span>
                </div>
                <h4>${escapeHtml(unit.subtitle)}</h4>
                <p>${lessonsForUnit(unit.id).length} درس / ${lessonsForUnit(unit.id).length} موضوع أساسي</p>
                <div class="card-actions">
                  <a class="primary-btn" href="#/units">فتح الوحدة</a>
                  ${lessonsForUnit(unit.id)[0] ? `<a class="ghost-btn" href="#/lesson/${lessonsForUnit(unit.id)[0].id}">الدرس الأول</a>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
        </article>
      </div>
    `;
    return pageFrame("مرحبًا بك في فيزياء بلس", "منصة عربية منظمة لتعلّم الفيزياء بطريقة أنيقة، سريعة، وسهلة على الطالب.", body);
  }

  function renderDashboard() {
    if (!isAuthed()) return renderAuthPrompt("dashboard");
    const progress = currentProgress();
    const continueLesson = getRecommendedLesson();
    const nextTitle = continueLesson ? continueLesson.title : "لا يوجد درس متبقٍ";
    const recent = getRecentActivity();
    const body = `
      <div class="card-grid">
        <article class="card card-lg">
          <h3>لوحة الطالب</h3>
          <p>هذه الصفحة تعرض لك ما أنجزته وما يمكنك تعلمه بعد ذلك، بدون تشويش أو خطوات معقدة.</p>
          <div class="stats-grid">
            <div class="stat-card"><strong>${completionPercent()}%</strong><span>نسبة إكمال الدروس</span></div>
            <div class="stat-card"><strong>${averageScore()}%</strong><span>متوسط الاختبارات</span></div>
            <div class="stat-card"><strong>${bestScore()}%</strong><span>أفضل نتيجة</span></div>
            <div class="stat-card"><strong>${progress.quizHistory.length}</strong><span>عدد المحاولات</span></div>
          </div>
          <div class="card-actions" style="margin-top: 14px;">
            <a class="primary-btn" href="#/lesson/${continueLesson?.id || ""}">اكمل: ${escapeHtml(nextTitle)}</a>
            <a class="ghost-btn" href="#/quiz">اختبار سريع</a>
          </div>
        </article>

        <article class="card card-md">
          <h3>حالة التقدم</h3>
          <div class="progress-shell">
            <div class="progress-bar"><span style="width:${completionPercent()}%"></span></div>
            <p>أكملت <strong>${completedCount()}</strong> من أصل <strong>${lessons().length}</strong> درسًا.</p>
            <p class="small-muted">آخر درس مفتوح: ${escapeHtml(lessonById(progress.lastLessonId)?.title || "لم تحدد بعد")}</p>
          </div>
        </article>

        <article class="card card-full">
          <h3>آخر الأنشطة</h3>
          ${recent.length ? `
            <div class="list">
              ${recent.map((item) => `
                <div class="list-item">
                  <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <p>${item.type === "lesson" ? "درس تمت متابعته" : "نتيجة اختبار محفوظة"}</p>
                  </div>
                  <a class="ghost-btn" href="${item.type === "lesson" ? `#/lesson/${item.id}` : `#/progress`}">فتح</a>
                </div>
              `).join("")}
            </div>
          ` : `<div class="empty-state"><h4>لا توجد أنشطة بعد</h4><p>ابدأ بفتح درس أو إجراء اختبار سريع، ثم سيظهر كل شيء هنا تلقائيًا.</p></div>`}
        </article>
      </div>
    `;
    return pageFrame("لوحة الطالب", "متابعة واضحة للتقدم والاختبارات والدرس التالي المناسب لك.", body);
  }

  function renderUnitsPage() {
    const body = `
      <div class="card-grid">
        <article class="card card-full">
          <h3>الوحدات الدراسية</h3>
          <p>اختر الوحدة التي تريدها، ثم افتح الدرس مباشرة من داخلها.</p>
        </article>
        ${units().map((unit) => {
          const unitLessons = lessonsForUnit(unit.id);
          return `
            <article class="card card-md">
              <div class="badge-row">
                <span class="badge"><span class="badge-icon">${escapeHtml(unit.icon)}</span>${escapeHtml(unit.title)}</span>
                <span class="badge ${progressBadgeClass(unitCompletion(unit.id))}">${unitCompletion(unit.id)}%</span>
              </div>
              <h3>${escapeHtml(unit.subtitle)}</h3>
              <p>${unitLessons.length} درس متاح في هذه الوحدة.</p>
              <div class="list" style="margin-top: 12px;">
                ${unitLessons.map((lesson) => `
                  <a class="list-item" href="#/lesson/${lesson.id}">
                    <div>
                      <strong>${escapeHtml(lesson.title)}</strong>
                      <p>${escapeHtml(lesson.subtitle)}</p>
                    </div>
                    <span class="badge-pill">فتح</span>
                  </a>
                `).join("")}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
    return pageFrame("الوحدات", "خريطة مختصرة لكل وحدة مع الوصول السريع إلى دروسها.", body);
  }

  function renderLessonPage(lessonId) {
    const lesson = lessonById(lessonId) || lessons()[0];
    if (!lesson) return renderEmptyPage("لم يتم العثور على الدرس المطلوب.", "#/units");
    const unit = unitById(lesson.unitId);
    const progress = currentProgress();
    markVisitedLesson(lesson.id);
    const savedAnswer = progress?.lessonMiniAnswers?.[lesson.id];
    const answerBlock = savedAnswer === undefined ? "" : renderMiniAnswerResult(lesson, savedAnswer);
    const lessonIndex = lessons().findIndex((item) => item.id === lesson.id);
    const prev = lessons()[lessonIndex - 1];
    const next = lessons()[lessonIndex + 1];

    const body = `
      <div class="lesson-layout">
        <article class="lesson-panel">
          <header class="lesson-header">
            <div class="badge-row">
              <span class="badge"><span class="badge-icon">${escapeHtml(unit?.icon || "📘")}</span>${escapeHtml(unit?.title || "وحدة")}</span>
              <span class="badge ${progressBadgeClass(completionPercent())}">${completionPercent()}%</span>
            </div>
            <div class="lesson-title">
              <h1>${escapeHtml(lesson.title)}</h1>
              <div class="lesson-nav">
                <button class="ghost-btn" data-action="mark-complete" data-lesson="${lesson.id}">اعتبره مكتملًا</button>
              </div>
            </div>
            <p class="lesson-text">${escapeHtml(lesson.subtitle)}</p>
          </header>

          <section class="lesson-box">
            <h3>الشرح المبسط</h3>
            <p class="lesson-text">${escapeHtml(lesson.explanation)}</p>
          </section>

          <div class="split">
            <section class="lesson-step">
              <h4>أهم النقاط</h4>
              <div class="list">
                ${lesson.keyPoints.map((item) => `<div class="list-item"><p>${escapeHtml(item)}</p></div>`).join("")}
              </div>
            </section>
            <section class="lesson-step">
              <h4>مثال سريع</h4>
              <p class="lesson-text">${escapeHtml(lesson.example)}</p>
            </section>
          </div>

          <section class="lesson-step">
            <h4>سؤال سريع داخل الدرس</h4>
            <p>${escapeHtml(lesson.miniQuestion.question)}</p>
            <div class="option-grid">
              ${lesson.miniQuestion.options.map((option, idx) => {
                const chosen = savedAnswer !== undefined && Number(savedAnswer) === idx;
                const classes = ["option-btn"];
                if (chosen) {
                  classes.push(idx === lesson.miniQuestion.answer ? "correct" : "wrong");
                }
                return `
                  <button class="${classes.join(" ")}" data-action="mini-answer" data-lesson="${lesson.id}" data-choice="${idx}" ${savedAnswer !== undefined ? "disabled" : ""}>
                    ${escapeHtml(option)}
                  </button>
                `;
              }).join("")}
            </div>
            ${answerBlock}
          </section>

          <div class="card-actions">
            ${prev ? `<a class="ghost-btn" href="#/lesson/${prev.id}">الدرس السابق</a>` : ""}
            ${next ? `<a class="primary-btn" href="#/lesson/${next.id}">الدرس التالي</a>` : `<a class="primary-btn" href="#/quiz">اختبار سريع</a>`}
          </div>
        </article>

        <aside class="side-panel">
          <h3>خلاصة الدرس</h3>
          <p class="small-muted">الوحدة: ${escapeHtml(unit?.title || "")}</p>
          <div class="tag-row">
            <span class="badge-pill">درس ${lessonIndex + 1} من ${lessons().length}</span>
            <span class="badge-pill">${lessonsForUnit(lesson.unitId).length} دروس في الوحدة</span>
          </div>
          <hr class="hr" />
          <h4>خيار متابعة</h4>
          <p>بعد إنهاء السؤال السريع، يمكنك تثبيت تقدمك ثم الانتقال إلى الاختبار أو الدرس التالي.</p>
          <div class="form-stack">
            <button class="primary-btn" data-action="mark-complete" data-lesson="${lesson.id}">حفظ التقدم</button>
            <a class="ghost-btn" href="#/quiz?unit=${encodeURIComponent(lesson.unitId)}">اختبار على الوحدة</a>
            <a class="ghost-btn" href="#/search?query=${encodeURIComponent(lesson.title)}">ابحث داخل هذا المفهوم</a>
          </div>
        </aside>
      </div>
    `;
    return pageFrame(lesson.title, lesson.subtitle, body);
  }

  function renderMiniAnswerResult(lesson, choice) {
    const correct = lesson.miniQuestion.answer === Number(choice);
    return `
      <div class="feedback ${correct ? "success" : "error"}">
        <strong>${correct ? "إجابة صحيحة" : "إجابة غير صحيحة"}</strong>
        <p>${escapeHtml(lesson.miniQuestion.explanation)}</p>
      </div>
    `;
  }

  function makeQuizSession(unitId) {
    const source = unitId && unitId !== "all"
      ? lessonsForUnit(unitId).flatMap((lesson) => lesson.questions.map((q) => ({ ...q, lessonId: lesson.id, unitId: lesson.unitId })))
      : lessons().flatMap((lesson) => lesson.questions.map((q) => ({ ...q, lessonId: lesson.id, unitId: lesson.unitId })));

    const shuffled = [...source].sort(() => Math.random() - 0.5);
    return {
      unitId,
      questions: shuffled.slice(0, Math.min(5, shuffled.length)),
      answers: {},
      finished: false
    };
  }

  function renderQuizPage() {
    const route = getRoute();
    const unitId = route.params.get("unit") || "all";
    if (!state.quizSession || state.quizSession.unitId !== unitId) {
      state.quizSession = makeQuizSession(unitId);
    }
    const unit = unitId === "all" ? null : unitById(unitId);
    const answeredCount = Object.keys(state.quizSession.answers).length;
    const score = quizScore();

    const body = `
      <div class="card-grid">
        <article class="card card-full">
          <div class="quiz-toolbar">
            <label style="min-width: 220px; flex: 1;">
              <span class="label">اختر الوحدة</span>
              <select class="select" id="quizUnitSelect">
                <option value="all" ${unitId === "all" ? "selected" : ""}>كل الوحدات</option>
                ${units().map((u) => `<option value="${u.id}" ${u.id === unitId ? "selected" : ""}>${escapeHtml(u.title)}</option>`).join("")}
              </select>
            </label>
            <div class="form-actions" style="align-items:flex-end;">
              <button class="primary-btn" data-action="start-test">بدء / إعادة الاختبار</button>
              <a class="ghost-btn" href="#/progress">عرض النتائج</a>
            </div>
          </div>
          <p class="small-muted">عدد الأسئلة: ${state.quizSession.questions.length}. بعد الإجابة ستظهر لك النتيجة مباشرة مع تفسير مختصر.</p>
        </article>

        <article class="card card-full">
          <h3>${unit ? `اختبار وحدة ${escapeHtml(unit.title)}` : "اختبار شامل"}</h3>
          <div class="progress-shell">
            <div class="progress-bar"><span style="width:${Math.round((answeredCount / state.quizSession.questions.length) * 100)}%"></span></div>
            <p>أجبت عن ${answeredCount} من ${state.quizSession.questions.length} أسئلة. ${state.quizSession.finished ? `نتيجتك: <strong>${score}%</strong>` : "واصل الإجابة للوصول إلى النتيجة."}</p>
          </div>
        </article>

        ${state.quizSession.questions.map((q, index) => renderQuizQuestionCard(q, index)).join("")}

        ${state.quizSession.finished ? `
          <article class="card card-full">
            <div class="split">
              <div>
                <h3>النتيجة النهائية</h3>
                <p>أحرزت <strong>${state.quizSession.correct}</strong> من أصل <strong>${state.quizSession.questions.length}</strong> إجابة صحيحة.</p>
                <p>المجموع: <strong>${score}%</strong></p>
              </div>
              <div>
                <h3>ماذا بعد؟</h3>
                <div class="card-actions">
                  <a class="primary-btn" href="#/progress">افتح صفحة التقدم</a>
                  <button class="ghost-btn" data-action="start-test">أعد الاختبار</button>
                </div>
              </div>
            </div>
          </article>
        ` : ""}
      </div>
    `;
    return pageFrame("اختبار سريع", "اختبر فهمك في دقائق مع تصحيح فوري وشرح واضح للإجابة الصحيحة.", body);
  }

  function renderQuizQuestionCard(question, index) {
    const answered = state.quizSession.answers[index];
    const isFinished = state.quizSession.finished;
    const wasAnswered = answered !== undefined;
    const correct = question.answer === answered;
    return `
      <article class="card card-full">
        <div class="badge-row">
          <span class="badge">سؤال ${index + 1}</span>
          <span class="badge">${escapeHtml(lessonById(question.lessonId)?.title || "")}</span>
        </div>
        <h3>${escapeHtml(question.question)}</h3>
        <div class="option-grid">
          ${question.options.map((option, choiceIdx) => {
            const classes = ["option-btn"];
            if (wasAnswered) {
              if (choiceIdx === question.answer) classes.push("correct");
              if (choiceIdx === answered && !correct) classes.push("wrong");
            }
            return `
              <button
                class="${classes.join(" ")}"
                data-action="quiz-answer"
                data-index="${index}"
                data-choice="${choiceIdx}"
                ${isFinished ? "disabled" : ""}
              >
                ${escapeHtml(option)}
              </button>
            `;
          }).join("")}
        </div>
        ${wasAnswered ? `
          <div class="feedback ${correct ? "success" : "error"}">
            <strong>${correct ? "إجابة صحيحة" : "إجابة غير صحيحة"}</strong>
            <p>${escapeHtml(question.explanation)}</p>
          </div>
        ` : `<p class="small-muted">اختر إجابة واحدة، ثم ستظهر لك المراجعة الفورية.</p>`}
      </article>
    `;
  }

  function quizScore() {
    if (!state.quizSession) return 0;
    const total = state.quizSession.questions.length || 1;
    const correct = Object.entries(state.quizSession.answers).filter(([idx, choice]) => {
      const question = state.quizSession.questions[Number(idx)];
      return question && Number(choice) === question.answer;
    }).length;
    state.quizSession.correct = correct;
    return Math.round((correct / total) * 100);
  }

  function answerQuiz(index, choice) {
    if (!state.quizSession || state.quizSession.finished) return;
    if (state.quizSession.answers[index] !== undefined) return;
    state.quizSession.answers[index] = Number(choice);
    quizScore();
    const qCount = state.quizSession.questions.length;
    const answeredCount = Object.keys(state.quizSession.answers).length;

    if (answeredCount === qCount) {
      state.quizSession.finished = true;
      const score = quizScore();
      recordQuizScore(state.quizSession.unitId, state.quizSession.correct, qCount);
      toast(`انتهى الاختبار. نتيجتك ${score}%`, score >= 60 ? "success" : "error");
    }
    render();
  }

  function renderSearchPage() {
    const route = getRoute();
    const query = route.params.get("query") || els.globalSearch.value || "";
    const results = query ? searchLessons(query) : [];
    const body = `
      <div class="card-grid">
        <article class="card card-full">
          <form id="searchForm" class="form-stack">
            <label>
              <span class="label">ابحث في الدروس والمفاهيم</span>
              <input class="form-control" name="query" value="${escapeHtml(query)}" placeholder="مثال: السرعة أو الطاقة أو الدائرة الكهربائية" />
            </label>
            <div class="form-actions">
              <button class="primary-btn" type="submit">بحث</button>
              <a class="ghost-btn" href="#/units">استعرض الوحدات</a>
            </div>
          </form>
        </article>

        <article class="card card-full">
          <h3>النتائج</h3>
          ${!query ? `
            <div class="empty-state">
              <h4>اكتب كلمة بحث للبدء</h4>
              <p>يمكنك البحث عن عنوان درس أو مفهوم داخل الشرح أو حتى داخل الأمثلة.</p>
            </div>
          ` : results.length ? `
            <div class="list">
              ${results.map((lesson) => {
                const unit = unitById(lesson.unitId);
                return `
                  <a class="list-item" href="#/lesson/${lesson.id}">
                    <div>
                      <strong>${escapeHtml(lesson.title)}</strong>
                      <p>${escapeHtml(unit?.title || "")} • ${escapeHtml(lesson.subtitle)}</p>
                    </div>
                    <span class="badge-pill">فتح</span>
                  </a>
                `;
              }).join("")}
            </div>
          ` : `
            <div class="empty-state">
              <h4>لا توجد نتائج مطابقة</h4>
              <p>جرّب كلمة أبسط مثل "السرعة" أو "الطاقة" أو "الصوت".</p>
              <div class="card-actions" style="justify-content:center; margin-top: 12px;">
                <a class="primary-btn" href="#/units">الانتقال إلى الوحدات</a>
              </div>
            </div>
          `}
        </article>
      </div>
    `;
    return pageFrame("البحث", "ابحث بسرعة داخل المنصة للوصول إلى أي درس أو مفهوم خلال لحظات.", body);
  }

  function renderProgressPage() {
    if (!isAuthed()) return renderAuthPrompt("progress");
    const progress = currentProgress();
    const body = `
      <div class="card-grid">
        <article class="card card-lg">
          <h3>تقدمك الحالي</h3>
          <div class="progress-shell">
            <div class="progress-bar"><span style="width:${completionPercent()}%"></span></div>
            <p>أنجزت <strong>${completedCount()}</strong> درسًا من أصل <strong>${lessons().length}</strong>.</p>
          </div>
          <div class="stats-grid" style="margin-top: 14px;">
            <div class="stat-card"><strong>${completionPercent()}%</strong><span>إكمال الدروس</span></div>
            <div class="stat-card"><strong>${averageScore()}%</strong><span>متوسط الاختبارات</span></div>
            <div class="stat-card"><strong>${bestScore()}%</strong><span>أفضل نتيجة</span></div>
            <div class="stat-card"><strong>${progress.quizHistory.length}</strong><span>محاولات الاختبار</span></div>
          </div>
        </article>

        <article class="card card-md">
          <h3>آخر درس مفتوح</h3>
          <p>${escapeHtml(lessonById(progress.lastLessonId)?.title || "لم تفتح درسًا بعد")}</p>
          <div class="card-actions">
            <a class="primary-btn" href="#/lesson/${getContinueLessonId()}">متابعة</a>
          </div>
        </article>

        <article class="card card-full">
          <h3>الدروس المكتملة</h3>
          ${progress.completedLessons.length ? `
            <div class="list">
              ${progress.completedLessons.map((lessonId) => {
                const lesson = lessonById(lessonId);
                if (!lesson) return "";
                return `
                  <a class="list-item" href="#/lesson/${lesson.id}">
                    <div>
                      <strong>${escapeHtml(lesson.title)}</strong>
                      <p>${escapeHtml(unitById(lesson.unitId)?.title || "")}</p>
                    </div>
                    <span class="badge-pill">مكتمل</span>
                  </a>
                `;
              }).join("")}
            </div>
          ` : `<div class="empty-state"><h4>لا توجد دروس مكتملة بعد</h4><p>ابدأ من درس واحد، ثم عد إلى هذه الصفحة لترى النتيجة تتكوّن أمامك.</p></div>`}
        </article>

        <article class="card card-full">
          <h3>سجل الاختبارات</h3>
          ${progress.quizHistory.length ? `
            <div class="list">
              ${progress.quizHistory.map((item) => `
                <div class="list-item">
                  <div>
                    <strong>${item.score}/${item.total} (${Math.round((item.score / item.total) * 100)}%)</strong>
                    <p>${escapeHtml(unitById(item.unitId)?.title || "اختبار شامل")} • ${formatDate(item.date)}</p>
                  </div>
                  <a class="ghost-btn" href="#/quiz?unit=${encodeURIComponent(item.unitId || "all")}">إعادة</a>
                </div>
              `).join("")}
            </div>
          ` : `<div class="empty-state"><h4>لا توجد نتائج محفوظة بعد</h4><p>قم بإجراء اختبار سريع حتى يبدأ السجل في الظهور هنا.</p></div>`}
        </article>
      </div>
    `;
    return pageFrame("التقدم", "صفحة تذكرك بما أنجزته وتعرض نتائجك بشكل واضح وقابل للتتبع.", body);
  }

  function renderSettingsPage() {
    const user = currentUserRecord();
    const body = `
      <div class="card-grid">
        <article class="card card-lg">
          <h3>الإعدادات</h3>
          <div class="form-stack">
            <div class="list-item">
              <div>
                <strong>الوضع الحالي</strong>
                <p>${state.theme === "dark" ? "داكن" : "فاتح"}</p>
              </div>
              <button class="primary-btn" data-action="theme-toggle">تبديل الوضع</button>
            </div>

            <div class="list-item">
              <div>
                <strong>الحساب الحالي</strong>
                <p>${user ? `${escapeHtml(user.name)} • ${escapeHtml(user.email)}` : "غير مسجل الدخول"}</p>
              </div>
              ${user ? `<button class="ghost-btn" data-action="logout">تسجيل الخروج</button>` : `<a class="primary-btn" href="#/login">تسجيل الدخول</a>`}
            </div>

            <div class="list-item">
              <div>
                <strong>إعادة ضبط التقدم</strong>
                <p>سيتم حذف الدروس المكتملة ونتائج الاختبارات لهذا الحساب فقط.</p>
              </div>
              <button class="danger-btn" data-action="reset-progress">حذف التقدم</button>
            </div>
          </div>
        </article>

        <article class="card card-md">
          <h3>حول الحساب</h3>
          <p class="small-muted">اسم العرض: ${escapeHtml(user?.name || "زائر")}</p>
          <p class="small-muted">المستوى: ${escapeHtml(user?.className || "غير محدد")}</p>
          <p class="small-muted">التقدم المحفوظ محليًا على هذا الجهاز فقط.</p>
        </article>
      </div>
    `;
    return pageFrame("الإعدادات", "تحكم في المظهر والحساب والتقدم المحفوظ بطريقة بسيطة.", body);
  }

  function renderLoginPage() {
    if (isAuthed()) {
      return renderAuthPrompt("dashboard", true);
    }
    const body = `
      <div class="form-card">
        <div class="card">
          <p class="eyebrow">تسجيل الدخول</p>
          <h3>ادخل إلى حسابك</h3>
          <p class="small-muted">سجّل الدخول لحفظ التقدم ومتابعة الدروس من حيث توقفت.</p>
          <form id="loginForm" class="form-stack">
            <label>
              <span class="label">البريد الإلكتروني</span>
              <input class="form-control" name="email" type="email" required placeholder="student@physics.local" />
            </label>
            <label>
              <span class="label">كلمة المرور</span>
              <input class="form-control" name="password" type="password" required placeholder="••••••••" />
            </label>
            <div class="form-actions">
              <button class="primary-btn" type="submit">تسجيل الدخول</button>
              <a class="ghost-btn" href="#/register">إنشاء حساب جديد</a>
            </div>
          </form>
          <p class="helper">يوجد حساب تجريبي مدمج: student@physics.local / 123456</p>
        </div>
      </div>
    `;
    return pageFrame("تسجيل الدخول", "واجهة بسيطة جدًا للوصول إلى المنصة وحفظ تقدمك.", body);
  }

  function renderRegisterPage() {
    if (isAuthed()) return renderAuthPrompt("dashboard", true);
    const body = `
      <div class="form-card">
        <div class="card">
          <p class="eyebrow">إنشاء حساب</p>
          <h3>ابدأ حسابًا جديدًا</h3>
          <p class="small-muted">أنشئ حسابًا محليًا بسيطًا ثم ابدأ التعلم فورًا.</p>
          <form id="registerForm" class="form-stack">
            <div class="form-grid">
              <label>
                <span class="label">الاسم</span>
                <input class="form-control" name="name" required placeholder="اسم الطالب" />
              </label>
              <label>
                <span class="label">الصف</span>
                <input class="form-control" name="className" required placeholder="الصف الثاني الإعدادي" />
              </label>
            </div>
            <label>
              <span class="label">البريد الإلكتروني</span>
              <input class="form-control" name="email" type="email" required placeholder="name@example.com" />
            </label>
            <label>
              <span class="label">كلمة المرور</span>
              <input class="form-control" name="password" type="password" required minlength="4" placeholder="أدخل كلمة مرور بسيطة" />
            </label>
            <div class="form-actions">
              <button class="primary-btn" type="submit">إنشاء الحساب</button>
              <a class="ghost-btn" href="#/login">لدي حساب بالفعل</a>
            </div>
          </form>
          <p class="helper">كل البيانات تُحفظ على هذا الجهاز فقط باستخدام localStorage.</p>
        </div>
      </div>
    `;
    return pageFrame("التسجيل", "أضف حسابًا جديدًا ثم أكمل التعلّم مباشرة.", body);
  }

  function renderAuthPrompt(target, alreadyLogged = false) {
    const body = `
      <div class="form-card">
        <div class="card">
          <p class="eyebrow">مطلوب تسجيل الدخول</p>
          <h3>${alreadyLogged ? "أنت مسجل الدخول بالفعل" : "هذه الصفحة تحتاج حسابًا"}</h3>
          <p class="small-muted">${alreadyLogged ? "يمكنك الانتقال إلى لوحة الطالب مباشرة." : "سجّل الدخول أولًا حتى نحفظ تقدمك ونتيح لك الاختبارات والإنجازات."}</p>
          <div class="form-actions">
            <a class="primary-btn" href="${alreadyLogged ? `#/${target}` : "#/login"}">${alreadyLogged ? "الانتقال إلى الصفحة" : "تسجيل الدخول"}</a>
            ${alreadyLogged ? `<button class="ghost-btn" data-action="logout">تسجيل الخروج</button>` : `<a class="ghost-btn" href="#/register">إنشاء حساب</a>`}
          </div>
        </div>
      </div>
    `;
    return pageFrame("تنبيه", "الوصول المنظم يحافظ على تجربة الطالب بسيطة وواضحة.", body);
  }

  function renderEmptyPage(message, backHref) {
    const body = `
      <div class="card card-full">
        <div class="empty-state">
          <h3>${escapeHtml(message)}</h3>
          <div class="card-actions" style="justify-content:center; margin-top: 12px;">
            <a class="primary-btn" href="${backHref}">العودة</a>
          </div>
        </div>
      </div>
    `;
    return pageFrame("صفحة غير مكتملة", "حدث خطأ في الوصول إلى المحتوى المطلوب.", body);
  }

  function renderInitialLoader() {
    els.view.innerHTML = `
      <div class="loading-box">
        <div class="spinner"></div>
        <strong>جارٍ تجهيز منصة الفيزياء...</strong>
        <span class="muted">لحظات بسيطة ثم تظهر الواجهة كاملة.</span>
      </div>
    `;
  }

  function render() {
    const route = getRoute();
    updateContinueButton();
    updateAuthLink();

    if (!state.booted) {
      renderInitialLoader();
      return;
    }

    if (!route.page) {
      location.hash = "#/home";
      return;
    }

    if (!isPublicPage(route.page) && !isAuthed()) {
      els.view.innerHTML = renderLoginPage();
      renderSidebar();
      return;
    }

    let content = "";
    switch (route.page) {
      case "home":
        content = renderHome();
        break;
      case "dashboard":
        content = renderDashboard();
        break;
      case "units":
        content = renderUnitsPage();
        break;
      case "lesson":
        content = renderLessonPage(route.params.get("id"));
        break;
      case "quiz":
        content = renderQuizPage();
        break;
      case "search":
        content = renderSearchPage();
        break;
      case "progress":
        content = renderProgressPage();
        break;
      case "settings":
        content = renderSettingsPage();
        break;
      case "login":
        content = renderLoginPage();
        break;
      case "register":
        content = renderRegisterPage();
        break;
      default:
        content = renderHome();
        break;
    }

    els.view.innerHTML = content;
    renderSidebar();
    syncSearchInput(route);
    updateQuizControls();
  }

  function isPublicPage(page) {
    return ["home", "login", "register", "search", "units", "lesson", "quiz"].includes(page);
  }

  function updateContinueButton() {
    const lessonId = getContinueLessonId();
    els.continueBtn.disabled = !lessonId;
    els.continueBtn.dataset.lesson = lessonId || "";
    els.continueBtn.textContent = lessonId ? "متابعة" : "ابدأ";
  }

  function updateAuthLink() {
    if (isAuthed()) {
      els.authLink.textContent = "الإعدادات";
      els.authLink.href = "#/settings";
    } else {
      els.authLink.textContent = "تسجيل الدخول";
      els.authLink.href = "#/login";
    }
  }

  function syncSearchInput(route) {
    const val = route.page === "search" ? (route.params.get("query") || "") : els.globalSearch.value || "";
    if (route.page === "search") {
      els.globalSearch.value = val;
    }
  }

  function renderSidebar() {
    const route = getRoute();
    const currentLesson = route.page === "lesson" ? route.params.get("id") : "";
    const currentUnit = currentLesson ? lessonById(currentLesson)?.unitId : "";
    els.sidebar.classList.toggle("collapsed", state.sidebarCollapsed);

    const unitsHtml = units().map((unit) => {
      const unitLessons = lessonsForUnit(unit.id);
      const open = unit.id === currentUnit || route.page === "units" || route.page === "home";
      return `
        <details class="unit-block" ${open ? "open" : ""}>
          <summary>
            <div class="unit-title">
              <span class="emoji">${escapeHtml(unit.icon)}</span>
              <div class="text">
                <strong>${escapeHtml(unit.title)}</strong>
                <div class="unit-meta">${escapeHtml(unit.subtitle)}</div>
              </div>
            </div>
            <span class="badge-pill">${unitCompletion(unit.id)}%</span>
          </summary>
          <div class="unit-body">
            ${unitLessons.map((lesson) => `
              <a class="lesson-link ${lesson.id === currentLesson ? "active" : ""}" href="#/lesson/${lesson.id}">
                <span class="badge-icon">•</span>
                <span class="link-text">${escapeHtml(lesson.title)}</span>
              </a>
            `).join("")}
          </div>
        </details>
      `;
    }).join("");

    els.unitsTree.innerHTML = unitsHtml;
    document.querySelectorAll(".side-link").forEach((link) => {
      const href = link.getAttribute("href") || "";
      const page = href.replace("#/", "");
      link.classList.toggle("active", route.page === page);
    });

    if (state.sidebarCollapsed) {
      els.sidebar.classList.add("collapsed");
    }
  }

  function openSidebar() {
    state.sidebarOpen = true;
    els.sidebar.classList.add("open");
    els.backdrop.hidden = false;
  }

  function closeSidebar() {
    state.sidebarOpen = false;
    els.sidebar.classList.remove("open");
    els.backdrop.hidden = true;
  }

  function toggleSidebarCollapse() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    els.sidebar.classList.toggle("collapsed", state.sidebarCollapsed);
    toast(state.sidebarCollapsed ? "تم طي الشريط الجانبي" : "تم توسيع الشريط الجانبي", "success");
  }

  function toast(message, type = "success") {
    els.toast.textContent = message;
    els.toast.className = `toast show ${type}`;
    clearTimeout(els.toast._timer);
    els.toast._timer = setTimeout(() => {
      els.toast.classList.remove("show");
    }, 2400);
  }

  function submitLogin(form) {
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "").trim();
    const user = state.users.find((item) => item.email.toLowerCase() === email && item.password === password);
    if (!user) {
      toast("بيانات الدخول غير صحيحة", "error");
      return;
    }
    state.currentUser = user.email;
    localStorage.setItem(STORAGE_KEYS.currentUser, user.email);
    ensureProgress(user.email);
    toast("تم تسجيل الدخول بنجاح", "success");
    navigate("#/dashboard");
    render();
  }

  function submitRegister(form) {
    const formData = new FormData(form);
    const user = {
      name: String(formData.get("name") || "").trim(),
      className: String(formData.get("className") || "").trim(),
      email: String(formData.get("email") || "").trim().toLowerCase(),
      password: String(formData.get("password") || "").trim(),
      createdAt: new Date().toISOString()
    };

    if (!user.name || !user.className || !user.email || !user.password) {
      toast("أكمل جميع الحقول أولًا", "error");
      return;
    }

    if (state.users.some((item) => item.email.toLowerCase() === user.email)) {
      toast("هذا البريد مستخدم بالفعل", "error");
      return;
    }

    state.users.unshift(user);
    saveUsers();
    state.currentUser = user.email;
    localStorage.setItem(STORAGE_KEYS.currentUser, user.email);
    ensureProgress(user.email);
    toast("تم إنشاء الحساب بنجاح", "success");
    navigate("#/dashboard");
    render();
  }

  function resetProgress() {
    if (!state.currentUser) return;
    const confirmText = "سيتم حذف التقدم والاختبارات لهذا الحساب. هل تريد المتابعة؟";
    if (!confirm(confirmText)) return;
    state.progressByUser[state.currentUser] = {
      completedLessons: [],
      lastLessonId: "",
      lessonMiniAnswers: {},
      quizHistory: []
    };
    saveProgress();
    toast("تمت إعادة ضبط التقدم", "success");
    render();
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEYS.currentUser);
    state.currentUser = "";
    toast("تم تسجيل الخروج", "success");
    navigate("#/home");
    render();
  }

  function handleGlobalSearch() {
    const query = (els.globalSearch.value || "").trim();
    if (!query) {
      navigate("#/search");
      return;
    }
    navigate(`#/search?query=${encodeURIComponent(query)}`);
    render();
  }

  function updateQuizControls() {
    const select = document.getElementById("quizUnitSelect");
    if (select) {
      select.addEventListener("change", () => {
        navigate(`#/quiz?unit=${encodeURIComponent(select.value)}`);
        state.quizSession = null;
        render();
      }, { once: true });
    }
  }

  function handleSearchFormSubmit(form) {
    const formData = new FormData(form);
    const query = String(formData.get("query") || "").trim();
    navigate(query ? `#/search?query=${encodeURIComponent(query)}` : "#/search");
    render();
  }

  function handleAppClick(event) {
    const target = event.target.closest("[data-action], a[href]");
    if (!target) return;
    const action = target.dataset.action;

    if (target.matches("a[href^='#/']")) {
      if (window.innerWidth <= 980) closeSidebar();
      return;
    }

    switch (action) {
      case "continue": {
        const lessonId = getContinueLessonId();
        if (!lessonId) return toast("لا توجد دروس متاحة حاليًا", "error");
        navigate(`#/lesson/${lessonId}`);
        render();
        break;
      }
      case "theme-toggle":
        toggleTheme();
        break;
      case "sidebar-toggle":
        openSidebar();
        break;
      case "mark-complete":
        markLessonComplete(target.dataset.lesson);
        break;
      case "mini-answer": {
        const lessonId = target.dataset.lesson;
        const choice = Number(target.dataset.choice);
        saveMiniAnswer(lessonId, choice);
        toast("تم حفظ إجابتك", "success");
        render();
        break;
      }
      case "start-test":
        state.quizSession = null;
        render();
        break;
      case "quiz-answer":
        answerQuiz(Number(target.dataset.index), Number(target.dataset.choice));
        break;
      case "reset-progress":
        resetProgress();
        break;
      case "logout":
        logout();
        break;
      default:
        break;
    }
  }

  function handleSubmit(event) {
    const form = event.target;
    if (form.id === "loginForm") {
      event.preventDefault();
      submitLogin(form);
    } else if (form.id === "registerForm") {
      event.preventDefault();
      submitRegister(form);
    } else if (form.id === "searchForm") {
      event.preventDefault();
      handleSearchFormSubmit(form);
    }
  }

  function bindEvents() {
    window.addEventListener("hashchange", () => {
      if (!state.booted) return;
      render();
    });

    document.addEventListener("click", handleAppClick);
    document.addEventListener("submit", handleSubmit);

    els.menuToggle.addEventListener("click", openSidebar);
    els.backdrop.addEventListener("click", closeSidebar);
    els.sidebarCollapseBtn.addEventListener("click", toggleSidebarCollapse);
    els.themeToggle.addEventListener("click", toggleTheme);
    els.searchGoBtn.addEventListener("click", handleGlobalSearch);
    els.globalSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleGlobalSearch();
      }
    });

    els.continueBtn.addEventListener("click", () => {
      const lessonId = getContinueLessonId();
      if (lessonId) navigate(`#/lesson/${lessonId}`);
      else navigate("#/home");
      render();
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSidebar();
    });
  }

  function boot() {
    try {
      state.data = loadAppData();
      initStorage();
      ensureProgress(state.currentUser);
      bindEvents();
      renderSidebar();
      renderInitialLoader();

      setTimeout(() => {
        state.booted = true;
        if (!location.hash) location.hash = "#/home";
        updateContinueButton();
        render();
      }, 220);
    } catch (error) {
      els.view.innerHTML = `
        <div class="card card-full">
          <div class="empty-state">
            <h3>تعذر تشغيل المنصة</h3>
            <p>${escapeHtml(error?.message || "حدث خطأ غير متوقع")}</p>
          </div>
        </div>
      `;
      console.error(error);
    }
  }

  boot();
})();
