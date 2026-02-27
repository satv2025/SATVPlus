// /js/profile.js
import { renderNav, renderAuthButtons, toast, $ } from "./ui.js";
import { requireAuthOrRedirect } from "./auth.js";
import { supabase } from "./supabaseClient.js";

const EDITMODE_GRANT_KEY = "satv_profile_edit_grant";

function getUrl() {
  return new URL(window.location.href);
}

function getParam(name) {
  return getUrl().searchParams.get(name);
}

function isEditModeRequested() {
  return getParam("editmode") === "true";
}

function buildProfileUrl(userId, editmode = false) {
  const url = new URL(window.location.origin + "/profile");
  url.searchParams.set("id", userId);
  if (editmode) url.searchParams.set("editmode", "true");
  return url.toString();
}

function ensureCanonicalProfileUrl(userId) {
  if (!userId) return;
  const url = getUrl();
  let changed = false;

  if (url.pathname !== "/profile" && url.pathname !== "/profile/") {
    // Si tu server sirve /profile.html, cambiá esto a /profile.html
    url.pathname = "/profile";
    changed = true;
  }

  if (!url.searchParams.get("id")) {
    url.searchParams.set("id", userId);
    changed = true;
  }

  if (changed) {
    window.history.replaceState({}, "", url.toString());
  }
}

function clearEditModeFromUrl() {
  const url = getUrl();
  url.searchParams.delete("editmode");
  window.history.replaceState({}, "", url.toString());
}

function setEditGrant(userId) {
  try {
    sessionStorage.setItem(EDITMODE_GRANT_KEY, String(userId));
  } catch { }
}

function consumeEditGrant(userId) {
  try {
    const v = sessionStorage.getItem(EDITMODE_GRANT_KEY);
    const ok = v === String(userId);
    if (ok) sessionStorage.removeItem(EDITMODE_GRANT_KEY);
    return ok;
  } catch {
    return false;
  }
}

function formatDate(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("es-AR");
}

/* =========================================================
   Supabase (profiles)
========================================================= */

