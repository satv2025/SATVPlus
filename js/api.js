// /js/api.js
import { supabase } from "./supabaseClient.js";
import { CONFIG } from "./config.js";

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
  trailer_url,
  category,
  created_at,
  release_year,
  duration_minutes,
  live_mode,
  live_starts_at,
  publish_state,
  publish_state_text,
  collection_id
`;

const GEO_COUNTRY_CACHE_KEY = "satv_geo_country_v2";
const COUNTRY_META_CACHE_PREFIX = "satv_country_meta_v1";
const GEO_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const COUNTRY_META_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function clampLimit(limit, min = 1, max = 100, fallback = 24) {
  const n = Number(limit);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeEmbeddedOne(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function normalizeCountryCode(value) {
  return String(value || "").trim().toUpperCase().slice(0, 2);
}

function normalizeLangCode(value) {
  return String(value || "").trim();
}

function getLanguageBase(value) {
  return normalizeLangCode(value).split("-")[0].toLowerCase();
}

function normalizeSearchQuery(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function escapeIlike(value) {
  return String(value || "").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function getCachedJson(storage, key, ttlMs) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ts = Number(parsed?.ts || 0);
    if (!ts) return null;
    if ((Date.now() - ts) > ttlMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCachedJson(storage, key, value) {
  try {
    storage.setItem(
      key,
      JSON.stringify({
        ...value,
        ts: Date.now()
      })
    );
  } catch { }
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 4000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: ctrl.signal
    });

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} at ${url}`);
      err.status = res.status;
      throw err;
    }

    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function getNavigatorLanguages() {
  if (typeof navigator === "undefined") return [];
  const langs = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];

  return langs.map(normalizeLangCode).filter(Boolean);
}

function getBrowserRegionFallback() {
  const langs = getNavigatorLanguages();

  for (const lang of langs) {
    const parts = lang.split("-");
    if (parts.length >= 2) {
      const region = normalizeCountryCode(parts[1]);
      if (region) return region;
    }

    try {
      if (typeof Intl?.Locale === "function") {
        const locale = new Intl.Locale(lang);
        const region = normalizeCountryCode(locale?.region);
        if (region) return region;
      }
    } catch { }
  }

  return null;
}

/* =========================================================
   DURATION HELPERS
========================================================= */

export function formatDurationMinutes(minutes) {
  const total = Number(minutes);

  if (!Number.isFinite(total) || total <= 0) return "";

  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (hours <= 0) return `${mins} min`;
  if (mins <= 0) return `${hours} h`;

  return `${hours} h ${mins} min`;
}

function withFormattedMovieDuration(row) {
  if (!row) return row;

  return {
    ...row,
    duration_text: formatDurationMinutes(row.duration_minutes)
  };
}

function withFormattedEpisodeDuration(row) {
  if (!row) return row;

  return {
    ...row,
    duration_text: formatDurationMinutes(row.epduration)
  };
}

function normalizeMovieMeta(row) {
  if (!row) return row;

  const mm = Array.isArray(row.movie_meta)
    ? (row.movie_meta[0] || null)
    : (row.movie_meta || null);

  return withFormattedMovieDuration({
    ...row,
    movie_meta: mm
  });
}

function normalizeContinueWatchingRow(row) {
  if (!row) return row;

  const movie = withFormattedMovieDuration(normalizeEmbeddedOne(row.movies));
  const episode = withFormattedEpisodeDuration(normalizeEmbeddedOne(row.episodes));

  return {
    ...row,
    movies: movie,
    episodes: episode,
    progress_duration_text: formatDurationMinutes(
      Number(row.duration_seconds) > 0 ? Math.round(Number(row.duration_seconds) / 60) : 0
    )
  };
}

/* =========================================================
   LANGUAGE / COUNTRY
========================================================= */

export function getPreferredDeviceLanguage() {
  const langs = getNavigatorLanguages();

  for (const lang of langs) {
    if (getLanguageBase(lang) !== "es") return lang;
  }

  return langs[0] || "en-US";
}

export async function detectConnectionCountryCode() {
  const cached = getCachedJson(sessionStorage, GEO_COUNTRY_CACHE_KEY, GEO_CACHE_TTL_MS);
  if (cached?.countryCode) return normalizeCountryCode(cached.countryCode);

  const endpoint = String(CONFIG?.GEO_COUNTRY_ENDPOINT || "https://ipwho.is/").trim();

  try {
    const json = await fetchJsonWithTimeout(endpoint, {
      method: "GET",
      headers: { "Accept": "application/json" }
    }, 4000);

    const countryCode = normalizeCountryCode(
      json?.country_code ||
      json?.countryCode ||
      json?.country_code_iso2 ||
      json?.location?.country_code
    );

    if (countryCode) {
      setCachedJson(sessionStorage, GEO_COUNTRY_CACHE_KEY, { countryCode });
      return countryCode;
    }
  } catch { }

  return getBrowserRegionFallback();
}

