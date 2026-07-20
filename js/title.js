/* ===========================
          title.js
=========================== */
function qs(key) {
  return new URLSearchParams(window.location.search).get(key);
}
function el(id) {
  return document.getElementById(id);
}

/* ===========================
   Lazy load Supabase SDK (global)
=========================== */

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const exists = [...document.scripts].some((s) => s.src === src);
    if (exists) return resolve();

    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar: ' + src));
    document.head.appendChild(s);
  });
}

async function ensureSupabaseGlobal() {
  if (window.supabase?.createClient) return;
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
  if (!window.supabase?.createClient)
    throw new Error('Supabase SDK ok pero createClient no existe.');
}

/* ===========================
   Utils
=========================== */

function plural(n, one, many) {
  return n === 1 ? one : many;
}

function formatDuration(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return '';
  if (m < 60) return `${m} min`;

  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} h` : `${h} h ${rem} min`;
}

function parseDurationTimeStringToSeconds(value) {
  const raw = String(value ?? '').trim();
  if (!raw || !raw.includes(':')) return null;

  const parts = raw.split(':').map((part) => part.trim());
  if (parts.length !== 2 && parts.length !== 3) return null;

  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;

  if (parts.length === 3) {
    const [h, m, s] = nums;
    return h * 3600 + m * 60 + s;
  }

  const [m, s] = nums;
  return m * 60 + s;
}

function formatDurationBadgeMinutes(minutes) {
  const total = Math.floor(Number(minutes));
  if (!Number.isFinite(total) || total <= 0) return '';

  if (total < 60) return `${total} min`;

  const hours = Math.floor(total / 60);
  const mins = total % 60;

  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

function formatDurationBadgeFromValue(value, unit = 'auto') {
  if (value === null || value === undefined || value === '') return '';

  const raw = String(value).trim();
  if (!raw) return '';

  let minutes = 0;

  if (unit === 'seconds') {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    minutes = Math.floor(seconds / 60);
    if (minutes < 1) minutes = 1;
  } else if (unit === 'minutes') {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '';
    minutes = Math.floor(n);
  } else {
    const seconds = parseDurationTimeStringToSeconds(raw);
    if (seconds !== null) {
      if (seconds <= 0) return '';
      minutes = Math.floor(seconds / 60);
      if (minutes < 1) minutes = 1;
    } else {
      const n = Number(raw.replace(/,/g, '.'));
      if (!Number.isFinite(n) || n <= 0) return '';
      minutes = Math.floor(n);
    }
  }

  return formatDurationBadgeMinutes(minutes);
}

function hasDurationValue(row, columnName) {
  if (!row || typeof row !== 'object' || !columnName) return false;

  const value = row[columnName];
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function getEpisodeDurationBadgeText(ep) {
  // episodes.epduration puede venir como "01:12:00", "32:12" o minutos.
  return formatDurationBadgeFromValue(ep?.epduration, 'auto');
}

function getMovieDurationBadgeText(movie) {
  // movies.duration_minutes viene en minutos.
  return formatDurationBadgeFromValue(movie?.duration_minutes, 'minutes');
}

async function hydrateDurationColumnFromTable({
  rows,
  tableName,
  columnName = 'duration',
}) {
  const list = Array.isArray(rows) ? rows : [];
  const missingIds = [
    ...new Set(
      list
        .filter((row) => row?.id && !hasDurationValue(row, columnName))
        .map((row) => String(row.id))
    ),
  ];

  if (!missingIds.length) return list;

  try {
    const supabase = await getAppSupabaseClient();
    if (!supabase) return list;

    const { data, error } = await supabase
      .from(tableName)
      .select(`id, ${columnName}`)
      .in('id', missingIds);

    if (error) {
      console.warn(
        `[title] no se pudo hidratar ${tableName}.${columnName}:`,
        error
      );
      return list;
    }

    const durationById = new Map(
      (data || [])
        .filter((row) => row?.id)
        .map((row) => [String(row.id), row?.[columnName]])
    );

    return list.map((row) => {
      if (!row?.id || hasDurationValue(row, columnName)) return row;
      if (!durationById.has(String(row.id))) return row;
      return { ...row, [columnName]: durationById.get(String(row.id)) };
    });
  } catch (e) {
    console.warn(`[title] hydrate ${tableName}.${columnName} error:`, e);
    return list;
  }
}

function hydrateEpisodeDurations(episodes) {
  return hydrateDurationColumnFromTable({
    rows: episodes,
    tableName: 'episodes',
    columnName: 'epduration',
  });
}

function hydrateMovieDurations(movies) {
  return hydrateDurationColumnFromTable({
    rows: movies,
    tableName: 'movies',
    columnName: 'duration_minutes',
  });
}

function formatElapsed(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;

  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

function row(label, value, esc) {
  if (!value) return '';
  return `
    <div class="title-extra-row">
      <div class="title-extra-label">${esc(label)}</div>
      <div class="title-extra-value">${renderSmartText(value, esc)}</div>
    </div>`;
}

function looksLikeHtml(value) {
  const raw = String(value ?? '').trim();
  if (!raw || !raw.includes('<') || !raw.includes('>')) return false;

  const template = document.createElement('template');
  template.innerHTML = raw;

  return [...template.content.childNodes].some(
    (node) => node.nodeType === Node.ELEMENT_NODE
  );
}

function isSafeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl, window.location.origin);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function extractSafeOnclickUrl(code) {
  const raw = String(code || '').trim();

  let match =
    raw.match(
      /^window\.location\.href\s*=\s*(['"])(https?:\/\/[^'"]+)\1\s*;?$/i
    ) || raw.match(/^location\.href\s*=\s*(['"])(https?:\/\/[^'"]+)\1\s*;?$/i);

  if (match) return match[2];

  match = raw.match(
    /^window\.open\(\s*(['"])(https?:\/\/[^'"]+)\1\s*(?:,\s*(['"])_blank\3)?(?:,\s*(['"])[^'"]*\4)?\s*\)\s*;?$/i
  );

  if (match) return match[2];

  return '';
}

function sanitizeRichHtml(html) {
  const allowedTags = new Set([
    'A',
    'SPAN',
    'B',
    'STRONG',
    'I',
    'EM',
    'BR',
    'P',
    'UL',
    'OL',
    'LI',
    'SMALL',
    'DIV',
  ]);

  const allowedAttrs = {
    A: new Set(['href', 'target', 'rel', 'class', 'title']),
    SPAN: new Set(['class', 'title', 'onclick']),
    DIV: new Set(['class', 'title']),
    P: new Set(['class', 'title']),
    SMALL: new Set(['class', 'title']),
    B: new Set(['class', 'title']),
    STRONG: new Set(['class', 'title']),
    I: new Set(['class', 'title']),
    EM: new Set(['class', 'title']),
    UL: new Set(['class', 'title']),
    OL: new Set(['class', 'title']),
    LI: new Set(['class', 'title']),
  };

  const template = document.createElement('template');
  template.innerHTML = String(html ?? '');

  function walk(parent) {
    [...parent.childNodes].forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) return;

      if (node.nodeType !== Node.ELEMENT_NODE) {
        node.remove();
        return;
      }

      const tag = node.tagName.toUpperCase();

      if (!allowedTags.has(tag)) {
        node.replaceWith(document.createTextNode(node.textContent || ''));
        return;
      }

      [...node.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value;

        const tagAttrs = allowedAttrs[tag] || new Set();

        if (!tagAttrs.has(name)) {
          node.removeAttribute(attr.name);
          return;
        }

        if (name === 'href' && !isSafeUrl(value)) {
          node.removeAttribute(attr.name);
          return;
        }

        if (name === 'onclick') {
          const safeUrl = extractSafeOnclickUrl(value);

          if (!safeUrl || !isSafeUrl(safeUrl)) {
            node.removeAttribute(attr.name);
          }
        }
      });

      if (tag === 'A' && node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
      }

      walk(node);
    });
  }

  walk(template.content);

  return template.innerHTML;
}

function renderSmartText(value, esc) {
  const raw = String(value ?? '');
  if (!raw.trim()) return '';

  return looksLikeHtml(raw) ? sanitizeRichHtml(raw) : esc(raw);
}

function setSmartText(targetEl, value) {
  if (!targetEl) return;

  const raw = String(value ?? '');

  if (looksLikeHtml(raw)) {
    targetEl.innerHTML = sanitizeRichHtml(raw);
  } else {
    targetEl.textContent = raw;
  }
}

function isPositiveIntegerLike(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && Number.isInteger(n);
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim()
  );
}

function renderTitleNotFound() {
  document.title = 'Título no encontrado · SATV+';

  const hero = el('hero');
  const episodesSection = el('episodes-section');
  const moreSection = el('more-section');
  const moreGrid = el('more-grid');
  const extraEl = el('title-extra');
  const collectionSection = document.getElementById('collection-section');

  if (hero) {
    hero.style.backgroundImage = 'none';
    hero.innerHTML = `
      <div class="title-not-found" style="
        min-height: 52vh;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:32px 20px;
      ">
        <div style="
          width:min(720px, 100%);
          text-align:center;
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:16px;
        ">
          <h1 style="
            margin:0;
            font-size:clamp(28px, 4vw, 46px);
            line-height:1.05;
            font-weight:800;
          ">Oops. Título no encontrado</h1>

          <p style="
            margin:0;
            font-size:16px;
            line-height:1.55;
            opacity:.92;
            max-width:560px;
          ">
            Puedes explorar nuestro catálogo haciendo click aquí.
          </p>

          <button
            type="button"
            id="title-not-found-btn"
            style="
              margin-top:8px;
              border:0;
              border-radius:999px;
              padding:14px 22px;
              font-size:15px;
              font-weight:700;
              cursor:pointer;
            "
          >
            Ir al catálogo
          </button>
        </div>
      </div>
    `;

    const btn = document.getElementById('title-not-found-btn');
    if (btn) {
      btn.onclick = () => {
        window.location.href = '/index.html';
      };
    }
  }

  if (episodesSection) episodesSection.classList.add('hidden');
  if (collectionSection) collectionSection.classList.add('hidden');
  if (moreSection) moreSection.classList.add('hidden');
  if (moreGrid) moreGrid.innerHTML = '';

  if (extraEl) {
    extraEl.innerHTML = '';
    extraEl.classList.add('hidden');
  }
}

/* ===========================
   Episode title wrapped font helper
=========================== */

let __episodeTitleWrappedRaf = 0;

function applyCondensedFontToWrappedEpisodeTitles(root = document) {
  // Las tarjetas de episodios y colecciones ya no tienen body ni títulos visibles.
  // Se mantiene la API interna, evitando mediciones de layout innecesarias.
  void root;
}

function scheduleApplyCondensedFontToWrappedEpisodeTitles(root = document) {
  if (__episodeTitleWrappedRaf) {
    cancelAnimationFrame(__episodeTitleWrappedRaf);
  }

  __episodeTitleWrappedRaf = requestAnimationFrame(() => {
    __episodeTitleWrappedRaf = requestAnimationFrame(() => {
      __episodeTitleWrappedRaf = 0;
      applyCondensedFontToWrappedEpisodeTitles(root);
    });
  });
}

/* ===========================
   AKIRA VIDEO OVERRIDE
=========================== */

const AKIRA_SERIES_ID = 'd54c717b-c713-41bb-91cb-a9a2a302d44a';
const AKIRA_VIDEO_STYLE_ID = 'akira-video-contain-override';

function shouldApplyAkiraVideoContainOverride(currentId) {
  return String(currentId || '').trim() === AKIRA_SERIES_ID;
}

function applyAkiraVideoContainOverrideIfNeeded(currentId) {
  const styleId = AKIRA_VIDEO_STYLE_ID;
  let styleEl = document.getElementById(styleId);

  if (!shouldApplyAkiraVideoContainOverride(currentId)) {
    if (styleEl) styleEl.remove();
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = `
      .akira-video {
        object-fit: contain !important;
      }
    `;
}

function resolveAkiraOverrideTargetId() {
  const fromSeries = qs('series');
  if (fromSeries) return fromSeries;

  const fromTitle = qs('title') || qs('movie');
  if (fromTitle) return fromTitle;

  return '';
}

/* ===========================
   PUBLISH STATE (movies.publish_state)
=========================== */

function getMoviePublishState(movie) {
  const raw = String(movie?.publish_state || 'public').toLowerCase();
  if (['public', 'upcoming', 'live', 'other'].includes(raw)) return raw;
  return 'public';
}

function getMoviePublishStateLabel(movie) {
  const state = getMoviePublishState(movie);
  const custom = String(movie?.publish_state_text || '').trim();

  if (state === 'public') return 'Público';
  if (state === 'upcoming') return custom || 'Próximamente';
  if (state === 'live') return 'En Vivo';
  if (state === 'other') return custom || 'Otro';

  return 'Público';
}

const FINISHED_LIVE_PUBLISH_STATE = 'other';
const FINISHED_LIVE_PUBLISH_TEXT = 'Recién agregado';

function isLiveModeActive(movie) {
  return Boolean(movie?.live_mode);
}

function isLiveStartInFuture(movie) {
  const d = getLiveStartDate(movie);
  return !!d && d.getTime() > Date.now();
}

function isLiveStartFinished(movie) {
  const d = getLiveStartDate(movie);
  return isLiveModeActive(movie) && !!d && d.getTime() <= Date.now();
}

function applyFinishedLiveStateLocally(movie) {
  if (!movie) return movie;

  return {
    ...movie,
    live_mode: false,
    live_starts_at: null,
    publish_state: FINISHED_LIVE_PUBLISH_STATE,
    publish_state_text: FINISHED_LIVE_PUBLISH_TEXT,
  };
}

async function persistFinishedLiveState(movie) {
  if (!movie?.id) return;

  try {
    const supabase = await getAppSupabaseClient();
    if (!supabase) return;

    const { error } = await supabase
      .from('movies')
      .update({
        live_mode: false,
        live_starts_at: null,
        publish_state: FINISHED_LIVE_PUBLISH_STATE,
        publish_state_text: FINISHED_LIVE_PUBLISH_TEXT,
      })
      .eq('id', movie.id);

    if (error) console.warn('[title] no se pudo finalizar live_mode:', error);
  } catch (e) {
    console.warn('[title] finalizar live_mode error:', e);
  }
}

async function normalizeFinishedLiveState(movie) {
  if (!isLiveStartFinished(movie)) return movie;

  void persistFinishedLiveState(movie);
  return applyFinishedLiveStateLocally(movie);
}

/* ===========================
   SERIES COUNTS (robusto desde episodes)
=========================== */

function deriveSeriesCountsFromEpisodes(episodes) {
  const list = Array.isArray(episodes) ? episodes : [];

  const seasonSet = new Set();
  let episodesCount = 0;

  for (const ep of list) {
    episodesCount += 1;

    const seasonRaw = ep?.season;
    if (seasonRaw !== null && seasonRaw !== undefined && seasonRaw !== '') {
      seasonSet.add(String(seasonRaw));
    }
  }

  return {
    seasonsCount: seasonSet.size,
    episodesCount,
  };
}

function resolveSeriesCounts(movie, episodes) {
  const fromEpisodes = deriveSeriesCountsFromEpisodes(episodes);
  const mm = movie?.movie_meta || null;

  const metaSeasons = Number(mm?.seasons_count);
  const metaEpisodes = Number(mm?.episodes_count);

  const seasonsCount =
    fromEpisodes.seasonsCount >= 1
      ? fromEpisodes.seasonsCount
      : isPositiveIntegerLike(metaSeasons)
        ? metaSeasons
        : 0;

  const episodesCount =
    fromEpisodes.episodesCount >= 1
      ? fromEpisodes.episodesCount
      : isPositiveIntegerLike(metaEpisodes)
        ? metaEpisodes
        : 0;

  return {
    seasonsCount,
    episodesCount,
  };
}

function formatSeriesMetaFromCounts({ seasonsCount, episodesCount }) {
  if (Number.isFinite(seasonsCount) && seasonsCount >= 2) {
    return `${seasonsCount} ${plural(seasonsCount, 'temporada', 'temporadas')}`;
  }

  if (Number.isFinite(seasonsCount) && seasonsCount === 1) {
    if (Number.isFinite(episodesCount) && episodesCount === 1)
      return '1 episodio';
    if (Number.isFinite(episodesCount) && episodesCount >= 2)
      return `${episodesCount} episodios`;
    return '';
  }

  if (Number.isFinite(episodesCount) && episodesCount === 1)
    return '1 episodio';
  if (Number.isFinite(episodesCount) && episodesCount >= 2)
    return `${episodesCount} episodios`;

  return '';
}

/* ===========================
   TE PODRÍA GUSTAR: helpers
=========================== */

function shortenTitle(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';

  const m = s.match(/\s(?:-|—|:|\|)\s/);
  if (!m) return s;

  const idx = m.index ?? -1;
  if (idx <= 0) return s;

  const left = s.slice(0, idx).trim();
  const right = s.slice(idx + m[0].length).trim();

  const wordsLeft = left.split(/\s+/).filter(Boolean);
  const wordsRight = right.split(/\s+/).filter(Boolean);

  const leftLooksBrandish =
    wordsLeft.length <= 1 ||
    /[%]/.test(left) ||
    /^[A-Z0-9%]+$/.test(left.replace(/\s+/g, ''));

  const rightLooksSubtitle = wordsRight.length >= 3;

  if (leftLooksBrandish || !rightLooksSubtitle) {
    return s;
  }

  return left;
}

function formatSeriesMeta(movie) {
  const counts = resolveSeriesCounts(movie, movie?.__episodes_for_meta || []);
  return formatSeriesMetaFromCounts(counts);
}

function getMoreMetaLine(movie) {
  const year = movie.release_year ? String(movie.release_year) : '';
  let right = '';

  if (movie.category === 'movie')
    right = formatDuration(movie.duration_minutes);
  else if (movie.category === 'series') right = formatSeriesMeta(movie);
  else right = formatDuration(movie.duration_minutes);

  return [year, right].filter(Boolean).join(' · ');
}

function normalizeGenreList(value) {
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value.map((item) => String(item || '').trim()).filter(Boolean)
      ),
    ];
  }

  return [
    ...new Set(
      String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}

function getMovieGenres(movie) {
  // Los géneros visibles en #t-meta salen exclusivamente de la metadata
  // relacionada (tabla movie_meta, columna fullgenres).
  return normalizeGenreList(movie?.movie_meta?.fullgenres);
}

function formatGenresInline(movie, { limit = 3 } = {}) {
  const genres = getMovieGenres(movie);
  if (!genres.length) return '';

  const safeLimit = Math.max(1, Number(limit) || 3);
  const visible = genres.slice(0, safeLimit);
  const extra = genres.length - visible.length;

  return extra > 0 ? `${visible.join(', ')} +${extra}` : visible.join(', ');
}

function formatGenresFull(movie) {
  return getMovieGenres(movie).join(', ');
}

/* ===========================
   Episodes helpers
=========================== */

function pickEpisodeThumb(ep) {
  return ep?.thumbnail_episode || ep?.thumb || '';
}

function groupBySeason(episodes) {
  const map = new Map();

  for (const ep of episodes || []) {
    const seasonValue = ep?.season;
    const s =
      seasonValue !== null && seasonValue !== undefined ? seasonValue : 1;

    if (!map.has(s)) map.set(s, []);
    map.get(s).push(ep);
  }

  for (const [, list] of map) {
    list.sort((a, b) => (a.episode_number ?? 0) - (b.episode_number ?? 0));
  }

  return [...map.entries()].sort((a, b) => {
    const na = Number(a[0]);
    const nb = Number(b[0]);

    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a[0]).localeCompare(String(b[0]), 'es');
  });
}

function clampSeason(seasons, desired) {
  if (!seasons?.length) return seasons?.[0] ?? 1;
  if (seasons.includes(desired)) return desired;
  return seasons[0];
}

function scrollToEpisodes() {
  const target = el('episodes-section');
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ===========================
   Episode progress helpers
=========================== */

function clampProgressPercent(progressSeconds, durationSeconds) {
  const progress = Number(progressSeconds || 0);
  const duration = Number(durationSeconds || 0);

  if (
    !Number.isFinite(progress) ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return 0;
  }

  const pct = (progress / duration) * 100;
  return Math.max(0, Math.min(100, pct));
}

async function fetchEpisodeProgressMapForTitle({ movieId }) {
  if (!movieId) return new Map();

  try {
    const supabase = await getAppSupabaseClient();
    if (!supabase) {
      console.warn(
        '[title] supabaseClient.js no devolvió supabase (episode progress map)'
      );
      return new Map();
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      console.warn('[title] getUser error (episode progress map):', userErr);
      return new Map();
    }

    const userId = userData?.user?.id;
    if (!userId) {
      console.log('[title] sin sesión activa (episode progress map)');
      return new Map();
    }

    const { data, error } = await supabase
      .from('watch_progress')
      .select(
        `
                episode_id,
                progress_seconds,
                duration_seconds,
                updated_at
            `
      )
      .eq('user_id', userId)
      .eq('movie_id', movieId)
      .not('episode_id', 'is', null)
      .gt('progress_seconds', 0)
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('[title] watch_progress map query error:', error);
      return new Map();
    }

    const map = new Map();

    for (const row of data || []) {
      const episodeId = row?.episode_id;
      if (!episodeId) continue;
      if (map.has(episodeId)) continue;

      const percent = clampProgressPercent(
        row.progress_seconds,
        row.duration_seconds
      );

      map.set(episodeId, {
        episodeId,
        progressSeconds: Number(row.progress_seconds || 0),
        durationSeconds: Number(row.duration_seconds || 0),
        percent,
        updatedAt: row.updated_at || null,
      });
    }

    console.log('[title] progress map episodios:', map);
    return map;
  } catch (e) {
    console.warn('[title] fetchEpisodeProgressMapForTitle error:', e);
    return new Map();
  }
}

/** Card HTML (episodes) */

function renderEpisodeCardHtml({ ep, fallbackThumb, esc, progressMap }) {
  const thumb = pickEpisodeThumb(ep) || fallbackThumb;
  const durationText = getEpisodeDurationBadgeText(ep);

  const s = ep.season ?? '';
  const n = ep.episode_number ?? '';

  const tag =
    s !== '' && s != null && n !== '' && n != null
      ? `T${s}E${n}`
      : n !== '' && n != null
        ? `E${n}`
        : s !== '' && s != null
          ? `T${s}`
          : '';

  const epTitleText = tag ? `${tag} ${ep.title || ''}`.trim() : ep.title || '';
  const epTitle = esc(epTitleText);

  const progress = progressMap?.get?.(ep.id) || null;
  const progressPercent = Math.max(
    0,
    Math.min(100, Number(progress?.percent || 0))
  );
  const hasProgress = progressPercent > 0;

  return `
    <article
      class="episode-card image-only-card"
      tabindex="0"
      role="link"
      aria-label="${epTitle}"
      title="${epTitle}"
      data-episode="${ep.id}"
    >
      <div class="episode-thumb-wrap">
        <img class="episode-thumb" src="${esc(thumb)}" alt="">
        ${durationText ? `<span class="duration">${esc(durationText)}</span>` : ''}
      </div>
      ${
        hasProgress
          ? `
        <div class="episode-progress" aria-hidden="true">
          <div class="episode-progress-bar" style="width:${progressPercent}%;"></div>
        </div>
      `
          : ''
      }
    </article>
  `;
}

/** Bind navigation (episodes) */
function bindEpisodeCardNavigation(rootEl, movieId) {
  rootEl.querySelectorAll('.episode-card').forEach((card) => {
    const go = () => {
      const epId = card.dataset.episode;
      window.location.href = `/watch?series=${encodeURIComponent(movieId)}&episode=${encodeURIComponent(epId)}`;
    };

    card.addEventListener('click', go);
    card.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        go();
      }
    });
  });
}

/* ===========================
   WATCH BUTTON: Reproducir / Reanudar / Countdown Live / Status
=========================== */

let __liveCountdownTimer = null;
const LIVE_DISPLAY_TIMEZONE = 'America/Argentina/Buenos_Aires';

function clearLiveCountdownTimer() {
  if (__liveCountdownTimer) {
    clearInterval(__liveCountdownTimer);
    __liveCountdownTimer = null;
  }
}

function getLiveStartDate(movie) {
  if (!movie) return null;

  const raw =
    movie.live_starts_at ??
    movie.live_start_at ??
    movie.live_datetime ??
    movie.live_at ??
    null;

  if (!raw) return null;

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatLiveDateEs(d) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: LIVE_DISPLAY_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function formatLiveTimeEs(d) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: LIVE_DISPLAY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

function formatCountdown(diffMs) {
  const total = Math.max(0, Math.floor(diffMs / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');

  return days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

function ensureWatchBtnCountdownBlocker(watchBtn) {
  if (!watchBtn || watchBtn.dataset.liveCountdownBlockerBound === '1') return;

  watchBtn.dataset.liveCountdownBlockerBound = '1';
  watchBtn.addEventListener(
    'click',
    (ev) => {
      const mode = watchBtn.dataset.mode;
      if (mode === 'countdown' || mode === 'status-disabled') {
        ev.preventDefault();
        ev.stopPropagation();
      }
    },
    { passive: false }
  );
}

function clearWatchBtnCountdownUI(watchBtn) {
  if (!watchBtn) return;
  watchBtn.removeAttribute('aria-disabled');
  try {
    watchBtn.disabled = false;
  } catch {}
}

function setWatchBtnVerAhora(watchBtn, movie) {
  if (!watchBtn || !movie?.id) return;

  clearLiveCountdownTimer();
  clearWatchBtnCountdownUI(watchBtn);

  const isSeries = movie.category === 'series';
  watchBtn.href = isSeries
    ? `/watch?series=${encodeURIComponent(movie.id)}`
    : `/watch?movie=${encodeURIComponent(movie.id)}`;

  watchBtn.setAttribute('aria-label', 'Reproducir');
  watchBtn.innerHTML = `Reproducir <span aria-hidden="true">▶</span>`;
  watchBtn.dataset.mode = 'now';
}

function setWatchBtnReanudar(watchBtn, movie, p) {
  if (!watchBtn || !movie?.id || !p) return;

  clearLiveCountdownTimer();
  clearWatchBtnCountdownUI(watchBtn);

  const isSeries = movie.category === 'series';
  const ep = Array.isArray(p.episodes)
    ? p.episodes[0] || null
    : p.episodes || null;

  const season = p.season ?? ep?.season ?? '';
  const epNum = p.episode_number ?? ep?.episode_number ?? '';
  const epTitle = p.episode_title ?? ep?.title ?? '';
  const elapsedSeconds = Number(
    p.progress_seconds ?? p.elapsed_seconds ?? p.elapsed ?? 0
  );
  const elapsed = formatElapsed(elapsedSeconds);

  const hasSeason = season !== '' && season != null;
  const hasEpisode = epNum !== '' && epNum != null;

  const tag =
    hasSeason && hasEpisode ? `T${Number(season)}E${Number(epNum)}` : '';

  const meta = [tag, epTitle].filter(Boolean).join(' ').trim();

  if (isSeries) {
    watchBtn.href = p.episode_id
      ? `/watch?series=${encodeURIComponent(movie.id)}&episode=${encodeURIComponent(p.episode_id)}`
      : `/watch?series=${encodeURIComponent(movie.id)}`;
  } else {
    watchBtn.href = `/watch?movie=${encodeURIComponent(movie.id)}`;
  }

  watchBtn.setAttribute('aria-label', 'Reanudar');
  watchBtn.innerHTML =
    `Reanudar <span aria-hidden="true">▶</span>` +
    (meta || elapsed
      ? ` <span class="watch-meta">${meta}${elapsed ? ` · ${elapsed}` : ''}</span>`
      : '');

  watchBtn.dataset.mode = 'resume';
}

function setWatchBtnDisabledStatus(watchBtn, label) {
  if (!watchBtn) return;

  clearLiveCountdownTimer();
  ensureWatchBtnCountdownBlocker(watchBtn);

  watchBtn.href = '#';
  watchBtn.dataset.mode = 'status-disabled';
  watchBtn.setAttribute('aria-disabled', 'true');
  watchBtn.setAttribute('aria-label', label || 'No disponible');
  watchBtn.innerHTML = `${label || 'No disponible'}`;
}

function setWatchBtnStatusClickable(watchBtn, movie, label) {
  if (!watchBtn || !movie?.id) return;

  clearLiveCountdownTimer();
  clearWatchBtnCountdownUI(watchBtn);

  const isSeries = movie.category === 'series';
  watchBtn.href = isSeries
    ? `/watch?series=${encodeURIComponent(movie.id)}`
    : `/watch?movie=${encodeURIComponent(movie.id)}`;

  watchBtn.dataset.mode = 'status-clickable';
  watchBtn.setAttribute('aria-label', label || 'Reproducir');
  watchBtn.innerHTML = `${label || 'Reproducir'} <span aria-hidden="true">▶</span>`;
}

function setWatchBtnLiveCountdown(watchBtn, movie) {
  clearLiveCountdownTimer();

  if (!watchBtn || !movie?.id || !Boolean(movie?.live_mode)) return false;

  const liveStart = getLiveStartDate(movie);
  if (!liveStart) return false;

  const targetMs = liveStart.getTime();
  ensureWatchBtnCountdownBlocker(watchBtn);

  const render = () => {
    const nowMs = Date.now();
    const diff = targetMs - nowMs;

    if (diff <= 0) {
      clearLiveCountdownTimer();
      const finishedMovie = applyFinishedLiveStateLocally(movie);
      void persistFinishedLiveState(movie);
      setWatchBtnVerAhora(watchBtn, finishedMovie);
      return;
    }

    const fecha = formatLiveDateEs(liveStart);
    const hora = formatLiveTimeEs(liveStart);
    const countdown = formatCountdown(diff);

    watchBtn.href = '#';
    watchBtn.dataset.mode = 'countdown';
    watchBtn.setAttribute('aria-disabled', 'true');
    watchBtn.setAttribute('aria-label', `Disponible el ${fecha} a las ${hora}`);

    watchBtn.innerHTML = `
      ${fecha} - ${hora}
      <span class="watch-meta"> · Empieza en ${countdown}</span>
    `;
  };

  render();
  __liveCountdownTimer = setInterval(render, 1000);
  return true;
}

window.addEventListener('beforeunload', clearLiveCountdownTimer);

/* ===========================
   TITLE HERO TRAILER VIDEO
=========================== */

const TITLE_VOLUME_ICON_MUTE =
  'https://satvplus.com.ar/images/svg/heromute.svg';
const TITLE_VOLUME_ICON_UNMUTE =
  'https://satvplus.com.ar/images/svg/heroon.svg';

function mountTitleHeroTrailerVideo(hero, movie) {
  if (!hero || !movie?.id) return;

  const trailerUrl = String(movie?.trailer_url || '').trim();
  if (!trailerUrl) return;

  const banner = movie.banner_url || movie.thumbnail_url || '';

  hero.classList.remove('hero-video-ready');
  hero.querySelectorAll('.title-hero-media').forEach((n) => n.remove());
  hero.querySelectorAll('.title-hero-volume-btn').forEach((n) => n.remove());

  const media = document.createElement('div');
  media.className = 'title-hero-media';

  const video = document.createElement('video');
  video.className = 'title-hero-video';
  video.src = trailerUrl;

  if (banner) video.poster = banner;

  video.autoplay = true;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');

  const shade = document.createElement('div');
  shade.className = 'title-hero-video-shade';

  media.appendChild(video);
  media.appendChild(shade);

  hero.prepend(media);

  const volBtn = document.createElement('button');
  volBtn.type = 'button';
  volBtn.className = 'title-hero-volume-btn';
  volBtn.setAttribute('aria-label', 'Activar sonido');
  volBtn.setAttribute('aria-pressed', 'false');

  const volIcon = document.createElement('img');
  volIcon.alt = '';
  volIcon.decoding = 'async';
  volIcon.src = TITLE_VOLUME_ICON_MUTE;
  volBtn.appendChild(volIcon);

  function syncVolumeUi() {
    const isMuted = !!video.muted;
    volIcon.src = isMuted ? TITLE_VOLUME_ICON_MUTE : TITLE_VOLUME_ICON_UNMUTE;
    volBtn.setAttribute('aria-label', isMuted ? 'Activar sonido' : 'Silenciar');
    volBtn.setAttribute('aria-pressed', String(!isMuted));
    volBtn.title = isMuted ? 'Activar sonido' : 'Silenciar';
  }

  volBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    video.muted = !video.muted;
    syncVolumeUi();

    const p = video.play?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  });

  hero.appendChild(volBtn);
  syncVolumeUi();

  video.addEventListener(
    'error',
    () => {
      volBtn.remove();
      media.remove();
      hero.classList.remove('hero-video-ready');
      console.warn('[title] trailer hero error:', trailerUrl);
    },
    { once: true }
  );

  const showVideo = () => hero.classList.add('hero-video-ready');
  video.addEventListener('loadeddata', showVideo, { once: true });
  video.addEventListener('canplay', showVideo, { once: true });

  requestAnimationFrame(() => {
    const p = video.play?.();
    if (p && typeof p.catch === 'function') {
      p.catch((err) =>
        console.warn('[title] autoplay trailer bloqueado:', err)
      );
    }
  });
}

/* ===========================
   Continue Watching (watch_progress)
=========================== */

async function getAppSupabaseClient() {
  const mod = await import('./supabaseClient.js');
  return mod?.supabase || null;
}

async function fetchContinueWatchingForTitle({ movieId }) {
  if (!movieId) return null;

  try {
    const supabase = await getAppSupabaseClient();
    if (!supabase) {
      console.warn('[title] supabaseClient.js no devolvió supabase');
      return null;
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      console.warn('[title] getUser error:', userErr);
      return null;
    }

    const userId = userData?.user?.id;
    if (!userId) {
      console.log('[title] sin sesión activa');
      return null;
    }

    let { data, error } = await supabase
      .from('watch_progress')
      .select(
        `
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
            `
      )
      .eq('user_id', userId)
      .eq('movie_id', movieId)
      .gt('progress_seconds', 0)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      error &&
      String(error.message || '')
        .toLowerCase()
        .includes('duration_seconds')
    ) {
      const retry = await supabase
        .from('watch_progress')
        .select(
          `
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
                `
        )
        .eq('user_id', userId)
        .eq('movie_id', movieId)
        .gt('progress_seconds', 0)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.warn('[title] watch_progress query error:', error);
      return null;
    }

    if (!data) {
      console.log('[title] sin progreso previo para este título:', movieId);
      return null;
    }

    const progressSeconds = Number(data.progress_seconds || 0);
    if (!Number.isFinite(progressSeconds) || progressSeconds <= 0) {
      console.log('[title] progreso inválido:', data);
      return null;
    }

    const ep = Array.isArray(data.episodes)
      ? data.episodes[0] || null
      : data.episodes || null;

    const out = {
      ...data,
      episodes: ep,
      season: ep?.season ?? null,
      episode_number: ep?.episode_number ?? null,
      episode_title: ep?.title ?? null,
      elapsed_seconds: progressSeconds,
    };

    console.log('[title] progreso detectado:', out);
    return out;
  } catch (e) {
    console.warn('[title] fetchContinueWatchingForTitle error:', e);
    return null;
  }
}

/* ===========================
   MI LISTA (Supabase REAL + fallback localStorage)
=========================== */

const MY_LIST_KEY = 'satv_my_list_ids';

function getMyListIds() {
  try {
    const raw = localStorage.getItem(MY_LIST_KEY);
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveMyListIds(ids) {
  try {
    localStorage.setItem(MY_LIST_KEY, JSON.stringify([...new Set(ids)]));
  } catch (e) {
    console.warn('[title] no se pudo guardar Mi Lista local:', e);
  }
}

function isInMyListLocal(movieId) {
  return getMyListIds().includes(movieId);
}

function setLocalMyListMembership(movieId, added) {
  const ids = getMyListIds();
  const exists = ids.includes(movieId);

  let next = ids;
  if (added && !exists) next = [...ids, movieId];
  if (!added && exists) next = ids.filter((id) => id !== movieId);

  saveMyListIds(next);
  return added;
}

function toggleMyListLocal(movieId) {
  const ids = getMyListIds();
  const exists = ids.includes(movieId);

  const next = exists ? ids.filter((id) => id !== movieId) : [...ids, movieId];

  saveMyListIds(next);
  return !exists;
}

function setMyListBtnState(btn, movieId, opts = {}) {
  if (!btn || !movieId) return;

  const { added = false, pending = false, source = 'unknown' } = opts;

  btn.classList.remove('hidden');
  btn.setAttribute('type', 'button');
  btn.setAttribute('aria-pressed', String(added));
  btn.setAttribute(
    'aria-label',
    added ? 'Quitar de Mi Lista' : 'Agregar a Mi Lista'
  );
  btn.classList.toggle('is-active', !!added);

  btn.dataset.myListState = added ? 'in' : 'out';
  btn.dataset.myListSource = source;
  btn.dataset.myListPending = pending ? '1' : '0';

  try {
    btn.disabled = !!pending;
  } catch {}

  const nextLabel = pending
    ? 'Actualizando…'
    : added
      ? 'En Mi Lista'
      : 'Mi Lista';

  const labelSpan = btn.querySelector('span');
  if (labelSpan) {
    labelSpan.textContent = nextLabel;
    return;
  }

  const textNode = [...btn.childNodes].find(
    (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0
  );

  if (textNode) {
    textNode.textContent = ` ${nextLabel}`;
  } else {
    btn.appendChild(document.createTextNode(` ${nextLabel}`));
  }
}

async function getMyListAuthContext() {
  try {
    const supabase = await getAppSupabaseClient();
    if (!supabase)
      return { supabase: null, profileId: null, isLoggedIn: false };

    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.warn('[title] getUser (Mi Lista) error:', error);
      return { supabase, profileId: null, isLoggedIn: false, error };
    }

    const profileId = data?.user?.id || null;
    return { supabase, profileId, isLoggedIn: !!profileId };
  } catch (e) {
    console.warn('[title] getMyListAuthContext error:', e);
    return { supabase: null, profileId: null, isLoggedIn: false, error: e };
  }
}

function buildMyListUrl(userId) {
  if (!userId) return '/mylist';

  const q = new URLSearchParams({
    list: String(userId),
    user: String(userId),
  });

  return `/mylist?${q.toString()}`;
}

function ensureMyListNavLink(userId) {
  const topnav = document.getElementById('topnav');
  if (!topnav) return;

  const navLeft = topnav.querySelector('.nav-left');
  if (!navLeft) return;

  let link = topnav.querySelector("[data-mylist-nav='1']");
  if (!link) {
    link = document.createElement('a');
    link.className = 'navlink';
    link.dataset.mylistNav = '1';
    link.textContent = 'Mi Lista';
  }

  link.href = buildMyListUrl(userId);

  const navItems = [...navLeft.querySelectorAll('a, button')];
  const inicio = navItems.find((n) => {
    if (n === link) return false;
    const t = (n.textContent || '').trim().toLowerCase();
    return t === 'inicio';
  });

  if (inicio && inicio.parentElement === navLeft) {
    if (inicio.nextSibling !== link) {
      navLeft.insertBefore(link, inicio.nextSibling);
    } else if (link.parentElement !== navLeft) {
      navLeft.insertBefore(link, inicio.nextSibling);
    }
  } else {
    if (link.parentElement !== navLeft) navLeft.appendChild(link);
  }
}

async function isInMyListSupabase({ supabase, profileId, contentId }) {
  if (!supabase || !profileId || !contentId) return false;

  const { data, error } = await supabase
    .from('my_list')
    .select('id')
    .eq('profile_id', profileId)
    .eq('content_id', contentId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

async function addToMyListSupabase({ supabase, profileId, contentId }) {
  if (!supabase || !profileId || !contentId) {
    throw new Error(
      'Faltan supabase/profileId/contentId para addToMyListSupabase'
    );
  }

  const payload = {
    profile_id: profileId,
    content_id: contentId,
    added_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('my_list').upsert(payload, {
    onConflict: 'profile_id,content_id',
    ignoreDuplicates: false,
  });

  if (error) throw error;
  return true;
}

async function removeFromMyListSupabase({ supabase, profileId, contentId }) {
  if (!supabase || !profileId || !contentId) {
    throw new Error(
      'Faltan supabase/profileId/contentId para removeFromMyListSupabase'
    );
  }

  const { error } = await supabase
    .from('my_list')
    .delete()
    .eq('profile_id', profileId)
    .eq('content_id', contentId);

  if (error) throw error;
  return true;
}

async function resolveMyListState(contentId) {
  const localAdded = isInMyListLocal(contentId);

  const ctx = await getMyListAuthContext();

  if (!ctx.supabase || !ctx.isLoggedIn || !ctx.profileId) {
    return {
      added: localAdded,
      source: 'local',
      supabase: ctx.supabase || null,
      profileId: null,
      isLoggedIn: false,
    };
  }

  try {
    const remoteAdded = await isInMyListSupabase({
      supabase: ctx.supabase,
      profileId: ctx.profileId,
      contentId,
    });

    setLocalMyListMembership(contentId, remoteAdded);

    return {
      added: remoteAdded,
      source: 'supabase',
      supabase: ctx.supabase,
      profileId: ctx.profileId,
      isLoggedIn: true,
    };
  } catch (e) {
    console.warn('[title] resolveMyListState remote error; uso local:', e);
    return {
      added: localAdded,
      source: 'local',
      supabase: ctx.supabase,
      profileId: ctx.profileId,
      isLoggedIn: !!ctx.profileId,
      error: e,
    };
  }
}

async function refreshMyListButtonState(btn, contentId) {
  if (!btn || !contentId) return;

  setMyListBtnState(btn, contentId, {
    added: isInMyListLocal(contentId),
    pending: true,
    source: 'unknown',
  });

  const state = await resolveMyListState(contentId);

  setMyListBtnState(btn, contentId, {
    added: state.added,
    pending: false,
    source: state.source,
  });

  return state;
}

async function bindMyListButton(btn, movie) {
  if (!btn || !movie?.id) return;

  btn.onclick = null;
  btn.dataset.myListMovieId = movie.id;

  await refreshMyListButtonState(btn, movie.id);

  if (btn.dataset.myListBound === '1') return;
  btn.dataset.myListBound = '1';

  btn.addEventListener('click', async (ev) => {
    ev.preventDefault();

    if (btn.dataset.myListPending === '1') return;

    const currentMovieId = btn.dataset.myListMovieId || movie.id;
    const currentVisualAdded = btn.dataset.myListState === 'in';

    setMyListBtnState(btn, currentMovieId, {
      added: currentVisualAdded,
      pending: true,
      source: btn.dataset.myListSource || 'unknown',
    });

    try {
      const state = await resolveMyListState(currentMovieId);

      if (state.source === 'supabase' && state.supabase && state.profileId) {
        if (state.added) {
          await removeFromMyListSupabase({
            supabase: state.supabase,
            profileId: state.profileId,
            contentId: currentMovieId,
          });

          setLocalMyListMembership(currentMovieId, false);

          setMyListBtnState(btn, currentMovieId, {
            added: false,
            pending: false,
            source: 'supabase',
          });

          console.log('[title] quitado de Mi Lista (Supabase)');
        } else {
          await addToMyListSupabase({
            supabase: state.supabase,
            profileId: state.profileId,
            contentId: currentMovieId,
          });

          setLocalMyListMembership(currentMovieId, true);

          setMyListBtnState(btn, currentMovieId, {
            added: true,
            pending: false,
            source: 'supabase',
          });

          console.log('[title] agregado a Mi Lista (Supabase)');
        }

        return;
      }

      const added = toggleMyListLocal(currentMovieId);
      setMyListBtnState(btn, currentMovieId, {
        added,
        pending: false,
        source: 'local',
      });

      console.log(
        added
          ? '[title] agregado a Mi Lista (local fallback)'
          : '[title] quitado de Mi Lista (local fallback)'
      );
    } catch (e) {
      console.warn('[title] toggle Mi Lista error:', e);

      try {
        await refreshMyListButtonState(btn, currentMovieId);
      } catch {
        setMyListBtnState(btn, currentMovieId, {
          added: isInMyListLocal(currentMovieId),
          pending: false,
          source: 'local',
        });
      }
    }
  });
}

/* ===========================
   AVISO DE LANZAMIENTO (title.html)
=========================== */

function setTitleReminderBtnState(
  btn,
  { active = false, pending = false, visible = true } = {}
) {
  if (!btn) return;

  btn.classList.toggle('hidden', !visible);
  btn.classList.toggle('is-active', !!active);
  btn.dataset.releaseReminderState = active ? 'on' : 'off';
  btn.dataset.releaseReminderPending = pending ? '1' : '0';
  btn.setAttribute('aria-pressed', String(!!active));
  btn.setAttribute(
    'aria-label',
    active ? 'Quitar aviso de lanzamiento' : 'Avisarme cuando se lance'
  );

  try {
    btn.disabled = !!pending;
  } catch {}

  const label = pending
    ? 'Actualizando…'
    : active
      ? 'Aviso activado'
      : 'Avisarme';
  btn.innerHTML = `<i class="${active ? 'fa-solid' : 'fa-regular'} fa-bell" aria-hidden="true"></i><span>${label}</span>`;
}

let __titleReleaseReminderSyncInstalled = false;

function getTitleReminderButtonsByMovieId(movieId) {
  const id = String(movieId || '');
  if (!id) return [];

  return Array.from(
    document.querySelectorAll('.title-reminder-btn[data-movie-id]')
  ).filter((btn) => String(btn.dataset.movieId || '') === id);
}

function syncTitleReminderButtonsByMovieId(
  movieId,
  { active = false, pending = false, visible = true } = {}
) {
  getTitleReminderButtonsByMovieId(movieId).forEach((button) => {
    setTitleReminderBtnState(button, { active, pending, visible });
  });
}

function ensureTitleReminderGlobalSync() {
  if (__titleReleaseReminderSyncInstalled) return;
  __titleReleaseReminderSyncInstalled = true;

  window.addEventListener('satv:release-reminders-changed', (ev) => {
    const movieId = ev?.detail?.movieId || ev?.detail?.contentId;
    if (!movieId || typeof ev?.detail?.active === 'undefined') return;

    syncTitleReminderButtonsByMovieId(movieId, {
      active: !!ev.detail.active,
      pending: false,
      visible: true,
    });
  });
}

async function bindTitleReleaseReminderButton(btn, movie, api) {
  if (!btn || !movie?.id || !api) return;
  ensureTitleReminderGlobalSync();

  if (!isLiveModeActive(movie) || !isLiveStartInFuture(movie)) {
    setTitleReminderBtnState(btn, { visible: false });
    return;
  }

  const contentId = String(movie.id);
  btn.dataset.movieId = contentId;
  setTitleReminderBtnState(btn, {
    visible: true,
    active: false,
    pending: true,
  });

  let ctx = null;
  try {
    ctx = await getMyListAuthContext();
  } catch (e) {
    console.warn('[title] no se pudo resolver usuario para Avisarme:', e);
    ctx = { profileId: null };
  }

  const profileId = ctx?.profileId || null;

  try {
    const active = await api.isReleaseReminderSet(profileId, contentId);
    syncTitleReminderButtonsByMovieId(contentId, {
      visible: true,
      active,
      pending: false,
    });
  } catch (e) {
    console.warn('[title] no se pudo leer Avisarme:', e);
    setTitleReminderBtnState(btn, {
      visible: true,
      active: false,
      pending: false,
    });
  }

  if (btn.dataset.releaseReminderBound === '1') return;
  btn.dataset.releaseReminderBound = '1';

  btn.addEventListener(
    'click',
    async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      if (btn.dataset.releaseReminderPending === '1') return;

      const wasActive = btn.dataset.releaseReminderState === 'on';
      syncTitleReminderButtonsByMovieId(contentId, {
        visible: true,
        active: wasActive,
        pending: true,
      });

      let nextCtx = ctx;
      try {
        nextCtx = await getMyListAuthContext();
      } catch {}

      const nextProfileId = nextCtx?.profileId || profileId || null;

      try {
        if (wasActive) {
          await api.removeReleaseReminder(nextProfileId, contentId);
          syncTitleReminderButtonsByMovieId(contentId, {
            visible: true,
            active: false,
            pending: false,
          });
          console.log('[title] aviso de lanzamiento desactivado');
        } else {
          await api.setReleaseReminder(nextProfileId, contentId);
          syncTitleReminderButtonsByMovieId(contentId, {
            visible: true,
            active: true,
            pending: false,
          });
          console.log('[title] aviso de lanzamiento activado');
        }

        window.dispatchEvent(
          new CustomEvent('satv:release-reminders-changed', {
            detail: { movieId: contentId, active: !wasActive },
          })
        );
      } catch (e) {
        console.warn('[title] toggle Avisarme error:', e);
        syncTitleReminderButtonsByMovieId(contentId, {
          visible: true,
          active: wasActive,
          pending: false,
        });
      }
    },
    { passive: false }
  );
}

/* ===========================
   TE PODRÍA GUSTAR (cards)
=========================== */

function getMoreCardBadgeLabel(movie) {
  if (!movie) return '';

  const publishState = getMoviePublishState(movie);
  const customText = String(movie.publish_state_text || '').trim();

  if (publishState === 'upcoming') {
    return customText || 'Próximamente';
  }

  if (publishState === 'other') {
    return customText || 'Otro';
  }

  if (Boolean(movie.live_mode)) {
    const d = getLiveStartDate(movie);
    if (d && d.getTime() <= Date.now()) return FINISHED_LIVE_PUBLISH_TEXT;
    if (d) return `${formatLiveDateEs(d)} - ${formatLiveTimeEs(d)}`;
    if (publishState === 'live') return 'En Vivo';
  }

  if (publishState === 'live') {
    return 'En Vivo';
  }

  return '';
}

async function renderMoreCardHtml({ item, esc, api }) {
  void api;

  const thumb = item.thumbnail_url || item.banner_url || '';
  const title = esc(shortenTitle(item.title || ''));
  const badgeLabel = getMoreCardBadgeLabel(item);

  return `
    <article
      class="episode-card more-card image-only-card"
      tabindex="0"
      role="link"
      aria-label="${title}"
      title="${title}"
      data-title="${esc(item.id)}"
    >
      <div class="more-card-thumb-wrap">
        <img class="episode-thumb" src="${esc(thumb)}" alt="">
        ${badgeLabel ? `<div class="card-badge card-badge-upcoming">${esc(badgeLabel)}</div>` : ``}
      </div>
    </article>
  `;
}

function bindMoreCardNavigation(rootEl, itemsById = new Map()) {
  rootEl.querySelectorAll('[data-title]').forEach((card) => {
    const go = async () => {
      const id = card.dataset.title;
      const item = itemsById.get(id);

      if (!id || !item) {
        window.location.href = `/title?title=${encodeURIComponent(id || '')}`;
        return;
      }

      try {
        const progress = await fetchContinueWatchingForTitle({ movieId: id });

        if (item.category === 'series') {
          if (progress?.episode_id) {
            window.location.href = `/watch?series=${encodeURIComponent(id)}&episode=${encodeURIComponent(progress.episode_id)}`;
            return;
          }

          window.location.href = `/watch?series=${encodeURIComponent(id)}`;
          return;
        }

        window.location.href = `/watch?movie=${encodeURIComponent(id)}`;
      } catch (e) {
        console.warn('[title] more-grid reanudar fallback error:', e);

        if (item.category === 'series') {
          window.location.href = `/watch?series=${encodeURIComponent(id)}`;
          return;
        }

        window.location.href = `/watch?movie=${encodeURIComponent(id)}`;
      }
    };

    card.addEventListener('click', go);
    card.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        go();
      }
    });
  });
}

async function renderMoreSection({ api, esc, currentMovieId }) {
  const moreGrid = el('more-grid');
  const moreSection = el('more-section');
  if (!moreGrid || !moreSection) return;

  moreGrid.innerHTML = '';

  let list = [];
  try {
    if (typeof api.fetchMoreExcluding === 'function') {
      list = await api.fetchMoreExcluding(currentMovieId, 24);
    } else if (typeof api.fetchLatest === 'function') {
      const tmp = await api.fetchLatest(60);
      list = (tmp || [])
        .filter((x) => x?.id && x.id !== currentMovieId)
        .slice(0, 24);
    } else {
      list = [];
    }
  } catch (e) {
    console.warn("No se pudo cargar 'Te podría gustar':", e);
    list = [];
  }

  if (!list.length) {
    moreSection.classList.add('hidden');
    return;
  }

  moreSection.classList.remove('hidden');

  const htmlParts = [];
  for (const item of list) {
    htmlParts.push(await renderMoreCardHtml({ item, esc, api }));
  }

  moreGrid.innerHTML = htmlParts.join('');

  const itemsById = new Map(
    list.filter((item) => item?.id).map((item) => [String(item.id), item])
  );

  bindMoreCardNavigation(moreGrid, itemsById);
  scheduleApplyCondensedFontToWrappedEpisodeTitles(moreGrid);
}

/* ===========================
   COLLECTION (usa el mismo HTML de cards, pero en su propia sección)
=========================== */

function renderCollectionCardHtml({ item, esc }) {
  const thumb = item.thumbnail_url || item.banner_url || '';
  const durationText = getMovieDurationBadgeText(item);
  const title = esc(item.title || '');

  return `
    <article
      class="episode-card more-card image-only-card"
      tabindex="0"
      role="link"
      aria-label="${title}"
      title="${title}"
      data-title="${esc(item.id)}"
    >
      <div class="more-card-thumb-wrap">
        <img class="episode-thumb" src="${esc(thumb)}" alt="">
        ${durationText ? `<span class="duration">${esc(durationText)}</span>` : ''}
      </div>
    </article>
  `;
}

function bindCollectionCardNavigation(rootEl, itemsById = new Map()) {
  rootEl.querySelectorAll('[data-title]').forEach((card) => {
    const go = () => {
      const id = card.dataset.title;
      const item = itemsById.get(String(id));

      if (!id || !item) {
        window.location.href = `/title?title=${encodeURIComponent(id || '')}`;
        return;
      }

      const params = new URLSearchParams();
      if (item.collection_id) params.set('collection', item.collection_id);
      params.set('title', item.id);

      window.location.href = `/title?${params.toString()}`;
    };

    card.addEventListener('click', go);
    card.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        go();
      }
    });
  });
}

function ensureCollectionMount() {
  let section = document.getElementById('collection-section');
  let title = document.getElementById('collection-title');
  let grid = document.getElementById('collection-grid');

  if (section && title && grid) {
    return { section, title, grid };
  }

  const moreSection = el('more-section');
  if (!moreSection?.parentElement) return null;

  section = document.createElement('section');
  section.id = 'collection-section';
  section.className = 'content-section container hidden';
  section.innerHTML = `
      <div class="section-head">
        <h2 id="collection-title">Colección completa</h2>
      </div>
      <div id="collection-grid" class="episodes-grid"></div>
    `;

  moreSection.parentElement.insertBefore(section, moreSection);

  title = document.getElementById('collection-title');
  grid = document.getElementById('collection-grid');

  return { section, title, grid };
}

async function renderCollectionSection({
  api,
  esc,
  collectionId,
  currentMovieId,
}) {
  const mount = ensureCollectionMount();
  if (!mount) return false;

  const { section, title, grid } = mount;

  title.textContent = 'Colección completa';
  grid.innerHTML = '';

  let items = [];

  try {
    if (typeof api.fetchCollection === 'function') {
      items = await api.fetchCollection(collectionId, 200);
    } else {
      console.warn('[title] api.fetchCollection no existe');
      items = [];
    }
  } catch (e) {
    console.warn('[title] no se pudo cargar Colección completa:', e);
    items = [];
  }

  items = (items || []).filter(
    (item) => item?.id && String(item.id) !== String(currentMovieId)
  );

  items = await hydrateMovieDurations(items);

  if (!items.length) {
    section.classList.add('hidden');
    return false;
  }

  section.classList.remove('hidden');

  grid.innerHTML = items
    .map((item) => renderCollectionCardHtml({ item, esc }))
    .join('');

  const itemsById = new Map(
    items.filter((item) => item?.id).map((item) => [String(item.id), item])
  );

  bindCollectionCardNavigation(grid, itemsById);
  scheduleApplyCondensedFontToWrappedEpisodeTitles(grid);

  return true;
}

/* ===========================
   MAIN
=========================== */

async function main() {
  const movieId = qs('title') || qs('movie');
  const collectionId = qs('collection');

  applyAkiraVideoContainOverrideIfNeeded(resolveAkiraOverrideTargetId());

  await ensureSupabaseGlobal();

  const ui = await import('./ui.js');
  const api = await import('./api.js');

  ui.setAppName?.();
  ui.renderNav?.({ active: 'home' });
  await ui.renderAuthButtons?.();
  ui.enableDataHrefNavigation?.();
  ui.applyDisguisedCssFromMovieId?.();

  try {
    const navCtx = await getMyListAuthContext();
    ensureMyListNavLink(navCtx?.profileId || null);
  } catch (e) {
    console.warn('[title] no se pudo preparar link Mi Lista en topnav:', e);
    ensureMyListNavLink(null);
  }

  if (!movieId || !isUuidLike(movieId)) {
    renderTitleNotFound();
    return;
  }

  if (collectionId && !isUuidLike(collectionId)) {
    renderTitleNotFound();
    return;
  }

  const esc = ui.escapeHtml;

  const hero = el('hero');
  const titleEl = el('t-title');
  const metaEl = el('t-meta');
  const sinopsisEl = el('t-sinopsis');
  const watchBtn = el('watch-btn');
  const trailerBtn = el('trailer-btn');
  const myListBtn = el('episodes-jump');
  const remindBtn = el('remind-btn');

  const episodesSection = el('episodes-section');
  const episodesTitle = el('episodes-title');
  const seasonFilter = el('season-filter');
  const episodesGrid = el('episodes-grid');

  const extraEl = el('title-extra');

  let movie = null;

  try {
    movie = await api.fetchMovie(movieId);
  } catch (e) {
    console.warn('[title] fetchMovie error:', e);
    renderTitleNotFound();
    return;
  }

  if (!movie) {
    renderTitleNotFound();
    return;
  }

  movie = await normalizeFinishedLiveState(movie);

  applyAkiraVideoContainOverrideIfNeeded(movie.id);

  let episodes = [];
  let episodeProgressMap = new Map();

  if (movie.category === 'series' && typeof api.fetchEpisodes === 'function') {
    try {
      episodes = await api.fetchEpisodes(movie.id);
      episodes = await hydrateEpisodeDurations(episodes);
    } catch (e) {
      console.warn(
        '[title] no se pudieron cargar episodios para meta robusta:',
        e
      );
      episodes = [];
    }

    try {
      episodeProgressMap = await fetchEpisodeProgressMapForTitle({
        movieId: movie.id,
      });
    } catch (e) {
      console.warn('[title] no se pudo cargar progress map de episodios:', e);
      episodeProgressMap = new Map();
    }
  }

  movie.__episodes_for_meta = episodes;

  document.title = `${movie.title || 'Título'} · SATV+`;

  await bindMyListButton(myListBtn, movie);

  const NIVELX_ID = '0acf7d27-5a80-4682-873a-760dd1ffdb51';
  document.body.classList.toggle('is-nivelx', movie.id === NIVELX_ID);

  if (titleEl) titleEl.textContent = movie.title || '';
  if (sinopsisEl) sinopsisEl.textContent = movie.description || '';

  const banner = movie.banner_url || movie.thumbnail_url || '';
  if (hero && banner) hero.style.backgroundImage = `url("${banner}")`;

  mountTitleHeroTrailerVideo(hero, movie);

  if (trailerBtn) trailerBtn.classList.add('hidden');

  const publishState = getMoviePublishState(movie);
  const publishStateLabel = getMoviePublishStateLabel(movie);

  await bindTitleReleaseReminderButton(remindBtn, movie, api);

  const isUpcomingLiveCountdown = setWatchBtnLiveCountdown(watchBtn, movie);

  if (!isUpcomingLiveCountdown) {
    if (publishState === 'upcoming') {
      setWatchBtnDisabledStatus(watchBtn, publishStateLabel);
    } else {
      if (publishState === 'live') {
        setWatchBtnStatusClickable(watchBtn, movie, publishStateLabel);
      } else {
        setWatchBtnVerAhora(watchBtn, movie);
      }

      try {
        const progress = await fetchContinueWatchingForTitle({
          movieId: movie.id,
        });
        if (progress) setWatchBtnReanudar(watchBtn, movie, progress);
      } catch (e) {
        console.warn('No se pudo leer watch_progress:', e);
      }
    }
  }

  const year = movie.release_year ? String(movie.release_year) : '';
  let right = '';
  const mm = movie.movie_meta || null;

  if (movie.category === 'series') {
    const counts = resolveSeriesCounts(movie, episodes);
    right = formatSeriesMetaFromCounts(counts);
  } else {
    right = formatDuration(movie.duration_minutes);
  }

  if (metaEl) {
    const genresText = formatGenresFull(movie);
    metaEl.replaceChildren();

    [year, right].filter(Boolean).forEach((value) => {
      if (metaEl.childNodes.length) {
        metaEl.appendChild(document.createTextNode(' · '));
      }
      metaEl.appendChild(document.createTextNode(value));
    });

    if (genresText) {
      if (metaEl.childNodes.length) {
        metaEl.appendChild(document.createTextNode(' · '));
      }

      const genresEl = document.createElement('span');
      genresEl.className = 'title-meta-genres';
      genresEl.style.textTransform = 'capitalize';
      genresEl.textContent = genresText;
      metaEl.appendChild(genresEl);
    }
  }

  if (extraEl) {
    const durText =
      movie.category === 'movie' ? formatDuration(movie.duration_minutes) : '';
    const hasAny =
      !!mm?.created_by ||
      !!mm?.fullcast ||
      !!mm?.fullscript ||
      !!mm?.fullgenres ||
      !!formatGenresFull(movie) ||
      !!mm?.fulltitletype ||
      !!mm?.fullage;

    extraEl.innerHTML = `
      <div class="title-extra-head">
        <h2 class="title-extra-title">Información completa</h2>
      </div>

      <div class="title-extra-card">
        ${durText ? row('Duración', durText, esc) : ''}

        ${row('Creado por', mm?.created_by, esc)}
        ${row('Elenco', mm?.fullcast, esc)}
        ${row('Guion', mm?.fullscript, esc)}
        ${row('Géneros', mm?.fullgenres || formatGenresFull(movie), esc)}
        ${row('Tipo', mm?.fulltitletype, esc)}
        ${row('Edad', mm?.fullage, esc)}

        ${hasAny ? '' : `<div class="title-extra-value">Sin información cargada todavía.</div>`}
      </div>
    `;

    extraEl.classList.remove('hidden');
  }

  if (!episodesSection || !episodesTitle || !seasonFilter || !episodesGrid) {
    if (collectionId) {
      await renderCollectionSection({
        api,
        esc,
        collectionId,
        currentMovieId: movie.id,
      });
    }

    await renderMoreSection({ api, esc, currentMovieId: movie.id });
    return;
  }

  if (movie.category !== 'series') {
    episodesSection.classList.add('hidden');

    if (collectionId) {
      await renderCollectionSection({
        api,
        esc,
        collectionId,
        currentMovieId: movie.id,
      });
    }

    await renderMoreSection({ api, esc, currentMovieId: movie.id });
    return;
  }

  episodesSection.classList.remove('hidden');
  episodesTitle.textContent = 'Temporadas';
  seasonFilter.classList.remove('hidden');
  episodesGrid.classList.remove('hidden');

  if (!episodes?.length) {
    episodesGrid.innerHTML = `<div class="muted">No hay episodios cargados.</div>`;

    if (collectionId) {
      await renderCollectionSection({
        api,
        esc,
        collectionId,
        currentMovieId: movie.id,
      });
    }

    await renderMoreSection({ api, esc, currentMovieId: movie.id });
    return;
  }

  const grouped = groupBySeason(episodes);
  const seasons = grouped.map(([s]) => s);

  let currentSeason = clampSeason(seasons, seasons[0]);
  let dropdownOpen = false;

  function removeGeneratedAllNodes() {
    const parent = episodesGrid.parentElement;
    if (!parent) return;
    parent.querySelectorAll("[data-generated='1']").forEach((n) => n.remove());
  }

  function clearSeasonClassOnFirstGrid() {
    episodesGrid.classList.forEach((c) => {
      if (c.startsWith('episodes-grid-s')) episodesGrid.classList.remove(c);
    });
  }

  function setSeasonClassOnFirstGrid(seasonNum) {
    clearSeasonClassOnFirstGrid();
    episodesGrid.classList.add(
      `episodes-grid-s${String(seasonNum).replace(/[^\w-]/g, '_')}`
    );
  }

  function createTitleNode(seasonNum, count) {
    const t = document.createElement('div');
    t.dataset.generated = '1';
    t.dataset.season = String(seasonNum);
    t.className = 'season-title';
    t.textContent = `Temporada ${seasonNum}: ${count} ${plural(count, 'episodio', 'episodios')}`;
    return t;
  }

  function createSiblingGridForSeason(seasonNum) {
    const g = document.createElement('div');
    g.className = `episodes-grid episodes-grid-s${String(seasonNum).replace(/[^\w-]/g, '_')}`;
    g.dataset.generated = '1';
    g.dataset.season = String(seasonNum);
    return g;
  }

  function closeDropdown() {
    dropdownOpen = false;
    const menu = seasonFilter.querySelector('.dropdown-menu');
    const btn = seasonFilter.querySelector('.dropdown-btn');
    if (menu) menu.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function openDropdown() {
    dropdownOpen = true;
    const menu = seasonFilter.querySelector('.dropdown-menu');
    const btn = seasonFilter.querySelector('.dropdown-btn');
    if (menu) menu.classList.remove('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function toggleDropdown() {
    if (dropdownOpen) closeDropdown();
    else openDropdown();
  }

  function renderSeasonSelector() {
    seasonFilter.innerHTML = '';

    if (seasons.length === 1) {
      seasonFilter.innerHTML = `
        <div class="season-chip active" aria-current="true">
          Temporada ${esc(String(seasons[0]))}
        </div>
      `;
      return;
    }

    const currentLabel =
      currentSeason === 'all'
        ? 'Todos los episodios'
        : `Temporada ${currentSeason}`;

    seasonFilter.innerHTML = `
      <div class="dropdown">
        <div class="dropdown-btn"
             role="button"
             tabindex="0"
             aria-haspopup="true"
             aria-expanded="false">
          ${esc(String(currentLabel))}
        </div>

        <div class="dropdown-menu hidden" role="menu">
          ${grouped
            .map(
              ([s, list]) => `
            <div class="dropdown-item ${s === currentSeason ? 'active' : ''}"
                 role="menuitem"
                 tabindex="0"
                 data-season="${esc(String(s))}">
              Temporada ${esc(String(s))}
              <span class="meta-dropitem">(${list.length} ${plural(list.length, 'episodio', 'episodios')})</span>
            </div>
          `
            )
            .join('')}

          <div class="separator" aria-hidden="true"></div>

          <div class="dropdown-item dropdown-all ${currentSeason === 'all' ? 'active' : ''}"
               role="menuitem"
               tabindex="0"
               data-action="all">
            Ver todos los episodios
          </div>
        </div>
      </div>
    `;

    const btn = seasonFilter.querySelector('.dropdown-btn');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault?.();
        e.stopPropagation();
        toggleDropdown();
      });
      btn.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          ev.stopPropagation();
          toggleDropdown();
        }
      });
    }

    seasonFilter.querySelectorAll('.dropdown-item').forEach((item) => {
      const pick = (e) => {
        e.preventDefault?.();
        e.stopPropagation();

        const action = item.dataset.action;
        if (action === 'all') {
          currentSeason = 'all';
          renderSeasonSelector();
          renderEpisodesGrid();
          closeDropdown();
          return;
        }

        const raw = item.dataset.season;
        if (raw !== undefined) {
          const matched = seasons.find((s) => String(s) === String(raw));
          if (matched !== undefined) {
            currentSeason = matched;
            renderSeasonSelector();
            renderEpisodesGrid();
            closeDropdown();
          }
        }
      };

      item.addEventListener('click', pick);
      item.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          ev.stopPropagation();
          pick(ev);
        }
      });
    });
  }

  function renderEpisodesGrid() {
    const fallbackThumb = movie.thumbnail_url || movie.banner_url || '';
    const parent = episodesGrid.parentElement;
    if (!parent) return;

    removeGeneratedAllNodes();

    if (currentSeason === 'all') {
      grouped.forEach(([s, list], idx) => {
        const titleNode = createTitleNode(s, list.length);
        const html = list
          .map((ep) =>
            renderEpisodeCardHtml({
              ep,
              fallbackThumb,
              esc,
              progressMap: episodeProgressMap,
            })
          )
          .join('');

        if (idx === 0) {
          setSeasonClassOnFirstGrid(s);
          parent.insertBefore(titleNode, episodesGrid);
          episodesGrid.innerHTML = html;
        } else {
          const gridNode = createSiblingGridForSeason(s);
          gridNode.innerHTML = html;
          parent.insertBefore(titleNode, null);
          parent.insertBefore(gridNode, null);
        }
      });

      bindEpisodeCardNavigation(parent, movie.id);
      scheduleApplyCondensedFontToWrappedEpisodeTitles(parent);
      return;
    }

    setSeasonClassOnFirstGrid(currentSeason);

    const list =
      grouped.find(([s]) => String(s) === String(currentSeason))?.[1] || [];
    episodesGrid.innerHTML = list
      .map((ep) =>
        renderEpisodeCardHtml({
          ep,
          fallbackThumb,
          esc,
          progressMap: episodeProgressMap,
        })
      )
      .join('');

    bindEpisodeCardNavigation(episodesGrid, movie.id);
    scheduleApplyCondensedFontToWrappedEpisodeTitles(episodesGrid);
  }

  document.addEventListener('click', (ev) => {
    const dd = seasonFilter.querySelector('.dropdown');
    if (!dd) return;
    if (dd.contains(ev.target)) return;
    closeDropdown();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeDropdown();
  });

  window.addEventListener('resize', () => {
    scheduleApplyCondensedFontToWrappedEpisodeTitles(document);
  });

  if (document.fonts?.ready) {
    document.fonts.ready
      .then(() => {
        scheduleApplyCondensedFontToWrappedEpisodeTitles(document);
      })
      .catch(() => {});
  }

  renderSeasonSelector();
  renderEpisodesGrid();

  if (collectionId) {
    await renderCollectionSection({
      api,
      esc,
      collectionId,
      currentMovieId: movie.id,
    });
  }

  await renderMoreSection({ api, esc, currentMovieId: movie.id });
}

main().catch(console.error);
