// title.js
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

async function addToMyList(profileId, contentId) {
    try {
        const supabase = await ensureSupabaseGlobal();
        const { data, error } = await supabase
            .from('my_list')
            .insert([
                { profile_id: profileId, content_id: contentId }
            ]);

        if (error) {
            console.error('Error al agregar a Mi Lista:', error);
            return;
        }
        
        // Mostrar confirmación
        toast("Agregado a Mi Lista!");
    } catch (error) {
        console.error("Error en la inserción en Mi Lista:", error);
    }
}

/* ===========================
   Botón "Mi Lista"
   =========================== */
function setMyListBtn() {
    const myListBtn = el("mylist-btn");
    if (!myListBtn) return;

    const profileId = "perfil-id-aqui"; // Aquí deberías obtener el ID del perfil del usuario
    const contentId = qs("title") || qs("movie"); // Obtener el ID del contenido

    myListBtn.onclick = () => {
        if (profileId && contentId) {
            addToMyList(profileId, contentId);
        } else {
            toast("No se pudo agregar a Mi Lista. Datos faltantes.");
        }
    };
}

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
    setMyListBtn(); // Llamar a la función que maneja el botón "Mi Lista"
}

main().catch(console.error);