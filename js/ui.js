// ui.js
import { CONFIG } from "./config.js";
import { getSession, signOut } from "./auth.js";
import {
  fetchMovie,
  fetchEpisodes,
  fetchLanguagePreference,
  upsertLanguagePreference,
  detectConnectionCountryCode,
  countryHasSpanishOfficialLanguage,
  getPreferredDeviceLanguage,
  searchMovies,
  fetchMovies
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
   PERFIL / USERNAME
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
    apikey: anonKey,
    Accept: "application/json",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else {
    headers.Authorization = `Bearer ${anonKey}`;
  }

  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) return null;

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
  root.hidden = true;

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
      root.hidden = true;
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

    root.hidden = false;
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

    if (el.matches?.("[data-title-overlay='1']")) return;
    if (el.closest?.("#title-overlay-root")) return;

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

    if (el.matches?.("[data-title-overlay='1']")) return;
    if (el.closest?.("#title-overlay-root")) return;

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const href = el.dataset.href;
      if (href) window.location.href = href;
    }
  });
}

/* =========================
   MOVIE CARD BADGE
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
   EPISODE PROGRESS (overlay)
========================= */

async function getAppSupabaseClientSafe() {
  try {
    const mod = await import("./supabaseClient.js");
    return mod?.supabase || null;
  } catch (e) {
    console.warn("[ui][overlay] no se pudo importar supabaseClient:", e);
    return null;
  }
}

function clampEpisodeProgressPercent(progressSeconds, durationSeconds) {
  const progress = Number(progressSeconds || 0);
  const duration = Number(durationSeconds || 0);

  if (!Number.isFinite(progress) || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (progress / duration) * 100));
}

async function fetchEpisodeProgressMapForOverlay({ movieId }) {
  if (!movieId) return new Map();

  try {
    const supabase = await getAppSupabaseClientSafe();
    if (!supabase) return new Map();

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      console.warn("[ui][overlay] getUser error:", userErr);
      return new Map();
    }

    const userId = userData?.user?.id;
    if (!userId) return new Map();

    const { data, error } = await supabase
      .from("watch_progress")
      .select(`
        episode_id,
        progress_seconds,
        duration_seconds,
        updated_at
      `)
      .eq("user_id", userId)
      .eq("movie_id", movieId)
      .not("episode_id", "is", null)
      .gt("progress_seconds", 0)
      .order("updated_at", { ascending: false });

    if (error) {
      console.warn("[ui][overlay] watch_progress query error:", error);
      return new Map();
    }

    const map = new Map();

    for (const row of data || []) {
      const episodeId = row?.episode_id;
      if (!episodeId) continue;
      if (map.has(episodeId)) continue;

      const percent = clampEpisodeProgressPercent(
        row?.progress_seconds,
        row?.duration_seconds
      );

      map.set(episodeId, {
        episodeId,
        progressSeconds: Number(row?.progress_seconds || 0),
        durationSeconds: Number(row?.duration_seconds || 0),
        percent,
        updatedAt: row?.updated_at || null
      });
    }

    return map;
  } catch (e) {
    console.warn("[ui][overlay] fetchEpisodeProgressMapForOverlay error:", e);
    return new Map();
  }
}

async function fetchContinueWatchingForOverlay({ movieId }) {
  if (!movieId) return null;

  try {
    const supabase = await getAppSupabaseClientSafe();
    if (!supabase) return null;

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      console.warn("[ui][overlay] getUser error:", userErr);
      return null;
    }

    const userId = userData?.user?.id;
    if (!userId) return null;

    let { data, error } = await supabase
      .from("watch_progress")
      .select(`
        movie_id,
        episode_id,
        progress_seconds,
        duration_seconds,
        updated_at,
        episodes:episodes!watch_progress_episode_id_fkey (
          id,
          season,
          episode_number,
          title
        )
      `)
      .eq("user_id", userId)
      .eq("movie_id", movieId)
      .gt("progress_seconds", 0)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && String(error.message || "").toLowerCase().includes("duration_seconds")) {
      const retry = await supabase
        .from("watch_progress")
        .select(`
          movie_id,
          episode_id,
          progress_seconds,
          updated_at,
          episodes:episodes!watch_progress_episode_id_fkey (
            id,
            season,
            episode_number,
            title
          )
        `)
        .eq("user_id", userId)
        .eq("movie_id", movieId)
        .gt("progress_seconds", 0)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.warn("[ui][overlay] watch_progress query error:", error);
      return null;
    }

    if (!data) return null;

    const progressSeconds = Number(data?.progress_seconds || 0);
    if (!Number.isFinite(progressSeconds) || progressSeconds <= 0) return null;

    const ep = Array.isArray(data.episodes)
      ? (data.episodes[0] || null)
      : (data.episodes || null);

    return {
      ...data,
      episodes: ep,
      season: ep?.season ?? null,
      episode_number: ep?.episode_number ?? null,
      episode_title: ep?.title ?? null,
      elapsed_seconds: progressSeconds
    };
  } catch (e) {
    console.warn("[ui][overlay] fetchContinueWatchingForOverlay error:", e);
    return null;
  }
}

