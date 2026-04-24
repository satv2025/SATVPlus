// /js/home.js
import {
  renderNav,
  renderAuthButtons,
  toast,
  cardHtml,
  $,
  formatTime,
  enableDataHrefNavigation,
  applyDisguisedCssFromId,
  buildTitleUrl,
  initTopnavSearch,
  initSearchExperience
} from "./ui.js";

import { getSession, requireAuthOrRedirect } from "./auth.js";
import { fetchContinueWatching, fetchLatest, fetchByCategory, fetchMovie } from "./api.js";
import { supabase } from "./supabaseClient.js";

/* =========================================================
   ✅ TIPOGRAFÍA INLINE SOLO PARA 2 LÍNEAS (ESTABLE)
========================================================= */

let __twoLinesRaf = 0;
let __twoLinesInstalled = false;

const TWO_LINE_TOL = 0.35;

function getLineHeightPx(el, cs = null) {
  try {
    const st = cs || getComputedStyle(el);
    const lh = parseFloat(st.lineHeight);
    if (Number.isFinite(lh) && lh > 0) return lh;

    const fs = parseFloat(st.fontSize) || 16;
    return fs * 1.25;
  } catch {
    return 18;
  }
}

function getContentHeightPx(el, cs = null) {
  const st = cs || getComputedStyle(el);
  const h = el.getBoundingClientRect().height || el.offsetHeight || 0;

  const pt = parseFloat(st.paddingTop) || 0;
  const pb = parseFloat(st.paddingBottom) || 0;
  const bt = parseFloat(st.borderTopWidth) || 0;
  const bb = parseFloat(st.borderBottomWidth) || 0;

  return Math.max(0, h - pt - pb - bt - bb);
}

function lineRawFromMetrics(el) {
  const cs = getComputedStyle(el);
  const lh = getLineHeightPx(el, cs);
  const contentH = getContentHeightPx(el, cs);
  if (!lh || !contentH) return 0;
  return contentH / lh;
}

function measureBaseLineRaw(el) {
  if (!el) return 0;

  const style = el.style;
  const hadOur = el.dataset.twoLinesApplied === "1";

  const famVal = style.getPropertyValue("font-family");
  const famPr = style.getPropertyPriority("font-family");
  const wVal = style.getPropertyValue("font-weight");
  const wPr = style.getPropertyPriority("font-weight");

  if (hadOur) {
    style.removeProperty("font-family");
    style.removeProperty("font-weight");
  }

  const raw = lineRawFromMetrics(el);

  if (hadOur) {
    if (famVal) style.setProperty("font-family", famVal, famPr);
    if (wVal) style.setProperty("font-weight", wVal, wPr);
  }

  return raw;
}

function isBaseExactlyTwoLines(el) {
  const raw = measureBaseLineRaw(el);
  return raw > (2 - TWO_LINE_TOL) && raw < (2 + TWO_LINE_TOL);
}

function setCondensedInline(el, weight) {
  el.style.setProperty("font-family", "HBOMaxSansCond", "important");
  el.style.setProperty("font-weight", String(weight));
  el.dataset.twoLinesApplied = "1";
  el.dataset.twoLinesWeight = String(weight);
}

function clearCondensedInlineIfOurs(el) {
  if (el.dataset.twoLinesApplied !== "1") return;
  el.style.removeProperty("font-family");
  el.style.removeProperty("font-weight");
  delete el.dataset.twoLinesApplied;
  delete el.dataset.twoLinesWeight;
}

function applyInlineByTwoLinesRule(el, weight) {
  if (!el) return;

  if (el.classList.contains("is-2lines")) el.classList.remove("is-2lines");

  const should = isBaseExactlyTwoLines(el);

  if (should) {
    setCondensedInline(el, weight);
  } else {
    clearCondensedInlineIfOurs(el);
  }
}

function applyTwoLinesTypographyInline(scope = document) {
  scope.querySelectorAll(".card-title").forEach((el) => {
    applyInlineByTwoLinesRule(el, 700);
  });

  document
    .querySelectorAll("#continue-wrap .carousel .card .card-subtitle")
    .forEach((el) => {
      applyInlineByTwoLinesRule(el, 400);
    });
}

function scheduleTwoLinesScan(scope = document) {
  if (__twoLinesRaf) cancelAnimationFrame(__twoLinesRaf);
  __twoLinesRaf = requestAnimationFrame(() => {
    __twoLinesRaf = 0;
    applyTwoLinesTypographyInline(scope);
  });
}

