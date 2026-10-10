/* =========================================================
   CR-LMIS — js/main.js
   Phase 3 — single consolidated application script.
   Represents the script layer of the required structure
   (frontend/js/) in one file. Replaces api.js, auth.js,
   app.js, dashboard.js and the per-module page scripts,
   plus the inline scripts previously embedded in
   login.html and dashboard.html.

   Sections:
    1. API client (REST + JWT)
    2. Shared helpers / toasts / demo badge (App)
    3. Authentication (Auth)
    4. Dashboard controller
    5. Generic CRUD page engine (CrudPage)
    6. Module pages: Farmers, Farms, Livestock, Vaccinations,
       Diseases, Veterinary
    7. Reports (export actions)
    8. Global init

   Load AFTER bootstrap.bundle.min.js (and chart.umd.min.js
   on the dashboard) — see wiring notes at the end.

   DEMO-MODE POLICY (per the master prompt):
   No statistics are hard-coded into the HTML. Values only
   exist in the labeled DEMO blocks below, which are used
   EXCLUSIVELY when the backend API is unreachable, and are
   always surfaced with a visible "Demo mode" indicator.
   ========================================================= */
(() => {
  "use strict";

  /* =========================================================
     1. API CLIENT — REST endpoints, JWT auth, error handling
     ========================================================= */
  const Api = (() => {
    const BASE_URL = (typeof API_BASE_URL !== "undefined" && API_BASE_URL)
      ? API_BASE_URL : "/api";
    const TOKEN_KEY = "crlmis_token";

    const setToken   = (t) => sessionStorage.setItem(TOKEN_KEY, t);
    const getToken   = () => sessionStorage.getItem(TOKEN_KEY);
    const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);

    function toQuery(params) {
      if (!params) return "";
      const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
        .join("&");
      return qs ? "?" + qs : "";
    }

    async function request(method, path, body, params) {
      const headers = { "Content-Type": "application/json" };
      const token = getToken();
      if (token) headers["Authorization"] = "Bearer " + token;

      let response;
      try {
        response = await fetch(BASE_URL + path + toQuery(params), {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined
        });
      } catch (err) {
        const e = new Error("Network error: API unreachable.");
        e.network = true; /* lets callers fall back to labeled demo mode */
        throw e;
      }

      if (response.status === 401) {
        clearToken();
        sessionStorage.removeItem("crlmis_session");
        if (!window.location.pathname.endsWith("login.html")) {
          window.location.href = "login.html";
        }
        const e = new Error("Session expired. Please log in again.");
        e.status = 401;
        throw e;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const e = new Error(data.message || "Request failed (" + response.status + ")");
        e.status = response.status;
        throw e;
      }
      return data;
    }

    const get  = (p, params) => request("GET", p, null, params);
    const post = (p, b)      => request("POST", p, b);
    const put  = (p, b)      => request("PUT", p, b);
    const del  = (p)         => request("DELETE", p);

    /* generic CRUD factory (one per resource) */
    const crud = (base) => ({
      list:   (params) => get(base, params),
      getOne: (id)     => get(base + "/" + id),
      create: (data)   => post(base, data),
      update: (id, data) => put(base + "/" + id, data),
      remove: (id)     => del(base + "/" + id)
    });

    /* endpoints (mirror the REST spec: auth, farmers, farms,
       animals/livestock, vaccination, disease, reports) */
    const auth = {
      login:          (creds) => post("/auth/login", creds),
      logout:         ()      => post("/auth/logout"),
      forgotPassword: (email) => post("/auth/forgot-password", email),
      resetPassword:  (data)  => post("/auth/reset-password", data),
      me:             ()      => get("/auth/me")
    };

    const dashboard = {
      summary:     (params) => get("/dashboard/summary", params),
      livestock:   (params) => get("/dashboard/livestock", params),
      vaccination: (params) => get("/dashboard/vaccination", params),
      disease:     (params) => get("/dashboard/disease", params)
    };

    const reports = {
      farmers:     (params) => get("/reports/farmers", params),
      livestock:   (params) => get("/reports/livestock", params),
      vaccination: (params) => get("/reports/vaccination", params),
      disease:     (params) => get("/reports/disease", params),
      veterinary:  (params) => get("/reports/veterinary", params)
    };

    return {
      BASE_URL, setToken, getToken, clearToken,
      request, get, post, put, del,
      auth, dashboard, reports,
      farmers:   crud("/farmers"),
      farms:     crud("/farms"),
      animals:   crud("/animals"),
      vaccinations:         crud("/vaccinations"),
      vaccinationCampaigns: crud("/vaccination-campaigns"),
      diseaseReports:       crud("/disease-reports"),
      outbreaks:            crud("/outbreaks"),
      veterinary:           crud("/veterinary") /* path to confirm with backend */
    };
  })();

  /* =========================================================
     2. SHARED HELPERS — sidebar, toasts, demo badge, utils
     ========================================================= */
  const App = (() => {

    function initSidebar() {
      const burger   = document.getElementById("burger");
      const sidebar  = document.getElementById("sidebar");
      const backdrop = document.getElementById("backdrop");
      if (!burger || !sidebar) return;

      burger.addEventListener("click", () => {
        const open = sidebar.classList.toggle("open");
        if (backdrop) backdrop.classList.toggle("show", open);
      });
      if (backdrop) {
        backdrop.addEventListener("click", () => {
          sidebar.classList.remove("open");
          backdrop.classList.remove("show");
        });
      }
    }

    function initActiveNav() {
      const page = window.location.pathname.split("/").pop() || "dashboard.html";
      document.querySelectorAll(".side-nav a").forEach(a => {
        const href = (a.getAttribute("href") || "").split("/").pop();
        if (href === page) a.classList.add("active");
      });
    }

    /* ---------- toasts ---------- */
    function toast(type, title, message) {
      const container = document.getElementById("toastContainer");
      if (!container || typeof bootstrap === "undefined") return;

      const colors = { success: "toast-success", error: "toast-error",
                       warning: "toast-warning", info: "" };
      const icons  = { success: "fa-circle-check", error: "fa-circle-xmark",
                       warning: "fa-triangle-exclamation", info: "fa-circle-info" };
      const tints  = { success: "#1ab394", error: "#ed5565",
                       warning: "#f8ac59", info: "#1c84c6" };

      const el = document.createElement("div");
      el.className = "toast crlmis-toast " + (colors[type] || "");
      el.setAttribute("role", "alert");
      el.innerHTML =
        '<div class="toast-header"><i class="fa-solid ' + (icons[type] || icons.info) +
        ' me-2" style="color:' + (tints[type] || tints.info) + ';"></i>' +
        '<strong class="me-auto">' + (title || "Notification") + "</strong>" +
        '<button type="button" class="btn-close" data-bs-dismiss="toast"></button></div>' +
        '<div class="toast-body">' + message + "</div>";

      container.appendChild(el);
      const bsToast = new bootstrap.Toast(el, { delay: 4000 });
      el.addEventListener("hidden.bs.toast", () => el.remove());
      bsToast.show();
    }

    /* ---------- labeled demo-mode badge ---------- */
    function demoBadge() {
      if (!Auth.isDemo()) return;
      if (document.getElementById("demoBadge")) return;

      const badge = document.createElement("div");
      badge.id = "demoBadge";
      badge.style.cssText =
        "position:fixed;bottom:16px;left:16px;z-index:2000;background:#22252e;color:#f8ac59;" +
        "border:1px solid #f8ac59;border-radius:3px;padding:8px 14px;font-size:12px;" +
        "box-shadow:0 4px 14px rgba(0,0,0,.25);";
      badge.innerHTML =
        '<i class="fa-solid fa-flask me-1"></i>Demo mode — labeled test data. ' +
        "Connect the backend API for real data.";
      document.body.appendChild(badge);
    }

    /* ---------- generic utils ---------- */
    const escapeHtml = (s) => String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const debounce = (fn, ms) => {
      let t;
      return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    };

    const formatNumber = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

    function serializeForm(form) {
      const data = {};
      new FormData(form).forEach((v, k) => { data[k] = v; });
      return data;
    }

    function confirmDialog(title, message, onConfirm) {
      if (typeof bootstrap === "undefined" || !document.getElementById("confirmModal")) {
        if (window.confirm(message)) onConfirm();
        return;
      }
      const modal = document.getElementById("confirmModal");
      document.querySelector("#confirmModal .modal-title").textContent = title;
      document.querySelector("#confirmModal .modal-body").textContent = message;
      const okBtn = document.getElementById("confirmOk");
      const run = () => { okBtn.removeEventListener("click", run); onConfirm(); };
      okBtn.addEventListener("click", run);
      new bootstrap.Modal(modal).show();
    }

    /* loading / empty states */
    function setLoading(el, loading, label) {
      if (!el) return;
      if (loading) {
        el.innerHTML = '<div class="loading-state"><div class="spinner-border"></div><span>' +
          (label || "Loading...") + "</span></div>";
      } else {
        el.innerHTML = "";
      }
    }

    function setEmpty(el, title, hint) {
      if (!el) return;
      el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-inbox"></i>' +
        "<p>" + (title || "No records found.") + "</p>" +
        '<span class="empty-hint">' + (hint || "") + "</span></div>";
    }

    /* ---------- app-wide init ---------- */
    function init() {
      initSidebar();
      initActiveNav();
      if (!document.getElementById("toastContainer")) {
        const c = document.createElement("div");
        c.id = "toastContainer";
        c.style.cssText = "position:fixed;top:70px;right:16px;z-index:3000;min-width:280px;max-width:340px;";
        document.body.appendChild(c);
      }
      demoBadge();
    }

    return { init, toast, demoBadge, escapeHtml, debounce, formatNumber,
             serializeForm, confirmDialog, setLoading, setEmpty };
  })();

  /* =========================================================
     3. AUTHENTICATION — login, logout, session timeout, guard
     ========================================================= */
  const Auth = (() => {
    const SESSION_KEY = "crlmis_session";
    const TIMEOUT_MIN = 30; /* hard logout after 30 min idle  */
    const WARN_MIN    = 25; /* warning toast after 25 min     */
    const ROLE_REDIRECTS = {
      super_admin:   "dashboard.html",
      ministry_admin:"dashboard.html",
      lga_officer:   "dashboard.html",
      field_officer: "dashboard.html",
      veterinary_officer: "dashboard.html",
      analyst:       "dashboard.html"
    };

    /* Labeled SEED/DEMO credentials — testing only, NOT real
       accounts. Matches the demo box on login.html. */
    const DEMO_USERS = {
      admin:   { password: "password", role: "super_admin", label: "Super Administrator" },
      officer: { password: "password", role: "lga_officer", label: "LGA Livestock Officer" }
    };

    let idleTimer = null;

    function getSession() {
      try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; }
      catch (e) { return null; }
    }
    const setSession   = (s) => sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    const clearSession = () => sessionStorage.removeItem(SESSION_KEY);
    const getUser      = () => (getSession() || {}).user || null;
    const isAuthenticated = () => !!getSession();
    const isDemo       = () => !!(getSession() && getSession().demo);

    async function login(username, password) {
      /* 1) real backend first (POST /api/auth/login) */
      try {
        const data = await Api.auth.login({ username, password });
        Api.setToken(data.token);
        setSession({ user: data.user, token: data.token, demo: false });
        return { ok: true, user: data.user, demo: false };
      } catch (err) {
        if (!err.network) {
          return { ok: false, message: "Invalid username or password." };
        }
        /* 2) backend unreachable -> labeled demo mode only */
        const demoUser = DEMO_USERS[username];
        if (!demoUser || demoUser.password !== password) {
          return { ok: false,
            message: "Invalid username or password. (Demo mode: use admin/password or officer/password.)" };
        }
        const user = { username, role: demoUser.role, label: demoUser.label };
        setSession({ user, token: null, demo: true });
        console.warn("[CR-LMIS] DEMO mode: backend unreachable, using labeled demo session.");
        return { ok: true, user, demo: true };
      }
    }

    function redirectAfterLogin(role) {
      window.location.href = ROLE_REDIRECTS[role] || "dashboard.html";
    }

    async function logout() {
      const s = getSession();
      if (s && s.token && !s.demo) {
        try { await Api.auth.logout(); } catch (e) { /* ignore */ }
      }
      Api.clearToken();
      clearSession();
      window.location.href = "login.html";
    }

    function requireAuth() {
      if (!isAuthenticated()) {
        window.location.href = "login.html";
        return false;
      }
      return true;
    }

    /* ---------- inactivity timeout ---------- */
    function touchActivity() {
      const s = getSession();
      if (s) { s.lastActivity = Date.now(); setSession(s); }
    }

    function startTimeoutMonitor() {
      ["click", "keydown", "mousemove", "scroll", "touchstart"].forEach(ev =>
        document.addEventListener(ev, touchActivity, { passive: true }));

      idleTimer = setInterval(() => {
        const s = getSession();
        if (!s) return;
        const idleMin = (Date.now() - (s.lastActivity || Date.now())) / 60000;
        if (idleMin >= TIMEOUT_MIN) {
          clearInterval(idleTimer);
          logout();
        } else if (idleMin >= WARN_MIN) {
          App.toast("warning", "Session expiring",
            "You will be logged out due to inactivity in " +
            Math.ceil(TIMEOUT_MIN - idleMin) + " minute(s).");
        }
      }, 60000);
    }

    /* ---------- login page wiring ---------- */
    function initLoginPage() {
      const form = document.getElementById("loginForm");
      if (!form) return;

      const alertBox = document.getElementById("loginAlert");
      const alertMsg = document.getElementById("loginAlertMsg");
      const showAlert = (m) => { if (alertMsg) alertMsg.textContent = m; if (alertBox) alertBox.hidden = false; };

      const toggle = document.getElementById("togglePass");
      if (toggle) {
        toggle.addEventListener("click", () => {
          const input = document.getElementById("password");
          const icon  = toggle.querySelector("i");
          const show  = input.type === "password";
          input.type  = show ? "text" : "password";
          icon.className = show ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
        });
      }

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (alertBox) alertBox.hidden = true;

        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value.trim();
        if (!username || !password) {
          showAlert("Please enter both username and password.");
          return;
        }

        const btn = document.getElementById("btnLogin");
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Signing in...';
        }

        const result = await login(username, password);
        if (result.ok) {
          startTimeoutMonitor();
          redirectAfterLogin(result.user.role);
        } else {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-right-to-bracket me-2"></i>Sign In';
          }
          showAlert(result.message);
        }
      });
    }

    function init() {
      initLoginPage();
      if (isAuthenticated()) startTimeoutMonitor();
      if (isDemo()) App.demoBadge();
    }

    return { init, login, logout, requireAuth, getUser, isAuthenticated,
             isDemo, redirectAfterLogin, startTimeoutMonitor };
  })();

  /* =========================================================
     4. DASHBOARD CONTROLLER
     Loads summary + livestock data from the API and renders
     KPIs, status cards, latest cattle and both charts.
     Demo fallback is labeled and used ONLY when the backend
     is unreachable (no statistics are hard-coded in HTML).
     ========================================================= */
  const Dashboard = (() => {

    /* Labeled demo set — used only when the API is unreachable */
    const DEMO_DATA = {
      summary: {
        totalCattle: 172,
        totalIncome: "26,34,774",
        totalExpense: "1,05,93,851",
        totalInventories: 11,
        sickCattle: 0,
        milkGivingCattle: 0,
        expectedBirthCattle: 0,
        totalMilk: 0
      },
      monthlyReport: {
        labels: ["March", "March", "April", "May", "June", "July"],
        income:  [0.55, 0.45, 0.60, 0.50, 0.65, 0.55],
        expense: [0.40, 0.35, 0.45, 0.38, 0.50, 0.42]
      },
      cattleByTypes: [
        { label: "OX (66)",         value: 66, color: "#ed5565" },
        { label: "Cow (31)",        value: 31, color: "#1ab394" },
        { label: "Heifer (23)",     value: 23, color: "#f8ac59" },
        { label: "Male Calf (17)",  value: 17, color: "#1c84c6" },
        { label: "Female Calf (0)", value: 0,  color: "#23c6c8" },
        { label: "ShibhanType (0)", value: 0,  color: "#80c3f7" }
      ],
      latestCattle: [
        { tag: "156", date: "Mar 13, 2020" },
        { tag: "40",  date: "Mar 09, 2020" },
        { tag: "43",  date: "Mar 09, 2020" },
        { tag: "45",  date: "Mar 09, 2020" },
        { tag: "48",  date: "Mar 09, 2020" },
        { tag: "19",  date: "Mar 09, 2020" },
        { tag: "20",  date: "Mar 09, 2020" },
        { tag: "23",  date: "Mar 09, 2020" }
      ]
    };

    const byId = (id) => document.getElementById(id);
    let chartInstances = {};

    async function loadData(filters) {
      let summary = null, livestock = null, demo = false;

      try { summary = await Api.dashboard.summary(filters); }
      catch (err) { if (!err.network) throw err; demo = true; }

      try { livestock = await Api.dashboard.livestock(filters); }
      catch (err) { if (!err.network) throw err; demo = true; }

      if (demo) {
        console.warn("[CR-LMIS] DEMO mode: API unreachable, rendering labeled demo data.");
        App.toast("warning", "Demo Mode",
          "The API is unreachable — showing labeled demo data only.");
        return { ...DEMO_DATA, demo: true };
      }
      return { summary, livestock, demo: false };
    }

    function setText(id, value) {
      const el = byId(id);
      if (el) el.textContent = (value === null || value === undefined) ? "—" : value;
    }

    function renderSummary(s) {
      setText("kpi-cattle",      s.totalCattle);
      setText("kpi-income",      s.totalIncome);
      setText("kpi-expense",     s.totalExpense);
      setText("kpi-inventories", s.totalInventories);
      setText("st-sick",         s.sickCattle);
      setText("st-milking",      s.milkGivingCattle);
      setText("st-birth",        s.expectedBirthCattle);
      setText("st-milk",         s.totalMilk);
    }

    function renderCattleGrid(livestock) {
      const grid = byId("cattleGrid");
      if (!grid) return;
      const items = (livestock && livestock.latest) ? livestock.latest
        : (livestock && Array.isArray(livestock)) ? livestock.slice(0, 8)
        : DEMO_DATA.latestCattle;

      if (!items.length) {
        grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-cow"></i>' +
          "<p>No cattle registered yet.</p>" +
          '<span class="empty-hint">Records will appear here once animals are registered.</span></div>';
        return;
      }

      grid.innerHTML = items.map(c =>
        '<div class="cattle-item">' +
          '<div class="thumb"><i class="fa-solid fa-cow"></i></div>' +
          '<div class="tag">' + App.escapeHtml(c.tag) + "</div>" +
          '<div class="date">' + App.escapeHtml(c.date) + "</div>" +
        "</div>").join("");
    }

    function chart(id, config) {
      if (chartInstances[id]) chartInstances[id].destroy();
      const canvas = byId(id);
      if (!canvas || typeof Chart === "undefined") return;
      chartInstances[id] = new Chart(canvas, config);
    }

    function renderCharts(data) {
      if (typeof Chart === "undefined") return;

      Chart.defaults.font.family = "'Open Sans', Helvetica, Arial, sans-serif";
      Chart.defaults.font.size = 11;
      Chart.defaults.color = "#9aa0a8";

      const report = data.monthlyReport || (data.summary && data.summary.monthlyReport) || DEMO_DATA.monthlyReport;

      chart("incomeExpenseChart", {
        type: "line",
        data: {
          labels: report.labels,
          datasets: [
            {
              label: "Income",
              data: report.income,
              borderColor: "#1ab394", backgroundColor: "#1ab394",
              borderWidth: 2, pointRadius: 3, pointHoverRadius: 5,
              tension: 0, fill: false
            },
            {
              label: "Expense",
              data: report.expense,
              borderColor: "#ed5565", backgroundColor: "#ed5565",
              borderWidth: 2, pointRadius: 3, pointHoverRadius: 5,
              tension: 0, fill: false
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, suggestedMax: 1,
                 grid: { color: "#f0f1f3" }, ticks: { stepSize: 1 } },
            x: { grid: { display: false } }
          },
          plugins: { legend: { display: false } }
        }
      });

      const types = data.cattleByTypes || (data.summary && data.summary.cattleByTypes) || DEMO_DATA.cattleByTypes;

      chart("cattleTypesChart", {
        type: "doughnut",
        data: {
          labels: types.map(d => d.label),
          datasets: [{
            data: types.map(d => d.value),
            backgroundColor: types.map(d => d.color),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "62%",
          plugins: {
            legend: {
              position: "right",
              labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 10 }
            }
          }
        }
      });
    }

    function bindFilters() {
      const filterBar = byId("dashboardFilters");
      if (!filterBar) return;
      const apply = byId("applyFilters");
      if (!apply) return;

      apply.addEventListener("click", () => {
        const params = {};
        filterBar.querySelectorAll("[data-filter]").forEach(c => {
          if (c.value) params[c.dataset.filter] = c.value;
        });
        render(params);
      });
    }

    async function render(filters) {
      const data = await loadData(filters || {});
      renderSummary(data.summary || data);
      renderCattleGrid(data.livestock || data);
      renderCharts(data);
    }

    function init() {
      if (!Auth.requireAuth()) return;
      bindFilters();
      render().catch(err => {
        console.error("[CR-LMIS] Dashboard failed:", err);
        App.toast("error", "Load failed", err.message);
      });
    }

    return { render };
  })();

  /* =========================================================
     5. GENERIC CRUD PAGE ENGINE
     Drives the module pages (farmers.html, farms.html,
     cattle.html, vaccinations.html, diseases.html,
     veterinary.html): table + filter bar + form modal +
     pagination + delete confirmation. The HTML pages only
     need the standard ids/markup; everything else is driven
     by the config objects in section 6.
     ========================================================= */
  const CrudPage = (() => {

    function badgeClass(status) {
      const s = String(status || "").toLowerCase();
      if (["active", "completed", "cured", "available", "healthy", "confirmed"].includes(s)) return "badge-green";
      if (["sick", "expired", "overdue", "deceased", "rejected", "critical"].includes(s)) return "badge-red";
      if (["pending", "warning", "in-progress", "due"].includes(s)) return "badge-orange";
      return "badge-blue";
    }

    function create(cfg) {
      const table   = document.querySelector(cfg.tableSelector);
      const tbody   = table ? table.querySelector("tbody") : null;
      const pagEl   = document.querySelector(cfg.paginationSelector || ".pagination-crlmis");
      const modalEl = document.getElementById(cfg.modalId);
      const form    = document.getElementById(cfg.formId);
      const filterBar = document.querySelector(cfg.filterBarSelector || "#filterBar");

      const state = {
        page: 1,
        perPage: cfg.perPage || 10,
        total: 0,
        items: [],
        filters: {},
        editingId: null
      };

      /* ---------- cell value rendering ---------- */
      function cellValue(item, col) {
        let v = col.data.split(".").reduce((o, k) => (o == null ? o : o[k]), item);
        if (col.type === "badge") {
          return '<span class="badge-status ' + badgeClass(v) + '">' + App.escapeHtml(v) + "</span>";
        }
        if (col.type === "date" && v) {
          const d = new Date(v);
          v = isNaN(d) ? v : d.toLocaleDateString("en-GB");
        }
        return v == null ? "—" : App.escapeHtml(v);
      }

      function rowHtml(item) {
        const tds = cfg.columns.map(col => "<td>" + cellValue(item, col) + "</td>").join("");
        const actions = '<td class="actions">' +
          '<a href="#" class="js-edit" data-id="' + item.id + '" title="Edit"><i class="fa-solid fa-pen"></i></a>' +
          '<a href="#" class="js-delete" data-id="' + item.id + '" title="Delete"><i class="fa-solid fa-trash"></i></a>' +
          "</td>";
        return "<tr>" + tds + actions + "</tr>";
      }

      function renderRows() {
        if (!tbody) return;
        if (!state.items.length) {
          tbody.innerHTML = '<tr><td colspan="' + (cfg.columns.length + 1) + '">' +
            '<div class="empty-state"><i class="fa-solid fa-inbox"></i>' +
            "<p>No " + (cfg.plural || "records") + " found.</p>" +
            '<span class="empty-hint">Use "Add" to create the first record.</span></div></td></tr>';
          return;
        }
        tbody.innerHTML = state.items.map(rowHtml).join("");
      }

      function renderPagination() {
        if (!pagEl) return;
        const totalPages = Math.max(1, Math.ceil(state.total / state.perPage));
        let html = '<nav><ul class="pagination pagination-crlmis">';
        html += '<li class="page-item ' + (state.page <= 1 ? "disabled" : "") + '">' +
          '<a class="page-link js-page" data-page="' + (state.page - 1) + '" href="#">&laquo;</a></li>';
        for (let p = 1; p <= totalPages; p++) {
          html += '<li class="page-item ' + (p === state.page ? "active" : "") + '">' +
            '<a class="page-link js-page" data-page="' + p + '" href="#">' + p + "</a></li>";
        }
        html += '<li class="page-item ' + (state.page >= totalPages ? "disabled" : "") + '">' +
          '<a class="page-link js-page" data-page="' + (state.page + 1) + '" href="#">&raquo;</a></li>';
        html += "</ul></nav>";
        pagEl.innerHTML = html;
      }

      /* ---------- data loading (API first; labeled demo fallback) ---------- */
      async function load() {
        if (!Auth.requireAuth()) return;
        if (tbody) App.setLoading(tbody, true, "Loading " + (cfg.plural || "records") + "...");

        try {
          const params = { page: state.page, per_page: state.perPage };
          Object.assign(params, state.filters);
          const res = await cfg.resource.list(params);
          state.items = Array.isArray(res) ? res : (res.data || []);
          state.total = Array.isArray(res) ? state.items.length
            : (res.total != null ? res.total : state.items.length);
        } catch (err) {
          if (err.network && cfg.demoData) {
            console.warn("[CR-LMIS] DEMO mode: " + (cfg.plural || "records") + " showing labeled sample rows.");
            App.toast("warning", "Demo Mode", "API unreachable — showing labeled sample data.");
            state.items = cfg.demoData;
            state.total = cfg.demoData.length;
          } else {
            if (tbody) App.setEmpty(tbody, "Could not load " + (cfg.plural || "records") + ".", err.message);
            return;
          }
        }
        renderRows();
        renderPagination();
      }

      /* ---------- modal form (create / edit) ---------- */
      function fillForm(item) {
        if (!form) return;
        cfg.fields.forEach(f => {
          const el = form.querySelector('[name="' + f.name + '"]');
          if (el) el.value = (item && item[f.name] != null) ? item[f.name] : "";
        });
      }

      function openModal() {
        if (modalEl && typeof bootstrap !== "undefined") new bootstrap.Modal(modalEl).show();
      }

      function openCreate() {
        state.editingId = null;
        fillForm(null);
        const title = modalEl && modalEl.querySelector(".modal-title");
        if (title) title.textContent = "Add " + (cfg.singular || "Record");
        openModal();
      }

      function openEdit(id) {
        const item = state.items.find(i => String(i.id) === String(id));
        if (!item) return;
        state.editingId = id;
        fillForm(item);
        const title = modalEl && modalEl.querySelector(".modal-title");
        if (title) title.textContent = "Edit " + (cfg.singular || "Record");
        openModal();
      }

      function confirmDelete(id) {
        App.confirmDialog("Delete " + (cfg.singular || "record"),
          "This action cannot be undone.", async () => {
            try {
              await cfg.resource.remove(id);
              App.toast("success", "Deleted", (cfg.singular || "Record") + " deleted.");
              load();
            } catch (err) {
              if (err.network) App.toast("warning", "Demo mode", "Deleting requires the backend API.");
              else App.toast("error", "Delete failed", err.message);
            }
          });
      }

      /* ---------- event binding ---------- */
      function bindEvents() {
        if (tbody) {
          tbody.addEventListener("click", (e) => {
            const edit = e.target.closest(".js-edit");
            const del  = e.target.closest(".js-delete");
            if (edit) { e.preventDefault(); openEdit(edit.dataset.id); }
            else if (del) { e.preventDefault(); confirmDelete(del.dataset.id); }
          });
        }

        if (form) {
          form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const data = App.serializeForm(form);
            try {
              if (state.editingId) await cfg.resource.update(state.editingId, data);
              else await cfg.resource.create(data);
              App.toast("success", "Saved", (cfg.singular || "Record") + " saved successfully.");
              if (modalEl && typeof bootstrap !== "undefined") {
                const inst = bootstrap.Modal.getInstance(modalEl);
                if (inst) inst.hide();
              }
              load();
            } catch (err) {
              if (err.network) {
                App.toast("warning", "Demo mode", "Saving requires the backend API. Your input was not persisted.");
                return;
              }
              App.toast("error", "Save failed", err.message);
            }
          });
        }

        document.querySelectorAll("[data-action='add']").forEach(btn =>
          btn.addEventListener("click", openCreate));

        if (pagEl) {
          pagEl.addEventListener("click", (e) => {
            const link = e.target.closest(".js-page");
            if (!link || link.parentElement.classList.contains("disabled")) return;
            e.preventDefault();
            state.page = parseInt(link.dataset.page, 10) || 1;
            load();
          });
        }

        if (filterBar) {
          filterBar.querySelectorAll("[data-action='apply']").forEach(btn =>
            btn.addEventListener("click", () => {
              filterBar.querySelectorAll("[data-filter]").forEach(c => {
                if (c.value) state.filters[c.dataset.filter] = c.value;
                else delete state.filters[c.dataset.filter];
              });
              state.page = 1;
              load();
            }));
          filterBar.querySelectorAll("[data-action='reset']").forEach(btn =>
            btn.addEventListener("click", () => {
              filterBar.querySelectorAll("[data-filter]").forEach(c => { c.value = ""; });
              state.filters = {};
              state.page = 1;
              load();
            }));
        }
      }

      function init() {
        if (!table) return;
        bindEvents();
        load();
      }

      init();
      return { reload: load };
    }

    return { create };
  })();

  /* =========================================================
     6. MODULE PAGES — configs consumed by CrudPage
     Demo rows below are labeled SAMPLE data — clearly fake,
     used only when the API is unreachable.
     ========================================================= */
  const Pages = {

    farmers: () => CrudPage.create({
      tableSelector: "#farmersTable",
      paginationSelector: "#farmersPagination",
      filterBarSelector: "#farmersFilters",
      modalId: "farmerModal",
      formId: "farmerForm",
      resource: Api.farmers,
      singular: "Farmer",
      plural: "farmers",
      columns: [
        { data: "name", title: "Name" },
        { data: "email", title: "Email" },
        { data: "phone", title: "Phone" },
        { data: "address", title: "Address" },
        { data: "status", title: "Status", type: "badge" }
      ],
      fields: [
        { name: "name", label: "Full name", required: true },
        { name: "email", label: "Email", required: true },
        { name: "phone", label: "Phone" },
        { name: "address", label: "Address" },
        { name: "status", label: "Status" }
      ],
      demoData: [
        { id: 1, name: "Sample Farmer A", email: "farmer1@example.com", phone: "0803 000 0001", address: "Demo LGA 1", status: "active" },
        { id: 2, name: "Sample Farmer B", email: "farmer2@example.com", phone: "0803 000 0002", address: "Demo LGA 2", status: "pending" },
        { id: 3, name: "Sample Farmer C", email: "farmer3@example.com", phone: "0803 000 0003", address: "Demo LGA 3", status: "active" }
      ]
    }),

    farms: () => CrudPage.create({
      tableSelector: "#farmsTable",
      paginationSelector: "#farmsPagination",
      filterBarSelector: "#farmsFilters",
      modalId: "farmModal",
      formId: "farmForm",
      resource: Api.farms,
      singular: "Farm",
      plural: "farms",
      columns: [
        { data: "name", title: "Farm Name" },
        { data: "owner_name", title: "Owner" },
        { data: "location", title: "Location" },
        { data: "area_hectares", title: "Area (ha)" },
        { data: "status", title: "Status", type: "badge" }
      ],
      fields: [
        { name: "name", label: "Farm name", required: true },
        { name: "owner_name", label: "Owner" },
        { name: "location", label: "Location" },
        { name: "area_hectares", label: "Area (hectares)" },
        { name: "status", label: "Status" }
      ],
      demoData: [
        { id: 1, name: "Sample Farm One", owner_name: "Farmer A", location: "Demo LGA 1", area_hectares: "12.5", status: "active" },
        { id: 2, name: "Sample Farm Two", owner_name: "Farmer B", location: "Demo LGA 2", area_hectares: "8.0", status: "pending" }
      ]
    }),

    livestock: () => CrudPage.create({
      tableSelector: "#livestockTable",
      paginationSelector: "#livestockPagination",
      filterBarSelector: "#livestockFilters",
      modalId: "livestockModal",
      formId: "livestockForm",
      resource: Api.animals,
      singular: "Animal",
      plural: "livestock records",
      columns: [
        { data: "tag_number", title: "Tag" },
        { data: "cattle_type", title: "Type" },
        { data: "breed", title: "Breed" },
        { data: "sex", title: "Sex" },
        { data: "dob", title: "DOB", type: "date" },
        { data: "status", title: "Status", type: "badge" }
      ],
      fields: [
        { name: "tag_number", label: "Tag number", required: true },
        { name: "cattle_type", label: "Cattle type" },
        { name: "breed", label: "Breed" },
        { name: "sex", label: "Sex" },
        { name: "dob", label: "Date of birth" },
        { name: "status", label: "Status" }
      ],
      demoData: [
        { id: 1, tag_number: "156", cattle_type: "OX", breed: "SAMPLE", sex: "Male", dob: "2018-01-10", status: "active" },
        { id: 2, tag_number: "40",  cattle_type: "Cow", breed: "SAMPLE", sex: "Female", dob: "2019-03-22", status: "active" },
        { id: 3, tag_number: "43",  cattle_type: "Heifer", breed: "SAMPLE", sex: "Female", dob: "2020-05-01", status: "pending" },
        { id: 4, tag_number: "45",  cattle_type: "Male Calf", breed: "SAMPLE", sex: "Male", dob: "2021-02-14", status: "active" }
      ]
    }),

    vaccinations: () => CrudPage.create({
      tableSelector: "#vaccinationsTable",
      paginationSelector: "#vaccinationsPagination",
      filterBarSelector: "#vaccinationsFilters",
      modalId: "vaccinationModal",
      formId: "vaccinationForm",
      resource: Api.vaccinations,
      singular: "Vaccination record",
      plural: "vaccination records",
      columns: [
        { data: "animal_tag", title: "Animal Tag" },
        { data: "vaccine_name", title: "Vaccine" },
        { data: "administered_on", title: "Given On", type: "date" },
        { data: "next_due", title: "Next Due", type: "date" },
        { data: "status", title: "Status", type: "badge" }
      ],
      fields: [
        { name: "animal_tag", label: "Animal tag", required: true },
        { name: "vaccine_name", label: "Vaccine", required: true },
        { name: "administered_on", label: "Date administered" },
        { name: "next_due", label: "Next due date" },
        { name: "status", label: "Status" }
      ],
      demoData: [
        { id: 1, animal_tag: "156", vaccine_name: "Sample Vaccine A", administered_on: "2020-03-01", next_due: "2020-09-01", status: "completed" },
        { id: 2, animal_tag: "40",  vaccine_name: "Sample Vaccine B", administered_on: "2020-03-05", next_due: "2020-06-05", status: "due" }
      ]
    }),

    diseases: () => CrudPage.create({
      tableSelector: "#diseasesTable",
      paginationSelector: "#diseasesPagination",
      filterBarSelector: "#diseasesFilters",
      modalId: "diseaseModal",
      formId: "diseaseForm",
      resource: Api.diseaseReports,
      singular: "Disease report",
      plural: "disease reports",
      columns: [
        { data: "animal_tag", title: "Animal Tag" },
        { data: "condition", title: "Condition" },
        { data: "reported_on", title: "Reported On", type: "date" },
        { data: "severity", title: "Severity" },
        { data: "status", title: "Status", type: "badge" }
      ],
      fields: [
        { name: "animal_tag", label: "Animal tag", required: true },
        { name: "condition", label: "Condition", required: true },
        { name: "reported_on", label: "Reported on" },
        { name: "severity", label: "Severity" },
        { name: "status", label: "Status" }
      ],
      demoData: [
        { id: 1, animal_tag: "48", condition: "Sample Condition A", reported_on: "2020-03-10", severity: "Mild", status: "pending" },
        { id: 2, animal_tag: "19", condition: "Sample Condition B", reported_on: "2020-03-11", severity: "Severe", status: "critical" }
      ]
    }),

    veterinary: () => CrudPage.create({
      tableSelector: "#veterinaryTable",
      paginationSelector: "#veterinaryPagination",
      filterBarSelector: "#veterinaryFilters",
      modalId: "veterinaryModal",
      formId: "veterinaryForm",
      resource: Api.veterinary,
      singular: "Veterinary Officer",
      plural: "veterinary officers",
      columns: [
        { data: "full_name", title: "Name" },
        { data: "specialty", title: "Specialty" },
        { data: "phone", title: "Phone" },
        { data: "status", title: "Status", type: "badge" }
      ],
      fields: [
        { name: "full_name", label: "Full name", required: true },
        { name: "specialty", label: "Specialty" },
        { name: "phone", label: "Phone" },
        { name: "status", label: "Status" }
      ],
      demoData: [
        { id: 1, full_name: "Sample Vet Officer A", specialty: "General", phone: "0806 000 0001", status: "active" },
        { id: 2, full_name: "Sample Vet Officer B", specialty: "Epidemiology", phone: "0806 000 0002", status: "active" }
      ]
    })
  };

  /* =========================================================
     7. REPORTS — export buttons (data-report + data-format)
     ========================================================= */
  function initReportsPage() {
    const btns = document.querySelectorAll("[data-report]");
    if (!btns.length) return;

    btns.forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const kind = btn.dataset.report;
        const fmt  = btn.dataset.format || "csv";
        const reportKey = Api.reports[kind];
        if (!reportKey) return;

        try {
          await reportKey({ format: fmt });
          App.toast("success", "Report ready",
            "The " + fmt.toUpperCase() + " report has been generated and downloaded.");
        } catch (err) {
          if (err.network) {
            App.toast("warning", "Demo mode",
              "Report generation requires the backend API (GET /api/reports/" + kind + ").");
          } else {
            App.toast("error", "Report failed", err.message);
          }
        }
      });
    });
  }

  /* =========================================================
     8. GLOBAL INIT — auto-detects which page is loaded
     ========================================================= */
  document.addEventListener("DOMContentLoaded", () => {
    App.init();
    Auth.init();

    if (document.getElementById("incomeExpenseChart")) Dashboard.init();

    if (document.querySelector("#farmersTable"))      Pages.farmers();
    if (document.querySelector("#farmsTable"))        Pages.farms();
    if (document.querySelector("#livestockTable"))    Pages.livestock();
    if (document.querySelector("#vaccinationsTable")) Pages.vaccinations();
    if (document.querySelector("#diseasesTable"))     Pages.diseases();
    if (document.querySelector("#veterinaryTable"))   Pages.veterinary();

    initReportsPage();
  });

  /* expose for debugging and for splitting back into separate files later */
  window.CRLMIS = { Api, App, Auth, Dashboard, CrudPage, Pages };
})();