function formatElapsedOverlay(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;

  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

function setOverlayWatchBtnDisabled(btn, label = "No disponible") {
  if (!btn) return;

  btn.href = "#";
  btn.dataset.mode = "disabled";
  btn.setAttribute("aria-disabled", "true");
  btn.setAttribute("aria-label", label);
  btn.innerHTML = escapeHtml(label);

  if (btn.__overlayWatchBound !== true) {
    btn.__overlayWatchBound = true;
    btn.addEventListener("click", (ev) => {
      if (btn.dataset.mode === "disabled" || btn.dataset.mode === "loading") {
        ev.preventDefault();
        ev.stopPropagation();
      }
    });
  }
}

function setOverlayWatchBtnPlay(btn, movie, label = "Reproducir") {
  if (!btn || !movie?.id) return;

  btn.removeAttribute("aria-disabled");
  btn.dataset.mode = "play";

  if (movie.category === "series") {
    btn.href = `/watch?series=${encodeURIComponent(movie.id)}`;
  } else {
    btn.href = `/watch?movie=${encodeURIComponent(movie.id)}`;
  }

  btn.setAttribute("aria-label", label);
  btn.innerHTML = `${escapeHtml(label)} <span aria-hidden="true">▶</span>`;
}

function setOverlayWatchBtnResume(btn, movie, progress) {
  if (!btn || !movie?.id || !progress) {
    setOverlayWatchBtnPlay(btn, movie, "Reproducir");
    return;
  }

  btn.removeAttribute("aria-disabled");
  btn.dataset.mode = "resume";

  const isSeries = movie.category === "series";
  const ep = Array.isArray(progress.episodes)
    ? (progress.episodes[0] || null)
    : (progress.episodes || null);

  const season = progress.season ?? ep?.season ?? "";
  const epNum = progress.episode_number ?? ep?.episode_number ?? "";
  const epTitle = progress.episode_title ?? ep?.title ?? "";
  const elapsedSeconds = Number(
    progress.progress_seconds ??
    progress.elapsed_seconds ??
    progress.elapsed ??
    0
  );
  const elapsed = formatElapsedOverlay(elapsedSeconds);

  const hasSeason = season !== "" && season != null;
  const hasEpisode = epNum !== "" && epNum != null;

  const tag = (hasSeason && hasEpisode)
    ? `T${Number(season)}E${Number(epNum)}`
    : "";

  const meta = [tag, epTitle].filter(Boolean).join(" ").trim();

  if (isSeries) {
    btn.href = progress.episode_id
      ? `/watch?series=${encodeURIComponent(movie.id)}&episode=${encodeURIComponent(progress.episode_id)}`
      : `/watch?series=${encodeURIComponent(movie.id)}`;
  } else {
    btn.href = `/watch?movie=${encodeURIComponent(movie.id)}`;
  }

  btn.setAttribute("aria-label", "Reanudar");
  btn.innerHTML =
    `Reanudar <span aria-hidden="true">▶</span>` +
    (meta || elapsed
      ? ` <span class="watch-meta">${escapeHtml(meta)}${elapsed ? ` · ${escapeHtml(elapsed)}` : ""}</span>`
      : "");
}

async function configureOverlayWatchButton(movie) {
  const btn = document.getElementById("title-overlay-watch-btn");
  if (!btn) return;

  if (!movie?.id) {
    setOverlayWatchBtnDisabled(btn, "No disponible");
    return;
  }

  const publishState = String(movie?.publish_state || "public").toLowerCase();

  if (publishState === "upcoming") {
    const label = String(movie?.publish_state_text || "").trim() || "Próximamente";
    setOverlayWatchBtnDisabled(btn, label);
    return;
  }

  if (publishState === "live") {
    const label = String(movie?.publish_state_text || "").trim() || "En Vivo";
    setOverlayWatchBtnPlay(btn, movie, label);
    return;
  }

  setOverlayWatchBtnPlay(btn, movie, "Reproducir");

  try {
    const progress = await fetchContinueWatchingForOverlay({ movieId: movie.id });
    if (progress) {
      setOverlayWatchBtnResume(btn, movie, progress);
    }
  } catch (e) {
    console.warn("[ui][overlay] no se pudo configurar reanudar:", e);
  }
}

/* =========================
   TITLE OVERLAY TRAILER VIDEO
========================= */

const TITLE_OVERLAY_VOLUME_ICON_MUTE = "https://satvplus.com.ar/images/svg/heromute.svg";
const TITLE_OVERLAY_VOLUME_ICON_UNMUTE = "https://satvplus.com.ar/images/svg/heroon.svg";

function clearTitleOverlayTrailerVideo() {
  const mediaRoot = document.getElementById("title-overlay-media");
  if (!mediaRoot) return;

  mediaRoot.classList.remove("title-overlay-video-ready");
  mediaRoot.querySelectorAll(".title-overlay-media-video-layer").forEach((n) => n.remove());
  mediaRoot.querySelectorAll(".title-overlay-volume-btn").forEach((n) => n.remove());
}

function mountTitleOverlayTrailerVideo(movie) {
  const mediaRoot = document.getElementById("title-overlay-media");
  if (!mediaRoot || !movie?.id) return;

  const trailerUrl = String(movie?.trailer_url || "").trim();
  const banner = movie?.banner_url || movie?.thumbnail_url || "";

  clearTitleOverlayTrailerVideo();
  mediaRoot.style.backgroundImage = banner ? `url("${banner}")` : "none";

  if (!trailerUrl) {
    return;
  }

  const layer = document.createElement("div");
  layer.className = "title-overlay-media-video-layer";

  const video = document.createElement("video");
  video.className = "title-overlay-media-video";
  video.src = trailerUrl;

  if (banner) video.poster = banner;

  video.autoplay = true;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");

  const shade = document.createElement("div");
  shade.className = "title-overlay-media-video-shade";

  layer.appendChild(video);
  layer.appendChild(shade);
  mediaRoot.prepend(layer);

  const volBtn = document.createElement("button");
  volBtn.type = "button";
  volBtn.className = "title-overlay-volume-btn";
  volBtn.setAttribute("aria-label", "Activar sonido");
  volBtn.setAttribute("aria-pressed", "false");

  const volIcon = document.createElement("img");
  volIcon.alt = "";
  volIcon.decoding = "async";
  volIcon.src = TITLE_OVERLAY_VOLUME_ICON_MUTE;
  volBtn.appendChild(volIcon);

  function syncVolumeUi() {
    const isMuted = !!video.muted;

    volIcon.src = isMuted
      ? TITLE_OVERLAY_VOLUME_ICON_MUTE
      : TITLE_OVERLAY_VOLUME_ICON_UNMUTE;

    volBtn.setAttribute("aria-label", isMuted ? "Activar sonido" : "Silenciar");
    volBtn.setAttribute("aria-pressed", String(!isMuted));
    volBtn.title = isMuted ? "Activar sonido" : "Silenciar";
  }

  volBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    video.muted = !video.muted;
    syncVolumeUi();

    const p = video.play?.();
    if (p && typeof p.catch === "function") {
      p.catch(() => { });
    }
  });

  const heroContent = mediaRoot.querySelector(".title-overlay-hero-content");
  (heroContent || mediaRoot).appendChild(volBtn);

  syncVolumeUi();

  video.addEventListener("error", () => {
    volBtn.remove();
    layer.remove();
    mediaRoot.classList.remove("title-overlay-video-ready");
    mediaRoot.style.backgroundImage = banner ? `url("${banner}")` : "none";
    console.warn("[ui][overlay] trailer error:", trailerUrl);
  }, { once: true });

  const showVideo = () => {
    mediaRoot.classList.add("title-overlay-video-ready");
  };

  video.addEventListener("loadeddata", showVideo, { once: true });
  video.addEventListener("canplay", showVideo, { once: true });

  requestAnimationFrame(() => {
    const p = video.play?.();

    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        console.warn("[ui][overlay] autoplay trailer bloqueado:", err);
        mediaRoot.classList.remove("title-overlay-video-ready");
      });
    }
  });
}

/* =========================
   TITLE OVERLAY MODAL
========================= */

const TITLE_OVERLAY_ID = "title-overlay-root";
const TITLE_OVERLAY_EPISODES_PAGE_SIZE = 10;
const TITLE_OVERLAY_ALL_EPISODES_VALUE = "__ALL__";

let __titleOverlayInit = false;
let __titleOverlayReq = 0;
let __titleOverlayLastFocused = null;
let __titleOverlaySeasonOutsideHandler = null;
let __titleOverlayEpisodesVisibleCount = TITLE_OVERLAY_EPISODES_PAGE_SIZE;

/* =========================
   MY LIST (overlay)
========================= */

const OVERLAY_MY_LIST_KEY = "satv_my_list_ids";

function getOverlayMyListIdsLocal() {
  try {
    const raw = localStorage.getItem(OVERLAY_MY_LIST_KEY);
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? [...new Set(arr.filter(Boolean).map(String))] : [];
  } catch {
    return [];
  }
}

function saveOverlayMyListIdsLocal(ids) {
  try {
    localStorage.setItem(
      OVERLAY_MY_LIST_KEY,
      JSON.stringify([...new Set((ids || []).filter(Boolean).map(String))])
    );
  } catch (_) { }
}

function isInOverlayMyListLocal(contentId) {
  return getOverlayMyListIdsLocal().includes(String(contentId));
}

