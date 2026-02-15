import { renderNav, renderAuthButtons, toast, $, escapeHtml } from "./ui.js";
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
    return `
      <a class="ep ${active}" href="${href}">
        <div class="ep-title">S${ep.season}E${ep.episode_number} · ${escapeHtml(ep.title || "Episodio")}</div>
      </a>
    `;
  }).join("");
}

async function init() {
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
  const provider = document.getElementById("provider");
  const titleEl = $("#title");
  const metaEl = $("#meta");
  const descEl = $("#desc");

  let movie;
  let episodes = [];
  let currentEpisode = null;
  let currentEpisodeId = null;

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
      ? `Serie · S${currentEpisode.season}E${currentEpisode.episode_number}`
      : "Serie";

    buildEpisodes(episodes, currentEpisodeId, movieId);
  } else {
    metaEl.textContent = "Película";
    const wrap = $("#episodes-wrap");
    if (wrap) wrap.classList.add("hidden");
  }

  // Set source (Vidstack)
  // Vidstack supports setting `src` directly on media-player for HLS.
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
      // guard against near-end seek if duration available
      const dur = Number(player.duration || 0);
      if (dur && startAt > dur - CONFIG.NEAR_END_SECONDS) return;
      player.currentTime = startAt;
      toast(`Continuando desde ${Math.floor(startAt)}s`, "info");
    } catch (e) { }
  };

  // Vidstack events: "loaded-metadata" and "can-play"
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

  // Vidstack time update: "time-update" (detail.currentTime)
  player.addEventListener("time-update", () => save(false));
  player.addEventListener("pause", () => save(true));
  player.addEventListener("ended", () => save(true));

  window.addEventListener("beforeunload", () => {
    // best effort
    upsertProgress({
      userId,
      movieId,
      episodeId: currentEpisodeId,
      progressSeconds: Number(player.currentTime || 0)
    }).catch(() => { });
  });
}

document.addEventListener("DOMContentLoaded", init);
