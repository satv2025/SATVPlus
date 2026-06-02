// home.js
// REEMPLAZO COMPLETO - FIX CARRUSEL BUG (PATRÓN PORTAL PARA OVERLAY)
//
// CAMBIOS APLICADOS:
// - El overlay ya no vive dentro de .card (lo que obligaba a romper el overflow del carrusel).
// - Ahora se inyecta directo en document.body (Portal).
// - Se calculan coordenadas absolutas reales (top/left) sumando scrollX/scrollY.
// - Se elimina la mutación de clases "fila-hover-abierta" que causaba el salto visual.

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
   TIPOGRAFÍA INLINE SOLO PARA 2 LÍNEAS
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

  const fsVal = style.getPropertyValue("font-size");
  const fsPr = style.getPropertyPriority("font-size");
  const wVal = style.getPropertyValue("font-weight");
  const wPr = style.getPropertyPriority("font-weight");

  if (hadOur) {
    style.removeProperty("font-size");
    style.removeProperty("font-weight");
  }

  const raw = lineRawFromMetrics(el);

  if (hadOur) {
    if (fsVal) style.setProperty("font-size", fsVal, fsPr);
    if (wVal) style.setProperty("font-weight", wVal, wPr);
  }

  return raw;
}

function isBaseExactlyTwoLines(el) {
  const raw = measureBaseLineRaw(el);
  return raw > (2 - TWO_LINE_TOL) && raw < (2 + TWO_LINE_TOL);
}

function setCondensedInline(el, weight) {
  el.style.setProperty("font-size", "12px", "important");
  el.style.setProperty("font-weight", String(weight), "important");
  el.dataset.twoLinesApplied = "1";
  el.dataset.twoLinesWeight = String(weight);
}

function clearCondensedInlineIfOurs(el) {
  if (el.dataset.twoLinesApplied !== "1") return;
  el.style.removeProperty("font-size");
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
   HOME HERO DESTACADO ESTABLE
========================================================= */

let __homeHeroRotationTimer = null;
const HOME_HERO_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const HOME_HERO_STORAGE_PREFIX = "homeHeroSelection:v1";

/* =========================================================
   HOME HERO TRAILER VIDEO
========================================================= */

const HERO_VOLUME_ICON_MUTE = "https://satvplus.com.ar/images/svg/heromute.svg";
const HERO_VOLUME_ICON_UNMUTE = "https://satvplus.com.ar/images/svg/heroon.svg";

/* =========================================================
   CARD QUICK MODAL
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
  document.documentElement.style.scrollBehavior = "auto";
}

function unlockQuickModalScroll() {
  document.body.classList.remove("card-quick-modal-open");
  document.documentElement.style.scrollBehavior = "";
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

/* =========================================================
   HOME SESSION CACHE
========================================================= */

let __homeSessionCache = null;
let __homeUserIdCache = null;
let __homeSessionPromise = null;

async function getHomeSessionCached() {
  if (__homeSessionCache) return __homeSessionCache;
  if (__homeSessionPromise) return __homeSessionPromise;

  __homeSessionPromise = getSession()
    .then((s) => {
      __homeSessionCache = s || null;
      __homeUserIdCache = s?.user?.id || null;
      return __homeSessionCache;
    })
    .catch(() => null)
    .finally(() => {
      __homeSessionPromise = null;
    });

  return __homeSessionPromise;
}

function getHomeUserIdCachedSync() {
  return __homeUserIdCache || null;
}

/* =========================================================
   ICONOS (+ / -) PARA MI LISTA
========================================================= */

const MYLIST_ICON_PLUS = `
  <svg class="card-quick-plus-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1920" aria-hidden="true" focusable="false">
    <path d="M866.332 213v653.332H213v186.666h653.332v653.332h186.666v-653.332h653.332V866.332h-653.332V213z" fill-rule="evenodd"></path>
  </svg>
`;

const MYLIST_ICON_MINUS = `
  <svg class="card-quick-plus-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1920" aria-hidden="true" focusable="false">
    <path d="M213 866.332h1493.332v186.666H213z" fill-rule="evenodd"></path>
  </svg>
`;

function setMyListPlusMinusIcon(btn, added) {
  if (!btn) return;
  btn.innerHTML = added ? MYLIST_ICON_MINUS : MYLIST_ICON_PLUS;
}

/* =========================================================
   MI LISTA - Supabase + fallback local
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

function setMyListIconBtnState(btn, { contentId, added = false, pending = false, source = "unknown" } = {}) {
  if (!btn || !contentId) return;

  btn.dataset.myListContentId = String(contentId);
  btn.dataset.myListState = added ? "in" : "out";
  btn.dataset.myListPending = pending ? "1" : "0";
  btn.dataset.myListSource = source;

  btn.classList.toggle("is-active", !!added);
  btn.setAttribute("aria-pressed", String(!!added));
  btn.setAttribute("aria-label", added ? "Quitar de Mi Lista" : "Agregar a Mi Lista");

  setMyListPlusMinusIcon(btn, !!added);

  try { btn.disabled = !!pending; } catch { }
}

async function refreshMyListIconButton(btn, { userId, contentId }) {
  if (!btn || !contentId) return null;

  setMyListIconBtnState(btn, {
    contentId,
    added: isInMyListLocal(contentId),
    pending: true,
    source: "unknown"
  });

  const state = await resolveHeroMyListState({ userId, contentId });

  setMyListIconBtnState(btn, {
    contentId,
    added: state.added,
    pending: false,
    source: state.source
  });

  return state;
}

function bindMyListIconButton(btn, { userId, contentId }) {
  if (!btn || !contentId) return;
  if (btn.dataset.myListBound === "1") return;
  btn.dataset.myListBound = "1";

  refreshMyListIconButton(btn, { userId, contentId }).catch(() => {
    setMyListIconBtnState(btn, {
      contentId,
      added: isInMyListLocal(contentId),
      pending: false,
      source: "local"
    });
  });

  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    const currentId = btn.dataset.myListContentId || String(contentId);
    if (!currentId) return;
    if (btn.dataset.myListPending === "1") return;

    setMyListIconBtnState(btn, {
      contentId: currentId,
      added: btn.dataset.myListState === "in",
      pending: true,
      source: btn.dataset.myListSource || "unknown"
    });

    try {
      const session = __homeSessionCache || (await getHomeSessionCached());
      const uid = userId || session?.user?.id || null;

      const state = await resolveHeroMyListState({ userId: uid, contentId: currentId });

      if (state.source === "supabase" && uid) {
        if (state.added) {
          await removeFromMyListRemote(uid, currentId);
          setLocalMyListMembership(currentId, false);
          setMyListIconBtnState(btn, { contentId: currentId, added: false, pending: false, source: "supabase" });
          toast?.("Quitado de Mi Lista.", "success");
        } else {
          await addToMyListRemote(uid, currentId);
          setLocalMyListMembership(currentId, true);
          setMyListIconBtnState(btn, { contentId: currentId, added: true, pending: false, source: "supabase" });
          toast?.("Agregado a Mi Lista.", "success");
        }
        return;
      }

      const added = toggleLocalMyList(currentId);
      setMyListIconBtnState(btn, { contentId: currentId, added, pending: false, source: "local" });
      toast?.(added ? "Agregado a Mi Lista." : "Quitado de Mi Lista.", "success");
    } catch (e) {
      console.warn("[home] toggle mylist icon error:", e);
      try {
        const session = __homeSessionCache || (await getHomeSessionCached());
        const uid = userId || session?.user?.id || null;
        await refreshMyListIconButton(btn, { userId: uid, contentId: currentId });
      } catch {
        setMyListIconBtnState(btn, {
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

/* =========================================================
   MAS INFO
========================================================= */

function buildCardMoreInfoButton(movieId) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "card-more-info-btn";
  btn.innerHTML = `${MYLIST_ICON_PLUS}<span>Más</span>`;
  btn.setAttribute("aria-label", "Mas info");

  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    openQuickCardModal(movieId, btn);
  });

  return btn;
}