function setOverlayLocalMyListMembership(contentId, added) {
  const id = String(contentId);
  const ids = getOverlayMyListIdsLocal();
  const exists = ids.includes(id);

  let next = ids;
  if (added && !exists) next = [...ids, id];
  if (!added && exists) next = ids.filter((x) => x !== id);

  saveOverlayMyListIdsLocal(next);
  return added;
}

function toggleOverlayLocalMyList(contentId) {
  const id = String(contentId);
  const ids = getOverlayMyListIdsLocal();
  const exists = ids.includes(id);
  const next = exists ? ids.filter((x) => x !== id) : [...ids, id];
  saveOverlayMyListIdsLocal(next);
  return !exists;
}

async function isInOverlayMyListRemote(profileId, contentId) {
  if (!profileId || !contentId) return false;

  const supabase = await getAppSupabaseClientSafe();
  if (!supabase) throw new Error("Supabase no disponible");

  const { data, error } = await supabase
    .from("my_list")
    .select("id")
    .eq("profile_id", profileId)
    .eq("content_id", contentId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

async function addToOverlayMyListRemote(profileId, contentId) {
  const supabase = await getAppSupabaseClientSafe();
  if (!supabase) throw new Error("Supabase no disponible");

  const payload = {
    profile_id: profileId,
    content_id: contentId,
    added_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("my_list")
    .upsert(payload, {
      onConflict: "profile_id,content_id",
      ignoreDuplicates: false
    });

  if (error) throw error;
  return true;
}

async function removeFromOverlayMyListRemote(profileId, contentId) {
  const supabase = await getAppSupabaseClientSafe();
  if (!supabase) throw new Error("Supabase no disponible");

  const { error } = await supabase
    .from("my_list")
    .delete()
    .eq("profile_id", profileId)
    .eq("content_id", contentId);

  if (error) throw error;
  return true;
}

async function resolveOverlayMyListState({ userId, contentId }) {
  const localAdded = isInOverlayMyListLocal(contentId);

  if (!userId) {
    return { added: localAdded, source: "local", isLoggedIn: false };
  }

  try {
    const remoteAdded = await isInOverlayMyListRemote(userId, contentId);
    setOverlayLocalMyListMembership(contentId, remoteAdded);
    return { added: remoteAdded, source: "supabase", isLoggedIn: true };
  } catch (e) {
    console.warn("[ui][overlay] resolveOverlayMyListState remote error; uso local:", e);
    return { added: localAdded, source: "local", isLoggedIn: true, error: e };
  }
}

function setOverlayMyListBtnState(btn, { contentId, added = false, pending = false, source = "unknown" } = {}) {
  if (!btn) return;

  btn.dataset.myListContentId = contentId ? String(contentId) : "";
  btn.dataset.myListState = added ? "in" : "out";
  btn.dataset.myListPending = pending ? "1" : "0";
  btn.dataset.myListSource = source;

  btn.setAttribute("aria-pressed", String(!!added));
  btn.setAttribute("aria-label", added ? "Quitar de Mi Lista" : "Agregar a Mi Lista");
  btn.classList.toggle("is-active", !!added);

  try {
    btn.disabled = !!pending;
  } catch (_) { }

  const label = pending ? "Actualizando…" : (added ? "En Mi Lista" : "Mi Lista");
  const labelNode = btn.querySelector(".home-hero-mylist-label");
  if (labelNode) labelNode.textContent = label;
}

async function refreshOverlayMyListButton(btn, { userId, contentId }) {
  if (!btn || !contentId) return null;

  setOverlayMyListBtnState(btn, {
    contentId,
    added: isInOverlayMyListLocal(contentId),
    pending: true,
    source: "unknown"
  });

  const state = await resolveOverlayMyListState({ userId, contentId });

  setOverlayMyListBtnState(btn, {
    contentId,
    added: state.added,
    pending: false,
    source: state.source
  });

  return state;
}

async function bindOverlayMyListButton(movie) {
  const btn = document.querySelector("#title-overlay-root .title-overlay-mylist");
  if (!btn || !movie?.id) return;

  const session = await getSession();
  const userId = getUserIdFromSession(session);
  const contentId = String(movie.id);

  btn.dataset.myListContentId = contentId;

  refreshOverlayMyListButton(btn, { userId, contentId }).catch(() => {
    setOverlayMyListBtnState(btn, {
      contentId,
      added: isInOverlayMyListLocal(contentId),
      pending: false,
      source: "local"
    });
  });

  if (btn.dataset.overlayMyListBound === "1") return;
  btn.dataset.overlayMyListBound = "1";

  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    const currentId = btn.dataset.myListContentId || contentId;
    if (!currentId) return;
    if (btn.dataset.myListPending === "1") return;

    const latestSession = await getSession();
    const latestUserId = getUserIdFromSession(latestSession);

    setOverlayMyListBtnState(btn, {
      contentId: currentId,
      added: btn.dataset.myListState === "in",
      pending: true,
      source: btn.dataset.myListSource || "unknown"
    });

    try {
      const state = await resolveOverlayMyListState({
        userId: latestUserId,
        contentId: currentId
      });

      if (state.source === "supabase" && latestUserId) {
        if (state.added) {
          await removeFromOverlayMyListRemote(latestUserId, currentId);
          setOverlayLocalMyListMembership(currentId, false);
          setOverlayMyListBtnState(btn, {
            contentId: currentId,
            added: false,
            pending: false,
            source: "supabase"
          });
          toast?.("Quitado de Mi Lista.", "success");
        } else {
          await addToOverlayMyListRemote(latestUserId, currentId);
          setOverlayLocalMyListMembership(currentId, true);
          setOverlayMyListBtnState(btn, {
            contentId: currentId,
            added: true,
            pending: false,
            source: "supabase"
          });
          toast?.("Agregado a Mi Lista.", "success");
        }
        return;
      }

      const added = toggleOverlayLocalMyList(currentId);
      setOverlayMyListBtnState(btn, {
        contentId: currentId,
        added,
        pending: false,
        source: "local"
      });
      toast?.(
        added ? "Agregado a Mi Lista (local)." : "Quitado de Mi Lista (local).",
        "success"
      );
    } catch (e) {
      console.warn("[ui][overlay] toggle Mi Lista error:", e);
      try {
        await refreshOverlayMyListButton(btn, {
          userId: latestUserId,
          contentId: currentId
        });
      } catch {
        setOverlayMyListBtnState(btn, {
          contentId: currentId,
          added: isInOverlayMyListLocal(currentId),
          pending: false,
          source: "local"
        });
      }
      toast?.("No se pudo actualizar Mi Lista.", "error");
    }
  }, { passive: false });
}

/* =========================
   TITLE OVERLAY HELPERS
========================= */

function getMovieCategoryLabel(movie) {
  const raw = String(movie?.category || "").toLowerCase();
  if (raw === "series") return "Serie";
  if (raw === "movie") return "Película";
  return "Título";
}

function formatDurationMinutes(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return "";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} h ${rem} min` : `${h} h`;
}

function qvPlural(n, one, many) {
  return Number(n) === 1 ? one : many;
}

function isPositiveIntegerLike(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && Number.isInteger(n);
}

function deriveOverlaySeriesCounts(movie, episodes) {
  const list = Array.isArray(episodes) ? episodes : [];
  const seasonSet = new Set();

  for (const ep of list) {
    const seasonRaw = ep?.season;
    if (seasonRaw !== null && seasonRaw !== undefined && seasonRaw !== "") {
      seasonSet.add(String(seasonRaw));
    }
  }

  const mm = movie?.movie_meta || null;
  const metaSeasons = Number(mm?.seasons_count);
  const metaEpisodes = Number(mm?.episodes_count);

  const seasonsCount = seasonSet.size >= 1
    ? seasonSet.size
    : (isPositiveIntegerLike(metaSeasons) ? metaSeasons : 0);

  const episodesCount = list.length >= 1
    ? list.length
    : (isPositiveIntegerLike(metaEpisodes) ? metaEpisodes : 0);

  return {
    seasonsCount,
    episodesCount
  };
}

function formatOverlaySeriesMeta(movie, episodes) {
  const { seasonsCount, episodesCount } = deriveOverlaySeriesCounts(movie, episodes);

  if (Number.isFinite(seasonsCount) && seasonsCount >= 2) {
    return `${seasonsCount} ${qvPlural(seasonsCount, "temporada", "temporadas")}`;
  }

  if (Number.isFinite(seasonsCount) && seasonsCount === 1) {
    if (Number.isFinite(episodesCount) && episodesCount === 1) return "1 episodio";
    if (Number.isFinite(episodesCount) && episodesCount >= 2) return `${episodesCount} episodios`;
    return "1 temporada";
  }

  if (Number.isFinite(episodesCount) && episodesCount === 1) return "1 episodio";
  if (Number.isFinite(episodesCount) && episodesCount >= 2) return `${episodesCount} episodios`;

  return "";
}

function buildOverlayMetaLine(movie, episodes = []) {
  const year = movie?.release_year ? String(movie.release_year) : "";
  let right = "";

  if (movie?.category === "series") {
    right = formatOverlaySeriesMeta(movie, episodes);
  } else {
    right = formatDurationMinutes(movie?.duration_minutes);
  }

  return [year, right].filter(Boolean).join(" · ");
}

function parseTitleOverlayHref(href) {
  try {
    const url = new URL(href, window.location.origin);
    const pathname = url.pathname || "";
    if (!pathname.startsWith("/title")) return null;

    return {
      href: `${url.pathname}${url.search}${url.hash}`,
      movieId: url.searchParams.get("title") || url.searchParams.get("movie") || null,
      collectionId: url.searchParams.get("collection") || null,
      episodeId: url.searchParams.get("episode") || null
    };
  } catch {
    return null;
  }
}

function clearOverlaySeasonOutsideHandler() {
  if (__titleOverlaySeasonOutsideHandler) {
    document.removeEventListener("click", __titleOverlaySeasonOutsideHandler, true);
    __titleOverlaySeasonOutsideHandler = null;
  }
}

function closeOverlaySeasonDropdown() {
  const mount = document.getElementById("title-overlay-season-filter");
  if (!mount) return;
  const dropdown = mount.querySelector(".dropdown");
  const selected = mount.querySelector(".dropdown-selected");
  dropdown?.classList.remove("open");
  selected?.setAttribute("aria-expanded", "false");
  clearOverlaySeasonOutsideHandler();
}

function pickOverlayEpisodeThumb(ep, fallbackThumb = "") {
  return ep?.thumbnail_episode || ep?.["thumbnails-episode"] || ep?.thumb || fallbackThumb || "";
}

function groupOverlayEpisodesBySeason(episodes = []) {
  const map = new Map();

  for (const ep of episodes || []) {
    const seasonValue = ep?.season;
    const season = (seasonValue !== null && seasonValue !== undefined && seasonValue !== "")
      ? seasonValue
      : 1;

    if (!map.has(season)) map.set(season, []);
    map.get(season).push(ep);
  }

  for (const [, list] of map) {
    list.sort((a, b) => Number(a?.episode_number || 0) - Number(b?.episode_number || 0));
  }

  return [...map.entries()].sort((a, b) => {
    const na = Number(a[0]);
    const nb = Number(b[0]);

    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a[0]).localeCompare(String(b[0]), "es");
  });
}

function getFirstItemsText(value, limit = 3, { capitalize = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return "—";

  const parts = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, limit);

  if (!parts.length) return "—";

  let joined = parts.join(", ");

  if (capitalize) {
    joined = joined.toLowerCase().replace(/\b\p{L}/gu, (match) => match.toUpperCase());
  }

  return joined;
}

function renderOverlayEpisodeCardHtml({ ep, movieId, fallbackThumb = "", progressMap = new Map() }) {
  const thumb = pickOverlayEpisodeThumb(ep, fallbackThumb);
  const season = ep?.season ?? "";
  const episodeNumber = ep?.episode_number ?? "";

  const tag =
    season !== "" && season != null && episodeNumber !== "" && episodeNumber != null
      ? `T${season}E${episodeNumber}`
      : episodeNumber !== "" && episodeNumber != null
        ? `E${episodeNumber}`
        : season !== "" && season != null
          ? `T${season}`
          : "";

  const title = [tag, ep?.title || ""].filter(Boolean).join(" ").trim();
  const synopsis = String(ep?.sinopsis || "").trim();
  const href = `/watch?series=${encodeURIComponent(movieId)}&episode=${encodeURIComponent(ep?.id || "")}`;

  const progress = progressMap?.get?.(ep?.id) || null;
  const progressPercent = Math.max(0, Math.min(100, Number(progress?.percent || 0)));
  const hasProgress = progressPercent > 0;

  return `
    <article
      class="title-overlay-episode-card is-clickable"
      tabindex="0"
      role="link"
      data-href="${escapeHtml(href)}"
      data-episode-id="${escapeHtml(String(ep?.id || ""))}"
    >
      <div class="title-overlay-episode-thumb-wrap">
        <img
          class="title-overlay-episode-thumb-img"
          src="${escapeHtml(thumb)}"
          alt="${escapeHtml(title || "Episodio")}"
          loading="lazy"
          decoding="async"
        />
        ${hasProgress ? `
          <div class="title-overlay-episode-progress" aria-hidden="true">
            <div
              class="title-overlay-episode-progress-bar"
              style="width:${progressPercent}%;"
            ></div>
          </div>
        ` : ""}
      </div>

      <div class="title-overlay-episode-body">
        <div class="title-overlay-episode-title">${escapeHtml(title || "Episodio")}</div>
        ${synopsis ? `<div class="title-overlay-episode-synopsis">${escapeHtml(synopsis)}</div>` : ""}
      </div>
    </article>
  `;
}

function bindOverlayEpisodeCardHoverState(rootEl) {
  if (!rootEl) return;

  const cards = Array.from(rootEl.querySelectorAll(".title-overlay-episode-card"));
  if (!cards.length) return;

  const clearState = () => {
    cards.forEach((card) => {
      card.classList.remove("is-hovered", "is-before-hover");
    });
  };

  const applyState = (card) => {
    clearState();
    if (!card) return;

    card.classList.add("is-hovered");

    const prev = card.previousElementSibling;
    if (prev && prev.classList.contains("title-overlay-episode-card")) {
      prev.classList.add("is-before-hover");
    }
  };

  cards.forEach((card) => {
    card.addEventListener("mouseenter", () => applyState(card));
    card.addEventListener("focusin", () => applyState(card));

    card.addEventListener("mouseleave", () => {
      const activeInside = card.contains(document.activeElement);
      if (!activeInside) clearState();
    });

    card.addEventListener("focusout", () => {
      requestAnimationFrame(() => {
        const activeCard = document.activeElement?.closest?.(".title-overlay-episode-card");
        if (activeCard && rootEl.contains(activeCard)) {
          applyState(activeCard);
          return;
        }
        clearState();
      });
    });
  });

  rootEl.addEventListener("mouseleave", clearState);
}

function bindOverlayEpisodeCardNavigation(rootEl) {
  if (!rootEl) return;

  bindOverlayEpisodeCardHoverState(rootEl);

  rootEl.querySelectorAll(".title-overlay-episode-card[data-href]").forEach((card) => {
    const go = () => {
      const href = card.getAttribute("data-href");
      if (!href) return;
      closeTitleOverlay();
      window.location.href = href;
    };

    card.addEventListener("click", go);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  });
}

/* =========================
   OTROS TITULOS
========================= */

function buildOverlayCardHref(item) {
  return buildTitleUrl(item?.id, {
    collectionId: item?.collection_id || null
  });
}

function renderOverlayRelatedTitleCardHtml(item) {
  const thumb = item?.thumbnail_url || item?.banner_url || "";
  const href = buildOverlayCardHref(item);
  const categoryLabel = getMovieCategoryLabel(item);
  const metaLine = buildOverlayMetaLine(item, []);
  const synopsis = String(item?.description || item?.sinopsis || "").trim();

  return `
    <article
      class="title-overlay-related-card is-clickable"
      tabindex="0"
      role="link"
      data-href="${escapeHtml(href)}"
      data-title-id="${escapeHtml(String(item?.id || ""))}"
    >
      <div class="title-overlay-related-thumb-wrap">
        <img
          class="title-overlay-related-thumb-img"
          src="${escapeHtml(thumb)}"
          alt="${escapeHtml(item?.title || "Título")}"
          loading="lazy"
          decoding="async"
        />
      </div>

      <div class="title-overlay-related-body">
        <div class="title-overlay-related-category">${escapeHtml(categoryLabel)}</div>
        <div class="title-overlay-related-title">${escapeHtml(item?.title || "Sin título")}</div>
        ${metaLine ? `<div class="title-overlay-related-meta">${escapeHtml(metaLine)}</div>` : ""}
        ${synopsis ? `<div class="title-overlay-related-synopsis">${escapeHtml(synopsis)}</div>` : ""}
      </div>
    </article>
  `;
}

function bindOverlayRelatedCardNavigation(rootEl) {
  if (!rootEl) return;

  rootEl.querySelectorAll(".title-overlay-related-card[data-href]").forEach((card) => {
    const go = async () => {
      const href = card.getAttribute("data-href");
      if (!href) return;
      await openTitleOverlayFromHref(href);
    };

    card.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void go();
    });

    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        void go();
      }
    });
  });
}

async function fetchOverlayRelatedTitles(currentMovie) {
  try {
    if (typeof fetchMovies !== "function") {
      console.warn("[ui][overlay] fetchMovies no está disponible");
      return [];
    }

    const currentId = String(currentMovie?.id || "");
    const all = await fetchMovies({ excludeMovieId: currentId });

    if (!Array.isArray(all)) return [];
    return all;
  } catch (e) {
    console.warn("[ui][overlay] no se pudieron cargar otros títulos:", e);
    return [];
  }
}

async function renderTitleOverlayRelatedTitles(movie) {
  const grid = document.getElementById("title-overlay-related-grid");
  if (!grid) return;

  grid.innerHTML = `<div class="title-overlay-empty">Cargando otros títulos…</div>`;

  const items = await fetchOverlayRelatedTitles(movie);

  if (!items.length) {
    grid.innerHTML = `<div class="title-overlay-empty">No hay otros títulos para mostrar.</div>`;
    return;
  }

  grid.innerHTML = items.map(renderOverlayRelatedTitleCardHtml).join("");
  bindOverlayRelatedCardNavigation(grid);
}

function renderOverlaySeasonDropdown({
  mount,
  groupedEpisodes,
  currentSeason,
  onChange
}) {
  if (!mount) return;

  const seasons = groupedEpisodes.map(([season]) => season);

  if (seasons.length <= 1) {
    mount.hidden = true;
    mount.innerHTML = "";
    return;
  }

  mount.hidden = false;

  const isAllSelected = String(currentSeason) === TITLE_OVERLAY_ALL_EPISODES_VALUE;
  const selectedLabel = isAllSelected
    ? "Todos los episodios"
    : `Temporada ${String(currentSeason)}`;

  const mountWidth = groupedEpisodes.reduce((acc, [, list]) => acc + list.length, 0);

  mount.innerHTML = `
    <div class="dropdown" data-overlay-season-dropdown="1">
      <div
        class="dropdown-selected"
        role="button"
        tabindex="0"
        aria-haspopup="true"
        aria-expanded="false"
      >
        <span class="dropdown-text">${escapeHtml(selectedLabel)}</span>
        <span class="dropdown-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M7 10L12 15L17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </div>

      <div class="dropdown-options">
        ${groupedEpisodes.map(([season, list]) => `
          <div
            class="dropdown-option"
            role="button"
            tabindex="0"
            data-overlay-season="${escapeHtml(String(season))}"
          >
            <span class="dropdown-option-main">Temporada ${escapeHtml(String(season))}</span>
            <span class="dropdown-option-count">(${list.length} episodios)</span>
          </div>
        `).join("")}

        <div class="dropdown-separator" role="separator" aria-hidden="true"></div>

        <div
          class="dropdown-option alleps"
          role="button"
          tabindex="0"
          data-overlay-season="${TITLE_OVERLAY_ALL_EPISODES_VALUE}"
        >
          <span class="dropdown-option-main">Todos los episodios</span>
        </div>
      </div>
    </div>
  `;

  void mountWidth; // mantiene estructura sin warnings si no usás el total

  const dropdown = mount.querySelector(".dropdown");
  const selected = mount.querySelector(".dropdown-selected");

  const open = () => {
    dropdown?.classList.add("open");
    selected?.setAttribute("aria-expanded", "true");

    clearOverlaySeasonOutsideHandler();
    __titleOverlaySeasonOutsideHandler = (e) => {
      if (!mount.contains(e.target)) {
        closeOverlaySeasonDropdown();
      }
    };
    document.addEventListener("click", __titleOverlaySeasonOutsideHandler, true);
  };

  const close = () => {
    closeOverlaySeasonDropdown();
  };

  selected?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropdown?.classList.contains("open")) close();
    else open();
  });

  selected?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (dropdown?.classList.contains("open")) close();
      else open();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });

  mount.querySelectorAll("[data-overlay-season]").forEach((opt) => {
    const apply = () => {
      const seasonValue = opt.getAttribute("data-overlay-season");

      if (String(seasonValue) === TITLE_OVERLAY_ALL_EPISODES_VALUE) {
        close();
        onChange?.(TITLE_OVERLAY_ALL_EPISODES_VALUE);
        return;
      }

      const match = seasons.find((s) => String(s) === String(seasonValue));
      if (match === undefined) return;
      close();
      onChange?.(match);
    };

    opt.addEventListener("click", apply);
    opt.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        apply();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    });
  });
}

function renderTitleOverlayEpisodes(movie, episodes = [], progressMap = new Map()) {
  const block = document.getElementById("title-overlay-episodes-block");
  const titleEl = document.getElementById("title-overlay-episodes-title");
  const filterMount = document.getElementById("title-overlay-season-filter");
  const grid = document.getElementById("title-overlay-episodes-grid");
  const moreWrap = document.getElementById("title-overlay-episodes-more");
  const loadMoreBtn = document.getElementById("title-overlay-load-more-episodes");

  if (!block || !titleEl || !filterMount || !grid || !moreWrap || !loadMoreBtn) return;

  closeOverlaySeasonDropdown();
  __titleOverlayEpisodesVisibleCount = TITLE_OVERLAY_EPISODES_PAGE_SIZE;

  if (movie?.category !== "series" || !Array.isArray(episodes) || !episodes.length) {
    block.hidden = true;
    filterMount.hidden = true;
    filterMount.innerHTML = "";
    grid.innerHTML = "";
    moreWrap.hidden = true;
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = "Cargar más episodios";
    return;
  }

  block.hidden = false;
  titleEl.textContent = "Episodios";

  const grouped = groupOverlayEpisodesBySeason(episodes);
  const seasons = grouped.map(([season]) => season);
  let currentSeason = seasons[0];
  const fallbackThumb = movie?.thumbnail_url || movie?.banner_url || "";

  const getCurrentList = () => {
    if (String(currentSeason) === TITLE_OVERLAY_ALL_EPISODES_VALUE) {
      return grouped.flatMap(([, list]) => list);
    }

    return grouped.find(([season]) => String(season) === String(currentSeason))?.[1] || [];
  };

  const paintSeason = () => {
    const list = getCurrentList();
    const visibleItems = list.slice(0, __titleOverlayEpisodesVisibleCount);

    grid.innerHTML = visibleItems.map((ep) =>
      renderOverlayEpisodeCardHtml({
        ep,
        movieId: movie?.id,
        fallbackThumb,
        progressMap
      })
    ).join("");

    bindOverlayEpisodeCardNavigation(grid);

    const hasMore = list.length > visibleItems.length;
    const canCollapse =
      list.length > TITLE_OVERLAY_EPISODES_PAGE_SIZE &&
      __titleOverlayEpisodesVisibleCount >= list.length;

    moreWrap.hidden = !(hasMore || canCollapse);
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = hasMore ? "Cargar más episodios" : "Cargar menos";
  };

  const renderSeason = (seasonValue) => {
    currentSeason = seasonValue;
    __titleOverlayEpisodesVisibleCount = TITLE_OVERLAY_EPISODES_PAGE_SIZE;

    renderOverlaySeasonDropdown({
      mount: filterMount,
      groupedEpisodes: grouped,
      currentSeason,
      onChange: renderSeason
    });

    paintSeason();
  };

  loadMoreBtn.onclick = () => {
    const list = getCurrentList();
    const hasMore = __titleOverlayEpisodesVisibleCount < list.length;

    if (hasMore) {
      __titleOverlayEpisodesVisibleCount += TITLE_OVERLAY_EPISODES_PAGE_SIZE;
    } else {
      __titleOverlayEpisodesVisibleCount = TITLE_OVERLAY_EPISODES_PAGE_SIZE;
    }

    paintSeason();
  };

  if (seasons.length <= 1) {
    filterMount.hidden = true;
    filterMount.innerHTML = "";
  }

  renderSeason(currentSeason);
}

function renderTitleOverlayFullInfo(movie) {
  const info = document.getElementById("title-overlay-info");
  if (!info) return;

  const mm = movie?.movie_meta || null;
  const durText = movie?.category === "movie"
    ? formatDurationMinutes(movie?.duration_minutes)
    : "";

  function infoRow(label, value) {
    const safe = String(value || "").trim();
    if (!safe) return "";
    return `
      <div class="title-overlay-info-row">
        <div class="title-overlay-info-label">${escapeHtml(label)}</div>
        <div class="title-overlay-info-value">${escapeHtml(safe)}</div>
      </div>
    `;
  }

  const html = `
    ${durText ? infoRow("Duración", durText) : ""}
    ${infoRow("Creado por", mm?.created_by)}
    ${infoRow("Elenco", mm?.fullcast)}
    ${infoRow("Guion", mm?.fullscript)}
    ${infoRow("Géneros", mm?.fullgenres)}
    ${infoRow("Tipo", mm?.fulltitletype)}
    ${infoRow("Edad", mm?.fullage)}
  `;

  info.innerHTML = html || `
    <div class="title-overlay-empty">Sin información cargada todavía.</div>
  `;
}

function ensureTitleOverlayModal() {
  let root = document.getElementById(TITLE_OVERLAY_ID);
  if (root) return root;

  root = document.createElement("div");
  root.id = TITLE_OVERLAY_ID;
  root.className = "title-overlay-backdrop";
  root.hidden = true;
  root.inert = true;
  root.setAttribute("aria-hidden", "true");
  root.style.display = "none";

  root.innerHTML = `
    <div class="title-overlay-modal" role="dialog" aria-modal="true" aria-labelledby="title-overlay-title">
      <button
        type="button"
        class="title-overlay-close"
        data-title-overlay-close
        aria-label="Cerrar"
      >
        <i class="fa-solid fa-xmark"></i>
      </button>

      <div class="title-overlay-media" id="title-overlay-media">
        <div class="title-overlay-media-shade"></div>

        <div class="title-overlay-hero-content">
          <div class="title-overlay-pillrow" id="title-overlay-pillrow"></div>

          <h2 class="title-overlay-title" id="title-overlay-title">Cargando…</h2>
          <div class="title-overlay-meta" id="title-overlay-meta"></div>
          <p class="title-overlay-description" id="title-overlay-description"></p>

          <div class="title-overlay-actions">
            <a class="btn" id="title-overlay-watch-btn" href="#">
              Reproducir
            </a>

            <button
              class="btn ghost home-hero-mylist title-overlay-mylist"
              type="button"
              aria-label="Agregar a Mi Lista"
              aria-pressed="false"
            >
              <svg class="home-hero-mylist-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1920" aria-hidden="true" focusable="false">
                <path d="M866.332 213v653.332H213v186.666h653.332v653.332h186.666v-653.332h653.332V866.332h-653.332V213z" fill-rule="evenodd"/>
              </svg>
              <span class="home-hero-mylist-label">Mi Lista</span>
            </button>
          </div>
        </div>
      </div>

      <div class="title-overlay-body">
        <div class="title-overlay-grid">
          <div class="title-overlay-main">
            <section
              class="title-overlay-block title-overlay-episodes-block episodios"
              id="title-overlay-episodes-block"
              hidden
            >
              <div class="title-overlay-episodes-head">
                <h3 class="title-overlay-block-title" id="title-overlay-episodes-title">Episodios</h3>
                <div
                  class="title-overlay-season-filter"
                  id="title-overlay-season-filter"
                  hidden
                ></div>
              </div>

              <div class="title-overlay-episodes-grid" id="title-overlay-episodes-grid"></div>

              <div
                class="title-overlay-episodes-more"
                id="title-overlay-episodes-more"
                hidden
              >
                <button
                  type="button"
                  class="btn ghost"
                  id="title-overlay-load-more-episodes"
                >
                  Cargar más episodios
                </button>
              </div>
            </section>

            <section class="title-overlay-block otroseps">
              <h3 class="title-overlay-block-title">Otros títulos</h3>
              <div class="title-overlay-related-grid" id="title-overlay-related-grid"></div>
            </section>
          </div>

          <section class="title-overlay-block inforapida">
            <h3 class="title-overlay-block-title">Info rápida</h3>
            <div class="title-overlay-side-list" id="title-overlay-side-list"></div>
          </section>

          <aside class="title-overlay-side">
            <section class="title-overlay-block">
              <h3 class="title-overlay-block-title">Información completa</h3>
              <div class="title-overlay-info" id="title-overlay-info"></div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  root.addEventListener("click", (e) => {
    if (e.target === root) {
      closeTitleOverlay();
    }
  });

  root.querySelectorAll("[data-title-overlay-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeTitleOverlay());
  });

  document.addEventListener("keydown", (e) => {
    if (root.hidden) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeTitleOverlay();
      return;
    }

    if (e.key !== "Tab") return;

    const focusables = Array.from(
      root.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute("hidden"));

    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
      return;
    }

    if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
      return;
    }
  });

  return root;
}

