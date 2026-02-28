// /js/mylist.js
// ✅ Usa supabaseClient.js (sin modificarlo)
// ✅ my_list(profile_id, content_id, added_at)
// ✅ content_id apunta a movies.id
// ✅ Lee detalles desde public.movies
// ✅ Sync localStorage -> Supabase (puente con botón "Mi Lista")
// ✅ Topnav: agrega "Mi Lista" a la derecha de "Inicio"
// ✅ En /mylist: "Mi Lista" queda active e inclicable

import { supabase } from "./supabaseClient.js";
import * as ui from "./ui.js";

const LOCAL_MY_LIST_KEY = "satv_my_list_ids";

function el(id) {
    return document.getElementById(id);
}

function uniq(arr) {
    return [...new Set((arr || []).filter(Boolean))];
}

function plural(n, one, many) {
    return Number(n) === 1 ? one : many;
}

function esc(value) {
    if (typeof ui.escapeHtml === "function") return ui.escapeHtml(String(value ?? ""));
    const d = document.createElement("div");
    d.textContent = String(value ?? "");
    return d.innerHTML;
}

function setState(message = "", show = true) {
    const node = el("mylist-state");
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("hidden", !show);
}

function setSubtitle(message = "") {
    const node = el("mylist-subtitle");
    if (!node) return;
    node.textContent = message;
}

function formatDuration(minutes) {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0) return "";
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem ? `${h} h ${rem} min` : `${h} h`;
}

function getMetaLine(item) {
    const year = item?.release_year ? String(item.release_year) : "";
    let right = "";

    if (item?.category === "movie") {
        right = formatDuration(item.duration_minutes);
    } else if (item?.category === "series") {
        const mm = item?.movie_meta || null;
        const sc = Number(mm?.seasons_count || 0);
        const ec = Number(mm?.episodes_count || 0);

        if (sc > 0) right = `${sc} ${plural(sc, "temporada", "temporadas")}`;
        else if (ec > 0) right = `${ec} ${plural(ec, "episodio", "episodios")}`;
        else right = "Serie";
    } else {
        right = formatDuration(item?.duration_minutes);
    }

    return [year, right].filter(Boolean).join(" · ");
}

function normalizeMovieRow(row) {
    return {
        id: row.id,
        title: row.title || "Sin título",
        description: row.description || row.sinopsis || "",
        thumbnail_url: row.thumbnail_url || "",
        banner_url: row.banner_url || "",
        release_year: row.release_year ?? null,
        category: row.category || null,
        duration_minutes: row.duration_minutes ?? null,
        movie_meta: row.movie_meta || null
    };
}

function renderFallbackCard(item) {
    const href = `/title?title=${encodeURIComponent(item.id)}`;
    const thumb = item.thumbnail_url || item.banner_url || "";
    const meta = getMetaLine(item);

    return `
    <article class="card mylist-card" tabindex="0" role="link" data-href="${esc(href)}">
      <div class="thumb" style="background-image:url('${esc(thumb)}')"></div>
      <div class="card-body">
        <h3 class="card-title">${esc(item.title)}</h3>
        ${meta ? `<p class="card-subtitle">${esc(meta)}</p>` : ""}
      </div>
    </article>
  `;
}

function renderCard(item) {
    const href = `/title?title=${encodeURIComponent(item.id)}`;

    if (typeof ui.cardHtml === "function") {
        try {
            return ui.cardHtml(item, href);
        } catch (e) {
            console.warn("[mylist] ui.cardHtml falló, uso fallback:", e);
        }
    }

    return renderFallbackCard(item);
}

function bindCardNavigation(root) {
    if (!root) return;

    root.querySelectorAll("[data-href]").forEach(card => {
        const go = () => {
            const href = card.dataset.href;
            if (href) window.location.href = href;
        };

        card.addEventListener("click", go);
        card.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                go();
            }
        });
    });
}

function setHeroBackground(items) {
    const hero = el("hero-image");
    if (!hero) return;

    const first = (items || []).find(x => x.banner_url || x.thumbnail_url);
    const img = first?.banner_url || first?.thumbnail_url || "";
    if (!img) return;

    hero.style.backgroundImage = `url("${img}")`;
    hero.style.backgroundSize = "cover";
    hero.style.backgroundPosition = "center";
    hero.style.backgroundRepeat = "no-repeat";
}

async function getCurrentUserId() {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
        console.error("[mylist] auth.getUser error:", error);
        return null;
    }
    return data?.user?.id || null;
}

/* =========================================================
   TOPNAV "Mi Lista"
   - /mylist?list=<userId>&user=<userId>
   - En esta página va active + inclicable
========================================================= */

function buildMyListUrl(userId) {
    if (!userId) return "/mylist";

    const q = new URLSearchParams({
        list: String(userId),
        user: String(userId)
    });

    return `/mylist?${q.toString()}`;
}

