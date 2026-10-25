/* SATV+ · Neura AI — overlay aislado en Shadow DOM.
 * Hoja CSS externa servida por el CSS UUID existente de SATV+.
 * No inserta estilos inline ni modifica estilos globales.
 * Panel desplegable/replegable, recordando la elección del visitante.
 */
'use strict';

const CSS_URL = '/css/c4e4a147-6a8d-4e31-9c02-7e1a924f5b30.css';
const NEURA_URL = 'https://neura.satvplus.com.ar/';
const STORAGE_KEY = 'satvplus:neura-overlay:collapsed';
const HOST_ID = 'satv-neura-overlay';
const xIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const brainIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.5A3.5 3.5 0 0 0 5.5 5 4.5 4.5 0 0 0 3 12.5 4.5 4.5 0 0 0 5.5 20 3.5 3.5 0 0 0 12 18m0-11.5A3.5 3.5 0 0 1 18.5 5 4.5 4.5 0 0 1 21 12.5 4.5 4.5 0 0 1 18.5 20 3.5 3.5 0 0 1 12 18V6.5ZM8 10l4 2m4-2-4 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const arrowIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function isHome() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  return (pathname === '/' || pathname === '/index.html') &&
    !new URLSearchParams(window.location.search).has('section');
}

function readCollapsed() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}
function persistCollapsed(value) {
  try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch { /* private browsing */ }
}

class SATVNeuraOverlay extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._cssReady = false;
    this._collapsed = readCollapsed();
  }

  connectedCallback() {
    if (this.shadowRoot.childNodes.length) return;
    // Evita un flash sin estilos mientras se carga el CSS del Shadow DOM.
    this.hidden = true;
    this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="${CSS_URL}">
      <section class="card" aria-label="Conocé Neura AI de SATV+">
        <div class="glow" aria-hidden="true"></div>
        <div class="orbit orbit--one" aria-hidden="true"></div>
        <div class="orbit orbit--two" aria-hidden="true"></div>
        <div class="head">
          <span class="label"><span class="label-star" aria-hidden="true">✦</span> NUEVO EN SATV+</span>
          <button type="button" class="close" aria-label="Cerrar promoción de Neura AI" title="Cerrar">${xIcon}</button>
        </div>
        <div class="content">
          <div class="brand" aria-label="Neura AI">NEURA <span>AI</span><i aria-hidden="true"></i></div>
          <h2>Una nueva forma de conversar.</h2>
          <p class="desc">Conocé nuestra nueva inteligencia artificial. Hablá, preguntá y explorá ideas con tu cuenta de SATV+.</p>
          <div class="actions">
            <a class="cta" href="${NEURA_URL}" target="_blank" rel="noopener noreferrer" aria-label="Probar Neura AI gratis en una pestaña nueva">Probá Neura AI ${arrowIcon}</a>
            <span class="free"><span aria-hidden="true">✓</span> Completamente gratis</span>
          </div>
        </div>
      </section>
      <button type="button" class="reopen" aria-label="Abrir promoción de Neura AI" title="Abrir Neura AI">${brainIcon}<span>Neura <strong>AI</strong></span><span class="reopen-plus" aria-hidden="true">+</span></button>
    `;

    this.shadowRoot.querySelector('.close').addEventListener('click', () => this.setCollapsed(true));
    this.shadowRoot.querySelector('.reopen').addEventListener('click', () => this.setCollapsed(false));

    const link = this.shadowRoot.querySelector('link[rel="stylesheet"]');
    link.addEventListener('load', () => {
      this._cssReady = true;
      this.applyState();
      this.hidden = !isHome();
    }, { once: true });
    link.addEventListener('error', () => {
      console.error('[NEURA] No se cargó el CSS del overlay: ' + CSS_URL);
      this.hidden = true;
    }, { once: true });
  }

  setCollapsed(value) {
    this._collapsed = !!value;
    persistCollapsed(this._collapsed);
    this.applyState();
  }

  applyState() {
    if (!this._cssReady) return;
    this.dataset.view = this._collapsed ? 'compact' : 'expanded';
    const card = this.shadowRoot.querySelector('.card');
    const opener = this.shadowRoot.querySelector('.reopen');
    card.hidden = this._collapsed;
    opener.hidden = !this._collapsed;
    opener.setAttribute('aria-expanded', String(!this._collapsed));
  }

  refreshVisibility() {
    if (this._cssReady) this.hidden = !isHome();
  }
}

if (!customElements.get('satv-neura-overlay')) {
  customElements.define('satv-neura-overlay', SATVNeuraOverlay);
}

function mountNeuraOverlay() {
  if (!document.body) return;
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('satv-neura-overlay');
    host.id = HOST_ID;
    document.body.appendChild(host);
  }
  host.refreshVisibility();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountNeuraOverlay, { once: true });
} else {
  mountNeuraOverlay();
}
window.addEventListener('pageshow', mountNeuraOverlay);
window.addEventListener('popstate', mountNeuraOverlay);
window.addEventListener('satv:pagechange', mountNeuraOverlay);
