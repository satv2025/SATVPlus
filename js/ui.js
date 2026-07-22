// ui.js
import { CONFIG } from './config.js';
import { getSession, signOut } from './auth.js';
import { getActiveViewerProfile, requireActiveViewerProfile } from './viewerProfiles.js';
import {
  fetchMovie,
  fetchLanguagePreference,
  upsertLanguagePreference,
  detectConnectionCountryCode,
  countryHasSpanishOfficialLanguage,
  getPreferredDeviceLanguage,
  searchMovies,
  fetchReleaseAlerts,
  fetchMyListPreview,
  markReleaseAlertsSeen,
} from './api.js';

export function $(sel) {
  return document.querySelector(sel);
}
export function $all(sel) {
  return Array.from(document.querySelectorAll(sel));
}

export function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/* =========================
   APP NAME + TITLE
========================= */

export function setAppName() {
  const els = $all('[data-appname]');
  for (const el of els) el.textContent = CONFIG.APP_NAME;

  const currentTitle = document.title.trim();
  if (!currentTitle || currentTitle === CONFIG.APP_NAME) {
    document.title = CONFIG.APP_NAME;
  }
}

/* =========================
   TOAST
========================= */

export function toast(msg, type = 'info') {
  const host = document.getElementById('toast-host');
  if (!host) {
    alert(msg);
    return;
  }

  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  host.appendChild(t);

  requestAnimationFrame(() => t.classList.add('show'));

  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 200);
  }, 2800);
}

/* =========================
   TIME FORMAT
========================= */

