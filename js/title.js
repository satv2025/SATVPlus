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

function plural(n, one, many) { return n === 1 ? one : many; }

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
   PUBLISH STATE (movies.publish_state)
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
   SERIES COUNTS (robusto desde episodes)
=========================== */

function deriveSeriesCountsFromEpisodes(episodes) {
    const list = Array.isArray(episodes) ? episodes : [];

    const seasonSet = new Set();
    let episodesCount = 0;

    for (const ep of list) {
        episodesCount += 1;

        const seasonRaw = ep?.season;
        if (seasonRaw !== null && seasonRaw !== undefined && seasonRaw !== "") {
            seasonSet.add(String(seasonRaw));
        }
    }

    return {
        seasonsCount: seasonSet.size,
        episodesCount
    };
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

    return {
        seasonsCount,
        episodesCount
    };
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
   TE PODRÍA GUSTAR: helpers
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

function pickEpisodeThumb(ep) {
    return ep?.["thumbnails-episode"] || ep?.thumb || "";
}

function groupBySeason(episodes) {
    const map = new Map();

    for (const ep of episodes || []) {
        const seasonValue = ep?.season;
        const s = (seasonValue !== null && seasonValue !== undefined) ? seasonValue : 1;

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
   Episode progress helpers
=========================== */

function clampProgressPercent(progressSeconds, durationSeconds) {
    const progress = Number(progressSeconds || 0);
    const duration = Number(durationSeconds || 0);

    if (!Number.isFinite(progress) || !Number.isFinite(duration) || duration <= 0) {
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
            console.warn("[title] supabaseClient.js no devolvió supabase (episode progress map)");
            return new Map();
        }

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) {
            console.warn("[title] getUser error (episode progress map):", userErr);
            return new Map();
        }

        const userId = userData?.user?.id;
        if (!userId) {
            console.log("[title] sin sesión activa (episode progress map)");
            return new Map();
        }

        const { data, error } = await supabase
            .from("watch_progress")
            .select(`
                episode_id,
                progress_seconds,
                duration_seconds,
                updated_at
            `)
            .eq("user_id", userId)
            .eq("movie_id", movieId)
            .not("episode_id", "is", null)
            .gt("progress_seconds", 0)
            .order("updated_at", { ascending: false });

        if (error) {
            console.warn("[title] watch_progress map query error:", error);
            return new Map();
        }

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

        console.log("[title] progress map episodios:", map);
        return map;
    } catch (e) {
        console.warn("[title] fetchEpisodeProgressMapForTitle error:", e);
        return new Map();
    }
}

/** Card HTML (episodes) */
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
    <article class="episode-card" tabindex="0" role="link" data-episode="${ep.id}">
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

/** Bind navigation (episodes) */
function bindEpisodeCardNavigation(rootEl, movieId) {
    rootEl.querySelectorAll(".episode-card").forEach(card => {
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
   WATCH BUTTON: Reproducir / Reanudar / Countdown Live / Status
=========================== */

let __liveCountdownTimer = null;
const LIVE_DISPLAY_TIMEZONE = "America/Argentina/Buenos_Aires";

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

    const tag = (hasSeason && hasEpisode)
        ? `T${Number(season)}E${Number(epNum)}`
        : "";

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
    watchBtn.setAttribute("aria-label", label || "Ver más");
    watchBtn.innerHTML = `${label || "Ver más"}`;
}

function setWatchBtnCountdown(watchBtn, movie, startDate) {
    if (!watchBtn || !movie?.id || !(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return;

    clearLiveCountdownTimer();
    ensureWatchBtnCountdownBlocker(watchBtn);

    watchBtn.href = "#";
    watchBtn.dataset.mode = "countdown";
    watchBtn.setAttribute("aria-disabled", "true");

    const baseLabel = `Disponible el ${formatLiveDateEs(startDate)} a las ${formatLiveTimeEs(startDate)}`;

    const render = () => {
        const diff = startDate.getTime() - Date.now();

        if (diff <= 0) {
            setWatchBtnVerAhora(watchBtn, movie);
            return;
        }

        watchBtn.setAttribute("aria-label", baseLabel);
        watchBtn.innerHTML = `${baseLabel} · ${formatCountdown(diff)}`;
    };

    render();
    __liveCountdownTimer = setInterval(render, 1000);
}

function resolveMovieCurrentStatus(movie) {
    const state = getMoviePublishState(movie);

    if (Boolean(movie?.live_mode)) {
        const startDate = getLiveStartDate(movie);
        if (startDate && startDate.getTime() > Date.now()) {
            return { kind: "countdown", startDate };
        }
        return { kind: "play" };
    }

    if (state === "upcoming") {
        const startDate = getLiveStartDate(movie);
        if (startDate && startDate.getTime() > Date.now()) {
            return { kind: "countdown", startDate };
        }
        return { kind: "disabled", label: String(movie?.publish_state_text || "").trim() || "Próximamente" };
    }

    if (state === "other") {
        return { kind: "status-clickable", label: String(movie?.publish_state_text || "").trim() || "Ver más" };
    }

    if (state === "live") {
        const startDate = getLiveStartDate(movie);
        if (startDate && startDate.getTime() > Date.now()) {
            return { kind: "countdown", startDate };
        }
        return { kind: "play" };
    }

    return { kind: "play" };
}

function applyWatchButtonState(watchBtn, movie, progressRow = null) {
    if (!watchBtn || !movie) return;

    const status = resolveMovieCurrentStatus(movie);

    if (progressRow && status.kind === "play") {
        setWatchBtnReanudar(watchBtn, movie, progressRow);
        return;
    }

    if (status.kind === "countdown") {
        setWatchBtnCountdown(watchBtn, movie, status.startDate);
        return;
    }

    if (status.kind === "disabled") {
        setWatchBtnDisabledStatus(watchBtn, status.label);
        return;
    }

    if (status.kind === "status-clickable") {
        setWatchBtnStatusClickable(watchBtn, movie, status.label);
        return;
    }

    setWatchBtnVerAhora(watchBtn, movie);
}

/* ===========================
   "Mi Lista" en title hero (botón secundario)
=========================== */

const MY_LIST_KEY = "satv_my_list_ids";
let __myListSupabaseClientPromise = null;
let __myListAuthContextPromise = null;

function getMyListIdsLocal() {
    try {
        const raw = localStorage.getItem(MY_LIST_KEY);
        const arr = JSON.parse(raw || "[]");
        return Array.isArray(arr) ? [...new Set(arr.filter(Boolean).map(String))] : [];
    } catch {
        return [];
    }
}

function saveMyListIdsLocal(ids) {
    try {
        localStorage.setItem(
            MY_LIST_KEY,
            JSON.stringify([...new Set((ids || []).filter(Boolean).map(String))])
        );
    } catch (e) {
        console.warn("[title] no se pudo guardar Mi Lista local:", e);
    }
}

function isInMyListLocal(contentId) {
    return getMyListIdsLocal().includes(String(contentId));
}

function setLocalMyListMembership(contentId, added) {
    const id = String(contentId);
    const ids = getMyListIdsLocal();
    const exists = ids.includes(id);

    let next = ids;
    if (added && !exists) next = [...ids, id];
    if (!added && exists) next = ids.filter((x) => x !== id);

    saveMyListIdsLocal(next);
    return added;
}

async function getAppSupabaseClient() {
    if (__myListSupabaseClientPromise) return __myListSupabaseClientPromise;

    __myListSupabaseClientPromise = (async () => {
        try {
            const mod = await import("./supabaseClient.js");
            if (mod?.supabase) return mod.supabase;
        } catch (e) {
            console.warn("[title] import supabaseClient.js falló:", e);
        }

        return null;
    })();

    return __myListSupabaseClientPromise;
}

async function getMyListAuthContext() {
    if (__myListAuthContextPromise) return __myListAuthContextPromise;

    __myListAuthContextPromise = (async () => {
        const supabase = await getAppSupabaseClient();
        if (!supabase) return { supabase: null, profileId: null };

        try {
            const { data, error } = await supabase.auth.getUser();
            if (error) {
                console.warn("[title] auth.getUser error:", error);
                return { supabase, profileId: null, error };
            }

            const profileId = data?.user?.id || null;
            return { supabase, profileId };
        } catch (e) {
            console.warn("[title] auth.getUser exception:", e);
            return { supabase, profileId: null, error: e };
        }
    })();

    return __myListAuthContextPromise;
}

function buildMyListUrl(userId) {
    return userId
        ? `/my-list?profile=${encodeURIComponent(userId)}`
        : "/my-list";
}

function ensureMyListNavLink(userId) {
    const navLeft = document.querySelector("#topnav .nav-left");
    if (!navLeft) return;

    let link = navLeft.querySelector("[data-mylist-nav='1']");
    if (!link) {
        link = document.createElement("a");
        link.className = "navlink";
        link.dataset.mylistNav = "1";
        link.textContent = "Mi Lista";
        navLeft.appendChild(link);
    }

    link.href = buildMyListUrl(userId);
}

async function isInMyListRemote(profileId, contentId) {
    if (!profileId || !contentId) return false;

    const { supabase } = await getMyListAuthContext();
    if (!supabase) throw new Error("Supabase no disponible");

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

async function addToMyListRemote(profileId, contentId) {
    const { supabase } = await getMyListAuthContext();
    if (!supabase) throw new Error("Supabase no disponible");

    const payload = {
        profile_id: profileId,
        content_id: contentId,
        added_at: new Date().toISOString()
    };

    const { error } = await supabase
        .from("my_list")
        .upsert(payload, {
            onConflict: "profile_id,content_id",
            ignoreDuplicates: false
        });

    if (error) throw error;
    return true;
}

async function removeFromMyListRemote(profileId, contentId) {
    const { supabase } = await getMyListAuthContext();
    if (!supabase) throw new Error("Supabase no disponible");

    const { error } = await supabase
        .from("my_list")
        .delete()
        .eq("profile_id", profileId)
        .eq("content_id", contentId);

    if (error) throw error;
    return true;
}

async function resolveMyListState(contentId) {
    const localAdded = isInMyListLocal(contentId);
    const ctx = await getMyListAuthContext();
    const profileId = ctx?.profileId || null;

    if (!profileId) {
        return { added: localAdded, source: "local", isLoggedIn: false };
    }

    try {
        const remoteAdded = await isInMyListRemote(profileId, contentId);
        setLocalMyListMembership(contentId, remoteAdded);
        return { added: remoteAdded, source: "supabase", isLoggedIn: true, profileId };
    } catch (e) {
        console.warn("[title] resolveMyListState remote error; uso local:", e);
        return { added: localAdded, source: "local", isLoggedIn: true, profileId, error: e };
    }
}

function setMyListBtnState(btn, { contentId, added = false, pending = false } = {}) {
    if (!btn || !contentId) return;

    btn.dataset.myListContentId = String(contentId);
    btn.dataset.myListState = added ? "in" : "out";
    btn.dataset.myListPending = pending ? "1" : "0";

    btn.classList.toggle("is-added", !!added);
    btn.classList.toggle("is-pending", !!pending);
    btn.setAttribute("aria-pressed", String(!!added));
    btn.disabled = !!pending;
    btn.innerHTML = added ? "✓ Mi Lista" : "+ Mi Lista";
}

async function bindMyListButton(btn, movie) {
    if (!btn || !movie?.id) return;

    const contentId = String(movie.id);
    btn.hidden = false;

    const initial = await resolveMyListState(contentId);
    setMyListBtnState(btn, {
        contentId,
        added: !!initial?.added,
        pending: false
    });

    btn.onclick = async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const currentAdded = btn.dataset.myListState === "in";
        setMyListBtnState(btn, { contentId, added: currentAdded, pending: true });

        const ctx = await getMyListAuthContext();
        const profileId = ctx?.profileId || null;

        try {
            let nextAdded;

            if (!profileId) {
                nextAdded = setLocalMyListMembership(contentId, !currentAdded);
            } else {
                if (currentAdded) {
                    await removeFromMyListRemote(profileId, contentId);
                    nextAdded = false;
                } else {
                    await addToMyListRemote(profileId, contentId);
                    nextAdded = true;
                }
                setLocalMyListMembership(contentId, nextAdded);
            }

            setMyListBtnState(btn, { contentId, added: nextAdded, pending: false });
        } catch (e) {
            console.warn("[title] toggle my_list error:", e);
            setMyListBtnState(btn, { contentId, added: currentAdded, pending: false });
        }
    };
}

/* ===========================
   Watch progress (movie / series)
=========================== */

async function fetchWatchProgressForTitle(movieId) {
    if (!movieId) return null;

    try {
        const supabase = await getAppSupabaseClient();
        if (!supabase) {
            console.warn("[title] supabaseClient.js no devolvió supabase");
            return null;
        }

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) {
            console.warn("[title] getUser error:", userErr);
            return null;
        }

        const userId = userData?.user?.id;
        if (!userId) {
            console.log("[title] sin sesión activa para progress");
            return null;
        }

        const selectWithEpisodeFields = `
            id,
            user_id,
            movie_id,
            episode_id,
            progress_seconds,
            duration_seconds,
            updated_at,
            episodes:episodes!watch_progress_episode_id_fkey (
              id,
              title,
              season,
              episode_number
            )
        `;

        const selectFallback = `
            id,
            user_id,
            movie_id,
            episode_id,
            progress_seconds,
            updated_at,
            episodes:episodes!watch_progress_episode_id_fkey (
              id,
              title,
              season,
              episode_number
            )
        `;

        let { data, error } = await supabase
            .from("watch_progress")
            .select(selectWithEpisodeFields)
            .eq("user_id", userId)
            .eq("movie_id", movieId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error && String(error.message || "").toLowerCase().includes("duration_seconds")) {
            const retry = await supabase
                .from("watch_progress")
                .select(selectFallback)
                .eq("user_id", userId)
                .eq("movie_id", movieId)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            data = retry.data;
            error = retry.error;
        }

        if (error) {
            console.warn("[title] watch_progress query error:", error);
            return null;
        }

        console.log("[title] watch_progress row:", data);
        return data || null;
    } catch (e) {
        console.warn("[title] fetchWatchProgressForTitle error:", e);
        return null;
    }
}

/* ===========================
   Trailer button
=========================== */

function bindTrailerButton(btn, movie) {
    if (!btn) return;

    const trailer = String(movie?.trailer_url || "").trim();
    if (!trailer) {
        btn.hidden = true;
        return;
    }

    btn.hidden = false;
    btn.href = trailer;
    btn.target = "_blank";
    btn.rel = "noopener noreferrer";
}

/* ===========================
   Extra meta render
=========================== */

function renderExtraMeta(movie, episodes, esc) {
    const category = movie?.category === "series" ? "Serie" : "Película";
    const publishLabel = getMoviePublishStateLabel(movie);

    const mm = movie?.movie_meta || null;
    const counts = movie?.category === "series"
        ? resolveSeriesCounts(movie, episodes)
        : null;

    const year = movie?.release_year ? String(movie.release_year) : "";
    const duration = movie?.category === "movie"
        ? formatDuration(movie?.duration_minutes)
        : "";
    const seriesMeta = movie?.category === "series"
        ? formatSeriesMetaFromCounts(counts || { seasonsCount: 0, episodesCount: 0 })
        : "";

    const genres = String(mm?.fullgenres || "").trim();
    const cast = String(mm?.fullcast || "").trim();
    const creator = String(mm?.created_by || "").trim();
    const script = String(mm?.fullscript || "").trim();
    const titleType = String(mm?.fulltitletype || "").trim();
    const age = String(mm?.fullage || "").trim();

    return `
    ${row("Tipo", titleType || category, esc)}
    ${row("Estado", publishLabel, esc)}
    ${row("Año", year, esc)}
    ${row("Duración", duration, esc)}
    ${row("Serie", seriesMeta, esc)}
    ${row("Géneros", genres, esc)}
    ${row("Creado por", creator, esc)}
    ${row("Guion", script, esc)}
    ${row("Reparto", cast, esc)}
    ${row("Edad", age, esc)}
  `;
}

/* ===========================
   Render episodios
=========================== */

function renderSeasonFilter(seasonFilter, seasons, selectedSeason) {
    if (!seasonFilter) return;

    if (!seasons.length) {
        seasonFilter.innerHTML = "";
        seasonFilter.classList.add("hidden");
        return;
    }

    seasonFilter.classList.remove("hidden");
    seasonFilter.innerHTML = `
    <label for="season-select" class="season-filter-label">Temporada</label>
    <select id="season-select" class="season-select">
      ${seasons.map((s) => `<option value="${String(s)}" ${String(s) === String(selectedSeason) ? "selected" : ""}>Temporada ${s}</option>`).join("")}
    </select>
  `;
}

function renderEpisodesGrid({ episodesGrid, movie, grouped, selectedSeason, esc, progressMap }) {
    if (!episodesGrid) return;

    const list = grouped.get(selectedSeason) || [];
    const fallbackThumb = movie?.thumbnail_url || "";

    episodesGrid.innerHTML = list.map((ep) =>
        renderEpisodeCardHtml({
            ep,
            fallbackThumb,
            esc,
            progressMap
        })
    ).join("");

    bindEpisodeCardNavigation(episodesGrid, movie.id);
    scheduleApplyCondensedFontToWrappedEpisodeTitles(episodesGrid);
}

function renderCollectionGrid({ episodesGrid, list, ui }) {
    if (!episodesGrid) return;

    const html = (list || []).map((item) =>
        ui.cardHtml(item, null, null, null, {
            showCollectionOverlay: true
        })
    ).join("");

    episodesGrid.innerHTML = html || `<div class="empty-state">No hay contenido cargado en esta colección.</div>`;

    ui.enableDataHrefNavigation?.();
    scheduleApplyCondensedFontToWrappedEpisodeTitles(episodesGrid);
}

/* ===========================
   TE PODRÍA GUSTAR
=========================== */

async function renderMoreCardHtml({ item, esc, api }) {
    const href = `/title?${new URLSearchParams({
        ...(item?.collection_id ? { collection: item.collection_id } : {}),
        title: item.id
    }).toString()}`;

    const thumb = esc(item?.thumbnail_url || "");
    const title = esc(shortenTitle(item?.title || "Sin título"));
    const meta = esc(getMoreMetaLine(item));

    let badge = "";
    const state = getMoviePublishState(item);
    if (state !== "public") {
        badge = `<div class="card-badge card-badge-${state}">${esc(getMoviePublishStateLabel(item))}</div>`;
    }

    return `
    <article class="more-card" tabindex="0" role="link" data-title-id="${esc(item.id)}" data-href="${esc(href)}">
      <div class="more-thumb-wrap">
        <img class="more-thumb" src="${thumb}" alt="">
        ${badge}
      </div>
      <div class="more-copy">
        <div class="more-title">${title}</div>
        <div class="more-meta">${meta}</div>
      </div>
    </article>
  `;
}

function bindMoreCardNavigation(rootEl, itemsById) {
    rootEl.querySelectorAll(".more-card").forEach((card) => {
        const go = () => {
            const href = card.dataset.href;
            if (href) {
                window.location.href = href;
                return;
            }

            const id = card.dataset.titleId;
            const item = itemsById.get(String(id));
            if (!item?.id) return;

            const params = new URLSearchParams();
            if (item.collection_id) params.set("collection", item.collection_id);
            params.set("title", item.id);

            window.location.href = `/title?${params.toString()}`;
        };

        card.addEventListener("click", go);
        card.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                go();
            }
        });
    });
}

async function renderMoreLikeThis({ movie, moreGrid, esc, api }) {
    if (!moreGrid || !movie?.id) return;

    const raw = await api.fetchMoreExcluding(movie.id, 24);
    const list = (raw || []).slice(0, 24);

    if (!list.length) {
        moreGrid.innerHTML = "";
        return;
    }

    moreGrid.classList.remove("hidden");

    const htmlParts = [];
    for (const item of list) {
        htmlParts.push(await renderMoreCardHtml({ item, esc, api }));
    }

    moreGrid.innerHTML = htmlParts.join("");

    const itemsById = new Map(
        list
            .filter(item => item?.id)
            .map(item => [String(item.id), item])
    );

    bindMoreCardNavigation(moreGrid, itemsById);
    scheduleApplyCondensedFontToWrappedEpisodeTitles(moreGrid);
}

/* ===========================
   MAIN
=========================== */

async function main() {
    const movieId = qs("title") || qs("movie");
    const collectionId = qs("collection");

    if (!movieId) return;

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
    const moreGrid = el("more-grid");

    const movie = await api.fetchMovie(movieId);
    if (!movie) return;

    let episodes = [];
    let collectionItems = [];
    let episodeProgressMap = new Map();

    const isCollectionView = !!collectionId;

    if (isCollectionView && typeof api.fetchCollection === "function") {
        try {
            collectionItems = await api.fetchCollection(collectionId, 200);
            collectionItems = (collectionItems || []).filter((item) => String(item?.id) !== String(movie.id));
        } catch (e) {
            console.warn("[title] no se pudo cargar colección:", e);
            collectionItems = [];
        }
    }

    if (!isCollectionView && movie.category === "series" && typeof api.fetchEpisodes === "function") {
        try {
            episodes = await api.fetchEpisodes(movie.id);
        } catch (e) {
            console.warn("[title] no se pudieron cargar episodios para meta robusta:", e);
            episodes = [];
        }

        try {
            episodeProgressMap = await fetchEpisodeProgressMapForTitle({ movieId: movie.id });
        } catch (e) {
            console.warn("[title] no se pudo cargar progress map de episodios:", e);
            episodeProgressMap = new Map();
        }
    }

    movie.__episodes_for_meta = episodes;

    document.title = `${movie.title || "Título"} · SATV+`;

    await bindMyListButton(myListBtn, movie);

    const NIVELX_ID = "0acf7d27-5a80-4682-873a-760dd1ffdb51";
    document.body.classList.toggle("is-nivelx", movie.id === NIVELX_ID);

    if (titleEl) titleEl.textContent = movie.title || "";
    if (sinopsisEl) sinopsisEl.textContent = movie.description || "";

    const banner = movie.banner_url || movie.thumbnail_url || "";
    if (hero && banner) {
        hero.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,.12) 0%, rgba(0,0,0,.45) 45%, rgba(0,0,0,.92) 100%), url("${banner}")`;
    }

    const metaBits = [];
    if (movie.release_year) metaBits.push(String(movie.release_year));

    if (movie.category === "movie") {
        const dur = formatDuration(movie.duration_minutes);
        if (dur) metaBits.push(dur);
    } else if (movie.category === "series") {
        const sm = formatSeriesMeta(movie);
        if (sm) metaBits.push(sm);
    }

    if (metaEl) metaEl.textContent = metaBits.join(" · ");
    if (extraEl) extraEl.innerHTML = renderExtraMeta(movie, episodes, esc);

    bindTrailerButton(trailerBtn, movie);

    let progress = null;
    try {
        progress = await fetchWatchProgressForTitle(movie.id);
    } catch (e) {
        console.warn("[title] no se pudo cargar progress:", e);
    }

    applyWatchButtonState(watchBtn, movie, progress);

    if (episodesSection) episodesSection.classList.remove("hidden");

    if (isCollectionView) {
        if (episodesTitle) episodesTitle.textContent = "Colección completa";
        if (seasonFilter) {
            seasonFilter.innerHTML = "";
            seasonFilter.classList.add("hidden");
        }

        renderCollectionGrid({
            episodesGrid,
            list: collectionItems,
            ui
        });
    } else if (movie.category === "series" && episodes.length > 0) {
        if (episodesTitle) episodesTitle.textContent = "Episodios";

        const grouped = groupBySeason(episodes);
        const seasons = [...grouped.keys()];
        const selectedSeason = clampSeason(seasons, Number(qs("season")) || seasons[0]);

        renderSeasonFilter(seasonFilter, seasons, selectedSeason);
        renderEpisodesGrid({
            episodesGrid,
            movie,
            grouped,
            selectedSeason,
            esc,
            progressMap: episodeProgressMap
        });

        const seasonSelect = seasonFilter?.querySelector("#season-select");
        if (seasonSelect) {
            seasonSelect.addEventListener("change", () => {
                const season = clampSeason(seasons, Number(seasonSelect.value));
                renderEpisodesGrid({
                    episodesGrid,
                    movie,
                    grouped,
                    selectedSeason: season,
                    esc,
                    progressMap: episodeProgressMap
                });
            });
        }
    } else {
        if (episodesTitle) episodesTitle.textContent = "Contenido";
        if (seasonFilter) {
            seasonFilter.innerHTML = "";
            seasonFilter.classList.add("hidden");
        }
        if (episodesGrid) {
            episodesGrid.innerHTML = `<div class="empty-state">No hay episodios disponibles.</div>`;
        }
    }

    try {
        await renderMoreLikeThis({ movie, moreGrid, esc, api });
    } catch (e) {
        console.warn("[title] no se pudo renderizar 'Te podría gustar':", e);
    }
}

document.addEventListener("DOMContentLoaded", main);