// /js/title.js
// ✅ COMPLETO (sin recortes)
// ✅ Lee ?title=UUID (y soporta ?movie=UUID por compat)
// ✅ “Te podría gustar” navega a /title?title=UUID (no movie)
// ✅ <title>{título} · SATV+</title> vía document.title
// ✅ Meta “Te podría gustar”: {año} * {duración/temporadas/episodios}
// ✅ Recorte automático inteligente (sin listas manuales)

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

/* ===========================
   TE PODRÍA GUSTAR: helpers
   =========================== */

function shortenTitle(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";

    const m = s.match(/\s(?:-|—|:|\|)\s/);
    if (!m) return s.length > 40 ? s.slice(0, 40).trimEnd() + "…" : s;

    const idx = m.index ?? -1;
    if (idx <= 0) return s.length > 40 ? s.slice(0, 40).trimEnd() + "…" : s;

    const left = s.slice(0, idx).trim();
    const right = s.slice(idx + m[0].length).trim();

    const wordsLeft = left.split(/\s+/).filter(Boolean);
    const wordsRight = right.split(/\s+/).filter(Boolean);

    const leftLooksBrandish =
        wordsLeft.length <= 1 ||
        /[%0-9]/.test(left) ||
        /^[A-Z0-9%]+$/.test(left.replace(/\s+/g, ""));

    const rightLooksSubtitle = wordsRight.length >= 3;

    if (leftLooksBrandish || !rightLooksSubtitle) {
        return s.length > 40 ? s.slice(0, 40).trimEnd() + "…" : s;
    }

    const out = left;
    return out.length > 34 ? out.slice(0, 34).trimEnd() + "…" : out;
}

