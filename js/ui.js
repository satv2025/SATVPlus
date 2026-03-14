// ui.js
import { CONFIG } from "./config.js";
import { getSession, signOut } from "./auth.js";
import {
  fetchMovie,
  fetchLanguagePreference,
  upsertLanguagePreference,
  detectConnectionCountryCode,
  countryHasSpanishOfficialLanguage,
  getPreferredDeviceLanguage,
  searchMovies
} from "./api.js";

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

  const url = new URL(window.location.href);
  const currentQuery = url.searchParams.get("q") || "";

  nav.innerHTML = `
    <div class="nav-left">
      <a class="brand" href="/index.html">
        <img src="/images/satvpluslogo1.png" alt="Logo" class="brand-logo"/>
      </a>
      <a class="navlink ${active === "home" ? "active" : ""}" href="/index.html">Inicio</a>
    </div>

    <div class="nav-center">
      <div class="topnav-search-wrap">
        <label class="topnav-search" for="topnav-search-input" aria-label="Buscar">
          <span class="topnav-search-icon" aria-hidden="true">
            <i class="fa-solid fa-magnifying-glass"></i>
          </span>
          <input
            id="topnav-search-input"
            class="topnav-search-input"
            type="search"
            name="q"
            placeholder="Buscar películas, series..."
            value="${escapeHtml(currentQuery)}"
            aria-label="Buscar películas o series"
            autocomplete="off"
            enterkeyhint="search"
            spellcheck="false"
          />
        </label>
      </div>
    </div>

    <div class="nav-right" id="nav-right"></div>
  `;
}

/* =========================
   PERFIL / USERNAME (profiles.username)
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

  if (!supabaseUrl || !anonKey || !userId) return null;

  const url =
    `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/profiles` +
    `?id=eq.${encodeURIComponent(userId)}` +
    `&select=username,full_name`;

  const headers = {
    "apikey": anonKey,
    "Accept": "application/json",
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  } else {
    headers["Authorization"] = `Bearer ${anonKey}`;
  }

  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
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

/* =========================
   LANGUAGE PREFERENCE
========================= */

const APP_LANG_STORAGE_KEY = "satv_lang_code";
const LANG_PROMPT_SESSION_KEY_PREFIX = "satv_lang_prompt_v3";

function normalizeCountryCode(value) {
  return String(value || "").trim().toUpperCase().slice(0, 2);
}

function normalizeLangCode(value) {
  return String(value || "").trim();
}

function getLangBase(value) {
  return normalizeLangCode(value).split("-")[0].toLowerCase();
}

function sameLanguage(a, b) {
  const aa = getLangBase(a);
  const bb = getLangBase(b);
  return !!aa && aa === bb;
}

function getCurrentAppLanguage(savedLang = null) {
  try {
    return (
      normalizeLangCode(savedLang) ||
      normalizeLangCode(localStorage.getItem(APP_LANG_STORAGE_KEY)) ||
      normalizeLangCode(document.documentElement.lang) ||
      normalizeLangCode(navigator.language) ||
      "es-AR"
    );
  } catch {
    return (
      normalizeLangCode(savedLang) ||
      normalizeLangCode(document.documentElement.lang) ||
      normalizeLangCode(navigator.language) ||
      "es-AR"
    );
  }
}

function applyLanguagePreference(langCode) {
  const safe = normalizeLangCode(langCode);
  if (!safe) return;

  try {
    localStorage.setItem(APP_LANG_STORAGE_KEY, safe);
  } catch (_) { }

  document.documentElement.lang = safe;
  window.__APP_LANG__ = safe;

  try {
    window.dispatchEvent(
      new CustomEvent("app:langchange", {
        detail: { langCode: safe }
      })
    );
  } catch (_) { }
}

function getRegionDisplayName(countryCode, locale = "es") {
  const safe = normalizeCountryCode(countryCode);
  if (!safe) return "";
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(safe) || safe;
  } catch {
    return safe;
  }
}

function getLanguageDisplayName(langCode, locale = "es") {
  const base = getLangBase(langCode);
  if (!base) return normalizeLangCode(langCode);
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(base) || normalizeLangCode(langCode);
  } catch {
    return normalizeLangCode(langCode);
  }
}

function getPromptCacheKey(userId, countryCode, suggestedLang) {
  return `${LANG_PROMPT_SESSION_KEY_PREFIX}:${userId}:${normalizeCountryCode(countryCode)}:${getLangBase(suggestedLang)}`;
}

