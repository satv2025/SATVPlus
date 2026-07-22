import { renderNav, renderAuthButtons, toast } from "./ui.js";
import { requireAuthOrRedirect } from "./auth.js";
import { supabase } from "./supabaseClient.js";
import { getActiveViewerProfile } from "./viewerProfiles.js";

const form = document.getElementById("account-form");
const emailInput = document.getElementById("account-email");
const nameInput = document.getElementById("account-name");
const usernameInput = document.getElementById("account-username");
const phoneInput = document.getElementById("account-phone");
const createdEl = document.getElementById("account-created");
const accountIdEl = document.getElementById("account-id");
const statusEl = document.getElementById("account-status");
const saveBtn = document.getElementById("account-save");

let session = null;
let accountProfile = null;

function clean(value) {
  const text = String(value || "").trim();
  return text || null;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

function setStatus(message = "", type = "") {
  statusEl.textContent = message;
  statusEl.dataset.type = type;
}

function setBusy(busy) {
  saveBtn.disabled = busy;
  saveBtn.innerHTML = busy
    ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Guardando…'
    : '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Guardar cambios';
}

async function fetchAccountProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,username,phone,avatar_url,created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function ensureAccountProfile(user) {
  const existing = await fetchAccountProfile(user.id);
  if (existing) return existing;

  const metadata = user.user_metadata || {};
  const row = {
    id: user.id,
    email: user.email || null,
    full_name: clean(metadata.full_name),
    username: clean(metadata.username),
    phone: clean(metadata.phone),
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(row, { onConflict: "id" })
    .select("id,email,full_name,username,phone,avatar_url,created_at")
    .single();

  if (error) throw error;
  return data;
}

function populate(profile, user) {
  emailInput.value = user.email || profile?.email || "";
  nameInput.value = profile?.full_name || user.user_metadata?.full_name || "";
  usernameInput.value = profile?.username || user.user_metadata?.username || "";
  phoneInput.value = profile?.phone || user.user_metadata?.phone || "";
  createdEl.textContent = formatDate(profile?.created_at || user.created_at);
  accountIdEl.textContent = user.id || "—";
}

async function updatePublicProfile(userId, values) {
  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: values.fullName,
      username: values.username,
      phone: values.phone,
    })
    .eq("id", userId)
    .select("id,email,full_name,username,phone,avatar_url,created_at")
    .single();

  if (error) throw error;
  return data;
}

async function updateAuthMetadata(user, values) {
  const oldMetadata = user.user_metadata || {};
  const { data, error } = await supabase.auth.updateUser({
    data: {
      ...oldMetadata,
      full_name: values.fullName,
      username: values.username,
      phone: values.phone,
    },
  });

  if (error) throw error;
  return data?.user || user;
}

async function requestEmailChange(currentEmail, nextEmail) {
  if (!nextEmail || nextEmail === currentEmail) return false;

  const { error } = await supabase.auth.updateUser({ email: nextEmail });
  if (error) throw error;
  return true;
}

function explainError(error) {
  const message = String(error?.message || error || "");
  const lower = message.toLowerCase();

  if (
    lower.includes("profiles_username_key") ||
    lower.includes("duplicate key") ||
    lower.includes("username") && lower.includes("already")
  ) {
    return "Ese nombre de usuario ya está en uso.";
  }
  if (lower.includes("email") && lower.includes("already")) {
    return "Ese correo ya está vinculado a otra cuenta.";
  }
  if (lower.includes("invalid") && lower.includes("email")) {
    return "Ingresá un correo electrónico válido.";
  }
  if (lower.includes("row-level security") || lower.includes("permission")) {
    return "Supabase rechazó la edición. Ejecutá el SQL V4 completo.";
  }
  return message || "No se pudieron guardar los datos de la cuenta.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!session?.user?.id) return;

  const values = {
    email: emailInput.value.trim().toLowerCase(),
    fullName: clean(nameInput.value),
    username: clean(usernameInput.value),
    phone: clean(phoneInput.value),
  };

  if (!values.email) {
    toast("Ingresá un correo electrónico.", "error");
    return;
  }

  setBusy(true);
  setStatus();

  try {
    const originalEmail = String(session.user.email || "").toLowerCase();

    const updatedUser = await updateAuthMetadata(session.user, values);
    const updatedProfile = await updatePublicProfile(session.user.id, values);

    accountProfile = updatedProfile;
    session.user = updatedUser;

    let emailChangeRequested = false;
    let emailChangeError = null;
    try {
      emailChangeRequested = await requestEmailChange(originalEmail, values.email);
    } catch (error) {
      emailChangeError = error;
    }

    populate(accountProfile, session.user);

    if (emailChangeError) {
      emailInput.value = originalEmail;
      const emailMessage = explainError(emailChangeError);
      setStatus(`Los demás datos se guardaron, pero el correo no se pudo cambiar: ${emailMessage}`, "error");
      toast("Datos guardados, excepto el correo.", "error");
    } else if (emailChangeRequested) {
      emailInput.value = originalEmail;
      setStatus(
        `Se guardaron los datos. Revisá ${originalEmail} y ${values.email} para confirmar el cambio de correo.`,
        "pending"
      );
      toast("Datos guardados. Falta confirmar el correo.", "success");
    } else {
      setStatus("Los datos de la cuenta fueron actualizados.", "success");
      toast("Cuenta actualizada.", "success");
    }
  } catch (error) {
    console.error("[account] save error:", error);
    const message = explainError(error);
    setStatus(message, "error");
    toast(message, "error");
  } finally {
    setBusy(false);
  }
});

async function init() {
  renderNav({ active: "profile" });

  session = await requireAuthOrRedirect({ requireProfile: false });
  if (!session?.user) return;

  try {
    const activeProfile = await getActiveViewerProfile(session);
    if (activeProfile) {
      await renderAuthButtons();
    } else {
      const host = document.getElementById("nav-actions") || document.getElementById("nav-right");
      if (host) host.innerHTML = '<a class="btn ghost" href="/profiles.html">Volver a perfiles</a>';
    }
  } catch (error) {
    console.warn("[account] no se pudo renderizar el control de perfil:", error);
  }

  try {
    accountProfile = await ensureAccountProfile(session.user);
    populate(accountProfile, session.user);

    const params = new URLSearchParams(window.location.search);
    if (params.get("emailUpdated") === "1") {
      setStatus("El cambio de correo fue confirmado.", "success");
    }
  } catch (error) {
    console.error("[account] load error:", error);
    const message = explainError(error);
    setStatus(message, "error");
    toast(message, "error");
  }
}

document.addEventListener("DOMContentLoaded", init);