export function formatTime(secs) {
  const s = Math.max(0, Math.floor(secs || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;

  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/* =========================
   NAVBAR
========================= */

export function renderNav({ active = 'home' } = {}) {
  const nav = document.getElementById('topnav');
  if (!nav) return;

  const url = new URL(window.location.href);
  const currentQuery = url.searchParams.get('q') || '';

  nav.innerHTML = `
    <div class="nav-left">
      <a class="brand" href="/index.html">
        <img src="https://api.satvplus.com.ar/storage/v1/object/public/general/Thumbnails/SATV_logo_fondo_transparente_alpha_A_limpia.png" alt="Logo" class="brand-logo"/>
      </a>
      <a class="navlink ${active === 'home' ? 'active' : ''}" href="/index.html">Inicio</a>
    </div>

    <div class="nav-right" id="nav-right" style="grid-column: 2 / -1;">
      <div class="topnav-search-wrap">
        <label class="topnav-search" for="topnav-search-input" aria-label="Buscar">
          <span class="topnav-search-icon" aria-hidden="true">
            <i class="fa-solid fa-magnifying-glass"></i>
          </span>
          <input
            id="topnav-search-input"
            class="topnav-search-input"
            type="search"
            name="q"
            placeholder="Buscar películas, series..."
            value="${escapeHtml(currentQuery)}"
            aria-label="Buscar películas o series"
            autocomplete="off"
            enterkeyhint="search"
            spellcheck="false"
          />
        </label>
      </div>

      <div class="nav-actions" id="nav-actions"></div>
    </div>
  `;

  // El buscador pertenece a la navegación global. Al iniciarlo acá,
  // cualquier página que use renderNav() recibe la experiencia completa.
  // Las funciones son idempotentes, así que home.js puede seguir llamándolas.
  initTopnavSearch();
  initSearchExperience();
}

/* =========================
   PERFIL / USERNAME (profiles.username)
========================= */

function getUserIdFromSession(session) {
  return (
    session?.user?.id ||
    session?.session?.user?.id ||
    session?.data?.session?.user?.id ||
    null
  );
}

function getAccessTokenFromSession(session) {
  return (
    session?.access_token ||
    session?.session?.access_token ||
    session?.data?.session?.access_token ||
    session?.token ||
    null
  );
}

function getSupabaseUrlFromConfig() {
  return (
    CONFIG?.SUPABASE_URL ||
    CONFIG?.SUPABASE_PROJECT_URL ||
    CONFIG?.SB_URL ||
    null
  );
}

function getSupabaseAnonKeyFromConfig() {
  return (
    CONFIG?.SUPABASE_ANON_KEY ||
    CONFIG?.SUPABASE_ANON ||
    CONFIG?.SUPABASE_KEY ||
    CONFIG?.SB_ANON_KEY ||
    null
  );
}

function safeLocalPartFromEmail(email) {
  const s = String(email || '');
  const i = s.indexOf('@');
  return (i > 0 ? s.slice(0, i) : s) || '';
}

async function fetchProfileRowByUserId({ userId, accessToken } = {}) {
  const supabaseUrl = getSupabaseUrlFromConfig();
  const anonKey = getSupabaseAnonKeyFromConfig();

  if (!supabaseUrl || !anonKey || !userId) return null;

  const url =
    `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/profiles` +
    `?id=eq.${encodeURIComponent(userId)}` +
    `&select=username,full_name`;

  const headers = {
    apikey: anonKey,
    Accept: 'application/json',
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  } else {
    headers['Authorization'] = `Bearer ${anonKey}`;
  }

  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) return null;

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0] || null;
}

async function getUsernameFromProfilesTable(session) {
  const userId = getUserIdFromSession(session);
  const accessToken = getAccessTokenFromSession(session);

  if (!userId) return null;

  const cacheKey = `profiles.username.${userId}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch (_) {}

  const row = await fetchProfileRowByUserId({ userId, accessToken });
  const username = row?.username ? String(row.username) : null;

  if (username) {
    try {
      sessionStorage.setItem(cacheKey, username);
    } catch (_) {}
    return username;
  }

  return null;
}

function getFallbackDisplayName(session) {
  const u =
    session?.user ||
    session?.session?.user ||
    session?.data?.session?.user ||
    {};

  const meta = u?.user_metadata || u?.metadata || {};
  return (
    u?.username ||
    meta?.username ||
    u?.name ||
    meta?.full_name ||
    safeLocalPartFromEmail(u?.email) ||
    'Usuario'
  );
}

/* =========================
   LANGUAGE PREFERENCE
========================= */

const APP_LANG_STORAGE_KEY = 'satv_lang_code';
const LANG_PROMPT_SESSION_KEY_PREFIX = 'satv_lang_prompt_v3';

function normalizeCountryCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .slice(0, 2);
}

function normalizeLangCode(value) {
  return String(value || '').trim();
}

function getLangBase(value) {
  return normalizeLangCode(value).split('-')[0].toLowerCase();
}

function sameLanguage(a, b) {
  const aa = getLangBase(a);
  const bb = getLangBase(b);
  return !!aa && aa === bb;
}

function getCurrentAppLanguage(savedLang = null) {
  try {
    return (
      normalizeLangCode(savedLang) ||
      normalizeLangCode(localStorage.getItem(APP_LANG_STORAGE_KEY)) ||
      normalizeLangCode(document.documentElement.lang) ||
      normalizeLangCode(navigator.language) ||
      'es-AR'
    );
  } catch {
    return (
      normalizeLangCode(savedLang) ||
      normalizeLangCode(document.documentElement.lang) ||
      normalizeLangCode(navigator.language) ||
      'es-AR'
    );
  }
}

function applyLanguagePreference(langCode) {
  const safe = normalizeLangCode(langCode);
  if (!safe) return;

  try {
    localStorage.setItem(APP_LANG_STORAGE_KEY, safe);
  } catch (_) {}

  document.documentElement.lang = safe;
  window.__APP_LANG__ = safe;

  try {
    window.dispatchEvent(
      new CustomEvent('app:langchange', {
        detail: { langCode: safe },
      })
    );
  } catch (_) {}
}

function getRegionDisplayName(countryCode, locale = 'es') {
  const safe = normalizeCountryCode(countryCode);
  if (!safe) return '';
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(safe) || safe;
  } catch {
    return safe;
  }
}

function getLanguageDisplayName(langCode, locale = 'es') {
  const base = getLangBase(langCode);
  if (!base) return normalizeLangCode(langCode);
  try {
    return (
      new Intl.DisplayNames([locale], { type: 'language' }).of(base) ||
      normalizeLangCode(langCode)
    );
  } catch {
    return normalizeLangCode(langCode);
  }
}

function getPromptCacheKey(userId, countryCode, suggestedLang) {
  return `${LANG_PROMPT_SESSION_KEY_PREFIX}:${userId}:${normalizeCountryCode(countryCode)}:${getLangBase(suggestedLang)}`;
}

function ensureLanguagePromptModal() {
  let root = document.getElementById('lang-modal-root');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'lang-modal-root';
  root.className = 'lang-modal-backdrop';
  root.setAttribute('aria-hidden', 'true');

  root.innerHTML = `
    <div class="lang-modal" role="dialog" aria-modal="true" aria-labelledby="lang-modal-title">
      <div class="lang-modal-head">
        <span class="lang-modal-dot" aria-hidden="true"></span>
        <h3 class="lang-modal-title" id="lang-modal-title">Idioma / Language</h3>
        <button type="button" class="lang-modal-close" data-lang-close aria-label="Cerrar / Close">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="lang-modal-body">
        <p class="lang-modal-copy" data-lang-copy-es></p>
        <p class="lang-modal-copy" data-lang-copy-en></p>
        <div class="lang-modal-meta" data-lang-meta hidden></div>
      </div>
      <div class="lang-modal-actions">
        <button type="button" class="btn ghost" data-lang-decline>
          Mantener idioma actual / Keep current language
        </button>
        <button type="button" class="btn" data-lang-accept>
          Traducir / Translate
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(root);
  return root;
}

function showLanguagePromptModal({ regionName, suggestedLang }) {
  return new Promise((resolve) => {
    const root = ensureLanguagePromptModal();
    const closeBtn = root.querySelector('[data-lang-close]');
    const acceptBtn = root.querySelector('[data-lang-accept]');
    const declineBtn = root.querySelector('[data-lang-decline]');
    const copyEs = root.querySelector('[data-lang-copy-es]');
    const copyEn = root.querySelector('[data-lang-copy-en]');
    const meta = root.querySelector('[data-lang-meta]');

    const langEs = getLanguageDisplayName(suggestedLang, 'es');
    const langEn = getLanguageDisplayName(suggestedLang, 'en');

    copyEs.textContent = `Detectamos que te estás conectando desde ${regionName}. ¿Deseas traducir la app a ${langEs}?`;
    copyEn.textContent = `We detected that you're connecting from ${regionName}. Would you like to translate the app to ${langEn}?`;
    meta.hidden = false;
    meta.textContent = `${regionName} • ${langEs} / ${langEn}`;

    const focusables = () => [closeBtn, declineBtn, acceptBtn].filter(Boolean);
    const previousFocused = document.activeElement;

    let settled = false;

    const cleanup = (accepted) => {
      if (settled) return;
      settled = true;

      root.classList.remove('show');
      root.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('lang-modal-open');

      root.removeEventListener('click', onBackdropClick);
      document.removeEventListener('keydown', onKeyDown);
      acceptBtn.removeEventListener('click', onAccept);
      declineBtn.removeEventListener('click', onDecline);
      closeBtn.removeEventListener('click', onDecline);

      window.setTimeout(() => {
        try {
          previousFocused?.focus?.();
        } catch (_) {}
        resolve(accepted);
      }, 180);
    };

    const onAccept = () => cleanup(true);
    const onDecline = () => cleanup(false);

    const onBackdropClick = (e) => {
      if (e.target === root) cleanup(false);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(false);
        return;
      }

      if (e.key !== 'Tab') return;

      const nodes = focusables();
      if (!nodes.length) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    root.addEventListener('click', onBackdropClick);
    document.addEventListener('keydown', onKeyDown);
    acceptBtn.addEventListener('click', onAccept);
    declineBtn.addEventListener('click', onDecline);
    closeBtn.addEventListener('click', onDecline);

    document.body.classList.add('lang-modal-open');
    root.setAttribute('aria-hidden', 'false');

    requestAnimationFrame(() => {
      root.classList.add('show');
      acceptBtn.focus();
    });
  });
}

async function maybeSuggestLanguageChange(session) {
  const userId = getUserIdFromSession(session);
  if (!userId) return;

  let savedPreference = null;
  try {
    savedPreference = await fetchLanguagePreference(userId);
    if (savedPreference?.lang_code) {
      applyLanguagePreference(savedPreference.lang_code);
    }
  } catch (error) {
    console.warn('[ui] no se pudo leer public.lang:', error);
  }

  const detectedCountry = normalizeCountryCode(
    await detectConnectionCountryCode()
  );
  if (!detectedCountry) return;

  const currentLang = getCurrentAppLanguage(savedPreference?.lang_code);

  if (normalizeCountryCode(savedPreference?.county) === detectedCountry) {
    return;
  }

  let isSpanishCountry = false;
  try {
    isSpanishCountry = await countryHasSpanishOfficialLanguage(detectedCountry);
  } catch (error) {
    console.warn('[ui] no se pudo resolver idioma oficial del país:', error);
  }

  if (isSpanishCountry) {
    try {
      await upsertLanguagePreference({
        userId,
        countryCode: detectedCountry,
        langCode: currentLang,
      });
    } catch (error) {
      console.warn('[ui] no se pudo guardar idioma automático:', error);
    }
    return;
  }

  const suggestedLang =
    normalizeLangCode(getPreferredDeviceLanguage()) || 'en-US';

  if (sameLanguage(currentLang, suggestedLang)) {
    try {
      await upsertLanguagePreference({
        userId,
        countryCode: detectedCountry,
        langCode: currentLang,
      });
    } catch (error) {
      console.warn('[ui] no se pudo persistir idioma actual:', error);
    }
    return;
  }

  const promptKey = getPromptCacheKey(userId, detectedCountry, suggestedLang);
  try {
    if (sessionStorage.getItem(promptKey) === '1') return;
    sessionStorage.setItem(promptKey, '1');
  } catch (_) {}

  const regionName =
    getRegionDisplayName(detectedCountry, 'es') ||
    getRegionDisplayName(detectedCountry, 'en') ||
    detectedCountry;

  const accepted = await showLanguagePromptModal({
    regionName,
    suggestedLang,
  });

  const chosenLang = accepted ? suggestedLang : currentLang;

  try {
    await upsertLanguagePreference({
      userId,
      countryCode: detectedCountry,
      langCode: chosenLang,
    });
  } catch (error) {
    console.warn('[ui] no se pudo guardar la preferencia de idioma:', error);
  }

  if (!accepted) return;

  applyLanguagePreference(chosenLang);
  toast(
    `Idioma actualizado a ${getLanguageDisplayName(chosenLang, 'es')} / Language updated to ${getLanguageDisplayName(chosenLang, 'en')}.`,
    'info'
  );

  window.location.reload();
}

export async function renderAuthButtons() {
  const host =
    document.getElementById('nav-actions') ||
    document.getElementById('nav-right');

  if (!host) return;

  const session = await getSession();

  if (!session) {
    host.innerHTML = `
      <a class="btn ghost" href="/login.html">Entrar</a>
      <a class="btn" href="/register.html">Crear cuenta</a>
    `;
    return;
  }

  let activeViewerProfile = null;
  try {
    activeViewerProfile = await requireActiveViewerProfile(session, { redirect: true });
    if (!activeViewerProfile) return;
  } catch (e) {
    console.warn('No se pudo verificar el perfil activo:', e);
    window.location.replace('/profiles.html');
    return;
  }

  let display = activeViewerProfile?.name || null;
  if (!display) {
    try {
      display = await getUsernameFromProfilesTable(session);
    } catch (e) {
      console.warn('No se pudo leer profiles.username:', e);
    }
  }

  if (!display) display = getFallbackDisplayName(session);

  const name = escapeHtml(display || 'Usuario');
  const avatarUrl = escapeHtml(
    activeViewerProfile?.avatar_url || '/images/profile-avatars/nova.svg'
  );

  host.innerHTML = `
    <button
      class="control-center-trigger"
      id="control-center-trigger"
      type="button"
      aria-label="Abrir centro de control del perfil ${name}"
      title="Centro de control · ${name}"
      data-display-name="${name}"
      data-avatar-url="${avatarUrl}"
    >
      <img class="control-center-trigger-avatar" src="${avatarUrl}" alt="" />
      <span class="alerts-badge" id="alerts-badge" hidden></span>
    </button>
  `;

  try {
    await initAlertsBell(session);
  } catch (e) {
    console.warn('[ui] initAlertsBell error:', e);
  }

  try {
    await maybeSuggestLanguageChange(session);
  } catch (e) {
    console.warn('[ui] maybeSuggestLanguageChange error:', e);
  }
}

/* =========================
   CONTROL CENTER / ALERTS
========================= */

let __alertsBellInitialized = false;
let __alertsBadgeRefreshTimer = 0;
let __alertsMarkSeenTimer = 0;

function getAlertsUserId(session) {
  return getUserIdFromSession(session);
}

function getSessionUser(session) {
  return (
    session?.user ||
    session?.session?.user ||
    session?.data?.session?.user ||
    {}
  );
}

function getControlCenterTrigger() {
  return (
    document.getElementById('control-center-trigger') ||
    document.getElementById('alerts-bell')
  );
}

function getControlUserData(session, userId = null) {
  const u = getSessionUser(session);
  const trigger = getControlCenterTrigger();
  const displayName =
    trigger?.dataset?.displayName ||
    getFallbackDisplayName(session) ||
    'Usuario';

  return {
    userId: userId || getAlertsUserId(session),
    displayName,
    email: u?.email || '',
    avatarUrl:
      trigger?.dataset?.avatarUrl || '/images/profile-avatars/nova.svg',
  };
}

function ensureAlertsModalRoot() {
  let root = document.getElementById('alerts-modal-root');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'alerts-modal-root';
  root.className = 'alerts-modal-backdrop control-center-backdrop';
  root.setAttribute('hidden', '');
  root.innerHTML = `
    <div class="alerts-modal control-center-modal" role="dialog" aria-modal="false" aria-labelledby="control-center-title">
      <div class="alerts-modal-head control-center-head">
        <div class="control-center-user">
          <img class="control-center-avatar" data-control-avatar src="/images/profile-avatars/nova.svg" alt="" />
          <span class="control-center-user-text">
            <span class="alerts-modal-kicker">Centro de control</span>
            <h2 id="control-center-title" data-control-title>Cuenta</h2>
            <p data-control-subtitle>Perfil, lista, avisos y accesos rápidos.</p>
          </span>
        </div>
        <button class="alerts-modal-close" type="button" aria-label="Cerrar">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>

      <div class="alerts-tabs control-center-tabs" role="tablist" aria-label="Centro de control">
        <button class="alerts-tab is-active" type="button" role="tab" aria-selected="true" data-alerts-tab="account">
          <i class="fa-solid fa-sliders" aria-hidden="true"></i>
          Cuenta
        </button>
        <button class="alerts-tab" type="button" role="tab" aria-selected="false" data-alerts-tab="new">
          <i class="fa-solid fa-bolt" aria-hidden="true"></i>
          Notificaciones
          <span class="alerts-tab-count" data-alerts-count="new">0</span>
        </button>
        <button class="alerts-tab" type="button" role="tab" aria-selected="false" data-alerts-tab="reminders">
          <i class="fa-regular fa-bell" aria-hidden="true"></i>
          Recordatorios
          <span class="alerts-tab-count" data-alerts-count="reminders">0</span>
        </button>
        <button class="alerts-tab" type="button" role="tab" aria-selected="false" data-alerts-tab="mylist">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
          Mi Lista
          <span class="alerts-tab-count" data-alerts-count="mylist">0</span>
        </button>
        <button class="alerts-tab" type="button" role="tab" aria-selected="false" data-alerts-tab="seen">
          <i class="fa-solid fa-check" aria-hidden="true"></i>
          Vistos
          <span class="alerts-tab-count" data-alerts-count="seen">0</span>
        </button>
        <button class="alerts-tab" type="button" role="tab" aria-selected="false" data-alerts-tab="all">
          <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
          Todo
          <span class="alerts-tab-count" data-alerts-count="all">0</span>
        </button>
      </div>

      <div class="alerts-modal-body control-center-body" id="alerts-modal-body">
        <div class="alerts-empty">Cargando…</div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  root
    .querySelector('.alerts-modal-close')
    ?.addEventListener('click', closeAlertsModal);

  root.addEventListener('click', async (ev) => {
    if (ev.target === root) {
      closeAlertsModal();
      return;
    }

    const logoutBtn = ev.target?.closest?.('[data-control-logout]');
    if (logoutBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      logoutBtn.disabled = true;
      try {
        await signOut();
      } finally {
        window.location.href = '/login.html';
      }
      return;
    }

    const tab = ev.target?.closest?.('[data-alerts-tab]');
    if (!tab) return;

    ev.preventDefault();
    ev.stopPropagation();

    const tabName = tab.getAttribute('data-alerts-tab') || 'account';
    renderAlertsModalContent(
      root.__alertsData || { alerts: [], mylist: [], user: {} },
      tabName
    );
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !root.hasAttribute('hidden')) closeAlertsModal();
  });

  if (root.dataset.positionBound !== '1') {
    root.dataset.positionBound = '1';
    const reposition = () => positionControlCenterPopover(root);
    window.addEventListener('resize', reposition, { passive: true });
    window.addEventListener('scroll', reposition, { passive: true, capture: true });
  }

  return root;
}

function updateControlHeader(root, user = {}) {
  const avatar = root.querySelector('[data-control-avatar]');
  const title = root.querySelector('[data-control-title]');
  const subtitle = root.querySelector('[data-control-subtitle]');

  if (avatar) {
    avatar.src = user.avatarUrl || '/images/profile-avatars/nova.svg';
    avatar.alt = '';
  }
  if (title) title.textContent = user.displayName || 'Cuenta';
  if (subtitle)
    subtitle.textContent =
      user.email || 'Perfil, lista, avisos y accesos rápidos.';
}

function getControlCenterLayout(width) {
  return width < 370 ? 'compact' : 'vertical';
}

function positionControlCenterPopover(root = document.getElementById('alerts-modal-root')) {
  const trigger = getControlCenterTrigger();
  const modal = root?.querySelector?.('.control-center-modal');
  if (!root || !trigger || !modal || root.hasAttribute('hidden')) return;

  const rect = trigger.getBoundingClientRect();
  const viewportWidth =
    document.documentElement.clientWidth || window.innerWidth || 0;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;

  const edge = viewportWidth <= 640 ? 8 : 12;
  const gap = 8;

  // Conserva el borde derecho alineado con el botón.
  const triggerRight = Math.max(edge, viewportWidth - rect.right);
  const viewportAvailable = Math.max(240, viewportWidth - edge * 2);
  const availableFromTrigger = Math.max(
    240,
    viewportWidth - triggerRight - edge
  );

  /*
    Panel vertical:
    - escritorio: hasta 460 px;
    - tablet: hasta 420 px;
    - móvil: todo el ancho disponible.
  */
  const targetWidth =
    viewportWidth <= 520
      ? viewportAvailable
      : viewportWidth <= 900
        ? Math.min(420, viewportAvailable)
        : Math.min(460, viewportAvailable);

  const preferredWidth = Math.min(targetWidth, availableFromTrigger);
  const right = Math.max(
    edge,
    Math.min(triggerRight, viewportWidth - preferredWidth - edge)
  );

  // Sigue al botón durante el scroll y desaparece junto con la navegación.
  const top = rect.bottom + gap;
  const visibleTop = Math.max(edge, top);
  const maxHeight = Math.max(220, viewportHeight - visibleTop - edge);

  root.style.removeProperty('--control-center-left');
  root.style.setProperty('--control-center-right', `${Math.round(right)}px`);
  root.style.setProperty('--control-center-top', `${Math.round(top)}px`);
  root.style.setProperty(
    '--control-center-width',
    `${Math.round(preferredWidth)}px`
  );
  root.style.setProperty(
    '--control-center-max-height',
    `${Math.round(maxHeight)}px`
  );

  modal.dataset.layout = getControlCenterLayout(preferredWidth);
  modal.style.removeProperty('--control-center-column-min');
}

function closeAlertsModal() {
  const root = document.getElementById('alerts-modal-root');
  if (!root) return;
  root.setAttribute('hidden', '');
  document.body.classList.remove('alerts-modal-open');
}

function showAlertsModalRoot() {
  const root = ensureAlertsModalRoot();
  root.removeAttribute('hidden');
  document.body.classList.add('alerts-modal-open');
  positionControlCenterPopover(root);
  requestAnimationFrame(() => positionControlCenterPopover(root));
  return root;
}

function getAlertTitleHref(contentId) {
  if (!contentId) return '#';
  return `/title?title=${encodeURIComponent(String(contentId))}`;
}

function getMyListHref(userId) {
  if (!userId) return '/mylist';
  const q = new URLSearchParams({ list: String(userId), user: String(userId) });
  return `/mylist?${q.toString()}`;
}

function normalizeAlertsData(data) {
  if (Array.isArray(data))
    return { alerts: data, mylist: [], userId: null, user: {} };
  return {
    alerts: Array.isArray(data?.alerts) ? data.alerts : [],
    mylist: Array.isArray(data?.mylist) ? data.mylist : [],
    userId: data?.userId || data?.user?.userId || null,
    user: data?.user || {},
  };
}

function getAlertsGroups(data = {}) {
  const safe = normalizeAlertsData(data);
  const alerts = safe.alerts;
  const released = alerts.filter(
    (item) => item?.is_released !== false && !item?.is_pending
  );

  return {
    account: [],
    new: released.filter((item) => item.unseen),
    reminders: alerts.filter(
      (item) => item?.is_pending || item?.is_released === false
    ),
    mylist: safe.mylist,
    seen: released.filter((item) => !item.unseen),
    all: released,
  };
}

function getDefaultAlertsTab(data = {}) {
  return 'account';
}

function getAlertsEmptyMessage(tabName) {
  if (tabName === 'seen') return 'Todavía no tenés avisos vistos.';
  if (tabName === 'reminders') return 'No tenés recordatorios pendientes.';
  if (tabName === 'mylist') return 'Tu lista está vacía.';
  if (tabName === 'all') return 'Todavía no tenés avisos de lanzamiento.';
  return 'Todavía no tenés notificaciones nuevas.';
}

function updateAlertsTabs(root, data = {}, activeTab = 'account') {
  const groups = getAlertsGroups(data);

  root.querySelectorAll('[data-alerts-tab]').forEach((btn) => {
    const tab = btn.getAttribute('data-alerts-tab') || 'account';
    const active = tab === activeTab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  root.querySelectorAll('[data-alerts-count]').forEach((el) => {
    const tab = el.getAttribute('data-alerts-count') || 'new';
    const count = groups[tab]?.length || 0;
    el.textContent = count > 99 ? '99+' : String(count);
    el.hidden = count <= 0;
  });
}

function getAlertStatusMeta(item) {
  if (item?.is_pending || item?.is_released === false) {
    const stateText =
      item?.movie?.publish_state_text ||
      item?.movie?.release_year ||
      'Próximamente';
    return `Recordatorio activado · ${escapeHtml(stateText)}`;
  }

  if (item?.unseen) return 'Nuevo lanzamiento · Ya está disponible';
  return 'Aviso visto · Ya está disponible';
}

function renderAlertsList(
  items = [],
  { emptyMessage = 'Todavía no tenés avisos de lanzamiento.' } = {}
) {
  if (!items.length) {
    return `<div class="alerts-empty">${escapeHtml(emptyMessage)}</div>`;
  }

  return `
    <div class="alerts-list">
      ${items
        .map((item) => {
          const title = escapeHtml(
            item.title || item.movie?.title || 'Sin título'
          );
          const thumb = escapeHtml(
            item.thumbnail_url ||
              item.movie?.thumbnail_url ||
              item.movie?.banner_url ||
              ''
          );
          const href = getAlertTitleHref(item.content_id);
          const tag = item.in_my_list
            ? `<span class="alerts-item-mylist">Está en tu lista</span>`
            : '';
          const unseen = item.unseen
            ? `<span class="alerts-item-dot" aria-label="Sin ver"></span>`
            : '';
          const pending = item?.is_pending || item?.is_released === false;

          return `
          <a class="alerts-item ${item.unseen ? 'is-unseen' : ''} ${pending ? 'is-pending' : ''}" href="${href}">
            <span class="alerts-item-thumb" style="${thumb ? `background-image:url('${thumb}')` : ''}"></span>
            <span class="alerts-item-main">
              <span class="alerts-item-title">${title}</span>
              <span class="alerts-item-sub">${getAlertStatusMeta(item)}</span>
              ${tag}
            </span>
            ${unseen}
          </a>
        `;
        })
        .join('')}
    </div>
  `;
}

function renderMyListPreview(items = [], userId = null) {
  const openListHref = getMyListHref(userId);

  if (!items.length) {
    return `
      <div class="alerts-empty">
        Tu lista está vacía.
        <a class="alerts-inline-link" href="/index.html">Explorar títulos</a>
      </div>
    `;
  }

  return `
    <div class="alerts-section-head">
      <div>
        <strong>Mi Lista</strong>
        <span>${items.length} ${items.length === 1 ? 'título guardado' : 'títulos guardados'}</span>
      </div>
      <a class="alerts-mini-action" href="${openListHref}">
        <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
        Abrir lista
      </a>
    </div>
    <div class="alerts-mini-grid">
      ${items
        .map((item) => {
          const title = escapeHtml(item.title || 'Sin título');
          const thumb = escapeHtml(item.thumbnail_url || item.banner_url || '');
          const meta = escapeHtml(
            item.mylist_meta || item.duration_text || item.category || ''
          );
          const href = getAlertTitleHref(item.id || item.content_id);

          return `
          <a class="alerts-mini-card" href="${href}">
            <span class="alerts-mini-thumb" style="${thumb ? `background-image:url('${thumb}')` : ''}"></span>
            <span class="alerts-mini-main">
              <span class="alerts-mini-title">${title}</span>
              ${meta ? `<span class="alerts-mini-meta">${meta}</span>` : ''}
            </span>
          </a>
        `;
        })
        .join('')}
    </div>
  `;
}

function renderControlAccountPanel(data = {}) {
  const safe = normalizeAlertsData(data);
  const groups = getAlertsGroups(safe);
  const user = safe.user || {};
  const myListHref = getMyListHref(safe.userId);
  const newCount = groups.new.length;
  const remindersCount = groups.reminders.length;
  const listCount = groups.mylist.length;

  return `
    <div class="control-account-panel">
      <div class="control-profile-card">
        <img class="control-center-avatar is-large" src="${escapeHtml(user.avatarUrl || '/images/profile-avatars/nova.svg')}" alt="" />
        <span class="control-profile-main">
          <strong>${escapeHtml(user.displayName || 'Usuario')}</strong>
          <small>${escapeHtml(user.email || 'Cuenta SATV+')}</small>
        </span>
      </div>

      <div class="control-quick-grid">
        <a class="control-quick-action" href="/profile.html">
          <i class="fa-solid fa-user-gear" aria-hidden="true"></i>
          <span>
            <strong>Perfil y nickname</strong>
            <small>Editar cuenta, nombre y ajustes</small>
          </span>
        </a>
        <a class="control-quick-action" href="${myListHref}">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
          <span>
            <strong>Mi Lista</strong>
            <small>${listCount ? `${listCount} guardados` : 'Ver títulos guardados'}</small>
          </span>
        </a>
        <button class="control-quick-action" type="button" data-alerts-tab="new">
          <i class="fa-solid fa-bolt" aria-hidden="true"></i>
          <span>
            <strong>Notificaciones</strong>
            <small>${newCount ? `${newCount} nuevas` : 'Sin novedades nuevas'}</small>
          </span>
        </button>
        <button class="control-quick-action" type="button" data-alerts-tab="reminders">
          <i class="fa-regular fa-bell" aria-hidden="true"></i>
          <span>
            <strong>Recordatorios</strong>
            <small>${remindersCount ? `${remindersCount} pendientes` : 'Nada pendiente'}</small>
          </span>
        </button>
        <button class="control-quick-action is-danger" type="button" data-control-logout>
          <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i>
          <span>
            <strong>Cerrar sesión</strong>
            <small>Salir de esta cuenta</small>
          </span>
        </button>
      </div>

      <div class="control-stats-row">
        <button type="button" data-alerts-tab="new">
          <strong>${newCount}</strong>
          <span>nuevas</span>
        </button>
        <button type="button" data-alerts-tab="reminders">
          <strong>${remindersCount}</strong>
          <span>recordatorios</span>
        </button>
        <button type="button" data-alerts-tab="mylist">
          <strong>${listCount}</strong>
          <span>en lista</span>
        </button>
      </div>
    </div>
  `;
}

function maybeMarkReleaseAlertsSeen(data = {}, activeTab = 'account') {
  if (activeTab !== 'new') return;

  const safe = normalizeAlertsData(data);
  const unseenIds = getAlertsGroups(safe)
    .new.map((item) => item.content_id)
    .filter(Boolean);

  if (!safe.userId || !unseenIds.length) return;

  clearTimeout(__alertsMarkSeenTimer);
  __alertsMarkSeenTimer = setTimeout(async () => {
    try {
      await markReleaseAlertsSeen(safe.userId, unseenIds);
      scheduleAlertsBadgeRefresh();
    } catch (e) {
      console.warn('[ui] no se pudieron marcar alerts como vistas:', e);
    }
  }, 350);
}

function renderAlertsModalContent(data = {}, activeTab = null) {
  const root = ensureAlertsModalRoot();
  const body = root.querySelector('#alerts-modal-body');
  const safe = normalizeAlertsData(data);
  const tabName = activeTab || getDefaultAlertsTab(safe);
  const groups = getAlertsGroups(safe);

  root.__alertsData = safe;
  updateControlHeader(root, safe.user);
  updateAlertsTabs(root, safe, tabName);

  if (!body) return;

  if (tabName === 'account') {
    body.innerHTML = renderControlAccountPanel(safe);
    return;
  }

  if (tabName === 'mylist') {
    body.innerHTML = renderMyListPreview(groups.mylist, safe.userId);
    return;
  }

  body.innerHTML = renderAlertsList(groups[tabName] || groups.new, {
    emptyMessage: getAlertsEmptyMessage(tabName),
  });

  maybeMarkReleaseAlertsSeen(safe, tabName);
}

async function refreshAlertsBadge(session = null) {
  const badge = document.getElementById('alerts-badge');
  const bell = getControlCenterTrigger();
  if (!badge || !bell) return;

  const userId = getAlertsUserId(session || (await getSession()));
  if (!userId) {
    badge.hidden = true;
    badge.textContent = '';
    return;
  }

  try {
    const items = await fetchReleaseAlerts(userId, {
      limit: 80,
      includePending: true,
    });

    // Debe coincidir con la pestaña "Notificaciones":
    // sólo lanzamientos disponibles, sin leer.
    const unreadCount = getAlertsGroups({ alerts: items }).new.length;
    const hasUnread = unreadCount > 0;

    badge.hidden = !hasUnread;
    badge.textContent = hasUnread
      ? unreadCount > 99
        ? '99+'
        : String(unreadCount)
      : '';

    bell.classList.toggle('has-alerts', hasUnread);
    bell.setAttribute(
      'aria-label',
      hasUnread
        ? `Abrir centro de control: ${unreadCount} ${unreadCount === 1 ? 'notificación sin leer' : 'notificaciones sin leer'}`
        : 'Abrir centro de control'
    );
  } catch (e) {
    console.warn('[ui] no se pudieron cargar alerts:', e);
    badge.hidden = true;
    badge.textContent = '';
    bell.classList.remove('has-alerts');
  }
}

function scheduleAlertsBadgeRefresh() {
  clearTimeout(__alertsBadgeRefreshTimer);
  __alertsBadgeRefreshTimer = setTimeout(() => {
    refreshAlertsBadge().catch((e) =>
      console.warn('[ui] refresh alerts badge error:', e)
    );
  }, 120);
}

async function openAlertsModal(session = null) {
  const activeSession = session || (await getSession());
  const root = showAlertsModalRoot();
  const userId = getAlertsUserId(activeSession);
  const user = getControlUserData(activeSession, userId);

  root.__alertsData = { alerts: [], mylist: [], userId, user };
  renderAlertsModalContent(root.__alertsData, 'account');

  const body = root.querySelector('#alerts-modal-body');
  if (!userId) {
    if (body)
      body.innerHTML = `<div class="alerts-empty">Iniciá sesión para usar el centro de control.</div>`;
    return;
  }

  try {
    const [alerts, mylist] = await Promise.all([
      fetchReleaseAlerts(userId, { limit: 80, includePending: true }),
      fetchMyListPreview(userId, { limit: 12 }),
    ]);

    const data = { alerts, mylist, userId, user };
    renderAlertsModalContent(data, getDefaultAlertsTab(data));
  } catch (e) {
    console.warn('[ui] openAlertsModal error:', e);
    if (body)
      body.innerHTML = `<div class="alerts-empty">No se pudo cargar el centro de control.</div>`;
  }
}

async function initAlertsBell(session = null) {
  const bell = getControlCenterTrigger();
  if (!bell) return;

  if (bell.dataset.alertsBound !== '1') {
    bell.dataset.alertsBound = '1';
    bell.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      const root = document.getElementById('alerts-modal-root');
      if (root && !root.hasAttribute('hidden')) {
        closeAlertsModal();
        return;
      }

      await openAlertsModal(session || (await getSession()));
    });
  }

  if (!__alertsBellInitialized) {
    __alertsBellInitialized = true;
    window.addEventListener(
      'satv:release-reminders-changed',
      scheduleAlertsBadgeRefresh
    );
    window.addEventListener('focus', scheduleAlertsBadgeRefresh);
  }

  await refreshAlertsBadge(session || (await getSession()));
}

/* =========================
   DATA-HREF NAVIGATION
========================= */

let __dataHrefNavEnabled = false;

export function enableDataHrefNavigation() {
  if (__dataHrefNavEnabled) return;
  __dataHrefNavEnabled = true;

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;

    try {
      const path =
        typeof e.composedPath === 'function' ? e.composedPath() : null;
      if (
        path &&
        path.some(
          (node) =>
            node?.classList?.contains?.('overlay-hover-tarjeta') ||
            node?.classList?.contains?.('carousel-card-covered') ||
            node?.classList?.contains?.('carousel-card-partial')
        )
      ) {
        return;
      }
    } catch {}

    const target = e.target;
    if (!target?.closest) return;
    if (target.closest('.overlay-hover-tarjeta')) return;
    if (target.closest('.carousel-card-covered')) return;
    if (target.closest('.carousel-card-partial')) return;

    const interactive = target.closest(
      "button, input, select, textarea, a, [role='button'], .card-quick-plus-btn, .home-hero-mylist, .home-hero-reminder, .card-release-reminder-btn, .title-reminder-btn, .alerts-bell, .control-center-trigger, .alerts-modal, .boton-mi-lista-hover, .card-quick-modal-volume-btn, .boton-reproducir-hover, .carousel-card-covered, .carousel-card-partial"
    );
    if (interactive) return;

    const el = target.closest('[data-href]');
    if (!el) return;
    if (el.classList.contains('carousel-card-covered')) return;
    if (el.classList.contains('carousel-card-partial')) return;

    const href = el.dataset.href || el.getAttribute('data-href');
    if (!href) return;

    if (e.ctrlKey || e.metaKey) {
      window.open(href, '_blank', 'noopener');
      return;
    }

    window.location.href = href;
  });

  document.addEventListener('keydown', (e) => {
    const target = e.target;
    if (!target?.closest) return;
    if (target.closest('.overlay-hover-tarjeta')) return;
    if (target.closest('.carousel-card-covered')) return;
    if (target.closest('.carousel-card-partial')) return;

    const interactive = target.closest(
      "button, input, select, textarea, a, [role='button'], .card-quick-plus-btn, .home-hero-mylist, .home-hero-reminder, .card-release-reminder-btn, .title-reminder-btn, .alerts-bell, .control-center-trigger, .alerts-modal, .boton-mi-lista-hover, .card-quick-modal-volume-btn, .boton-reproducir-hover, .carousel-card-covered, .carousel-card-partial"
    );
    if (interactive) return;

    const el = target.closest('[data-href]');
    if (!el) return;
    if (el.classList.contains('carousel-card-covered')) return;
    if (el.classList.contains('carousel-card-partial')) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const href = el.dataset.href || el.getAttribute('data-href');
      if (href) window.location.href = href;
    }
  });
}

/* =========================
   MOVIE CARD BADGE (publish_state)
========================= */

function getMoviePublishState(movie) {
  const state = String(movie?.publish_state || 'public').toLowerCase();
  if (['public', 'upcoming', 'live', 'other'].includes(state)) return state;
  return 'public';
}

function getMovieBadgeLabel(movie) {
  const state = getMoviePublishState(movie);

  if (state === 'public') return '';
  if (state === 'upcoming') return 'Próximamente';
  if (state === 'live') return 'En Vivo';

  const custom = String(movie?.publish_state_text || '').trim();
  return custom || 'Otro';
}

function getMovieBadgeClass(movie) {
  const state = getMoviePublishState(movie);
  return `card-badge-${state}`;
}

/* =========================
   URL HELPERS
========================= */

export function buildTitleUrl(
  movieId,
  { collectionId = null, episodeId = null } = {}
) {
  if (!movieId) return '#';

  const parts = [];

  if (collectionId) {
    parts.push(`collection=${encodeURIComponent(String(collectionId))}`);
  }

  parts.push(`title=${encodeURIComponent(String(movieId))}`);

  if (episodeId) {
    parts.push(`episode=${encodeURIComponent(String(episodeId))}`);
  }

  return `/title?${parts.join('&')}`;
}

/* =========================
   MOVIE CARD
========================= */

export function cardHtml(
  movie,
  hrefOverride = null,
  subtitle = null,
  progressPercent = null,
  options = {}
) {
  const thumb = movie.thumbnail_url || '';
  const title = escapeHtml(movie.title || 'Sin título');
  const safeSubtitle = subtitle ? escapeHtml(subtitle) : '';
  const isContinueCard = Number.isFinite(progressPercent);
  const safeProgress = isContinueCard
    ? Math.min(100, Math.max(0, Number(progressPercent)))
    : 0;

  const href = hrefOverride
    ? hrefOverride
    : buildTitleUrl(movie?.id, {
        collectionId: movie?.collection_id || null,
      });

  const badgeLabel = getMovieBadgeLabel(movie);
  const badge = badgeLabel
    ? `<div class="card-badge ${getMovieBadgeClass(movie)}">${escapeHtml(badgeLabel)}</div>`
    : '';

  const isCollection =
    options?.showCollectionOverlay === true && !!movie?.collection_id;

  const collectionOverlay = isCollection
    ? `
      <div class="card-collection-overlay" aria-hidden="true">
        <img src="/images/svg/collections.svg" alt=""/>
      </div>
    `
    : '';

  const continueSeason = Number(
    options?.season ??
      options?.seasonNumber ??
      movie?.season ??
      movie?.season_number ??
      movie?.current_season
  );

  const continueEpisode = Number(
    options?.episode ??
      options?.episodeNumber ??
      movie?.episode ??
      movie?.episode_number ??
      movie?.current_episode
  );

  const isEpisodeContinue =
    Number.isFinite(continueSeason) &&
    continueSeason > 0 &&
    Number.isFinite(continueEpisode) &&
    continueEpisode > 0;

  const episodePrefix = isEpisodeContinue
    ? `T${Math.trunc(continueSeason)}E${Math.trunc(continueEpisode)}`
    : '';

  const continueTimeText = safeSubtitle
    ? episodePrefix && !/^T\d+E\d+\b/i.test(safeSubtitle)
      ? `${episodePrefix} · ${safeSubtitle}`
      : safeSubtitle
    : episodePrefix;

  const cardBody = isContinueCard
    ? `
      <div class="card-body card-continue-meta">
        <div class="progressbar" aria-label="Progreso de reproducción">
          <div class="progressfill" style="width:${safeProgress}%"></div>
        </div>
        <div class="card-continue-row">
          <span class="card-continue-label">Continuar</span>
          ${continueTimeText ? `<span class="card-continue-time">${continueTimeText}</span>` : ''}
        </div>
      </div>
    `
    : `
      <div class="card-body">
        <div class="card-title">${title}</div>
        ${safeSubtitle ? `<div class="card-subtitle">${safeSubtitle}</div>` : ''}
      </div>
    `;

  return `
    <div class="card${isContinueCard ? ' card-continue' : ''} no-select" role="link" tabindex="0" data-href="${href}">
      <div class="thumb" style="background-image:url('${thumb}'); position:relative;">
        ${collectionOverlay}
        ${badge}
      </div>
      ${cardBody}
    </div>
  `;
}

/* =========================
   SEARCH OVERLAY FULLSCREEN
========================= */

const SEARCH_OVERLAY_ID = 'search-overlay';
let __topnavSearchInit = false;
let __searchExperienceInit = false;
let __searchRequestSeq = 0;
let __searchDebounceTimer = null;
let __searchBaseUrl = null;

function normalizeSearchQuery(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function getCurrentSearchQueryFromUrl() {
  try {
    const url = new URL(window.location.href);
    return normalizeSearchQuery(url.searchParams.get('q') || '');
  } catch {
    return '';
  }
}

function getCurrentNonSearchUrl() {
  const url = new URL(window.location.href);
  return `${url.pathname}${url.search}${url.hash}`;
}

function rememberSearchBaseUrl() {
  const url = new URL(window.location.href);
  if (url.pathname !== '/search') {
    __searchBaseUrl = `${url.pathname}${url.search}${url.hash}`;
  }
}

function getFallbackBaseUrl() {
  return __searchBaseUrl || '/index.html';
}

function buildSearchUrl(query) {
  const q = normalizeSearchQuery(query);

  if (!q) {
    return getFallbackBaseUrl();
  }

  const base = new URL(window.location.origin + getFallbackBaseUrl());
  base.pathname = '/search';
  base.search = '';
  base.hash = '';
  base.searchParams.set('q', q);

  return `${base.pathname}${base.search}${base.hash}`;
}

function replaceSearchUrl(query) {
  const safeQuery = normalizeSearchQuery(query);

  if (safeQuery) {
    rememberSearchBaseUrl();
  }

  const nextUrl = buildSearchUrl(safeQuery);
  history.replaceState({ searchQuery: safeQuery }, '', nextUrl);
}

function dispatchSearchChange(query, extra = {}) {
  const safeQuery = normalizeSearchQuery(query);

  try {
    window.dispatchEvent(
      new CustomEvent('app:searchchange', {
        detail: {
          query: safeQuery,
          ...extra,
        },
      })
    );
  } catch (_) {}
}

function ensureSearchOverlay() {
  let root = document.getElementById(SEARCH_OVERLAY_ID);
  if (root) return root;

  root = document.createElement('div');
  root.id = SEARCH_OVERLAY_ID;
  root.className = 'search-overlay';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');

  root.innerHTML = `
    <div class="search-overlay-shell" role="dialog" aria-modal="true" aria-label="Búsqueda">
      <div class="search-overlay-topbar">
        <div class="search-overlay-brand" aria-hidden="true">
          <span class="search-overlay-kicker">SATV+</span>
          <strong>Buscar contenido</strong>
        </div>

        <div class="search-overlay-inputbar">
          <span class="search-overlay-input-icon" aria-hidden="true">
            <i class="fa-solid fa-magnifying-glass"></i>
          </span>
          <input
            id="search-overlay-input"
            class="search-overlay-input"
            type="search"
            placeholder="Películas, series, géneros..."
            autocomplete="off"
            enterkeyhint="search"
            spellcheck="false"
          />
          <button
            type="button"
            class="search-overlay-clear"
            data-search-clear
            aria-label="Limpiar búsqueda"
            title="Limpiar"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <button
          type="button"
          class="search-overlay-close"
          data-search-close
          aria-label="Cerrar búsqueda"
        >
          Cerrar
        </button>
      </div>

      <div class="search-overlay-content">
        <div class="search-overlay-status" id="search-overlay-status"></div>
        <div id="search-results" class="search-results-grid"></div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  const closeBtn = root.querySelector('[data-search-close]');
  const clearBtn = root.querySelector('[data-search-clear]');
  const overlayInput = root.querySelector('#search-overlay-input');

  closeBtn?.addEventListener('click', () => {
    closeSearchOverlay({ clearQuery: true });
  });

  clearBtn?.addEventListener('click', () => {
    syncSearchInputs('');
    clearTimeout(__searchDebounceTimer);
    overlayInput?.focus?.();
    renderSearchResults([], '');
    history.replaceState({ searchQuery: '' }, '', getFallbackBaseUrl());
  });

  root.addEventListener('click', (e) => {
    if (e.target === root) {
      closeSearchOverlay({ clearQuery: true });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (root.hidden) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearchOverlay({ clearQuery: true });
    }
  });

  overlayInput?.addEventListener('input', (e) => {
    const q = normalizeSearchQuery(e.target.value || '');
    syncSearchInputs(q);

    if (!q) {
      closeSearchOverlay({ clearQuery: false });
      clearTimeout(__searchDebounceTimer);
      return;
    }

    rememberSearchBaseUrl();
    replaceSearchUrl(q);
    debouncedSearch(q, 'overlay-input');
  });

  return root;
}

function getSearchInputs() {
  return [
    document.getElementById('topnav-search-input'),
    document.getElementById('search-overlay-input'),
  ].filter(Boolean);
}

function syncSearchInputs(query) {
  const q = String(query || '');
  for (const input of getSearchInputs()) {
    if (input.value !== q) input.value = q;
  }
}

function setSearchStatus(html) {
  const el = document.getElementById('search-overlay-status');
  if (el) el.innerHTML = html;
}

export function openSearchOverlay(query = '') {
  const root = ensureSearchOverlay();
  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('search-open');
  syncSearchInputs(query);

  const overlayInput = document.getElementById('search-overlay-input');
  requestAnimationFrame(() => {
    overlayInput?.focus?.();
    if (overlayInput && query) {
      const len = overlayInput.value.length;
      overlayInput.setSelectionRange(len, len);
    }
  });
}

export function closeSearchOverlay({ clearQuery = false } = {}) {
  const root = document.getElementById(SEARCH_OVERLAY_ID);
  if (!root) return;

  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('search-open');

  const results = document.getElementById('search-results');
  if (results) results.innerHTML = '';

  setSearchStatus('');

  if (clearQuery) {
    syncSearchInputs('');
    history.replaceState({ searchQuery: '' }, '', getFallbackBaseUrl());
    return;
  }

  const q = normalizeSearchQuery(
    document.getElementById('topnav-search-input')?.value || ''
  );
  if (!q) {
    history.replaceState({ searchQuery: '' }, '', getFallbackBaseUrl());
  }
}

function renderSearchMessage(html) {
  const results = document.getElementById('search-results');
  if (!results) return;
  results.innerHTML = '';
  setSearchStatus(html);
}

export function renderSearchResults(items = [], query = '') {
  const host = document.getElementById('search-results');
  if (!host) return;

  const safeQuery = normalizeSearchQuery(query);

  if (!safeQuery) {
    host.innerHTML = '';
    setSearchStatus(
      `<div class="search-empty-state">
        <span class="search-empty-kicker">Búsqueda SATV+</span>
        <strong>Empezá a escribir para encontrar contenido.</strong>
        <small>Películas, series, colecciones o géneros.</small>
      </div>`
    );
    return;
  }

  if (!Array.isArray(items) || !items.length) {
    host.innerHTML = '';
    setSearchStatus(`
      <div class="search-empty-state">
        <span class="search-empty-kicker">Sin resultados</span>
        <strong>No encontramos “${escapeHtml(safeQuery)}”.</strong>
        <small>Probá con otro título, saga, género o palabra clave.</small>
      </div>
    `);
    return;
  }

  setSearchStatus(`
    <div class="search-results-count">
      <span>Resultados</span>
      <strong>${items.length}</strong>
      <span>para “${escapeHtml(safeQuery)}”</span>
    </div>
  `);

  host.innerHTML = items
    .map((movie) =>
      cardHtml(movie, null, null, null, { showCollectionOverlay: true })
    )
    .join('');

  try {
    window.dispatchEvent(
      new CustomEvent('app:searchrendered', {
        detail: { root: host, query: safeQuery, items },
      })
    );
  } catch (_) {}
}

function debouncedSearch(query, source = 'input') {
  clearTimeout(__searchDebounceTimer);

  __searchDebounceTimer = setTimeout(() => {
    dispatchSearchChange(query, { source });
  }, 220);
}

export function initTopnavSearch() {
  if (__topnavSearchInit) return;
  __topnavSearchInit = true;

  ensureSearchOverlay();

  document.addEventListener('focusin', (e) => {
    const input = e.target?.closest?.('#topnav-search-input');
    if (!input) return;

    const q = normalizeSearchQuery(input.value || '');
    if (q) openSearchOverlay(q);
  });

  document.addEventListener('input', (e) => {
    const input = e.target?.closest?.('#topnav-search-input');
    if (!input) return;

    const q = normalizeSearchQuery(input.value || '');
    syncSearchInputs(q);

    if (!q) {
      closeSearchOverlay({ clearQuery: false });
      clearTimeout(__searchDebounceTimer);
      return;
    }

    rememberSearchBaseUrl();
    openSearchOverlay(q);
    replaceSearchUrl(q);
    debouncedSearch(q, 'topnav-input');
  });

  document.addEventListener('keydown', (e) => {
    const input = e.target?.closest?.('#topnav-search-input');
    if (!input) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearchOverlay({ clearQuery: true });
    }
  });

  window.addEventListener('popstate', () => {
    const query = getCurrentSearchQueryFromUrl();
    syncSearchInputs(query);

    if (query) {
      openSearchOverlay(query);
      dispatchSearchChange(query, { source: 'popstate' });
    } else {
      closeSearchOverlay({ clearQuery: false });
    }
  });
}

