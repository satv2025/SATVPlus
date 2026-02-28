// /js/home.js
import {
  renderNav,
  renderAuthButtons,
  toast,
  cardHtml,
  $,
  formatTime,
  enableDataHrefNavigation,
  applyDisguisedCssFromId
} from "./ui.js";

import { getSession, requireAuthOrRedirect } from "./auth.js";
import { fetchContinueWatching, fetchLatest, fetchByCategory } from "./api.js";

/* =========================================================
   HOME HERO DESTACADO ESTABLE (tipo Netflix)
   - Elige 1 hero y lo mantiene por X tiempo (TTL)
   - Persistido en localStorage por usuario/dispositivo
========================================================= */

let __homeHeroRotationTimer = null;

// ✅ Configurable: 3 días (cambiá a 2 si querés)
const HOME_HERO_TTL_MS = 3 * 24 * 60 * 60 * 1000;

// Versionar key por si cambiás criterio en el futuro
const HOME_HERO_STORAGE_PREFIX = "homeHeroSelection:v1";

function getHomeHeroStorageKey(userId) {
  return `${HOME_HERO_STORAGE_PREFIX}:${userId || "guest"}`;
}

function readHomeHeroSelection(userId) {
  try {
    const raw = localStorage.getItem(getHomeHeroStorageKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeHomeHeroSelection(userId, data) {
  try {
    localStorage.setItem(getHomeHeroStorageKey(userId), JSON.stringify(data));
  } catch {
    // localStorage puede fallar (modo privado, quota, etc)
  }
}

function clearHomeHeroSelection(userId) {
  try {
    localStorage.removeItem(getHomeHeroStorageKey(userId));
  } catch {
    // ignore
  }
}

function buildMyListUrl(userId) {
  if (!userId) return "/mylist";
  const q = new URLSearchParams({
    list: String(userId), // asumimos 1 lista por usuario
    user: String(userId)
  });
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
    navLeft.appendChild(link);
  }

  link.href = buildMyListUrl(userId);
}

function homeHeroMeta(movie) {
  const year = movie?.release_year ? String(movie.release_year) : "";
  let right = "";

  if (movie?.category === "series") {
    const mm = movie?.movie_meta || null;
    const sc = Number(mm?.seasons_count || 0);
    const ec = Number(mm?.episodes_count || 0);
    if (sc > 0) right = `${sc} ${sc === 1 ? "temporada" : "temporadas"}`;
    else if (ec > 0) right = `${ec} ${ec === 1 ? "episodio" : "episodios"}`;
    else right = "Serie";
  } else {
    const mins = Number(movie?.duration_minutes || 0);
    if (mins > 0) {
      if (mins < 60) right = `${mins} min`;
      else {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        right = m ? `${h} h ${m} min` : `${h} h`;
      }
    }
  }

  return [year, right].filter(Boolean).join(" · ");
}

function renderHomeHeroItem(movie, { userId } = {}) {
  const hero = document.querySelector("main .hero");
  if (!hero || !movie?.id) return;

  const banner = movie.banner_url || movie.thumbnail_url || "";
  if (banner) hero.style.backgroundImage = `url("${banner}")`;

  const meta = homeHeroMeta(movie);
  const synopsis = movie.description || movie.sinopsis || "";
  const title = movie.title || "Destacado";
  const titleHref = `/title?title=${encodeURIComponent(movie.id)}`;
  const myListHref = buildMyListUrl(userId);

  hero.innerHTML = `
    <div class="home-hero-inner">
      <h1 class="home-hero-title">${title}</h1>
      ${meta ? `<div class="home-hero-meta">${meta}</div>` : ""}
      ${synopsis ? `<p class="home-hero-synopsis">${synopsis}</p>` : ""}
      <div class="home-hero-actions">
        <a class="btn" href="${titleHref}">Ver ahora <span aria-hidden="true"> ▶</span></a>
        <a class="btn ghost" href="${myListHref}">Mi Lista</a>
      </div>
    </div>
  `;
}

function pickStableHomeHero(items, { userId, ttlMs = HOME_HERO_TTL_MS } = {}) {
  const pool = (items || []).filter(x => x?.id);
  if (!pool.length) return null;

  const now = Date.now();
  const saved = readHomeHeroSelection(userId);

  // ✅ Si existe uno guardado y no venció, usarlo
  if (saved?.id && Number(saved.expiresAt) > now) {
    const existing = pool.find(x => String(x.id) === String(saved.id));
    if (existing) return existing;
  }

  // ✅ Si venció o no existe, elegir uno nuevo
  let next = pool[Math.floor(Math.random() * pool.length)];

  // Evitar repetir el mismo si hay más de 1 opción
  if (pool.length > 1 && saved?.id) {
    let guard = 0;
    while (String(next?.id) === String(saved.id) && guard < 12) {
      next = pool[Math.floor(Math.random() * pool.length)];
      guard++;
    }
  }

  writeHomeHeroSelection(userId, {
    id: next.id,
    chosenAt: now,
    expiresAt: now + ttlMs
  });

  return next;
}

function scheduleHomeHeroRefresh(items, { userId, ttlMs = HOME_HERO_TTL_MS } = {}) {
  if (__homeHeroRotationTimer) {
    clearTimeout(__homeHeroRotationTimer);
    __homeHeroRotationTimer = null;
  }

  const saved = readHomeHeroSelection(userId);
  const expiresAt = Number(saved?.expiresAt || 0);
  const delay = Math.max(0, expiresAt - Date.now());

  // Si no hay expiración válida, no programar nada.
  if (!delay) return;

  // ✅ Si la pestaña queda abierta días, al vencer cambia solo
  __homeHeroRotationTimer = setTimeout(() => {
    clearHomeHeroSelection(userId);
    startHomeHeroRotation(items, { userId, ttlMs });
  }, delay);
}

// Mantengo el nombre para no tocar el resto del flujo.
// Ahora NO rota cada 20s; pinta 1 hero estable por TTL.
function startHomeHeroRotation(items, { userId, ttlMs = HOME_HERO_TTL_MS } = {}) {
  const pool = (items || []).filter(x => x?.id);
  if (!pool.length) return;

  const chosen = pickStableHomeHero(pool, { userId, ttlMs });
  if (!chosen) return;

  renderHomeHeroItem(chosen, { userId });
  scheduleHomeHeroRefresh(pool, { userId, ttlMs });
}

/* =========================================================
   ENSURE CAROUSEL WRAPPER
========================================================= */
function ensureCarouselWrapper(row) {
  if (!row) return null;

  let carousel = row.closest(".carousel");
  if (carousel) return carousel;

  carousel = document.createElement("div");
  carousel.className = "carousel";

  const leftBtn = document.createElement("button");
  leftBtn.className = "carousel-btn left";
  leftBtn.type = "button";
  leftBtn.setAttribute("aria-label", "Anterior");
  leftBtn.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M15 6l-6 6 6 6"
        stroke="white" stroke-width="2"
        fill="none" stroke-linecap="round"/>
    </svg>
  `;

  const rightBtn = document.createElement("button");
  rightBtn.className = "carousel-btn right";
  rightBtn.type = "button";
  rightBtn.setAttribute("aria-label", "Siguiente");
  rightBtn.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M9 6l6 6-6 6"
        stroke="white" stroke-width="2"
        fill="none" stroke-linecap="round"/>
    </svg>
  `;

  const parent = row.parentElement;
  parent.insertBefore(carousel, row);

  carousel.appendChild(leftBtn);
  carousel.appendChild(row);
  carousel.appendChild(rightBtn);

  return carousel;
}

/* =========================================================
   RESET STATE
========================================================= */
function resetCarouselState(row) {
  delete row.dataset.carouselReady;
  delete row.dataset.carouselBlock;
}

/* =========================================================
   BUILD CAROUSEL
========================================================= */
function buildCarousel(row, { cloneRounds = 2 } = {}) {
  if (!row) return;
  if (row.dataset.carouselReady === "1") return;

  const originals = [...row.children];
  if (!originals.length) return;

  const carousel = ensureCarouselWrapper(row);
  const btnLeft = carousel.querySelector(".carousel-btn.left");
  const btnRight = carousel.querySelector(".carousel-btn.right");

  const itemCount = originals.length;
  row.dataset.carouselReady = "1";

  const isRestrictedRow =
    row.id === "series-row" ||
    row.id === "continue-row";

  if (isRestrictedRow && itemCount <= 6) {
    if (btnLeft) btnLeft.remove();
    if (btnRight) btnRight.remove();
    carousel.classList.add("carousel-disabled");
    return;
  }

  if (itemCount === 1) {
    if (btnLeft) btnLeft.style.display = "none";
    if (btnRight) btnRight.style.display = "none";
    return;
  }

  const gap = parseFloat(getComputedStyle(row).gap || "0");
  const firstCard = row.querySelector(".card");
  const cardW = firstCard ? firstCard.getBoundingClientRect().width : 0;
  const blockWidth = (cardW + gap) * itemCount;

  if (!blockWidth) return;

  row.dataset.carouselBlock = blockWidth;

  /* =========================
     CLONES
     ========================= */
  const leftFrag = document.createDocumentFragment();
  const rightFrag = document.createDocumentFragment();

  for (let r = 0; r < cloneRounds; r++) {
    for (let i = 0; i < itemCount; i++) leftFrag.appendChild(originals[i].cloneNode(true));
  }

  for (let r = 0; r < cloneRounds; r++) {
    for (let i = 0; i < itemCount; i++) rightFrag.appendChild(originals[i].cloneNode(true));
  }

  row.prepend(leftFrag);
  row.append(rightFrag);

  /* =========================
     CENTRAR SIN GLITCH
     ========================= */
  const oldVis = row.style.visibility;
  const oldBehavior = row.style.scrollBehavior;

  row.style.visibility = "hidden";
  row.style.scrollBehavior = "auto";

  const leftCloneCount = itemCount * cloneRounds;
  const firstOriginal = row.children[leftCloneCount];
  if (!firstOriginal) return;

  row.scrollLeft = firstOriginal.offsetLeft;

  requestAnimationFrame(() => {
    row.style.visibility = oldVis || "";
    row.style.scrollBehavior = oldBehavior || "";
  });

  const base = firstOriginal.offsetLeft;

  /* =========================
     WRAP ESTABLE
     ========================= */
  let wrapping = false;
  let isManualScrolling = false;

  function wrapTo(value) {
    if (wrapping) return;
    wrapping = true;

    const old = row.style.scrollBehavior;
    row.style.scrollBehavior = "auto";
    row.scrollLeft = value;

    requestAnimationFrame(() => {
      row.style.scrollBehavior = old || "";
      wrapping = false;
    });
  }

  row.addEventListener("scroll", () => {
    if (wrapping || isManualScrolling) return;

    const x = row.scrollLeft;
    const leftLimit = base - blockWidth * 0.75;
    const rightLimit = base + blockWidth * 0.75;

    if (x < leftLimit) wrapTo(x + blockWidth);
    else if (x > rightLimit) wrapTo(x - blockWidth);
  }, { passive: true });

  /* =========================
     FLECHAS
     ========================= */
  const moveAmount = () => Math.max(260, row.clientWidth * 0.9);

  function handleArrow(direction) {
    if (isManualScrolling) return;

    isManualScrolling = true;
    row.scrollBy({ left: direction * moveAmount(), behavior: "smooth" });

    setTimeout(() => {
      isManualScrolling = false;
    }, 450);
  }

  if (btnRight) btnRight.onclick = () => handleArrow(1);
  if (btnLeft) btnLeft.onclick = () => handleArrow(-1);
}

/* =========================================================
   SET ROW
========================================================= */
function setRow(el, html) {
  if (!el) return;
  resetCarouselState(el);
  el.innerHTML = html;
}

/* =========================================================
   CONTINUE WATCHING HELPERS
========================================================= */
function buildContinueHref(row) {
  const m = row?.movies;
  if (!m?.id) return "#";

  // ✅ Ir a la ficha del título (NO directo al reproductor)
  const episodeId = row?.episode_id || row?.episodes?.id || null;

  return episodeId
    ? `/title?title=${encodeURIComponent(m.id)}&episode=${encodeURIComponent(episodeId)}`
    : `/title?title=${encodeURIComponent(m.id)}`;
}

function buildContinueSubtitle(row) {
  const ep = row?.episodes || null;
  const progressSec = Number(row?.progress_seconds || 0);

  if (ep) {
    return `T${Number(ep.season ?? 0)}E${Number(ep.episode_number ?? 0)} · ${ep.title || ""} · ${formatTime(progressSec)}`;
  }

  return `Continuar · ${formatTime(progressSec)}`;
}

function buildContinuePct(row) {
  const m = row?.movies || null;
  const progressSec = Number(row?.progress_seconds || 0);

  let totalSec = Number(row?.duration_seconds || 0);

  // fallback razonable para películas si no existe duration_seconds
  if (!totalSec && m?.category === "movie") {
    totalSec = Number(m?.duration_minutes || 0) * 60;
  }

  if (totalSec > 0) {
    return Math.min(98, Math.max(2, Math.round((progressSec / totalSec) * 100)));
  }

  // sin duración -> barra mínima visible
  return 8;
}

/* =========================================================
   INIT
========================================================= */
async function init() {
  // ✅ HOME SIEMPRE usa satvplusClient.0.css (disfrazado)
  // Requisito: <link id="app-style" ...> en index.html
  applyDisguisedCssFromId(0, {
    linkId: "app-style",
    disguisedPrefix: "/css/satvplusClient.",
    disguisedSuffix: ".css"
  });

  enableDataHrefNavigation();

  renderNav({ active: "home" });
  await renderAuthButtons();

  const session = await getSession();
  const userId = session?.user?.id || null;
  ensureMyListNavLink(userId);

  const contWrap = $("#continue-wrap");
  const contRow = $("#continue-row");

  if (userId) {
    try {
      const rows = await fetchContinueWatching(userId, 24);
      const filtered = rows.filter(r => (Number(r.progress_seconds) || 0) >= 5);

      // ✅ 1 card por título (serie/peli), usando la fila más reciente
      const grouped = filtered.reduce((acc, r) => {
        const movieId = r.movies?.id || r.movie_id;
        if (!movieId) return acc;

        if (!acc[movieId] || new Date(r.updated_at) > new Date(acc[movieId].updated_at)) {
          acc[movieId] = r;
        }
        return acc;
      }, {});

      const uniqueRows = Object.values(grouped);

      if (uniqueRows.length) {
        contWrap.classList.remove("hidden");

        setRow(
          contRow,
          uniqueRows.map(r => {
            const m = r.movies;
            if (!m) return "";

            const href = buildContinueHref(r);
            const subtitle = buildContinueSubtitle(r);
            const pct = buildContinuePct(r);

            return cardHtml(m, href, subtitle, pct);
          }).join("")
        );

        buildCarousel(contRow, { cloneRounds: 2 });
      } else {
        contWrap.classList.add("hidden");
      }
    } catch (e) {
      console.error("[home] continue watching error:", e);
      contWrap.classList.add("hidden");
    }
  } else {
    contWrap.classList.add("hidden");
  }

  try {
    const latestRow = $("#latest-row");
    const moviesRow = $("#movies-row");
    const seriesRow = $("#series-row");

    const latest = await fetchLatest(24);
    setRow(latestRow, latest.map(m => cardHtml(m)).join(""));
    buildCarousel(latestRow, { cloneRounds: 2 });

    const movies = await fetchByCategory("movie", 24);
    setRow(moviesRow, movies.map(m => cardHtml(m)).join(""));
    buildCarousel(moviesRow, { cloneRounds: 2 });

    const series = await fetchByCategory("series", 24);
    setRow(seriesRow, series.map(m => cardHtml(m)).join(""));
    buildCarousel(seriesRow, { cloneRounds: 2 });

    const heroPoolMap = new Map();
    [...latest, ...movies, ...series].forEach(item => {
      if (item?.id && !heroPoolMap.has(item.id)) heroPoolMap.set(item.id, item);
    });

    // ✅ Hero estable por TTL (default 3 días)
    startHomeHeroRotation([...heroPoolMap.values()], { userId });

    // Si querés 2 días exactos:
    // startHomeHeroRotation([...heroPoolMap.values()], {
    //   userId,
    //   ttlMs: 2 * 24 * 60 * 60 * 1000
    // });

  } catch (e) {
    console.error(e);
    toast("Error cargando catálogo.", "error");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireAuthOrRedirect();
  if (!session) return;
  init();
});