function ensureMyListNavLink(userId, { active = false, disabled = false } = {}) {
    const topnav = document.getElementById("topnav");
    if (!topnav) return;

    const navLeft = topnav.querySelector(".nav-left");
    if (!navLeft) return;

    let link = topnav.querySelector("[data-mylist-nav='1']");
    if (!link) {
        link = document.createElement("a");
        link.className = "navlink";
        link.dataset.mylistNav = "1";
        link.textContent = "Mi Lista";
    }

    link.href = buildMyListUrl(userId);

    // estado activo visual
    link.classList.toggle("active", !!active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");

    // inclicable en la propia página
    if (disabled) {
        link.setAttribute("tabindex", "-1");
        link.setAttribute("aria-disabled", "true");
        link.style.pointerEvents = "none";
        link.style.cursor = "default";
    } else {
        link.removeAttribute("tabindex");
        link.removeAttribute("aria-disabled");
        link.style.pointerEvents = "";
        link.style.cursor = "";
    }

    // Insertar a la derecha de "Inicio"
    const inicioLink = [...navLeft.querySelectorAll("a.navlink")].find((a) => {
        if (a === link) return false;
        return (a.textContent || "").trim().toLowerCase() === "inicio";
    });

    if (inicioLink && inicioLink.parentElement === navLeft) {
        // mover/insertar justo después de Inicio
        navLeft.insertBefore(link, inicioLink.nextSibling);
    } else if (link.parentElement !== navLeft) {
        navLeft.appendChild(link);
    }
}

/* =========================================================
   localStorage -> Supabase (my_list real)
========================================================= */
function getLocalMyListIds() {
    try {
        const raw = localStorage.getItem(LOCAL_MY_LIST_KEY);
        const arr = JSON.parse(raw || "[]");
        return Array.isArray(arr) ? uniq(arr.map(String)) : [];
    } catch {
        return [];
    }
}

async function syncLocalMyListToSupabase(profileId) {
    const ids = getLocalMyListIds();
    if (!profileId || !ids.length) return { synced: 0, skipped: true };

    const payload = ids.map(contentId => ({
        profile_id: profileId,
        content_id: contentId,
        added_at: new Date().toISOString()
    }));

    const { error } = await supabase
        .from("my_list")
        .upsert(payload, {
            onConflict: "profile_id,content_id",
            ignoreDuplicates: false
        });

    if (error) {
        console.warn("[mylist] sync local->supabase error:", error);
        return { synced: 0, skipped: false, error };
    }

    return { synced: payload.length, skipped: false };
}

/* =========================================================
   my_list (TU schema)
========================================================= */
async function fetchMyListRows(profileId) {
    const { data, error } = await supabase
        .from("my_list")
        .select("id, profile_id, content_id, added_at")
        .eq("profile_id", profileId)
        .order("added_at", { ascending: false });

    if (error) throw error;
    return data || [];
}

function extractContentIds(rows) {
    return uniq((rows || []).map(r => r.content_id).filter(Boolean));
}

/* =========================================================
   movies (IMPORTANTE: ya NO content)
========================================================= */
async function fetchMoviesByIds(ids) {
    if (!ids.length) return [];

    // Intento amplio con movie_meta
    let res = await supabase
        .from("movies")
        .select(`
      id,
      title,
      description,
      thumbnail_url,
      banner_url,
      release_year,
      category,
      duration_minutes,
      movie_meta (
        seasons_count,
        episodes_count
      )
    `)
        .in("id", ids);

    // Fallback sin relación movie_meta
    if (res.error) {
        console.warn("[mylist] select amplio en movies falló, reintento simple:", res.error.message);

        res = await supabase
            .from("movies")
            .select(`
        id,
        title,
        description,
        thumbnail_url,
        banner_url,
        release_year,
        category,
        duration_minutes
      `)
            .in("id", ids);
    }

    if (res.error) throw res.error;
    return (res.data || []).map(normalizeMovieRow);
}

function sortBySavedOrder(items, savedIds) {
    const pos = new Map(savedIds.map((id, i) => [String(id), i]));
    return [...items].sort((a, b) => (pos.get(String(a.id)) ?? 999999) - (pos.get(String(b.id)) ?? 999999));
}

async function showMyList(profileId) {
    const row = el("mylist-row");
    if (!row) return;

    row.innerHTML = "";
    setState("Cargando tu lista…", true);

    // puente opcional (por compatibilidad con títulos ya guardados localmente)
    await syncLocalMyListToSupabase(profileId);

    const listRows = await fetchMyListRows(profileId);

    if (!listRows.length) {
        setSubtitle("Todavía no agregaste títulos.");
        setState("Tu lista está vacía.", true);
        return;
    }

    const contentIds = extractContentIds(listRows);

    if (!contentIds.length) {
        setSubtitle(`${listRows.length} filas encontradas, pero sin content_id.`);
        setState("Revisá los datos guardados en my_list.", true);
        return;
    }

    let items = await fetchMoviesByIds(contentIds);

    if (!items.length) {
        setSubtitle(`${contentIds.length} IDs guardados, pero no se encontraron en movies.`);
        setState("Revisá que my_list.content_id exista en public.movies(id).", true);
        return;
    }

    items = sortBySavedOrder(items, contentIds);

    setSubtitle(`${items.length} ${plural(items.length, "título guardado", "títulos guardados")}`);
    setState("", false);
    setHeroBackground(items);

    row.innerHTML = items.map(renderCard).join("");
    bindCardNavigation(row);
}

async function init() {
    try {
        ui.setAppName?.();
        ui.renderNav?.({ active: "mylist" }); // ui.js no soporta mylist nativo
        await ui.renderAuthButtons?.();
        ui.enableDataHrefNavigation?.();

        const profileId = await getCurrentUserId();

        // ✅ Topnav: "Mi Lista" a la derecha de "Inicio", active e inclicable
        ensureMyListNavLink(profileId, { active: true, disabled: true });

        if (!profileId) {
            setSubtitle("Iniciá sesión para ver tu lista.");
            setState("No hay sesión activa.", true);
            return;
        }

        await showMyList(profileId);
    } catch (e) {
        console.error("[mylist] init error:", e);
        setSubtitle("No se pudo cargar tu lista.");
        setState("Error al iniciar la página. Revisá consola.", true);
    }
}

document.addEventListener("DOMContentLoaded", init);