function formatSeriesMeta(movie) {
    const mm = movie.movie_meta || null;
    const sc = Number(mm?.seasons_count);
    const ec = Number(mm?.episodes_count);

    if (Number.isFinite(sc) && sc > 0) {
        if (sc === 1) return "1 temporada";
        return `${sc} temporadas`;
    }
    if (Number.isFinite(ec) && ec > 0) {
        return `${ec} ${plural(ec, "episodio", "episodios")}`;
    }
    return "Serie";
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
        const s = ep.season ?? 1;
        if (!map.has(s)) map.set(s, []);
        map.get(s).push(ep);
    }
    for (const [, list] of map) {
        list.sort((a, b) => (a.episode_number ?? 0) - (b.episode_number ?? 0));
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

function clampSeason(seasons, desired) {
    if (!seasons?.length) return 1;
    if (seasons.includes(desired)) return desired;
    return seasons[0];
}

function scrollToEpisodes() {
    const target = el("episodes-section");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Card HTML (episodes) */
function renderEpisodeCardHtml({ ep, fallbackThumb, esc }) {
    const thumb = pickEpisodeThumb(ep) || fallbackThumb;

    const s = ep.season ?? "";
    const n = ep.episode_number ?? "";

    const tag = (s && n) ? `T${s}E${n}` : (n ? `E${n}` : (s ? `T${s}` : ""));
    const epTitleText = tag ? `${tag} ${ep.title || ""}`.trim() : (ep.title || "");
    const epTitle = esc(epTitleText);

    return `
    <article class="episode-card" tabindex="0" role="link" data-episode="${ep.id}">
      <img class="episode-thumb" src="${esc(thumb)}" alt="">
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
   WATCH BUTTON: Ver ahora / Reanudar
   =========================== */

function setWatchBtnVerAhora(watchBtn, movie) {
    if (!watchBtn || !movie?.id) return;

    const isSeries = movie.category === "series";
    watchBtn.href = isSeries
        ? `/watch?series=${encodeURIComponent(movie.id)}`
        : `/watch?movie=${encodeURIComponent(movie.id)}`;

    watchBtn.setAttribute("aria-label", "Ver ahora");
    watchBtn.innerHTML = `Ver ahora <span aria-hidden="true">▶</span>`;
    watchBtn.dataset.mode = "now";
}

function setWatchBtnReanudar(watchBtn, movie, p) {
    if (!watchBtn || !movie?.id || !p) return;

    const isSeries = movie.category === "series";
    const ep = Array.isArray(p.episodes) ? (p.episodes[0] || null) : (p.episodes || null);

    const season = p.season ?? ep?.season ?? "";
    const epNum = p.episode_number ?? ep?.episode_number ?? "";
    const epTitle = p.episode_title ?? ep?.title ?? "";
    const elapsedSeconds = Number(p.progress_seconds ?? p.elapsed_seconds ?? p.elapsed ?? 0);
    const elapsed = formatElapsed(elapsedSeconds);

    const tag = (season && epNum)
        ? `T${String(season).padStart(2)}E${String(epNum).padStart(2)}`
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

/* ===========================
   Continue Watching (watch_progress)
   ✅ Usa supabaseClient.js real (mismo cliente que el resto)
   =========================== */

async function getAppSupabaseClient() {
    // Import dinámico para asegurarnos de que ya existe window.supabase (por ensureSupabaseGlobal)
    const mod = await import("./supabaseClient.js");
    return mod?.supabase || null;
}

async function fetchContinueWatchingForTitle({ movieId }) {
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
            console.log("[title] sin sesión activa");
            return null;
        }

        let { data, error } = await supabase
            .from("watch_progress")
            .select(`
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
            `)
            .eq("user_id", userId)
            .eq("movie_id", movieId)
            .gt("progress_seconds", 0)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        // fallback si duration_seconds todavía no existe
        if (error && String(error.message || "").toLowerCase().includes("duration_seconds")) {
            const retry = await supabase
                .from("watch_progress")
                .select(`
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

        if (error) {
            console.warn("[title] watch_progress query error:", error);
            return null;
        }

        if (!data) {
            console.log("[title] sin progreso previo para este título:", movieId);
            return null;
        }

        const progressSeconds = Number(data.progress_seconds || 0);
        if (!Number.isFinite(progressSeconds) || progressSeconds <= 0) {
            console.log("[title] progreso inválido:", data);
            return null;
        }

        const ep = Array.isArray(data.episodes) ? (data.episodes[0] || null) : (data.episodes || null);

        const out = {
            ...data,
            episodes: ep,
            season: ep?.season ?? null,
            episode_number: ep?.episode_number ?? null,
            episode_title: ep?.title ?? null,
            elapsed_seconds: progressSeconds
        };

        console.log("[title] progreso detectado:", out);
        return out;
    } catch (e) {
        console.warn("[title] fetchContinueWatchingForTitle error:", e);
        return null;
    }
}

/* ===========================
   TE PODRÍA GUSTAR (cards)
   =========================== */

function renderMoreCardHtml({ item, esc }) {
    const thumb = item.thumbnail_url || item.banner_url || "";
    const title = esc(shortenTitle(item.title || ""));
    const meta = esc(getMoreMetaLine(item));

    return `
    <article class="episode-card" tabindex="0" role="link" data-title="${esc(item.id)}">
      <img class="episode-thumb" src="${esc(thumb)}" alt="">
      <div class="episode-body">
        <h4 class="episode-title">${title}</h4>
        ${meta ? `<p class="episode-sub">${meta}</p>` : ``}
      </div>
    </article>
  `;
}

function bindMoreCardNavigation(rootEl) {
    rootEl.querySelectorAll("[data-title]").forEach(card => {
        const go = () => {
            const id = card.dataset.title;
            window.location.href = `/title?title=${encodeURIComponent(id)}`;
        };
        card.addEventListener("click", go);
        card.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); }
        });
    });
}

/**
 * Render More:
 * - Si existe api.fetchMoreExcluding -> lo usa
 * - Si no -> fallback api.fetchLatest y filtra la actual
 */
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
            list = (tmp || []).filter(x => x?.id && x.id !== currentMovieId).slice(0, 24);
        } else {
            list = [];
        }
    } catch (e) {
        console.warn("No se pudo cargar 'Te podría gustar':", e);
        list = [];
    }

    if (!list.length) {
        moreSection.classList.add("hidden");
        return;
    }

    moreSection.classList.remove("hidden");
    moreGrid.innerHTML = list.map(item => renderMoreCardHtml({ item, esc })).join("");
    bindMoreCardNavigation(moreGrid);
}

/* ===========================
   MAIN
   =========================== */

