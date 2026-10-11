/* SATV+ VR — Azul Esencial 2026
 * Card flotante independiente. Sin modificar el navbar ni el flujo del documento.
 * El único lanzamiento anunciado por SATV+ es VR.
 */
const VR_HOST_ID = 'satv-vr-overlay-portal';
const VR_CLOSED_KEY = 'satv:vr-midnight-overlay:closed:v1';
const VR_PATHS = new Set(['/', '/index.html', '/title', '/title.html', '/mylist', '/mylist.html']);

const VR_HTML = `
<style>
  :host { display: block; font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; }
  *, *::before, *::after { box-sizing: border-box; }
  [hidden] { display: none !important; }
  .card {
    position: relative;
    width: 100%; max-height: calc(100dvh - 28px); overflow: auto;
    color: #fff; pointer-events: auto; isolation: isolate;
    background: linear-gradient(158deg, #101d4f 0%, #0b1539 44%, #070d26 100%);
    border: 1px solid #344ea3; border-radius: 10px;
    box-shadow: 0 20px 54px rgba(2, 5, 19, .66), 0 0 0 1px rgba(41, 66, 156, .15);
    scrollbar-color: #29459b #080f29;
  }
  .head { display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 17px;border-bottom:1px solid #24356c; }
  .logo { display:flex;align-items:center;gap:10px;font-size:13px;font-weight:900;letter-spacing:.035em;color:#fff; }
  .logo strong {color:#fff;font-size:19px;letter-spacing:-.06em;}
  .close { display:grid;place-items:center;flex:none;width:31px;height:31px;background:#162457;border:1px solid #3956a9;border-radius:6px;color:#fff;cursor:pointer; }
  .close:hover {background:#233b83;color:#fff;}
  .close svg {width:16px;height:16px;}
  .content {padding:20px 21px 17px;}
  .label {font-size:11px;font-weight:900;letter-spacing:.12em;color:#fff;margin-bottom:13px;}
  h2 {margin:0;font-size:clamp(24px, 3vw, 31px);font-weight:950;line-height:1.08;letter-spacing:-.045em;color:#fff;}
  h2 span {display:block;color:#fff;margin-top:5px;}
  .desc {margin:14px 0 0;font-size:13px;font-weight:560;line-height:1.55;color:#fff;}
  .bottom {display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 17px 14px;border-top:1px solid #24356c;background:#09112f;}
  .date {display:flex;flex-direction:column;gap:4px;flex-shrink:0;}
  .date small {font-size:9px;font-weight:900;letter-spacing:.09em;color:#fff;}
  .date strong {font-size:14px;font-weight:950;line-height:1.15;color:#fff;}
  .cta {display:flex;align-items:center;justify-content:center;gap:11px;padding:11px 12px;min-height:42px;text-align:center;text-decoration:none;font-size:11px;font-weight:950;letter-spacing:.035em;border-radius:6px;border:1px solid #466be2;background:#2143b3;color:#fff;pointer-events:auto;}
  .cta:hover {background:#3056d0;}
  .cta svg {height:16px;width:16px;flex:none;}
  .reopen {display:flex;align-items:center;gap:9px;margin-left:auto;pointer-events:auto;cursor:pointer;padding:10px 13px;background:#101d4f;border:1px solid #3954ae;color:#fff;border-radius:10px;box-shadow:0 10px 36px #030715b8;font-weight:900;font-size:12px;}
  .reopen:hover {background:#1a3079;}
  .reopen svg {height:25px;width:25px;}
  button:focus-visible,a:focus-visible {outline:2px solid #5674ee;outline-offset:3px;}
  @media(max-width:450px) {
    .head {padding:10px 13px;}
    .content {padding:15px 15px 13px;}
    .label {margin-bottom:10px;}
    h2 {font-size:24px;}
    .desc {font-size:12px;}
    .bottom {padding:10px 13px;}
    .date strong {font-size:12px;}
    .cta {padding:10px;font-size:10px;}
  }
</style>
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
  Object.assign(host.style, {
    position: 'fixed', right: 'max(14px, env(safe-area-inset-right))',
    bottom: 'max(14px, env(safe-area-inset-bottom))',
    width: 'min(410px, calc(100vw - 28px))', maxWidth: '100%',
    margin: '0', padding: '0', zIndex: '90', pointerEvents: 'none'
  });
  const root = host.attachShadow({mode: 'open'});
  root.innerHTML = VR_HTML;
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