function ensureMoreInfoNextToTitle(card, movieId) {
  const titleEl = card?.querySelector?.(".card-title");
  if (!titleEl) return;

  if (titleEl.querySelector(".card-more-info-btn")) return;

  const btn = buildCardMoreInfoButton(movieId);

  titleEl.style.position = titleEl.style.position || "relative";
  titleEl.style.paddingRight = titleEl.style.paddingRight || "86px";

  btn.style.position = "absolute";
  btn.style.right = "10px";
  btn.style.top = "50%";
  btn.style.transform = "translateY(-50%)";
  btn.style.zIndex = "2";

  titleEl.appendChild(btn);
}

/* =========================================================
   HERO MYLIST
========================================================= */

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
   QUICK MODAL
========================================================= */

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

      const mediaInner = mediaWrap.querySelector(".card-quick-modal-media") || mediaWrap;

      let myListFloat = mediaInner.querySelector(".card-quick-modal-mylist-float");
      if (!myListFloat) {
        myListFloat = document.createElement("button");
        myListFloat.type = "button";
        myListFloat.className = "card-quick-modal-mylist-float";
        myListFloat.setAttribute("aria-label", "Agregar a Mi Lista");
        myListFloat.setAttribute("aria-pressed", "false");
        myListFloat.innerHTML = MYLIST_ICON_PLUS;
        mediaInner.appendChild(myListFloat);
      }

      const session = __homeSessionCache || (await getHomeSessionCached());
      const userId = session?.user?.id || null;
      const contentId = String(movie.id);
      bindMyListIconButton(myListFloat, { userId, contentId });
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

/* =========================================================
   OVERLAY HOVER DE TARJETAS
========================================================= */

const TEXTOS_HOVER_TARJETA = {
  cargando: "Cargando…",
  errorCarga: "No se pudo cargar.",
  sinTitulo: "Sin título",
  sinSinopsis: "Sin sinopsis disponible.",
  reproducir: "Reproducir",
  agregarMiLista: "Agregar a Mi Lista",
  serie: "Serie",
  temporadas: "temporadas",
  episodio: "episodio",
  episodios: "episodios",
  minuto: "min",
  hora: "h"
};

const ICONO_BOTON_REPRODUCIR = `
  <svg class="icono-boton-reproducir" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path d="M23.5 17.2v29.6c0 2.1 2.3 3.4 4.1 2.3l23.1-14.8c1.6-1 1.6-3.4 0-4.4L27.6 15C25.8 13.8 23.5 15.1 23.5 17.2z" fill="currentColor"></path>
  </svg>
`;

const __cachePeliculasHoverTarjeta = new Map();

let __tarjetaHoverActiva = null;
let __secuenciaGlobalHoverTarjeta = 0;
let __eventosGlobalesHoverInstalados = false;

let __bloquearCierreHoverHasta = 0;
let __ultimoPointerHoverX = 0;
let __ultimoPointerHoverY = 0;

const SELECTOR_INTERACTIVO_HOVER_TARJETA = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "[role='button']",
  ".boton-mi-lista-hover",
  ".card-quick-modal-volume-btn",
  ".boton-reproducir-hover"
].join(", ");

function bloquearCierreHoverTarjeta(ms = 900) {
  __bloquearCierreHoverHasta = Date.now() + ms;
}

function cierreHoverBloqueado() {
  return Date.now() < __bloquearCierreHoverHasta;
}

function registrarPointerHover(ev) {
  if (!ev) return;

  if (Number.isFinite(ev.clientX)) __ultimoPointerHoverX = ev.clientX;
  if (Number.isFinite(ev.clientY)) __ultimoPointerHoverY = ev.clientY;
}

// NUEVO: Busca el overlay en el documento, ya no solo en la card
function targetDentroOverlayHover(target) {
  return !!target?.closest?.(".overlay-hover-tarjeta");
}

function targetDentroCardHoverActiva(target, card) {
  if (!target || !card) return false;

  let overlay = null;
  document.querySelectorAll(".overlay-hover-tarjeta").forEach(n => {
    if (n.__hostCard === card) overlay = n;
  });

  return (
    card.contains(target) ||
    (overlay && overlay.contains(target)) ||
    !!target.closest?.(".overlay-hover-tarjeta")
  );
}

function punteroDentroCardUOverlay(card) {
  if (!card) return false;

  let overlay = null;
  document.querySelectorAll(".overlay-hover-tarjeta").forEach(n => {
    if (n.__hostCard === card) overlay = n;
  });

  let el = null;
  try {
    el = document.elementFromPoint(__ultimoPointerHoverX, __ultimoPointerHoverY);
  } catch {
    el = null;
  }
  if (!el) return false;

  return (
    card.contains(el) ||
    (overlay && overlay.contains(el)) ||
    !!el.closest?.(".overlay-hover-tarjeta")
  );
}

function relatedTargetDentroCardUOverlay(card, relatedTarget) {
  if (!card || !relatedTarget) return false;

  let overlay = null;
  document.querySelectorAll(".overlay-hover-tarjeta").forEach(n => {
    if (n.__hostCard === card) overlay = n;
  });

  return (
    card.contains(relatedTarget) ||
    (overlay && overlay.contains(relatedTarget)) ||
    !!relatedTarget.closest?.(".overlay-hover-tarjeta")
  );
}

function mantenerHoverVivo(card, ms = 900) {
  bloquearCierreHoverTarjeta(ms);

  if (card) {
    clearTimeout(card.__hoverCloseTimer);
    clearTimeout(card.__hoverSafetyCloseTimer);
  }
}