async function main() {
    const movieId = qs("title") || qs("movie");
    if (!movieId) return;

    await ensureSupabaseGlobal();

    const ui = await import("./ui.js");
    const api = await import("./api.js");

    ui.setAppName?.();
    ui.renderNav?.({ active: "home" });
    ui.renderAuthButtons?.();
    ui.enableDataHrefNavigation?.();
    ui.applyDisguisedCssFromMovieId?.();

    const esc = ui.escapeHtml;

    const hero = el("hero");
    const titleEl = el("t-title");
    const metaEl = el("t-meta");
    const sinopsisEl = el("t-sinopsis");
    const watchBtn = el("watch-btn");
    const trailerBtn = el("trailer-btn");
    const episodesJump = el("episodes-jump");

    const episodesSection = el("episodes-section");
    const episodesTitle = el("episodes-title");
    const seasonFilter = el("season-filter");
    const episodesGrid = el("episodes-grid");

    const extraEl = el("title-extra");

    const movie = await api.fetchMovie(movieId);
    if (!movie) return;

    document.title = `${movie.title || "Título"} · SATV+`;

    // Nivel X
    const NIVELX_ID = "0acf7d27-5a80-4682-873a-760dd1ffdb51";
    document.body.classList.toggle("is-nivelx", movie.id === NIVELX_ID);

    // HERO
    if (titleEl) titleEl.textContent = movie.title || "";
    if (sinopsisEl) sinopsisEl.textContent = movie.description || "";

    const banner = movie.banner_url || movie.thumbnail_url || "";
    if (hero && banner) hero.style.backgroundImage = `url("${banner}")`;

    if (trailerBtn) trailerBtn.classList.add("hidden");

    // WATCH BUTTON (Ver ahora / Reanudar)
    setWatchBtnVerAhora(watchBtn, movie);
    try {
        const progress = await fetchContinueWatchingForTitle({ movieId: movie.id });
        if (progress) setWatchBtnReanudar(watchBtn, movie, progress);
    } catch (e) {
        console.warn("No se pudo leer watch_progress:", e);
    }

    // META
    const year = movie.release_year ? String(movie.release_year) : "";
    let right = "";
    const mm = movie.movie_meta || null;

    if (movie.category === "series") {
        const seasonsCount = mm?.seasons_count ?? null;
        const epsCount = mm?.episodes_count ?? null;

        if (typeof seasonsCount === "number" && seasonsCount > 0) {
            right = `${seasonsCount} ${plural(seasonsCount, "temporada", "temporadas")}`;
        } else if (typeof epsCount === "number" && epsCount > 0) {
            right = `${epsCount} ${plural(epsCount, "episodio", "episodios")}`;
        }
    } else {
        right = formatDuration(movie.duration_minutes);
    }

    if (metaEl) metaEl.textContent = [year, right].filter(Boolean).join(" · ");

    // TE PODRÍA GUSTAR (antes de episodios)
    await renderMoreSection({ api, esc, currentMovieId: movie.id });

    // INFO FULL
    if (extraEl) {
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

    // EPISODES
    if (!episodesSection || !episodesTitle || !seasonFilter || !episodesGrid) return;

    if (movie.category !== "series") {
        episodesSection.classList.add("hidden");
        episodesJump?.classList.add("hidden");
        return;
    }

    episodesSection.classList.remove("hidden");
    episodesTitle.textContent = "Episodios";
    seasonFilter.classList.remove("hidden");
    episodesGrid.classList.remove("hidden");

    if (episodesJump) {
        episodesJump.classList.remove("hidden");
        episodesJump.onclick = scrollToEpisodes;
    }

    const episodes = await api.fetchEpisodes(movie.id);
    if (!episodes?.length) {
        episodesGrid.innerHTML = `<div class="muted">No hay episodios cargados.</div>`;
        return;
    }

    const grouped = groupBySeason(episodes);
    const seasons = grouped.map(([s]) => s);

    let currentSeason = clampSeason(seasons, seasons[0]); // number | "all"
    let dropdownOpen = false;

    function removeGeneratedAllNodes() {
        const parent = episodesGrid.parentElement;
        if (!parent) return;
        parent.querySelectorAll("[data-generated='1']").forEach(n => n.remove());
    }

    function clearSeasonClassOnFirstGrid() {
        episodesGrid.classList.forEach(c => {
            if (c.startsWith("episodes-grid-s")) episodesGrid.classList.remove(c);
        });
    }

    function setSeasonClassOnFirstGrid(seasonNum) {
        clearSeasonClassOnFirstGrid();
        episodesGrid.classList.add(`episodes-grid-s${seasonNum}`);
    }

    function createTitleNode(seasonNum, count) {
        const t = document.createElement("div");
        t.dataset.generated = "1";
        t.dataset.season = String(seasonNum);
        t.className = "season-title";
        t.textContent = `Temporada ${seasonNum}: ${count} ${plural(count, "episodio", "episodios")}`;
        return t;
    }

    function createSiblingGridForSeason(seasonNum) {
        const g = document.createElement("div");
        g.className = `episodes-grid episodes-grid-s${seasonNum}`;
        g.dataset.generated = "1";
        g.dataset.season = String(seasonNum);
        return g;
    }

    function closeDropdown() {
        dropdownOpen = false;
        const menu = seasonFilter.querySelector(".dropdown-menu");
        const btn = seasonFilter.querySelector(".dropdown-btn");
        if (menu) menu.classList.add("hidden");
        if (btn) btn.setAttribute("aria-expanded", "false");
    }

    function openDropdown() {
        dropdownOpen = true;
        const menu = seasonFilter.querySelector(".dropdown-menu");
        const btn = seasonFilter.querySelector(".dropdown-btn");
        if (menu) menu.classList.remove("hidden");
        if (btn) btn.setAttribute("aria-expanded", "true");
    }

    function toggleDropdown() {
        if (dropdownOpen) closeDropdown();
        else openDropdown();
    }

    function renderSeasonSelector() {
        seasonFilter.innerHTML = "";

        if (seasons.length === 1) {
            seasonFilter.innerHTML = `
        <div class="season-chip active" aria-current="true">
          Temporada ${seasons[0]}
        </div>
      `;
            return;
        }

        const currentLabel = (currentSeason === "all")
            ? "Todos los episodios"
            : `Temporada ${currentSeason}`;

        seasonFilter.innerHTML = `
      <div class="dropdown">
        <div class="dropdown-btn"
             role="button"
             tabindex="0"
             aria-haspopup="true"
             aria-expanded="false">
          ${esc(currentLabel)}
        </div>

        <div class="dropdown-menu hidden" role="menu">
          ${grouped.map(([s, list]) => `
            <div class="dropdown-item ${s === currentSeason ? "active" : ""}"
                 role="menuitem"
                 tabindex="0"
                 data-season="${s}">
              Temporada ${s}
              <span class="meta-dropitem">(${list.length} ${plural(list.length, "episodio", "episodios")})</span>
            </div>
          `).join("")}

          <div class="separator" aria-hidden="true"></div>

          <div class="dropdown-item dropdown-all ${currentSeason === "all" ? "active" : ""}"
               role="menuitem"
               tabindex="0"
               data-action="all">
            Ver todos los episodios
          </div>
        </div>
      </div>
    `;

        const btn = seasonFilter.querySelector(".dropdown-btn");
        if (btn) {
            btn.addEventListener("click", (e) => { e.preventDefault?.(); e.stopPropagation(); toggleDropdown(); });
            btn.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); toggleDropdown(); }
            });
        }

        seasonFilter.querySelectorAll(".dropdown-item").forEach(item => {
            const pick = (e) => {
                e.preventDefault?.();
                e.stopPropagation();

                const action = item.dataset.action;
                if (action === "all") {
                    currentSeason = "all";
                    renderSeasonSelector();
                    renderEpisodesGrid();
                    closeDropdown();
                    return;
                }

                const s = Number(item.dataset.season);
                if (Number.isFinite(s)) {
                    currentSeason = s;
                    renderSeasonSelector();
                    renderEpisodesGrid();
                    closeDropdown();
                }
            };

            item.addEventListener("click", pick);
            item.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); pick(ev); }
            });
        });
    }

    function renderEpisodesGrid() {
        const fallbackThumb = movie.thumbnail_url || movie.banner_url || "";
        const parent = episodesGrid.parentElement;
        if (!parent) return;

        removeGeneratedAllNodes();

        if (currentSeason === "all") {
            grouped.forEach(([s, list], idx) => {
                const titleNode = createTitleNode(s, list.length);
                const html = list.map(ep => renderEpisodeCardHtml({ ep, fallbackThumb, esc })).join("");

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
            return;
        }

        setSeasonClassOnFirstGrid(currentSeason);

        const list = grouped.find(([s]) => s === currentSeason)?.[1] || [];
        episodesGrid.innerHTML = list.map(ep => renderEpisodeCardHtml({ ep, fallbackThumb, esc })).join("");

        bindEpisodeCardNavigation(episodesGrid, movie.id);
    }

    document.addEventListener("click", (ev) => {
        const dd = seasonFilter.querySelector(".dropdown");
        if (!dd) return;
        if (dd.contains(ev.target)) return;
        closeDropdown();
    });

    document.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") closeDropdown();
    });

    renderSeasonSelector();
    renderEpisodesGrid();
}

main().catch(console.error);