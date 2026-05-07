//home.js
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
   ✅ HOME SESSION CACHE (evita mil getSession)
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
   ✅ ICONOS (+ / -) PARA MI LISTA
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

/* =========================================================
   ✅ BOTÓN GENÉRICO "MI LISTA" PARA ICONOS (+ / -)
   - se usa en card y en modal
========================================================= */

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
   ✅ "MAS INFO" (según ui.js): se inyecta dentro de .card-title
   - NO toca ui.js
   - NO navega; abre modal
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
   HERO MYLIST (tu implementación original)
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
   ✅ QUICK MODAL
   - MyList (+/-) DENTRO del layout del video (arriba del volumen)
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
   CARD HOVER OVERLAY tipo Prime Video
   - overlay absoluto DENTRO de la .card
   - NO modifica el tamaño real de la card
   - NO portal
   - NO fixed
   - habilita overflow visible SOLO durante hover
   - corrige bug al pasar de una card a otra
   - al salir borra TODO lo generado y limpia z-index/overflow
   - trailer + mute + mi lista + meta + sinopsis
========================================================= */

const __cardHoverMovieCache = new Map();

let __cardHoverActiveCard = null;
let __cardHoverGlobalSeq = 0;
let __cardHoverGlobalEventsInstalled = false;

function buildMovieRuntimeText(movie = {}) {
  const category = String(movie?.category || "").toLowerCase();
  const mm = movie?.movie_meta || null;

  if (category === "series") {
    const seasonsCount = Number(mm?.seasons_count || movie?.seasons_count || 0);
    const episodesCount = Number(mm?.episodes_count || movie?.episodes_count || 0);

    if (seasonsCount > 2) {
      return `${seasonsCount} temporadas`;
    }

    if (episodesCount > 0) {
      return `${episodesCount} ${episodesCount === 1 ? "episodio" : "episodios"}`;
    }

    return "Serie";
  }

  if (movie?.duration_text) {
    return String(movie.duration_text);
  }

  const mins = Number(movie?.duration_minutes || 0);
  if (mins > 0) {
    if (mins < 60) return `${mins} min`;

    const h = Math.floor(mins / 60);
    const m = mins % 60;

    return m ? `${h} h ${m} min` : `${h} h`;
  }

  return "";
}

function buildMovieMetaText(movie = {}) {
  const parts = [];

  if (movie.release_year) {
    parts.push(String(movie.release_year));
  }

  const runtime = buildMovieRuntimeText(movie);
  if (runtime) {
    parts.push(runtime);
  }

  const age =
    movie?.movie_meta?.fullage ||
    movie?.fullage ||
    "";

  if (age) {
    parts.push(String(age));
  }

  return parts.join("  •  ");
}

function isCardHoverDisabled() {
  try {
    return window.matchMedia?.("(hover: none), (pointer: coarse)")?.matches || window.innerWidth <= 768;
  } catch {
    return window.innerWidth <= 768;
  }
}

function forceCardOverlaySynopsisBlock(node) {
  if (!node) return;

  node.style.setProperty("display", "block", "important");
  node.style.setProperty("white-space", "normal", "important");
  node.style.setProperty("overflow", "visible", "important");
  node.style.setProperty("text-overflow", "clip", "important");
  node.style.setProperty("max-height", "none", "important");
  node.style.setProperty("-webkit-line-clamp", "unset", "important");
  node.style.setProperty("-webkit-box-orient", "initial", "important");
}

function getCardHoverContext(card) {
  return {
    row: card?.closest?.(".row") || null,
    carousel: card?.closest?.(".carousel") || null,
    section: card?.closest?.(".section") || null
  };
}

