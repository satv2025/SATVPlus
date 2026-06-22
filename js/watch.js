// js/watch.js
// SATV+ Watch loader
// - Soporta movie / episode / series
// - Soporta collection + movie
// - SPA mode: cambia la URL sin recargar página y actualiza el player
// - Fix UUID: limpia parámetros, tolera caracteres invisibles y acepta UUIDs flexibles

import { supabase } from "./supabaseClient.js";

/* ============================================================
 * Config
 * ============================================================ */
const ROOT_ID = "akira-player-root";
const DEFAULT_ASSET_BASE = "https://akira.satvplus.com.ar/assets";
const NOW_URL = new URL(window.location.href);
const DEBUG =
  NOW_URL.searchParams.get("debug") === "1" ||
  NOW_URL.searchParams.get("debug") === "true";

/* ============================================================
 * Estado SPA
 * ============================================================ */
let __watchRouteSeq = 0;
let __satvBooted = false;
let __satvAspectObserverInstalled = false;

/* ============================================================
 * Esquema DB
 * ============================================================ */
const DB = {
  movies: {
    table: "movies",
    cols: {
      id: "id",
      title: "title",
      description: "description",
      thumbnail: "thumbnail_url",
      banner: "banner_url",
      m3u8: "m3u8_url",
      category: "category",
      createdAt: "created_at",
      vtt: "vtt_url",
      durationMinutes: "duration_minutes",
      releaseYear: "release_year",
      liveMode: "live_mode",
      liveStartsAt: "live_starts_at",
      collectionId: "collection_id",
      videoFit: "video_fit"
    }
  },
  episodes: {
    table: "episodes",
    cols: {
      id: "id",
      seriesId: "series_id",
      season: "season",
      episodeNumber: "episode_number",
      title: "title",
      m3u8: "m3u8_url",
      createdAt: "created_at",
      vtt: "vtt_url",
      sinopsis: "sinopsis"
    }
  },
  collections: {
    table: "collections",
    cols: {
      id: "id",
      title: "title",
      description: "description",
      thumbnail: "thumbnail_url",
      banner: "banner_url",
      createdAt: "created_at"
    }
  }
};

/* ============================================================
 * Logs
 * ============================================================ */
function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

function warnLog(...args) {
  console.warn(...args);
}

function infoLog(...args) {
  console.log(...args);
}

/* ============================================================
 * UI helpers
 * ============================================================ */
function getRootEl() {
  return document.getElementById(ROOT_ID) || document.body;
}

function showWatchLoadingOverlay(text = "") {
  try {
    if (typeof window.showWatchLoadingOverlay === "function") {
      window.showWatchLoadingOverlay(text);
      return true;
    }
  } catch { }

  return false;
}

function hideWatchLoadingOverlay() {
  try {
    if (typeof window.hideWatchLoadingOverlay === "function") {
      window.hideWatchLoadingOverlay();
      return true;
    }
  } catch { }

  return false;
}


/* ============================================================
 * Fullscreen helpers
 * ============================================================ */
function getFullscreenElement() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    null
  );
}

function isPlayerFullscreenActive() {
  const fsEl = getFullscreenElement();
  if (!fsEl) return false;

  const root = getRootEl();
  if (!root) return true;

  return (
    fsEl === root ||
    root.contains?.(fsEl) ||
    fsEl.contains?.(root)
  );
}

function getRouteOverlayHost() {
  const fsEl = getFullscreenElement();
  if (fsEl && isPlayerFullscreenActive()) return fsEl;
  return document.body;
}

function getPlayerShellForFullscreenRestore() {
  const root = getRootEl();

  return (
    root?.querySelector?.(".akira-player-shell") ||
    root?.querySelector?.(".akira-wrap") ||
    root?.querySelector?.("[data-akira-player-shell]") ||
    root?.querySelector?.("video")?.parentElement ||
    root
  );
}

async function restoreFullscreenIfNeeded(wasFullscreen) {
  if (!wasFullscreen) return;
  if (getFullscreenElement()) return;

  const el = getPlayerShellForFullscreenRestore();

  if (!el || !el.isConnected) {
    warnLog("[watch] No se pudo restaurar fullscreen: shell desconectado");
    return;
  }

  try {
    await el.requestFullscreen?.();
    debugLog("[watch] fullscreen restaurado");
  } catch (e) {
    warnLog("[watch] requestFullscreen bloqueado por navegador", e);
  }
}

