/* SATV+ | Gráfica VR 2026 (aislada del navbar)
   - Este módulo no toca #topnav, nav-left, nav-right, el buscador ni el avatar.
   - El diseño vive en Shadow DOM y no hereda selectores de styles.css.
   - Se monta en document.body, con position:absolute y fuera del flujo.
   - Solo se muestra en las páginas de catálogo con navbar inicializado.
*/

const ID = 'satv-vr-overlay-portal';
const LANDING = '/vr.html';
const allowedPaths = new Set(['/', '/index.html', '/title', '/title.html', '/mylist', '/mylist.html']);
let mounted = false;
let resizeObserver = null;
let mutationObserver = null;
let positionScheduled = false;
let initialized = false;

const markup = `
<style>
:host { display:block; color:#f8fbff; font-family:inherit; }
*, *::before, *::after { box-sizing:border-box; }
.graph {
  position:relative; width:100%; overflow:hidden;
  border:1px solid rgba(193,213,238,.43); border-radius:5px;
  background:linear-gradient(117deg,rgba(25,34,46,.97),rgba(67,85,109,.95) 45%,rgba(17,31,49,.97));
  box-shadow:0 14px 34px rgba(0,0,0,.34), inset 0 1px rgba(250,253,255,.19);
  isolation:isolate; pointer-events:none;
}
.graph::before { content:''; position:absolute; inset:0 auto 0 0; width:4px;
  background:linear-gradient(#e4f1ff,#80afe4,#496f9c); }
.graph::after { content:''; position:absolute; inset:0 0 0 auto; width:25%;
  background:repeating-linear-gradient(125deg, transparent 0 26px,rgba(215,234,255,.06) 27px,transparent 28px 50px); pointer-events:none; }
.body {position:relative;z-index:1;display:grid;grid-template-columns:90px minmax(0,1fr) 150px;gap:13px;align-items:center;min-height:69px;padding:7px 12px 7px 7px;}
.plate {display:flex;flex-direction:column;align-items:center;justify-content:center;align-self:stretch;text-align:center;padding:6px 12px 6px 5px;
 clip-path:polygon(0 0,88% 0,100% 50%,88% 100%,0 100%);
 background:linear-gradient(135deg,#718eae,#354b68 58%,#1c2d43);border-left:2px solid #badbff;}
.plate-brand {font-size:8px;font-weight:900;line-height:1.1;letter-spacing:.07em;}
.plate-brand b {color:#c6e3ff;}
.plate-vr {font-size:28px;font-weight:950;line-height:1;letter-spacing:-.065em;}
.plate-date {font-size:7px;color:#cbdeee;font-weight:850;white-space:nowrap;}
.story {display:flex;min-width:0;flex-direction:column;justify-content:center;gap:4px;}
.label {display:flex;align-items:center;gap:7px;font-size:9px;font-weight:850;letter-spacing:.105em;color:#bcd8f5;}
.label::before {content:'';width:5px;height:5px;border-radius:50%;background:#c2e1ff;box-shadow:0 0 9px #89beee;}
.headline {font-size:clamp(12px,1.15vw,17px);font-weight:950;letter-spacing:-.022em;line-height:1.2;color:white;}
.headline em {font-style:normal;color:#d3e9ff;}
.subline {font-size:10px;font-weight:650;line-height:1.3;color:#ccd8e8;}
.action {min-width:0;display:flex;flex-direction:column;justify-content:center;align-items:flex-end;gap:8px;
  border-left:1px solid rgba(204,230,255,.24);padding-left:10px;}
.action-date {white-space:nowrap;font-size:8px;font-weight:850;letter-spacing:.08em;color:#b6cde6;}
.link {display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:30px;padding:0 10px;
 color:#fff!important;text-decoration:none;font-size:10px;font-weight:900;letter-spacing:.02em;border-radius:3px;
 border:1px solid rgba(230,242,255,.52);background:linear-gradient(120deg,#7da6d2,#41678d);
 box-shadow:inset 0 1px rgba(255,255,255,.19);pointer-events:auto;cursor:pointer;
 transition:filter .15s ease;}
.link:hover {filter:brightness(1.16);}
.link:focus-visible {outline:2px solid #fff;outline-offset:2px;}
.link svg {width:13px;height:13px;flex:none;}
.footer {position:relative;z-index:1;display:flex;align-items:center;gap:10px;min-height:19px;padding:3px 14px;
 border-top:1px solid rgba(209,231,252,.18);background:rgba(5,16,29,.44);
 color:#b1c7dd;font-size:8px;font-weight:850;letter-spacing:.10em;}
.footer-rule {flex:1;height:1px;background:linear-gradient(90deg,rgba(196,220,247,.3),transparent);}
.footer .tech {white-space:nowrap;}
@media(max-width:680px) {
 .body {grid-template-columns:65px minmax(0,1fr) 34px;gap:8px;min-height:76px;padding:7px 8px;}
 .plate {padding:4px 8px 4px 2px;}
 .plate-vr {font-size:23px;}
 .plate-date {font-size:6px;}
 .label {font-size:7px;letter-spacing:.02em;}
 .headline {font-size:12px;}
 .subline {font-size:9px;}
 .action {padding-left:4px;}
 .action-date {display:none;}
 .link {font-size:0;padding:0;width:30px;min-height:30px;}
 .link svg {width:17px;height:17px;}
 .footer {font-size:7px;padding-inline:10px;}
}
@media(max-width:390px) {
 .label {font-size:6px;}
 .headline {font-size:11px;}
 .footer-brand {display:none;}
}
@media(prefers-reduced-motion:reduce){.link{transition:none}}
</style>
<div class="graph" role="region" aria-label="Anuncio VR, diciembre de 2026">
  <div class="body">
    <div class="plate" aria-hidden="true">
      <span class="plate-brand">SATV<b>+</b></span>
      <span class="plate-vr">VR</span>
      <span class="plate-date">DIC · 2026</span>
    </div>
    <div class="story">
      <span class="label">EL PRÓXIMO CAPÍTULO DEL CINE</span>
      <strong class="headline">LA PANTALLA GRANDE <em>FUE SOLO EL COMIENZO.</em></strong>
      <span class="subline">La realidad virtual llega a SATV+ este diciembre.</span>
    </div>
    <div class="action">
      <span class="action-date">PRÓXIMAMENTE · 2026</span>
      <a class="link" href="${LANDING}" aria-label="Descubrí la próxima experiencia VR de SATV+">DESCUBRÍ MÁS
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h13m-5-5 5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>
    </div>
  </div>
  <div class="footer" aria-hidden="true">
    <span class="footer-brand">SATV+ ORIGINAL EXPERIENCE</span>
    <span class="footer-rule"></span>
    <span class="tech">VR / VR360 / 360°</span>
  </div>
</div>`;

