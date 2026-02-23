import { renderNav, renderAuthButtons, toast, $, escapeHtml, applyDisguisedCssFromMovieId } from "./ui.js";
import { requireAuthOrRedirect } from "./auth.js";
import { fetchMovie, fetchEpisodes, getProgress, upsertProgress } from "./api.js";
import { CONFIG } from "./config.js";

function param(name) {
  return new URL(window.location.href).searchParams.get(name);
}

function buildEpisodes(episodes, currentEpisodeId, movieId) {
  const wrap = $("#episodes-wrap");
  const host = $("#episodes");
  if (!wrap || !host) return;

  if (!episodes.length) {
    wrap.classList.remove("hidden");
    host.innerHTML = `<div class="muted">No hay episodios cargados.</div>`;
    return;
  }

  wrap.classList.remove("hidden");
  host.innerHTML = episodes.map(ep => {
    const active = ep.id === currentEpisodeId ? "active" : "";
    const href = `/watch.html?movie=${encodeURIComponent(movieId)}&episode=${encodeURIComponent(ep.id)}`;

    const thumbnail = ep["thumbnails-episode"] || "https://example.com/default-thumbnail.jpg";
    const sinopsis = ep.sinopsis || "Sin sinopsis disponible";

    return `
      <a class="ep ${active}" href="${href}">
        <span class="ep-number">${ep.episode_number}</span>
        <div class="ep-thumbnail" style="background-image: url('${thumbnail}')"></div>
        <div class="ep-title">${escapeHtml(ep.title || "Episodio")}</div>
        <div class="ep-synopsis">${escapeHtml(sinopsis)}</div>
      </a>
    `;
  }).join("");
}

function setPreviewThumbnails(playerEl, vttUrl) {
  const layout =
    playerEl?.querySelector("media-video-layout, media-plyr-layout") ||
    document.querySelector("media-video-layout, media-plyr-layout");

  if (!layout) return;

  if (vttUrl) {
    layout.setAttribute("thumbnails", vttUrl);
  } else {
    layout.removeAttribute("thumbnails");
  }
}

// === Season Dropdown (usa tu CSS .dropdown) ===

function groupEpisodesBySeason(episodes = []) {
  const map = new Map(); // season -> episodes[]
  for (const ep of episodes) {
    const s = Number(ep.season || 1);
    if (!map.has(s)) map.set(s, []);
    map.get(s).push(ep);
  }

  const seasons = [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([season, eps]) => ({
      season,
      episodes: [...eps].sort((x, y) => (x.episode_number ?? 0) - (y.episode_number ?? 0)),
    }));

  return seasons;
}

function ensureSeasonDropdownMount() {
  const wrap = $("#episodes-wrap");
  if (!wrap) return null;

  let mount = $("#season-dropdown-mount");
  if (mount) return mount;

  mount = document.createElement("div");
  mount.id = "season-dropdown-mount";
  mount.style.marginTop = "12px";

  const list = $("#episodes");
  if (list?.parentNode) {
    list.parentNode.insertBefore(mount, list);
  } else {
    wrap.appendChild(mount);
  }

  return mount;
}

function createDropdownDOM({ labelText, options, selectedValue, onSelect }) {
  const root = document.createElement("div");
  root.className = "dropdown";

  const label = document.createElement("label");
  label.textContent = labelText;

  const selected = document.createElement("div");
  selected.className = "dropdown-selected";

  const selectedText = document.createElement("div");
  selectedText.className = "dropdown-text";

  const arrow = document.createElement("div");
  arrow.className = "dropdown-arrow";
  arrow.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  selected.appendChild(selectedText);
  selected.appendChild(arrow);

  const menu = document.createElement("div");
  menu.className = "dropdown-options";

  function setSelected(val) {
    const opt = options.find(o => String(o.value) === String(val)) || options[0];
    selectedText.textContent = opt?.label || "Seleccionar";
    root.dataset.value = String(opt?.value ?? "");
  }

  function close() {
    root.classList.remove("open");
  }

  function toggle() {
    root.classList.toggle("open");
  }

  menu.innerHTML = "";
  for (const opt of options) {
    const item = document.createElement("div");
    item.className = "dropdown-option";
    item.textContent = opt.label;

    item.addEventListener("click", () => {
      setSelected(opt.value);
      close();
      onSelect?.(opt.value);
    });

    menu.appendChild(item);
  }

  selected.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  });

  document.addEventListener("click", close);

  root.appendChild(label);
  root.appendChild(selected);
  root.appendChild(menu);

  setSelected(selectedValue);

  return {
    el: root,
    setSelected,
    close,
  };
}

function mountSeasonDropdown({ movieId, currentEpisodeId, episodes, onSeasonEpisodesChange }) {
  const mount = ensureSeasonDropdownMount();
  if (!mount) return null;

  const seasons = groupEpisodesBySeason(episodes);

  if (!seasons.length) {
    mount.innerHTML = "";
    return null;
  }

  const seasonFromEpisode = currentEpisodeId
    ? Number(episodes.find(e => e.id === currentEpisodeId)?.season || 1)
    : null;

  const hasSeason1 = seasons.some(s => Number(s.season) === 1);

  const currentSeason = seasonFromEpisode != null
    ? seasonFromEpisode
    : (hasSeason1 ? 1 : seasons[0].season);

  const options = seasons.map(s => ({
    value: s.season,
    label: `Temporada ${s.season} (${s.episodes.length} episodios)`,
  }));

  mount.innerHTML = "";

  const dropdown = createDropdownDOM({
    labelText: "Temporadas",
    options,
    selectedValue: currentSeason,
    onSelect: (seasonVal) => {
      const seasonNum = Number(seasonVal);
      const seasonBlock = seasons.find(s => s.season === seasonNum);
      const seasonEpisodes = seasonBlock?.episodes || [];

      const keepCurrent =
        currentEpisodeId && seasonEpisodes.some(e => e.id === currentEpisodeId);

      const activeId = keepCurrent ? currentEpisodeId : (seasonEpisodes[0]?.id || null);

      onSeasonEpisodesChange?.(seasonEpisodes, activeId);
    },
  });

  mount.appendChild(dropdown.el);

  const initialBlock = seasons.find(s => s.season === currentSeason) || seasons[0];
  const initialEpisodes = initialBlock.episodes;

  const keepCurrent =
    currentEpisodeId && initialEpisodes.some(e => e.id === currentEpisodeId);

  const activeId = keepCurrent ? currentEpisodeId : (initialEpisodes[0]?.id || null);

  onSeasonEpisodesChange?.(initialEpisodes, activeId);

  return dropdown;
}