function installTwoLinesObservers() {
  if (__twoLinesInstalled) return;
  __twoLinesInstalled = true;

  if (document.fonts?.ready?.then) {
    document.fonts.ready.then(() => scheduleTwoLinesScan()).catch(() => { });
  }

  window.addEventListener("load", () => scheduleTwoLinesScan(), { passive: true });
  window.addEventListener("resize", () => scheduleTwoLinesScan(), { passive: true });

  try {
    const ro = new ResizeObserver(() => scheduleTwoLinesScan());
    ro.observe(document.documentElement);
  } catch { }

  setTimeout(() => scheduleTwoLinesScan(), 150);
  setTimeout(() => scheduleTwoLinesScan(), 600);

  scheduleTwoLinesScan();
}

/* =========================================================
   HOME HERO DESTACADO ESTABLE (tipo Netflix)
========================================================= */

let __homeHeroRotationTimer = null;
const HOME_HERO_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const HOME_HERO_STORAGE_PREFIX = "homeHeroSelection:v1";

/* =========================================================
   HOME HERO TRAILER VIDEO (autoplay + mute/unmute)
========================================================= */

const HERO_VOLUME_ICON_MUTE = "https://satvplus.com.ar/images/svg/heromute.svg";
const HERO_VOLUME_ICON_UNMUTE = "https://satvplus.com.ar/images/svg/heroon.svg";

/* =========================================================
   CARD QUICK MODAL (+ en cards del carrusel)
   FIX: no hace scroll up/down al abrir/cerrar.
========================================================= */

let __quickModalRoot = null;
let __quickModalLastFocus = null;
let __quickModalInstalled = false;
let __quickModalScrollY = 0;

function getQuickModalRoot() {
  if (__quickModalRoot && document.body.contains(__quickModalRoot)) {
    return __quickModalRoot;
  }

  const root = document.createElement("div");
  root.id = "card-quick-modal-root";
  root.className = "card-quick-modal-backdrop";
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");

  document.body.appendChild(root);
  __quickModalRoot = root;
  return root;
}