function setTitleOverlayLoadingState() {
  const media = document.getElementById("title-overlay-media");
  const title = document.getElementById("title-overlay-title");
  const meta = document.getElementById("title-overlay-meta");
  const desc = document.getElementById("title-overlay-description");
  const relatedGrid = document.getElementById("title-overlay-related-grid");
  const side = document.getElementById("title-overlay-side-list");
  const pillrow = document.getElementById("title-overlay-pillrow");
  const watchBtn = document.getElementById("title-overlay-watch-btn");
  const info = document.getElementById("title-overlay-info");
  const episodesBlock = document.getElementById("title-overlay-episodes-block");
  const episodesGrid = document.getElementById("title-overlay-episodes-grid");
  const seasonFilter = document.getElementById("title-overlay-season-filter");
  const episodesMore = document.getElementById("title-overlay-episodes-more");
  const loadMoreBtn = document.getElementById("title-overlay-load-more-episodes");
  const myListBtn = document.querySelector("#title-overlay-root .title-overlay-mylist");

  closeOverlaySeasonDropdown();
  __titleOverlayEpisodesVisibleCount = TITLE_OVERLAY_EPISODES_PAGE_SIZE;

  clearTitleOverlayTrailerVideo();
  if (media) media.style.backgroundImage = "none";
  if (title) title.textContent = "Cargando título…";
  if (meta) meta.textContent = "";
  if (desc) desc.textContent = "";
  if (pillrow) pillrow.innerHTML = "";
  if (relatedGrid) relatedGrid.innerHTML = `<div class="title-overlay-empty">Estamos preparando la vista rápida.</div>`;
  if (side) side.innerHTML = "";
  if (info) info.innerHTML = "";
  if (watchBtn) {
    watchBtn.href = "#";
    watchBtn.innerHTML = "Cargando…";
    watchBtn.dataset.mode = "loading";
    watchBtn.setAttribute("aria-disabled", "true");
  }
  if (episodesBlock) episodesBlock.hidden = true;
  if (episodesGrid) episodesGrid.innerHTML = "";
  if (seasonFilter) {
    seasonFilter.hidden = true;
    seasonFilter.innerHTML = "";
  }
  if (episodesMore) episodesMore.hidden = true;
  if (loadMoreBtn) {
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = "Cargar más episodios";
  }

  if (myListBtn) {
    setOverlayMyListBtnState(myListBtn, {
      contentId: "",
      added: false,
      pending: false,
      source: "unknown"
    });
  }
}