export function initSearchExperience() {
  if (__searchExperienceInit) return;
  __searchExperienceInit = true;

  // Las cards del overlay usan data-href; activamos su navegación global.
  enableDataHrefNavigation();
  ensureSearchOverlay();

  const currentUrl = getCurrentNonSearchUrl();
  if (!__searchBaseUrl && !currentUrl.startsWith('/search')) {
    __searchBaseUrl = currentUrl;
  }

  window.addEventListener('app:searchchange', async (e) => {
    const query = normalizeSearchQuery(e?.detail?.query || '');
    const requestId = ++__searchRequestSeq;

    syncSearchInputs(query);

    if (!query) {
      closeSearchOverlay({ clearQuery: false });
      return;
    }

    openSearchOverlay(query);
    renderSearchMessage(`
      <div class="search-loading">
        <span class="search-spinner" aria-hidden="true"></span>
        <span>Buscando <strong>${escapeHtml(query)}</strong>...</span>
      </div>
    `);

    try {
      const results = await searchMovies(query, 36);
      if (requestId !== __searchRequestSeq) return;
      renderSearchResults(results || [], query);
    } catch (error) {
      if (requestId !== __searchRequestSeq) return;
      console.error('[search] error:', error);
      renderSearchMessage(`
        <div class="search-empty-state">
          Ocurrió un error al buscar <strong>${escapeHtml(query)}</strong>.
        </div>
      `);
    }
  });

  const initialQuery = getCurrentSearchQueryFromUrl();
  if (initialQuery) {
    openSearchOverlay(initialQuery);
    dispatchSearchChange(initialQuery, { source: 'init' });
  }
}

