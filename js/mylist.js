// /js/mylist.js
// ✅ Todo Supabase
// ✅ Soporta my_list con profile_id o user_id
// ✅ Soporta ids guardados como movie_id / content_id / title_id
// ✅ Soporta tabla destino movies o content
// ✅ Usa ui.js si está disponible (renderNav/cardHtml/escapeHtml)

import { supabase } from "./supabaseClient.js";
import * as ui from "./ui.js";
import * as api from "./api.js"; // opcional: fallback a fetchMovie si hiciera falta

function el(id) {
    return document.getElementById(id);
}

function uniq(arr) {
    return [...new Set((arr || []).filter(Boolean))];
}

function esc(s) {
    if (typeof ui.escapeHtml === "function") return ui.escapeHtml(String(s ?? ""));
    const div = document.createElement("div");
    div.textContent = String(s ?? "");
    return div.innerHTML;
}

function plural(n, one, many) {
    return Number(n) === 1 ? one : many;
}

function formatDuration(minutes) {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0) return "";
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem ? `${h} h ${rem} min` : `${h} h`;
}

function formatSeriesMeta(item) {
    const mm = item.movie_meta || item.meta || null;
    const sc = Number(mm?.seasons_count ?? item.seasons_count);
    const ec = Number(mm?.episodes_count ?? item.episodes_count);

    if (Number.isFinite(sc) && sc > 0) return `${sc} ${plural(sc, "temporada", "temporadas")}`;
    if (Number.isFinite(ec) && ec > 0) return `${ec} ${plural(ec, "episodio", "episodios")}`;
    return item.category === "series" ? "Serie" : "";
}

function getMetaLine(item) {
    const year = item.release_year ? String(item.release_year) : "";
    let right = "";

    if (item.category === "movie") right = formatDuration(item.duration_minutes);
    else if (item.category === "series") right = formatSeriesMeta(item);
    else right = formatDuration(item.duration_minutes);

    return [year, right].filter(Boolean).join(" · ");
}

function normalizeContentRow(row) {
    // Unifica forma para render (movies/content)
    return {
        id: row.id,
        title: row.title || row.name || "Sin título",
        description: row.description || row.sinopsis || "",
        thumbnail_url: row.thumbnail_url || row.thumb || row.poster_url || "",
        banner_url: row.banner_url || row.cover_url || "",
        release_year: row.release_year ?? row.year ?? null,
        category: row.category || row.type || null,
        duration_minutes: row.duration_minutes ?? row.duration ?? null,
        movie_meta: row.movie_meta || null,
        _raw: row
    };
}

function renderFallbackCardHtml(item) {
    const href = `/title?title=${encodeURIComponent(item.id)}`;
    const thumb = item.thumbnail_url || item.banner_url || "";
    const meta = getMetaLine(item);

    return `
    <article class="episode-card" tabindex="0" role="link" data-href="${esc(href)}" data-title-id="${esc(item.id)}">
        <img class="episode-thumb" src="${esc(thumb)}" alt="${esc(item.title)}" loading="lazy">
        <div class="episode-body">
            <h4 class="episode-title">${esc(item.title)}</h4>
            ${meta ? `<p class="episode-sub">${esc(meta)}</p>` : ""}
        </div>
    </article>
    `;
}

function renderCard(item) {
    const href = `/title?title=${encodeURIComponent(item.id)}`;

    // Si existe helper del proyecto, lo usamos
    if (typeof ui.cardHtml === "function") {
        try {
            return ui.cardHtml(item, href);
        } catch (e) {
            console.warn("[mylist] ui.cardHtml falló, uso fallback:", e);
        }
    }

    // fallback compatible con estilos tipo title.css/cards
    return renderFallbackCardHtml(item);
}

