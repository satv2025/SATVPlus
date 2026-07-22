import { supabase } from "./supabaseClient.js";

const ACTIVE_PREFIX = "satv_active_viewer_profile";
let __avatarCatalogCache = null;

function sessionUserId(session) {
  return session?.user?.id || session?.session?.user?.id || null;
}

function activeKey(accountId) {
  return `${ACTIVE_PREFIX}:${accountId}`;
}

export function clearActiveViewerProfile(accountId) {
  if (!accountId) return;
  try { localStorage.removeItem(activeKey(accountId)); } catch (_) {}
}

export function setActiveViewerProfile(accountId, profileId) {
  if (!accountId || !profileId) return;
  localStorage.setItem(activeKey(accountId), String(profileId));
}

export function getStoredActiveViewerProfileId(accountId) {
  if (!accountId) return null;
  try { return localStorage.getItem(activeKey(accountId)); } catch (_) { return null; }
}

export async function listProfileAvatars({ force = false } = {}) {
  if (!force && Array.isArray(__avatarCatalogCache)) {
    return __avatarCatalogCache;
  }

  const { data, error } = await supabase
    .from("profile_avatars")
    .select("avatar_key,label,image_url,sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;

  __avatarCatalogCache = data || [];
  return __avatarCatalogCache;
}

export async function getProfileAvatarUrl(avatarKey) {
  if (!avatarKey) return "/images/profile-avatars/nova.svg";
  const avatars = await listProfileAvatars();
  return avatars.find((avatar) => avatar.avatar_key === avatarKey)?.image_url
    || "/images/profile-avatars/nova.svg";
}

export async function listViewerProfiles(accountId) {
  if (!accountId) return [];
  const { data, error } = await supabase
    .from("viewer_profiles")
    .select("id,account_id,name,avatar_key,is_kids,created_at,updated_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getActiveViewerProfile(session) {
  const accountId = sessionUserId(session);
  if (!accountId) return null;
  const profileId = getStoredActiveViewerProfileId(accountId);
  if (!profileId) return null;

  const { data, error } = await supabase
    .from("viewer_profiles")
    .select("id,account_id,name,avatar_key,is_kids,created_at,updated_at")
    .eq("id", profileId)
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    clearActiveViewerProfile(accountId);
    return null;
  }

  return {
    ...data,
    avatar_url: await getProfileAvatarUrl(data.avatar_key),
  };
}

export async function requireActiveViewerProfile(session, { redirect = true } = {}) {
  const accountId = sessionUserId(session);
  if (!accountId) return null;
  const active = await getActiveViewerProfile(session);
  if (!active && redirect) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/profiles.html?next=${next}`);
  }
  return active;
}

export async function createViewerProfile({ accountId, name, avatarKey, isKids = false }) {
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Ingresá un nombre para el perfil.");
  if (cleanName.length > 30) throw new Error("El nombre puede tener hasta 30 caracteres.");
  if (!avatarKey) throw new Error("Elegí un avatar.");

  const { data, error } = await supabase
    .from("viewer_profiles")
    .insert({ account_id: accountId, name: cleanName, avatar_key: avatarKey, is_kids: !!isKids })
    .select("id,account_id,name,avatar_key,is_kids,created_at,updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function updateViewerProfile(profileId, patch = {}) {
  const clean = {};
  if (patch.name !== undefined) clean.name = String(patch.name || "").trim();
  if (patch.avatarKey !== undefined) clean.avatar_key = patch.avatarKey;
  if (patch.isKids !== undefined) clean.is_kids = !!patch.isKids;

  const { data, error } = await supabase
    .from("viewer_profiles")
    .update(clean)
    .eq("id", profileId)
    .select("id,account_id,name,avatar_key,is_kids,created_at,updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteViewerProfile(profileId) {
  const { error } = await supabase.from("viewer_profiles").delete().eq("id", profileId);
  if (error) throw error;
}

export function explainViewerProfileError(error) {
  const message = String(error?.message || error || "");
  const lower = message.toLowerCase();
  if (message.includes("PROFILE_LIMIT_REACHED")) return "Llegaste al máximo de 10 perfiles.";
  if (lower.includes("viewer_profiles_account_name_uidx") || lower.includes("duplicate key")) {
    return "Ya existe un perfil con ese nombre.";
  }
  if (lower.includes("row-level security") || lower.includes("permission")) {
    return "Supabase rechazó la operación. Ejecutá profiles_setup.sql completo.";
  }
  return message || "No se pudo guardar el perfil.";
}
