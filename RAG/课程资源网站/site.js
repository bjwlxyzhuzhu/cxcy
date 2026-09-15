function basePath() {
  return document.body.dataset.base || "";
}

function withBase(href) {
  if (/^(https?:|mailto:|#|\.\.\/)/.test(href)) return href;
  return `${basePath()}${href}`;
}

function iconPath() {
  return `${basePath()}assets/icons.svg`;
}

const navItems = [
  ["首页", "index.html", "home"],
  ["课程介绍", "course.html", "course"],
  ["教学团队", "team.html", "team"],
  ["课程资源", "resources.html", "resources"],
  ["AI实践", "practice.html", "practice"],
  ["产业案例", "cases.html", "cases"],
  ["学生成果", "results.html", "results"],
  ["联系我们", "team.html#contact", "contact"]
];

function icon(id, className = "icon") {
  return `<svg class="${className}" aria-hidden="true"><use href="${iconPath()}#${id}"></use></svg>`;
}

function renderHeader() {
  const mount = document.getElementById("site-header");
  if (!mount) return;
  const page = document.body.dataset.page || "home";
  const nav = navItems.map(([label, href, key]) => {
    const active = page === key || (page === "team" && key === "contact" && location.hash === "#contact");
    return `<a href="${withBase(href)}" class="${active ? "active" : ""}">${label}</a>`;
  }).join("");
  mount.innerHTML = `
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="${withBase("index.html")}" aria-label="返回首页">
          <span class="brand-mark">BJ</span>
          <span class="brand-title">
            <strong>宝鸡文理学院</strong>
            <span>计算机学院 | 创新创业基础精品课程</span>
          </span>
        </a>
        <nav class="main-nav" aria-label="主导航">${nav}</nav>
        <div class="header-actions">
          <label class="search-box">
            <span class="sr-only">搜索课程资源</span>
            <input class="site-search" type="search" placeholder="搜索课程资源..." autocomplete="off">
            ${icon("search")}
          </label>
          <button class="nav-toggle" type="button" aria-label="展开导航" aria-expanded="false"><span></span></button>
        </div>
      </div>
    </header>
  `;
}

function renderFooter() {
  const mount = document.getElementById("site-footer");
  if (!mount) return;
  mount.innerHTML = `
    <footer class="site-footer">
      <div class="container">
        <div>
          <div class="footer-title">融德·知行·AI+《创新创业基础》精品课件</div>
          <div>理论建构、实践任务、在线测评、AI赋能与竞赛转化的一体化课程资源。</div>
        </div>
        <div>资源建设周期：2023.09 - 2026.05 | 负责人：朱丽叶</div>
      </div>
    </footer>
  `;
}

function bindNavigation() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
}

function bindSearch() {
  const input = document.querySelector(".site-search");
  if (!input) return;

  const searchableCards = () => Array.from(document.querySelectorAll("[data-search-text]"));
  const applyFilter = (term) => {
    const cards = searchableCards();
    if (!cards.length) return false;
    const keyword = term.trim().toLowerCase();
    cards.forEach((card) => {
      const text = card.dataset.searchText.toLowerCase();
      card.classList.toggle("hidden", keyword && !text.includes(keyword));
    });
    const visibleCount = cards.filter((card) => !card.classList.contains("hidden")).length;
    const empty = document.querySelector(".empty-note");
    if (empty) empty.classList.toggle("show", visibleCount === 0);
    return true;
  };

  const pending = sessionStorage.getItem("courseResourceSearch");
  if (pending) {
    input.value = pending;
    sessionStorage.removeItem("courseResourceSearch");
    setTimeout(() => applyFilter(pending), 40);
  }

  input.addEventListener("input", () => applyFilter(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (!applyFilter(input.value)) {
      sessionStorage.setItem("courseResourceSearch", input.value);
      location.href = withBase("resources.html");
    }
  });
}

function bindCaseFilters() {
  const buttons = Array.from(document.querySelectorAll("[data-case-filter]"));
  const cards = Array.from(document.querySelectorAll("[data-case-category]"));
  if (!buttons.length || !cards.length) return;
  const empty = document.querySelector(".empty-note");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.caseFilter;
      buttons.forEach((item) => item.classList.toggle("active", item === button));
      let visible = 0;
      cards.forEach((card) => {
        const categories = card.dataset.caseCategory.split(" ");
        const show = filter === "all" || categories.includes(filter);
        card.classList.toggle("hidden", !show);
        if (show) visible += 1;
      });
      if (empty) empty.classList.toggle("show", visible === 0);
    });
  });
}

function bindTabs() {
  const tabButtons = Array.from(document.querySelectorAll("[data-tab-target]"));
  if (!tabButtons.length) return;
  const panels = Array.from(document.querySelectorAll("[data-tab-panel]"));
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.tabTarget;
      tabButtons.forEach((item) => item.classList.toggle("active", item === button));
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.tabPanel !== target;
      });
    });
  });
}

function animateCounters() {
  const counters = Array.from(document.querySelectorAll("[data-count-to]"));
  if (!counters.length) return;
  counters.forEach((el) => {
    const target = Number(el.dataset.countTo);
    const suffix = el.dataset.countSuffix || "";
    el.textContent = target.toLocaleString("zh-CN") + suffix;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderHeader();
  renderFooter();
  bindNavigation();
  bindSearch();
  bindCaseFilters();
  bindTabs();
  animateCounters();
});
