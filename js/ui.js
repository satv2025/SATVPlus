import { CONFIG } from "./config.js";
import { getSession, signOut } from "./auth.js";
import { fetchMovie } from "./api.js";

export function $(sel) { return document.querySelector(sel); }
export function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

export function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   APP NAME + TITLE
========================= */

export function setAppName() {
  const els = $all("[data-appname]");
  for (const el of els) el.textContent = CONFIG.APP_NAME;

  const currentTitle = document.title.trim();
  if (!currentTitle || currentTitle === CONFIG.APP_NAME) {
    document.title = CONFIG.APP_NAME;
  }
}

/* =========================
   TOAST
========================= */

export function toast(msg, type = "info") {
  const host = document.getElementById("toast-host");
  if (!host) {
    alert(msg);
    return;
  }

  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  host.appendChild(t);

  requestAnimationFrame(() => t.classList.add("show"));

  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 200);
  }, 2800);
}

/* =========================
   TIME FORMAT
========================= */

export function formatTime(secs) {
  const s = Math.max(0, Math.floor(secs || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;

  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/* =========================
   NAVBAR
========================= */

export function renderNav({ active = "home" } = {}) {
  const nav = document.getElementById("topnav");
  if (!nav) return;

  nav.innerHTML = `
    <div class="nav-left">
      <a class="brand" href="/index.html">
        <img src="/images/satvpluslogo1.png" alt="Logo" class="brand-logo"/>
      </a>
      <a class="navlink ${active === "home" ? "active" : ""}" href="/index.html">Inicio</a>
    </div>
    <div class="nav-right" id="nav-right"></div>
  `;
}

export async function renderAuthButtons() {
  const host = document.getElementById("nav-right");
  if (!host) return;

  const session = await getSession();

  if (!session) {
    host.innerHTML = `
      <a class="btn ghost" href="/login.html">Entrar</a>
      <a class="btn" href="/register.html">Crear cuenta</a>
    `;
    return;
  }

  const name = escapeHtml(session.user.name || "Usuario");

  host.innerHTML = `
    <a class="pill profile-link" href="/profile.html">${name}</a>
    <button class="btn ghost" id="btn-logout" type="button">Salir</button>
  `;

  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      await signOut();
      window.location.href = "/login.html";
    });
  }
}

/* =========================
   DATA-HREF NAVIGATION
   (sin <a href> => no status bar)
========================= */

let __dataHrefNavEnabled = false;

export function enableDataHrefNavigation() {
  if (__dataHrefNavEnabled) return;
  __dataHrefNavEnabled = true;

  // Click
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-href]");
    if (!el) return;

    const href = el.dataset.href;
    if (!href) return;

    // No secuestrar clicks en controles
    const tag = e.target?.tagName?.toLowerCase?.() || "";
    if (tag === "button" || tag === "input" || tag === "select" || tag === "textarea") return;

    // Ctrl/Cmd click => nueva pestaña
    if (e.ctrlKey || e.metaKey) {
      window.open(href, "_blank", "noopener");
      return;
    }

    window.location.href = href;
  });

  // Teclado (Enter / Space)
  document.addEventListener("keydown", (e) => {
    const el = e.target.closest("[data-href]");
    if (!el) return;

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const href = el.dataset.href;
      if (href) window.location.href = href;
    }
  });
}

/* =========================
   MOVIE CARD
   - antes: <a class="card" href="...">
   - ahora: <div class="card" data-href="...">
========================= */

export function cardHtml(
  movie,
  hrefOverride = null,
  subtitle = null,
  progressPercent = null
) {
  const thumb = movie.thumbnail_url || "";
  const title = escapeHtml(movie.title || "Sin título");

  // /watch (sin .html)
  const href = hrefOverride
    ? hrefOverride
    : `/watch?movie=${encodeURIComponent(movie.id)}`;

  const sub = subtitle
    ? `<div class="card-subtitle">${escapeHtml(subtitle)}</div>`
    : "";

  const pb = typeof progressPercent === "number"
    ? `<div class="progressbar">
         <div class="progressfill" style="width:${Math.min(100, Math.max(0, progressPercent))}%"></div>
       </div>`
    : "";

  return `
    <div class="card" role="link" tabindex="0" data-href="${href}">
      <div class="thumb" style="background-image:url('${thumb}')">
        ${pb}
      </div>
      <div class="card-title">${title}</div>
      ${sub}
    </div>
  `;
}

/* =========================
   SET MOVIE TITLE (for watch page)
========================= */

export async function setMovieTitleFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const movieId = urlParams.get("movie");

  if (!movieId) {
    document.title = "Película no encontrada · SATV+";
    return;
  }

  try {
    const movie = await fetchMovie(movieId);

    if (movie) {
      document.title = `${movie.title} · SATV+`;
    } else {
      document.title = "Película no encontrada · SATV+";
    }
  } catch (error) {
    console.error("Error al obtener la película:", error);
    document.title = "Error al cargar la película · SATV+";
  }
}