import { CONFIG } from "./config.js";
import { getSession, signOut } from "./auth.js";
import { fetchMovie } from "./api.js"; // Asegúrate de importar fetchMovie

export function $(sel) { return document.querySelector(sel); }
export function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

export function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   APP NAME + TITLE
========================= */

export function setAppName() {
  const els = $all("[data-appname]");
  for (const el of els) el.textContent = CONFIG.APP_NAME;

  const currentTitle = document.title.trim();

  // Solo cambiar si está vacío
  // o si el título es exactamente el nombre de la app
  if (!currentTitle || currentTitle === CONFIG.APP_NAME) {
    document.title = CONFIG.APP_NAME;
  }
}

/* =========================
   TOAST
========================= */

export function toast(msg, type = "info") {
  const host = document.getElementById("toast-host");
  if (!host) {
    alert(msg);
    return;
  }

  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  host.appendChild(t);

  requestAnimationFrame(() => t.classList.add("show"));

  setTimeout(() => {
    t.classList.remove("show");
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
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  return `${m}:${String(r).padStart(2, "0")}`;
}

/* =========================
   NAVBAR
========================= */

export function renderNav({ active = "home" } = {}) {
  const nav = document.getElementById("topnav");
  if (!nav) return;

  nav.innerHTML = `
    <div class="nav-left">
      <a class="brand" href="/index.html">
        <!-- Reemplazar data-appname por la imagen -->
        <img src="/images/satvpluslogo1.png" alt="Logo" class="brand-logo"/>
      </a>
      <a class="navlink ${active === "home" ? "active" : ""}" href="/index.html">Inicio</a>
    </div>
    <div class="nav-right" id="nav-right"></div>
  `;
}

export async function renderAuthButtons() {
  const host = document.getElementById("nav-right");
  if (!host) return;

  const session = await getSession();

  if (!session) {
    host.innerHTML = `
      <a class="btn ghost" href="/login.html">Entrar</a>
      <a class="btn" href="/register.html">Crear cuenta</a>
    `;
    return;
  }

  // Mostrar el nombre de usuario si está disponible
  const name = escapeHtml(session.user.name || "Usuario");

  host.innerHTML = `
    <a class="pill profile-link" href="/profile.html">${name}</a>
    <button class="btn ghost" id="btn-logout" type="button">Salir</button>
  `;

  const btnLogout = document.getElementById("btn-logout");

  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      await signOut();
      window.location.href = "/login.html";
    });
  }
}

/* =========================
   MOVIE CARD
========================= */

export function cardHtml(
  movie,
  hrefOverride = null,
  subtitle = null,
  progressPercent = null
) {
  const thumb = movie.thumbnail_url || "";
  const title = escapeHtml(movie.title || "Sin título");

  const href = hrefOverride
    ? hrefOverride
    : `/watch.html?movie=${encodeURIComponent(movie.id)}`;

  const sub = subtitle
    ? `<div class="card-subtitle">${escapeHtml(subtitle)}</div>`
    : "";

  const pb = typeof progressPercent === "number"
    ? `<div class="progressbar">
         <div class="progressfill" style="width:${Math.min(
      100,
      Math.max(0, progressPercent)
    )}%"></div>
       </div>`
    : "";

  return `
    <a class="card" href="${href}">
      <div class="thumb" style="background-image:url('${thumb}')">
        ${pb}
      </div>
      <div class="card-title">${title}</div>
      ${sub}
    </a>
  `;
}

/* =========================
   SET MOVIE TITLE (for watch.html)
========================= */

export async function setMovieTitleFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const movieId = urlParams.get('movie');  // Obtener el ID de la película desde la URL
  const episodeId = urlParams.get('episode');  // Obtener el ID del episodio, si está presente

  // Si no se encuentra el ID de la película en la URL, asignamos un título predeterminado
  if (!movieId) {
    document.title = "Película no encontrada · SATV+";
    return;
  }

  try {
    // Consulta la película usando su ID
    const movie = await fetchMovie(movieId);

    // Si la película es encontrada, configuramos el título de la página
    if (movie) {
      let title = movie.title;  // Usamos el título de la película para el título de la página

      // Si hay un episodio, agregamos el título del episodio al título de la película
      if (episodeId) {
        const episode = await fetchEpisode(episodeId); // Aquí llamamos a la función para obtener detalles del episodio
        if (episode) {
          title += ` - Episodio ${episode.episode_number}: ${episode.title || 'Sin título'}`;
        }
      }

      // Finalmente, establecemos el título de la página
      document.title = `${title} · SATV+`;
    } else {
      // Si la película no se encuentra, asignamos un nombre por defecto
      const randomTitles = ["Nivel X", "Reite666", "Película Desconocida", "Film Genérico"];
      const randomTitle = randomTitles[Math.floor(Math.random() * randomTitles.length)];
      document.title = `${randomTitle} · SATV+`;
    }
  } catch (error) {
    console.error("Error al obtener la película:", error);
    // Si ocurre un error, asignamos un nombre por defecto
    const randomTitles = ["Nivel X", "Reite666", "Película Desconocida", "Film Genérico"];
    const randomTitle = randomTitles[Math.floor(Math.random() * randomTitles.length)];
    document.title = `${randomTitle} · SATV+`;
  }
}