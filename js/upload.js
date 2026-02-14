import { renderNav, renderAuthButtons, toast, $, escapeHtml } from "./ui.js";
import { requireAuthOrRedirect } from "./auth.js";
import { createMovie, createEpisode, fetchByCategory } from "./api.js";
import { CONFIG } from "./config.js";

/* =========================================================
   🔥 DROPDOWN GENERIC INIT
   ========================================================= */

function initDropdown(id) {
  const dropdown = document.getElementById(id);
  if (!dropdown) return;

  const selected = dropdown.querySelector(".dropdown-selected");
  const options = dropdown.querySelectorAll(".dropdown-option");

  selected.addEventListener("click", () => {
    dropdown.classList.toggle("open");
  });

  options.forEach(opt => {
    opt.addEventListener("click", () => {
      selected.querySelector(".dropdown-text").textContent =
        opt.textContent;
      selected.dataset.value = opt.dataset.value;
      dropdown.classList.remove("open");
    });
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove("open");
    }
  });
}

function getDropdownValue(id) {
  const dropdown = document.getElementById(id);
  const selected = dropdown.querySelector(".dropdown-selected");
  return selected?.dataset.value || "";
}

function resetDropdown(id, text, value = "") {
  const dropdown = document.getElementById(id);
  if (!dropdown) return;

  const selected = dropdown.querySelector(".dropdown-selected");
  selected.querySelector(".dropdown-text").textContent = text;
  selected.dataset.value = value;
}

/* =========================================================
   🔐 ADMIN CHECK
   ========================================================= */

function isAdmin(email) {
  if (!CONFIG.ADMIN_EMAILS || !CONFIG.ADMIN_EMAILS.length) return true;
  return CONFIG.ADMIN_EMAILS
    .map(x => String(x).toLowerCase())
    .includes(String(email || "").toLowerCase());
}

/* =========================================================
   🎬 LOAD SERIES DROPDOWN
   ========================================================= */

async function loadSeriesDropdown() {
  const series = await fetchByCategory("series", 500);

  const optionsContainer = document.getElementById("ep-series-options");
  const dropdown = document.getElementById("ep-series-dropdown");
  const selected = dropdown.querySelector(".dropdown-selected");

  optionsContainer.innerHTML = "";

  if (!series.length) {
    optionsContainer.innerHTML = `
      <div class="dropdown-option" data-value="">
        No hay series cargadas
      </div>
    `;
    return;
  }

  series.forEach(s => {
    const opt = document.createElement("div");
    opt.className = "dropdown-option";
    opt.dataset.value = s.id;
    opt.textContent = s.title;

    opt.addEventListener("click", () => {
      selected.querySelector(".dropdown-text").textContent = s.title;
      selected.dataset.value = s.id;
      dropdown.classList.remove("open");
    });

    optionsContainer.appendChild(opt);
  });
}

/* =========================================================
   📦 PAYLOADS
   ========================================================= */

function moviePayload() {
  return {
    category: getDropdownValue("m-category-dropdown"),
    title: $("#m-title").value.trim(),
    description: $("#m-desc").value.trim(),
    thumbnail_url: $("#m-thumb").value.trim(),
    banner_url: $("#m-banner").value.trim(),
    m3u8_url: $("#m-m3u8").value.trim(),
    vtt_url: $("#m-vtt").value.trim() || null,
  };
}

function validateMovie(m) {
  if (!m.category || !["movie", "series"].includes(m.category))
    return "Categoría inválida";
  if (!m.title) return "Falta título";
  if (!m.m3u8_url) return "Falta m3u8_url";
  return null;
}

function episodePayload() {
  return {
    series_id: getDropdownValue("ep-series-dropdown"),
    season: Number($("#ep-season").value),
    episode_number: Number($("#ep-number").value),
    title: $("#ep-title").value.trim(),
    m3u8_url: $("#ep-m3u8").value.trim(),
    vtt_url: $("#ep-vtt").value.trim() || null,
  };
}

function validateEpisode(e) {
  if (!e.series_id) return "Elegí una serie";
  if (!Number.isFinite(e.season) || e.season < 1)
    return "Temporada inválida";
  if (!Number.isFinite(e.episode_number) || e.episode_number < 1)
    return "Episodio inválido";
  if (!e.m3u8_url) return "Falta m3u8_url episodio";
  return null;
}

/* =========================================================
   🚀 INIT
   ========================================================= */

async function init() {
  renderNav({ active: "upload" });
  await renderAuthButtons();

  initDropdown("m-category-dropdown");
  initDropdown("ep-series-dropdown");

  const session = await requireAuthOrRedirect();
  if (!session) return;

  const email = session.user.email || "";

  if (!isAdmin(email)) {
    $("#upload-root").innerHTML = `
      <div class="panel">
        <h2>Acceso denegado</h2>
        <p class="muted">Esta sección es solo para admins.</p>
      </div>
    `;
    return;
  }

  try {
    await loadSeriesDropdown();
  } catch (e) {
    console.error(e);
    toast("No se pudieron cargar series.", "error");
  }

  /* ================= MOVIE ================= */

  $("#movie-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();

    const m = moviePayload();
    const err = validateMovie(m);
    if (err) return toast(err, "error");

    try {
      const created = await createMovie(m);
      toast(`Creado: ${m.category} (${created.id})`, "success");

      ev.target.reset();
      resetDropdown("m-category-dropdown", "movie", "movie");
      await loadSeriesDropdown();
    } catch (e) {
      console.error(e);
      toast(e.message || "Error creando título", "error");
    }
  });

  /* ================= EPISODE ================= */

  $("#episode-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();

    const ep = episodePayload();
    const err = validateEpisode(ep);
    if (err) return toast(err, "error");

    try {
      const created = await createEpisode(ep);
      toast(`Episodio creado (${created.id})`, "success");

      ev.target.reset();
      resetDropdown("ep-series-dropdown", "Seleccioná una serie…", "");
    } catch (e) {
      console.error(e);
      toast(e.message || "Error creando episodio", "error");
    }
  });
}

document.addEventListener("DOMContentLoaded", init);