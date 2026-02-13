import { supabase, getActiveProfileId } from "./supabaseClient.js";
import { qs, toast, escapeHtml } from "./ui.js";

function getIdFromUrl() {
    const u = new URL(window.location.href);
    const qid = u.searchParams.get("id");
    if (qid) return qid;

    // Soporte “slug por path”: /titles/<algo> (si hacés rewrite a /titles/index.html)
    // Ej: /mpp -> rewrite -> /titles/index.html y guardás el slug en ?slug=...
    const slug = u.searchParams.get("slug");
    if (slug) return slug;

    // Fallback: hash
    const h = (window.location.hash || "").replace("#", "");
    return h || null;
}

function progressBlock(pct, label) {
    const p = Math.max(0, Math.min(100, pct || 0));
    return `
    <div class="progress-wrap">
      <div class="progress"><div style="width:${p.toFixed(2)}%"></div></div>
      <div class="progress-label">${escapeHtml(label || "")}</div>
    </div>
  `;
}

async function ensureAuthProfile() {
    const { data } = await supabase.auth.getSession();
    if (!data?.session?.user) {
        location.href = "../auth.html";
        return null;
    }
    const pid = getActiveProfileId();
    if (!pid) {
        location.href = "../profile.html";
        return null;
    }
    return { user: data.session.user, profileId: pid };
}

async function loadContentById(id) {
    // id es UUID si ya insertaste content en DB.
    // Si quisieras usar tu JSON “mpp/cp1…” como slug, agregá columna content.slug y buscá por slug.
    const { data, error } = await supabase
        .from("content")
        .select("id, type, title, description, thumbnail_url, banner_url, release_year, duration_seconds")
        .eq("id", id)
        .single();

    if (error) return { error };
    return { data };
}

async function loadEpisodesForSeries(contentId) {
    // seasons -> episodes
    const { data, error } = await supabase
        .from("seasons")
        .select("id, season_number, episodes(id, episode_number, title, duration_seconds, video_url)")
        .eq("content_id", contentId)
        .order("season_number", { ascending: true });

    if (error) return { error };
    return { data: data || [] };
}

function episodeCard(seasonNumber, ep) {
    const dur = ep.duration_seconds ? `${Math.round(ep.duration_seconds / 60)} min` : "";
    return `
    <div class="card" data-episode-id="${ep.id}">
      <div class="card-body">
        <div class="title-row">
          <h3>${escapeHtml(ep.title || `Episodio ${ep.episode_number}`)}</h3>
          <div style="color:var(--muted)">T${seasonNumber} E${ep.episode_number}</div>
        </div>
        <div class="meta">
          ${dur ? `<span><i class="fa-regular fa-clock"></i> ${dur}</span>` : ""}
        </div>
        <div class="hr"></div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn primary" data-play-episode="${ep.id}">
            <i class="fa-solid fa-play"></i> Reproducir
          </button>
          <button class="btn" data-set-episode="${ep.id}" data-season="${seasonNumber}" data-epnum="${ep.episode_number}">
            <i class="fa-solid fa-circle-dot"></i> Marcar como actual
          </button>
        </div>
      </div>
    </div>
  `;
}

async function upsertMyList(profileId, contentId) {
    // Toggle simple: si existe -> delete, si no -> insert
    const { data: existing, error: exErr } = await supabase
        .from("my_list")
        .select("id")
        .eq("profile_id", profileId)
        .eq("content_id", contentId)
        .maybeSingle();

    if (exErr) return toast("Error Mi lista", exErr.message);

    if (existing?.id) {
        const { error } = await supabase.from("my_list").delete().eq("id", existing.id);
        if (error) return toast("No se pudo quitar de Mi lista", error.message);
        toast("Quitado de Mi lista");
        return false;
    } else {
        const { error } = await supabase.from("my_list").insert({ profile_id: profileId, content_id: contentId });
        if (error) return toast("No se pudo agregar a Mi lista", error.message);
        toast("Agregado a Mi lista");
        return true;
    }
}

async function getProgress(profileId, contentId) {
    const { data, error } = await supabase
        .from("watch_progress")
        .select(`
      id, progress_seconds, duration_seconds, completed, episode_id,
      episode:episode_id(episode_number, season:season_id(season_number))
    `)
        .eq("profile_id", profileId)
        .eq("content_id", contentId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) return { error };
    return { data };
}