function setCardHoverContext(card, open) {
  if (!card) return;

  const { row, carousel, section } = getCardHoverContext(card);

  if (open) {
    card.classList.add("card-hover-overlay-host");

    row?.classList.add("row-hover-open");
    carousel?.classList.add("carousel-hover-open");
    section?.classList.add("section-hover-open");

    return;
  }

  card.classList.remove("card-hover-overlay-host");

  requestAnimationFrame(() => {
    if (row && !row.querySelector(".card-hover-overlay-host")) {
      row.classList.remove("row-hover-open");
    }

    if (carousel && !carousel.querySelector(".card-hover-overlay-host")) {
      carousel.classList.remove("carousel-hover-open");
    }

    if (section && !section.querySelector(".card-hover-overlay-host")) {
      section.classList.remove("section-hover-open");
    }

    if (!document.querySelector(".card-hover-overlay-host")) {
      document.querySelectorAll(".row-hover-open").forEach((el) => {
        el.classList.remove("row-hover-open");
      });

      document.querySelectorAll(".carousel-hover-open").forEach((el) => {
        el.classList.remove("carousel-hover-open");
      });

      document.querySelectorAll(".section-hover-open").forEach((el) => {
        el.classList.remove("section-hover-open");
      });
    }
  });
}

function stopAndResetCardHoverMedia(card) {
  if (!card) return;

  try {
    card.querySelectorAll(".card-hover-overlay video").forEach((video) => {
      try {
        video.pause();
        video.muted = true;
        video.currentTime = 0;
        video.removeAttribute("src");
        video.load?.();
      } catch { }
    });
  } catch { }
}

function removeCardHoverOverlay(card) {
  if (!card) return;

  stopAndResetCardHoverMedia(card);

  try {
    card.querySelectorAll(".card-hover-overlay").forEach((node) => {
      try {
        node.remove();
      } catch { }
    });
  } catch { }
}

function hardResetCardHover(card, { removeOverlay = true } = {}) {
  if (!card) return;

  clearTimeout(card.__hoverOpenTimer);
  clearTimeout(card.__hoverCloseTimer);

  card.dataset.hoverSeq = "";

  card.classList.remove(
    "card-hover-overlay-open",
    "card-hover-overlay-host"
  );

  stopAndResetCardHoverMedia(card);

  const overlay = card.querySelector(".card-hover-overlay");
  if (overlay) {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");

    if (removeOverlay) {
      try {
        overlay.remove();
      } catch { }
    }
  }

  setCardHoverContext(card, false);
}

function hardResetAllCardHovers({ except = null } = {}) {
  const cards = new Set();

  document
    .querySelectorAll(".card-hover-overlay-host, .card-hover-overlay-open")
    .forEach((card) => cards.add(card));

  document.querySelectorAll(".card-hover-overlay").forEach((overlay) => {
    const card = overlay.closest(".card");
    if (card) cards.add(card);
    else {
      try {
        overlay.remove();
      } catch { }
    }
  });

  cards.forEach((card) => {
    if (except && card === except) return;
    hardResetCardHover(card, { removeOverlay: true });
  });

  if (!except) {
    __cardHoverActiveCard = null;
  }

  requestAnimationFrame(() => {
    if (!document.querySelector(".card-hover-overlay-host")) {
      document.querySelectorAll(".row-hover-open").forEach((el) => {
        el.classList.remove("row-hover-open");
      });

      document.querySelectorAll(".carousel-hover-open").forEach((el) => {
        el.classList.remove("carousel-hover-open");
      });

      document.querySelectorAll(".section-hover-open").forEach((el) => {
        el.classList.remove("section-hover-open");
      });
    }
  });
}

function ensureCardHoverOverlay(card, movieId) {
  if (!card || !movieId) return null;

  removeCardHoverOverlay(card);

  const overlay = document.createElement("div");
  overlay.className = "card-hover-overlay";
  overlay.setAttribute("aria-hidden", "true");

  overlay.innerHTML = `
    <div class="card-hover-overlay-inner">
      <div class="card-hover-overlay-media">
        <div class="card-hover-overlay-loading">Cargando…</div>

        <div class="card-hover-overlay-floating-actions">
          <button class="card-hover-mylist-btn" type="button" aria-label="Agregar a Mi Lista" aria-pressed="false">
            ${MYLIST_ICON_PLUS}
          </button>
        </div>
      </div>

      <div class="card-hover-overlay-body">
        <div class="card-hover-overlay-title"></div>
        <div class="card-hover-overlay-meta"></div>
        <div class="card-hover-overlay-synopsis"></div>
      </div>
    </div>
  `;

  overlay.addEventListener("mouseenter", () => {
    clearTimeout(card.__hoverCloseTimer);
  });

  overlay.addEventListener("mouseleave", () => {
    closeCardHoverOverlay(card);
  });

  overlay.addEventListener("click", (ev) => {
    const interactive = ev.target.closest("button, a");
    if (interactive) return;

    const href = card.dataset.href || buildTitleUrl(movieId);
    if (href) window.location.href = href;
  });

  card.appendChild(overlay);
  return overlay;
}

