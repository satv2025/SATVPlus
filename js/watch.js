// js/watch.js
// SATV+ Watch loader (SIN proxy / SIN remote-media)
// Lee m3u8_url y vtt_url DESDE SUPABASE y los pasa directos al player.
//
// Requiere:
// - watch.html con window.renderAkiraPlayer(props)
// - ./supabaseClient.js exportando `supabase`
// - UMD de Akira cargado

import { supabase } from "./supabaseClient.js";

/* ============================================================
 * ESQUEMA REAL (según tus tablas)
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
      seriesId: "series_id", // FK -> movies.id (category='series')
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

const ROOT_ID = "akira-player-root";
const DEBUG = true;

/* ============================================================
 * UI helpers
 * ============================================================ */
function getRootEl() {
  return document.getElementById(ROOT_ID) || document.body;
}

function setLoading() {
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
          width:42px;
          height:42px;
          border-radius:999px;
          border:3px solid rgba(37,99,235,.22);
          border-top-color:#2563eb;
          animation:satv-spin .8s linear infinite;
        "></div>
      </div>
    </div>
    <style>
      @keyframes satv-spin { to { transform: rotate(360deg); } }
    </style>
  `;
}

function setError(message, details = "") {
  const root = getRootEl();
  root.innerHTML = `
    <div style="
      min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#000;color:#fff;padding:24px;box-sizing:border-box;
      font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    ">
      <div style="
        width:min(820px,100%);
        background:rgba(120,20,20,.22);
        border:1px solid rgba(255,80,80,.25);
        border-radius:14px;padding:18px;
      ">
        <div style="font-size:18px;font-weight:700;margin-bottom:8px;">Error al cargar reproducción</div>
        <div style="opacity:.95;margin-bottom:10px;">${escapeHtml(message)}</div>
        ${details
      ? `<pre style="white-space:pre-wrap;word-break:break-word;margin:0;padding:12px;border-radius:10px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08);font-size:12px;line-height:1.35;opacity:.9;">${escapeHtml(details)}</pre>`
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
    "https://akira.satvplus.com.ar/assets"
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
    // debug opcional: ?forceThumbsLocal=1
    forceThumbsLocal: url.searchParams.get("forceThumbsLocal") === "1"
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

function isHlsUrl(url) {
  return /\.m3u8(\?|#|$)/i.test(String(url || ""));
}

// SIN PROXY: devuelve URL directa (normalizada)
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

  // Si en DB guardaste thumbs.vtt acá, NO lo tratamos como subtítulo
  if (isThumbsVtt(vttUrlFromSupabase)) {
    return [];
  }

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

function buildTracksAlias(subtitles = []) {
  // Alias para players que esperan "tracks" en vez de "subtitles"
  return safeArray(subtitles).map((t) => ({
    kind: "subtitles",
    src: t.src,
    srclang: t.srclang || "es",
    label: t.label || "Español",
    default: !!t.default
  }));
}

function buildSourceAliases(src) {
  const clean = proxifyRemoteUrl(src);
  if (!clean) {
    return {
      src: undefined,
      source: undefined,
      sources: []
    };
  }

  const type = isHlsUrl(clean) ? "application/x-mpegURL" : undefined;

  return {
    // Formato simple (muchos players custom)
    src: clean,
    // Alias por compatibilidad
    source: clean,
    // Formato array (video.js/otros wrappers)
    sources: [
      type ? { src: clean, type } : { src: clean }
    ]
  };
}

function computeThumbnailsVtt(vttUrlFromSupabase, { allowOnLocal = false } = {}) {
  if (!vttUrlFromSupabase) return undefined;
  if (!isThumbsVtt(vttUrlFromSupabase)) return undefined;

  const canUse = allowOnLocal || !isLocalhostPage();
  if (!canUse) return undefined;

  return proxifyRemoteUrl(vttUrlFromSupabase);
}

function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

function withTimeout(promise, ms, label = "Operación") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} excedió ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/* ============================================================
 * Supabase queries (fuente única de m3u8/vtt)
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
          m.releaseYear
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
          m.vtt
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
    console.warn("[watch] recomendaciones fallback error:", error);
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
 * Map -> AkiraPlayer props
 * ============================================================ */
function buildCommonPlaybackProps({
  srcUrl,
  poster,
  autoplay,
  title,
  contentId,
  seasonId,
  episodeId,
  recommendations,
  episodes,
  vttUrlFromSupabase,
  allowThumbsOnLocal = false
}) {
  const sourceAliases = buildSourceAliases(srcUrl);
  const subtitles = normalizeSubtitlesFromVtt(vttUrlFromSupabase);
  const tracks = buildTracksAlias(subtitles);
  const thumbsVtt = computeThumbnailsVtt(vttUrlFromSupabase, {
    allowOnLocal: allowThumbsOnLocal
  });

  // Extra aliases por compatibilidad entre builds del player
  const thumbnailsObj = thumbsVtt ? { vtt: thumbsVtt } : undefined;

  return {
    ...sourceAliases,

    poster: poster || undefined,
    autoplay: !!autoplay,

    // Ayuda contra autoplay-block en algunos navegadores:
    // si querés autoplay real sin interacción, muchos navegadores exigen muted=true
    muted: false,
    playsInline: true,
    preload: "auto",
    crossorigin: "anonymous",

    title: title || "SATV+",
    channelLabel: "SATVPlus",
    assetBaseUrl: getAssetBaseUrl(),

    contentId: contentId ?? null,
    seasonId: seasonId ?? null,
    episodeId: episodeId ?? null,

    // Thumbnails (varios aliases)
    thumbnailsVtt: thumbsVtt,
    previewThumbnailsVtt: thumbsVtt,
    thumbnails: thumbnailsObj,

    // Subtítulos (varios aliases)
    subtitles,
    tracks,

    recommendations: safeArray(recommendations),
    episodes: safeArray(episodes),
    recommendationsLabel: "Te podría gustar",

    // debug opcional para el player si lo soporta
    debug: true
  };
}

function movieToPlayerProps(movie, { autoplay = true, recommendations = [], forceThumbsLocal = false } = {}) {
  const m = DB.movies.cols;

  const m3u8FromSupabase = movie[m.m3u8];
  const vttFromSupabase = movie[m.vtt];

  debugLog("[watch] movie m3u8 desde Supabase:", m3u8FromSupabase);
  debugLog("[watch] movie vtt desde Supabase:", vttFromSupabase);

  const props = buildCommonPlaybackProps({
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

  const props = buildCommonPlaybackProps({
    srcUrl: m3u8FromSupabase,
    poster: (series && (series[m.banner] || series[m.thumbnail])) || undefined,
    autoplay,
    title: episode[e.title] || (series && series[m.title]) || "SATV+",
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
 * Resolve route
 * ============================================================ */
async function resolveRouteAndBuildProps() {
  const { movieId, episodeId, seriesId, autoplay, forceThumbsLocal } = getParams();
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
        console.warn("[watch] No se pudo cargar serie:", err);
      }

      try {
        episodesList = await fetchEpisodesForSeries(resolvedSeriesId);
      } catch (err) {
        console.warn("[watch] No se pudo cargar lista de episodios:", err);
      }
    }

    const recommendations = await fetchRecommendations(resolvedSeriesId || null);

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

  // ?series=<uuid> -> primer episodio
  if (seriesId) {
    if (!isUuid(seriesId)) {
      throw new Error("Parámetro ?series inválido (UUID esperado)");
    }

    await fetchSeriesById(seriesId); // valida existencia

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
 * Post-render debug
 * ============================================================ */
function inspectMountedVideoLater() {
  setTimeout(() => {
    const root = getRootEl();
    const video = root?.querySelector?.("video");
    if (!video) {
      console.warn("[watch] No se encontró <video> tras render.");
      return;
    }

    const err = video.error
      ? { code: video.error.code, message: video.error.message || null }
      : null;

    console.log("[watch] video debug (post-render)", {
      currentSrc: video.currentSrc,
      srcAttr: video.getAttribute("src"),
      readyState: video.readyState,
      networkState: video.networkState,
      paused: video.paused,
      muted: video.muted,
      error: err
    });
  }, 2500);
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

    debugLog("[watch] props finales:", result.props);
    debugLog("[watch] src final (directo desde Supabase):", result.props?.src);
    debugLog("[watch] source alias:", result.props?.source);
    debugLog("[watch] sources alias:", result.props?.sources);
    debugLog("[watch] thumbnailsVtt:", result.props?.thumbnailsVtt);
    debugLog("[watch] subtitles (directo desde Supabase):", result.props?.subtitles);

    setDocumentTitle(result.title);

    const root = getRootEl();
    if (root) root.innerHTML = "";

    window.renderAkiraPlayer(result.props);

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
            code: err.code || null
          },
          null,
          2
        )
        : "";

    setError(msg, details);
  }
}

boot();