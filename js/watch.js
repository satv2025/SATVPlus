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
      // Si luego renombrás la columna rara:
      // thumbnailsEpisodeVtt: "thumbnails_episode_vtt_url"
    }
  }
};

const ROOT_ID = "akira-player-root";

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
    autoplay: url.searchParams.get("autoplay") !== "0"
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

// SIN PROXY: devuelve URL directa
function proxifyRemoteUrl(url) {
  if (!url) return undefined;
  return String(url).trim();
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

  return [
    {
      src: proxifyRemoteUrl(vttUrlFromSupabase),
      srclang: "es",
      label: "Español",
      default: true
    }
  ];
}

/* ============================================================
 * Supabase queries (fuente única de m3u8/vtt)
 * ============================================================ */
async function fetchMovieById(movieId) {
  const m = DB.movies.cols;
  const { data, error } = await supabase
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
    .single();

  if (error) throw error;
  return data;
}

async function fetchSeriesById(seriesId) {
  const m = DB.movies.cols;
  const { data, error } = await supabase
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
    .single();

  if (error) throw error;
  return data;
}

async function fetchEpisodeById(episodeId) {
  const e = DB.episodes.cols;
  const { data, error } = await supabase
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
    .single();

  if (error) throw error;
  return data;
}

async function fetchEpisodesForSeries(seriesId) {
  const e = DB.episodes.cols;
  const { data, error } = await supabase
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
    .limit(500);

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

  const { data, error } = await q;
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
function movieToPlayerProps(movie, { autoplay = true, recommendations = [] } = {}) {
  const m = DB.movies.cols;

  const m3u8FromSupabase = movie[m.m3u8];
  const vttFromSupabase = movie[m.vtt];

  console.log("[watch] movie m3u8 desde Supabase:", m3u8FromSupabase);
  console.log("[watch] movie vtt desde Supabase:", vttFromSupabase);

  return {
    src: proxifyRemoteUrl(m3u8FromSupabase),
    poster: movie[m.banner] || movie[m.thumbnail] || undefined,
    autoplay,
    title: movie[m.title] || "SATV+",
    channelLabel: "SATVPlus",
    assetBaseUrl: getAssetBaseUrl(),

    contentId: movie[m.id],
    seasonId: null,
    episodeId: null,

    // Si alguna vez movies.vtt_url fuese un thumbs.vtt, esto lo activa solo fuera de localhost
    thumbnailsVtt:
      !isLocalhostPage() && isThumbsVtt(vttFromSupabase)
        ? proxifyRemoteUrl(vttFromSupabase)
        : undefined,

    subtitles: normalizeSubtitlesFromVtt(vttFromSupabase),

    recommendations,
    episodes: [],
    recommendationsLabel: "Te podría gustar",

    onBack: () => window.history.back(),

    onSelectRecommendation: (item) => {
      if (!item?.id) return;
      window.location.href = buildWatchUrl(
        item.type === "series"
          ? { series: item.id }
          : { movie: item.id }
      );
    }
  };
}

function episodeToPlayerProps(
  episode,
  { series, episodes, recommendations = [], autoplay = true } = {}
) {
  const e = DB.episodes.cols;
  const m = DB.movies.cols;

  const seriesId = series?.[m.id] || episode[e.seriesId] || null;

  const m3u8FromSupabase = episode[e.m3u8];
  const vttFromSupabase = episode[e.vtt];

  console.log("[watch] episode m3u8 desde Supabase:", m3u8FromSupabase);
  console.log("[watch] episode vtt desde Supabase:", vttFromSupabase);

  return {
    src: proxifyRemoteUrl(m3u8FromSupabase),
    poster: (series && (series[m.banner] || series[m.thumbnail])) || undefined,
    autoplay,
    title: episode[e.title] || (series && series[m.title]) || "SATV+",
    channelLabel: "SATVPlus",
    assetBaseUrl: getAssetBaseUrl(),

    contentId: seriesId || episode[e.id],
    seasonId: episode[e.season] != null ? String(episode[e.season]) : null,
    episodeId: episode[e.id],

    // Si vtt_url es thumbs.vtt, lo usamos como preview SOLO fuera de localhost
    thumbnailsVtt:
      !isLocalhostPage() && isThumbsVtt(vttFromSupabase)
        ? proxifyRemoteUrl(vttFromSupabase)
        : undefined,

    // Si vtt_url es thumbs.vtt, esta función devuelve []
    subtitles: normalizeSubtitlesFromVtt(vttFromSupabase),

    episodes: safeArray(episodes),
    recommendations: safeArray(recommendations),
    recommendationsLabel: "Te podría gustar",

    onBack: () => window.history.back(),

    onSelectEpisode: (selectedEpisodeId) => {
      if (!selectedEpisodeId) return;
      window.location.href = buildWatchUrl({
        series: seriesId,
        episode: selectedEpisodeId
      });
    },

    onSelectRecommendation: (item) => {
      if (!item?.id) return;
      window.location.href = buildWatchUrl(
        item.type === "series"
          ? { series: item.id }
          : { movie: item.id }
      );
    }
  };
}

/* ============================================================
 * Resolve route
 * ============================================================ */
async function resolveRouteAndBuildProps() {
  const { movieId, episodeId, seriesId, autoplay } = getParams();
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
      props: movieToPlayerProps(movie, { autoplay, recommendations })
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
        autoplay
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

    console.log("[watch] props finales:", result.props);
    console.log("[watch] src final (directo desde Supabase):", result.props?.src);
    console.log("[watch] subtitles (directo desde Supabase):", result.props?.subtitles);

    setDocumentTitle(result.title);

    const root = getRootEl();
    if (root) root.innerHTML = "";

    window.renderAkiraPlayer(result.props);
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