/* =========================================================
   SUSPENDER NAVEGACIÓN BASE DE LA CARD
========================================================= */

function obtenerHrefHoverTarjeta(card, movieId) {
  if (!card) return buildTitleUrl(movieId);

  return (
    card.dataset.hoverSavedDataHref ||
    card.dataset.hoverSavedHref ||
    card.dataset.href ||
    card.getAttribute("data-href") ||
    card.getAttribute("href") ||
    buildTitleUrl(movieId)
  );
}

function suspenderNavegacionBaseCardHover(card) {
  if (!card || card.dataset.hoverNavSuspendida === "1") return;

  const dataHref =
    card.dataset.href ||
    card.getAttribute("data-href") ||
    "";

  const hrefAttr =
    card.getAttribute("href") ||
    "";

  if (dataHref) {
    card.dataset.hoverSavedDataHref = dataHref;
  }

  if (hrefAttr) {
    card.dataset.hoverSavedHref = hrefAttr;
  }

  try {
    delete card.dataset.href;
  } catch { }

  try {
    card.removeAttribute("data-href");
  } catch { }

  try {
    if (card.matches?.("a[href]")) {
      card.removeAttribute("href");
    }
  } catch { }

  card.dataset.hoverNavSuspendida = "1";
}

function restaurarNavegacionBaseCardHover(card) {
  if (!card || card.dataset.hoverNavSuspendida !== "1") return;

  const dataHref = card.dataset.hoverSavedDataHref || "";
  const hrefAttr = card.dataset.hoverSavedHref || "";

  if (dataHref) {
    card.dataset.href = dataHref;
    card.setAttribute("data-href", dataHref);
  }

  if (hrefAttr && card.matches?.("a")) {
    card.setAttribute("href", hrefAttr);
  }

  delete card.dataset.hoverSavedDataHref;
  delete card.dataset.hoverSavedHref;
  delete card.dataset.hoverNavSuspendida;
}

/* =========================================================
   HELPERS DE METADATA
========================================================= */

function construirTextoDuracionHover(movie = {}) {
  const categoria = String(movie?.category || "").toLowerCase();
  const meta = movie?.movie_meta || null;

  if (categoria === "series") {
    const cantidadTemporadas = Number(meta?.seasons_count || movie?.seasons_count || 0);
    const cantidadEpisodios = Number(meta?.episodes_count || movie?.episodes_count || 0);

    if (cantidadTemporadas > 2) {
      return `${cantidadTemporadas} ${TEXTOS_HOVER_TARJETA.temporadas}`;
    }

    if (cantidadEpisodios > 0) {
      return `${cantidadEpisodios} ${cantidadEpisodios === 1
        ? TEXTOS_HOVER_TARJETA.episodio
        : TEXTOS_HOVER_TARJETA.episodios
        }`;
    }

    return TEXTOS_HOVER_TARJETA.serie;
  }

  if (movie?.duration_text) {
    return String(movie.duration_text);
  }

  const minutos = Number(movie?.duration_minutes || 0);

  if (minutos > 0) {
    if (minutos < 60) return `${minutos} ${TEXTOS_HOVER_TARJETA.minuto}`;

    const horas = Math.floor(minutos / 60);
    const restoMinutos = minutos % 60;

    return restoMinutos
      ? `${horas} ${TEXTOS_HOVER_TARJETA.hora} ${restoMinutos} ${TEXTOS_HOVER_TARJETA.minuto}`
      : `${horas} ${TEXTOS_HOVER_TARJETA.hora}`;
  }

  return "";
}

function obtenerEdadHover(movie = {}) {
  const raw = String(
    movie?.movie_meta?.fullage ||
    movie?.fullage ||
    ""
  ).trim();

  if (!raw) return "";

  const norm = raw
    .toLowerCase()
    .replaceAll("público", "publico")
    .replace(/\s+/g, " ")
    .trim();

  if (/^atp\b/i.test(raw)) return "ATP";
  if (/(apto|apta)\s+para\s+todo\s+publico/.test(norm)) return "ATP";

  const m = raw.match(/(\+\s*\d{1,2}|\d{1,2}\s*\+)/);
  if (m) return m[0].replace(/\s+/g, "");

  const m2 = norm.match(/mayores\s+de\s+(\d{1,2})/i);
  if (m2) return `${m2[1]}+`;

  if (/(apto|apta)\s+para\b/.test(norm)) return "Semi-ATP";

  const short = raw.match(/^[A-Za-z0-9+\-]{2,8}/);
  return short ? short[0] : "";
}

function construirMetaHoverPartes(movie = {}) {
  const items = [];

  if (movie.release_year) {
    items.push(String(movie.release_year));
  }

  const duracion = construirTextoDuracionHover(movie);
  if (duracion) {
    items.push(duracion);
  }

  return {
    items,
    age: obtenerEdadHover(movie)
  };
}

function renderizarMetaHover(metaEl, movie = {}) {
  if (!metaEl) return;

  const { items, age } = construirMetaHoverPartes(movie);

  metaEl.innerHTML = "";

  const hay = (items && items.length > 0) || !!age;
  metaEl.hidden = !hay;
  if (!hay) return;

  metaEl.style.setProperty("display", "flex", "important");
  metaEl.style.setProperty("align-items", "center", "important");
  metaEl.style.setProperty("gap", "6px", "important");
  metaEl.style.setProperty("flex-wrap", "nowrap", "important");
  metaEl.style.setProperty("white-space", "nowrap", "important");

  const frag = document.createDocumentFragment();

  const addSep = () => {
    const sep = document.createElement("span");
    sep.className = "overlay-hover-tarjeta-meta-sep";
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "•";
    sep.style.setProperty("opacity", "0.65");
    sep.style.setProperty("margin", "0 2px");
    frag.appendChild(sep);
  };

  (items || []).forEach((txt, idx) => {
    const s = document.createElement("span");
    s.className = "overlay-hover-tarjeta-meta-item";
    s.textContent = String(txt || "");
    s.style.setProperty("white-space", "nowrap");
    frag.appendChild(s);

    if (idx < items.length - 1) addSep();
  });

  if (age) {
    if (items.length > 0) addSep();

    const badge = document.createElement("span");
    badge.className = "overlay-hover-tarjeta-age";
    badge.textContent = age;

    badge.style.setProperty("display", "inline-flex");
    badge.style.setProperty("align-items", "center");
    badge.style.setProperty("justify-content", "center");
    badge.style.setProperty("padding", "0 10px");
    badge.style.setProperty("min-height", "24px");
    badge.style.setProperty("border-radius", "6px");
    badge.style.setProperty("border", "1px solid rgba(214, 225, 239, .28)");
    badge.style.setProperty("background", "rgba(226, 236, 248, .20)");
    badge.style.setProperty("color", "rgba(255,255,255,.95)");
    badge.style.setProperty("backdrop-filter", "blur(8px)");
    badge.style.setProperty("-webkit-backdrop-filter", "blur(8px)");
    badge.style.setProperty("font-size", "12px");
    badge.style.setProperty("font-weight", "800");
    badge.style.setProperty("line-height", "1");
    badge.style.setProperty("letter-spacing", ".01em");
    badge.style.setProperty("white-space", "nowrap");

    frag.appendChild(badge);
  }

  metaEl.appendChild(frag);
}