async function fetchProfileById(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(`
      id,
      email,
      full_name,
      username,
      phone,
      avatar_url,
      created_at
    `)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function updateOwnProfile(userId, patch = {}) {
  if (!userId) throw new Error("Falta userId");

  // OJO: email en profiles puede desincronizarse de auth.users.
  // Por eso NO lo editamos acá.
  const allowed = {
    full_name: patch.full_name ?? undefined,
    username: patch.username ?? undefined,
    phone: patch.phone ?? undefined,
    avatar_url: patch.avatar_url ?? undefined,
  };

  const clean = Object.fromEntries(
    Object.entries(allowed).filter(([, v]) => v !== undefined)
  );

  if (!Object.keys(clean).length) {
    return await fetchProfileById(userId);
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(clean)
    .eq("id", userId)
    .select(`
      id,
      email,
      full_name,
      username,
      phone,
      avatar_url,
      created_at
    `)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/* =========================================================
   UI helpers
========================================================= */

function ensureEditButton() {
  let btn = $("#btn-edit-profile");
  if (btn) return btn;

  // Si no existe en HTML, lo creamos automáticamente al lado del h2
  const h2 = document.querySelector("h2");
  if (!h2) return null;

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.alignItems = "center";
  wrap.style.justifyContent = "space-between";
  wrap.style.gap = "12px";
  wrap.style.flexWrap = "wrap";

  const parent = h2.parentElement;
  if (!parent) return null;

  // Si el h2 ya estaba dentro de un contenedor flex, solo agregamos el botón
  if (parent.children.length >= 1) {
    btn = document.createElement("a");
    btn.id = "btn-edit-profile";
    btn.className = "btn";
    btn.href = "#";
    btn.style.display = "none";
    btn.textContent = "Editar datos";
    parent.appendChild(btn);
    return btn;
  }

  // Fallback raro
  btn = document.createElement("a");
  btn.id = "btn-edit-profile";
  btn.className = "btn";
  btn.href = "#";
  btn.style.display = "none";
  btn.textContent = "Editar datos";
  wrap.appendChild(h2);
  wrap.appendChild(btn);
  parent.prepend(wrap);
  return btn;
}

function setProfileTitle(text) {
  const h2 = document.querySelector("h2");
  if (h2) h2.textContent = text;
}

function renderProfileData(profile, sessionUserEmailFallback = "") {
  $("#p-email").textContent = profile?.email || sessionUserEmailFallback || "-";
  $("#p-name").textContent = profile?.full_name || "-";
  $("#p-user").textContent = profile?.username || "-";
  $("#p-phone").textContent = profile?.phone || "-";
  $("#p-created").textContent = formatDate(profile?.created_at);
}

function setPrivateFieldsIfNeeded(isOwnProfile) {
  if (isOwnProfile) return;
  // Si querés ocultar datos en perfiles ajenos, descomentá:
  // $("#p-email").textContent = "Privado";
  // $("#p-phone").textContent = "Privado";
}

function removeExistingEditControls() {
  const old = document.getElementById("profile-edit-controls");
  if (old) old.remove();
}

function enterEditMode(profile, loggedUserId) {
  removeExistingEditControls();

  const nameEl = $("#p-name");
  const userEl = $("#p-user");
  const phoneEl = $("#p-phone");

  const current = {
    full_name: profile?.full_name || "",
    username: profile?.username || "",
    phone: profile?.phone || "",
  };

  nameEl.innerHTML = "";
  userEl.innerHTML = "";
  phoneEl.innerHTML = "";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.id = "edit-full-name";
  nameInput.value = current.full_name;
  nameInput.placeholder = "Tu nombre";
  nameInput.style.width = "100%";

  const userInput = document.createElement("input");
  userInput.type = "text";
  userInput.id = "edit-username";
  userInput.value = current.username;
  userInput.placeholder = "Tu usuario";
  userInput.autocomplete = "username";
  userInput.style.width = "100%";

  const phoneInput = document.createElement("input");
  phoneInput.type = "tel";
  phoneInput.id = "edit-phone";
  phoneInput.value = current.phone;
  phoneInput.placeholder = "Tu teléfono";
  phoneInput.autocomplete = "tel";
  phoneInput.style.width = "100%";

  nameEl.appendChild(nameInput);
  userEl.appendChild(userInput);
  phoneEl.appendChild(phoneInput);

  // Controles de edición
  const createdRow = $("#p-created");
  const controls = document.createElement("div");
  controls.id = "profile-edit-controls";
  controls.style.display = "flex";
  controls.style.gap = "8px";
  controls.style.flexWrap = "wrap";
  controls.style.marginTop = "12px";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn";
  saveBtn.textContent = "Guardar cambios";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn";
  cancelBtn.textContent = "Cancelar";

  const hint = document.createElement("div");
  hint.className = "muted";
  hint.style.width = "100%";
  hint.textContent = "Email se muestra desde profiles/auth y no se edita desde esta pantalla.";

  controls.appendChild(saveBtn);
  controls.appendChild(cancelBtn);
  controls.appendChild(hint);

  const panel = createdRow?.closest(".panel");
  if (panel) panel.appendChild(controls);

  let saving = false;

  saveBtn.addEventListener("click", async () => {
    if (saving) return;
    saving = true;
    saveBtn.disabled = true;
    cancelBtn.disabled = true;

    try {
      const patch = {
        full_name: nameInput.value.trim() || null,
        username: userInput.value.trim() || null,
        phone: phoneInput.value.trim() || null,
      };

      const updated = await updateOwnProfile(loggedUserId, patch);
      toast("Perfil actualizado ✅", "success");

      // Volver a modo vista (misma página sin editmode)
      const viewUrl = buildProfileUrl(loggedUserId, false);
      window.location.assign(viewUrl);
      return updated;
    } catch (e) {
      console.error(e);

      const msg = String(e?.message || "").toLowerCase();
      if (msg.includes("profiles_username_key") || msg.includes("duplicate key") || msg.includes("username")) {
        toast("Ese usuario ya está en uso.", "error");
      } else if (msg.includes("row-level security") || msg.includes("permission")) {
        toast("No tenés permiso para editar este perfil.", "error");
      } else {
        toast("No se pudo guardar el perfil.", "error");
      }
    } finally {
      saving = false;
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener("click", () => {
    const viewUrl = buildProfileUrl(loggedUserId, false);
    window.location.assign(viewUrl);
  });
}

/* =========================================================
   Init
========================================================= */

async function init() {
  renderNav({ active: "profile" });
  await renderAuthButtons();

  const session = await requireAuthOrRedirect();
  if (!session) return;

  const loggedUserId = session.user?.id;
  if (!loggedUserId) {
    toast("Sesión inválida.", "error");
    return;
  }

  const requestedId = getParam("id");
  const targetProfileId = requestedId || loggedUserId;
  ensureCanonicalProfileUrl(targetProfileId);

  const isOwnProfile = String(loggedUserId) === String(targetProfileId);
  const requestedEditMode = isEditModeRequested();

  // Soft gate: editmode=true solo si venís desde el botón del perfil
  let allowEditMode = false;
  if (requestedEditMode) {
    allowEditMode = isOwnProfile && consumeEditGrant(targetProfileId);
    if (!allowEditMode) {
      clearEditModeFromUrl();
      toast("Modo edición no permitido desde acceso directo.", "error");
    }
  }

  const editBtn = ensureEditButton();

  try {
    const p = await fetchProfileById(targetProfileId);

    if (!p) {
      toast("Perfil no encontrado.", "error");
      setProfileTitle("Perfil");
      renderProfileData(null, session.user?.email || "");
      return;
    }

    setProfileTitle(isOwnProfile ? "Tu perfil" : `Perfil de ${p.username || p.full_name || "usuario"}`);
    renderProfileData(p, session.user?.email || "");
    setPrivateFieldsIfNeeded(isOwnProfile);

    if (editBtn) {
      if (isOwnProfile) {
        editBtn.style.display = "inline-flex";

        if (requestedEditMode && allowEditMode) {
          editBtn.textContent = "Salir de edición";
          editBtn.href = buildProfileUrl(targetProfileId, false);
        } else {
          editBtn.textContent = "Editar datos";
          editBtn.href = buildProfileUrl(targetProfileId, true);

          // Gate por sessionStorage
          editBtn.addEventListener("click", (ev) => {
            ev.preventDefault();
            setEditGrant(targetProfileId);
            window.location.assign(buildProfileUrl(targetProfileId, true));
          });
        }
      } else {
        editBtn.style.display = "none";
      }
    }

    if (requestedEditMode && allowEditMode) {
      enterEditMode(p, loggedUserId);
    }
  } catch (e) {
    console.error(e);
    toast("No se pudo cargar el perfil. Revisá RLS de profiles.", "error");
  }
}

document.addEventListener("DOMContentLoaded", init);