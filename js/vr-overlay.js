/* SATV+ VR — Azul Esencial 2026
 * Card flotante independiente. Sin modificar el navbar ni el flujo del documento.
 * El único lanzamiento anunciado por SATV+ es VR.
 */
const VR_HOST_ID = 'satv-vr-overlay-portal';
const VR_CLOSED_KEY = 'satv:vr-midnight-overlay:closed:v1';
const VR_PATHS = new Set(['/', '/index.html', '/title', '/title.html', '/mylist', '/mylist.html']);

// CSS original: /css/vr-overlay.css. URL publica: UUID propio del overlay.
// Los primeros 8 digitos identifican el paquete CSS para la funcion de Vercel;
// el resto es aleatorio y conserva el formato UUID v4.
const VR_CSS_UUID_NAMESPACE = 'a71e0a9d';
function makeVrOverlayCssUrl() {
  let id;
  if (globalThis.crypto?.randomUUID) {
    id = crypto.randomUUID();
  } else {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    id = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  }
  return '/css/' + VR_CSS_UUID_NAMESPACE + id.slice(8) + '.css';
}

const VR_HTML = `
<section class="card" id="vr-card" aria-label="Lanzamiento de SATV+ VR en diciembre de 2026">
  <div class="head">
    <div class="logo"><strong>SATV+</strong> / VR</div>
    <button class="close" type="button" data-vr-close title="Cerrar anuncio" aria-label="Cerrar anuncio de SATV+ VR">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
    </button>
  </div>
  <div class="content">
    <div class="label">PRÓXIMAMENTE EN SATV+</div>
    <h2>MÁS ALLÁ DEL CINE.<span>Sentite parte de tu película favorita.</span></h2>
    <p class="desc">Viví tus historias favoritas más cerca que nunca. En diciembre llega SATV+ VR: películas, series y programas en una gran pantalla virtual a través de un visor.</p>
  </div>
  <div class="bottom">
    <div class="date"><small>LANZAMIENTO VR</small><strong>DICIEMBRE 2026</strong></div>
    <a class="cta" href="/vr.html">DESCUBRÍ MÁS
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h13m-5-5 5 5-5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </a>
  </div>
</section>
<button class="reopen" data-vr-open type="button" hidden aria-label="Volver a abrir anuncio de SATV+ VR" title="Abrir anuncio de SATV+ VR">
  <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="5" y="15" width="38" height="20" rx="8" stroke="currentColor" stroke-width="3"/><path d="M14 25c2-6 7-6 10-1 3-5 8-5 10 1" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="16" cy="25" r="3" fill="currentColor"/><circle cx="32" cy="25" r="3" fill="currentColor"/></svg>
  SATV+ VR
</button>`;

function readClosed() {
  try { return sessionStorage.getItem(VR_CLOSED_KEY) === '1'; }
  catch { return false; }
}
function saveClosed(value) {
  try { sessionStorage.setItem(VR_CLOSED_KEY, value ? '1' : '0'); }
  catch { /* almacenamiento deshabilitado */ }
}
function setClosed(root, closed) {
  const card = root.getElementById('vr-card');
  const reopen = root.querySelector('[data-vr-open]');
  if (card && reopen) { card.hidden = closed; reopen.hidden = !closed; }
}
function mountVrOverlay() {
  if (!document.body || !VR_PATHS.has(window.location.pathname) || document.getElementById(VR_HOST_ID)) return;
  const host = document.createElement('div');
  host.id = VR_HOST_ID;
  // CSS exclusivamente externo: se carga mediante un link en Shadow DOM.
  // Ocultamos el componente hasta que su hoja de estilos esté lista.
  host.hidden = true;
  const root = host.attachShadow({mode: 'open'});
  root.innerHTML = VR_HTML;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = makeVrOverlayCssUrl();
  stylesheet.addEventListener('load', () => { host.hidden = false; }, {once: true});
  stylesheet.addEventListener('error', () => {
    console.error('[SATV+ VR] No se pudo cargar el CSS externo:', stylesheet.href);
  }, {once: true});
  root.prepend(stylesheet);
  document.body.appendChild(host);
  setClosed(root, readClosed());
  root.querySelector('[data-vr-close]')?.addEventListener('click', () => {
    saveClosed(true); setClosed(root, true);
    root.querySelector('[data-vr-open]')?.focus();
  });
  root.querySelector('[data-vr-open]')?.addEventListener('click', () => {
    saveClosed(false); setClosed(root, false);
    root.querySelector('[data-vr-close]')?.focus();
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !root.getElementById('vr-card')?.hidden) {
      saveClosed(true); setClosed(root, true);
      root.querySelector('[data-vr-open]')?.focus();
    }
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountVrOverlay, {once:true});
else mountVrOverlay();