function hoverTarjetaDeshabilitado() {
  try {
    return window.matchMedia?.("(hover: none), (pointer: coarse)")?.matches || window.innerWidth <= 768;
  } catch {
    return window.innerWidth <= 768;
  }
}

function forzarSinopsisEnBloque(nodo) {
  if (!nodo) return;

  nodo.style.setProperty("display", "block", "important");
  nodo.style.setProperty("white-space", "normal", "important");
  nodo.style.setProperty("overflow", "visible", "important");
  nodo.style.setProperty("text-overflow", "clip", "important");
  nodo.style.setProperty("max-height", "none", "important");
  nodo.style.setProperty("-webkit-line-clamp", "unset", "important");
  nodo.style.setProperty("-webkit-box-orient", "initial", "important");
}

/* =========================================================
   CONTEXTO DEL CARRUSEL (Actualizado)
   Ya no rompemos el overflow del carrusel con clases.
========================================================= */

function alternarContextoHoverTarjeta(card, abierto) {
  if (!card) return;

  if (abierto) {
    card.classList.add("tarjeta-hover-host");
    suspenderNavegacionBaseCardHover(card);
  } else {
    card.classList.remove("tarjeta-hover-host");
  }
}

/* =========================================================
   LIMPIEZA DE VIDEO / OVERLAY (Actualizado)
========================================================= */

function detenerYResetearMediaHover(card) {
  if (!card) return;

  document.querySelectorAll(".overlay-hover-tarjeta").forEach((overlay) => {
    if (overlay.__hostCard !== card) return;
    try {
      overlay.querySelectorAll("video").forEach((video) => {
        try {
          video.pause();
          video.muted = true;
          video.currentTime = 0;
          video.removeAttribute("src");
          video.load?.();
        } catch { }
      });
    } catch { }
  });
}

function eliminarOverlayHoverTarjeta(card) {
  if (!card) return;
  detenerYResetearMediaHover(card);

  document.querySelectorAll(".overlay-hover-tarjeta").forEach((overlay) => {
    if (overlay.__hostCard === card) {
      try { overlay.remove(); } catch { }
    }
  });
}

function resetearHoverTarjeta(card, { eliminarOverlay = true } = {}) {
  if (!card) return;

  clearTimeout(card.__hoverOpenTimer);
  clearTimeout(card.__hoverCloseTimer);
  clearTimeout(card.__hoverSafetyCloseTimer);

  card.dataset.hoverSeq = "";

  card.classList.remove(
    "tarjeta-hover-abierta",
    "tarjeta-hover-host"
  );

  detenerYResetearMediaHover(card);

  let overlayNode = null;
  document.querySelectorAll(".overlay-hover-tarjeta").forEach((n) => {
    if (n.__hostCard === card) overlayNode = n;
  });

  if (overlayNode) {
    overlayNode.classList.remove("overlay-hover-abierto");
    overlayNode.setAttribute("aria-hidden", "true");

    if (eliminarOverlay) {
      try { overlayNode.remove(); } catch { }
    }
  }

  alternarContextoHoverTarjeta(card, false);
  restaurarNavegacionBaseCardHover(card);
}

function resetearTodosLosHoversTarjeta({ excepto = null } = {}) {
  const tarjetas = new Set();

  document
    .querySelectorAll(".tarjeta-hover-host, .tarjeta-hover-abierta")
    .forEach((card) => tarjetas.add(card));

  document.querySelectorAll(".overlay-hover-tarjeta").forEach((overlay) => {
    const card = overlay.__hostCard;
    if (card) {
      tarjetas.add(card);
    } else {
      try { overlay.remove(); } catch { }
    }
  });

  tarjetas.forEach((card) => {
    if (excepto && card === excepto) return;
    resetearHoverTarjeta(card, { eliminarOverlay: true });
  });

  if (!excepto) {
    __tarjetaHoverActiva = null;
  }
}

/* =========================================================
   CREACIÓN DEL OVERLAY (Actualizado Portal)
========================================================= */

function asegurarOverlayHoverTarjeta(card, movieId) {
  if (!card || !movieId) return null;

  eliminarOverlayHoverTarjeta(card);
  suspenderNavegacionBaseCardHover(card);

  const overlay = document.createElement("div");
  overlay.className = "overlay-hover-tarjeta";
  overlay.setAttribute("aria-hidden", "true");

  // Vinculamos la tarjeta de forma directa al DOM del overlay
  overlay.__hostCard = card;

  const hrefInicial = obtenerHrefHoverTarjeta(card, movieId);

  overlay.innerHTML = `
    <div class="overlay-hover-tarjeta-inner">
      <div class="overlay-hover-tarjeta-media">
        <div class="overlay-hover-tarjeta-cargando">${TEXTOS_HOVER_TARJETA.cargando}</div>
      </div>

      <div class="overlay-hover-tarjeta-cuerpo">
        <div class="overlay-hover-tarjeta-acciones">
          <a class="boton-reproducir-hover" href="${hrefInicial}" aria-label="${TEXTOS_HOVER_TARJETA.reproducir}">
            ${ICONO_BOTON_REPRODUCIR}
            <span>${TEXTOS_HOVER_TARJETA.reproducir}</span>
          </a>

          <button class="boton-mi-lista-hover" type="button" aria-label="${TEXTOS_HOVER_TARJETA.agregarMiLista}" aria-pressed="false">
            ${MYLIST_ICON_PLUS}
          </button>
        </div>

        <div class="overlay-hover-tarjeta-titulo"></div>
        <div class="overlay-hover-tarjeta-meta"></div>
        <div class="overlay-hover-tarjeta-sinopsis"></div>
      </div>
    </div>
  `;

  const mantenerDesdeOverlay = (ev) => {
    registrarPointerHover(ev);
    mantenerHoverVivo(card, 1200);
    ev.stopPropagation();
  };

  overlay.addEventListener("pointerenter", (ev) => {
    registrarPointerHover(ev);
    mantenerHoverVivo(card, 1200);
  });

  overlay.addEventListener("pointermove", mantenerDesdeOverlay, { passive: true });
  overlay.addEventListener("pointerdown", mantenerDesdeOverlay, { passive: true });
  overlay.addEventListener("pointerup", mantenerDesdeOverlay, { passive: true });

  overlay.addEventListener("mousedown", (ev) => {
    mantenerHoverVivo(card, 1200);
    ev.stopPropagation();
  });

  overlay.addEventListener("mouseup", (ev) => {
    mantenerHoverVivo(card, 1200);
    ev.stopPropagation();
  });

  overlay.addEventListener("touchstart", (ev) => {
    mantenerHoverVivo(card, 1200);
    ev.stopPropagation();
  }, { passive: true });

  overlay.addEventListener("mouseenter", () => {
    mantenerHoverVivo(card, 1200);
  });

  overlay.addEventListener("mousemove", (ev) => {
    registrarPointerHover(ev);
    mantenerHoverVivo(card, 700);
  }, { passive: true });

  overlay.addEventListener("mouseleave", (ev) => {
    registrarPointerHover(ev);

    clearTimeout(card.__hoverCloseTimer);

    if (relatedTargetDentroCardUOverlay(card, ev.relatedTarget)) {
      mantenerHoverVivo(card, 700);
      return;
    }

    card.__hoverCloseTimer = setTimeout(() => {
      cerrarOverlayHoverTarjeta(card, {
        forzar: true
      });
    }, 120);
  });

  overlay.addEventListener("click", (ev) => {
    mantenerHoverVivo(card, 1200);

    const interactivo = ev.target.closest(SELECTOR_INTERACTIVO_HOVER_TARJETA);

    if (interactivo) {
      ev.stopPropagation();

      if (!interactivo.matches("a, .boton-reproducir-hover")) {
        ev.preventDefault();
      }

      return;
    }

    ev.preventDefault();
    ev.stopPropagation();

    const href = obtenerHrefHoverTarjeta(card, movieId);
    if (href) window.location.href = href;
  });

  // MAGIA DEL PORTAL: Se inyecta directo en el body
  document.body.appendChild(overlay);
  return overlay;
}