/* =========================
   INIT
========================= */

async function init() {
  // ✅ 1) CSS disfrazado: /url/css/satvplusClient.{movieId}.css -> (rewrite) /css/styles.css
  // OJO: requiere que en watch.html el link tenga id="app-style"
  applyDisguisedCssFromMovieId({
    linkId: "app-style",
    disguisedPrefix: "/url/css/satvplusClient.",
    disguisedSuffix: ".css",
    disguisedDefaultHref: "/url/css/styles.css"
  });

  renderNav({ active: "home" });
  await renderAuthButtons();

  const session = await requireAuthOrRedirect();
  if (!session) return;
  const userId = session.user.id;

  const movieId = param("movie");
  const episodeIdParam = param("episode");

  if (!movieId) {
    toast("Falta ?movie=", "error");
    return;
  }

  const player = document.getElementById("player");
  const titleEl = $("#title");
  const metaEl = $("#meta");
  const descEl = $("#desc");

  let movie;
  let episodes = [];
  let currentEpisode = null;
  let currentEpisodeId = null;

  // Movie
  try {
    movie = await fetchMovie(movieId);
  } catch (e) {
    console.error(e);
    toast("No se pudo cargar el título (movies).", "error");
    return;
  }

  titleEl.textContent = movie.title || "Sin título";
  descEl.textContent = movie.description || "";

  let src = movie.m3u8_url;

  // Series: traer episodios una vez y decidir episodio actual
  if (movie.category === "series") {
    try {
      episodes = await fetchEpisodes(movieId);
    } catch (e) {
      console.error(e);
      toast("No se pudieron cargar episodios (episodes).", "error");
    }

    currentEpisode = episodeIdParam
      ? episodes.find(x => x.id === episodeIdParam) || null
      : (episodes[0] || null);

    currentEpisodeId = currentEpisode?.id || null;
    if (currentEpisode?.m3u8_url) src = currentEpisode.m3u8_url;

    metaEl.textContent = currentEpisode
      ? `Serie · T${currentEpisode.season}E${currentEpisode.episode_number}`
      : "Serie";

    // Dropdown + lista
    mountSeasonDropdown({
      movieId,
      currentEpisodeId,
      episodes,
      onSeasonEpisodesChange: (seasonEpisodes, activeEpisodeId) => {
        buildEpisodes(seasonEpisodes, activeEpisodeId, movieId);
      }
    });

  } else {
    metaEl.textContent = "Película";
    const wrap = $("#episodes-wrap");
    if (wrap) wrap.classList.add("hidden");
  }

  // Debug seguro (dentro del scope)
  console.log("EPISODES:", episodes);

  // Thumbnails VTT (preview thumbnails)
  const thumbsVtt = (movie.category === "series")
    ? (currentEpisode?.vtt_url || movie.vtt_url || null)
    : (movie.vtt_url || null);

  setPreviewThumbnails(player, thumbsVtt);

  // Set source (Vidstack)
  player.src = src;

  // Load saved progress
  let saved = null;
  try {
    saved = await getProgress({ userId, movieId, episodeId: currentEpisodeId });
  } catch (e) {
    console.error(e);
  }
  const startAt = saved?.progress_seconds || 0;

  // Seek when metadata ready
  const seekIfNeeded = () => {
    if (!startAt || startAt < 5) return;
    try {
      const dur = Number(player.duration || 0);
      if (dur && startAt > dur - CONFIG.NEAR_END_SECONDS) return;
      player.currentTime = startAt;
      toast(`Continuando desde ${Math.floor(startAt)}s`, "info");
    } catch (e) { }
  };

  player.addEventListener("loaded-metadata", seekIfNeeded, { once: true });
  player.addEventListener("can-play", seekIfNeeded, { once: true });

  // Save progress throttled
  let lastSave = 0;
  let lastSecond = -1;

  async function save(force = false) {
    const now = Date.now();
    if (!force && (now - lastSave) < CONFIG.PROGRESS_THROTTLE_MS) return;

    const ct = Number(player.currentTime || 0);
    const sec = Math.floor(ct);
    if (!force && sec === lastSecond) return;
    lastSecond = sec;

    lastSave = now;
    try {
      await upsertProgress({
        userId,
        movieId,
        episodeId: currentEpisodeId,
        progressSeconds: ct
      });
    } catch (e) {
      console.error(e);
    }
  }

  player.addEventListener("time-update", () => save(false));
  player.addEventListener("pause", () => save(true));
  player.addEventListener("ended", () => save(true));

  window.addEventListener("beforeunload", () => {
    upsertProgress({
      userId,
      movieId,
      episodeId: currentEpisodeId,
      progressSeconds: Number(player.currentTime || 0)
    }).catch(() => { });
  });
}

document.addEventListener("DOMContentLoaded", init);