function renderTitleOverlayError() {
  const media = document.getElementById("title-overlay-media");
  const title = document.getElementById("title-overlay-title");
  const meta = document.getElementById("title-overlay-meta");
  const desc = document.getElementById("title-overlay-description");
  const relatedGrid = document.getElementById("title-overlay-related-grid");
  const side = document.getElementById("title-overlay-side-list");
  const pillrow = document.getElementById("title-overlay-pillrow");
  const watchBtn = document.getElementById("title-overlay-watch-btn");
  const info = document.getElementById("title-overlay-info");
  const episodesBlock = document.getElementById("title-overlay-episodes-block");
  const episodesGrid = document.getElementById("title-overlay-episodes-grid");
  const seasonFilter = document.getElementById("title-overlay-season-filter");
  const episodesMore = document.getElementById("title-overlay-episodes-more");
  const loadMoreBtn = document.getElementById("title-overlay-load-more-episodes");

  closeOverlaySeasonDropdown();

  clearTitleOverlayTrailerVideo();
  if (media) media.style.backgroundImage = "none";
  if (title) title.textContent = "No pudimos abrir esta vista";
  if (meta) meta.textContent = "";
  if (desc) desc.textContent = "No se pudieron cargar los detalles del título.";
  if (pillrow) pillrow.innerHTML = "";
  if (relatedGrid) relatedGrid.innerHTML = `<div class="title-overlay-empty">No se pudieron cargar otros títulos.</div>`;
  if (side) side.innerHTML = "";
  if (watchBtn) setOverlayWatchBtnDisabled(watchBtn, "No disponible");
  if (info) info.innerHTML = `<div class="title-overlay-empty">No se pudo cargar la información completa.</div>`;
  if (episodesBlock) episodesBlock.hidden = true;
  if (episodesGrid) episodesGrid.innerHTML = "";
  if (seasonFilter) {
    seasonFilter.hidden = true;
    seasonFilter.innerHTML = "";
  }
  if (episodesMore) episodesMore.hidden = true;
  if (loadMoreBtn) {
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = "Cargar más episodios";
  }
}