function ensureRouteSpinnerStyle() {
  if (document.getElementById("satv-route-spinner-style")) return;

  const style = document.createElement("style");
  style.id = "satv-route-spinner-style";
  style.textContent = `
    @keyframes satv-spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

function showRouteLoadingOverlay() {
  ensureRouteSpinnerStyle();

  let overlay = document.getElementById("satv-route-loading-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "satv-route-loading-overlay";
    overlay.innerHTML = `
      <div style="
        width:84px;
        height:84px;
        border-radius:999px;
        border:5px solid rgba(37, 100, 235, 0);
        border-top-color:#FFFFFF;
        animation:satv-spin .8s linear infinite;
      "></div>
    `;

    overlay.style.cssText = `
      position:fixed;
      inset:0;
      z-index:999999;
      display:none;
      align-items:center;
      justify-content:center;
      background:rgba(0,0,0,.55);
      pointer-events:none;
    `;
  }

  const host = getRouteOverlayHost();
  if (host && overlay.parentElement !== host) {
    host.appendChild(overlay);
  }

  overlay.style.display = "flex";
}

function hideRouteLoadingOverlay() {
  const overlay = document.getElementById("satv-route-loading-overlay");
  if (overlay) overlay.style.display = "none";
}

function setLoading({ clearRoot = false } = {}) {
  const fullscreenActive = isPlayerFullscreenActive();
  const usedGlobalOverlay = showWatchLoadingOverlay("");

  if (usedGlobalOverlay) {
    // En fullscreen, los overlays fuera del elemento fullscreen pueden no verse.
    // Por eso usamos también el overlay flotante dentro del player/fsEl.
    if (fullscreenActive || !clearRoot) {
      showRouteLoadingOverlay();
      return;
    }

    const root = getRootEl();
    if (root) root.innerHTML = "";
    return;
  }

  const root = getRootEl();
  if (!root) return;

  // En navegación SPA o fullscreen nunca destruimos el player.
  // Borrar el nodo fullscreen hace que el navegador salga de fullscreen.
  if (!clearRoot || fullscreenActive || root.querySelector("video")) {
    showRouteLoadingOverlay();
    return;
  }

  root.innerHTML = `
    <div style="
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      background:#000;
      box-sizing:border-box;
    ">
      <div style="
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:14px;
        font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
        color:#FFFFFF;
      ">
        <div style="
          width:84px;
          height:84px;
          border-radius:999px;
          border:5px solid rgba(37, 100, 235, 0);
          border-top-color:#FFFFFF;
          animation:satv-spin .8s linear infinite;
        "></div>
        <div style="font-size:12px;opacity:.9;"></div>
      </div>
    </div>
    <style>
      @keyframes satv-spin { to { transform: rotate(360deg); } }
    </style>
  `;
}

function setError(message, details = "") {
  hideRouteLoadingOverlay();
  hideWatchLoadingOverlay();

  const root = getRootEl();

  root.innerHTML = `
    <div style="
      min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#000;color:#fff;padding:24px;box-sizing:border-box;
      font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    ">
      <div style="
        width:min(920px,100%);
        background:rgba(120,20,20,.22);
        border:1px solid rgba(255,80,80,.25);
        border-radius:14px;padding:18px;
      ">
        <div style="font-size:18px;font-weight:700;margin-bottom:8px;">Error al cargar reproducción</div>
        <div style="opacity:.95;margin-bottom:10px;">${escapeHtml(message)}</div>
        ${
          details
            ? `<pre style="white-space:pre-wrap;word-break:break-word;margin:0;padding:12px;border-radius:10px;background:rgba(0,0,0);border:1px solid rgba(255,255,255,.08);font-size:12px;line-height:1.35;opacity:.95;">${escapeHtml(details)}</pre>`
            : ""
        }
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setDocumentTitle(name) {
  document.title = name ? `${name} · SATV+` : "SATV+";
}

function requireRenderBridge() {
  if (typeof window.renderAkiraPlayer !== "function") {
    throw new Error("No existe window.renderAkiraPlayer(props) en watch.html");
  }
}

function getAssetBaseUrl() {
  return (
    document.body?.dataset?.assetBase ||
    window.AKIRA_ASSET_BASE ||
    DEFAULT_ASSET_BASE
  );
}

/* ============================================================
 * LIVE helpers
 * ============================================================ */
function getLiveStartDateFromRow(row, keyName = "live_starts_at") {
  if (!row) return null;

  const raw =
    row[keyName] ??
    row.live_starts_at ??
    row.live_start_at ??
    row.live_datetime ??
    row.live_at ??
    null;

  if (!raw) return null;

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isUpcomingLiveFromRow(
  row,
  { liveModeKey = "live_mode", liveStartsAtKey = "live_starts_at" } = {}
) {
  const isLive = Boolean(row?.[liveModeKey] ?? row?.live_mode);
  if (!isLive) return false;

  const d = getLiveStartDateFromRow(row, liveStartsAtKey);
  if (!d) return false;

  return d.getTime() > Date.now();
}

/* ============================================================
 * Params / helpers
 * ============================================================ */
function cleanParam(v) {
  if (v == null) return null;

  const s = String(v)
    .normalize("NFKC")
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^['"{\s]+/, "")
    .replace(/['"}\s]+$/, "");

  return s || null;
}

function normalizeUuidParam(v) {
  const s = cleanParam(v);
  if (!s) return null;

  // Extrae un UUID aunque venga envuelto en comillas, objeto stringify, etc.
  const match = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match ? match[0].toLowerCase() : s;
}

function isUuid(v) {
  const s = normalizeUuidParam(v);
  if (!s) return false;

  // Flexible: no exige versión/variant RFC, porque algunas DBs/fixtures generan UUID-like.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function getSelectableId(value) {
  if (!value) return null;

  if (typeof value === "object") {
    return normalizeUuidParam(
      value.id ||
      value.episodeId ||
      value.movieId ||
      value.contentId ||
      value.value ||
      null
    );
  }

  return normalizeUuidParam(value);
}

function getParams() {
  const url = new URL(window.location.href);

  return {
    movieId: normalizeUuidParam(url.searchParams.get("movie")),
    episodeId: normalizeUuidParam(url.searchParams.get("episode")),
    seriesId: normalizeUuidParam(url.searchParams.get("series")),
    collectionId: normalizeUuidParam(url.searchParams.get("collection")),
    autoplay: url.searchParams.get("autoplay") !== "0",
    forceThumbsLocal: url.searchParams.get("forceThumbsLocal") === "1",
    probe: url.searchParams.get("probe") !== "0"
  };
}

function buildWatchUrl(params) {
  const url = new URL(window.location.href);

  url.pathname = "/watch";
  url.search = "";

  for (const [k, v] of Object.entries(params)) {
    const cleanValue = k === "movie" || k === "episode" || k === "series" || k === "collection"
      ? normalizeUuidParam(v)
      : cleanParam(v);

    if (cleanValue != null && cleanValue !== "") {
      url.searchParams.set(k, cleanValue);
    }
  }

  return url.toString();
}

function navigateWatch(params, { replace = false, showOverlay = true } = {}) {
  const nextUrl = buildWatchUrl(params);

  if (nextUrl === window.location.href) {
    return Promise.resolve();
  }

  if (replace) {
    window.history.replaceState({ satvWatch: true }, "", nextUrl);
  } else {
    window.history.pushState({ satvWatch: true }, "", nextUrl);
  }

  return loadCurrentWatchRoute({
    showOverlay,
    reusePlayer: true
  });
}

window.addEventListener("popstate", () => {
  loadCurrentWatchRoute({
    showOverlay: true,
    reusePlayer: true
  });
});

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function isLikelyAbsoluteUrl(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

function proxifyRemoteUrl(url) {
  if (!url) return undefined;

  const s = String(url).trim();
  return s || undefined;
}

function isThumbsVtt(url) {
  const s = String(url || "").toLowerCase();

  return (
    s.includes("thumbs.vtt") ||
    s.includes("thumbnail") ||
    s.includes("thumbnails")
  );
}

function isLocalhostPage() {
  return location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

function normalizeSubtitlesFromVtt(vttUrlFromSupabase) {
  if (!vttUrlFromSupabase) return [];
  if (isThumbsVtt(vttUrlFromSupabase)) return [];

  const src = proxifyRemoteUrl(vttUrlFromSupabase);
  if (!src) return [];

  return [
    {
      src,
      srclang: "es",
      label: "Español",
      default: true
    }
  ];
}

function computeThumbnailsVtt(vttUrlFromSupabase, { allowOnLocal = false } = {}) {
  if (!vttUrlFromSupabase) return undefined;
  if (!isThumbsVtt(vttUrlFromSupabase)) return undefined;

  const canUse = allowOnLocal || !isLocalhostPage();
  if (!canUse) return undefined;

  return proxifyRemoteUrl(vttUrlFromSupabase);
}

function withTimeout(promise, ms, label = "Operación") {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} excedió ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/* ============================================================
 * Render/Ready bridge helpers
 * ============================================================ */
function isPromiseLike(v) {
  return (
    !!v &&
    (typeof v === "object" || typeof v === "function") &&
    typeof v.then === "function"
  );
}

async function awaitAkiraReadyAfterRender(renderResult, opts = {}) {
  const waitOpts = {
    timeoutMs: 45000,
    autoplayRetry: true,
    requireCustomReadyEvent: true,
    ...opts
  };

  let readyPromise = null;

  if (renderResult && isPromiseLike(renderResult.readyPromise)) {
    readyPromise = renderResult.readyPromise;
  } else if (isPromiseLike(renderResult)) {
    readyPromise = renderResult;
  } else if (typeof window.waitForCurrentAkiraPlaybackReady === "function") {
    readyPromise = window.waitForCurrentAkiraPlaybackReady(waitOpts);
  } else if (typeof window.waitForAkiraPlaybackReady === "function") {
    readyPromise = window.waitForAkiraPlaybackReady(waitOpts);
  }

  if (!readyPromise) {
    warnLog("[watch] No hay helper de wait READY disponible en watch.html");
    return null;
  }

  const info = await readyPromise;
  return info || null;
}

/* ============================================================
 * Probes
 * ============================================================ */
async function probeM3u8(url) {
  if (
    !url ||
    !isLikelyAbsoluteUrl(url) ||
    !/\.m3u8(\?|#|$)|\.mpd(\?|#|$)/i.test(url)
  ) {
    return;
  }

  try {
    infoLog("[watch][probe] Probing stream:", url);

    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-store"
    });

    const text = await res.text();
    const lines = text.split("\n").slice(0, 10).join("\n");

    infoLog("[watch][probe] stream response:", {
      ok: res.ok,
      status: res.status,
      type: res.type,
      redirected: res.redirected,
      finalUrl: res.url,
      contentType: res.headers.get("content-type"),
      firstLines: lines
    });
  } catch (e) {
    console.error("[watch][probe] stream fetch error:", {
      message: e?.message || String(e),
      name: e?.name || null,
      url
    });
  }
}

async function probeVtt(url) {
  if (!url || !isLikelyAbsoluteUrl(url)) return;

  try {
    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-store"
    });

    const text = await res.text();

    infoLog("[watch][probe] vtt response:", {
      url,
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get("content-type"),
      firstLines: text.split("\n").slice(0, 6).join("\n")
    });
  } catch (e) {
    console.error("[watch][probe] vtt fetch error:", {
      message: e?.message || String(e),
      name: e?.name || null,
      url
    });
  }
}

/* ============================================================
 * Supabase queries
 * ============================================================ */
async function fetchMovieById(movieId) {
  const m = DB.movies.cols;

  const { data, error } = await withTimeout(
    supabase
      .from(DB.movies.table)
      .select(
        [
          m.id,
          m.title,
          m.description,
          m.thumbnail,
          m.banner,
          m.m3u8,
          m.category,
          m.createdAt,
          m.vtt,
          m.durationMinutes,
          m.releaseYear,
          m.liveMode,
          m.liveStartsAt,
          m.collectionId,
          m.videoFit
        ].join(",")
      )
      .eq(m.id, movieId)
      .single(),
    15000,
    "fetchMovieById"
  );

  if (error) throw error;

  return data;
}

async function fetchSeriesById(seriesId) {
  const m = DB.movies.cols;

  const { data, error } = await withTimeout(
    supabase
      .from(DB.movies.table)
      .select(
        [
          m.id,
          m.title,
          m.description,
          m.thumbnail,
          m.banner,
          m.category,
          m.vtt,
          m.liveMode,
          m.liveStartsAt,
          m.videoFit
        ].join(",")
      )
      .eq(m.id, seriesId)
      .eq(m.category, "series")
      .single(),
    15000,
    "fetchSeriesById"
  );

  if (error) throw error;

  return data;
}

async function fetchEpisodeById(episodeId) {
  const e = DB.episodes.cols;

  const { data, error } = await withTimeout(
    supabase
      .from(DB.episodes.table)
      .select(
        [
          e.id,
          e.seriesId,
          e.season,
          e.episodeNumber,
          e.title,
          e.m3u8,
          e.createdAt,
          e.vtt,
          e.sinopsis
        ].join(",")
      )
      .eq(e.id, episodeId)
      .single(),
    15000,
    "fetchEpisodeById"
  );

  if (error) throw error;

  return data;
}

async function fetchEpisodesForSeries(seriesId) {
  const e = DB.episodes.cols;

  const { data, error } = await withTimeout(
    supabase
      .from(DB.episodes.table)
      .select(
        [
          e.id,
          e.seriesId,
          e.season,
          e.episodeNumber,
          e.title,
          e.m3u8,
          e.vtt,
          e.sinopsis
        ].join(",")
      )
      .eq(e.seriesId, seriesId)
      .order(e.season, { ascending: true })
      .order(e.episodeNumber, { ascending: true })
      .limit(500),
    15000,
    "fetchEpisodesForSeries"
  );

  if (error) throw error;

  return safeArray(data).map((ep) => ({
    id: ep[e.id],
    title: ep[e.title] || `Episodio ${ep[e.episodeNumber] ?? ""}`.trim(),
    synopsis: ep[e.sinopsis] || null,
    thumbnail: null,
    seasonNumber: ep[e.season] ?? null,
    episodeNumber: ep[e.episodeNumber] ?? null,
    durationSeconds: null
  }));
}

async function fetchRecommendations(currentContentId = null) {
  const m = DB.movies.cols;

  let q = supabase
    .from(DB.movies.table)
    .select(
      [
        m.id,
        m.title,
        m.description,
        m.thumbnail,
        m.banner,
        m.category,
        m.createdAt
      ].join(",")
    )
    .order(m.createdAt, { ascending: false })
    .limit(12);

  if (currentContentId) q = q.neq(m.id, currentContentId);

  const { data, error } = await withTimeout(q, 15000, "fetchRecommendations");

  if (error) {
    warnLog("[watch] recomendaciones fallback error:", error);
    return [];
  }

  return safeArray(data).map((row) => ({
    id: row[m.id],
    title: row[m.title] || "Contenido",
    poster: row[m.thumbnail] || row[m.banner] || null,
    type: row[m.category] === "series" ? "series" : "movie",
    synopsis: row[m.description] || null
  }));
}

async function fetchCollectionMetaById(collectionId) {
  if (!collectionId) return null;

  const c = DB.collections.cols;

  try {
    const { data, error } = await withTimeout(
      supabase
        .from(DB.collections.table)
        .select(
          [
            c.id,
            c.title,
            c.description,
            c.thumbnail,
            c.banner,
            c.createdAt
          ].join(",")
        )
        .eq(c.id, collectionId)
        .maybeSingle(),
      15000,
      "fetchCollectionMetaById"
    );

    if (error) {
      warnLog("[watch] no se pudo leer metadata de collection:", error);
      return null;
    }

    return data || null;
  } catch (e) {
    warnLog("[watch] excepción leyendo metadata de collection:", e);
    return null;
  }
}

async function fetchCollectionItemsFromMovies(collectionId) {
  if (!collectionId) return [];

  const m = DB.movies.cols;

  try {
    const { data, error } = await withTimeout(
      supabase
        .from(DB.movies.table)
        .select(
          [
            m.id,
            m.title,
            m.description,
            m.thumbnail,
            m.banner,
            m.durationMinutes,
            m.createdAt,
            m.collectionId,
            m.category,
            m.videoFit
          ].join(",")
        )
        .eq(m.collectionId, collectionId)
        .order(m.createdAt, { ascending: true })
        .limit(500),
      15000,
      "fetchCollectionItemsFromMovies"
    );

    if (error) throw error;

    return safeArray(data).map((row, index) => ({
      id: String(row[m.id]),
      title: row[m.title] || `Contenido ${index + 1}`,
      synopsis: row[m.description] || null,
      thumbnail: row[m.thumbnail] || row[m.banner] || null,
      seasonNumber: 1,
      episodeNumber: index + 1,
      durationSeconds: Number.isFinite(Number(row[m.durationMinutes]))
        ? Number(row[m.durationMinutes]) * 60
        : null
    }));
  } catch (e) {
    warnLog("[watch] no se pudieron leer items desde movies.collection_id:", e);
    return [];
  }
}

/* ============================================================
 * Mapping -> AkiraPlayer props
 * ============================================================ */
function buildAkiraProps({
  srcUrl,
  poster,
  autoplay,
  title,
  contentId,
  seasonId,
  episodeId,
  recommendations = [],
  episodes = [],
  vttUrlFromSupabase,
  allowThumbsOnLocal = false,
  isLiveMode = false,
  liveStartsAt = null,
  isCollectionMode = false,
  collectionLabel = "Colección",
  collectionId = null,
  video_fit = "cover"
}) {
  const src = proxifyRemoteUrl(srcUrl);

  const subtitles = normalizeSubtitlesFromVtt(vttUrlFromSupabase);

  const thumbnailsVtt = computeThumbnailsVtt(vttUrlFromSupabase, {
    allowOnLocal: allowThumbsOnLocal
  });

  return {
    src,
    poster: poster || undefined,
    autoplay: !!autoplay,
    title: title || "SATV+",
    channelLabel: isLiveMode ? "SATVPlus · EN VIVO" : "SATVPlus",
    assetBaseUrl: getAssetBaseUrl(),

    contentId: contentId ?? "",
    seasonId: seasonId ?? null,
    episodeId: episodeId ?? null,

    thumbnailsVtt,
    subtitles,

    recommendations: safeArray(recommendations),
    episodes: safeArray(episodes),
    recommendationsLabel: "Te podría gustar",

    playlistMode: true,

    isLiveMode: !!isLiveMode,
    liveStartsAt: liveStartsAt || null,
    streamType: isLiveMode ? "live" : "on-demand",
    disableResumeForLive: !!isLiveMode,

    isCollectionMode: !!isCollectionMode,
    collectionLabel,
    collectionId: collectionId || null,
    video_fit
  };
}

function movieToPlayerProps(
  movie,
  { autoplay = true, recommendations = [], forceThumbsLocal = false } = {}
) {
  const m = DB.movies.cols;

  const m3u8FromSupabase = movie[m.m3u8];
  const vttFromSupabase = movie[m.vtt];
  const isLiveMode = Boolean(movie[m.liveMode]);
  const liveStartsAt = movie[m.liveStartsAt] || null;

  const rawFit = String(movie[m.videoFit] ?? "cover").trim().toLowerCase();
  const video_fit = rawFit === "contain" ? "contain" : "cover";

  const props = buildAkiraProps({
    srcUrl: m3u8FromSupabase,
    poster: movie[m.banner] || movie[m.thumbnail],
    autoplay,
    title: movie[m.title] || "SATV+",
    contentId: movie[m.id],
    seasonId: null,
    episodeId: null,
    recommendations,
    episodes: [],
    vttUrlFromSupabase: vttFromSupabase,
    allowThumbsOnLocal: forceThumbsLocal,
    isLiveMode,
    liveStartsAt,
    video_fit
  });

  props.onBack = () => window.history.back();

  props.onSelectRecommendation = (item) => {
    if (!item?.id) return;

    navigateWatch(
      item.type === "series"
        ? { series: item.id }
        : { movie: item.id }
    );
  };

  return props;
}

function episodeToPlayerProps(
  episode,
  { series, episodes, recommendations = [], autoplay = true, forceThumbsLocal = false } = {}
) {
  const e = DB.episodes.cols;
  const m = DB.movies.cols;

  debugLog("m.videoFit =", m.videoFit);
  debugLog("series.video_fit =", series?.video_fit);
  debugLog("series[m.videoFit] =", series?.[m.videoFit]);
  debugLog("series keys =", Object.keys(series || {}));

  const seriesId = normalizeUuidParam(series?.[m.id] || episode[e.seriesId] || null);
  const m3u8FromSupabase = episode[e.m3u8];
  const vttFromSupabase = episode[e.vtt];
  const isLiveMode = Boolean(series?.[m.liveMode]);
  const liveStartsAt = series?.[m.liveStartsAt] || null;

  const rawFit = String(series?.[m.videoFit] ?? "cover").trim().toLowerCase();
  const video_fit = rawFit === "contain" ? "contain" : "cover";

  const props = buildAkiraProps({
    srcUrl: m3u8FromSupabase,
    poster: (series && (series[m.banner] || series[m.thumbnail])) || undefined,
    autoplay,
    title: episode[e.title] || series?.[m.title] || "SATV+",
    contentId: seriesId || episode[e.id],
    seasonId: episode[e.season] != null ? String(episode[e.season]) : null,
    episodeId: normalizeUuidParam(episode[e.id]),
    recommendations,
    episodes,
    vttUrlFromSupabase: vttFromSupabase,
    allowThumbsOnLocal: forceThumbsLocal,
    isLiveMode,
    liveStartsAt,
    video_fit
  });

  props.onBack = () => window.history.back();

  props.onSelectEpisode = (selectedEpisode) => {
    const selectedEpisodeId = getSelectableId(selectedEpisode);

    if (!selectedEpisodeId) return;

    navigateWatch({
      series: seriesId,
      episode: selectedEpisodeId
    });
  };

  props.onSelectRecommendation = (item) => {
    if (!item?.id) return;

    navigateWatch(
      item.type === "series"
        ? { series: item.id }
        : { movie: item.id }
    );
  };

  return props;
}

function collectionMovieToPlayerProps(
  movie,
  {
    collectionId,
    collectionItems = [],
    recommendations = [],
    autoplay = true,
    forceThumbsLocal = false,
    collectionMeta = null
  } = {}
) {
  const m = DB.movies.cols;
  const c = DB.collections.cols;

  const m3u8FromSupabase = movie[m.m3u8];
  const vttFromSupabase = movie[m.vtt];
  const isLiveMode = Boolean(movie[m.liveMode]);
  const liveStartsAt = movie[m.liveStartsAt] || null;

  const posterFromCollection =
    collectionMeta?.[c?.banner] ||
    collectionMeta?.[c?.thumbnail] ||
    null;

  const rawFit = String(movie[m.videoFit] ?? "cover").trim().toLowerCase();
  const video_fit = rawFit === "contain" ? "contain" : "cover";

  const props = buildAkiraProps({
    srcUrl: m3u8FromSupabase,
    poster: movie[m.banner] || movie[m.thumbnail] || posterFromCollection,
    autoplay,
    title: movie[m.title] || "SATV+",
    contentId: normalizeUuidParam(movie[m.id]),
    seasonId: collectionId || null,
    episodeId: normalizeUuidParam(movie[m.id]),
    recommendations,
    episodes: collectionItems,
    vttUrlFromSupabase: vttFromSupabase,
    allowThumbsOnLocal: forceThumbsLocal,
    isLiveMode,
    liveStartsAt,
    isCollectionMode: true,
    collectionLabel: collectionMeta?.[c?.title] || "Colección",
    collectionId,
    video_fit
  });

  debugLog("OBFIT DB VALUE:", movie[m.videoFit]);

  props.onBack = () => window.history.back();

  props.onSelectEpisode = (selectedMovie) => {
    const selectedMovieId = getSelectableId(selectedMovie);

    if (!selectedMovieId || !collectionId) return;

    navigateWatch({
      collection: collectionId,
      movie: selectedMovieId
    });
  };

  props.onSelectRecommendation = (item) => {
    if (!item?.id) return;

    navigateWatch(
      item.type === "series"
        ? { series: item.id }
        : { movie: item.id }
    );
  };

  return props;
}

/* ============================================================
 * Route resolver
 * ============================================================ */
async function resolveRouteAndBuildProps() {
  const {
    movieId,
    episodeId,
    seriesId,
    collectionId,
    autoplay,
    forceThumbsLocal,
    probe
  } = getParams();

  debugLog("[watch] params normalizados:", {
    movieId,
    episodeId,
    seriesId,
    collectionId,
    href: window.location.href
  });

  const m = DB.movies.cols;
  const e = DB.episodes.cols;
  const c = DB.collections.cols;

  // ?collection=<uuid>&movie=<uuid>
  if (collectionId && movieId) {
    if (!isUuid(collectionId)) {
      throw new Error(`Parámetro ?collection inválido (UUID esperado): ${collectionId}`);
    }

    if (!isUuid(movieId)) {
      throw new Error(`Parámetro ?movie inválido (UUID esperado): ${movieId}`);
    }

    const movie = await fetchMovieById(movieId);

    if (!movie) throw new Error("No se encontró el contenido de la colección");
    if (!movie[m.m3u8]) throw new Error("El contenido no tiene m3u8_url");

    const [collectionMeta, collectionItems, recommendations] = await Promise.all([
      fetchCollectionMetaById(collectionId),
      fetchCollectionItemsFromMovies(collectionId),
      fetchRecommendations(movie[m.id])
    ]);

    const safeCollectionItems = collectionItems.length
      ? collectionItems
      : [
          {
            id: String(movie[m.id]),
            title: movie[m.title] || "Contenido actual",
            synopsis: movie[m.description] || null,
            thumbnail: movie[m.thumbnail] || movie[m.banner] || null,
            seasonNumber: 1,
            episodeNumber: 1,
            durationSeconds: Number.isFinite(Number(movie[m.durationMinutes]))
              ? Number(movie[m.durationMinutes]) * 60
              : null
          }
        ];

    if (probe) {
      probeM3u8(movie[m.m3u8]);
      if (movie[m.vtt]) probeVtt(movie[m.vtt]);
    }

    const liveStartsAtDate = getLiveStartDateFromRow(movie, m.liveStartsAt);

    const liveGate = {
      enabled: Boolean(movie[m.liveMode]),
      isUpcoming: isUpcomingLiveFromRow(movie, {
        liveModeKey: m.liveMode,
        liveStartsAtKey: m.liveStartsAt
      }),
      startsAt: liveStartsAtDate,
      title: collectionMeta?.[c.title] || movie[m.title] || "Colección"
    };

    return {
      title: collectionMeta?.[c.title] || movie[m.title] || "Colección",
      props: collectionMovieToPlayerProps(movie, {
        collectionId,
        collectionItems: safeCollectionItems,
        recommendations,
        autoplay,
        forceThumbsLocal,
        collectionMeta
      }),
      liveGate
    };
  }

  // ?movie=<uuid>
  if (movieId) {
    if (!isUuid(movieId)) {
      throw new Error(`Parámetro ?movie inválido (UUID esperado): ${movieId}`);
    }

    const movie = await fetchMovieById(movieId);

    if (!movie) throw new Error("No se encontró la película");

    if (movie[m.category] !== "movie") {
      if (movie[m.category] === "series") {
        return {
          redirect: {
            replace: true,
            params: {
              series: movie[m.id]
            }
          }
        };
      }

      throw new Error("El contenido de ?movie no es una película");
    }

    if (!movie[m.m3u8]) throw new Error("La película no tiene m3u8_url");

    const recommendations = await fetchRecommendations(movie[m.id]);

    if (probe) {
      probeM3u8(movie[m.m3u8]);
      if (movie[m.vtt]) probeVtt(movie[m.vtt]);
    }

    const liveStartsAtDate = getLiveStartDateFromRow(movie, m.liveStartsAt);

    const liveGate = {
      enabled: Boolean(movie[m.liveMode]),
      isUpcoming: isUpcomingLiveFromRow(movie, {
        liveModeKey: m.liveMode,
        liveStartsAtKey: m.liveStartsAt
      }),
      startsAt: liveStartsAtDate,
      title: movie[m.title] || "Contenido en vivo"
    };

    return {
      title: movie[m.title] || "Película",
      props: movieToPlayerProps(movie, {
        autoplay,
        recommendations,
        forceThumbsLocal
      }),
      liveGate
    };
  }

  // ?episode=<uuid>
  if (episodeId) {
    if (!isUuid(episodeId)) {
      throw new Error(`Parámetro ?episode inválido (UUID esperado): ${episodeId}`);
    }

    const episode = await fetchEpisodeById(episodeId);

    if (!episode) throw new Error("No se encontró el episodio");
    if (!episode[e.m3u8]) throw new Error("El episodio no tiene m3u8_url");

    const resolvedSeriesId = normalizeUuidParam(seriesId || episode[e.seriesId] || null);

    let series = null;
    let episodesList = [];

    if (resolvedSeriesId && isUuid(resolvedSeriesId)) {
      try {
        series = await fetchSeriesById(resolvedSeriesId);
      } catch (err) {
        warnLog("[watch] No se pudo cargar serie:", err);
      }

      try {
        episodesList = await fetchEpisodesForSeries(resolvedSeriesId);
      } catch (err) {
        warnLog("[watch] No se pudo cargar lista de episodios:", err);
      }
    }

    const recommendations = await fetchRecommendations(resolvedSeriesId || null);

    if (probe) {
      probeM3u8(episode[e.m3u8]);
      if (episode[e.vtt]) probeVtt(episode[e.vtt]);
    }

    const title = series?.[m.title]
      ? `${series[m.title]} · ${episode[e.title] || `E${episode[e.episodeNumber] ?? ""}`}`
      : episode[e.title] || "Episodio";

    const liveStartsAtDate = series
      ? getLiveStartDateFromRow(series, m.liveStartsAt)
      : null;

    const liveGate = series
      ? {
          enabled: Boolean(series[m.liveMode]),
          isUpcoming: isUpcomingLiveFromRow(series, {
            liveModeKey: m.liveMode,
            liveStartsAtKey: m.liveStartsAt
          }),
          startsAt: liveStartsAtDate,
          title: series[m.title] || title
        }
      : null;

    return {
      title,
      props: episodeToPlayerProps(episode, {
        series,
        episodes: episodesList,
        recommendations,
        autoplay,
        forceThumbsLocal
      }),
      liveGate
    };
  }

  // ?series=<uuid>
  if (seriesId) {
    if (!isUuid(seriesId)) {
      throw new Error(`Parámetro ?series inválido (UUID esperado): ${seriesId}`);
    }

    await fetchSeriesById(seriesId);

    const episodesList = await fetchEpisodesForSeries(seriesId);

    if (!episodesList.length) {
      throw new Error("La serie no tiene episodios cargados");
    }

    return {
      redirect: {
        replace: true,
        params: {
          series: seriesId,
          episode: episodesList[0].id
        }
      }
    };
  }

  throw new Error(
    "Ruta inválida. Usá ?movie=<uuid> o ?episode=<uuid> o ?series=<uuid> o ?collection=<uuid>&movie=<uuid>"
  );
}

/* ============================================================
 * Aspect-ratio helpers
 * ============================================================ */
function ensureAspectContainStyle() {
  if (document.getElementById("satv-aspect-contain-style")) return;

  const style = document.createElement("style");
  style.id = "satv-aspect-contain-style";
  style.textContent = `
    video.boltrue,
    .akira-video.boltrue {
      object-fit: contain !important;
    }

    html.satv-force-video-contain video,
    body.satv-force-video-contain video {
      object-fit: contain !important;
    }
  `;

  document.head.appendChild(style);
}

function setForceVideoContain(enabled) {
  document.documentElement.classList.toggle("satv-force-video-contain", !!enabled);
  document.body?.classList?.toggle("satv-force-video-contain", !!enabled);
}

function applyAspectModeFromVideo(video) {
  if (!video) return;

  const enabled = window.__SATV_WATCH_LAST_PROPS__?.video_fit === "contain";

  video.classList.toggle("boltrue", enabled);
  setForceVideoContain(enabled);
}

function installAspectAutoDetection() {
  if (__satvAspectObserverInstalled) {
    const root = getRootEl();

    const video =
      root?.querySelector(".akira-video") ||
      root?.querySelector("video");

    if (video) applyAspectModeFromVideo(video);

    return;
  }

  const root = getRootEl();
  if (!root) return;

  __satvAspectObserverInstalled = true;

  ensureAspectContainStyle();

  let lastVideo = null;

  const bindVideo = (video) => {
    if (!video || video === lastVideo) return;

    lastVideo = video;

    const reevaluate = () => applyAspectModeFromVideo(video);

    video.addEventListener("loadedmetadata", reevaluate);
    video.addEventListener("resize", reevaluate);

    if (video.videoWidth && video.videoHeight) {
      reevaluate();
    } else {
      setTimeout(reevaluate, 300);
      setTimeout(reevaluate, 1200);
      setTimeout(reevaluate, 3000);
    }
  };

  const tryFindVideo = () => {
    const video =
      root.querySelector(".akira-video") ||
      root.querySelector("video");

    if (video) bindVideo(video);
  };

  tryFindVideo();

  const observer = new MutationObserver(() => {
    tryFindVideo();
  });

  observer.observe(root, {
    childList: true,
    subtree: true
  });

  window.__SATV_WATCH_ASPECT_OBSERVER__ = observer;
}

/* ============================================================
 * Post-render debug del <video>
 * ============================================================ */
function mediaErrorName(code) {
  return (
    {
      1: "MEDIA_ERR_ABORTED",
      2: "MEDIA_ERR_NETWORK",
      3: "MEDIA_ERR_DECODE",
      4: "MEDIA_ERR_SRC_NOT_SUPPORTED"
    }[code] || "UNKNOWN_MEDIA_ERROR"
  );
}

function networkStateName(v) {
  return (
    {
      0: "NETWORK_EMPTY",
      1: "NETWORK_IDLE",
      2: "NETWORK_LOADING",
      3: "NETWORK_NO_SOURCE"
    }[v] || "UNKNOWN_NETWORK_STATE"
  );
}

function readyStateName(v) {
  return (
    {
      0: "HAVE_NOTHING",
      1: "HAVE_METADATA",
      2: "HAVE_CURRENT_DATA",
      3: "HAVE_FUTURE_DATA",
      4: "HAVE_ENOUGH_DATA"
    }[v] || "UNKNOWN_READY_STATE"
  );
}

function getMediaErrorInfo(video) {
  const err = video?.error;

  if (!err) return null;

  return {
    code: err.code ?? null,
    codeName: mediaErrorName(err.code),
    message: err.message || null
  };
}

function inspectMountedVideoLater() {
  setTimeout(() => {
    const root = getRootEl();
    const video = root?.querySelector?.("video");

    if (!video) {
      warnLog("[watch] No se encontró <video> tras render (t+2.5s)");
      return;
    }

    const info = {
      currentSrc: video.currentSrc || null,
      srcAttr: video.getAttribute("src"),
      readyState: video.readyState,
      readyStateName: readyStateName(video.readyState),
      networkState: video.networkState,
      networkStateName: networkStateName(video.networkState),
      paused: video.paused,
      muted: video.muted,
      canPlayHlsNative: video.canPlayType?.("application/vnd.apple.mpegurl") || "",
      mediaError: getMediaErrorInfo(video)
    };

    console.log("[watch] video debug (t+2.5s)", info);
  }, 2500);

  setTimeout(() => {
    const root = getRootEl();
    const video = root?.querySelector?.("video");

    if (!video) return;

    const info = {
      currentSrc: video.currentSrc || null,
      srcAttr: video.getAttribute("src"),
      readyState: video.readyState,
      readyStateName: readyStateName(video.readyState),
      networkState: video.networkState,
      networkStateName: networkStateName(video.networkState),
      paused: video.paused,
      muted: video.muted,
      mediaError: getMediaErrorInfo(video)
    };

    console.log("[watch] video debug (t+6s)", info);

    if (info.networkState === 3 && info.readyState === 0) {
      console.error("[watch] VIDEO_STUCK_NO_SOURCE", info);
    }
  }, 6000);
}

/* ============================================================
 * Render pipeline
 * ============================================================ */
async function renderAndWaitPlayer(result, { reusePlayer = false } = {}) {
  const wasFullscreen = isPlayerFullscreenActive();

  window.__SATV_WATCH_LAST_RESULT__ = result;
  window.__SATV_WATCH_LAST_PROPS__ = result.props;

  debugLog("[watch] props finales:", result.props);
  debugLog("[watch] src final (Supabase):", result.props?.src);
  debugLog("[watch] thumbnailsVtt:", result.props?.thumbnailsVtt);
  debugLog("[watch] subtitles:", result.props?.subtitles);
  debugLog("[watch] liveGate:", result?.liveGate || null);
  debugLog("[watch] fullscreen antes de actualizar:", wasFullscreen);

  setDocumentTitle(result.title);

  if (typeof window.__SATV_RESET_WATCH_OVERLAY_LOCK__ === "function") {
    window.__SATV_RESET_WATCH_OVERLAY_LOCK__();
  }

  let renderResult;

  const shouldPreserveDom = reusePlayer || wasFullscreen;
  const canUpdateSameInstance = typeof window.updateAkiraPlayer === "function";

  if (canUpdateSameInstance) {
    renderResult = window.updateAkiraPlayer(result.props);
  } else {
    const root = getRootEl();

    if (!shouldPreserveDom && root) {
      root.innerHTML = "";
    } else {
      warnLog(
        "[watch] updateAkiraPlayer no existe; llamando renderAkiraPlayer sin limpiar root para preservar fullscreen"
      );
    }

    renderResult = window.renderAkiraPlayer(result.props);
  }

  installAspectAutoDetection();

  try {
    const readyInfo = await awaitAkiraReadyAfterRender(renderResult, {
      timeoutMs: 45000,
      autoplayRetry: true,
      requireCustomReadyEvent: true
    });

    window.__SATV_WATCH_LAST_READY_INFO__ = readyInfo;
    infoLog("[watch] Akira playback ready:", readyInfo);

    hideWatchLoadingOverlay();
    hideRouteLoadingOverlay();
    await restoreFullscreenIfNeeded(wasFullscreen);
  } catch (e) {
    warnLog("[watch] wait READY del player timeout/fallo:", e);

    hideRouteLoadingOverlay();
    await restoreFullscreenIfNeeded(wasFullscreen);
  }

  inspectMountedVideoLater();
}

async function loadCurrentWatchRoute({ showOverlay = true, reusePlayer = true } = {}) {
  const seq = ++__watchRouteSeq;

  try {
    if (showOverlay) {
      setLoading({
        clearRoot: !reusePlayer
      });
    }

    requireRenderBridge();

    if (!supabase || typeof supabase.from !== "function") {
      throw new Error("Cliente Supabase inválido en supabaseClient.js");
    }

    const result = await resolveRouteAndBuildProps();

    if (seq !== __watchRouteSeq) return;
    if (!result) return;

    if (result.redirect?.params) {
      const nextUrl = buildWatchUrl(result.redirect.params);

      if (result.redirect.replace) {
        window.history.replaceState({ satvWatch: true }, "", nextUrl);
      } else {
        window.history.pushState({ satvWatch: true }, "", nextUrl);
      }

      return loadCurrentWatchRoute({
        showOverlay,
        reusePlayer
      });
    }

    await renderAndWaitPlayer(result, {
      reusePlayer
    });
  } catch (err) {
    if (seq !== __watchRouteSeq) return;

    hideRouteLoadingOverlay();

    console.error("[watch] route load error:", err);

    const msg = err?.message || "No se pudo cargar el contenido";

    const details =
      typeof err === "object" && err
        ? JSON.stringify(
            {
              message: err.message,
              details: err.details || null,
              hint: err.hint || null,
              code: err.code || null,
              stack: err.stack || null,
              href: window.location.href,
              params: getParams()
            },
            null,
            2
          )
        : "";

    setError(msg, details);
  }
}

/* ============================================================
 * Boot
 * ============================================================ */
async function boot() {
  if (__satvBooted) return;

  __satvBooted = true;

  await loadCurrentWatchRoute({
    showOverlay: true,
    reusePlayer: false
  });
}

/* ============================================================
 * Escudo de Buffer: esperar OK real del player (UNMUTE)
 * - La overlay NO se va por timeout fijo corto.
 * - Se desbloquea cuando el <video> queda desmuteado.
 * - En modo SPA se resetea por cada cambio de capítulo/peli.
 * ============================================================ */
(function () {
  const overlay = document.getElementById("watch-loading-overlay");

  if (!overlay) return;

  overlay.style.pointerEvents = "none";

  const originalHide =
    typeof window.hideWatchLoadingOverlay === "function"
      ? window.hideWatchLoadingOverlay
      : null;

  let unlocked = false;
  let videoEl = null;
  let started = false;
  let fallbackTimer = null;

  const MAX_WAIT_MS = 45000;
  const POLL_MS = 250;

  const showOverlay = () => {
    overlay.style.visibility = "visible";
    overlay.style.opacity = "1";
  };

  const hideOverlay = () => {
    overlay.classList.remove("middle-buffer");
    overlay.style.visibility = "hidden";
    overlay.style.opacity = "0";
  };

  const isUnmuted = (v) => {
    if (!v) return false;

    const vol = typeof v.volume === "number" ? v.volume : 1;

    return v.muted === false && vol > 0;
  };

  const unlock = (reason) => {
    if (unlocked) return;

    unlocked = true;

    if (DEBUG) {
      console.log("[watch] overlay unlock:", {
        reason,
        muted: videoEl?.muted ?? null,
        volume: videoEl?.volume ?? null,
        readyState: videoEl?.readyState ?? null,
        paused: videoEl?.paused ?? null,
        currentTime: videoEl?.currentTime ?? null
      });
    }

    try {
      window.hideWatchLoadingOverlay();
    } catch { }

    hideRouteLoadingOverlay();
  };

  const scheduleFallback = () => {
    if (fallbackTimer) clearTimeout(fallbackTimer);

    fallbackTimer = setTimeout(() => {
      if (!unlocked) unlock("timeout");
    }, MAX_WAIT_MS);
  };

  const findVideo = () =>
    document.querySelector("#akira-player-root video") ||
    document.querySelector("#akira-player-root .akira-video") ||
    document.querySelector("video");

  const bindVideo = (v) => {
    if (!v || v === videoEl) return;

    videoEl = v;

    const markStarted = () => {
      started = true;
    };

    const maybeUnlock = (why) => {
      if (isUnmuted(videoEl)) unlock(why);
    };

    v.addEventListener("playing", () => {
      markStarted();

      if (unlocked) {
        overlay.classList.remove("middle-buffer");
        hideOverlay();
        hideRouteLoadingOverlay();
      }

      maybeUnlock("playing");
    });

    v.addEventListener("volumechange", () => {
      maybeUnlock("volumechange");
    });

    v.addEventListener("waiting", () => {
      if (started && unlocked) {
        overlay.classList.add("middle-buffer");
        showOverlay();
      }
    });

    maybeUnlock("bind");
  };

  window.hideWatchLoadingOverlay = function () {
    if (!unlocked) {
      showOverlay();
      overlay.classList.remove("middle-buffer");
      return;
    }

    hideOverlay();
    hideRouteLoadingOverlay();

    if (typeof originalHide === "function") {
      try {
        originalHide();
      } catch (e) {
        console.warn("[watch] originalHide error:", e);
      }
    }
  };

  window.__SATV_RESET_WATCH_OVERLAY_LOCK__ = function () {
    unlocked = false;
    started = false;
    videoEl = null;

    showOverlay();
    scheduleFallback();

    const found = findVideo();
    if (found) bindVideo(found);
  };

  bindVideo(findVideo());
  scheduleFallback();

  const root = document.getElementById("akira-player-root") || document.body;

  const observer = new MutationObserver(() => {
    const found = findVideo();

    if (found && found !== videoEl) {
      bindVideo(found);
    }
  });

  try {
    observer.observe(root, {
      childList: true,
      subtree: true
    });
  } catch { }

  setInterval(() => {
    const found = findVideo();

    if (found && found !== videoEl) {
      bindVideo(found);
    }

    if (!unlocked && videoEl && isUnmuted(videoEl)) {
      unlock("poll");
    }
  }, POLL_MS);
})();

boot();