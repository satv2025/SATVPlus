import { getSession, signOut } from "./auth.js";
import { toast, escapeHtml } from "./ui.js";
import {
  listProfileAvatars,
  listViewerProfiles,
  createViewerProfile,
  updateViewerProfile,
  deleteViewerProfile,
  setActiveViewerProfile,
  clearActiveViewerProfile,
  explainViewerProfileError,
} from "./viewerProfiles.js";

const grid = document.getElementById("profiles-grid");
const modal = document.getElementById("profile-modal");
const form = document.getElementById("profile-form");
const nameInput = document.getElementById("profile-name");
const kidsInput = document.getElementById("profile-kids");
const avatarGrid = document.getElementById("avatar-grid");
const manageBtn = document.getElementById("manage-btn");

let session = null;
let accountId = null;
let profiles = [];
let avatars = [];
let selectedAvatarKey = null;
let editingProfileId = null;
let managing = false;

function avatarUrl(key) {
  return avatars.find((a) => a.avatar_key === key)?.image_url || "/images/profile-avatars/nova.svg";
}

function destination() {
  const raw = new URL(location.href).searchParams.get("next");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/profiles")) return "/index.html";
  return raw;
}

function renderAvatars() {
  avatarGrid.innerHTML = avatars.map((avatar) => `
    <button class="avatar-choice ${avatar.avatar_key === selectedAvatarKey ? "selected" : ""}"
      type="button" data-avatar-key="${escapeHtml(avatar.avatar_key)}" title="${escapeHtml(avatar.label)}">
      <img src="${escapeHtml(avatar.image_url)}" alt="${escapeHtml(avatar.label)}" />
    </button>
  `).join("");

  avatarGrid.querySelectorAll("[data-avatar-key]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedAvatarKey = button.dataset.avatarKey;
      renderAvatars();
    });
  });
}

function openModal(profile = null) {
  editingProfileId = profile?.id || null;
  document.getElementById("profile-modal-title").textContent = profile ? "Editar perfil" : "Crear perfil";
  nameInput.value = profile?.name || "";
  kidsInput.checked = !!profile?.is_kids;
  selectedAvatarKey = profile?.avatar_key || avatars[0]?.avatar_key || null;
  renderAvatars();
  modal.hidden = false;
  document.body.classList.add("modal-open");
  setTimeout(() => nameInput.focus(), 0);
}

function closeModal() {
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  editingProfileId = null;
  form.reset();
}

function profileCard(profile) {
  return `
    <article class="viewer-profile-card" data-profile-id="${profile.id}">
      <button class="viewer-profile-main" type="button" aria-label="Entrar como ${escapeHtml(profile.name)}">
        <span class="viewer-profile-avatar-wrap">
          <img class="viewer-profile-avatar" src="${escapeHtml(avatarUrl(profile.avatar_key))}" alt="" />
          ${managing ? '<span class="profile-edit-badge">✎</span>' : ""}
        </span>
        <span class="viewer-profile-name">${escapeHtml(profile.name)}</span>
        ${profile.is_kids ? '<span class="kids-badge">Infantil</span>' : ""}
      </button>
      ${managing ? '<button class="profile-delete" type="button">Eliminar</button>' : ""}
    </article>
  `;
}

function render() {
  const atLimit = profiles.length >= 10;
  document.getElementById("profiles-title").textContent = profiles.length ? "¿Quién está mirando?" : "Creá tu primer perfil";
  document.getElementById("profiles-subtitle").textContent = profiles.length
    ? `${profiles.length} de 10 perfiles creados.`
    : "Para entrar a SATV+ necesitás crear al menos un perfil.";

  grid.innerHTML = profiles.map(profileCard).join("") + (atLimit ? "" : `
    <button id="add-profile-card" class="add-profile-card" type="button">
      <span class="add-profile-icon">+</span>
      <span>Agregar perfil</span>
    </button>
  `);

  grid.querySelectorAll(".viewer-profile-card").forEach((card) => {
    const profile = profiles.find((p) => p.id === card.dataset.profileId);
    card.querySelector(".viewer-profile-main")?.addEventListener("click", () => {
      if (managing) return openModal(profile);
      setActiveViewerProfile(accountId, profile.id);
      window.location.replace(destination());
    });
    card.querySelector(".profile-delete")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!confirm(`¿Eliminar el perfil “${profile.name}”?`)) return;
      try {
        await deleteViewerProfile(profile.id);
        clearActiveViewerProfile(accountId);
        await reloadProfiles();
        toast("Perfil eliminado.", "success");
      } catch (error) {
        toast(explainViewerProfileError(error), "error");
      }
    });
  });

  document.getElementById("add-profile-card")?.addEventListener("click", () => openModal());
  manageBtn.disabled = profiles.length === 0;
  manageBtn.textContent = managing ? "Terminar" : "Administrar perfiles";
}

async function reloadProfiles() {
  profiles = await listViewerProfiles(accountId);
  render();
  if (profiles.length === 0) managing = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const payload = {
      name: nameInput.value,
      avatarKey: selectedAvatarKey,
      isKids: kidsInput.checked,
    };
    if (editingProfileId) {
      await updateViewerProfile(editingProfileId, payload);
      toast("Perfil actualizado.", "success");
    } else {
      await createViewerProfile({ accountId, ...payload });
      toast("Perfil creado.", "success");
    }
    closeModal();
    await reloadProfiles();
  } catch (error) {
    toast(explainViewerProfileError(error), "error");
  } finally {
    submit.disabled = false;
  }
});

document.getElementById("profile-modal-close").addEventListener("click", closeModal);
document.getElementById("profile-cancel").addEventListener("click", closeModal);
modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
manageBtn.addEventListener("click", () => { managing = !managing; render(); });
document.getElementById("logout-btn").addEventListener("click", async () => {
  clearActiveViewerProfile(accountId);
  await signOut();
  window.location.replace("/login.html");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modal.hidden) closeModal();
});

async function init() {
  session = await getSession();
  if (!session) return window.location.replace("/login.html");
  accountId = session.user.id;
  try {
    [avatars, profiles] = await Promise.all([listProfileAvatars(), listViewerProfiles(accountId)]);
    if (!avatars.length) throw new Error("No hay avatares cargados. Ejecutá supabase/profiles_setup.sql.");
    render();
    if (!profiles.length) openModal();
  } catch (error) {
    console.error(error);
    toast(explainViewerProfileError(error), "error");
  }
}

init();