function ensureLanguagePromptModal() {
  let root = document.getElementById("lang-modal-root");
  if (root) return root;

  root = document.createElement("div");
  root.id = "lang-modal-root";
  root.className = "lang-modal-backdrop";
  root.setAttribute("aria-hidden", "true");

  root.innerHTML = `
    <div class="lang-modal" role="dialog" aria-modal="true" aria-labelledby="lang-modal-title">
      <div class="lang-modal-head">
        <span class="lang-modal-dot" aria-hidden="true"></span>
        <h3 class="lang-modal-title" id="lang-modal-title">Idioma / Language</h3>
        <button type="button" class="lang-modal-close" data-lang-close aria-label="Cerrar / Close">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="lang-modal-body">
        <p class="lang-modal-copy" data-lang-copy-es></p>
        <p class="lang-modal-copy" data-lang-copy-en></p>
        <div class="lang-modal-meta" data-lang-meta hidden></div>
      </div>
      <div class="lang-modal-actions">
        <button type="button" class="btn ghost" data-lang-decline>
          Mantener idioma actual / Keep current language
        </button>
        <button type="button" class="btn" data-lang-accept>
          Traducir / Translate
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(root);
  return root;
}

function showLanguagePromptModal({ regionName, suggestedLang }) {
  return new Promise((resolve) => {
    const root = ensureLanguagePromptModal();
    const closeBtn = root.querySelector("[data-lang-close]");
    const acceptBtn = root.querySelector("[data-lang-accept]");
    const declineBtn = root.querySelector("[data-lang-decline]");
    const copyEs = root.querySelector("[data-lang-copy-es]");
    const copyEn = root.querySelector("[data-lang-copy-en]");
    const meta = root.querySelector("[data-lang-meta]");

    const langEs = getLanguageDisplayName(suggestedLang, "es");
    const langEn = getLanguageDisplayName(suggestedLang, "en");

    copyEs.textContent =
      `Detectamos que te estás conectando desde ${regionName}. ¿Deseas traducir la app a ${langEs}?`;
    copyEn.textContent =
      `We detected that you're connecting from ${regionName}. Would you like to translate the app to ${langEn}?`;
    meta.hidden = false;
    meta.textContent = `${regionName} • ${langEs} / ${langEn}`;

    const focusables = () => [closeBtn, declineBtn, acceptBtn].filter(Boolean);
    const previousFocused = document.activeElement;

    let settled = false;

    const cleanup = (accepted) => {
      if (settled) return;
      settled = true;

      root.classList.remove("show");
      root.setAttribute("aria-hidden", "true");
      document.body.classList.remove("lang-modal-open");

      root.removeEventListener("click", onBackdropClick);
      document.removeEventListener("keydown", onKeyDown);
      acceptBtn.removeEventListener("click", onAccept);
      declineBtn.removeEventListener("click", onDecline);
      closeBtn.removeEventListener("click", onDecline);

      window.setTimeout(() => {
        try { previousFocused?.focus?.(); } catch (_) { }
        resolve(accepted);
      }, 180);
    };

    const onAccept = () => cleanup(true);
    const onDecline = () => cleanup(false);

    const onBackdropClick = (e) => {
      if (e.target === root) cleanup(false);
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup(false);
        return;
      }

      if (e.key !== "Tab") return;

      const nodes = focusables();
      if (!nodes.length) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    root.addEventListener("click", onBackdropClick);
    document.addEventListener("keydown", onKeyDown);
    acceptBtn.addEventListener("click", onAccept);
    declineBtn.addEventListener("click", onDecline);
    closeBtn.addEventListener("click", onDecline);

    document.body.classList.add("lang-modal-open");
    root.setAttribute("aria-hidden", "false");

    requestAnimationFrame(() => {
      root.classList.add("show");
      acceptBtn.focus();
    });
  });
}

