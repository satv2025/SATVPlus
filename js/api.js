// /js/api.js
import { supabase } from "./supabaseClient.js";

/* =========================================================
   MOVIES
========================================================= */

export async function fetchLatest(limit = 24) {
  const { data, error } = await supabase
    .from("movies")
    .select(`
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
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function fetchByCategory(category, limit = 24) {
  const { data, error } = await supabase
    .from("movies")
    .select(`
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
    `)
    .eq("category", category)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * 1 movie por UUID + movie_meta
 */
export async function fetchMovie(movieId) {
  const { data, error } = await supabase
    .from("movies")
    .select(`
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
      duration_minutes,
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

  const mm = Array.isArray(row.movie_meta) ? (row.movie_meta[0] || null) : (row.movie_meta || null);
  return { ...row, movie_meta: mm };
}

/**
 * TE PODRÍA GUSTAR
 * Trae movies excluyendo la UUID actual (con movie_meta para temporadas/episodios)
 */
export async function fetchMoreExcluding(movieId, limit = 24) {
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
    .limit(limit);

  if (error) throw error;

  return (data || []).map(row => {
    const mm = Array.isArray(row.movie_meta) ? (row.movie_meta[0] || null) : (row.movie_meta || null);
    return { ...row, movie_meta: mm };
  });
}

/* =========================================================
   EPISODES
   TU COLUMNA ES: "thumbnails-episode" (con guión)
========================================================= */

export async function fetchSeasonCount(seriesId) {
  const { data, error } = await supabase
    .from("episodes")
    .select("season")
    .eq("series_id", seriesId);

  if (error) throw error;

  const seasons = new Set((data || []).map(r => r.season).filter(v => v !== null && v !== undefined));
  return seasons.size;
}

export async function fetchEpisodes(seriesId) {
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