function getCardHoverMyListButton(overlay) {
  if (!overlay) return null;

  let actions = overlay.querySelector(".card-hover-overlay-floating-actions");

  if (!actions) {
    const media = overlay.querySelector(".card-hover-overlay-media");
    if (!media) return null;

    actions = document.createElement("div");
    actions.className = "card-hover-overlay-floating-actions";
    media.appendChild(actions);
  }

  actions.querySelectorAll(".card-hover-mylist-btn").forEach((btn) => {
    try {
      btn.remove();
    } catch { }
  });

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "card-hover-mylist-btn";
  btn.setAttribute("aria-label", "Agregar a Mi Lista");
  btn.setAttribute("aria-pressed", "false");
  btn.innerHTML = MYLIST_ICON_PLUS;

  actions.appendChild(btn);
  return btn;
}

function positionCardHoverOverlay(card, overlay) {
  if (!card || !overlay) return;

  const rect = card.getBoundingClientRect();
  const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;

  const finalWidth = Math.min(430, Math.max(320, viewportW - 32));
  overlay.style.width = `${Math.round(finalWidth)}px`;

  const overlayLeft = rect.left + (rect.width / 2) - (finalWidth / 2);

  let shiftX = 0;

  const minViewportGap = 12;
  const overflowLeft = minViewportGap - overlayLeft;
  const overflowRight = (overlayLeft + finalWidth) - (viewportW - minViewportGap);

  if (overflowLeft > 0) {
    shiftX += overflowLeft;
  }

  if (overflowRight > 0) {
    shiftX -= overflowRight;
  }

  overlay.style.setProperty("--card-hover-shift-x", `${Math.round(shiftX)}px`);
}

function restartCardHoverOverlayAnimation(card, overlay) {
  if (!card || !overlay) return;

  card.classList.remove("card-hover-overlay-open");
  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "false");

  void overlay.offsetWidth;

  requestAnimationFrame(() => {
    setCardHoverContext(card, true);
    positionCardHoverOverlay(card, overlay);

    requestAnimationFrame(() => {
      card.classList.add("card-hover-overlay-open");
      overlay.classList.add("is-open");
    });
  });
}

