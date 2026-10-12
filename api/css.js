/* SATV+ CSS por ID — modelo de /api/article-css de SATV Sports.
 * /css/<ID>.css -> /api/css?id=<ID> -> CSS original.
 * No cambia los archivos JS/HTML existentes.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const CSS_BY_PAGE = Object.freeze({
  "index": [
    "styles.css",
    "initial.html.css"
  ],
  "title": [
    "styles.css",
    "title.css"
  ],
  "mylist": [
    "styles.css",
    "mylist.css"
  ],
  "watch": [
    "watch.css"
  ],
  "login": [
    "styles.css",
    "auth.css"
  ],
  "register": [
    "styles.css"
  ],
  "profiles": [
    "styles.css",
    "profiles.css"
  ],
  "profile": [
    "styles.css",
    "account.css"
  ],
  "recovery": [
    "styles.css"
  ],
  "recovery-pass": [
    "styles.css"
  ],
  "emailchange": [
    "styles.css"
  ],
  "emailchange-approve": [
    "styles.css"
  ],
  "about": [
    "about.css"
  ],
  "oldabout": [
    "oldabout.css"
  ],
  "privacy": [
    "privacy.css"
  ],
  "support": [
    "support.css"
  ],
  "vr": [
    "styles.css",
    "vr.css"
  ]
});
const CSS_ASSETS = Object.freeze({
  "c1122ef5-7260-5930-805d-87a382cbb579": "css/about.css",
  "6f02a228-74c2-5ce1-a808-d1aaddf16c6d": "css/account.css",
  "285153c2-c52a-5a28-9c9f-5329e534b7bd": "css/auth.css",
  "9f6e32ac-b08c-522b-bece-418de27cd05f": "css/fonts.css",
  "714f9d5b-3383-5512-a840-4c2699af83c1": "css/fonts/amazon/AEmber.css",
  "a7920957-ad3f-5ebd-b85d-9781f17e10a3": "css/fonts/discord/ggsans/GGSans.css",
  "ddc09056-8a5c-5724-a654-2a66ace85d55": "css/fonts/hbomaxsans/hbomaxsans.css",
  "7b25401f-f6ca-5e28-8d1e-44dfb011d5db": "css/fonts/premium/proximanova/ParamountPN.css",
  "2b41d808-fb6a-5e69-9f2f-42ded3c61c71": "css/fonts/satvplusfont/satvplusfont.css",
  "9110f88e-5429-5b9c-9788-8e24dc995b71": "css/initial.html.css",
  "04c0f24d-0d1a-58b5-9027-66ae07a95753": "css/mylist.css",
  "9adc0760-d3bb-542a-aed4-1f1275d6a41f": "css/oldabout.css",
  "7e4af5b8-2d91-54fd-b0d3-9e1ead6b0981": "css/privacy.css",
  "d8906211-092e-5538-81d4-c8f76db9fa77": "css/profiles.css",
  "246ed69e-c6a3-5f37-82c3-0b7012a06168": "css/satv-route-about.css",
  "dd62ed80-87f9-5600-86f3-cb1f2cbee3f6": "css/satv-route-emailchange-approve.css",
  "107bce16-a000-5e04-b938-17451d1c670c": "css/satv-route-emailchange.css",
  "b2065b77-0867-5da1-9e69-e43c7b5b037b": "css/satv-route-index.css",
  "55a36bb4-cae1-5944-a590-ba2e59db7c56": "css/satv-route-login.css",
  "724bc985-c464-5b1a-818f-7c1f5235bcf8": "css/satv-route-mylist.css",
  "caefa962-1282-5f76-882b-a2d38860bf30": "css/satv-route-oldabout.css",
  "fb33c7c7-d5db-51b1-9be6-97d42f189a8a": "css/satv-route-privacy.css",
  "3eb111bb-fdeb-585e-a39e-8b707825ea6a": "css/satv-route-profile.css",
  "e32ec473-d682-565e-b32e-8aa0f7729860": "css/satv-route-profiles.css",
  "44061fcb-dcbd-5474-8e2b-a482e0ef5df3": "css/satv-route-recovery-pass.css",
  "735d1b0b-1ed1-5e9b-8ccd-ea4895950bbc": "css/satv-route-recovery.css",
  "d9722b75-982d-5333-a7e3-5142460b2ee1": "css/satv-route-register.css",
  "51328088-b3a6-5836-8a48-ff593da1e7e3": "css/satv-route-support.css",
  "c33d9be3-e3fd-5902-bf0a-0e555be2d30f": "css/satv-route-title.css",
  "e89ac30f-2000-51a1-9a47-69593260488c": "css/satv-route-vr.css",
  "8c8bc7f9-a4a3-5b04-aafb-72c424f1c273": "css/satv-route-watch.css",
  "fac96421-04ac-5bfd-92d9-b943d18ce41a": "css/styles.css",
  "f8d18d13-37c1-55e9-aafb-2cc84599e331": "css/support.css",
  "f764dace-cad8-550a-ba4a-dcad04b0a9a1": "css/title.css",
  "47cfe9de-4b47-54ae-a75e-085a2b60110b": "css/vr-graph.css",
  "27fd5a31-a979-5557-be13-82053dc58f36": "css/vr-overlay.css",
  "fd9b06e0-49dc-5581-a4f9-8a60d9ce58fe": "css/vr.css",
  "aee7be2c-d9d3-5416-8f75-7db32c340afb": "css/watch.css"
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMPORT = /@import\s+(?:url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)|"[^"]*"|'[^']*')\s*[^;]*;/gi;

function pageFor(req) {
  const value = req.headers.referer || '';
  try {
    const source = new URL(value);
    if (source.host.toLowerCase() !== String(req.headers.host || '').toLowerCase()) return 'index';
    const key = source.pathname.replace(/\/$/, '').split('/').pop().replace(/\.html$/i, '') || 'index';
    return Object.prototype.hasOwnProperty.call(CSS_BY_PAGE, key) ? key : 'index';
  } catch (_) { return 'index'; }
}
function normalUrl(raw, file) {
  const trimmed=String(raw).trim();
  if (!trimmed || /^(?:data:|https?:|\/\/|\/|#|blob:)/i.test(trimmed)) return trimmed;
  const full=path.posix.normalize(path.posix.join('/',path.posix.dirname(file),trimmed));
  return full.startsWith('/css/') ? full : trimmed;
}
function rebase(css, file) {
  // Cambiar solo URLs relativas a rutas absolutas de los recursos físicos.
  // Así @font-face en /css/UUID.css sigue encontrando sus .woff/.ttf.
  return css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,(match,a,b,c)=>{
    const original=(a??b??c).trim();
    const target=normalUrl(original,file);
    return target===original ? match : `url("${target}")`;
  });
}
function stylesheet(file) {
  if (!file.startsWith('css/') || file.includes('..')) throw new Error('CSS no permitido');
  const absolute=path.join(process.cwd(),file);
  return rebase(fs.readFileSync(absolute,'utf8'),file);
}
function combine(files) {
  const imports=[];
  const parts=[];
  const seen=new Set();
  for (const file of files) {
    const text=stylesheet(file);
    const body=text.replace(IMPORT, statement=>{
      const key=statement.trim();
      if (!seen.has(key)) {seen.add(key);imports.push(key);}
      return '';
    });
    parts.push(`/* ${file} */\n${body}`);
  }
  return [...imports,...parts].join('\n');
}

/* AkiraPlayer: esta misma función central de Vercel entrega el CSS del
 * segundo dominio. El CSS compilado físico de Akira se sirve desde
 * https://akira.satvplus.com.ar/AkiraPlayer.css (sin apuntar a /css/UUID).
 * Incluimos una copia de respaldo para interrupciones puntuales del CDN. */
const AKIRA_ORIGINAL_URL = 'https://akira.satvplus.com.ar/AkiraPlayer.css';
const AKIRA_BACKUP_CSS = 'css/akiraplayer/AkiraPlayer.css';
let akiraCachedCss = null;
let akiraCachedUntil = 0;
let akiraPending = null;
async function akiraOriginalCss() {
  if (akiraCachedCss && Date.now() < akiraCachedUntil) return { css: akiraCachedCss, source: 'akira-live-cache' };
  if (!akiraPending) {
    akiraPending = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6500);
      try {
        const response = await fetch(AKIRA_ORIGINAL_URL, {
          signal: controller.signal,
          headers: { 'Accept': 'text/css' },
          redirect: 'follow'
        });
        if (!response.ok) throw new Error('Akira HTTP ' + response.status);
        const css = await response.text();
        if (!css.trim() || /<\s*html[\s>]/i.test(css.slice(0, 300))) {
          throw new Error('Akira respondió un documento que no es CSS');
        }
        akiraCachedCss = css;
        akiraCachedUntil = Date.now() + 2 * 60 * 1000;
        return { css, source: 'akira-live' };
      } finally { clearTimeout(timer); }
    })();
  }
  try { return await akiraPending; }
  catch (error) {
    console.warn('[SATV CSS] Akira original no disponible, usando respaldo:', error.message);
    return { css: fs.readFileSync(path.join(process.cwd(), AKIRA_BACKUP_CSS), 'utf8'), source: 'akira-backup' };
  }
  finally { akiraPending = null; }
}

module.exports = async (req,res)=> {
  const id=String(req.query?.id||'').toLowerCase();
  if (!UUID.test(id)) {
    res.status(404).setHeader('Content-Type','text/plain; charset=utf-8');
    return res.end('ID CSS inválido');
  }
  const kind = String(req.query?.kind || '').toLowerCase();
  if (kind === 'akira') {
    try {
      const result = await akiraOriginalCss();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-SATV-CSS-Origin', result.source);
      return res.end(result.css);
    } catch (error) {
      console.error('[SATV CSS] error entregando Akira:', error);
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('No se pudo obtener el CSS original de AkiraPlayer');
    }
  }
  if (kind && kind !== 'satv') {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Tipo de CSS no válido');
  }
  let files=[];
  if (Object.prototype.hasOwnProperty.call(CSS_ASSETS,id)) {
    // Es una ID de hoja real: AEmber, GGSans, estilos secundarios, etc.
    files=[CSS_ASSETS[id]];
  } else if (id.startsWith('a71e0a9d-')) {
    // Los UUID del overlay se generan con prefijo reservado.
    files=['css/vr-overlay.css'];
  } else {
    files=CSS_BY_PAGE[pageFor(req)].map(n=>'css/'+n);
  }
  try {
    const body=combine(files);
    res.setHeader('Content-Type','text/css; charset=utf-8');
    res.setHeader('Cache-Control','private, no-store, max-age=0');
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.statusCode=200;
    return res.end(body);
  } catch (error) {
    console.error('[SATV CSS por ID] error',error);
    res.statusCode=500;
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    return res.end('No se pudo leer el CSS original');
  }
};