async function saveProgressDemo(profileId, content, episodeId = null, progressSeconds = 120) {
    // demo: guarda 2 minutos
    const duration = content.duration_seconds || 3600;
    const completed = progressSeconds >= duration - 5;

    // upsert por (profile_id, content_id) requiere UNIQUE(profile_id, content_id)
    // Si también querés por episode, conviene que solo uses una de las uniques (recomendado: UNA)
    // Para simplificar: usamos content_id y episode_id, y luego hacés limpieza si cambia de episodio.
    const payload = {
        profile_id: profileId,
        content_id: content.id,
        episode_id: episodeId,
        progress_seconds: progressSeconds,
        duration_seconds: duration,
        completed
    };

    // Estrategia: primero borramos otras filas del mismo content si existían con otro episode_id (opcional)
    await supabase
        .from("watch_progress")
        .delete()
        .eq("profile_id", profileId)
        .eq("content_id", content.id);

    const { error } = await supabase.from("watch_progress").insert(payload);
    if (error) return toast("No se pudo guardar progreso", error.message);
    toast("Progreso guardado");
}

(async function main() {
    const ctx = await ensureAuthProfile();
    if (!ctx) return;

    const idOrSlug = getIdFromUrl();
    if (!idOrSlug) {
        toast("Falta id del título", "Usá /titles/index.html?id=<uuid>");
        return;
    }

    const { data: content, error: cErr } = await loadContentById(idOrSlug);
    if (cErr) {
        toast("No se pudo cargar el título", cErr.message);
        return;
    }

    qs("#tTitle").textContent = content.title;
    qs("#crumb").textContent = content.title;

    const poster = content.thumbnail_url || content.banner_url || "";
    if (poster) qs("#tPoster").src = poster;

    const metaParts = [];
    if (content.type) metaParts.push(content.type === "series" ? "Serie" : "Película");
    if (content.release_year) metaParts.push(String(content.release_year));
    if (content.duration_seconds && content.type === "movie") metaParts.push(`${Math.round(content.duration_seconds / 60)} min`);
    qs("#tMeta").textContent = metaParts.join(" • ");
    qs("#tSynopsis").textContent = content.description || "";

    // Progreso actual
    const prog = await getProgress(ctx.profileId, content.id);
    if (prog.error) {
        toast("No se pudo leer progreso", prog.error.message);
    } else {
        const p = prog.data;
        if (p) {
            const pct = p.duration_seconds ? (p.progress_seconds / p.duration_seconds) * 100 : 0;
            let label = `${Math.round(pct)}%`;
            if (p.episode?.season?.season_number && p.episode?.episode_number) {
                label = `T${p.episode.season.season_number} E${p.episode.episode_number}`;
            }
            qs("#progressBox").innerHTML = progressBlock(pct, label);
        } else {
            qs("#progressBox").innerHTML = `<div class="meta">Sin progreso guardado.</div>`;
        }
    }

    // Episodios si es serie
    if (content.type === "series") {
        const eps = await loadEpisodesForSeries(content.id);
        if (eps.error) {
            toast("No se pudieron cargar episodios", eps.error.message);
        } else {
            const out = [];
            eps.data.forEach(s => {
                (s.episodes || [])
                    .sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0))
                    .forEach(ep => out.push(episodeCard(s.season_number, ep)));
            });
            qs("#episodesGrid").innerHTML = out.join("") || `<div class="panel">No hay episodios cargados.</div>`;
        }
    } else {
        qs("#episodesGrid").innerHTML = `<div class="panel">Este título es una película.</div>`;
    }

    qs("#btnMyList")?.addEventListener("click", async () => {
        await upsertMyList(ctx.profileId, content.id);
    });

    qs("#btnSaveProgress")?.addEventListener("click", async () => {
        // demo: guarda 2 min, sin episodio
        await saveProgressDemo(ctx.profileId, content, null, 120);
        const prog2 = await getProgress(ctx.profileId, content.id);
        if (prog2.data) {
            const pct = prog2.data.duration_seconds ? (prog2.data.progress_seconds / prog2.data.duration_seconds) * 100 : 0;
            qs("#progressBox").innerHTML = progressBlock(pct, `${Math.round(pct)}%`);
        }
    });

    qs("#btnPlay")?.addEventListener("click", () => {
        // Acá conectás tu reproductor (video.js / hls.js) sin blur.
        // Si tenés un campo content.video_url, lo abrís en un player.html.
        toast("Play", "Conectá acá tu reproductor (HLS/MP4/WebM).");
    });

    // Si marcás episodio como actual (para label T/E)
    document.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-set-episode]");
        if (!btn) return;
        const episodeId = btn.getAttribute("data-set-episode");
        const season = btn.getAttribute("data-season");
        const epnum = btn.getAttribute("data-epnum");
        await saveProgressDemo(ctx.profileId, content, episodeId, 60);
        qs("#progressBox").innerHTML = progressBlock(3, `T${season} E${epnum}`);
    });
})();