/* =========================================================
   BOTÓN MI LISTA EN EL OVERLAY
========================================================= */

function obtenerBotonMiListaHover(overlay) {
  if (!overlay) return null;

  const acciones = overlay.querySelector(".overlay-hover-tarjeta-acciones");
  if (!acciones) return null;

  acciones.querySelectorAll(".boton-mi-lista-hover").forEach((btn) => {
    try {
      btn.remove();
    } catch { }
  });

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "boton-mi-lista-hover";
  btn.setAttribute("aria-label", TEXTOS_HOVER_TARJETA.agregarMiLista);
  btn.setAttribute("aria-pressed", "false");
  btn.innerHTML = MYLIST_ICON_PLUS;

  btn.addEventListener("pointerdown", (ev) => {
    bloquearCierreHoverTarjeta(1200);
    ev.stopPropagation();
  }, { passive: true });

  btn.addEventListener("mousedown", (ev) => {
    bloquearCierreHoverTarjeta(1200);
    ev.stopPropagation();
  });

  btn.addEventListener("click", (ev) => {
    bloquearCierreHoverTarjeta(1200);
    ev.preventDefault();
    ev.stopPropagation();
  });

  acciones.appendChild(btn);
  return btn;
}

/* =========================================================
   POSICIÓN / ANIMACIÓN (Actualizado Portal absoluto)
========================================================= */

function posicionarOverlayHoverTarjeta(card, overlay) {
  if (!card || !overlay) return;

  const rect = card.getBoundingClientRect();
  const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;

  // Como estamos en body, necesitamos sumar el scroll actual
  const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;

  const anchoFinal = Math.min(520, Math.max(360, viewportW - 24));
  overlay.style.width = `${Math.round(anchoFinal)}px`;

  // Centro absoluto de la tarjeta
  const absCenterX = rect.left + scrollX + (rect.width / 2);
  const absTopY = rect.top + scrollY;

  overlay.style.position = "absolute";
  overlay.style.top = `${Math.round(absTopY)}px`;
  overlay.style.left = `${Math.round(absCenterX)}px`;

  // Calculamos el desplazamiento necesario para que no se corte en los bordes del viewport
  const viewportLeft = rect.left + (rect.width / 2) - (anchoFinal / 2);
  let desplazamientoX = 0;
  const margenViewport = 12;

  if (viewportLeft < margenViewport) {
    desplazamientoX = margenViewport - viewportLeft;
  } else if (viewportLeft + anchoFinal > viewportW - margenViewport) {
    desplazamientoX = (viewportW - margenViewport) - (viewportLeft + anchoFinal);
  }

  overlay.style.setProperty("--desplazamiento-hover-x", `${Math.round(desplazamientoX)}px`);
}

function reiniciarAnimacionOverlayHover(card, overlay) {
  if (!card || !overlay) return;

  card.classList.remove("tarjeta-hover-abierta");
  overlay.classList.remove("overlay-hover-abierto");
  overlay.setAttribute("aria-hidden", "false");

  void overlay.offsetWidth;

  requestAnimationFrame(() => {
    alternarContextoHoverTarjeta(card, true);
    posicionarOverlayHoverTarjeta(card, overlay);

    requestAnimationFrame(() => {
      card.classList.add("tarjeta-hover-abierta");
      overlay.classList.add("overlay-hover-abierto");
    });
  });
}

/* =========================================================
   HIDRATACIÓN
========================================================= */

