import { supabase, setActiveProfileId, clearActiveProfileId } from "./supabaseClient.js";
import { qs, toast, escapeHtml } from "./ui.js";

async function requireAuth() {
    const { data } = await supabase.auth.getSession();
    if (!data?.session?.user) {
        location.href = "auth.html";
        return null;
    }
    return data.session.user;
}

function profileCard(p) {
    const avatar = p.avatar_url
        ? `<div class="avatar"><img alt="" src="${escapeHtml(p.avatar_url)}"></div>`
        : `<div class="avatar" style="display:grid;place-items:center;"><i class="fa-solid fa-user"></i></div>`;

    return `
    <div class="card" data-pid="${p.id}" style="cursor:pointer;">
      <div class="card-body" style="display:flex; align-items:center; gap:12px;">
        ${avatar}
        <div style="min-width:0;">
          <h3 style="margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.display_name)}</h3>
          <div class="meta">Perfil</div>
        </div>
        <div style="margin-left:auto; color:var(--muted);">
          <i class="fa-solid fa-chevron-right"></i>
        </div>
      </div>
    </div>
  `;
}

async function loadProfiles() {
    const user = await requireAuth();
    if (!user) return;

    const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, created_at")
        .order("created_at", { ascending: true });

    if (error) return toast("No se pudieron cargar perfiles", error.message);

    const grid = qs("#profilesGrid");
    grid.innerHTML = (data || []).map(profileCard).join("") || `
    <div class="panel">No tenés perfiles todavía.</div>
  `;

    grid.querySelectorAll("[data-pid]").forEach(el => {
        el.addEventListener("click", () => {
            const pid = el.getAttribute("data-pid");
            setActiveProfileId(pid);
            toast("Perfil seleccionado");
            location.href = "home.html";
        });
    });
}

qs("#formProfile")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = await requireAuth();
    if (!user) return;

    const display_name = qs("#display_name").value.trim();
    const avatar_url = qs("#avatar_url").value.trim() || null;

    const { error } = await supabase.from("profiles").insert({
        user_id: user.id,
        display_name,
        avatar_url
    });

    if (error) return toast("No se pudo crear el perfil", error.message);

    toast("Perfil creado");
    qs("#display_name").value = "";
    qs("#avatar_url").value = "";
    await loadProfiles();
});

qs("#btnLogout")?.addEventListener("click", async () => {
    clearActiveProfileId();
    const { error } = await supabase.auth.signOut();
    if (error) return toast("No se pudo cerrar sesión", error.message);
    location.href = "auth.html";
});

qs("#btnGoHome")?.addEventListener("click", () => {
    location.href = "home.html";
});

loadProfiles();