/* =========================
   CSS DISFRAZADO
========================= */

function setDisguisedCssHref(href, linkId = 'app-style') {
  const link = document.getElementById(linkId);
  if (!link) return;
  link.href = href;
}

export function applyDisguisedCssFromId(
  id,
  {
    linkId = 'app-style',
    disguisedPrefix = '/css/satvplusClient.',
    disguisedSuffix = '.css',
  } = {}
) {
  const safe = id === null || id === undefined ? '0' : String(id);
  const href = `${disguisedPrefix}${encodeURIComponent(safe)}${disguisedSuffix}`;
  setDisguisedCssHref(href, linkId);
}

function getMovieIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('movie') || urlParams.get('title');
}

export function applyDisguisedCssFromMovieId({
  linkId = 'app-style',
  disguisedPrefix = '/css/satvplusClient.',
  disguisedSuffix = '.css',
  defaultId = '0',
} = {}) {
  const movieId = getMovieIdFromUrl();
  const id = movieId || defaultId;
  applyDisguisedCssFromId(id, { linkId, disguisedPrefix, disguisedSuffix });
}

/* =========================
   SET MOVIE TITLE
========================= */

export async function setMovieTitleFromUrl() {
  const movieId = getMovieIdFromUrl();

  if (!movieId) {
    document.title = 'Película no encontrada · SATV+';
    return null;
  }

  try {
    const movie = await fetchMovie(movieId);

    if (movie) {
      document.title = `${movie.title} · SATV+`;
      return movie;
    } else {
      document.title = 'Película no encontrada · SATV+';
      return null;
    }
  } catch (error) {
    console.error('Error al obtener la película:', error);
    document.title = 'Error al cargar la película · SATV+';
    return null;
  }
}