async function hidratarOverlayHoverTarjeta(card, movieId, seq) {
  if (!card || !movieId) return;

  let overlay = null;
  document.querySelectorAll(".overlay-hover-tarjeta").forEach(n => {
    if (n.__hostCard === card) overlay = n;
  });
  if (!overlay) return;

  try {
    let movie = __cachePeliculasHoverTarjeta.get(String(movieId));

    if (!movie) {
      movie = await fetchMovie(movieId);
      if (movie) __cachePeliculasHoverTarjeta.set(String(movieId), movie);
    }

    if (!movie || card.dataset.hoverSeq !== String(seq)) return;
    if (__tarjetaHoverActiva !== card) return;

    const media = overlay.querySelector(".overlay-hover-tarjeta-media");
    const titulo = overlay.querySelector(".overlay-hover-tarjeta-titulo");
    const meta = overlay.querySelector(".overlay-hover-tarjeta-meta");
    const sinopsis = overlay.querySelector(".overlay-hover-tarjeta-sinopsis");
    const botonReproducir = overlay.querySelector(".boton-reproducir-hover");

    if (titulo) {
      titulo.textContent = movie.title || TEXTOS_HOVER_TARJETA.sinTitulo;
    }

    if (meta) {
      renderizarMetaHover(meta, movie);
    }

    if (sinopsis) {
      sinopsis.textContent =
        movie.description ||
        movie.sinopsis ||
        TEXTOS_HOVER_TARJETA.sinSinopsis;

      forzarSinopsisEnBloque(sinopsis);
    }

    if (botonReproducir) {
      botonReproducir.href = buildTitleUrl(movie.id, {
        collectionId: movie.collection_id || null
      });

      botonReproducir.addEventListener("pointerdown", (ev) => {
        bloquearCierreHoverTarjeta(1200);
        ev.stopPropagation();
      }, { passive: true });

      botonReproducir.addEventListener("mousedown", (ev) => {
        bloquearCierreHoverTarjeta(1200);
        ev.stopPropagation();
      });

      botonReproducir.addEventListener("click", (ev) => {
        bloquearCierreHoverTarjeta(1200);
        ev.stopPropagation();
      });
    }

    if (media) {
      media.innerHTML = "";

      mountQuickModalTrailer(media, movie);

      const botonVolumen = media.querySelector(".card-quick-modal-volume-btn");

      if (botonVolumen) {
        botonVolumen.addEventListener("pointerdown", (ev) => {
          bloquearCierreHoverTarjeta(1200);
          ev.stopPropagation();
        }, { passive: true });

        botonVolumen.addEventListener("mousedown", (ev) => {
          bloquearCierreHoverTarjeta(1200);
          ev.stopPropagation();
        });

        botonVolumen.addEventListener("click", (ev) => {
          bloquearCierreHoverTarjeta(1200);
          ev.stopPropagation();
        });
      }

      const video = media.querySelector("video");

      if (video) {
        try {
          video.pause();
          video.muted = true;
          video.currentTime = 0;
          video.setAttribute("muted", "");
          video.playsInline = true;
          video.setAttribute("playsinline", "");
          video.setAttribute("webkit-playsinline", "");
        } catch { }

        const p = video.play?.();
        if (p && typeof p.catch === "function") p.catch(() => { });
      }
    }

    const botonMiLista = obtenerBotonMiListaHover(overlay);

    if (botonMiLista) {
      const session = __homeSessionCache || (await getHomeSessionCached());
      const userId = session?.user?.id || null;

      bindMyListIconButton(botonMiLista, {
        userId,
        contentId: String(movie.id)
      });
    }

    posicionarOverlayHoverTarjeta(card, overlay);
  } catch (e) {
    console.warn("[home] overlay hover tarjeta error:", e);

    const media = overlay.querySelector(".overlay-hover-tarjeta-media");

    if (media) {
      media.innerHTML = `<div class="overlay-hover-tarjeta-cargando">${TEXTOS_HOVER_TARJETA.errorCarga}</div>`;
    }
  }
}

/* =========================================================
   ABRIR / CERRAR
========================================================= */

function abrirOverlayHoverTarjeta(card, movieId) {
  if (!card || !movieId || hoverTarjetaDeshabilitado()) return;

  let __overlayExistente = null;
  document.querySelectorAll(".overlay-hover-tarjeta").forEach((n) => {
    if (n.__hostCard === card) __overlayExistente = n;
  });

  if (__overlayExistente?.classList?.contains?.("overlay-hover-abierto")) {
    __tarjetaHoverActiva = card;
    mantenerHoverVivo(card, 1500);
    return;
  }

  resetearTodosLosHoversTarjeta({ excepto: card });

  if (__tarjetaHoverActiva && __tarjetaHoverActiva !== card) {
    resetearHoverTarjeta(__tarjetaHoverActiva, { eliminarOverlay: true });
  }

  __tarjetaHoverActiva = card;

  clearTimeout(card.__hoverOpenTimer);
  clearTimeout(card.__hoverCloseTimer);
  clearTimeout(card.__hoverSafetyCloseTimer);

  suspenderNavegacionBaseCardHover(card);

  card.__hoverOpenTimer = setTimeout(() => {
    if (__tarjetaHoverActiva !== card) return;

    __secuenciaGlobalHoverTarjeta += 1;

    const seq = String(__secuenciaGlobalHoverTarjeta);
    card.dataset.hoverSeq = seq;

    const overlay = asegurarOverlayHoverTarjeta(card, movieId);
    if (!overlay) return;

    reiniciarAnimacionOverlayHover(card, overlay);
    hidratarOverlayHoverTarjeta(card, movieId, seq);
  }, 400);
}

function cerrarOverlayHoverTarjeta(card, options = {}) {
  if (!card) return;

  const inmediato = options.inmediato === true;
  const forzar = options.forzar === true;

  if (!forzar && !inmediato && cierreHoverBloqueado()) return;
  if (!forzar && !inmediato && punteroDentroCardUOverlay(card)) return;

  clearTimeout(card.__hoverOpenTimer);
  clearTimeout(card.__hoverCloseTimer);
  clearTimeout(card.__hoverSafetyCloseTimer);

  if (__tarjetaHoverActiva === card) {
    __tarjetaHoverActiva = null;
  }

  card.dataset.hoverSeq = "";

  let overlay = null;
  document.querySelectorAll(".overlay-hover-tarjeta").forEach((n) => {
    if (n.__hostCard === card) overlay = n;
  });

  const limpiar = () => {
    if (!forzar && cierreHoverBloqueado()) return;
    if (!forzar && punteroDentroCardUOverlay(card)) return;

    resetearHoverTarjeta(card, { eliminarOverlay: true });

    if (!document.querySelector(".tarjeta-hover-host")) {
      resetearTodosLosHoversTarjeta();
    }
  };

  if (!overlay || inmediato) {
    limpiar();
    return;
  }

  overlay.classList.remove("overlay-hover-abierto");
  overlay.setAttribute("aria-hidden", "true");
  card.classList.remove("tarjeta-hover-abierta");

  card.__hoverCloseTimer = setTimeout(limpiar, 280);
}

function programarCierreHoverTarjetaSiFuera(card, delay = 180) {
  if (!card) return;

  clearTimeout(card.__hoverSafetyCloseTimer);

  card.__hoverSafetyCloseTimer = setTimeout(() => {
    if (cierreHoverBloqueado()) return;
    if (punteroDentroCardUOverlay(card)) return;

    cerrarOverlayHoverTarjeta(card);
  }, delay);
}

/* =========================================================
   BIND POR CARD
========================================================= */