async function maybeSuggestLanguageChange(session) {
  const userId = getUserIdFromSession(session);
  if (!userId) return;

  let savedPreference = null;
  try {
    savedPreference = await fetchLanguagePreference(userId);
    if (savedPreference?.lang_code) {
      applyLanguagePreference(savedPreference.lang_code);
    }
  } catch (error) {
    console.warn("[ui] no se pudo leer public.lang:", error);
  }

  const detectedCountry = normalizeCountryCode(await detectConnectionCountryCode());
  if (!detectedCountry) return;

  const currentLang = getCurrentAppLanguage(savedPreference?.lang_code);

  if (normalizeCountryCode(savedPreference?.county) === detectedCountry) {
    return;
  }

  let isSpanishCountry = false;
  try {
    isSpanishCountry = await countryHasSpanishOfficialLanguage(detectedCountry);
  } catch (error) {
    console.warn("[ui] no se pudo resolver idioma oficial del país:", error);
  }

  if (isSpanishCountry) {
    try {
      await upsertLanguagePreference({
        userId,
        countryCode: detectedCountry,
        langCode: currentLang
      });
    } catch (error) {
      console.warn("[ui] no se pudo guardar idioma automático:", error);
    }
    return;
  }

  const suggestedLang = normalizeLangCode(getPreferredDeviceLanguage()) || "en-US";

  if (sameLanguage(currentLang, suggestedLang)) {
    try {
      await upsertLanguagePreference({
        userId,
        countryCode: detectedCountry,
        langCode: currentLang
      });
    } catch (error) {
      console.warn("[ui] no se pudo persistir idioma actual:", error);
    }
    return;
  }

  const promptKey = getPromptCacheKey(userId, detectedCountry, suggestedLang);
  try {
    if (sessionStorage.getItem(promptKey) === "1") return;
    sessionStorage.setItem(promptKey, "1");
  } catch (_) { }

  const regionName =
    getRegionDisplayName(detectedCountry, "es") ||
    getRegionDisplayName(detectedCountry, "en") ||
    detectedCountry;

  const accepted = await showLanguagePromptModal({
    regionName,
    suggestedLang
  });

  const chosenLang = accepted ? suggestedLang : currentLang;

  try {
    await upsertLanguagePreference({
      userId,
      countryCode: detectedCountry,
      langCode: chosenLang
    });
  } catch (error) {
    console.warn("[ui] no se pudo guardar la preferencia de idioma:", error);
  }

  if (!accepted) return;

  applyLanguagePreference(chosenLang);
  toast(
    `Idioma actualizado a ${getLanguageDisplayName(chosenLang, "es")} / Language updated to ${getLanguageDisplayName(chosenLang, "en")}.`,
    "info"
  );

  window.location.reload();
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

  try {
    await maybeSuggestLanguageChange(session);
  } catch (e) {
    console.warn("[ui] maybeSuggestLanguageChange error:", e);
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
   MOVIE CARD BADGE (publish_state)
========================= */

function getMoviePublishState(movie) {
  const state = String(movie?.publish_state || "public").toLowerCase();
  if (["public", "upcoming", "live", "other"].includes(state)) return state;
  return "public";
}

function getMovieBadgeLabel(movie) {
  const state = getMoviePublishState(movie);

  if (state === "public") return "";
  if (state === "upcoming") return "Próximamente";
  if (state === "live") return "En Vivo";

  const custom = String(movie?.publish_state_text || "").trim();
  return custom || "Otro";
}

function getMovieBadgeClass(movie) {
  const state = getMoviePublishState(movie);
  return `card-badge-${state}`;
}

/* =========================
   URL HELPERS
========================= */

export function buildTitleUrl(movieId, { collectionId = null, episodeId = null } = {}) {
  if (!movieId) return "#";

  const parts = [];

  if (collectionId) {
    parts.push(`collection=${encodeURIComponent(String(collectionId))}`);
  }

  parts.push(`title=${encodeURIComponent(String(movieId))}`);

  if (episodeId) {
    parts.push(`episode=${encodeURIComponent(String(episodeId))}`);
  }

  return `/title?${parts.join("&")}`;
}

/* =========================
   MOVIE CARD
========================= */

export function cardHtml(
  movie,
  hrefOverride = null,
  subtitle = null,
  progressPercent = null,
  options = {}
) {
  const thumb = movie.thumbnail_url || "";
  const title = escapeHtml(movie.title || "Sin título");

  const href = hrefOverride
    ? hrefOverride
    : buildTitleUrl(movie?.id, {
      collectionId: movie?.collection_id || null
    });

  const sub = subtitle
    ? `<div class="card-subtitle">${escapeHtml(subtitle)}</div>`
    : "";

  const pb = typeof progressPercent === "number"
    ? `<div class="progressbar">
         <div class="progressfill" style="width:${Math.min(100, Math.max(0, progressPercent))}%"></div>
       </div>`
    : "";

  const badgeLabel = getMovieBadgeLabel(movie);
  const badge = badgeLabel
    ? `<div class="card-badge ${getMovieBadgeClass(movie)}">${escapeHtml(badgeLabel)}</div>`
    : "";

  const isCollection =
    options?.showCollectionOverlay === true &&
    !!movie?.collection_id;

  const collectionOverlay = isCollection
    ? `
      <div class="card-collection-overlay" aria-hidden="true">
        <img src="/images/svg/collections.svg" alt=""/>
      </div>
    `
    : "";

  return `
    <div class="card no-select" role="link" tabindex="0" data-href="${href}">
      <div class="thumb" style="background-image:url('${thumb}'); position:relative;">
        ${collectionOverlay}
        ${badge}
        ${pb}
      </div>
      <div class="card-title">${title}</div>
      ${sub}
    </div>
  `;
}

/* =========================
   SEARCH OVERLAY FULLSCREEN
========================= */

const SEARCH_OVERLAY_ID = "search-overlay";
const SEARCH_MODE_STYLE_ID = "search-mode-style";

let __topnavSearchInit = false;
let __searchExperienceInit = false;
let __searchRequestSeq = 0;
let __searchDebounceTimer = null;
let __searchBaseUrl = null;

const SEARCH_MODE_CSS = `
body.search-open {
  overflow: hidden;
}

body.search-open .search-results-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 13px;
  align-items: start;
}

body.search-open .search-results-grid .card {
  width: 100%;
  min-width: 0;
  background: transparent;
  transition: transform .18s ease, opacity .18s ease;
}

body.search-open .search-results-grid .card:hover {
  transform: translateY(-4px);
  outline: 0 !important;
}

body.search-open div.card:hover {
  border: 0 !important;
}

body.search-open .search-results-grid .thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 16px;
  background-size: cover;
  background-position: center;
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(0, 0, 0, .30);
}

body.search-open .search-results-grid .card-title {
  margin-top: -1px;
  font-size: 15px;
  line-height: 1.35;
  font-weight: 700;
  color: #fff;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.7em;
}

body.search-open .search-results-grid .card-subtitle {
  margin-top: 4px;
  color: rgba(255, 255, 255, .68);
  font-size: 13px;
  line-height: 1.35;
}

body.search-open .search-results-grid .card-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  padding: 6px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  width: fit-content;
  display: inline-block;
}

body.search-open .search-results-grid .card-collection-overlay {
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  background: #07090d82;
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
}

body.search-open .search-results-grid .card-collection-overlay img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

body.search-open .search-results-grid .progressbar {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  height: 5px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, .15);
}

body.search-open .search-results-grid .progressfill {
  height: 100%;
  border-radius: inherit;
  background: #fff;
}

@media (max-width: 1280px) {
  body.search-open .search-results-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 980px) {
  body.search-open .search-results-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
  }
}

@media (max-width: 720px) {
  body.search-open .search-results-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  body.search-open .search-results-grid .card-title {
    font-size: 14px;
  }
}
`;

function ensureSearchModeStyle() {
  let style = document.getElementById(SEARCH_MODE_STYLE_ID);
  if (style) return style;

  style = document.createElement("style");
  style.id = SEARCH_MODE_STYLE_ID;
  style.textContent = SEARCH_MODE_CSS;
  document.head.appendChild(style);
  return style;
}

function removeSearchModeStyle() {
  const style = document.getElementById(SEARCH_MODE_STYLE_ID);
  if (style) style.remove();
}

function normalizeSearchQuery(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function getCurrentSearchQueryFromUrl() {
  try {
    const url = new URL(window.location.href);
    return normalizeSearchQuery(url.searchParams.get("q") || "");
  } catch {
    return "";
  }
}

function getCurrentNonSearchUrl() {
  const url = new URL(window.location.href);
  return `${url.pathname}${url.search}${url.hash}`;
}

function rememberSearchBaseUrl() {
  if (__searchBaseUrl) return;

  const url = new URL(window.location.href);
  if (!url.searchParams.get("q")) {
    __searchBaseUrl = `${url.pathname}${url.search}${url.hash}`;
  }
}

function getFallbackBaseUrl() {
  return __searchBaseUrl || "/index.html";
}

function buildSearchUrl(query) {
  const q = normalizeSearchQuery(query);

  if (!q) {
    return getFallbackBaseUrl();
  }

  const base = new URL(window.location.origin + getFallbackBaseUrl());
  base.searchParams.set("q", q);

  return `${base.pathname}${base.search}${base.hash}`;
}

function replaceSearchUrl(query) {
  const safeQuery = normalizeSearchQuery(query);

  if (safeQuery) {
    rememberSearchBaseUrl();
  }

  const nextUrl = buildSearchUrl(safeQuery);
  history.replaceState({ searchQuery: safeQuery }, "", nextUrl);
}

function dispatchSearchChange(query, extra = {}) {
  const safeQuery = normalizeSearchQuery(query);

  try {
    window.dispatchEvent(
      new CustomEvent("app:searchchange", {
        detail: {
          query: safeQuery,
          ...extra
        }
      })
    );
  } catch (_) { }
}

function ensureSearchOverlay() {
  let root = document.getElementById(SEARCH_OVERLAY_ID);
  if (root) return root;

  root = document.createElement("div");
  root.id = SEARCH_OVERLAY_ID;
  root.className = "search-overlay";
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");

  root.innerHTML = `
    <div class="search-overlay-shell">
      <div class="search-overlay-topbar">
        <div class="search-overlay-inputbar">
          <span class="search-overlay-input-icon" aria-hidden="true">
            <i class="fa-solid fa-magnifying-glass"></i>
          </span>
          <input
            id="search-overlay-input"
            class="search-overlay-input"
            type="search"
            placeholder="Buscar películas, series..."
            autocomplete="off"
            enterkeyhint="search"
            spellcheck="false"
          />
          <button
            type="button"
            class="search-overlay-close"
            data-search-close
            aria-label="Cerrar búsqueda"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <div class="search-overlay-content">
        <div class="search-overlay-status" id="search-overlay-status"></div>
        <div id="search-results" class="search-results-grid"></div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  const closeBtn = root.querySelector("[data-search-close]");
  const overlayInput = root.querySelector("#search-overlay-input");

  closeBtn?.addEventListener("click", () => {
    closeSearchOverlay({ clearQuery: true });
  });

  root.addEventListener("click", (e) => {
    if (e.target === root) {
      closeSearchOverlay({ clearQuery: true });
    }
  });

  document.addEventListener("keydown", (e) => {
    if (root.hidden) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeSearchOverlay({ clearQuery: true });
    }
  });

  overlayInput?.addEventListener("input", (e) => {
    const q = normalizeSearchQuery(e.target.value || "");
    syncSearchInputs(q);

    if (!q) {
      closeSearchOverlay({ clearQuery: true });
      clearTimeout(__searchDebounceTimer);
      return;
    }

    rememberSearchBaseUrl();
    replaceSearchUrl(q);
    debouncedSearch(q, "overlay-input");
  });

  return root;
}

function getSearchInputs() {
  return [
    document.getElementById("topnav-search-input"),
    document.getElementById("search-overlay-input")
  ].filter(Boolean);
}

function syncSearchInputs(query) {
  const q = String(query || "");
  for (const input of getSearchInputs()) {
    if (input.value !== q) input.value = q;
  }
}

function setSearchStatus(html) {
  const el = document.getElementById("search-overlay-status");
  if (el) el.innerHTML = html;
}

export function openSearchOverlay(query = "") {
  const root = ensureSearchOverlay();

  ensureSearchModeStyle();
  root.hidden = false;
  root.setAttribute("aria-hidden", "false");
  document.body.classList.add("search-open");
  syncSearchInputs(query);

  const overlayInput = document.getElementById("search-overlay-input");
  requestAnimationFrame(() => {
    overlayInput?.focus?.();
    if (overlayInput && query) {
      const len = overlayInput.value.length;
      overlayInput.setSelectionRange(len, len);
    }
  });
}

export function closeSearchOverlay({ clearQuery = false } = {}) {
  const root = document.getElementById(SEARCH_OVERLAY_ID);
  if (!root) return;

  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  document.body.classList.remove("search-open");
  removeSearchModeStyle();

  const results = document.getElementById("search-results");
  if (results) results.innerHTML = "";

  setSearchStatus("");
  clearTimeout(__searchDebounceTimer);
  __searchRequestSeq++;

  if (clearQuery) {
    syncSearchInputs("");
    history.replaceState({ searchQuery: "" }, "", getFallbackBaseUrl());
    return;
  }

  const q = normalizeSearchQuery(document.getElementById("topnav-search-input")?.value || "");
  if (!q) {
    history.replaceState({ searchQuery: "" }, "", getFallbackBaseUrl());
  }
}

function renderSearchMessage(html) {
  const results = document.getElementById("search-results");
  if (!results) return;
  results.innerHTML = "";
  setSearchStatus(html);
}

export function renderSearchResults(items = [], query = "") {
  const host = document.getElementById("search-results");
  if (!host) return;

  const safeQuery = normalizeSearchQuery(query);

  if (!safeQuery) {
    host.innerHTML = "";
    setSearchStatus(`<div class="search-empty-state">Empezá a escribir para buscar.</div>`);
    return;
  }

  if (!Array.isArray(items) || !items.length) {
    host.innerHTML = "";
    setSearchStatus(`
      <div class="search-empty-state">
        No encontramos resultados para <strong>${escapeHtml(safeQuery)}</strong>.
      </div>
    `);
    return;
  }

  setSearchStatus(`
    <div class="search-results-count">
      Resultados para <strong>${escapeHtml(safeQuery)}</strong> · ${items.length}
    </div>
  `);

  host.innerHTML = items.map((movie) =>
    cardHtml(movie, null, null, null, { showCollectionOverlay: true })
  ).join("");
}

function debouncedSearch(query, source = "input") {
  clearTimeout(__searchDebounceTimer);

  __searchDebounceTimer = setTimeout(() => {
    dispatchSearchChange(query, { source });
  }, 220);
}

export function initTopnavSearch() {
  if (__topnavSearchInit) return;
  __topnavSearchInit = true;

  ensureSearchOverlay();

  document.addEventListener("focusin", (e) => {
    const input = e.target?.closest?.("#topnav-search-input");
    if (!input) return;

    const q = normalizeSearchQuery(input.value || "");
    if (q) openSearchOverlay(q);
  });

  document.addEventListener("input", (e) => {
    const input = e.target?.closest?.("#topnav-search-input");
    if (!input) return;

    const q = normalizeSearchQuery(input.value || "");
    syncSearchInputs(q);

    if (!q) {
      closeSearchOverlay({ clearQuery: true });
      clearTimeout(__searchDebounceTimer);
      return;
    }

    rememberSearchBaseUrl();
    openSearchOverlay(q);
    replaceSearchUrl(q);
    debouncedSearch(q, "topnav-input");
  });

  document.addEventListener("keydown", (e) => {
    const input = e.target?.closest?.("#topnav-search-input");
    if (!input) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeSearchOverlay({ clearQuery: true });
    }
  });

  window.addEventListener("popstate", () => {
    const query = getCurrentSearchQueryFromUrl();
    syncSearchInputs(query);

    if (query) {
      openSearchOverlay(query);
      dispatchSearchChange(query, { source: "popstate" });
    } else {
      closeSearchOverlay({ clearQuery: true });
    }
  });
}

export function initSearchExperience() {
  if (__searchExperienceInit) return;
  __searchExperienceInit = true;

  ensureSearchOverlay();

  const currentUrl = getCurrentNonSearchUrl();
  if (!__searchBaseUrl && !new URL(window.location.href).searchParams.get("q")) {
    __searchBaseUrl = currentUrl;
  }

  window.addEventListener("app:searchchange", async (e) => {
    const query = normalizeSearchQuery(e?.detail?.query || "");
    const requestId = ++__searchRequestSeq;

    syncSearchInputs(query);

    if (!query) {
      const host = document.getElementById("search-results");
      if (host) host.innerHTML = "";
      setSearchStatus("");
      return;
    }

    openSearchOverlay(query);
    renderSearchMessage(`
      <div class="search-loading">
        Buscando <strong>${escapeHtml(query)}</strong>...
      </div>
    `);

    try {
      const results = await searchMovies(query, 36);
      if (requestId !== __searchRequestSeq) return;
      renderSearchResults(results || [], query);
    } catch (error) {
      if (requestId !== __searchRequestSeq) return;
      console.error("[search] error:", error);
      renderSearchMessage(`
        <div class="search-empty-state">
          Ocurrió un error al buscar <strong>${escapeHtml(query)}</strong>.
        </div>
      `);
    }
  });

  const initialQuery = getCurrentSearchQueryFromUrl();
  if (initialQuery) {
    rememberSearchBaseUrl();
    openSearchOverlay(initialQuery);
    dispatchSearchChange(initialQuery, { source: "init" });
  }
}

/* =========================
   CSS DISFRAZADO
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
  return urlParams.get("movie") || urlParams.get("title");
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
   SET MOVIE TITLE
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