function navIsReady() {
  const nav = document.getElementById('topnav');
  if (!nav || !nav.querySelector('.nav-left') || !nav.querySelector('.nav-right')) return null;
  return nav;
}

function desktopNavWrapped(nav) {
  // En escritorio no mostramos el gráfico si el navbar ya está desarmado:
  // evita ocultar un problema de maquetación existente o tapar controles.
  if (window.innerWidth < 1000) return false;
  const left = nav.querySelector('.nav-left');
  const right = nav.querySelector('.nav-right');
  if (!left || !right) return false;
  const a = left.getBoundingClientRect();
  const b = right.getBoundingClientRect();
  return a.height > 0 && b.height > 0 && Math.abs((a.top+a.bottom)/2-(b.top+b.bottom)/2) > 20;
}

function placeOverlay() {
  positionScheduled = false;
  const nav = navIsReady();
  const host = document.getElementById(ID);
  if (!nav || !host) return;

  if (desktopNavWrapped(nav)) {
    host.style.visibility = 'hidden';
    console.warn('[SATV+ VR] Barra de navegación desalineada; oculto el overlay para no tapar el header. Revisar CSS original del navbar.');
    return;
  }

  host.style.visibility = 'visible';
  const rect = nav.getBoundingClientRect();
  // El overlay empieza BAJO el navbar: no se agregan márgenes, alturas o rellenos.
  const top = Math.max(0, rect.bottom + window.scrollY + 12);
  const left = Math.max(12, rect.left + window.scrollX + 22);
  const maxLeft = Math.max(12, document.documentElement.clientWidth - host.offsetWidth - 12);
  host.style.top = `${Math.round(top)}px`;
  host.style.left = `${Math.round(Math.min(left, maxLeft))}px`;
}

function schedulePlacement() {
  if (positionScheduled) return;
  positionScheduled = true;
  requestAnimationFrame(placeOverlay);
}

function mount() {
  if (mounted || !allowedPaths.has(window.location.pathname)) return;
  const nav = navIsReady();
  if (!nav || !document.body) return;
  const rect = nav.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  mounted = true;
  // A diferencia de la versión anterior, NO se añade ningún CSS global.
  const host = document.createElement('div');
  host.id = ID;
  host.setAttribute('data-satv-vr-overlay','');
  Object.assign(host.style, {
    position:'absolute',
    zIndex:'220',
    width:'min(840px, calc(100vw - 28px))',
    maxWidth:'100%',
    margin:'0',
    padding:'0',
    left:'0px',
    top:'0px',
    pointerEvents:'none',
    visibility:'hidden'
  });
  const shadow = host.attachShadow({mode:'open'});
  shadow.innerHTML = markup;
  document.body.appendChild(host);
  schedulePlacement();
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(schedulePlacement);
    resizeObserver.observe(nav);
  }
  window.addEventListener('resize', schedulePlacement, {passive:true});
  window.addEventListener('pageshow', schedulePlacement, {passive:true});
  window.addEventListener('load', schedulePlacement, {once:true,passive:true});
}

function setup() {
  if (initialized || !allowedPaths.has(window.location.pathname)) return;
  initialized = true;
  mount();
  if (mounted) return;
  // Esperar a que el JS de la página ejecute renderNav(), sin tocarlo.
  mutationObserver = new MutationObserver(() => {
    mount();
    if (mounted) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
  });
  mutationObserver.observe(document.body, {subtree:true, childList:true});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setup, {once:true});
} else {
  setup();
}