async function renderTitleOverlayContent({ movie, episodes = [], progressMap = new Map() }) {
  const media = document.getElementById("title-overlay-media");
  const title = document.getElementById("title-overlay-title");
  const meta = document.getElementById("title-overlay-meta");
  const desc = document.getElementById("title-overlay-description");
  const relatedGrid = document.getElementById("title-overlay-related-grid");
  const side = document.getElementById("title-overlay-side-list");
  const pillrow = document.getElementById("title-overlay-pillrow");

  const banner = movie?.banner_url || movie?.thumbnail_url || "";
  const categoryLabel = getMovieCategoryLabel(movie);
  const badgeLabel = getMovieBadgeLabel(movie);
  const metaLine = buildOverlayMetaLine(movie, episodes);
  const description = movie?.description || movie?.sinopsis || "Sin descripción disponible.";
  const counts = deriveOverlaySeriesCounts(movie, episodes);

  if (media) {
    media.style.backgroundImage = banner ? `url("${banner}")` : "none";
  }
  mountTitleOverlayTrailerVideo(movie);

  if (title) title.textContent = movie?.title || "Sin título";
  if (meta) meta.textContent = metaLine;
  if (desc) desc.textContent = description;

  if (pillrow) {
    pillrow.innerHTML = `
      <span class="title-overlay-pill">${escapeHtml(categoryLabel)}</span>
      ${badgeLabel ? `<span class="title-overlay-pill is-accent">${escapeHtml(badgeLabel)}</span>` : ""}
    `;
  }

  if (relatedGrid) {
    relatedGrid.innerHTML = `<div class="title-overlay-empty">Cargando otros títulos…</div>`;
  }

  if (side) {
    const mm = movie?.movie_meta || null;
    const year = movie?.release_year ? String(movie.release_year) : "—";

    const sideItems = [
      { label: "Elenco", value: getFirstItemsText(mm?.fullcast, 3) },
      { label: "Géneros", value: getFirstItemsText(mm?.fullgenres, 3) },
      { label: "Este título es", value: getFirstItemsText(mm?.fulltitletype, 3, { capitalize: true }) },
      { label: "Año", value: year },
      { label: "Categoría", value: categoryLabel }
    ];

    if (movie?.category === "series") {
      sideItems.push({ label: "Temporadas", value: counts.seasonsCount ? String(counts.seasonsCount) : "—" });
      sideItems.push({ label: "Episodios", value: counts.episodesCount ? String(counts.episodesCount) : "—" });
    } else {
      sideItems.push({ label: "Duración", value: formatDurationMinutes(movie?.duration_minutes) || "—" });
    }

    side.innerHTML = sideItems.map((item) => `
      <div class="title-overlay-side-item">
        <span class="title-overlay-side-k">${escapeHtml(item.label)}</span>
        <span class="title-overlay-side-v">${escapeHtml(item.value)}</span>
      </div>
    `).join("");
  }

  renderTitleOverlayFullInfo(movie);
  renderTitleOverlayEpisodes(movie, episodes, progressMap);
  await renderTitleOverlayRelatedTitles(movie);
  await configureOverlayWatchButton(movie);
  await bindOverlayMyListButton(movie);
}