async function hydrateCardHoverOverlay(card, movieId, seq) {
  if (!card || !movieId) return;

  const overlay = card.querySelector(".card-hover-overlay");
  if (!overlay) return;

  try {
    let movie = __cardHoverMovieCache.get(String(movieId));

    if (!movie) {
      movie = await fetchMovie(movieId);
      if (movie) __cardHoverMovieCache.set(String(movieId), movie);
    }

    if (!movie || card.dataset.hoverSeq !== String(seq)) return;
    if (__cardHoverActiveCard !== card) return;

    const media = overlay.querySelector(".card-hover-overlay-media");
    const title = overlay.querySelector(".card-hover-overlay-title");
    const meta = overlay.querySelector(".card-hover-overlay-meta");
    const synopsis = overlay.querySelector(".card-hover-overlay-synopsis");

    if (title) {
      title.textContent = movie.title || "Sin título";
    }

    if (meta) {
      meta.textContent = buildMovieMetaText(movie);
      meta.hidden = !meta.textContent.trim();
    }

    if (synopsis) {
      synopsis.textContent =
        movie.description ||
        movie.sinopsis ||
        "Sin sinopsis disponible.";

      forceCardOverlaySynopsisBlock(synopsis);
    }

    if (media) {
      const floatingActions = overlay.querySelector(".card-hover-overlay-floating-actions");

      media.innerHTML = "";

      if (floatingActions) {
        media.appendChild(floatingActions);
      } else {
        const actions = document.createElement("div");
        actions.className = "card-hover-overlay-floating-actions";
        media.appendChild(actions);
      }

      mountQuickModalTrailer(media, movie);

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

    const myListBtn = getCardHoverMyListButton(overlay);
    if (myListBtn) {
      const session = __homeSessionCache || (await getHomeSessionCached());
      const userId = session?.user?.id || null;

      bindMyListIconButton(myListBtn, {
        userId,
        contentId: String(movie.id)
      });
    }

    positionCardHoverOverlay(card, overlay);
  } catch (e) {
    console.warn("[home] card hover overlay error:", e);

    const media = overlay.querySelector(".card-hover-overlay-media");
    if (media) {
      media.innerHTML = `<div class="card-hover-overlay-loading">No se pudo cargar.</div>`;
    }
  }
}

function openCardHoverOverlay(card, movieId) {
  if (!card || !movieId || isCardHoverDisabled()) return;

  hardResetAllCardHovers({ except: card });

  if (__cardHoverActiveCard && __cardHoverActiveCard !== card) {
    hardResetCardHover(__cardHoverActiveCard, { removeOverlay: true });
  }

  __cardHoverActiveCard = card;

  clearTimeout(card.__hoverOpenTimer);
  clearTimeout(card.__hoverCloseTimer);

  card.__hoverOpenTimer = setTimeout(() => {
    if (__cardHoverActiveCard !== card) return;

    __cardHoverGlobalSeq += 1;

    const seq = String(__cardHoverGlobalSeq);
    card.dataset.hoverSeq = seq;

    const overlay = ensureCardHoverOverlay(card, movieId);
    if (!overlay) return;

    restartCardHoverOverlayAnimation(card, overlay);

    hydrateCardHoverOverlay(card, movieId, seq);
  }, 120);
}

function closeCardHoverOverlay(card, options = {}) {
  if (!card) return;

  const immediate = options.immediate === true;

  clearTimeout(card.__hoverOpenTimer);
  clearTimeout(card.__hoverCloseTimer);

  if (__cardHoverActiveCard === card) {
    __cardHoverActiveCard = null;
  }

  card.dataset.hoverSeq = "";

  const overlay = card.querySelector(".card-hover-overlay");

  const cleanup = () => {
    hardResetCardHover(card, { removeOverlay: true });

    if (!document.querySelector(".card-hover-overlay-host")) {
      hardResetAllCardHovers();
    }
  };

  if (!overlay || immediate) {
    cleanup();
    return;
  }

  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
  card.classList.remove("card-hover-overlay-open");

  card.__hoverCloseTimer = setTimeout(cleanup, 190);
}

function bindCardHoverPreview(card, movieId) {
  if (!card || !movieId) return;
  if (card.dataset.hoverPreviewBound === "1") return;

  card.dataset.hoverPreviewBound = "1";

  card.addEventListener("mouseenter", () => {
    openCardHoverOverlay(card, String(movieId));
  }, { passive: true });

  card.addEventListener("mouseleave", () => {
    clearTimeout(card.__hoverCloseTimer);

    card.__hoverCloseTimer = setTimeout(() => {
      const overlay = card.querySelector(".card-hover-overlay");

      if (__cardHoverActiveCard !== card) {
        hardResetCardHover(card, { removeOverlay: true });
        return;
      }

      if (!overlay || !overlay.matches(":hover")) {
        closeCardHoverOverlay(card);
      }
    }, 60);
  }, { passive: true });

  card.addEventListener("focusin", () => {
    openCardHoverOverlay(card, String(movieId));
  });

  card.addEventListener("focusout", (ev) => {
    const overlay = card.querySelector(".card-hover-overlay");

    if (!card.contains(ev.relatedTarget) && !overlay?.contains?.(ev.relatedTarget)) {
      closeCardHoverOverlay(card);
    }
  });
}

function installCardHoverGlobalCleanup() {
  if (__cardHoverGlobalEventsInstalled) return;
  __cardHoverGlobalEventsInstalled = true;

  document.addEventListener("pointermove", (ev) => {
    const active = __cardHoverActiveCard;
    if (!active) return;

    const overlay = active.querySelector(".card-hover-overlay");
    const target = ev.target;

    const insideCard = active.contains(target);
    const insideOverlay = overlay?.contains?.(target);

    if (!insideCard && !insideOverlay) {
      closeCardHoverOverlay(active);
    }
  }, { passive: true });

  document.addEventListener("pointerdown", (ev) => {
    const active = __cardHoverActiveCard;
    if (!active) return;

    const overlay = active.querySelector(".card-hover-overlay");
    const target = ev.target;

    const insideCard = active.contains(target);
    const insideOverlay = overlay?.contains?.(target);

    if (!insideCard && !insideOverlay) {
      closeCardHoverOverlay(active, { immediate: true });
    }
  }, { passive: true });

  window.addEventListener("blur", () => {
    hardResetAllCardHovers();
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hardResetAllCardHovers();
    }
  });

  window.addEventListener("resize", () => {
    document.querySelectorAll(".card.card-hover-overlay-host").forEach((card) => {
      const overlay = card.querySelector(".card-hover-overlay");
      if (overlay?.classList.contains("is-open")) {
        positionCardHoverOverlay(card, overlay);
      }
    });
  }, { passive: true });

  window.addEventListener("scroll", () => {
    document.querySelectorAll(".card.card-hover-overlay-host").forEach((card) => {
      const overlay = card.querySelector(".card-hover-overlay");
      if (overlay?.classList.contains("is-open")) {
        positionCardHoverOverlay(card, overlay);
      }
    });
  }, { passive: true });
}

