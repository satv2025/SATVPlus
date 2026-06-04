// js/watch.js
// SATV+ Watch loader
// - Soporta movie / episode / series
// - Soporta collection + movie
// - En collection mode, el modal del player usa una lista obtenida desde public.movies
//   filtrando por movies.collection_id = collections.id
//   y navega con /watch?collection=<uuid>&movie=<uuid>

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
      isObfitContain: "is_obfit_contain"
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

function setLoading() {
  const usedGlobalOverlay = showWatchLoadingOverlay("");

  if (usedGlobalOverlay) {
    const root = getRootEl();
    if (root) root.innerHTML = "";
    return;
  }

  const root = getRootEl();
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
        color:#2563eb;
      ">
        <div style="
          width:84px;
          height:84px;
          border-radius:999px;
          border:5px solid rgba(37, 100, 235, 0);
          border-top-color:#2563eb;
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
        ${details
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
function getParams() {
  const url = new URL(window.location.href);
  return {
    movieId: url.searchParams.get("movie"),
    episodeId: url.searchParams.get("episode"),
    seriesId: url.searchParams.get("series"),
    collectionId: url.searchParams.get("collection"),
    autoplay: url.searchParams.get("autoplay") !== "0",
    forceThumbsLocal: url.searchParams.get("forceThumbsLocal") === "1",
    probe: url.searchParams.get("probe") !== "0"
  };
}

function buildWatchUrl(params) {
  const url = new URL(window.location.href);
  url.search = "";
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );
}

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
    s.includes("thumbs.vtt") || s.includes("thumbnail") || s.includes("thumbnails")
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
  if (!url || !isLikelyAbsoluteUrl(url) || !/\.m3u8(\?|#|$)|\.mpd(\?|#|$)/i.test(url)) return;

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
          m.isObfitContain
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
          m.liveStartsAt
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
        [e.id, e.seriesId, e.season, e.episodeNumber, e.title, e.m3u8, e.vtt, e.sinopsis].join(",")
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
      [m.id, m.title, m.description, m.thumbnail, m.banner, m.category, m.createdAt].join(",")
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
        .select([c.id, c.title, c.description, c.thumbnail, c.banner, c.createdAt].join(","))
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
            m.isObfitContain
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
  isObfitContain = false
}) {
  const src = proxifyRemoteUrl(srcUrl);
  const subtitles = normalizeSubtitlesFromVtt(vttUrlFromSupabase);
  const thumbnailsVtt = computeThumbnailsVtt(vttUrlFromSupabase, {
    allowOnLocal: allowThumbsOnLocal
  });

  const props = {
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
    isObfitContain: !!isObfitContain
  };

  return props;
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
    isObfitContain: movie[m.isObfitContain]
  });

  props.onBack = () => window.history.back();

  props.onSelectRecommendation = (item) => {
    if (!item?.id) return;
    window.location.href = buildWatchUrl(
      item.type === "series" ? { series: item.id } : { movie: item.id }
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

  const seriesId = series?.[m.id] || episode[e.seriesId] || null;
  const m3u8FromSupabase = episode[e.m3u8];
  const vttFromSupabase = episode[e.vtt];
  const isLiveMode = Boolean(series?.[m.liveMode]);
  const liveStartsAt = series?.[m.liveStartsAt] || null;

  const props = buildAkiraProps({
    srcUrl: m3u8FromSupabase,
    poster: (series && (series[m.banner] || series[m.thumbnail])) || undefined,
    autoplay,
    title: episode[e.title] || series?.[m.title] || "SATV+",
    contentId: seriesId || episode[e.id],
    seasonId: episode[e.season] != null ? String(episode[e.season]) : null,
    episodeId: episode[e.id],
    recommendations,
    episodes,
    vttUrlFromSupabase: vttFromSupabase,
    allowThumbsOnLocal: forceThumbsLocal,
    isLiveMode,
    liveStartsAt
  });

  props.onBack = () => window.history.back();

  props.onSelectEpisode = (selectedEpisodeId) => {
    if (!selectedEpisodeId) return;
    window.location.href = buildWatchUrl({
      series: seriesId,
      episode: selectedEpisodeId
    });
  };

  props.onSelectRecommendation = (item) => {
    if (!item?.id) return;
    window.location.href = buildWatchUrl(
      item.type === "series" ? { series: item.id } : { movie: item.id }
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

  const props = buildAkiraProps({
    srcUrl: m3u8FromSupabase,
    poster: movie[m.banner] || movie[m.thumbnail] || posterFromCollection,
    autoplay,
    title: movie[m.title] || "SATV+",
    contentId: movie[m.id],
    seasonId: collectionId || null,
    episodeId: movie[m.id],
    recommendations,
    episodes: collectionItems,
    vttUrlFromSupabase: vttFromSupabase,
    allowThumbsOnLocal: forceThumbsLocal,
    isLiveMode,
    liveStartsAt,
    isCollectionMode: true,
    collectionLabel: collectionMeta?.[c?.title] || "Colección",
    collectionId,
    isObfitContain: movie[m.isObfitContain]
  });

  props.onBack = () => window.history.back();

  props.onSelectEpisode = (selectedMovieId) => {
    if (!selectedMovieId || !collectionId) return;
    window.location.href = buildWatchUrl({
      collection: collectionId,
      movie: selectedMovieId
    });
  };

  props.onSelectRecommendation = (item) => {
    if (!item?.id) return;
    window.location.href = buildWatchUrl(
      item.type === "series" ? { series: item.id } : { movie: item.id }
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

  const m = DB.movies.cols;
  const e = DB.episodes.cols;
  const c = DB.collections.cols;

  // ?collection=<uuid>&movie=<uuid>
  if (collectionId && movieId) {
    if (!isUuid(collectionId)) {
      throw new Error("Parámetro ?collection inválido (UUID esperado)");
    }

    if (!isUuid(movieId)) {
      throw new Error("Parámetro ?movie inválido (UUID esperado)");
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
      : [{
        id: String(movie[m.id]),
        title: movie[m.title] || "Contenido actual",
        synopsis: movie[m.description] || null,
        thumbnail: movie[m.thumbnail] || movie[m.banner] || null,
        seasonNumber: 1,
        episodeNumber: 1,
        durationSeconds: Number.isFinite(Number(movie[m.durationMinutes]))
          ? Number(movie[m.durationMinutes]) * 60
          : null
      }];

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
      throw new Error("Parámetro ?movie inválido (UUID esperado)");
    }

    const movie = await fetchMovieById(movieId);
    if (!movie) throw new Error("No se encontró la película");

    if (movie[m.category] !== "movie") {
      if (movie[m.category] === "series") {
        window.location.replace(buildWatchUrl({ series: movie[m.id] }));
        return null;
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
      throw new Error("Parámetro ?episode inválido (UUID esperado)");
    }

    const episode = await fetchEpisodeById(episodeId);

    if (!episode) throw new Error("No se encontró el episodio");
    if (!episode[e.m3u8]) throw new Error("El episodio no tiene m3u8_url");

    const resolvedSeriesId = seriesId || episode[e.seriesId] || null;

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

    const liveStartsAtDate = series ? getLiveStartDateFromRow(series, m.liveStartsAt) : null;
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
      throw new Error("Parámetro ?series inválido (UUID esperado)");
    }

    await fetchSeriesById(seriesId);

    const episodesList = await fetchEpisodesForSeries(seriesId);
    if (!episodesList.length) {
      throw new Error("La serie no tiene episodios cargados");
    }

    window.location.replace(
      buildWatchUrl({
        series: seriesId,
        episode: episodesList[0].id
      })
    );
    return null;
  }

  throw new Error("Ruta inválida. Usá ?movie=<uuid> o ?episode=<uuid> o ?series=<uuid> o ?collection=<uuid>&movie=<uuid>");
}

/* ============================================================
 * Aspect-ratio helpers (force contain for squarer videos)
 * ============================================================ */
const CONTAIN_MAX_ASPECT_RATIO = 1.55;
// <= 1.55 => 1:1, 5:4, 4:3, 3:2 aprox => contain
// >  1.55 => 16:10, 16:9, 21:9, etc => no contain

let __satvAspectStyleInjected = false;

function ensureAspectContainStyle() {
  if (__satvAspectStyleInjected) return;
  __satvAspectStyleInjected = true;

  const style = document.createElement("style");
  style.id = "satv-watch-aspect-style";

  // Reforzamos la regla para apuntar directamente a .akira-video,
  // a cualquier <video> dentro de .akira-video (por si es un contenedor),
  // y a la etiqueta genérica de <video>.
  style.textContent = `
    #${ROOT_ID}[data-force-video-contain="1"] .akira-video,
    #${ROOT_ID}[data-force-video-contain="1"] .akira-video video,
    #${ROOT_ID}[data-force-video-contain="1"] video {
      object-fit: contain !important;
      width: 100% !important;
      height: 100% !important;
    }
  `;
  document.head.appendChild(style);
}

function setForceVideoContain(enabled) {
  const root = getRootEl();
  if (!root) return;

  ensureAspectContainStyle();

  if (enabled) {
    root.setAttribute("data-force-video-contain", "1");
  } else {
    root.removeAttribute("data-force-video-contain");
  }
}

function getVideoAspectInfo(video) {
  const width = Number(video?.videoWidth || 0);
  const height = Number(video?.videoHeight || 0);

  if (!width || !height) return null;

  return {
    width,
    height,
    ratio: width / height
  };
}

function shouldForceContainByAspect(video) {
  const info = getVideoAspectInfo(video);
  if (!info) return false;

  // fuerza contain para formatos "cuadrados" o casi cuadrados:
  // 1:1, 5:4, 4:3, 3:2, etc.
  return info.ratio <= CONTAIN_MAX_ASPECT_RATIO;
}

function applyAspectModeFromVideo(video) {
  // 1. Leemos si Supabase dice que hay que forzar el contain
  const forceFromDB = !!window.__SATV_WATCH_LAST_PROPS__?.isObfitContain;

  const info = getVideoAspectInfo(video);
  if (!info && !forceFromDB) {
    debugLog("[watch][aspect] metadata no disponible todavía");
    return;
  }

  // 2. Si forceFromDB es true, usa contain. Si no, usa tu detector de aspect ratio.
  const forceContain = forceFromDB || shouldForceContainByAspect(video);
  setForceVideoContain(forceContain);

  infoLog("[watch][aspect] resolución detectada:", {
    width: info?.width,
    height: info?.height,
    ratio: info ? Number(info.ratio.toFixed(4)) : null,
    forcedByDatabase: forceFromDB,
    mode: forceContain ? "contain" : "default"
  });
}

function installAspectAutoDetection() {
  const root = getRootEl();
  if (!root) return;

  ensureAspectContainStyle();

  let lastVideo = null;

  const bindVideo = (video) => {
    if (!video || video === lastVideo) return;
    lastVideo = video;

    const reevaluate = () => applyAspectModeFromVideo(video);

    video.addEventListener("loadedmetadata", reevaluate);
    video.addEventListener("resize", reevaluate);

    // por si metadata ya estaba disponible
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

  // opcional: guardarlo global para debug
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
async function renderAndWaitPlayer(result) {
  window.__SATV_WATCH_LAST_RESULT__ = result;
  window.__SATV_WATCH_LAST_PROPS__ = result.props;

  debugLog("[watch] props finales:", result.props);
  debugLog("[watch] src final (Supabase):", result.props?.src);
  debugLog("[watch] thumbnailsVtt:", result.props?.thumbnailsVtt);
  debugLog("[watch] subtitles:", result.props?.subtitles);
  debugLog("[watch] liveGate:", result?.liveGate || null);

  setDocumentTitle(result.title);

  const root = getRootEl();
  if (root) root.innerHTML = "";

  const renderResult = window.renderAkiraPlayer(result.props);

  // NUEVO
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
  } catch (e) {
    warnLog("[watch] wait READY del player timeout/fallo:", e);
  }

  inspectMountedVideoLater();
}

/* ============================================================
 * Boot
 * ============================================================ */
async function boot() {
  try {
    setLoading();

    requireRenderBridge();

    if (!supabase || typeof supabase.from !== "function") {
      throw new Error("Cliente Supabase inválido en supabaseClient.js");
    }

    const result = await resolveRouteAndBuildProps();
    if (!result) return;

    await renderAndWaitPlayer(result);
  } catch (err) {
    console.error("[watch] boot error:", err);

    const msg = err?.message || "No se pudo cargar el contenido";
    const details =
      typeof err === "object" && err
        ? JSON.stringify(
          {
            message: err.message,
            details: err.details || null,
            hint: err.hint || null,
            code: err.code || null,
            stack: err.stack || null
          },
          null,
          2
        )
        : "";

    setError(msg, details);
  }
}

boot();