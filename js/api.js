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
      created_at
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
      created_at
    `)
    .eq("category", category)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

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
      created_at
    `)
    .eq("id", movieId)
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

/* =========================================================
   EPISODES
========================================================= */

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
      created_at
    `)
    .eq("series_id", seriesId)
    .order("season", { ascending: true })
    .order("episode_number", { ascending: true });

  if (error) throw error;
  return data || [];
}

/* =========================================================
   WATCH PROGRESS
========================================================= */

export async function getProgress({ userId, movieId, episodeId = null }) {
  let query = supabase
    .from("watch_progress")
    .select("progress_seconds, updated_at")
    .eq("user_id", userId)
    .eq("movie_id", movieId);

  if (episodeId)
    query = query.eq("episode_id", episodeId);
  else
    query = query.is("episode_id", null);

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

export async function upsertProgress({
  userId,
  movieId,
  episodeId = null,
  progressSeconds = 0
}) {
  const payload = {
    user_id: userId,
    movie_id: movieId,
    episode_id: episodeId,
    progress_seconds: Math.max(0, Math.floor(progressSeconds)),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("watch_progress")
    .upsert(payload, {
      onConflict: "user_id,movie_id,episode_id"
    });

  if (error) throw error;
}

/* =========================================================
   CONTINUE WATCHING
========================================================= */

export async function fetchContinueWatching(userId, limit = 24) {
  const { data, error } = await supabase
    .from("watch_progress")
    .select(`
      progress_seconds,
      updated_at,
      movie_id,
      episode_id,
      movies (
        id,
        title,
        thumbnail_url,
        banner_url,
        category,
        vtt_url
      ),
      episodes (
        id,
        title,
        season,
        episode_number,
        vtt_url
      )
    `)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/* =========================================================
   PROFILE
========================================================= */

export async function fetchProfile(userId) {
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
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

/* =========================================================
   UPLOAD
========================================================= */

export async function createMovie(payload) {
  const { data, error } = await supabase
    .from("movies")
    .insert(payload)
    .select("id")
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

export async function createEpisode(payload) {
  const { data, error } = await supabase
    .from("episodes")
    .insert(payload)
    .select("id")
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}