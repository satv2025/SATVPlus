/* Vercel Function: sirve los CSS originales a traves de /css/<ID>.css
 * y /css/<ID>?episode=<EPISODIO>.css.
 * El Referer determina el HTML que pidio los estilos; el ID no altera el CSS.
 * NOTA: requiere Referer same-origin (politica predeterminada del navegador).
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const CSS_BY_PAGE = Object.freeze({
  index: ['styles.css', 'initial.html.css'],
  title: ['styles.css', 'title.css'],
  mylist: ['styles.css', 'mylist.css'],
  watch: ['watch.css'],
  login: ['styles.css', 'auth.css'],
  register: ['styles.css'],
  profiles: ['styles.css', 'profiles.css'],
  profile: ['styles.css', 'account.css'],
  recovery: ['styles.css'],
  'recovery-pass': ['styles.css'],
  'emailchange': ['styles.css'],
  'emailchange-approve': ['styles.css'],
  about: ['about.css'],
  oldabout: ['oldabout.css'],
  privacy: ['privacy.css'],
  support: ['support.css'],
  vr: ['styles.css', 'vr.css']
});

const importsRx = /@import\s+(?:url\([^;]+?\)|["'][^"']+["'])(?:\s+[^;]*)?\s*;/gi;
function combine(names) {
  const imports = [];
  const parts = [];
  const seen = new Set();
  for (const name of names) {
    const file = path.join(process.cwd(), 'css', name);
    let css = fs.readFileSync(file, 'utf8');
    css = css.replace(importsRx, statement => {
      const key = statement.trim();
      if (!seen.has(key)) { imports.push(key); seen.add(key); }
      return '';
    });
    parts.push('/* ' + name + ' */\n' + css);
  }
  return imports.join('\n') + '\n' + parts.join('\n\n');
}
function resolvePage(req) {
  const referrer = req.headers.referer || req.headers.referrer || '';
  try {
    const url = new URL(referrer);
    // La llamada CSS es same-origin; otras procedencias no pueden decidir el bundle.
    const host = String(req.headers.host || '').toLowerCase();
    if (url.host.toLowerCase() !== host) return 'index';
    const pathname = url.pathname.replace(/\/$/, '') || '/';
    const key = pathname === '/' ? 'index' : pathname.split('/').pop().replace(/\.html$/i, '');
    return Object.hasOwn(CSS_BY_PAGE, key) ? key : 'index';
  } catch (_) { return 'index'; }
}
module.exports = (req, res) => {
  const slug = String(req.query?.id || req.query?.slug || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('CSS ID invalido');
  }
  const page = resolvePage(req);
  try {
    const body = combine(CSS_BY_PAGE[page]);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    // La misma ID puede usarse en /title y /watch: no almacenar por URL.
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.end(body);
  } catch (err) {
    console.error('[SATV CSS ID] Error leyendo CSS:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Error cargando CSS');
  }
};
