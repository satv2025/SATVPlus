// ui.js
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

/* =========================
   PERFIL / USERNAME (profiles.username)
   - Lee username desde la tabla "profiles" (columna username / "Username")
   - Soporta Supabase PostgREST directo (sin supabase-js)
========================= */

function getUserIdFromSession(session) {
  return (
    session?.user?.id ||
    session?.session?.user?.id ||
    session?.data?.session?.user?.id ||
    null
  );
}

function getAccessTokenFromSession(session) {
  return (
    session?.access_token ||
    session?.session?.access_token ||
    session?.data?.session?.access_token ||
    session?.token ||
    null
  );
}

function getSupabaseUrlFromConfig() {
  return (
    CONFIG?.SUPABASE_URL ||
    CONFIG?.SUPABASE_PROJECT_URL ||
    CONFIG?.SB_URL ||
    null
  );
}

function getSupabaseAnonKeyFromConfig() {
  return (
    CONFIG?.SUPABASE_ANON_KEY ||
    CONFIG?.SUPABASE_ANON ||
    CONFIG?.SUPABASE_KEY ||
    CONFIG?.SB_ANON_KEY ||
    null
  );
}

function safeLocalPartFromEmail(email) {
  const s = String(email || "");
  const i = s.indexOf("@");
  return (i > 0 ? s.slice(0, i) : s) || "";
}

async function fetchProfileRowByUserId({ userId, accessToken } = {}) {
  const supabaseUrl = getSupabaseUrlFromConfig();
  const anonKey = getSupabaseAnonKeyFromConfig();

  // Si no hay config de Supabase, no podemos leer PostgREST
  if (!supabaseUrl || !anonKey || !userId) return null;

  // Endpoint PostgREST típico:
  //   {SUPABASE_URL}/rest/v1/profiles?id=eq.{uuid}&select=username,full_name
  // Nota: Si tu PK/relación usa otra columna (ej: user_id), cambiala acá.
  const url =
    `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/profiles` +
    `?id=eq.${encodeURIComponent(userId)}` +
    `&select=username,full_name`;

  const headers = {
    "apikey": anonKey,
    "Accept": "application/json",
  };

  // Para RLS normalmente hace falta el token del usuario logueado
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  } else {
    // fallback mínimo (si tu RLS permite anon en lectura)
    headers["Authorization"] = `Bearer ${anonKey}`;
  }

  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    // No spameo toasts acá: el navbar se renderiza igual con fallback
    return null;
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0] || null;
}

async function getUsernameFromProfilesTable(session) {
  const userId = getUserIdFromSession(session);
  const accessToken = getAccessTokenFromSession(session);

  if (!userId) return null;

  // Cache simple para no pegarle siempre al endpoint
  const cacheKey = `profiles.username.${userId}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch (_) { }

  const row = await fetchProfileRowByUserId({ userId, accessToken });
  const username = row?.username ? String(row.username) : null;

  if (username) {
    try { sessionStorage.setItem(cacheKey, username); } catch (_) { }
    return username;
  }

  return null;
}

function getFallbackDisplayName(session) {
  // Prioridad de fallback si no se puede leer profiles.username:
  // 1) session.user.username
  // 2) session.user.user_metadata.username
  // 3) session.user.name
  // 4) email local-part
  // 5) "Usuario"
  const u =
    session?.user ||
    session?.session?.user ||
    session?.data?.session?.user ||
    {};

  const meta = u?.user_metadata || u?.metadata || {};
  return (
    u?.username ||
    meta?.username ||
    u?.name ||
    meta?.full_name ||
    safeLocalPartFromEmail(u?.email) ||
    "Usuario"
  );
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

  // 1) Intentamos username REAL desde profiles.username
  // 2) Si falla, usamos fallback
  let display = null;
  try {
    display = await getUsernameFromProfilesTable(session);
  } catch (e) {
    console.warn("No se pudo leer profiles.username:", e);
  }

  if (!display) display = getFallbackDisplayName(session);

  const name = escapeHtml(display || "Usuario");

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
========================= */

let __dataHrefNavEnabled = false;

export function enableDataHrefNavigation() {
  if (__dataHrefNavEnabled) return;
  __dataHrefNavEnabled = true;

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-href]");
    if (!el) return;

    const href = el.dataset.href;
    if (!href) return;

    const tag = e.target?.tagName?.toLowerCase?.() || "";
    if (tag === "button" || tag === "input" || tag === "select" || tag === "textarea") return;

    if (e.ctrlKey || e.metaKey) {
      window.open(href, "_blank", "noopener");
      return;
    }

    window.location.href = href;
  });

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
========================= */

export function cardHtml(movie, hrefOverride = null, subtitle = null, progressPercent = null) {
  const thumb = movie.thumbnail_url || "";
  const title = escapeHtml(movie.title || "Sin título");

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
    <div class="card no-select" role="link" tabindex="0" data-href="${href}">
      <div class="thumb" style="background-image:url('${thumb}')">
        ${pb}
      </div>
      <div class="card-title">${title}</div>
      ${sub}
    </div>
  `;
}

/* =========================
   CSS DISFRAZADO
   - URL visible: /url/css/satvplusClient.{id}.css
   - Contenido real: /css/styles.css (via vercel.json rewrite)
   Requisito en HTML:
     <link id="app-style" rel="stylesheet" href="/css/styles.css" />
========================= */

function setDisguisedCssHref(href, linkId = "app-style") {
  const link = document.getElementById(linkId);
  if (!link) return;
  link.href = href;
}

export function applyDisguisedCssFromId(id, {
  linkId = "app-style",
  disguisedPrefix = "/css/satvplusClient.",
  disguisedSuffix = ".css"
} = {}) {
  const safe = (id === null || id === undefined) ? "0" : String(id);
  const href = `${disguisedPrefix}${encodeURIComponent(safe)}${disguisedSuffix}`;
  setDisguisedCssHref(href, linkId);
}

function getMovieIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("movie");
}

export function applyDisguisedCssFromMovieId({
  linkId = "app-style",
  disguisedPrefix = "/css/satvplusClient.",
  disguisedSuffix = ".css",
  defaultId = "0"
} = {}) {
  const movieId = getMovieIdFromUrl();
  const id = movieId || defaultId;
  applyDisguisedCssFromId(id, { linkId, disguisedPrefix, disguisedSuffix });
}

/* =========================
   SET MOVIE TITLE (watch page)
========================= */

export async function setMovieTitleFromUrl() {
  const movieId = getMovieIdFromUrl();

  if (!movieId) {
    document.title = "Película no encontrada · SATV+";
    return null;
  }

  try {
    const movie = await fetchMovie(movieId);

    if (movie) {
      document.title = `${movie.title} · SATV+`;
      return movie;
    } else {
      document.title = "Película no encontrada · SATV+";
      return null;
    }
  } catch (error) {
    console.error("Error al obtener la película:", error);
    document.title = "Error al cargar la película · SATV+";
    return null;
  }
}