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
import { CONFIG } from "./config.js";

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

  btnRight.onclick = () => handleArrow(1);
  btnLeft.onclick = () => handleArrow(-1);
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

  const contWrap = $("#continue-wrap");
  const contRow = $("#continue-row");

  if (userId) {
    try {
      const rows = await fetchContinueWatching(userId, 24);
      const filtered = rows.filter(r => (r.progress_seconds || 0) >= 5);

      const grouped = filtered.reduce((acc, r) => {
        const movieId = r.movies?.id;
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

            const ep = r.episodes || null;

            const href = ep
              ? `/watch?movie=${encodeURIComponent(m.id)}&episode=${encodeURIComponent(ep.id)}`
              : `/watch?movie=${encodeURIComponent(m.id)}`;

            const subtitle = ep
              ? `T${ep.season}E${ep.episode_number} · ${ep.title || ""} · ${formatTime(r.progress_seconds)}`
              : `Continuar · ${formatTime(r.progress_seconds)}`;

            const pct = Math.min(98, Math.max(2, (r.progress_seconds % 3600) / 36));

            return cardHtml(m, href, subtitle, pct);
          }).join("")
        );

        buildCarousel(contRow, { cloneRounds: 2 });
      } else {
        contWrap.classList.add("hidden");
      }
    } catch (e) {
      console.error(e);
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