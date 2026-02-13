import { supabase } from "./supabaseClient.js";
import { qs, toast } from "./ui.js";

async function refreshAuthState() {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    const el = qs("#authState");
    if (!el) return;
    if (user) {
        el.innerHTML = `Sesión activa: <span class="kbd">${user.email}</span>`;
    } else {
        el.innerHTML = `Sin sesión.`;
    }
}

qs("#formEmail")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = qs("#email").value.trim();
    const password = qs("#password").value.trim();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return toast("No se pudo iniciar sesión", error.message);
    toast("Sesión iniciada");
    await refreshAuthState();
    location.href = "profile.html";
});

qs("#btnSignup")?.addEventListener("click", async () => {
    const email = qs("#email").value.trim();
    const password = qs("#password").value.trim();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return toast("No se pudo crear cuenta", error.message);
    toast("Cuenta creada", "Si pedís confirmación de email, revisá tu bandeja.");
    await refreshAuthState();
});

qs("#btnLogout")?.addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) return toast("No se pudo cerrar sesión", error.message);
    toast("Sesión cerrada");
    await refreshAuthState();
});

supabase.auth.onAuthStateChange((_evt, _session) => refreshAuthState());
refreshAuthState();