function bindCardHoverPreview(card, movieId) {
  if (!card || !movieId) return;
  if (card.dataset.hoverPreviewBound === "1") return;

  card.dataset.hoverPreviewBound = "1";

  card.addEventListener("mouseenter", (ev) => {
    registrarPointerHover(ev);
    abrirOverlayHoverTarjeta(card, String(movieId));
  }, { passive: true });

  card.addEventListener("mousemove", (ev) => {
    registrarPointerHover(ev);

    if (__tarjetaHoverActiva === card) {
      mantenerHoverVivo(card, 700);
    }
  }, { passive: true });

  card.addEventListener("mouseleave", (ev) => {
    registrarPointerHover(ev);

    if (relatedTargetDentroCardUOverlay(card, ev.relatedTarget)) {
      mantenerHoverVivo(card, 700);
      return;
    }

    clearTimeout(card.__hoverCloseTimer);

    card.__hoverCloseTimer = setTimeout(() => {
      cerrarOverlayHoverTarjeta(card, {
        forzar: true
      });
    }, 120);
  }, { passive: true });

  card.addEventListener("focusin", () => {
    let overlay = null;
    document.querySelectorAll(".overlay-hover-tarjeta").forEach(n => {
      if (n.__hostCard === card) overlay = n;
    });

    if (overlay?.classList?.contains?.("overlay-hover-abierto")) {
      mantenerHoverVivo(card, 1500);
      return;
    }
    abrirOverlayHoverTarjeta(card, String(movieId));
  });

  card.addEventListener("focusout", () => {
    if (__tarjetaHoverActiva === card) {
      mantenerHoverVivo(card, 1200);
    }
  });
}

/* =========================================================
   LIMPIEZA GLOBAL
========================================================= */

function instalarLimpiezaGlobalHoverTarjeta() {
  if (__eventosGlobalesHoverInstalados) return;
  __eventosGlobalesHoverInstalados = true;

  document.addEventListener("pointermove", (ev) => {
    registrarPointerHover(ev);

    const activa = __tarjetaHoverActiva;
    if (!activa) return;

    const target = ev.target;

    if (targetDentroCardHoverActiva(target, activa)) {
      mantenerHoverVivo(activa, 700);
      return;
    }

    if (cierreHoverBloqueado()) return;

    programarCierreHoverTarjetaSiFuera(activa, 260);
  }, { passive: true });

  document.addEventListener("pointerdown", (ev) => {
    registrarPointerHover(ev);

    const activa = __tarjetaHoverActiva;
    if (!activa) return;

    const target = ev.target;

    if (targetDentroCardHoverActiva(target, activa) || targetDentroOverlayHover(target)) {
      mantenerHoverVivo(activa, 1500);
      return;
    }

    bloquearCierreHoverTarjeta(450);
  }, { passive: true });

  document.addEventListener("click", (ev) => {
    const activa = __tarjetaHoverActiva;
    if (!activa) return;

    const target = ev.target;

    if (targetDentroCardHoverActiva(target, activa) || targetDentroOverlayHover(target)) {
      mantenerHoverVivo(activa, 1500);
      return;
    }

    bloquearCierreHoverTarjeta(450);
  }, true);

  window.addEventListener("blur", () => {
    resetearTodosLosHoversTarjeta();
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      resetearTodosLosHoversTarjeta();
    }
  });

  window.addEventListener("resize", () => {
    document.querySelectorAll(".card.tarjeta-hover-host").forEach((card) => {
      let overlay = null;
      document.querySelectorAll(".overlay-hover-tarjeta").forEach(n => {
        if (n.__hostCard === card) overlay = n;
      });

      if (overlay?.classList.contains("overlay-hover-abierto")) {
        posicionarOverlayHoverTarjeta(card, overlay);
      }
    });
  }, { passive: true });

  window.addEventListener("scroll", () => {
    if (__tarjetaHoverActiva && !cierreHoverBloqueado()) {
      cerrarOverlayHoverTarjeta(__tarjetaHoverActiva, {
        inmediato: true,
        forzar: true
      });
    }
  }, { passive: true });
}

instalarLimpiezaGlobalHoverTarjeta();

/* =========================================================
   CARDS
========================================================= */

function buildCardQuickPlusButton(movieId) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "card-quick-plus-btn card-mylist-plus-btn";
  btn.setAttribute("aria-label", "Agregar a Mi Lista");
  btn.setAttribute("aria-pressed", "false");
  btn.dataset.movieId = String(movieId);
  btn.innerHTML = MYLIST_ICON_PLUS;
  return btn;
}

function enhanceCarouselCardsWithQuickPlus(scope = document) {
  const cards =
    scope?.classList?.contains("card")
      ? [scope]
      : Array.from(scope.querySelectorAll(".card"));

  cards.forEach((card) => {
    let movieId =
      card.dataset.movieId ||
      card.getAttribute("data-movie-id") ||
      "";

    if (!movieId) {
      const href = String(card.dataset.href || card.getAttribute("data-href") || "");
      try {
        const url = new URL(href, window.location.origin);
        movieId = url.searchParams.get("title") || "";
      } catch { }
    }

    if (!movieId) return;

    card.dataset.movieId = String(movieId);

    card.querySelectorAll(".card-quick-plus-btn, .card-mylist-plus-btn").forEach((btn) => {
      try {
        btn.remove();
      } catch { }
    });

    ensureMoreInfoNextToTitle(card, movieId);

    bindCardHoverPreview(card, String(movieId));
  });
}

function addMovieIdToCardHtml(html, movieId) {
  if (!html || !movieId) return html || "";
  return String(html).replace(
    /<div\s+class="([^"]*\bcard\b[^"]*)"/,
    `<div class="$1" data-movie-id="${String(movieId)}"`
  );
}

/* =========================================================
   HOME HERO VIDEO + RESTO
========================================================= */

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

