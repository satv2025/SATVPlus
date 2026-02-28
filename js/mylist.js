// /js/mylist.js
// ✅ Importa supabaseClient.js (NO se modifica)
// ✅ Requiere que mylist.html cargue antes el SDK global de Supabase
// ✅ Carga lista desde Supabase
// ✅ Sincroniza localStorage -> Supabase (puente con el botón "Mi Lista" actual)
// ✅ Render con ui.cardHtml si existe, fallback si no

import { supabase } from "./supabaseClient.js";
import * as ui from "./ui.js";
import * as api from "./api.js";

function el(id) {
    return document.getElementById(id);
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

function uniq(arr) {
    return [...new Set((arr || []).filter(Boolean))];
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
    const mm = item.movie_meta || null;
    const sc = Number(mm?.seasons_count);
    const ec = Number(mm?.episodes_count);

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

function normalizeMovieRow(row) {
    return {
        id: row.id,
        title: row.title || "Sin título",
        description: row.description || "",
        thumbnail_url: row.thumbnail_url || "",
        banner_url: row.banner_url || "",
        release_year: row.release_year ?? null,
        category: row.category || null,
        duration_minutes: row.duration_minutes ?? null,
        movie_meta: row.movie_meta || null,
    };
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

function setHeroBackground(items) {
    const hero = el("hero-image");
    if (!hero) return;

    const candidate = (items || []).find(x => x.banner_url || x.thumbnail_url);
    const img = candidate?.banner_url || candidate?.thumbnail_url || "";
    if (!img) return;

    hero.style.backgroundImage = `url("${img}")`;
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
            console.warn("[mylist] ui.cardHtml falló, uso fallback", e);
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

async function getCurrentUserId() {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
        console.error("[mylist] auth.getUser error:", error);
        return null;
    }
    return data?.user?.id || null;
}

/* =========================================================
   Puente de integración: localStorage -> Supabase
   (para títulos guardados por el botón "Mi Lista" local)
========================================================= */

const LOCAL_MY_LIST_KEY = "satv_my_list_ids";

function getLocalMyListIds() {
    try {
        const raw = localStorage.getItem(LOCAL_MY_LIST_KEY);
        const arr = JSON.parse(raw || "[]");
        return Array.isArray(arr) ? uniq(arr.map(String)) : [];
    } catch {
        return [];
    }
}

async function syncLocalMyListToSupabase(userId) {
    const ids = getLocalMyListIds();
    if (!userId || !ids.length) return { synced: 0, skipped: true };

    // insert por lote con upsert (requiere unique(user_id, movie_id))
    const payload = ids.map(movieId => ({
        user_id: userId,
        movie_id: movieId,
        // aliases (por compatibilidad, el trigger igual normaliza)
        profile_id: userId,
        content_id: movieId,
        title_id: movieId
    }));

    const { error } = await supabase
        .from("my_list")
        .upsert(payload, { onConflict: "user_id,movie_id", ignoreDuplicates: false });

    if (error) {
        console.warn("[mylist] sync local->supabase error:", error);
        return { synced: 0, skipped: false, error };
    }

    return { synced: payload.length, skipped: false };
}

/* =========================================================
   Carga de my_list (con compat de columnas)
========================================================= */

async function fetchMyListRows(userId) {
    if (!userId) return [];

    // Intento 1: user_id
    let res = await supabase
        .from("my_list")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

    // Fallback: profile_id
    if (res.error) {
        console.warn("[mylist] query user_id falló, pruebo profile_id:", res.error.message);
        res = await supabase
            .from("my_list")
            .select("*")
            .eq("profile_id", userId)
            .order("created_at", { ascending: false });
    }

    if (res.error) throw res.error;
    return res.data || [];
}

function extractMovieIdsFromMyListRows(rows) {
    return uniq(
        (rows || []).map(r =>
            r.movie_id ??
            r.content_id ??
            r.title_id ??
            null
        )
    );
}

async function fetchMoviesByIds(ids) {
    if (!ids.length) return [];

    // Intento con relation movie_meta
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

    // Fallback sin relation expandida
    if (res.error) {
        console.warn("[mylist] select con movie_meta falló, reintento simple:", res.error.message);
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

    if (res.error) {
        console.warn("[mylist] lectura movies falló, uso fallback api.fetchMovie:", res.error);

        // Fallback final: API helper
        if (typeof api.fetchMovie === "function") {
            const out = [];
            for (const id of ids) {
                try {
                    const item = await api.fetchMovie(id);
                    if (item) out.push(normalizeMovieRow(item));
                } catch (e) {
                    console.warn("[mylist] fetchMovie fallback falló:", id, e);
                }
            }
            return out;
        }

        throw res.error;
    }

    return (res.data || []).map(normalizeMovieRow);
}

function sortItemsBySavedOrder(items, savedIds) {
    const pos = new Map(savedIds.map((id, i) => [String(id), i]));
    return [...items].sort((a, b) => (pos.get(String(a.id)) ?? 999999) - (pos.get(String(b.id)) ?? 999999));
}

async function showMyList(userId) {
    const row = el("mylist-row");
    if (!row) return;

    row.innerHTML = "";
    setState("Cargando tu lista…", true);

    // 1) puente desde localStorage (si existe)
    await syncLocalMyListToSupabase(userId);

    // 2) leer tabla
    const myRows = await fetchMyListRows(userId);

    if (!myRows.length) {
        setSubtitle("Todavía no agregaste títulos.");
        setState("Tu lista está vacía.", true);
        return;
    }

    const savedIds = extractMovieIdsFromMyListRows(myRows);

    if (!savedIds.length) {
        setSubtitle(`${myRows.length} filas encontradas, pero sin IDs de contenido válidos.`);
        setState("Revisá columnas movie_id / content_id / title_id en my_list.", true);
        console.warn("[mylist] filas sin IDs detectables:", myRows);
        return;
    }

    const items = sortItemsBySavedOrder(await fetchMoviesByIds(savedIds), savedIds);

    if (!items.length) {
        setSubtitle(`${savedIds.length} títulos guardados, pero no se encontraron en movies.`);
        setState("Revisá la FK my_list.movie_id -> movies.id o que los IDs existan.", true);
        return;
    }

    setSubtitle(`${items.length} ${plural(items.length, "título guardado", "títulos guardados")}`);
    setState("", false);
    setHeroBackground(items);

    row.innerHTML = items.map(renderCard).join("");
    bindCardNavigation(row);
}

async function init() {
    try {
        // UI general del sitio
        ui.setAppName?.();
        ui.renderNav?.({ active: "mylist" });
        ui.renderAuthButtons?.();
        ui.enableDataHrefNavigation?.();

        const userId = await getCurrentUserId();

        if (!userId) {
            setSubtitle("Iniciá sesión para ver tu lista.");
            setState("No hay sesión activa.", true);
            return;
        }

        await showMyList(userId);
    } catch (e) {
        console.error("[mylist] init error:", e);
        setSubtitle("No se pudo cargar tu lista.");
        setState("Error al iniciar la página. Revisá consola.", true);
    }
}

document.addEventListener("DOMContentLoaded", init);