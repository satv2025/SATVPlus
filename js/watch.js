// js/watch.js
// SATV+ Watch loader (SIN proxy / SIN remote-media)
// Lee m3u8_url y vtt_url DESDE SUPABASE y los pasa directos al AkiraPlayer.
//
// Requiere:
// - watch.html con window.renderAkiraPlayer(props)
// - watch.html con window.waitForAkiraPlaybackReady(opts) o window.waitForCurrentAkiraPlaybackReady(opts)
// - ./supabaseClient.js exportando `supabase`
// - UMD de Akira cargado

import { supabase } from "./supabaseClient.js";

/* ============================================================
 * Config
 * ============================================================ */
const ROOT_ID = "akira-player-root";
const DEFAULT_ASSET_BASE = "https://akira.satvplus.com.ar/assets";
const NOW_URL = new URL(window.location.href);
const DEBUG = NOW_URL.searchParams.get("debug") === "1" || NOW_URL.searchParams.get("debug") === "true";

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
      category: "category", // 'movie' | 'series'
      createdAt: "created_at",
      vtt: "vtt_url",
      durationMinutes: "duration_minutes",
      releaseYear: "release_year"
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

function showWatchLoadingOverlay(text = "Cargando…") {
  try {
    if (typeof window.showWatchLoadingOverlay === "function") {
      window.showWatchLoadingOverlay(text);
      return true;
    }
  } catch {
    // noop
  }
  return false;
}

function hideWatchLoadingOverlay() {
  try {
    if (typeof window.hideWatchLoadingOverlay === "function") {
      window.hideWatchLoadingOverlay();
      return true;
    }
  } catch {
    // noop
  }
  return false;
}

