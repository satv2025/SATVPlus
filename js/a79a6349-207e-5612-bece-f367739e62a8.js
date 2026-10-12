/* SATV+ — URL de CSS por ID. Sin CSS inline ni renombrar archivos.
 * Se ejecuta sincronizadamente en <head>, antes de los scripts de cada pagina.
 * Mantiene un solo enlace a los CSS locales para evitar colisiones de URLs.
 */
(function () {
  'use strict';
  var path = window.location.pathname.replace(/\/$/, '') || '/';
  var page = path === '/' ? 'index' : path.split('/').pop().replace(/\.html$/i, '');
  var params = new URLSearchParams(window.location.search);
  var uuid = function () {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var s = Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);
  };
  var safeId = function (value) {
    // Se permiten IDs de Supabase UUID; si no existe uno valido, usar UUID aleatorio.
    var s = String(value || '').trim();
    return /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(s) ? s : '';
  };
  var id = '';
  var episode = '';
  if (page === 'title') {
    id = safeId(params.get('title') || params.get('movie'));
  } else if (page === 'mylist') {
    id = safeId(params.get('list') || params.get('user'));
  } else if (page === 'watch') {
    episode = safeId(params.get('episode'));
    id = safeId(params.get('series') || params.get('movie'));
    // La ruta ?episode= sola no entrega el ID de la serie antes del fetch.
    // Se corrige desde watch.js en cuanto se resuelve la serie real.
  }
  if (!id) id = uuid();

  function urlFor(titleId, episodeId) {
    var base = '/css/' + encodeURIComponent(titleId);
    return episodeId ? base + '?episode=' + encodeURIComponent(episodeId) + '.css' : base + '.css';
  }
  function linkFor(href, elementId) {
    var link = document.getElementById(elementId);
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.id = elementId;
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== href) link.href = href;
    return link;
  }
  function update(titleId, episodeId) {
    var nextId = safeId(titleId) || id;
    var nextEpisode = safeId(episodeId);
    id = nextId;
    episode = nextEpisode;
    var href = urlFor(id, episode);
    linkFor(href, 'satv-css-id');
    if (page === 'watch') {
      linkFor('https://akira.satvplus.com.ar' + href, 'akira-css-id');
    }
    return href;
  }
  window.SATVCssIds = { getUrl: function () { return urlFor(id, episode); }, update: update };
  update(id, episode);
})();
