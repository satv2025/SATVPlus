function qs(key) { return new URLSearchParams(window.location.search).get(key); }
function el(id) { return document.getElementById(id); }

/* ===========================
   Lazy load Supabase SDK (global)
=========================== */

function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
        const exists = [...document.scripts].some((s) => s.src === src);
        if (exists) return resolve();
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error("No se pudo cargar: " + src));
        document.head.appendChild(s);
    });
}

async function ensureSupabaseGlobal() {
    if (window.supabase?.createClient) return;
    await loadScriptOnce("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
    if (!window.supabase?.createClient) throw new Error("Supabase SDK ok pero createClient no existe.");
}

/* ===========================
   Utils
=========================== */

function plural(n, one, many) { return Number(n) === 1 ? one : many; }

function formatDuration(minutes) {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0) return "";
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h} h` : `${h} h ${rem} min`;
}

function formatElapsed(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    return `${m}:${String(ss).padStart(2, "0")}`;
}

function row(label, value, esc) {
    if (!value) return "";
    return `
    <div class="title-extra-row">
      <div class="title-extra-label">${esc(label)}</div>
      <div class="title-extra-value">${esc(value)}</div>
    </div>`;
}

function isPositiveIntegerLike(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 1 && Number.isInteger(n);
}

function isUuidLike(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

/* ===========================
   Not found
=========================== */

function renderTitleNotFound() {
    document.title = "Título no encontrado · SATV+";

    const hero = el("hero");
    const episodesSection = el("episodes-section");
    const moreSection = el("more-section");
    const moreGrid = el("more-grid");
    const extraEl = el("title-extra");

    if (hero) {
        hero.style.backgroundImage = "none";
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

        const btn = document.getElementById("title-not-found-btn");
        if (btn) btn.onclick = () => { window.location.href = "/index.html"; };
    }

    if (episodesSection) episodesSection.classList.add("hidden");
    if (moreSection) moreSection.classList.add("hidden");
    if (moreGrid) moreGrid.innerHTML = "";
    if (extraEl) { extraEl.innerHTML = ""; extraEl.classList.add("hidden"); }
}

/* ===========================
   Episode title wrapped font helper
=========================== */

let __episodeTitleWrappedRaf = 0;

function applyCondensedFontToWrappedEpisodeTitles(root = document) {
    const titles = root.querySelectorAll("h4.episode-title");
    titles.forEach((title) => {
        title.classList.remove("episode-title--wrapped");
        title.style.removeProperty("font-family");

        const style = window.getComputedStyle(title);

        let lineHeight = parseFloat(style.lineHeight);
        if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
            const fontSize = parseFloat(style.fontSize) || 16;
            lineHeight = fontSize * 1.2;
        }

        const scrollHeight = title.scrollHeight;
        const clientHeight = title.clientHeight;
        const rectHeight = title.getBoundingClientRect().height;
        const renderedHeight = Math.max(scrollHeight, clientHeight, rectHeight);

        if (!Number.isFinite(renderedHeight) || renderedHeight <= 0) return;

        const isWrapped = renderedHeight > (lineHeight * 1.35);
        if (isWrapped) {
            title.classList.add("episode-title--wrapped");
            title.style.setProperty("font-family", "HBOMaxSansCond", "important");
        }
    });
}

function scheduleApplyCondensedFontToWrappedEpisodeTitles(root = document) {
    if (__episodeTitleWrappedRaf) cancelAnimationFrame(__episodeTitleWrappedRaf);
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

const AKIRA_SERIES_ID = "d54c717b-c713-41bb-91cb-a9a2a302d44a";
const AKIRA_VIDEO_STYLE_ID = "akira-video-contain-override";

function shouldApplyAkiraVideoContainOverride(currentId) {
    return String(currentId || "").trim() === AKIRA_SERIES_ID;
}

function applyAkiraVideoContainOverrideIfNeeded(currentId) {
    const styleId = AKIRA_VIDEO_STYLE_ID;
    let styleEl = document.getElementById(styleId);

    if (!shouldApplyAkiraVideoContainOverride(currentId)) {
        if (styleEl) styleEl.remove();
        return;
    }

    if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
    }

    styleEl.textContent = `.akira-video{object-fit:contain!important;}`;
}

function resolveAkiraOverrideTargetId() {
    const fromSeries = qs("series");
    if (fromSeries) return fromSeries;

    const fromTitle = qs("title") || qs("movie");
    if (fromTitle) return fromTitle;

    return "";
}

/* ===========================
   Publish state
=========================== */

function getMoviePublishState(movie) {
    const raw = String(movie?.publish_state || "public").toLowerCase();
    if (["public", "upcoming", "live", "other"].includes(raw)) return raw;
    return "public";
}

function getMoviePublishStateLabel(movie) {
    const state = getMoviePublishState(movie);
    const custom = String(movie?.publish_state_text || "").trim();

    if (state === "public") return "Público";
    if (state === "upcoming") return custom || "Próximamente";
    if (state === "live") return "En Vivo";
    if (state === "other") return custom || "Otro";
    return "Público";
}

/* ===========================
   Series counts (robusto)
=========================== */

function deriveSeriesCountsFromEpisodes(episodes) {
    const list = safeArray(episodes);
    const seasonSet = new Set();
    let episodesCount = 0;

    for (const ep of list) {
        episodesCount += 1;
        const seasonRaw = ep?.season;
        if (seasonRaw !== null && seasonRaw !== undefined && seasonRaw !== "") seasonSet.add(String(seasonRaw));
    }

    return { seasonsCount: seasonSet.size, episodesCount };
}

function resolveSeriesCounts(movie, episodes) {
    const fromEpisodes = deriveSeriesCountsFromEpisodes(episodes);
    const mm = movie?.movie_meta || null;

    const metaSeasons = Number(mm?.seasons_count);
    const metaEpisodes = Number(mm?.episodes_count);

    const seasonsCount = fromEpisodes.seasonsCount >= 1
        ? fromEpisodes.seasonsCount
        : (isPositiveIntegerLike(metaSeasons) ? metaSeasons : 0);

    const episodesCount = fromEpisodes.episodesCount >= 1
        ? fromEpisodes.episodesCount
        : (isPositiveIntegerLike(metaEpisodes) ? metaEpisodes : 0);

    return { seasonsCount, episodesCount };
}

function formatSeriesMetaFromCounts({ seasonsCount, episodesCount }) {
    if (Number.isFinite(seasonsCount) && seasonsCount >= 2) {
        return `${seasonsCount} ${plural(seasonsCount, "temporada", "temporadas")}`;
    }
    if (Number.isFinite(seasonsCount) && seasonsCount === 1) {
        if (Number.isFinite(episodesCount) && episodesCount === 1) return "1 episodio";
        if (Number.isFinite(episodesCount) && episodesCount >= 2) return `${episodesCount} episodios`;
        return "";
    }
    if (Number.isFinite(episodesCount) && episodesCount === 1) return "1 episodio";
    if (Number.isFinite(episodesCount) && episodesCount >= 2) return `${episodesCount} episodios`;
    return "";
}

/* ===========================
   TE PODRÍA GUSTAR helpers
=========================== */

function shortenTitle(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";

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
        /^[A-Z0-9%]+$/.test(left.replace(/\s+/g, ""));

    const rightLooksSubtitle = wordsRight.length >= 3;

    if (leftLooksBrandish || !rightLooksSubtitle) return s;
    return left;
}

function formatSeriesMeta(movie) {
    const counts = resolveSeriesCounts(movie, movie?.__episodes_for_meta || []);
    return formatSeriesMetaFromCounts(counts);
}

function getMoreMetaLine(movie) {
    const year = movie.release_year ? String(movie.release_year) : "";
    let right = "";

    if (movie.category === "movie") right = formatDuration(movie.duration_minutes);
    else if (movie.category === "series") right = formatSeriesMeta(movie);
    else right = formatDuration(movie.duration_minutes);

    return [year, right].filter(Boolean).join(" · ");
}

/* ===========================
   Episodes helpers
=========================== */

function pickEpisodeThumb(ep) { return ep?.thumbnail_episode || ep?.thumb || ""; }

function groupBySeason(episodes) {
    const map = new Map();

    for (const ep of safeArray(episodes)) {
        const seasonValue = ep?.season;
        const s = (seasonValue !== null && seasonValue !== undefined && seasonValue !== "") ? seasonValue : 1;
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
        return String(a[0]).localeCompare(String(b[0]), "es");
    });
}

function clampSeason(seasons, desired) {
    if (!seasons?.length) return seasons?.[0] ?? 1;
    if (seasons.includes(desired)) return desired;
    return seasons[0];
}

function scrollToEpisodes() {
    const target = el("episodes-section");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ===========================
   Episode progress
=========================== */

function clampProgressPercent(progressSeconds, durationSeconds) {
    const progress = Number(progressSeconds || 0);
    const duration = Number(durationSeconds || 0);

    if (!Number.isFinite(progress) || !Number.isFinite(duration) || duration <= 0) return 0;

    const pct = (progress / duration) * 100;
    return Math.max(0, Math.min(100, pct));
}

async function getAppSupabaseClient() {
    const mod = await import("./supabaseClient.js");
    return mod?.supabase || null;
}

async function fetchEpisodeProgressMapForTitle({ movieId }) {
    if (!movieId) return new Map();

    try {
        const supabase = await getAppSupabaseClient();
        if (!supabase) return new Map();

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) return new Map();

        const userId = userData?.user?.id;
        if (!userId) return new Map();

        const { data, error } = await supabase
            .from("watch_progress")
            .select(`episode_id, progress_seconds, duration_seconds, updated_at`)
            .eq("user_id", userId)
            .eq("movie_id", movieId)
            .not("episode_id", "is", null)
            .gt("progress_seconds", 0)
            .order("updated_at", { ascending: false });

        if (error) return new Map();

        const map = new Map();
        for (const row of data || []) {
            const episodeId = row?.episode_id;
            if (!episodeId) continue;
            if (map.has(episodeId)) continue;

            const percent = clampProgressPercent(row.progress_seconds, row.duration_seconds);
            map.set(episodeId, {
                episodeId,
                progressSeconds: Number(row.progress_seconds || 0),
                durationSeconds: Number(row.duration_seconds || 0),
                percent,
                updatedAt: row.updated_at || null
            });
        }

        return map;
    } catch {
        return new Map();
    }
}

/* ===========================
   Episode cards
=========================== */

function renderEpisodeCardHtml({ ep, fallbackThumb, esc, progressMap }) {
    const thumb = pickEpisodeThumb(ep) || fallbackThumb;

    const s = ep.season ?? "";
    const n = ep.episode_number ?? "";

    const tag = (s !== "" && s != null && n !== "" && n != null)
        ? `T${s}E${n}`
        : (n !== "" && n != null)
            ? `E${n}`
            : (s !== "" && s != null)
                ? `T${s}`
                : "";

    const epTitleText = tag ? `${tag} ${ep.title || ""}`.trim() : (ep.title || "");
    const epTitle = esc(epTitleText);

    const progress = progressMap?.get?.(ep.id) || null;
    const progressPercent = Math.max(0, Math.min(100, Number(progress?.percent || 0)));
    const hasProgress = progressPercent > 0;

    return `
    <article class="episode-card" tabindex="0" role="link" data-episode="${esc(ep.id)}">
      <img class="episode-thumb" src="${esc(thumb)}" alt="">
      ${hasProgress ? `
        <div class="episode-progress" aria-hidden="true">
          <div class="episode-progress-bar" style="width:${progressPercent}%;"></div>
        </div>
      ` : ""}
      <div class="episode-body">
        <h4 class="episode-title">${epTitle}</h4>
        <span class="episode-sub">${esc(ep.sinopsis || "")}</span>
      </div>
    </article>
  `;
}

function bindEpisodeCardNavigation(rootEl, movieId) {
    rootEl.querySelectorAll(".episode-card[data-episode]").forEach(card => {
        const go = () => {
            const epId = card.dataset.episode;
            window.location.href = `/watch?series=${encodeURIComponent(movieId)}&episode=${encodeURIComponent(epId)}`;
        };
        card.addEventListener("click", go);
        card.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); }
        });
    });
}

/* ===========================
   Watch button
=========================== */

let __liveCountdownTimer = null;
const LIVE_DISPLAY_TIMEZONE = "America/Argentina/Buenos_Aires";

function clearLiveCountdownTimer() {
    if (__liveCountdownTimer) { clearInterval(__liveCountdownTimer); __liveCountdownTimer = null; }
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
    return new Intl.DateTimeFormat("es-AR", {
        timeZone: LIVE_DISPLAY_TIMEZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }).format(d);
}

function formatLiveTimeEs(d) {
    return new Intl.DateTimeFormat("es-AR", {
        timeZone: LIVE_DISPLAY_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(d);
}

function formatCountdown(diffMs) {
    const total = Math.max(0, Math.floor(diffMs / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    const hh = String(hours).padStart(2, "0");
    const mm = String(mins).padStart(2, "0");
    const ss = String(secs).padStart(2, "0");

    return days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

function ensureWatchBtnCountdownBlocker(watchBtn) {
    if (!watchBtn || watchBtn.dataset.liveCountdownBlockerBound === "1") return;
    watchBtn.dataset.liveCountdownBlockerBound = "1";
    watchBtn.addEventListener("click", (ev) => {
        const mode = watchBtn.dataset.mode;
        if (mode === "countdown" || mode === "status-disabled") {
            ev.preventDefault();
            ev.stopPropagation();
        }
    }, { passive: false });
}

function clearWatchBtnCountdownUI(watchBtn) {
    if (!watchBtn) return;
    watchBtn.removeAttribute("aria-disabled");
    try { watchBtn.disabled = false; } catch { }
}

function setWatchBtnVerAhora(watchBtn, movie) {
    if (!watchBtn || !movie?.id) return;

    clearLiveCountdownTimer();
    clearWatchBtnCountdownUI(watchBtn);

    const isSeries = movie.category === "series";
    watchBtn.href = isSeries
        ? `/watch?series=${encodeURIComponent(movie.id)}`
        : `/watch?movie=${encodeURIComponent(movie.id)}`;

    watchBtn.setAttribute("aria-label", "Reproducir");
    watchBtn.innerHTML = `Reproducir <span aria-hidden="true">▶</span>`;
    watchBtn.dataset.mode = "now";
}

function setWatchBtnReanudar(watchBtn, movie, p) {
    if (!watchBtn || !movie?.id || !p) return;

    clearLiveCountdownTimer();
    clearWatchBtnCountdownUI(watchBtn);

    const isSeries = movie.category === "series";
    const ep = Array.isArray(p.episodes) ? (p.episodes[0] || null) : (p.episodes || null);

    const season = p.season ?? ep?.season ?? "";
    const epNum = p.episode_number ?? ep?.episode_number ?? "";
    const epTitle = p.episode_title ?? ep?.title ?? "";
    const elapsedSeconds = Number(p.progress_seconds ?? p.elapsed_seconds ?? p.elapsed ?? 0);
    const elapsed = formatElapsed(elapsedSeconds);

    const hasSeason = season !== "" && season != null;
    const hasEpisode = epNum !== "" && epNum != null;

    const tag = (hasSeason && hasEpisode) ? `T${Number(season)}E${Number(epNum)}` : "";
    const meta = [tag, epTitle].filter(Boolean).join(" ").trim();

    if (isSeries) {
        watchBtn.href = p.episode_id
            ? `/watch?series=${encodeURIComponent(movie.id)}&episode=${encodeURIComponent(p.episode_id)}`
            : `/watch?series=${encodeURIComponent(movie.id)}`;
    } else {
        watchBtn.href = `/watch?movie=${encodeURIComponent(movie.id)}`;
    }

    watchBtn.setAttribute("aria-label", "Reanudar");
    watchBtn.innerHTML =
        `Reanudar <span aria-hidden="true">▶</span>` +
        (meta || elapsed ? ` <span class="watch-meta">${meta}${elapsed ? ` · ${elapsed}` : ""}</span>` : "");
    watchBtn.dataset.mode = "resume";
}

function setWatchBtnDisabledStatus(watchBtn, label) {
    if (!watchBtn) return;

    clearLiveCountdownTimer();
    ensureWatchBtnCountdownBlocker(watchBtn);

    watchBtn.href = "#";
    watchBtn.dataset.mode = "status-disabled";
    watchBtn.setAttribute("aria-disabled", "true");
    watchBtn.setAttribute("aria-label", label || "No disponible");
    watchBtn.innerHTML = `${label || "No disponible"}`;
}

function setWatchBtnStatusClickable(watchBtn, movie, label) {
    if (!watchBtn || !movie?.id) return;

    clearLiveCountdownTimer();
    clearWatchBtnCountdownUI(watchBtn);

    const isSeries = movie.category === "series";
    watchBtn.href = isSeries
        ? `/watch?series=${encodeURIComponent(movie.id)}`
        : `/watch?movie=${encodeURIComponent(movie.id)}`;

    watchBtn.dataset.mode = "status-clickable";
    watchBtn.setAttribute("aria-label", label || "Reproducir");
    watchBtn.innerHTML = `${label || "Reproducir"} <span aria-hidden="true">▶</span>`;
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
            setWatchBtnVerAhora(watchBtn, movie);
            return;
        }

        const fecha = formatLiveDateEs(liveStart);
        const hora = formatLiveTimeEs(liveStart);
        const countdown = formatCountdown(diff);

        watchBtn.href = "#";
        watchBtn.dataset.mode = "countdown";
        watchBtn.setAttribute("aria-disabled", "true");
        watchBtn.setAttribute("aria-label", `Disponible el ${fecha} a las ${hora}`);

        watchBtn.innerHTML = `
      ${fecha} - ${hora}
      <span class="watch-meta"> · Empieza en ${countdown}</span>
    `;
    };

    render();
    __liveCountdownTimer = setInterval(render, 1000);
    return true;
}

window.addEventListener("beforeunload", clearLiveCountdownTimer);

/* ===========================
   TITLE HERO TRAILER VIDEO
=========================== */

const TITLE_VOLUME_ICON_MUTE = "https://satvplus.com.ar/images/svg/heromute.svg";
const TITLE_VOLUME_ICON_UNMUTE = "https://satvplus.com.ar/images/svg/heroon.svg";

function mountTitleHeroTrailerVideo(hero, movie) {
    if (!hero || !movie?.id) return;

    const trailerUrl = String(movie?.trailer_url || "").trim();
    if (!trailerUrl) return;

    const banner = movie.banner_url || movie.thumbnail_url || "";

    hero.classList.remove("hero-video-ready");
    hero.querySelectorAll(".title-hero-media").forEach((n) => n.remove());
    hero.querySelectorAll(".title-hero-volume-btn").forEach((n) => n.remove());

    const media = document.createElement("div");
    media.className = "title-hero-media";

    const video = document.createElement("video");
    video.className = "title-hero-video";
    video.src = trailerUrl;
    if (banner) video.poster = banner;

    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");

    const shade = document.createElement("div");
    shade.className = "title-hero-video-shade";

    media.appendChild(video);
    media.appendChild(shade);
    hero.prepend(media);

    const volBtn = document.createElement("button");
    volBtn.type = "button";
    volBtn.className = "title-hero-volume-btn";
    volBtn.setAttribute("aria-label", "Activar sonido");
    volBtn.setAttribute("aria-pressed", "false");

    const volIcon = document.createElement("img");
    volIcon.alt = "";
    volIcon.decoding = "async";
    volIcon.src = TITLE_VOLUME_ICON_MUTE;
    volBtn.appendChild(volIcon);

    function syncVolumeUi() {
        const isMuted = !!video.muted;
        volIcon.src = isMuted ? TITLE_VOLUME_ICON_MUTE : TITLE_VOLUME_ICON_UNMUTE;
        volBtn.setAttribute("aria-label", isMuted ? "Activar sonido" : "Silenciar");
        volBtn.setAttribute("aria-pressed", String(!isMuted));
        volBtn.title = isMuted ? "Activar sonido" : "Silenciar";
    }

    volBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        video.muted = !video.muted;
        syncVolumeUi();
        const p = video.play?.();
        if (p && typeof p.catch === "function") p.catch(() => { });
    });

    hero.appendChild(volBtn);
    syncVolumeUi();

    video.addEventListener("error", () => {
        volBtn.remove();
        media.remove();
        hero.classList.remove("hero-video-ready");
        console.warn("[title] trailer hero error:", trailerUrl);
    }, { once: true });

    const showVideo = () => hero.classList.add("hero-video-ready");
    video.addEventListener("loadeddata", showVideo, { once: true });
    video.addEventListener("canplay", showVideo, { once: true });

    requestAnimationFrame(() => {
        const p = video.play?.();
        if (p && typeof p.catch === "function") {
            p.catch((err) => console.warn("[title] autoplay trailer bloqueado:", err));
        }
    });
}

/* ===========================
   Continue Watching (watch_progress)
=========================== */

async function fetchContinueWatchingForTitle({ movieId }) {
    if (!movieId) return null;

    try {
        const supabase = await getAppSupabaseClient();
        if (!supabase) return null;

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) return null;

        const userId = userData?.user?.id;
        if (!userId) return null;

        let { data, error } = await supabase
            .from("watch_progress")
            .select(`
        movie_id,
        episode_id,
        progress_seconds,
        duration_seconds,
        updated_at,
        episodes:episodes!watch_progress_episode_id_fkey (
          id, season, episode_number, title
        )
      `)
            .eq("user_id", userId)
            .eq("movie_id", movieId)
            .gt("progress_seconds", 0)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error && String(error.message || "").toLowerCase().includes("duration_seconds")) {
            const retry = await supabase
                .from("watch_progress")
                .select(`
          movie_id,
          episode_id,
          progress_seconds,
          updated_at,
          episodes:episodes!watch_progress_episode_id_fkey (
            id, season, episode_number, title
          )
        `)
                .eq("user_id", userId)
                .eq("movie_id", movieId)
                .gt("progress_seconds", 0)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            data = retry.data;
            error = retry.error;
        }

        if (error) return null;
        if (!data) return null;

        const progressSeconds = Number(data.progress_seconds || 0);
        if (!Number.isFinite(progressSeconds) || progressSeconds <= 0) return null;

        const ep = Array.isArray(data.episodes) ? (data.episodes[0] || null) : (data.episodes || null);

        return {
            ...data,
            episodes: ep,
            season: ep?.season ?? null,
            episode_number: ep?.episode_number ?? null,
            episode_title: ep?.title ?? null,
            elapsed_seconds: progressSeconds
        };
    } catch {
        return null;
    }
}

/* ===========================
   MI LISTA (Supabase + fallback localStorage)
=========================== */

const MY_LIST_KEY = "satv_my_list_ids";

function getMyListIds() {
    try {
        const raw = localStorage.getItem(MY_LIST_KEY);
        const arr = JSON.parse(raw || "[]");
        return Array.isArray(arr) ? arr.filter(Boolean) : [];
    } catch {
        return [];
    }
}

function saveMyListIds(ids) {
    try {
        localStorage.setItem(MY_LIST_KEY, JSON.stringify([...new Set(ids)]));
    } catch (e) {
        console.warn("[title] no se pudo guardar Mi Lista local:", e);
    }
}

function isInMyListLocal(movieId) { return getMyListIds().includes(movieId); }

function setLocalMyListMembership(movieId, added) {
    const ids = getMyListIds();
    const exists = ids.includes(movieId);

    let next = ids;
    if (added && !exists) next = [...ids, movieId];
    if (!added && exists) next = ids.filter(id => id !== movieId);

    saveMyListIds(next);
    return added;
}

function toggleMyListLocal(movieId) {
    const ids = getMyListIds();
    const exists = ids.includes(movieId);

    const next = exists ? ids.filter(id => id !== movieId) : [...ids, movieId];
    saveMyListIds(next);
    return !exists;
}

function setMyListBtnState(btn, movieId, opts = {}) {
    if (!btn || !movieId) return;

    const { added = false, pending = false, source = "unknown" } = opts;

    btn.classList.remove("hidden");
    btn.setAttribute("type", "button");
    btn.setAttribute("aria-pressed", String(added));
    btn.setAttribute("aria-label", added ? "Quitar de Mi Lista" : "Agregar a Mi Lista");
    btn.classList.toggle("is-active", !!added);

    btn.dataset.myListState = added ? "in" : "out";
    btn.dataset.myListSource = source;
    btn.dataset.myListPending = pending ? "1" : "0";

    try { btn.disabled = !!pending; } catch { }

    const nextLabel = pending ? "Actualizando…" : (added ? "En Mi Lista" : "Mi Lista");
    const labelSpan = btn.querySelector("span");
    if (labelSpan) { labelSpan.textContent = nextLabel; return; }

    const textNode = [...btn.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0);
    if (textNode) textNode.textContent = ` ${nextLabel}`;
    else btn.appendChild(document.createTextNode(` ${nextLabel}`));
}

async function getMyListAuthContext() {
    try {
        const supabase = await getAppSupabaseClient();
        if (!supabase) return { supabase: null, profileId: null, isLoggedIn: false };

        const { data, error } = await supabase.auth.getUser();
        if (error) return { supabase, profileId: null, isLoggedIn: false, error };

        const profileId = data?.user?.id || null;
        return { supabase, profileId, isLoggedIn: !!profileId };
    } catch (e) {
        return { supabase: null, profileId: null, isLoggedIn: false, error: e };
    }
}

function buildMyListUrl(userId) {
    if (!userId) return "/mylist";
    const q = new URLSearchParams({ list: String(userId), user: String(userId) });
    return `/mylist?${q.toString()}`;
}

function ensureMyListNavLink(userId) {
    const topnav = document.getElementById("topnav");
    if (!topnav) return;

    const navLeft = topnav.querySelector(".nav-left");
    if (!navLeft) return;

    let link = topnav.querySelector("[data-mylist-nav='1']");
    if (!link) {
        link = document.createElement("a");
        link.className = "navlink";
        link.dataset.mylistNav = "1";
        link.textContent = "Mi Lista";
    }

    link.href = buildMyListUrl(userId);

    const navItems = [...navLeft.querySelectorAll("a, button")];
    const inicio = navItems.find((n) => {
        if (n === link) return false;
        const t = (n.textContent || "").trim().toLowerCase();
        return t === "inicio";
    });

    if (inicio && inicio.parentElement === navLeft) {
        if (inicio.nextSibling !== link) navLeft.insertBefore(link, inicio.nextSibling);
        else if (link.parentElement !== navLeft) navLeft.insertBefore(link, inicio.nextSibling);
    } else {
        if (link.parentElement !== navLeft) navLeft.appendChild(link);
    }
}

async function isInMyListSupabase({ supabase, profileId, contentId }) {
    if (!supabase || !profileId || !contentId) return false;

    const { data, error } = await supabase
        .from("my_list")
        .select("id")
        .eq("profile_id", profileId)
        .eq("content_id", contentId)
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return !!data;
}

async function addToMyListSupabase({ supabase, profileId, contentId }) {
    if (!supabase || !profileId || !contentId) throw new Error("Faltan supabase/profileId/contentId para addToMyListSupabase");

    const payload = { profile_id: profileId, content_id: contentId, added_at: new Date().toISOString() };
    const { error } = await supabase.from("my_list").upsert(payload, {
        onConflict: "profile_id,content_id",
        ignoreDuplicates: false
    });

    if (error) throw error;
    return true;
}

async function removeFromMyListSupabase({ supabase, profileId, contentId }) {
    if (!supabase || !profileId || !contentId) throw new Error("Faltan supabase/profileId/contentId para removeFromMyListSupabase");

    const { error } = await supabase.from("my_list").delete().eq("profile_id", profileId).eq("content_id", contentId);
    if (error) throw error;
    return true;
}

async function resolveMyListState(contentId) {
    const localAdded = isInMyListLocal(contentId);
    const ctx = await getMyListAuthContext();

    if (!ctx.supabase || !ctx.isLoggedIn || !ctx.profileId) {
        return { added: localAdded, source: "local", supabase: ctx.supabase || null, profileId: null, isLoggedIn: false };
    }

    try {
        const remoteAdded = await isInMyListSupabase({ supabase: ctx.supabase, profileId: ctx.profileId, contentId });
        setLocalMyListMembership(contentId, remoteAdded);
        return { added: remoteAdded, source: "supabase", supabase: ctx.supabase, profileId: ctx.profileId, isLoggedIn: true };
    } catch (e) {
        console.warn("[title] resolveMyListState remote error; uso local:", e);
        return { added: localAdded, source: "local", supabase: ctx.supabase, profileId: ctx.profileId, isLoggedIn: !!ctx.profileId, error: e };
    }
}

async function refreshMyListButtonState(btn, contentId) {
    if (!btn || !contentId) return;
    setMyListBtnState(btn, contentId, { added: isInMyListLocal(contentId), pending: true, source: "unknown" });
    const state = await resolveMyListState(contentId);
    setMyListBtnState(btn, contentId, { added: state.added, pending: false, source: state.source });
    return state;
}

async function bindMyListButton(btn, movie) {
    if (!btn || !movie?.id) return;

    btn.onclick = null;
    btn.dataset.myListMovieId = movie.id;

    await refreshMyListButtonState(btn, movie.id);

    if (btn.dataset.myListBound === "1") return;
    btn.dataset.myListBound = "1";

    btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        if (btn.dataset.myListPending === "1") return;

        const currentMovieId = btn.dataset.myListMovieId || movie.id;
        const currentVisualAdded = btn.dataset.myListState === "in";

        setMyListBtnState(btn, currentMovieId, {
            added: currentVisualAdded,
            pending: true,
            source: btn.dataset.myListSource || "unknown"
        });

        try {
            const state = await resolveMyListState(currentMovieId);

            if (state.source === "supabase" && state.supabase && state.profileId) {
                if (state.added) {
                    await removeFromMyListSupabase({ supabase: state.supabase, profileId: state.profileId, contentId: currentMovieId });
                    setLocalMyListMembership(currentMovieId, false);
                    setMyListBtnState(btn, currentMovieId, { added: false, pending: false, source: "supabase" });
                } else {
                    await addToMyListSupabase({ supabase: state.supabase, profileId: state.profileId, contentId: currentMovieId });
                    setLocalMyListMembership(currentMovieId, true);
                    setMyListBtnState(btn, currentMovieId, { added: true, pending: false, source: "supabase" });
                }
                return;
            }

            const added = toggleMyListLocal(currentMovieId);
            setMyListBtnState(btn, currentMovieId, { added, pending: false, source: "local" });
        } catch (e) {
            console.warn("[title] toggle Mi Lista error:", e);
            try { await refreshMyListButtonState(btn, currentMovieId); }
            catch { setMyListBtnState(btn, currentMovieId, { added: isInMyListLocal(currentMovieId), pending: false, source: "local" }); }
        }
    });
}

/* ===========================
   TE PODRÍA GUSTAR
=========================== */

function getMoreCardBadgeLabel(movie) {
    if (!movie) return "";

    const publishState = getMoviePublishState(movie);
    const customText = String(movie.publish_state_text || "").trim();

    if (publishState === "upcoming") return customText || "Próximamente";
    if (publishState === "other") return customText || "Otro";

    if (Boolean(movie.live_mode)) {
        const d = getLiveStartDate(movie);
        if (d) return `${formatLiveDateEs(d)} - ${formatLiveTimeEs(d)}`;
        if (publishState === "live") return "En Vivo";
    }

    if (publishState === "live") return "En Vivo";
    return "";
}

async function renderMoreCardHtml({ item, esc, api }) {
    const thumb = item.thumbnail_url || item.banner_url || "";
    const title = esc(shortenTitle(item.title || ""));
    const synopsis = esc(item.description || item.sinopsis || "");

    if (item.category === "series" && typeof api?.fetchEpisodes === "function") {
        try {
            const eps = await api.fetchEpisodes(item.id);
            item.__episodes_for_meta = Array.isArray(eps) ? eps : [];
        } catch {
            item.__episodes_for_meta = [];
        }
    }

    const meta = esc(getMoreMetaLine(item));
    const badgeLabel = getMoreCardBadgeLabel(item);

    return `
    <article class="episode-card more-card" tabindex="0" role="link" data-title="${esc(item.id)}">
      <div class="more-card-thumb-wrap">
        <img class="episode-thumb" src="${esc(thumb)}" alt="">
        ${badgeLabel ? `<div class="card-badge card-badge-upcoming">${esc(badgeLabel)}</div>` : ``}
      </div>
      <div class="episode-body">
        <h4 class="episode-title">${title}</h4>
        ${meta ? `<p class="episode-sub more-card-meta">${meta}</p>` : ``}
        ${synopsis ? `<p class="episode-sub more-card-synopsis">${synopsis}</p>` : ``}
      </div>
    </article>
  `;
}

function bindMoreCardNavigation(rootEl, itemsById = new Map()) {
    rootEl.querySelectorAll("[data-title]").forEach(card => {
        const go = async () => {
            const id = card.dataset.title;
            const item = itemsById.get(id);

            if (!id || !item) { window.location.href = `/title?title=${encodeURIComponent(id || "")}`; return; }

            try {
                const progress = await fetchContinueWatchingForTitle({ movieId: id });

                if (item.category === "series") {
                    if (progress?.episode_id) { window.location.href = `/watch?series=${encodeURIComponent(id)}&episode=${encodeURIComponent(progress.episode_id)}`; return; }
                    window.location.href = `/watch?series=${encodeURIComponent(id)}`; return;
                }

                window.location.href = `/watch?movie=${encodeURIComponent(id)}`;
            } catch {
                if (item.category === "series") { window.location.href = `/watch?series=${encodeURIComponent(id)}`; return; }
                window.location.href = `/watch?movie=${encodeURIComponent(id)}`;
            }
        };

        card.addEventListener("click", go);
        card.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); }
        });
    });
}

async function renderMoreSection({ api, esc, currentMovieId }) {
    const moreGrid = el("more-grid");
    const moreSection = el("more-section");
    if (!moreGrid || !moreSection) return;

    moreGrid.innerHTML = "";

    let list = [];
    try {
        if (typeof api.fetchMoreExcluding === "function") {
            list = await api.fetchMoreExcluding(currentMovieId, 24);
        } else if (typeof api.fetchLatest === "function") {
            const tmp = await api.fetchLatest(60);
            list = safeArray(tmp).filter(x => x?.id && x.id !== currentMovieId).slice(0, 24);
        }
    } catch (e) {
        console.warn("No se pudo cargar 'Te podría gustar':", e);
        list = [];
    }

    if (!list.length) { moreSection.classList.add("hidden"); return; }

    moreSection.classList.remove("hidden");

    const htmlParts = [];
    for (const item of list) htmlParts.push(await renderMoreCardHtml({ item, esc, api }));

    moreGrid.innerHTML = htmlParts.join("");

    const itemsById = new Map(list.filter(item => item?.id).map(item => [String(item.id), item]));
    bindMoreCardNavigation(moreGrid, itemsById);
    scheduleApplyCondensedFontToWrappedEpisodeTitles(moreGrid);
}

/* ===========================
   COLLECTION
   - NO crea #collection-section
   - Serie: se inserta debajo del bloque de episodios
   - Movie: se usa el bloque episodios para mostrar colección (solo colección)
=========================== */

function renderCollectionCardHtml({ item, esc }) {
    const thumb = item.thumbnail_url || item.banner_url || "";
    const synopsis = esc(item.description || item.sinopsis || "");

    return `
    <article class="episode-card" tabindex="0" role="link" data-title="${esc(item.id)}">
      <img class="episode-thumb" src="${esc(thumb)}" alt="">
      <div class="episode-body">
        <h4 class="episode-title">${esc(item.title || "")}</h4>
        <span class="episode-sub">${synopsis}</span>
      </div>
    </article>
  `;
}

function bindCollectionCardNavigation(rootEl, itemsById = new Map()) {
    rootEl.querySelectorAll("[data-title]").forEach(card => {
        const go = () => {
            const id = card.dataset.title;
            const item = itemsById.get(String(id));

            if (!id || !item) { window.location.href = `/title?title=${encodeURIComponent(id || "")}`; return; }

            const params = new URLSearchParams();
            if (item.collection_id) params.set("collection", item.collection_id);
            params.set("title", item.id);

            window.location.href = `/title?${params.toString()}`;
        };

        card.addEventListener("click", go);
        card.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); }
        });
    });
}

async function fetchCollectionItems({ api, collectionId, currentMovieId }) {
    let items = [];
    try {
        if (typeof api.fetchCollection === "function") {
            items = await api.fetchCollection(collectionId, 200);
        } else {
            console.warn("[title] api.fetchCollection no existe");
            items = [];
        }
    } catch (e) {
        console.warn("[title] no se pudo cargar colección:", e);
        items = [];
    }

    return safeArray(items).filter(
        (item) => item?.id && String(item.id) !== String(currentMovieId)
    );
}

function renderCollectionItemsIntoGrid(gridEl, items, esc) {
    if (!gridEl) return;

    if (!items.length) {
        gridEl.innerHTML = `<div class="muted">No hay contenido cargado en esta colección.</div>`;
        return;
    }

    gridEl.innerHTML = items.map((item) => renderCollectionCardHtml({ item, esc })).join("");

    const itemsById = new Map(items.filter(item => item?.id).map(item => [String(item.id), item]));
    bindCollectionCardNavigation(gridEl, itemsById);
    scheduleApplyCondensedFontToWrappedEpisodeTitles(gridEl);
}

/**
 * Movie/No-series: renderiza colección dentro del bloque de episodios (reemplaza contenido).
 */
async function renderCollectionInEpisodesBlock({ api, esc, collectionId, currentMovieId }) {
    const episodesSection = el("episodes-section");
    const episodesTitle = el("episodes-title");
    const seasonFilter = el("season-filter");
    const episodesGrid = el("episodes-grid");

    if (!episodesSection || !episodesTitle || !seasonFilter || !episodesGrid) return true;

    episodesSection.classList.remove("hidden");
    episodesTitle.textContent = "Colección completa";
    seasonFilter.classList.add("hidden");
    seasonFilter.innerHTML = "";
    episodesGrid.classList.remove("hidden");

    // limpiar colección inline previa si existía
    clearInlineCollectionTail(episodesSection);

    const items = await fetchCollectionItems({ api, collectionId, currentMovieId });
    renderCollectionItemsIntoGrid(episodesGrid, items, esc);

    return true;
}

/**
 * Serie: agrega colección debajo del bloque de episodios (sin IDs nuevos).
 * Inserta dentro del mismo #episodes-section.
 */
function clearInlineCollectionTail(episodesSection) {
    if (!episodesSection) return;
    episodesSection.querySelectorAll("[data-inline-collection='1']").forEach(n => n.remove());
}

async function renderCollectionInlineAfterEpisodes({ api, esc, collectionId, currentMovieId }) {
    const episodesSection = el("episodes-section");
    const episodesTitle = el("episodes-title");
    if (!episodesSection) return false;

    clearInlineCollectionTail(episodesSection);

    const head = document.createElement("div");
    head.className = "episodes-head";
    head.dataset.inlineCollection = "1";

    const h2 = document.createElement("h2");
    // copiar el look del título de episodios sin duplicar IDs
    h2.className = (episodesTitle?.className || "");
    h2.textContent = "Colección completa";

    head.appendChild(h2);

    const grid = document.createElement("div");
    grid.className = "episodes-grid";
    grid.dataset.inlineCollection = "1";

    episodesSection.appendChild(head);
    episodesSection.appendChild(grid);

    const items = await fetchCollectionItems({ api, collectionId, currentMovieId });
    renderCollectionItemsIntoGrid(grid, items, esc);
    return true;
}

/* ===========================
   Seasons UI (dropdown)
=========================== */

function clearSeasonClasses(gridEl) {
    if (!gridEl) return;
    [...gridEl.classList].forEach((c) => {
        if (c.startsWith("episodes-grid-s")) gridEl.classList.remove(c);
    });
}

function setSeasonClass(gridEl, seasonNum) {
    if (!gridEl) return;
    clearSeasonClasses(gridEl);
    gridEl.classList.add(`episodes-grid-s${String(seasonNum).replace(/[^\w-]/g, "_")}`);
}

function createSeasonTitleNode(seasonNum, count) {
    const t = document.createElement("div");
    t.dataset.generated = "1";
    t.dataset.season = String(seasonNum);
    t.className = "season-title";
    t.textContent = `Temporada ${seasonNum}: ${count} ${plural(count, "episodio", "episodios")}`;
    return t;
}

function createSiblingGridForSeason(seasonNum) {
    const g = document.createElement("div");
    g.className = `episodes-grid episodes-grid-s${String(seasonNum).replace(/[^\w-]/g, "_")}`;
    g.dataset.generated = "1";
    g.dataset.season = String(seasonNum);
    return g;
}

function removeGeneratedAllNodes(episodesGrid) {
    const parent = episodesGrid?.parentElement;
    if (!parent) return;
    parent.querySelectorAll("[data-generated='1']").forEach(n => n.remove());
}

function closeSeasonDropdown(seasonFilter) {
    const menu = seasonFilter?.querySelector(".dropdown-menu");
    const btn = seasonFilter?.querySelector(".dropdown-btn");
    if (menu) menu.classList.add("hidden");
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (seasonFilter) seasonFilter.dataset.open = "0";
}

function openSeasonDropdown(seasonFilter) {
    const menu = seasonFilter?.querySelector(".dropdown-menu");
    const btn = seasonFilter?.querySelector(".dropdown-btn");
    if (menu) menu.classList.remove("hidden");
    if (btn) btn.setAttribute("aria-expanded", "true");
    if (seasonFilter) seasonFilter.dataset.open = "1";
}

function isSeasonDropdownOpen(seasonFilter) {
    return seasonFilter?.dataset.open === "1";
}

function toggleSeasonDropdown(seasonFilter) {
    if (isSeasonDropdownOpen(seasonFilter)) closeSeasonDropdown(seasonFilter);
    else openSeasonDropdown(seasonFilter);
}

function buildSeasonDropdown({ seasonFilter, seasons, getCurrentSeason, onSeasonChange }) {
    if (!seasonFilter) return;

    seasonFilter.classList.remove("hidden");
    seasonFilter.dataset.open = "0";

    seasonFilter.innerHTML = `
    <div class="dropdown">
      <button type="button" class="dropdown-btn" aria-haspopup="listbox" aria-expanded="false">
        <span class="dropdown-label"></span>
        <span class="dropdown-caret" aria-hidden="true">▾</span>
      </button>
      <div class="dropdown-menu hidden" role="listbox"></div>
    </div>
  `;

    const btn = seasonFilter.querySelector(".dropdown-btn");
    const label = seasonFilter.querySelector(".dropdown-label");
    const menu = seasonFilter.querySelector(".dropdown-menu");

    function syncLabel() {
        if (!label) return;
        label.textContent = `Temporada ${getCurrentSeason()}`;
    }

    function renderMenu() {
        if (!menu) return;

        menu.innerHTML = seasons.map((season) => {
            const active = String(season) === String(getCurrentSeason());
            return `
        <button
          type="button"
          class="dropdown-item${active ? " is-active" : ""}"
          data-season="${String(season)}"
          role="option"
          aria-selected="${active ? "true" : "false"}"
        >
          Temporada ${season}
        </button>
      `;
        }).join("");

        menu.querySelectorAll("[data-season]").forEach((itemBtn) => {
            itemBtn.addEventListener("click", () => {
                const nextSeason = itemBtn.dataset.season;
                onSeasonChange(nextSeason);
                syncLabel();
                renderMenu();
                closeSeasonDropdown(seasonFilter);
            });
        });
    }

    btn?.addEventListener("click", (ev) => {
        ev.preventDefault();
        toggleSeasonDropdown(seasonFilter);
    });

    document.addEventListener("click", (ev) => {
        if (!seasonFilter.contains(ev.target)) closeSeasonDropdown(seasonFilter);
    });

    btn?.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") {
            closeSeasonDropdown(seasonFilter);
            btn.blur();
        }
    });

    syncLabel();
    renderMenu();
}

/* ===========================
   Render seasons
=========================== */

function renderSeasonIntoMainGrid({ episodesGrid, episodes, movie, esc, episodeProgressMap }) {
    setSeasonClass(episodesGrid, movie?.season ?? 1);

    episodesGrid.innerHTML = safeArray(episodes).map((ep) =>
        renderEpisodeCardHtml({
            ep,
            fallbackThumb: movie?.thumbnail_url || movie?.banner_url || "",
            esc,
            progressMap: episodeProgressMap
        })
    ).join("");

    bindEpisodeCardNavigation(episodesGrid, movie.id);
    scheduleApplyCondensedFontToWrappedEpisodeTitles(episodesGrid);
}

function renderAllSeasonsStacked({ episodesGrid, grouped, movie, esc, episodeProgressMap }) {
    removeGeneratedAllNodes(episodesGrid);
    clearSeasonClasses(episodesGrid);

    if (!grouped.length) {
        episodesGrid.innerHTML = `<div class="muted">No hay episodios cargados.</div>`;
        return;
    }

    const [firstSeason, firstList] = grouped[0];

    setSeasonClass(episodesGrid, firstSeason);
    episodesGrid.innerHTML = firstList.map((ep) =>
        renderEpisodeCardHtml({
            ep,
            fallbackThumb: movie?.thumbnail_url || movie?.banner_url || "",
            esc,
            progressMap: episodeProgressMap
        })
    ).join("");

    bindEpisodeCardNavigation(episodesGrid, movie.id);

    const parent = episodesGrid.parentElement;
    if (!parent) { scheduleApplyCondensedFontToWrappedEpisodeTitles(episodesGrid); return; }

    if (grouped.length) {
        const firstTitle = createSeasonTitleNode(firstSeason, firstList.length);
        parent.insertBefore(firstTitle, episodesGrid);
    }

    for (let i = 1; i < grouped.length; i += 1) {
        const [seasonNum, seasonEpisodes] = grouped[i];
        const titleNode = createSeasonTitleNode(seasonNum, seasonEpisodes.length);
        const grid = createSiblingGridForSeason(seasonNum);

        grid.innerHTML = seasonEpisodes.map((ep) =>
            renderEpisodeCardHtml({
                ep,
                fallbackThumb: movie?.thumbnail_url || movie?.banner_url || "",
                esc,
                progressMap: episodeProgressMap
            })
        ).join("");

        parent.appendChild(titleNode);
        parent.appendChild(grid);
        bindEpisodeCardNavigation(grid, movie.id);
    }

    scheduleApplyCondensedFontToWrappedEpisodeTitles(parent);
}

/* ===========================
   MAIN
=========================== */

async function main() {
    const movieId = qs("title") || qs("movie");
    const collectionId = qs("collection");

    applyAkiraVideoContainOverrideIfNeeded(resolveAkiraOverrideTargetId());
    await ensureSupabaseGlobal();

    const ui = await import("./ui.js");
    const api = await import("./api.js");

    ui.setAppName?.();
    ui.renderNav?.({ active: "home" });
    await ui.renderAuthButtons?.();
    ui.enableDataHrefNavigation?.();
    ui.applyDisguisedCssFromMovieId?.();

    try {
        const navCtx = await getMyListAuthContext();
        ensureMyListNavLink(navCtx?.profileId || null);
    } catch (e) {
        console.warn("[title] no se pudo preparar link Mi Lista en topnav:", e);
        ensureMyListNavLink(null);
    }

    if (!movieId || !isUuidLike(movieId)) { renderTitleNotFound(); return; }
    if (collectionId && !isUuidLike(collectionId)) { renderTitleNotFound(); return; }

    const esc = ui.escapeHtml;

    const hero = el("hero");
    const titleEl = el("t-title");
    const metaEl = el("t-meta");
    const sinopsisEl = el("t-sinopsis");
    const watchBtn = el("watch-btn");
    const trailerBtn = el("trailer-btn");
    const myListBtn = el("episodes-jump");

    const episodesSection = el("episodes-section");
    const episodesTitle = el("episodes-title");
    const seasonFilter = el("season-filter");
    const episodesGrid = el("episodes-grid");

    const extraEl = el("title-extra");

    let movie = null;
    try {
        movie = await api.fetchMovie(movieId);
    } catch (e) {
        console.warn("[title] fetchMovie error:", e);
        renderTitleNotFound();
        return;
    }

    if (!movie) { renderTitleNotFound(); return; }

    applyAkiraVideoContainOverrideIfNeeded(movie.id);

    let episodes = [];
    let episodeProgressMap = new Map();

    if (movie.category === "series" && typeof api.fetchEpisodes === "function") {
        try { episodes = await api.fetchEpisodes(movie.id); } catch { episodes = []; }
        try { episodeProgressMap = await fetchEpisodeProgressMapForTitle({ movieId: movie.id }); }
        catch { episodeProgressMap = new Map(); }
    }

    movie.__episodes_for_meta = episodes;

    document.title = `${movie.title || "Título"} · SATV+`;

    await bindMyListButton(myListBtn, movie);

    if (titleEl) titleEl.textContent = movie.title || "";
    if (sinopsisEl) sinopsisEl.textContent = movie.description || "";

    const banner = movie.banner_url || movie.thumbnail_url || "";
    if (hero && banner) hero.style.backgroundImage = `url("${banner}")`;

    mountTitleHeroTrailerVideo(hero, movie);
    if (trailerBtn) trailerBtn.classList.add("hidden");

    const publishState = getMoviePublishState(movie);
    const publishStateLabel = getMoviePublishStateLabel(movie);

    if (publishState === "upcoming") {
        setWatchBtnDisabledStatus(watchBtn, publishStateLabel);
    } else {
        const isUpcomingLiveCountdown = setWatchBtnLiveCountdown(watchBtn, movie);

        if (!isUpcomingLiveCountdown) {
            if (publishState === "live") setWatchBtnStatusClickable(watchBtn, movie, publishStateLabel);
            else setWatchBtnVerAhora(watchBtn, movie);

            try {
                const progress = await fetchContinueWatchingForTitle({ movieId: movie.id });
                if (progress) setWatchBtnReanudar(watchBtn, movie, progress);
            } catch (e) {
                console.warn("No se pudo leer watch_progress:", e);
            }
        }
    }

    const year = movie.release_year ? String(movie.release_year) : "";
    let right = "";

    if (movie.category === "series") {
        const counts = resolveSeriesCounts(movie, episodes);
        right = formatSeriesMetaFromCounts(counts);
    } else {
        right = formatDuration(movie.duration_minutes);
    }

    if (metaEl) metaEl.textContent = [year, right].filter(Boolean).join(" · ");

    await renderMoreSection({ api, esc, currentMovieId: movie.id });

    if (extraEl) {
        const mm = movie.movie_meta || null;
        const durText = movie.category === "movie" ? formatDuration(movie.duration_minutes) : "";
        const hasAny =
            !!mm?.created_by ||
            !!mm?.fullcast ||
            !!mm?.fullscript ||
            !!mm?.fullgenres ||
            !!mm?.fulltitletype ||
            !!mm?.fullage;

        extraEl.innerHTML = `
      <div class="title-extra-head">
        <h2 class="title-extra-title">Información completa</h2>
      </div>

      <div class="title-extra-card">
        ${durText ? row("Duración", durText, esc) : ""}
        ${row("Creado por", mm?.created_by, esc)}
        ${row("Elenco", mm?.fullcast, esc)}
        ${row("Guion", mm?.fullscript, esc)}
        ${row("Géneros", mm?.fullgenres, esc)}
        ${row("Tipo", mm?.fulltitletype, esc)}
        ${row("Edad", mm?.fullage, esc)}
        ${hasAny ? "" : `<div class="title-extra-value">Sin información cargada todavía.</div>`}
      </div>
    `;
        extraEl.classList.remove("hidden");
    }

    if (!episodesSection || !episodesTitle || !seasonFilter || !episodesGrid) return;

    // limpiar cualquier collection inline vieja al entrar
    clearInlineCollectionTail(episodesSection);

    // MOVIE / NO SERIES
    if (movie.category !== "series") {
        if (collectionId) {
            await renderCollectionInEpisodesBlock({ api, esc, collectionId, currentMovieId: movie.id });
        } else {
            episodesSection.classList.add("hidden");
        }
        return;
    }

    // SERIES: EPISODIOS primero
    episodesSection.classList.remove("hidden");
    episodesTitle.textContent = "Episodios";
    seasonFilter.classList.remove("hidden");
    episodesGrid.classList.remove("hidden");

    if (!episodes?.length) {
        episodesGrid.innerHTML = `<div class="muted">No hay episodios cargados.</div>`;

        // aún si no hay episodios, si hay collection => abajo mostramos colección
        if (collectionId) {
            await renderCollectionInlineAfterEpisodes({ api, esc, collectionId, currentMovieId: movie.id });
        }
        return;
    }

    const grouped = groupBySeason(episodes);
    const seasons = grouped.map(([s]) => s);
    let currentSeason = clampSeason(seasons, seasons[0]);

    function getEpisodesForSeason(seasonValue) {
        const found = grouped.find(([s]) => String(s) === String(seasonValue));
        return found ? found[1] : [];
    }

    function renderCurrentSeason() {
        removeGeneratedAllNodes(episodesGrid);

        const list = getEpisodesForSeason(currentSeason);
        const normalizedMovie = { ...movie, season: currentSeason };

        if (!list.length) {
            clearSeasonClasses(episodesGrid);
            episodesGrid.innerHTML = `<div class="muted">No hay episodios cargados para esta temporada.</div>`;
            return;
        }

        renderSeasonIntoMainGrid({
            episodesGrid,
            episodes: list,
            movie: normalizedMovie,
            esc,
            episodeProgressMap
        });
    }

    function renderSingleOrMultiSeasonUI() {
        if (seasons.length <= 1) {
            seasonFilter.classList.add("hidden");
            seasonFilter.innerHTML = "";

            renderAllSeasonsStacked({
                episodesGrid,
                grouped,
                movie,
                esc,
                episodeProgressMap
            });

            return;
        }

        buildSeasonDropdown({
            seasonFilter,
            seasons,
            getCurrentSeason: () => currentSeason,
            onSeasonChange: (nextSeason) => {
                currentSeason = clampSeason(seasons, nextSeason);
                renderCurrentSeason();
            }
        });

        renderCurrentSeason();
    }

    renderSingleOrMultiSeasonUI();

    // SERIES: COLECCIÓN abajo (si existe)
    if (collectionId) {
        await renderCollectionInlineAfterEpisodes({ api, esc, collectionId, currentMovieId: movie.id });
    }

    if (myListBtn) {
        myListBtn.addEventListener("dblclick", (ev) => {
            ev.preventDefault();
            scrollToEpisodes();
        });
    }
}

main().catch((err) => {
    console.error("[title] fatal error:", err);
    renderTitleNotFound();
});