function setLoading() {
  // ✅ Preferimos overlay global de watch.html (se mantiene hasta "playing")
  const usedGlobalOverlay = showWatchLoadingOverlay("Cargando…");

  // Fallback por compat (si no existe el overlay global)
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
          border:5px solid rgba(37,99,235,.22);
          border-top-color:#2563eb;
          animation:satv-spin .8s linear infinite;
        "></div>
        <div style="font-size:12px;opacity:.9;">Cargando…</div>
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
  document.title = name ? `${name} · SATV+ Watch` : "SATV+ Watch";
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
 * Params / helpers
 * ============================================================ */
function getParams() {
  const url = new URL(window.location.href);
  return {
    movieId: url.searchParams.get("movie"),
    episodeId: url.searchParams.get("episode"),
    seriesId: url.searchParams.get("series"),
    autoplay: url.searchParams.get("autoplay") !== "0",
    forceThumbsLocal: url.searchParams.get("forceThumbsLocal") === "1",
    probe: url.searchParams.get("probe") !== "0" // default ON
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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ""));
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function isHlsUrl(url) {
  return /\.m3u8(\?|#|$)/i.test(String(url || ""));
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
  return s.includes("thumbs.vtt") || s.includes("thumbnail") || s.includes("thumbnails");
}

function isLocalhostPage() {
  return location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

function normalizeSubtitlesFromVtt(vttUrlFromSupabase) {
  if (!vttUrlFromSupabase) return [];

  // Si vtt_url contiene thumbs.vtt, NO lo tratamos como subtítulo
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
  return !!v && (typeof v === "object" || typeof v === "function") && typeof v.then === "function";
}

/**
 * Espera el READY del player del mount actual.
 * Prioridad:
 * 1) renderAkiraPlayer(...).readyPromise (nuevo bridge)
 * 2) renderAkiraPlayer(...) devuelve Promise (compat)
 * 3) window.waitForCurrentAkiraPlaybackReady (nuevo bridge global)
 * 4) window.waitForAkiraPlaybackReady (legacy)
 */
async function awaitAkiraReadyAfterRender(renderResult, opts = {}) {
  const waitOpts = {
    timeoutMs: 45000,
    autoplayRetry: true,
    requireCustomReadyEvent: true,
    ...opts
  };

  let readyPromise = null;

  // Nuevo bridge: objeto con readyPromise
  if (renderResult && isPromiseLike(renderResult.readyPromise)) {
    readyPromise = renderResult.readyPromise;
  }
  // Compat: renderAkiraPlayer devuelve Promise directa
  else if (isPromiseLike(renderResult)) {
    readyPromise = renderResult;
  }
  // Nuevo helper global del bridge
  else if (typeof window.waitForCurrentAkiraPlaybackReady === "function") {
    readyPromise = window.waitForCurrentAkiraPlaybackReady(waitOpts);
  }
  // Legacy helper
  else if (typeof window.waitForAkiraPlaybackReady === "function") {
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
 * Probes (diagnóstico no bloqueante)
 * ============================================================ */
async function probeM3u8(url) {
  if (!url || !isLikelyAbsoluteUrl(url) || !isHlsUrl(url)) return;

  try {
    infoLog("[watch][probe] Probing m3u8:", url);

    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-store"
    });

    const text = await res.text();
    const lines = text.split("\n").slice(0, 10).join("\n");

    infoLog("[watch][probe] m3u8 response:", {
      ok: res.ok,
      status: res.status,
      type: res.type,
      redirected: res.redirected,
      finalUrl: res.url,
      contentType: res.headers.get("content-type"),
      firstLines: lines
    });

    if (!text.includes("#EXTM3U")) {
      warnLog("[watch][probe] El m3u8 no contiene #EXTM3U");
    }
  } catch (e) {
    console.error("[watch][probe] m3u8 fetch error:", {
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
      .select([
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
        m.releaseYear
      ].join(","))
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
      .select([
        m.id,
        m.title,
        m.description,
        m.thumbnail,
        m.banner,
        m.category,
        m.vtt
      ].join(","))
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
      .select([
        e.id,
        e.seriesId,
        e.season,
        e.episodeNumber,
        e.title,
        e.m3u8,
        e.createdAt,
        e.vtt,
        e.sinopsis
      ].join(","))
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
      .select([
        e.id,
        e.seriesId,
        e.season,
        e.episodeNumber,
        e.title,
        e.m3u8,
        e.vtt,
        e.sinopsis
      ].join(","))
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
    .select([
      m.id,
      m.title,
      m.description,
      m.thumbnail,
      m.banner,
      m.category,
      m.createdAt
    ].join(","))
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

/* ============================================================
 * Mapping -> AkiraPlayer props (reales)
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
  allowThumbsOnLocal = false
}) {
  const src = proxifyRemoteUrl(srcUrl);
  const subtitles = normalizeSubtitlesFromVtt(vttUrlFromSupabase);
  const thumbnailsVtt = computeThumbnailsVtt(vttUrlFromSupabase, { allowOnLocal: allowThumbsOnLocal });

  const props = {
    // === Props reales que espera AkiraPlayer.tsx ===
    src,
    poster: poster || undefined,
    autoplay: !!autoplay,
    title: title || "SATV+",
    channelLabel: "SATVPlus",
    assetBaseUrl: getAssetBaseUrl(),

    contentId: contentId ?? "",
    seasonId: seasonId ?? null,
    episodeId: episodeId ?? null,

    thumbnailsVtt,
    subtitles,

    recommendations: safeArray(recommendations),
    episodes: safeArray(episodes),
    recommendationsLabel: "Te podría gustar",

    // explícito
    playlistMode: true
  };

  return props;
}

function movieToPlayerProps(movie, { autoplay = true, recommendations = [], forceThumbsLocal = false } = {}) {
  const m = DB.movies.cols;

  const m3u8FromSupabase = movie[m.m3u8];
  const vttFromSupabase = movie[m.vtt];

  debugLog("[watch] movie m3u8 desde Supabase:", m3u8FromSupabase);
  debugLog("[watch] movie vtt desde Supabase:", vttFromSupabase);

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
    allowThumbsOnLocal: forceThumbsLocal
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
  {
    series,
    episodes,
    recommendations = [],
    autoplay = true,
    forceThumbsLocal = false
  } = {}
) {
  const e = DB.episodes.cols;
  const m = DB.movies.cols;

  const seriesId = series?.[m.id] || episode[e.seriesId] || null;
  const m3u8FromSupabase = episode[e.m3u8];
  const vttFromSupabase = episode[e.vtt];

  debugLog("[watch] episode m3u8 desde Supabase:", m3u8FromSupabase);
  debugLog("[watch] episode vtt desde Supabase:", vttFromSupabase);

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
    allowThumbsOnLocal: forceThumbsLocal
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

/* ============================================================
 * Route resolver
 * ============================================================ */
async function resolveRouteAndBuildProps() {
  const { movieId, episodeId, seriesId, autoplay, forceThumbsLocal, probe } = getParams();
  const m = DB.movies.cols;
  const e = DB.episodes.cols;

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

    return {
      title: movie[m.title] || "Película",
      props: movieToPlayerProps(movie, { autoplay, recommendations, forceThumbsLocal })
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
      : (episode[e.title] || "Episodio");

    return {
      title,
      props: episodeToPlayerProps(episode, {
        series,
        episodes: episodesList,
        recommendations,
        autoplay,
        forceThumbsLocal
      })
    };
  }

  // ?series=<uuid> -> redirige al primer episodio
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

  throw new Error("Ruta inválida. Usá ?movie=<uuid> o ?episode=<uuid> o ?series=<uuid>");
}

/* ============================================================
 * Post-render debug del <video> (por fuera de Akira)
 * ============================================================ */
function mediaErrorName(code) {
  return ({
    1: "MEDIA_ERR_ABORTED",
    2: "MEDIA_ERR_NETWORK",
    3: "MEDIA_ERR_DECODE",
    4: "MEDIA_ERR_SRC_NOT_SUPPORTED"
  })[code] || "UNKNOWN_MEDIA_ERROR";
}

function networkStateName(v) {
  return ({
    0: "NETWORK_EMPTY",
    1: "NETWORK_IDLE",
    2: "NETWORK_LOADING",
    3: "NETWORK_NO_SOURCE"
  })[v] || "UNKNOWN_NETWORK_STATE";
}

function readyStateName(v) {
  return ({
    0: "HAVE_NOTHING",
    1: "HAVE_METADATA",
    2: "HAVE_CURRENT_DATA",
    3: "HAVE_FUTURE_DATA",
    4: "HAVE_ENOUGH_DATA"
  })[v] || "UNKNOWN_READY_STATE";
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
    if (!result) return; // redirect

    window.__SATV_WATCH_LAST_RESULT__ = result;
    window.__SATV_WATCH_LAST_PROPS__ = result.props;

    debugLog("[watch] props finales:", result.props);
    debugLog("[watch] src final (Supabase):", result.props?.src);
    debugLog("[watch] thumbnailsVtt:", result.props?.thumbnailsVtt);
    debugLog("[watch] subtitles:", result.props?.subtitles);

    setDocumentTitle(result.title);

    const root = getRootEl();
    if (root) root.innerHTML = "";

    // ✅ render + esperar el READY del MISMO mount actual
    // (y ahora el READY exige que el video esté PLAYING)
    const renderResult = window.renderAkiraPlayer(result.props);

    try {
      const readyInfo = await awaitAkiraReadyAfterRender(renderResult, {
        timeoutMs: 45000,
        autoplayRetry: true,
        requireCustomReadyEvent: true
      });

      window.__SATV_WATCH_LAST_READY_INFO__ = readyInfo;
      infoLog("[watch] Akira playback ready:", readyInfo);

      // ✅ Se oculta cuando ya entró en playing (porque el bridge resuelve recién ahí)
      hideWatchLoadingOverlay();
    } catch (e) {
      // OJO: no ocultamos siempre acá, porque si autoplay está bloqueado
      // el loader debe quedarse hasta que el usuario dé play (evento playing).
      warnLog("[watch] wait READY del player timeout/fallo:", e);
    }

    // corre después del intento de wait (éxito o fallo), para que el timing sea relativo al ready
    inspectMountedVideoLater();
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