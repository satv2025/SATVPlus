/*  Player SATV + miniaturas VTT (Vidstack 1.11.x)  */

import { renderNav, renderAuthButtons, toast, $, escapeHtml } from './ui.js';
import { requireAuthOrRedirect } from './auth.js';
import {
  fetchMovie,
  fetchEpisodes,
  getProgress,
  upsertProgress
} from './api.js';
import { CONFIG } from './config.js';

/* ─ helpers ─ */
const param = name => new URL(location.href).searchParams.get(name);

function buildEpisodes(list, currentId, movieId) {
  const wrap = $('#episodes-wrap');
  const host = $('#episodes');
  if (!wrap || !host) return;

  if (!list.length) {
    wrap.classList.remove('hidden');
    host.innerHTML = '<div class="muted">No hay episodios cargados.</div>';
    return;
  }

  wrap.classList.remove('hidden');
  host.innerHTML = list.map(ep => {
    const active = ep.id === currentId ? 'active' : '';
    const href =
      `/watch.html?movie=${encodeURIComponent(movieId)}&episode=${encodeURIComponent(ep.id)}`;
    return `<a class="ep ${active}" href="${href}">
              <div class="ep-title">
                T${ep.season}E${ep.episode_number} · ${escapeHtml(ep.title || 'Episodio')}
              </div>
            </a>`;
  }).join('');
}

/* ─ main ─ */
async function init() {
  renderNav({ active: 'home' });
  await renderAuthButtons();

  const session = await requireAuthOrRedirect();
  if (!session) return;

  const movieId = param('movie');
  if (!movieId) { toast('Falta ?movie=', 'error'); return; }

  const player = $('#player');
  const titleEl = $('#title');
  const metaEl = $('#meta');
  const descEl = $('#desc');

  /* ─ cargar película ─ */
  let movie;
  try { movie = await fetchMovie(movieId); }
  catch { toast('No se pudo cargar el título.', 'error'); return; }

  titleEl.textContent = movie.title || 'Sin título';
  descEl.textContent = movie.description || '';
  document.title = `${movie.title || 'Sin título'} · SATV+`;

  let src = movie.m3u8_url;
  let vttUrl = movie.vtt_url || null;

  /* ─ episodios ─ */
  let episodes = [], curEp = null, curEpId = null;
  const epIdParam = param('episode');

  if (movie.category === 'series') {
    episodes = await fetchEpisodes(movieId).catch(() => []);
    curEp = epIdParam ? episodes.find(e => e.id === epIdParam) || null : episodes[0] || null;
    curEpId = curEp?.id || null;

    if (curEp?.m3u8_url) src = curEp.m3u8_url;
    if (curEp?.vtt_url) vttUrl = curEp.vtt_url;

    metaEl.textContent = curEp
      ? `Serie · S${curEp.season}E${curEp.episode_number}`
      : 'Serie';

    buildEpisodes(episodes, curEpId, movieId);
  } else {
    metaEl.textContent = 'Película';
    $('#episodes-wrap')?.classList.add('hidden');
  }

  /* ─ configurar Vidstack ─ */
  player.src = src;

  /*  Miniaturas sobre la barra  */
  if (vttUrl?.startsWith('http')) {
    // Cuando el provider (y, por ende, el <video>) están listos…
    player.addEventListener('provider-change', () => {
      let thumbnail = player.querySelector('media-slider-thumbnail');

      // Si el layout aún no generó el thumbnail, lo esperamos.
      if (!thumbnail) {
        const obs = new MutationObserver(() => {
          thumbnail = player.querySelector('media-slider-thumbnail');
          if (!thumbnail) return;

          obs.disconnect();               // encontrado → dejar de observar
          thumbnail.src = vttUrl;         // asignar VTT
          console.log('Thumbnail VTT puesto (obs):', vttUrl);
        });

        obs.observe(player, { childList: true, subtree: true });
      } else {
        thumbnail.src = vttUrl;           // ya estaba en el DOM
        console.log('Thumbnail VTT puesto:', vttUrl);
      }
    }, { once: true });
  }

  /* ─ reanudar progreso ─ */
  const saved = await getProgress({
    userId: session.user.id,
    movieId,
    episodeId: curEpId
  }).catch(() => null);

  const startAt = saved?.progress_seconds || 0;

  player.addEventListener('loaded-metadata', seek, { once: true });
  player.addEventListener('can-play', seek, { once: true });

  /* ─ guardar progreso ─ */
  let lastSave = 0, lastSecond = -1;
  const save = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastSave < CONFIG.PROGRESS_THROTTLE_MS) return;
    const ct = Math.floor(player.currentTime || 0);
    if (!force && ct === lastSecond) return;
    lastSecond = ct; lastSave = now;
    await upsertProgress({
      userId: session.user.id,
      movieId,
      episodeId: curEpId,
      progressSeconds: ct
    }).catch(console.error);
  };

  player.addEventListener('time-update', () => save(false));
  player.addEventListener('pause', () => save(true));

  player.addEventListener('ended', async () => {
    await save(true);
    if (movie.category === 'series') {
      const i = episodes.findIndex(e => e.id === curEpId);
      const next = episodes[i + 1];
      if (next) {
        location.href =
          `/watch.html?movie=${encodeURIComponent(movieId)}&episode=${encodeURIComponent(next.id)}`;
      }
    }
  });

  window.addEventListener('beforeunload', () =>
    upsertProgress({
      userId: session.user.id,
      movieId,
      episodeId: curEpId,
      progressSeconds: Math.floor(player.currentTime || 0)
    }).catch(() => { })
  );
}

/* boot */
document.addEventListener('DOMContentLoaded', init);