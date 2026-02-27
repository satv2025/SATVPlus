// /js/api.js
import { supabase } from "./supabaseClient.js";

/* =========================================================
   HELPERS
========================================================= */

const MOVIE_CARD_FIELDS = `
  id,
  title,
  description,
  thumbnail_url,
  banner_url,
  m3u8_url,
  vtt_url,
  category,
  created_at,
  release_year,
  duration_minutes
`;

function clampLimit(limit, min = 1, max = 100, fallback = 24) {
  const n = Number(limit);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeEmbeddedOne(value) {
  // Supabase normalmente devuelve objeto en many-to-one,
  // pero esto evita romper si llega array por alguna configuración/join.
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function normalizeMovieMeta(row) {
  if (!row) return row;
  const mm = Array.isArray(row.movie_meta)
    ? (row.movie_meta[0] || null)
    : (row.movie_meta || null);

  return { ...row, movie_meta: mm };
}

/* =========================================================
   PROFILES (tabla public.profiles)
========================================================= */

export async function fetchProfile(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(`
      id,
      email,
      full_name,
      username,
      phone,
      avatar_url,
      created_at
    `)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// (Opcional) útil para editar perfil más adelante
export async function updateMyProfile(userId, patch = {}) {
  if (!userId) throw new Error("Falta userId");

  const allowed = {
    email: patch.email ?? undefined,
    full_name: patch.full_name ?? undefined,
    username: patch.username ?? undefined,
    phone: patch.phone ?? undefined,
    avatar_url: patch.avatar_url ?? undefined,
  };

  // Sacar undefined
  const clean = Object.fromEntries(
    Object.entries(allowed).filter(([, v]) => v !== undefined)
  );

  if (Object.keys(clean).length === 0) return null;

  const { data, error } = await supabase
    .from("profiles")
    .update(clean)
    .eq("id", userId)
    .select(`
      id,
      email,
      full_name,
      username,
      phone,
      avatar_url,
      created_at
    `)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/* =========================================================
   CONTINUE WATCHING (desde watch_progress)
========================================================= */

/**
 * Devuelve filas de watch_progress con embeds:
 * - movies
 * - episodes (si aplica)
 *
 * home.js espera:
 *   r.progress_seconds
 *   r.updated_at
 *   r.movies?.id
 *   r.episodes (opcional)
 */
export async function fetchContinueWatching(userId, limit = 24) {
  if (!userId) return [];

  const safeLimit = clampLimit(limit, 1, 100, 24);

  // Usamos aliases + FK explícitas para evitar ambigüedad.
  const selectWPWithDuration = `
    id,
    user_id,
    movie_id,
    episode_id,
    progress_seconds,
    duration_seconds,
    updated_at,
    movies:movies!watch_progress_movie_id_fkey (
      ${MOVIE_CARD_FIELDS}
    ),
    episodes:episodes!watch_progress_episode_id_fkey (
      id,
      series_id,
      season,
      episode_number,
      title,
      created_at
    )
  `;

  const selectWPFallback = `
    id,
    user_id,
    movie_id,
    episode_id,
    progress_seconds,
    updated_at,
    movies:movies!watch_progress_movie_id_fkey (
      ${MOVIE_CARD_FIELDS}
    ),
    episodes:episodes!watch_progress_episode_id_fkey (
      id,
      series_id,
      season,
      episode_number,
      title,
      created_at
    )
  `;

  let { data, error } = await supabase
    .from("watch_progress")
    .select(selectWPWithDuration)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(safeLimit);

  // Fallback si duration_seconds aún no existe en la tabla
  if (error && String(error.message || "").toLowerCase().includes("duration_seconds")) {
    const retry = await supabase
      .from("watch_progress")
      .select(selectWPFallback)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(safeLimit);

    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;

  return (data || []).map((row) => ({
    ...row,
    movies: normalizeEmbeddedOne(row.movies),
    episodes: normalizeEmbeddedOne(row.episodes)
  }));
}

/* =========================================================
   MOVIES
========================================================= */

export async function fetchLatest(limit = 24) {
  const safeLimit = clampLimit(limit, 1, 100, 24);

  const { data, error } = await supabase
    .from("movies")
    .select(MOVIE_CARD_FIELDS)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data || [];
}

export async function fetchByCategory(category, limit = 24) {
  const safeLimit = clampLimit(limit, 1, 100, 24);

  const { data, error } = await supabase
    .from("movies")
    .select(MOVIE_CARD_FIELDS)
    .eq("category", category)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data || [];
}

/**
 * 1 movie por UUID + movie_meta
 */
export async function fetchMovie(movieId) {
  if (!movieId) return null;

  const { data, error } = await supabase
    .from("movies")
    .select(`
      ${MOVIE_CARD_FIELDS},
      movie_meta!movie_id (
        created_by,
        fullcast,
        fullscript,
        fullgenres,
        fulltitletype,
        fullage,
        seasons_count,
        episodes_count
      )
    `)
    .eq("id", movieId)
    .limit(1);

  if (error) throw error;

  const row = data?.[0] || null;
  if (!row) return null;

  return normalizeMovieMeta(row);
}

/**
 * TE PODRÍA GUSTAR
 * Trae movies excluyendo la UUID actual (con movie_meta para temporadas/episodios)
 */
export async function fetchMoreExcluding(movieId, limit = 24) {
  const safeLimit = clampLimit(limit, 1, 100, 24);

  const { data, error } = await supabase
    .from("movies")
    .select(`
      id,
      title,
      description,
      thumbnail_url,
      banner_url,
      category,
      created_at,
      release_year,
      duration_minutes,
      movie_meta!movie_id (
        seasons_count,
        episodes_count
      )
    `)
    .neq("id", movieId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;

  return (data || []).map(normalizeMovieMeta);
}

/* =========================================================
   CREATE MOVIE / EPISODE (UPLOAD ADMIN)
========================================================= */

export async function createMovie(payload) {
  const { data, error } = await supabase
    .from("movies")
    .insert([payload])
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function createEpisode(payload) {
  const { data, error } = await supabase
    .from("episodes")
    .insert([payload])
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

/* =========================================================
   EPISODES
   TU COLUMNA ES: "thumbnails-episode" (con guión)
========================================================= */

export async function fetchSeasonCount(seriesId) {
  if (!seriesId) return 0;

  const { data, error } = await supabase
    .from("episodes")
    .select("season")
    .eq("series_id", seriesId);

  if (error) throw error;

  const seasons = new Set(
    (data || [])
      .map((r) => r.season)
      .filter((v) => v !== null && v !== undefined)
  );

  return seasons.size;
}

export async function fetchEpisodes(seriesId) {
  if (!seriesId) return [];

  const { data, error } = await supabase
    .from("episodes")
    .select(`
      id,
      series_id,
      season,
      episode_number,
      title,
      m3u8_url,
      vtt_url,
      created_at,
      sinopsis,
      thumbnails-episode
    `)
    .eq("series_id", seriesId)
    .order("season", { ascending: true })
    .order("episode_number", { ascending: true });

  if (error) throw error;
  return data || [];
}