function bindCardNavigation(root) {
    if (!root) return;

    root.querySelectorAll("[data-href]").forEach((card) => {
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

function setState(msg = "", show = true) {
    const node = el("mylist-state");
    if (!node) return;
    node.textContent = msg;
    node.style.display = show ? "block" : "none";
}

function setSubtitle(text = "") {
    const node = el("mylist-subtitle");
    if (!node) return;
    node.textContent = text;
}

function setHeroBackground(items = []) {
    const hero = el("hero-image");
    if (!hero) return;

    const firstWithBanner = items.find(x => x.banner_url || x.thumbnail_url);
    const img = firstWithBanner?.banner_url || firstWithBanner?.thumbnail_url || "";

    if (!img) return;

    // Si tu mylist.css no define title-hero, esto al menos lo deja visible
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

/* ===========================
   Carga de my_list (con fallbacks de columnas)
=========================== */

async function fetchMyListRowsForUser(userId) {
    if (!userId) return [];

    // Intento 1: profile_id (como tu código original)
    let res = await supabase
        .from("my_list")
        .select("*")
        .eq("profile_id", userId)
        .order("created_at", { ascending: false });

    // Si falla por columna inexistente / schema distinto, intento con user_id
    if (res.error) {
        const msg = String(res.error.message || "").toLowerCase();
        const maybeProfileColumnMissing =
            msg.includes("column") ||
            msg.includes("profile_id") ||
            msg.includes("schema cache") ||
            msg.includes("does not exist");

        if (maybeProfileColumnMissing) {
            res = await supabase
                .from("my_list")
                .select("*")
                .eq("user_id", userId)
                .order("created_at", { ascending: false });
        }
    }

    if (res.error) {
        console.error("[mylist] error al leer my_list:", res.error);
        throw res.error;
    }

    return res.data || [];
}

function extractSavedIds(rows) {
    // Soporta varios nombres de columna
    const ids = rows.map(r =>
        r.movie_id ??
        r.content_id ??
        r.title_id ??
        r.item_id ??
        r.id_content ??
        null
    );
    return uniq(ids);
}

/* ===========================
   Carga de detalles (movies/content) + fallback api.fetchMovie
=========================== */

async function fetchFromMoviesTable(ids) {
    if (!ids.length) return [];

    // Intentamos incluir movie_meta si existe relación
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

    // fallback si movie_meta relation no existe o falla el select expandido
    if (res.error) {
        const msg = String(res.error.message || "").toLowerCase();
        const relationOrSelectIssue =
            msg.includes("movie_meta") ||
            msg.includes("relationship") ||
            msg.includes("foreign key") ||
            msg.includes("schema cache") ||
            msg.includes("cannot find") ||
            msg.includes("select");

        if (relationOrSelectIssue) {
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
    }

    if (res.error) throw res.error;
    return (res.data || []).map(normalizeContentRow);
}

async function fetchFromContentTable(ids) {
    if (!ids.length) return [];

    const res = await supabase
        .from("content")
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

    if (res.error) throw res.error;
    return (res.data || []).map(normalizeContentRow);
}

async function fetchItemsDetails(ids) {
    if (!ids.length) return [];

    // 1) intento "movies" (por tu app actual)
    try {
        const rows = await fetchFromMoviesTable(ids);
        if (rows.length) return rows;
    } catch (e) {
        console.warn("[mylist] falló lectura en movies:", e);
    }

    // 2) intento "content" (por tu código original)
    try {
        const rows = await fetchFromContentTable(ids);
        if (rows.length) return rows;
    } catch (e) {
        console.warn("[mylist] falló lectura en content:", e);
    }

    // 3) fallback último: api.fetchMovie(id) si existe en tu proyecto
    if (typeof api.fetchMovie === "function") {
        const results = [];
        for (const id of ids) {
            try {
                const item = await api.fetchMovie(id);
                if (item) results.push(normalizeContentRow(item));
            } catch (e) {
                console.warn("[mylist] fetchMovie fallback falló para", id, e);
            }
        }
        return results;
    }

    return [];
}

/* ===========================
   Render principal
=========================== */

function sortBySavedOrder(items, savedIds) {
    const pos = new Map(savedIds.map((id, i) => [String(id), i]));
    return [...items].sort((a, b) => {
        const pa = pos.get(String(a.id));
        const pb = pos.get(String(b.id));
        return (pa ?? 999999) - (pb ?? 999999);
    });
}

async function showMyList(userId) {
    const row = el("mylist-row");
    if (!row) return;

    row.innerHTML = "";
    setState("Cargando tu lista…", true);

    let myListRows = [];
    try {
        myListRows = await fetchMyListRowsForUser(userId);
    } catch (e) {
        setState("No se pudo cargar tu lista.", true);
        return;
    }

    if (!myListRows.length) {
        setSubtitle("Todavía no agregaste títulos.");
        setState("Tu lista está vacía.", true);
        row.innerHTML = "";
        return;
    }

    const savedIds = extractSavedIds(myListRows);

    if (!savedIds.length) {
        console.warn("[mylist] Se leyeron filas de my_list pero no se encontró movie_id/content_id/title_id:", myListRows);
        setSubtitle(`${myListRows.length} elemento(s) detectado(s) en la tabla, pero con columnas no reconocidas.`);
        setState("Revisá el nombre de la columna FK en my_list (movie_id / content_id / title_id).", true);
        return;
    }

    let items = [];
    try {
        items = await fetchItemsDetails(savedIds);
    } catch (e) {
        console.error("[mylist] Error cargando detalles de contenidos:", e);
        setState("No se pudieron cargar los detalles del contenido guardado.", true);
        return;
    }

    if (!items.length) {
        setSubtitle(`${savedIds.length} IDs guardados, pero no se encontraron registros asociados.`);
        setState("Revisá si la FK apunta a la tabla correcta (movies/content).", true);
        return;
    }

    items = sortBySavedOrder(items, savedIds);

    setSubtitle(`${items.length} ${plural(items.length, "título guardado", "títulos guardados")}`);
    setState("", false);
    setHeroBackground(items);

    row.innerHTML = items.map(renderCard).join("");

    // Si ui.cardHtml no agrega navegación por sí sola, esto cubre el fallback
    bindCardNavigation(row);
}

/* ===========================
   Init
=========================== */

async function init() {
    try {
        // Nav del sitio (si existe)
        ui.setAppName?.();
        ui.renderNav?.({ active: "mylist" });
        ui.renderAuthButtons?.();
        ui.enableDataHrefNavigation?.();

        const userId = await getCurrentUserId();

        if (!userId) {
            setSubtitle("Iniciá sesión para ver tus títulos guardados.");
            setState("No hay sesión activa.", true);
            console.log("[mylist] usuario no autenticado");
            return;
        }

        await showMyList(userId);
    } catch (e) {
        console.error("[mylist] init error:", e);
        setState("Ocurrió un error al iniciar la página.", true);
    }
}

document.addEventListener("DOMContentLoaded", init);