installCardHoverGlobalCleanup();

/* =========================================================
   CARDS: "+" (Mi Lista) + "Mas info" (junto al title)
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

    /*
      El botón + / - de Mi Lista ya está dentro del hover overlay.
      Sacamos cualquier botón viejo que haya quedado en la card base.
    */
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
   HOME HERO VIDEO + resto (INTACTO)
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
   LIVE MODE / publish label / cards / carousel / init
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

/* ================= CAROUSEL HELPERS ================= */

function getCarouselCards(row) { return [...row.querySelectorAll(".card")]; }
function getRowCenterX(row) { return row.scrollLeft + row.clientWidth / 2; }
function getCardCenterX(card) { return card.offsetLeft + card.offsetWidth / 2; }

function centerCard(row, card, behavior = "smooth") {
  if (!row || !card) return;
  const target = card.offsetLeft - (row.clientWidth / 2) + (card.offsetWidth / 2);
  row.scrollTo({ left: Math.max(0, target), behavior });
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
      <path d="M15 6l-6 6 6 6" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>
  `;

  const rightBtn = document.createElement("button");
  rightBtn.className = "carousel-btn right";
  rightBtn.type = "button";
  rightBtn.setAttribute("aria-label", "Siguiente");
  rightBtn.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M9 6l6 6-6 6" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>
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
    snapTimer = window.setTimeout(() => { isSnapping = false; }, 220);
  }

  function onScroll() {
    if (isSnapping) return;
    window.clearTimeout(snapTimer);
    snapTimer = window.setTimeout(() => { snapToClosest("smooth"); }, 100);
  }

  if (btnLeft) btnLeft.onclick = () => moveToAdjacentCard(row, -1);
  if (btnRight) btnRight.onclick = () => moveToAdjacentCard(row, 1);

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
    if (row.__resizeHandler) window.removeEventListener("resize", row.__resizeHandler);
  };

  requestAnimationFrame(() => {
    const firstCard = row.querySelector(".card");
    if (firstCard) centerCard(row, firstCard, "auto");
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
              cardHtml(m, href, subtitle, pct, { showCollectionOverlay: true }),
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