function lockQuickModalScroll() {
  __quickModalScrollY = window.scrollY || document.documentElement.scrollTop || 0;

  document.body.classList.add("card-quick-modal-open");

  /*
    Se bloquea desde JS para conservar exactamente el scroll actual.
    Esto evita el salto arriba/abajo cuando abre el modal y cuando carga el trailer.
  */
  document.body.style.position = "fixed";
  document.body.style.top = `-${__quickModalScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockQuickModalScroll() {
  document.body.classList.remove("card-quick-modal-open");

  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";

  window.scrollTo(0, __quickModalScrollY);
}

function closeQuickCardModal() {
  const root = getQuickModalRoot();

  try {
    root.querySelectorAll("video").forEach((video) => {
      try {
        video.pause();
        video.removeAttribute("src");
        video.load?.();
      } catch { }
    });
  } catch { }

  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = "";

  unlockQuickModalScroll();

  /*
    Importante: NO restauramos focus al botón del card.
    Ese focus() era lo que hacía que el navegador scrolleara de vuelta al card
    y generara el efecto de scroll up/down.
  */
  __quickModalLastFocus = null;
}

function installQuickModalGlobalEvents() {
  if (__quickModalInstalled) return;
  __quickModalInstalled = true;

  document.addEventListener("keydown", (ev) => {
    const root = getQuickModalRoot();
    if (!root.hidden && ev.key === "Escape") {
      ev.preventDefault();
      closeQuickCardModal();
    }
  });
}

function syncQuickModalVolumeUi(video, btn, icon) {
  const isMuted = !!video.muted;
  icon.src = isMuted ? HERO_VOLUME_ICON_MUTE : HERO_VOLUME_ICON_UNMUTE;
  btn.setAttribute("aria-label", isMuted ? "Activar sonido" : "Silenciar");
  btn.setAttribute("aria-pressed", String(!isMuted));
  btn.title = isMuted ? "Activar sonido" : "Silenciar";
}

function buildQuickModalPoster(posterUrl, title = "") {
  const posterWrap = document.createElement("div");
  posterWrap.className = "card-quick-modal-poster";

  if (posterUrl) {
    const img = document.createElement("img");
    img.className = "card-quick-modal-poster-img";
    img.src = posterUrl;
    img.alt = title ? `Poster de ${title}` : "Poster";
    img.decoding = "async";
    img.loading = "eager";
    posterWrap.appendChild(img);
  }

  const shade = document.createElement("div");
  shade.className = "card-quick-modal-shade";
  posterWrap.appendChild(shade);

  return posterWrap;
}

function mountQuickModalTrailer(container, movie) {
  if (!container || !movie) return;

  const trailerUrl = String(movie.trailer_url || "").trim();
  const poster = movie.banner_url || movie.thumbnail_url || "";
  const title = movie.title || "";

  if (!trailerUrl) {
    container.appendChild(buildQuickModalPoster(poster, title));
    return;
  }

  const media = document.createElement("div");
  media.className = "card-quick-modal-media";

  const video = document.createElement("video");
  video.className = "card-quick-modal-video";
  video.src = trailerUrl;
  if (poster) video.poster = poster;

  video.autoplay = true;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");

  const shade = document.createElement("div");
  shade.className = "card-quick-modal-shade";

  const volBtn = document.createElement("button");
  volBtn.type = "button";
  volBtn.className = "card-quick-modal-volume-btn";
  volBtn.setAttribute("aria-label", "Activar sonido");
  volBtn.setAttribute("aria-pressed", "false");

  const volIcon = document.createElement("img");
  volIcon.alt = "";
  volIcon.decoding = "async";
  volIcon.src = HERO_VOLUME_ICON_MUTE;
  volBtn.appendChild(volIcon);

  function playVideo() {
    const p = video.play?.();
    if (p && typeof p.catch === "function") p.catch(() => { });
  }

  volBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    video.muted = !video.muted;
    syncQuickModalVolumeUi(video, volBtn, volIcon);
    playVideo();
  });

  const onReady = () => media.classList.add("is-ready");
  video.addEventListener("loadeddata", onReady, { once: true });
  video.addEventListener("canplay", onReady, { once: true });

  video.addEventListener(
    "error",
    () => {
      container.innerHTML = "";
      container.appendChild(buildQuickModalPoster(poster, title));
    },
    { once: true }
  );

  media.appendChild(video);
  media.appendChild(shade);
  media.appendChild(volBtn);
  container.appendChild(media);

  syncQuickModalVolumeUi(video, volBtn, volIcon);

  requestAnimationFrame(playVideo);
}

async function openQuickCardModal(movieId, triggerEl = null) {
  if (!movieId) return;

  installQuickModalGlobalEvents();
  __quickModalLastFocus = triggerEl || document.activeElement || null;

  const root = getQuickModalRoot();

  lockQuickModalScroll();

  root.hidden = false;
  root.setAttribute("aria-hidden", "false");

  root.innerHTML = `
    <div class="card-quick-modal" role="dialog" aria-modal="true" aria-label="Vista rápida">
      <button class="card-quick-modal-close" type="button" aria-label="Cerrar">
        <span aria-hidden="true">×</span>
      </button>

      <div class="card-quick-modal-media-wrap">
        <div class="card-quick-modal-loading">Cargando…</div>
      </div>

      <div class="card-quick-modal-body">
        <h3 class="card-quick-modal-title">Cargando…</h3>
        <p class="card-quick-modal-synopsis"></p>
      </div>
    </div>
  `;

  const modal = root.querySelector(".card-quick-modal");
  const closeBtn = root.querySelector(".card-quick-modal-close");

  closeBtn?.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeQuickCardModal();
  });

  root.onclick = (ev) => {
    if (ev.target === root) closeQuickCardModal();
  };

  modal?.addEventListener("click", (ev) => {
    ev.stopPropagation();
  });

  try {
    const movie = await fetchMovie(movieId);
    if (!movie) throw new Error("No se encontró el contenido");

    const mediaWrap = root.querySelector(".card-quick-modal-media-wrap");
    const titleNode = root.querySelector(".card-quick-modal-title");
    const synopsisNode = root.querySelector(".card-quick-modal-synopsis");

    if (titleNode) titleNode.textContent = movie.title || "Sin título";
    if (synopsisNode) synopsisNode.textContent = movie.description || movie.sinopsis || "Sin sinopsis disponible.";

    if (mediaWrap) {
      mediaWrap.innerHTML = "";
      mountQuickModalTrailer(mediaWrap, movie);
    }
  } catch (e) {
    console.error("[home] quick modal error:", e);

    const mediaWrap = root.querySelector(".card-quick-modal-media-wrap");
    const titleNode = root.querySelector(".card-quick-modal-title");
    const synopsisNode = root.querySelector(".card-quick-modal-synopsis");

    if (mediaWrap) {
      mediaWrap.innerHTML = `<div class="card-quick-modal-loading">No se pudo cargar el trailer.</div>`;
    }
    if (titleNode) titleNode.textContent = "Error";
    if (synopsisNode) synopsisNode.textContent = "No se pudo cargar la información del contenido.";
  }
}

function buildCardQuickPlusButton(movieId) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "card-quick-plus-btn";
  btn.setAttribute("aria-label", "Abrir vista rápida");
  btn.dataset.movieId = String(movieId);

  btn.innerHTML = `
    <svg class="card-quick-plus-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1920" aria-hidden="true" focusable="false">
      <path d="M866.332 213v653.332H213v186.666h653.332v653.332h186.666v-653.332h653.332V866.332h-653.332V213z" fill-rule="evenodd"></path>
    </svg>
  `;

  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    openQuickCardModal(movieId, btn);
  });

  return btn;
}

function enhanceCarouselCardsWithQuickPlus(scope = document) {
  const cards =
    scope?.classList?.contains("card")
      ? [scope]
      : Array.from(scope.querySelectorAll(".card"));

  cards.forEach((card) => {
    if (card.querySelector(".card-quick-plus-btn")) return;

    let movieId =
      card.dataset.movieId ||
      card.getAttribute("data-movie-id") ||
      "";

    if (!movieId) {
      const href = String(card.dataset.href || "");
      try {
        const url = new URL(href, window.location.origin);
        movieId = url.searchParams.get("title") || "";
      } catch { }
    }

    if (!movieId) return;

    card.dataset.movieId = String(movieId);

    const thumb = card.querySelector(".thumb") || card;
    thumb.appendChild(buildCardQuickPlusButton(movieId));
  });
}

function addMovieIdToCardHtml(html, movieId) {
  if (!html || !movieId) return html || "";

  return String(html).replace(
    /<div\s+class="([^"]*\bcard\b[^"]*)"/,
    `<div class="$1" data-movie-id="${String(movieId)}"`
  );
}

function mountHomeHeroTrailerVideo(hero, movie) {
  if (!hero || !movie?.id) return;

  const trailerUrl = String(movie?.trailer_url || "").trim();
  if (!trailerUrl) return;

  const banner = movie.banner_url || movie.thumbnail_url || "";

  hero.classList.remove("hero-video-ready");
  hero.querySelectorAll(".home-hero-media").forEach((n) => n.remove());
  hero.querySelectorAll(".home-hero-volume-btn").forEach((n) => n.remove());

  const media = document.createElement("div");
  media.className = "home-hero-media";

  const video = document.createElement("video");
  video.className = "home-hero-video";
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
  shade.className = "home-hero-video-shade";

  media.appendChild(video);
  media.appendChild(shade);
  hero.prepend(media);

  const volBtn = document.createElement("button");
  volBtn.type = "button";
  volBtn.className = "home-hero-volume-btn";
  volBtn.setAttribute("aria-label", "Activar sonido");
  volBtn.setAttribute("aria-pressed", "false");

  const volIcon = document.createElement("img");
  volIcon.alt = "";
  volIcon.decoding = "async";
  volIcon.src = HERO_VOLUME_ICON_MUTE;
  volBtn.appendChild(volIcon);

  function syncVolumeUi() {
    const isMuted = !!video.muted;
    volIcon.src = isMuted ? HERO_VOLUME_ICON_MUTE : HERO_VOLUME_ICON_UNMUTE;
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

  const rightSlot = hero.querySelector(".home-hero-right");
  if (rightSlot) rightSlot.appendChild(volBtn);
  else hero.appendChild(volBtn);

  syncVolumeUi();

  video.addEventListener(
    "error",
    () => {
      volBtn.remove();
      media.remove();
      hero.classList.remove("hero-video-ready");
      console.warn("[home] trailer hero error:", trailerUrl);
    },
    { once: true }
  );

  const showVideo = () => hero.classList.add("hero-video-ready");
  video.addEventListener("loadeddata", showVideo, { once: true });
  video.addEventListener("canplay", showVideo, { once: true });

  requestAnimationFrame(() => {
    const p = video.play?.();
    if (p && typeof p.catch === "function") {
      p.catch((err) => console.warn("[home] autoplay trailer bloqueado:", err));
    }
  });
}

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
  } catch { }
}

function clearHomeHeroSelection(userId) {
  try {
    localStorage.removeItem(getHomeHeroStorageKey(userId));
  } catch { }
}

function pickStableHomeHero(items, { userId, ttlMs = HOME_HERO_TTL_MS } = {}) {
  const pool = (items || []).filter((x) => x?.id);
  if (!pool.length) return null;

  const now = Date.now();
  const saved = readHomeHeroSelection(userId);

  if (saved?.id && Number(saved.expiresAt) > now) {
    const existing = pool.find((x) => String(x.id) === String(saved.id));
    if (existing) return existing;
  }

  let next = pool[Math.floor(Math.random() * pool.length)];

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
  if (!delay) return;

  __homeHeroRotationTimer = setTimeout(() => {
    clearHomeHeroSelection(userId);
    startHomeHeroRotation(items, { userId, ttlMs });
  }, delay);
}

function startHomeHeroRotation(items, { userId, ttlMs = HOME_HERO_TTL_MS } = {}) {
  const pool = (items || []).filter((x) => x?.id);
  if (!pool.length) return;

  const chosen = pickStableHomeHero(pool, { userId, ttlMs });
  if (!chosen) return;

  renderHomeHeroItem(chosen, { userId });
  scheduleHomeHeroRefresh(pool, { userId, ttlMs });
}

/* =========================================================
   MI LISTA (HOME HERO) - Supabase + fallback local
========================================================= */

const MY_LIST_KEY = "satv_my_list_ids";

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
    console.warn("[home] no se pudo guardar Mi Lista local:", e);
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

function toggleLocalMyList(contentId) {
  const id = String(contentId);
  const ids = getMyListIdsLocal();
  const exists = ids.includes(id);
  const next = exists ? ids.filter((x) => x !== id) : [...ids, id];
  saveMyListIdsLocal(next);
  return !exists;
}

async function isInMyListRemote(profileId, contentId) {
  if (!profileId || !contentId) return false;

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
  const payload = {
    profile_id: profileId,
    content_id: contentId,
    added_at: new Date().toISOString()
  };

  const { error } = await supabase.from("my_list").upsert(payload, {
    onConflict: "profile_id,content_id",
    ignoreDuplicates: false
  });

  if (error) throw error;
  return true;
}

async function removeFromMyListRemote(profileId, contentId) {
  const { error } = await supabase
    .from("my_list")
    .delete()
    .eq("profile_id", profileId)
    .eq("content_id", contentId);

  if (error) throw error;
  return true;
}

async function resolveHeroMyListState({ userId, contentId }) {
  const localAdded = isInMyListLocal(contentId);

  if (!userId) {
    return { added: localAdded, source: "local", isLoggedIn: false };
  }

  try {
    const remoteAdded = await isInMyListRemote(userId, contentId);
    setLocalMyListMembership(contentId, remoteAdded);
    return { added: remoteAdded, source: "supabase", isLoggedIn: true };
  } catch (e) {
    console.warn("[home] resolveHeroMyListState remote error; uso local:", e);
    return { added: localAdded, source: "local", isLoggedIn: true, error: e };
  }
}

function setHeroMyListBtnState(btn, { contentId, added = false, pending = false, source = "unknown" } = {}) {
  if (!btn || !contentId) return;

  btn.dataset.myListContentId = String(contentId);
  btn.dataset.myListState = added ? "in" : "out";
  btn.dataset.myListPending = pending ? "1" : "0";
  btn.dataset.myListSource = source;

  btn.setAttribute("aria-pressed", String(!!added));
  btn.setAttribute("aria-label", added ? "Quitar de Mi Lista" : "Agregar a Mi Lista");
  btn.classList.toggle("is-active", !!added);

  try { btn.disabled = !!pending; } catch { }

  const label = pending ? "Actualizando…" : (added ? "En Mi Lista" : "Mi Lista");
  const labelNode = btn.querySelector(".home-hero-mylist-label");
  if (labelNode) labelNode.textContent = label;
}

async function refreshHeroMyListButton(btn, { userId, contentId }) {
  if (!btn || !contentId) return null;

  setHeroMyListBtnState(btn, {
    contentId,
    added: isInMyListLocal(contentId),
    pending: true,
    source: "unknown"
  });

  const state = await resolveHeroMyListState({ userId, contentId });

  setHeroMyListBtnState(btn, {
    contentId,
    added: state.added,
    pending: false,
    source: state.source
  });

  return state;
}

function bindHeroMyListButton({ movie, userId }) {
  const btn = document.querySelector(".home-hero-mylist");
  if (!btn || !movie?.id) return;

  const contentId = String(movie.id);
  btn.dataset.myListContentId = contentId;

  refreshHeroMyListButton(btn, { userId, contentId }).catch(() => {
    setHeroMyListBtnState(btn, {
      contentId,
      added: isInMyListLocal(contentId),
      pending: false,
      source: "local"
    });
  });

  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();

    const currentId = btn.dataset.myListContentId || contentId;
    if (!currentId) return;
    if (btn.dataset.myListPending === "1") return;

    setHeroMyListBtnState(btn, {
      contentId: currentId,
      added: btn.dataset.myListState === "in",
      pending: true,
      source: btn.dataset.myListSource || "unknown"
    });

    try {
      const state = await resolveHeroMyListState({ userId, contentId: currentId });

      if (state.source === "supabase" && userId) {
        if (state.added) {
          await removeFromMyListRemote(userId, currentId);
          setLocalMyListMembership(currentId, false);
          setHeroMyListBtnState(btn, { contentId: currentId, added: false, pending: false, source: "supabase" });
          toast?.("Quitado de Mi Lista.", "success");
        } else {
          await addToMyListRemote(userId, currentId);
          setLocalMyListMembership(currentId, true);
          setHeroMyListBtnState(btn, { contentId: currentId, added: true, pending: false, source: "supabase" });
          toast?.("Agregado a Mi Lista.", "success");
        }
        return;
      }

      const added = toggleLocalMyList(currentId);
      setHeroMyListBtnState(btn, { contentId: currentId, added, pending: false, source: "local" });
      toast?.(added ? "Agregado a Mi Lista (local)." : "Quitado a Mi Lista (local).", "success");
    } catch (e) {
      console.warn("[home] toggle hero Mi Lista error:", e);
      try {
        await refreshHeroMyListButton(btn, { userId, contentId: currentId });
      } catch {
        setHeroMyListBtnState(btn, {
          contentId: currentId,
          added: isInMyListLocal(currentId),
          pending: false,
          source: "local"
        });
      }
      toast?.("No se pudo actualizar Mi Lista.", "error");
    }
  }, { passive: false });
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
    navLeft.appendChild(link);
  }

  link.href = buildMyListUrl(userId);
}

/* =========================================================
   LIVE MODE (cards del home)
========================================================= */

const LIVE_DISPLAY_TIMEZONE = "America/Argentina/Buenos_Aires";

function getMovieLiveStartDate(movie) {
  if (!movie) return null;
  const raw = movie.live_starts_at ?? movie.live_start_at ?? movie.live_datetime ?? movie.live_at ?? null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatMovieLiveDateTime(movie, { timeZone = LIVE_DISPLAY_TIMEZONE } = {}) {
  const d = getMovieLiveStartDate(movie);
  if (!d) return "";

  const fecha = new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(d);

  const hora = new Intl.DateTimeFormat("es-AR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(d);

  return `${fecha} - ${hora}`;
}

/* =========================================================
   ESTADO PUBLICACIÓN (cards del home)
========================================================= */

function getMovieCardPublicLabel(movie) {
  if (!movie) return "";

  const publishState = String(movie.publish_state || "public").toLowerCase();
  const customText = String(movie.publish_state_text || "").trim();

  if (publishState === "upcoming") {
    return customText || "Próximamente";
  }

  if (publishState === "other") {
    return customText || "Otro";
  }

  if (Boolean(movie.live_mode)) {
    const liveDate = formatMovieLiveDateTime(movie);
    return liveDate || (publishState === "live" ? "En Vivo" : "");
  }

  if (publishState === "live") {
    return "En Vivo";
  }

  return "";
}

/* =========================================================
   COLLECTION HELPERS
========================================================= */

function getMovieCollectionId(movie) {
  return movie?.collection_id || null;
}

function homeCatalogCardHtml(movie) {
  const stateLabel = getMovieCardPublicLabel(movie);
  const href = buildTitleUrl(movie?.id, {
    collectionId: getMovieCollectionId(movie)
  });

  const html = stateLabel
    ? cardHtml(movie, href, stateLabel, null, {
      showCollectionOverlay: true
    })
    : cardHtml(movie, href, null, null, {
      showCollectionOverlay: true
    });

  return addMovieIdToCardHtml(html, movie?.id);
}

/* =========================================================
   BADGES
========================================================= */

function promoteCatalogCardBadges(rootEl) {
  if (!rootEl) return;

  rootEl.querySelectorAll(".card .card-subtitle").forEach((node) => {
    const text = String(node.textContent || "").trim();
    if (!text) return;

    const badge = document.createElement("div");
    badge.className = "card-badge card-badge-upcoming";
    badge.textContent = text;

    node.replaceWith(badge);
  });
}

/* =========================================================
   HERO RENDER
========================================================= */

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
  hero.style.backgroundImage = banner ? `url("${banner}")` : "";

  const meta = homeHeroMeta(movie);
  const synopsis = movie.description || movie.sinopsis || "";
  const title = movie.title || "Destacado";
  const titleHref = buildTitleUrl(movie.id, {
    collectionId: getMovieCollectionId(movie)
  });

  hero.innerHTML = `
    <div class="home-hero-inner">
      <h1 class="home-hero-title">${title}</h1>

      <div class="home-hero-layout">
        <div class="home-hero-left">
          ${meta ? `<div class="home-hero-meta">${meta}</div>` : ""}
          ${synopsis ? `<p class="home-hero-synopsis">${synopsis}</p>` : ""}

          <div class="home-hero-actions">
            <a class="btn" href="${titleHref}">Reproducir <span aria-hidden="true"> ▶</span></a>

            <button
              class="btn ghost home-hero-mylist"
              type="button"
              aria-label="Agregar a Mi Lista"
              aria-pressed="false"
            >
              <svg class="home-hero-mylist-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1920" aria-hidden="true" focusable="false">
                <path d="M866.332 213v653.332H213v186.666h653.332v653.332h186.666v-653.332h653.332V866.332h-653.332V213z" fill-rule="evenodd"/>
              </svg>
              <span class="home-hero-mylist-label">Mi Lista</span>
            </button>
          </div>
        </div>

        <div class="home-hero-right"></div>
      </div>
    </div>
  `;

  mountHomeHeroTrailerVideo(hero, movie);
  bindHeroMyListButton({ movie, userId });
}

/* =========================================================
   CAROUSEL
========================================================= */

function getCarouselCards(row) {
  return [...row.querySelectorAll(".card")];
}

function getRowCenterX(row) {
  return row.scrollLeft + row.clientWidth / 2;
}

function getCardCenterX(card) {
  return card.offsetLeft + card.offsetWidth / 2;
}

function centerCard(row, card, behavior = "smooth") {
  if (!row || !card) return;

  const target = card.offsetLeft - (row.clientWidth / 2) + (card.offsetWidth / 2);

  row.scrollTo({
    left: Math.max(0, target),
    behavior
  });
}

function getClosestCenteredCard(row) {
  const cards = getCarouselCards(row);
  if (!cards.length) return null;

  const rowCenter = getRowCenterX(row);

  let closest = null;
  let minDist = Infinity;

  for (const card of cards) {
    const dist = Math.abs(getCardCenterX(card) - rowCenter);
    if (dist < minDist) {
      minDist = dist;
      closest = card;
    }
  }

  return closest;
}

function moveToAdjacentCard(row, direction = 1) {
  const cards = getCarouselCards(row);
  if (!cards.length) return;

  const current = getClosestCenteredCard(row) || cards[0];
  const index = cards.indexOf(current);
  if (index < 0) return;

  const nextIndex = Math.max(0, Math.min(cards.length - 1, index + direction));
  centerCard(row, cards[nextIndex], "smooth");
}

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

function setCarouselCenteredState(carousel, enabled) {
  if (!carousel) return;
  carousel.classList.toggle("carousel-disabled", !!enabled);
}

function resetCarouselState(row) {
  if (!row) return;

  delete row.dataset.carouselReady;

  if (row.__carouselCleanup && typeof row.__carouselCleanup === "function") {
    try { row.__carouselCleanup(); } catch { }
  }

  delete row.__carouselCleanup;
  delete row.__resizeHandler;
  delete row.__snapTimer;

  const carousel = row.closest(".carousel");
  if (carousel) {
    carousel.classList.remove("carousel-disabled");
    carousel.classList.remove("no-arrows");
  }
}

function buildCarousel(row) {
  if (!row) return;
  if (row.dataset.carouselReady === "1") return;

  const originals = [...row.children];
  if (!originals.length) return;

  const carousel = ensureCarouselWrapper(row);
  const btnLeft = carousel.querySelector(".carousel-btn.left");
  const btnRight = carousel.querySelector(".carousel-btn.right");

  row.dataset.carouselReady = "1";

  const showArrows = row.dataset.arrows !== "0";
  carousel.classList.toggle("no-arrows", !showArrows);

  if (originals.length <= 1) {
    carousel.classList.add("no-arrows");
    setCarouselCenteredState(carousel, true);
  } else {
    setCarouselCenteredState(carousel, false);
  }

  let snapTimer = null;
  let isSnapping = false;

  function snapToClosest(behavior = "smooth") {
    if (isSnapping) return;

    const closest = getClosestCenteredCard(row);
    if (!closest) return;

    isSnapping = true;
    centerCard(row, closest, behavior);

    window.clearTimeout(snapTimer);
    snapTimer = window.setTimeout(() => {
      isSnapping = false;
    }, 220);
  }

  function onScroll() {
    if (isSnapping) return;

    window.clearTimeout(snapTimer);
    snapTimer = window.setTimeout(() => {
      snapToClosest("smooth");
    }, 100);
  }

  if (btnLeft) {
    btnLeft.onclick = () => moveToAdjacentCard(row, -1);
  }

  if (btnRight) {
    btnRight.onclick = () => moveToAdjacentCard(row, 1);
  }

  row.addEventListener("scroll", onScroll, { passive: true });

  function onResize() {
    const current = getClosestCenteredCard(row) || row.querySelector(".card");
    if (!current) return;

    requestAnimationFrame(() => {
      centerCard(row, current, "auto");
      scheduleTwoLinesScan(carousel);
    });
  }

  row.__resizeHandler = onResize;
  window.addEventListener("resize", onResize, { passive: true });

  row.__carouselCleanup = () => {
    window.clearTimeout(snapTimer);
    row.removeEventListener("scroll", onScroll);
    if (row.__resizeHandler) {
      window.removeEventListener("resize", row.__resizeHandler);
    }
  };

  requestAnimationFrame(() => {
    const firstCard = row.querySelector(".card");
    if (firstCard) {
      centerCard(row, firstCard, "auto");
    }
    scheduleTwoLinesScan(carousel);
  });
}

function setRow(el, html) {
  if (!el) return;
  resetCarouselState(el);
  el.innerHTML = html;
  enhanceCarouselCardsWithQuickPlus(el);
  scheduleTwoLinesScan(el);
}

/* =========================================================
   CONTINUE WATCHING HELPERS
========================================================= */

function buildContinueHref(row) {
  const m = row?.movies;
  if (!m?.id) return "#";

  const episodeId = row?.episode_id || row?.episodes?.id || null;
  const collectionId = m?.collection_id || null;

  return buildTitleUrl(m.id, {
    collectionId,
    episodeId
  });
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

  if (!totalSec && m?.category === "movie") {
    totalSec = Number(m?.duration_minutes || 0) * 60;
  }

  if (totalSec > 0) {
    return Math.min(98, Math.max(2, Math.round((progressSec / totalSec) * 100)));
  }

  return 8;
}

/* =========================================================
   INIT
========================================================= */

async function init() {
  applyDisguisedCssFromId(0, {
    linkId: "app-style",
    disguisedPrefix: "/css/satvplusClient.",
    disguisedSuffix: ".css"
  });

  enableDataHrefNavigation();
  initTopnavSearch();
  initSearchExperience();

  installQuickModalGlobalEvents();

  renderNav({ active: "home" });
  await renderAuthButtons();

  installTwoLinesObservers();

  const session = await getSession();
  const userId = session?.user?.id || null;
  ensureMyListNavLink(userId);

  const contWrap = $("#continue-wrap");
  const contRow = $("#continue-row");

  if (userId) {
    try {
      const rows = await fetchContinueWatching(userId, 24);
      const filtered = rows.filter((r) => (Number(r.progress_seconds) || 0) >= 5);

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
          uniqueRows.map((r) => {
            const m = r.movies;
            if (!m) return "";

            const href = buildContinueHref(r);
            const subtitle = buildContinueSubtitle(r);
            const pct = buildContinuePct(r);

            return addMovieIdToCardHtml(
              cardHtml(m, href, subtitle, pct, {
                showCollectionOverlay: true
              }),
              m?.id
            );
          }).join("")
        );

        buildCarousel(contRow);
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
    setRow(latestRow, latest.map((m) => homeCatalogCardHtml(m)).join(""));
    promoteCatalogCardBadges(latestRow);
    buildCarousel(latestRow);

    const movies = await fetchByCategory("movie", 24);
    setRow(moviesRow, movies.map((m) => homeCatalogCardHtml(m)).join(""));
    promoteCatalogCardBadges(moviesRow);
    buildCarousel(moviesRow);

    const series = await fetchByCategory("series", 24);
    setRow(seriesRow, series.map((m) => homeCatalogCardHtml(m)).join(""));
    promoteCatalogCardBadges(seriesRow);
    buildCarousel(seriesRow);

    const heroPoolMap = new Map();
    [...latest, ...movies, ...series].forEach((item) => {
      if (item?.id && !heroPoolMap.has(item.id)) heroPoolMap.set(item.id, item);
    });

    startHomeHeroRotation([...heroPoolMap.values()], { userId });

    scheduleTwoLinesScan();
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
