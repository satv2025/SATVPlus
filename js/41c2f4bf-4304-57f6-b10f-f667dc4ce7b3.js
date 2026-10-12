/**
 * SATV+ · Agenda CONMEBOL 2026 (independiente de Supabase).
 * Confirmaciones consultadas el 9 de octubre de 2026.
 * HORAS: Argentina (UTC-3). Las fechas no confirmadas siguen como "Sin definir".
 * Los cuatro PNG se encuentran en el repositorio local del propietario bajo images/nav/.
 * El ZIP original no los contenía, por lo que se usa un SVG de respaldo si faltan.
 * Fuentes: https://gol.conmebol.com/libertadores/es/news/fechas-confirmadas-asi-se-disputaran-las-semifinales-de-la-conmebol-libertadores
 *          https://gol.conmebol.com/sudamericana/es/news/en-busca-de-la-gran-conquista-todo-definido-para-las-semifinales-de-la-conmebol-sudamericana
 *          https://www.afa.com.ar/es/posts/cuerpos-arbitrales-para-las-semifinales-de-libertadores-y-sudamericana
 */
const CLUBS = {
  estudiantes: { name: 'Estudiantes de La Plata', short: 'Estudiantes', shield: '/images/nav/estudianteslp.png', fallback: '/images/teams/estudiantes.svg' },
  flamengo:    { name: 'Flamengo', short: 'Flamengo', shield: '/images/nav/flamengo.png', fallback: '/images/teams/flamengo.svg' },
  boca:        { name: 'Boca Juniors', short: 'Boca Juniors', shield: '/images/nav/bocajuniors.png', fallback: '/images/teams/boca.svg' },
  vasco:       { name: 'Vasco da Gama', short: 'Vasco da Gama', shield: '/images/nav/vascodagama.png', fallback: '/images/teams/vasco.svg' },
  tbd:         { name: 'Por definir', short: 'Por definir', shield: '/images/teams/por-definir.svg' },
};

const CUP_FIXTURES = {
  libertadores: {
    competition: 'CONMEBOL Libertadores 2026',
    games: [
      { id: 'lib-semi-ida', phase: 'Semifinal · Ida', a: 'estudiantes', b: 'flamengo', date: '15 de octubre de 2026', hour: '21:30', stadium: 'Estadio UNO Jorge Luis Hirschi · La Plata, Argentina', referee: 'Juan Gabriel Benítez (Paraguay)' },
      { id: 'lib-semi-vuelta', phase: 'Semifinal · Vuelta', a: 'flamengo', b: 'estudiantes', date: '22 de octubre de 2026', hour: '21:30', stadium: 'Estadio Maracaná · Río de Janeiro, Brasil', referee: 'Sin definir' },
      { id: 'lib-final', phase: 'Final', a: 'tbd', b: 'tbd', date: '28 de noviembre de 2026', hour: 'Sin definir', stadium: 'Estadio Centenario · Montevideo, Uruguay', referee: 'Sin definir' },
    ],
  },
  sudamericana: {
    competition: 'CONMEBOL Sudamericana 2026',
    games: [
      { id: 'sud-semi-ida', phase: 'Semifinal · Ida', a: 'boca', b: 'vasco', date: '13 de octubre de 2026', hour: '21:30', stadium: 'Estadio Alberto J. Armando (La Bombonera) · Buenos Aires, Argentina', referee: 'Piero Maza (Chile)' },
      { id: 'sud-semi-vuelta', phase: 'Semifinal · Vuelta', a: 'vasco', b: 'boca', date: '20 de octubre de 2026', hour: '21:30', stadium: 'Sin definir (Río de Janeiro, Brasil)', referee: 'Sin definir' },
      { id: 'sud-final', phase: 'Final', a: 'tbd', b: 'tbd', date: '21 de noviembre de 2026', hour: 'Sin definir', stadium: 'Estadio Metropolitano Roberto Meléndez · Barranquilla, Colombia', referee: 'Sin definir' },
    ],
  },
};

const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function teamHtml(key) {
  const team = CLUBS[key] || CLUBS.tbd;
  return `<div class="cup-fixture-team" title="${safe(team.name)}">
    <div class="cup-fixture-shield"><img src="${safe(team.shield)}"${team.fallback ? ` data-cup-fallback="${safe(team.fallback)}"` : ''} alt="Escudo de ${safe(team.name)}" loading="lazy" width="58" height="58"></div>
    <strong>${safe(team.short)}</strong>
  </div>`;
}

function detailHtml(icon, label, value) {
  return `<div class="cup-fixture-detail">
    <i class="fa-solid ${icon}" aria-hidden="true"></i>
    <div><span>${safe(label)}</span><strong>${safe(value || 'Sin definir')}</strong></div>
  </div>`;
}

function gameHtml(game, competition) {
  return `<article class="cup-fixture-card" aria-label="${safe(competition)}: ${safe(game.phase)}, ${safe(CLUBS[game.a].name)} y ${safe(CLUBS[game.b].name)}">
    <div class="cup-fixture-top">
      <span class="cup-fixture-phase">${safe(game.phase)}</span>
      <span class="cup-fixture-year">2026</span>
    </div>
    <div class="cup-fixture-match">
      ${teamHtml(game.a)}
      <span class="cup-fixture-versus" aria-label="versus">VS</span>
      ${teamHtml(game.b)}
    </div>
    <div class="cup-fixture-details">
      ${detailHtml('fa-calendar-days', 'Fecha', game.date)}
      ${detailHtml('fa-clock', 'Hora (Argentina)', game.hour)}
      ${detailHtml('fa-location-dot', 'Estadio / Sede', game.stadium)}
      ${detailHtml('fa-user-tie', 'Árbitro', game.referee)}
    </div>
  </article>`;
}

export function isCupFixtureSection(section) {
  return Object.prototype.hasOwnProperty.call(CUP_FIXTURES, section);
}

export function renderCupFixtures(section) {
  if (!isCupFixtureSection(section)) return '';
  const cup = CUP_FIXTURES[section];
  return `<div class="cup-fixtures cup-fixtures-${safe(section)}" aria-label="Agenda de ${safe(cup.competition)}">
    <div class="cup-fixtures-heading">
      <div><p class="cup-fixtures-kicker">CALENDARIO 2026</p><h2>Partidos</h2></div>
      <span class="cup-fixtures-count">${cup.games.length} encuentros</span>
    </div>
    <div class="cup-fixture-list">${cup.games.map(game => gameHtml(game, cup.competition)).join('')}</div>
    <p class="cup-fixtures-footnote">Los datos marcados «Sin definir» todavía no fueron confirmados. Información sujeta a cambios de CONMEBOL.</p>
  </div>`;
}

/** Si los PNG locales todavía no están copiados, el usuario ve un escudo de respaldo. */
export function installCupShieldFallback(container) {
  container?.addEventListener('error', event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    const fallback = img.dataset.cupFallback;
    if (fallback && img.getAttribute('src') !== fallback) {
      delete img.dataset.cupFallback;
      img.src = fallback;
    }
  }, true);
}