export function openTitleOverlay() {
  const root = ensureTitleOverlayModal();
  __titleOverlayLastFocused = document.activeElement || null;

  root.hidden = false;
  root.inert = false;
  root.style.display = "block";
  root.setAttribute("aria-hidden", "false");
  root.scrollTop = 0;

  document.body.classList.add("title-overlay-open");
  document.documentElement.classList.add("title-overlay-open");
  document.body.style.overflow = "hidden";
  document.documentElement.style.overflow = "hidden";

  requestAnimationFrame(() => {
    const focusEl = root.querySelector(".title-overlay-close");
    try {
      focusEl?.focus?.();
    } catch (_) { }
  });
}

export function closeTitleOverlay() {
  const root = document.getElementById(TITLE_OVERLAY_ID);
  if (!root) return;

  clearOverlaySeasonOutsideHandler();
  clearTitleOverlayTrailerVideo();

  const focusTarget =
    __titleOverlayLastFocused && document.contains(__titleOverlayLastFocused)
      ? __titleOverlayLastFocused
      : document.body;

  root.inert = true;
  root.hidden = true;
  root.style.display = "none";
  root.setAttribute("aria-hidden", "true");

  document.body.classList.remove("title-overlay-open");
  document.documentElement.classList.remove("title-overlay-open");
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";

  try {
    focusTarget.focus?.();
  } catch (_) { }
}