export async function fetchCountryLanguageMeta(countryCode) {
  const cc = normalizeCountryCode(countryCode);
  if (!cc) return null;

  const cacheKey = `${COUNTRY_META_CACHE_PREFIX}:${cc}`;
  const cached = getCachedJson(sessionStorage, cacheKey, COUNTRY_META_CACHE_TTL_MS);

  if (cached?.countryCode) {
    return {
      countryCode: cached.countryCode,
      languages: cached.languages || {},
      nameEs: cached.nameEs || cc,
      nameEn: cached.nameEn || cc
    };
  }

  const url = `https://restcountries.com/v3.1/alpha/${encodeURIComponent(cc)}?fields=cca2,languages,name`;
  const json = await fetchJsonWithTimeout(url, {
    method: "GET",
    headers: { "Accept": "application/json" }
  }, 5000);

  const row = Array.isArray(json) ? (json[0] || null) : json;
  if (!row) return null;

  const meta = {
    countryCode: normalizeCountryCode(row?.cca2 || cc),
    languages: row?.languages || {},
    nameEs: row?.name?.nativeName?.spa?.common || row?.name?.common || cc,
    nameEn: row?.name?.common || cc
  };

  setCachedJson(sessionStorage, cacheKey, meta);
  return meta;
}

export async function countryHasSpanishOfficialLanguage(countryCode) {
  const meta = await fetchCountryLanguageMeta(countryCode);
  if (!meta) return false;

  const keys = Object.keys(meta.languages || {}).map((v) => String(v).toLowerCase());
  const values = Object.values(meta.languages || {}).map((v) => String(v).toLowerCase());

  return (
    keys.includes("spa") ||
    values.includes("spanish") ||
    values.includes("español")
  );
}

export async function fetchLanguagePreference(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("lang")
    .select("id, county, lang_code")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function upsertLanguagePreference({ userId, countryCode, langCode }) {
  if (!userId) throw new Error("Falta userId");
  if (!countryCode) throw new Error("Falta countryCode");
  if (!langCode) throw new Error("Falta langCode");

  const payload = {
    id: userId,
    county: normalizeCountryCode(countryCode),
    lang_code: normalizeLangCode(langCode)
  };

  const { data, error } = await supabase
    .from("lang")
    .upsert(payload, {
      onConflict: "id",
      ignoreDuplicates: false
    })
    .select("id, county, lang_code")
    .maybeSingle();

  if (error) throw error;
  return data || payload;
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

export async function updateMyProfile(userId, patch = {}) {
  if (!userId) throw new Error("Falta userId");

  const allowed = {
    email: patch.email ?? undefined,
    full_name: patch.full_name ?? undefined,
    username: patch.username ?? undefined,
    phone: patch.phone ?? undefined,
    avatar_url: patch.avatar_url ?? undefined,
  };

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

export async function fetchContinueWatching(userId, limit = 24) {
  if (!userId) return [];

  const safeLimit = clampLimit(limit, 1, 100, 24);

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
      epduration,
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
      epduration,
      created_at
    )
  `;

  let { data, error } = await supabase
    .from("watch_progress")
    .select(selectWPWithDuration)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(safeLimit);

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

  return (data || []).map(normalizeContinueWatchingRow);
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
  return (data || []).map(withFormattedMovieDuration);
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
  return (data || []).map(withFormattedMovieDuration);
}

/**
 * Trae TODO el catálogo en tandas.
 * excludeMovieId: excluye el título actualmente abierto.
 */
export async function fetchMovies({ excludeMovieId = null, pageSize = 500 } = {}) {
  const safePageSize = clampLimit(pageSize, 1, 1000, 500);
  const all = [];
  let from = 0;

  while (true) {
    let query = supabase
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
      .order("created_at", { ascending: false })
      .range(from, from + safePageSize - 1);

    if (excludeMovieId) {
      query = query.neq("id", excludeMovieId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    all.push(...rows);

    if (rows.length < safePageSize) break;
    from += safePageSize;
  }

  return all.map(normalizeMovieMeta);
}

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
      live_mode,
      live_starts_at,
      publish_state,
      publish_state_text,
      collection_id,
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

export async function fetchCollection(collectionId, limit = 200) {
  if (!collectionId) return [];

  const safeLimit = clampLimit(limit, 1, 500, 200);

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
      trailer_url,
      category,
      created_at,
      release_year,
      duration_minutes,
      live_mode,
      live_starts_at,
      publish_state,
      publish_state_text,
      collection_id,
      movie_meta!movie_id (
        seasons_count,
        episodes_count
      )
    `)
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: true })
    .limit(safeLimit);

  if (error) throw error;
  return (data || []).map(normalizeMovieMeta);
}

export async function searchMovies(query, limit = 24) {
  const q = normalizeSearchQuery(query);
  const safeLimit = clampLimit(limit, 1, 100, 24);

  if (!q) return [];

  const pattern = `%${escapeIlike(q)}%`;

  const { data, error } = await supabase
    .from("movies")
    .select(`
      ${MOVIE_CARD_FIELDS},
      movie_meta!movie_id (
        seasons_count,
        episodes_count
      )
    `)
    .or(`title.ilike.${pattern},description.ilike.${pattern}`)
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
   COLUMNA REAL: "thumbnails-episode"
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
      epduration,
      created_at,
      sinopsis,
      thumbnail_episode:"thumbnails-episode"
    `)
    .eq("series_id", seriesId)
    .order("season", { ascending: true })
    .order("episode_number", { ascending: true });

  if (error) throw error;

  return (data || []).map((row) =>
    withFormattedEpisodeDuration({
      ...row
    })
  );
}