function getMovieCollectionId(movie) {
  return movie?.collection_id || null;
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
   LIVE MODE / CARDS / CAROUSEL / INIT
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

function homeCatalogCardHtml(movie) {
  const stateLabel = getMovieCardPublicLabel(movie);
  const href = buildTitleUrl(movie?.id, {
    collectionId: getMovieCollectionId(movie)
  });

  const html = stateLabel
    ? cardHtml(movie, href, stateLabel, null, { showCollectionOverlay: true })
    : cardHtml(movie, href, null, null, { showCollectionOverlay: true });

  return addMovieIdToCardHtml(html, movie?.id);
}

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

function getCarouselCards(row) {
  return Array.from(row?.querySelectorAll?.(".card") || []);
}

function getMaxScrollLeft(row) {
  if (!row) return 0;
  return Math.max(0, row.scrollWidth - row.clientWidth);
}

function getScrollStep(row) {
  if (!row) return 360;
  const card = row.querySelector(".card");
  const gap = parseFloat(getComputedStyle(row).columnGap || getComputedStyle(row).gap || "12") || 12;
  const cardW = card?.getBoundingClientRect?.().width || 280;
  const visibleCards = Math.max(1, Math.floor(row.clientWidth / Math.max(1, cardW + gap)));
  return Math.max(cardW + gap, (cardW + gap) * Math.max(1, visibleCards - 1));
}

function updateCarouselArrows(row) {
  const carousel = row?.closest?.(".carousel");
  if (!row || !carousel) return;

  const left = carousel.querySelector(".carousel-btn.left");
  const right = carousel.querySelector(".carousel-btn.right");
  const max = getMaxScrollLeft(row);
  const canScroll = max > 4;

  carousel.classList.toggle("no-arrows", !canScroll || row.dataset.arrows === "0");
  carousel.classList.toggle("is-at-start", row.scrollLeft <= 4);
  carousel.classList.toggle("is-at-end", row.scrollLeft >= max - 4);

  if (left) left.disabled = !canScroll || row.scrollLeft <= 4;
  if (right) right.disabled = !canScroll || row.scrollLeft >= max - 4;
}

function scrollCarouselPage(row, direction = 1) {
  if (!row) return;
  const max = getMaxScrollLeft(row);
  const next = Math.max(0, Math.min(max, row.scrollLeft + getScrollStep(row) * direction));
  row.scrollTo({ left: next, behavior: "smooth" });
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
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M15 6l-6 6 6 6" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const rightBtn = document.createElement("button");
  rightBtn.className = "carousel-btn right";
  rightBtn.type = "button";
  rightBtn.setAttribute("aria-label", "Siguiente");
  rightBtn.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 6l6 6-6 6" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const parent = row.parentElement;
  if (!parent) return null;

  parent.insertBefore(carousel, row);
  carousel.appendChild(leftBtn);
  carousel.appendChild(row);
  carousel.appendChild(rightBtn);

  return carousel;
}

function resetCarouselState(row) {
  if (!row) return;

  delete row.dataset.carouselReady;

  if (row.__carouselCleanup && typeof row.__carouselCleanup === "function") {
    try { row.__carouselCleanup(); } catch { }
  }

  delete row.__carouselCleanup;
  delete row.__resizeHandler;
  delete row.__scrollHandler;

  const carousel = row.closest(".carousel");
  if (carousel) {
    carousel.classList.remove("carousel-disabled", "no-arrows", "is-at-start", "is-at-end");
  }
}

function buildCarousel(row) {
  if (!row) return;
  if (row.dataset.carouselReady === "1") return;

  const cards = getCarouselCards(row);
  if (!cards.length) return;

  const carousel = ensureCarouselWrapper(row);
  if (!carousel) return;

  const btnLeft = carousel.querySelector(".carousel-btn.left");
  const btnRight = carousel.querySelector(".carousel-btn.right");

  row.dataset.carouselReady = "1";

  const onScroll = () => {
    if (row.__arrowRaf) cancelAnimationFrame(row.__arrowRaf);
    row.__arrowRaf = requestAnimationFrame(() => {
      updateCarouselArrows(row);
      if (__tarjetaHoverActiva && row.contains(__tarjetaHoverActiva)) {
        cerrarOverlayHoverTarjeta(__tarjetaHoverActiva, { inmediato: true, forzar: true });
      }
    });
  };

  const onResize = () => {
    requestAnimationFrame(() => {
      updateCarouselArrows(row);
      scheduleTwoLinesScan(carousel);
    });
  };

  if (btnLeft) btnLeft.onclick = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    scrollCarouselPage(row, -1);
  };

  if (btnRight) btnRight.onclick = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    scrollCarouselPage(row, 1);
  };

  row.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });

  row.__scrollHandler = onScroll;
  row.__resizeHandler = onResize;
  row.__carouselCleanup = () => {
    if (row.__arrowRaf) cancelAnimationFrame(row.__arrowRaf);
    row.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
  };

  requestAnimationFrame(() => {
    row.scrollLeft = 0;
    updateCarouselArrows(row);
    scheduleTwoLinesScan(carousel);
  });
}

function setRow(el, html) {
  if (!el) return;
  resetCarouselState(el);
  el.innerHTML = html;

  enhanceCarouselCardsWithQuickPlus(el);
  scheduleTwoLinesScan(el);

  try {
    window.dispatchEvent(new CustomEvent("satv:cards-rendered", { detail: { root: el } }));
  } catch { }
}

window.addEventListener("app:searchrendered", (ev) => {
  const root = ev?.detail?.root || document.getElementById("search-results");
  if (!root) return;
  enhanceCarouselCardsWithQuickPlus(root);
  scheduleTwoLinesScan(root);
});

window.addEventListener("satv:enhance-cards", (ev) => {
  const root = ev?.detail?.root || document;
  enhanceCarouselCardsWithQuickPlus(root);
  scheduleTwoLinesScan(root);
});

/* ================= CONTINUE WATCHING HELPERS ================= */

function buildContinueHref(row) {
  const m = row?.movies;
  if (!m?.id) return "#";

  const episodeId = row?.episode_id || row?.episodes?.id || null;
  const collectionId = m?.collection_id || null;

  return buildTitleUrl(m.id, { collectionId, episodeId });
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

  if (totalSec > 0) return Math.min(98, Math.max(2, Math.round((progressSec / totalSec) * 100)));
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
  __homeSessionCache = session || null;
  __homeUserIdCache = session?.user?.id || null;

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
        contWrap?.classList?.remove("hidden");

        setRow(
          contRow,
          uniqueRows.map((r) => {
            const m = r.movies;
            if (!m) return "";

            const href = buildContinueHref(r);
            const subtitle = buildContinueSubtitle(r);
            const pct = buildContinuePct(r);

            return addMovieIdToCardHtml(
              cardHtml(m, href, subtitle, pct, { showCollectionOverlay: true }),
              m?.id
            );
          }).join("")
        );

        buildCarousel(contRow);
      } else {
        contWrap?.classList?.add("hidden");
      }
    } catch (e) {
      console.error("[home] continue watching error:", e);
      contWrap?.classList?.add("hidden");
    }
  } else {
    contWrap?.classList?.add("hidden");
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

    const pool = [...heroPoolMap.values()];
    if (pool.length) {
      const now = Date.now();
      const key = `${HOME_HERO_STORAGE_PREFIX}:${userId || "guest"}`;

      let chosen = null;
      try {
        const raw = localStorage.getItem(key);
        const saved = raw ? JSON.parse(raw) : null;
        if (saved?.id && Number(saved.expiresAt) > now) {
          chosen = pool.find((x) => String(x.id) === String(saved.id)) || null;
        }
      } catch { }

      if (!chosen) {
        chosen = pool[Math.floor(Math.random() * pool.length)];
        try {
          localStorage.setItem(key, JSON.stringify({
            id: chosen.id,
            chosenAt: now,
            expiresAt: now + HOME_HERO_TTL_MS
          }));
        } catch { }
      }

      renderHomeHeroItem(chosen, { userId });
    }

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