export async function openTitleOverlayFromHref(href) {
  const parsed = parseTitleOverlayHref(href);
  if (!parsed?.movieId) {
    window.location.href = href;
    return;
  }

  const requestId = ++__titleOverlayReq;

  openTitleOverlay();
  setTitleOverlayLoadingState();

  try {
    const movie = await fetchMovie(parsed.movieId);
    if (requestId !== __titleOverlayReq) return;

    if (!movie) {
      renderTitleOverlayError();
      return;
    }

    let episodes = [];
    let progressMap = new Map();

    try {
      if (movie?.category === "series" && typeof fetchEpisodes === "function") {
        episodes = await fetchEpisodes(movie.id);
      }
    } catch (e) {
      console.warn("[ui][overlay] no se pudieron cargar episodios:", e);
      episodes = [];
    }

    try {
      if (movie?.category === "series") {
        progressMap = await fetchEpisodeProgressMapForOverlay({ movieId: movie.id });
      }
    } catch (e) {
      console.warn("[ui][overlay] no se pudo cargar progreso de episodios:", e);
      progressMap = new Map();
    }

    if (requestId !== __titleOverlayReq) return;

    await renderTitleOverlayContent({
      movie,
      episodes: Array.isArray(episodes) ? episodes : [],
      progressMap
    });
  } catch (error) {
    console.error("[ui][overlay] error:", error);
    if (requestId !== __titleOverlayReq) return;
    renderTitleOverlayError();
  }
}

export function initTitleCardOverlay() {
  if (__titleOverlayInit) return;
  __titleOverlayInit = true;

  ensureTitleOverlayModal();

  document.addEventListener("click", async (e) => {
    const card = e.target?.closest?.("[data-title-overlay='1']");
    if (!card) return;

    const href =
      card.getAttribute("data-title-overlay-href") ||
      card.getAttribute("data-href") ||
      "";

    if (!href) return;

    const parsed = parseTitleOverlayHref(href);
    if (!parsed?.movieId) return;

    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

    e.preventDefault();
    e.stopPropagation();

    await openTitleOverlayFromHref(href);
  }, true);

  document.addEventListener("keydown", async (e) => {
    const card = e.target?.closest?.("[data-title-overlay='1']");
    if (!card) return;

    if (e.key !== "Enter" && e.key !== " ") return;

    const href =
      card.getAttribute("data-title-overlay-href") ||
      card.getAttribute("data-href") ||
      "";

    if (!href) return;

    const parsed = parseTitleOverlayHref(href);
    if (!parsed?.movieId) return;

    e.preventDefault();
    e.stopPropagation();

    await openTitleOverlayFromHref(href);
  }, true);
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
    <div
      class="card no-select"
      role="link"
      tabindex="0"
      data-href="${href}"
      data-title-overlay="1"
      data-title-overlay-href="${href}"
    >
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
let __topnavSearchInit = false;
let __searchExperienceInit = false;
let __searchRequestSeq = 0;
let __searchDebounceTimer = null;
let __searchBaseUrl = null;

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
  const url = new URL(window.location.href);
  if (url.pathname !== "/search") {
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
  base.pathname = "/search";
  base.search = "";
  base.hash = "";
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
      closeSearchOverlay({ clearQuery: false });
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

  const results = document.getElementById("search-results");
  if (results) results.innerHTML = "";

  setSearchStatus("");

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
      closeSearchOverlay({ clearQuery: false });
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
      closeSearchOverlay({ clearQuery: false });
    }
  });
}

export function initSearchExperience() {
  if (__searchExperienceInit) return;
  __searchExperienceInit = true;

  ensureSearchOverlay();

  const currentUrl = getCurrentNonSearchUrl();
  if (!__searchBaseUrl && !currentUrl.startsWith("/search")) {
    __searchBaseUrl = currentUrl;
  }

  window.addEventListener("app:searchchange", async (e) => {
    const query = normalizeSearchQuery(e?.detail?.query || "");
    const requestId = ++__searchRequestSeq;

    syncSearchInputs(query);

    if (!query) {
      closeSearchOverlay({ clearQuery: false });
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