import { supabase } from "./supabaseClient.js";
import { profilePickerUrl } from "./navigation.js?v=20261009-copas-10";

const ACTIVE_PREFIX = "satv_active_viewer_profile";
export const DEFAULT_PROFILE_AVATAR = "/images/profile-avatars/avatar-01.png";
export const VIEWER_PROFILE_PHOTOS_BUCKET = "viewer-profile-photos";

const SELECTED_PREFIX = "satv_selected_viewer_profile_v1";
const AVATAR_CACHE_KEY = "satv_profile_avatars_v1";
const AVATAR_CACHE_TTL = 5 * 60 * 1000;
let __avatarCatalogCache = null;
let __avatarCatalogExpiresAt = 0;
let __avatarCatalogPromise = null;
let __activeProfileCache = null;
let __activeProfilePromise = null;
let __activeProfileGeneration = 0;

function invalidateActiveProfileCache() {
  __activeProfileGeneration++;
  __activeProfileCache = null;
  __activeProfilePromise = null;
}

function selectedKey(accountId) {
  return `${SELECTED_PREFIX}:${accountId}`;
}

function sessionUserId(session) {
  return session?.user?.id || session?.session?.user?.id || null;
}

function activeKey(accountId) {
  return `${ACTIVE_PREFIX}:${accountId}`;
}

function cleanString(value) {
  const text = String(value || "").trim();
  return text || null;
}

function isAllowedAvatarFile(file) {
  const type = String(file?.type || "").toLowerCase();
  return ["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(type);
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

function fileExtension(file) {
  const explicit = String(file?.name || "").split(".").pop()?.toLowerCase();
  if (explicit && ["png", "jpg", "jpeg", "webp"].includes(explicit)) return explicit === "jpg" ? "jpeg" : explicit;
  const type = String(file?.type || "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpeg";
  if (type.includes("webp")) return "webp";
  return "png";
}

function extractStoragePathFromPublicUrl(url) {
  if (!url || typeof url !== "string") return null;
  const marker = `/storage/v1/object/public/${VIEWER_PROFILE_PHOTOS_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx !== -1) return decodeURIComponent(url.slice(idx + marker.length));

  const bucketMarker = `/${VIEWER_PROFILE_PHOTOS_BUCKET}/`;
  const idx2 = url.indexOf(bucketMarker);
  if (idx2 !== -1) return decodeURIComponent(url.slice(idx2 + bucketMarker.length));
  return null;
}

export function clearActiveViewerProfile(accountId) {
  invalidateActiveProfileCache();
  if (!accountId) return;
  try { sessionStorage.removeItem(selectedKey(accountId)); } catch (_) {}
  try { localStorage.removeItem(activeKey(accountId)); } catch (_) {}
}

// Sólo la elección explícita en el selector habilita esta visita.
export function setActiveViewerProfile(accountId, profileId) {
  if (!accountId || !profileId) return;
  try {
    sessionStorage.setItem(selectedKey(accountId), String(profileId));
  } catch (_) {
    throw new Error("Permití el almacenamiento de esta pestaña para elegir tu perfil.");
  }
  try { localStorage.setItem(activeKey(accountId), String(profileId)); } catch (_) {}
  invalidateActiveProfileCache();
}

export function getStoredActiveViewerProfileId(accountId) {
  if (!accountId) return null;
  try { return sessionStorage.getItem(selectedKey(accountId)); } catch (_) { return null; }
}

export async function listProfileAvatars({ force = false } = {}) {
  if (!force && Array.isArray(__avatarCatalogCache) && Date.now() < __avatarCatalogExpiresAt) return __avatarCatalogCache;
  if (__avatarCatalogPromise) return __avatarCatalogPromise;
  if (!force) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(AVATAR_CACHE_KEY) || 'null');
      if (Array.isArray(saved?.items) && Date.now() - saved.ts < AVATAR_CACHE_TTL && saved.ts <= Date.now()) {
        __avatarCatalogCache = saved.items;
        __avatarCatalogExpiresAt = saved.ts + AVATAR_CACHE_TTL;
        return __avatarCatalogCache;
      }
    } catch (_) {}
  }
  const promise = (async () => {
    const { data, error } = await supabase
      .from("profile_avatars")
      .select("avatar_key,label,image_url,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    __avatarCatalogCache = data || [];
    const ts = Date.now();
    __avatarCatalogExpiresAt = ts + AVATAR_CACHE_TTL;
    try { sessionStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify({ ts, items: __avatarCatalogCache })); } catch (_) {}
    return __avatarCatalogCache;
  })();
  __avatarCatalogPromise = promise;
  try { return await promise; }
  finally { if (__avatarCatalogPromise === promise) __avatarCatalogPromise = null; }
}

export async function getProfileAvatarUrl(avatarKey) {
  if (!avatarKey) return DEFAULT_PROFILE_AVATAR;
  const avatars = await listProfileAvatars();
  return avatars.find((avatar) => avatar.avatar_key === avatarKey)?.image_url || DEFAULT_PROFILE_AVATAR;
}

export async function resolveViewerProfileAvatar(profile, avatars = null) {
  if (!profile) return DEFAULT_PROFILE_AVATAR;
  if (cleanString(profile.custom_avatar_url)) return cleanString(profile.custom_avatar_url);
  if (avatars) {
    return avatars.find((avatar) => avatar.avatar_key === profile.avatar_key)?.image_url || DEFAULT_PROFILE_AVATAR;
  }
  return getProfileAvatarUrl(profile.avatar_key);
}

function decorateProfiles(rows, avatars = []) {
  return (rows || []).map((row) => ({
    ...row,
    avatar_url: cleanString(row.custom_avatar_url)
      || avatars.find((avatar) => avatar.avatar_key === row.avatar_key)?.image_url
      || DEFAULT_PROFILE_AVATAR,
  }));
}

export async function listViewerProfiles(accountId) {
  if (!accountId) return [];
  const [avatars, { data, error }] = await Promise.all([
    listProfileAvatars(),
    supabase
      .from("viewer_profiles")
      .select("id,account_id,name,avatar_key,custom_avatar_url,is_kids,created_at,updated_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true }),
  ]);

  if (error) throw error;
  return decorateProfiles(data, avatars);
}

export async function getActiveViewerProfile(session, { force = false } = {}) {
  if (force) invalidateActiveProfileCache();
  const accountId = sessionUserId(session);
  if (!accountId) return null;
  const profileId = getStoredActiveViewerProfileId(accountId);
  if (!profileId) return null;
  const key = `${accountId}:${profileId}`;
  const generation = __activeProfileGeneration;
  if (__activeProfileCache?.key === key && Date.now() < __activeProfileCache.expiresAt) return __activeProfileCache.profile;
  if (__activeProfilePromise?.key === key && __activeProfilePromise.generation === generation) return __activeProfilePromise.promise;

  const promise = (async () => {
    const { data, error } = await supabase
      .from("viewer_profiles")
      .select("id,account_id,name,avatar_key,custom_avatar_url,is_kids,created_at,updated_at")
      .eq("id", profileId)
      .eq("account_id", accountId)
      .maybeSingle();
    if (error) throw error;
    if (generation !== __activeProfileGeneration || getStoredActiveViewerProfileId(accountId) !== profileId) return null;
    if (!data || data.id !== profileId || data.account_id !== accountId) {
      clearActiveViewerProfile(accountId);
      return null;
    }
    let avatarUrl = DEFAULT_PROFILE_AVATAR;
    try { avatarUrl = await resolveViewerProfileAvatar(data); }
    catch (error) { console.warn('[profiles] no se pudo cargar el avatar:', error); }
    if (generation !== __activeProfileGeneration || getStoredActiveViewerProfileId(accountId) !== profileId) return null;
    const profile = { ...data, avatar_url: avatarUrl };
    // Sólo se comparte dentro de la página; cada navegación verifica de nuevo.
    __activeProfileCache = { key, profile, expiresAt: Date.now() + 30000 };
    return profile;
  })();
  __activeProfilePromise = { key, generation, promise };
  try { return await promise; }
  finally { if (__activeProfilePromise?.promise === promise) __activeProfilePromise = null; }
}

export async function requireActiveViewerProfile(session, { redirect = true, force = false } = {}) {
  if (!sessionUserId(session)) return null;
  const active = await getActiveViewerProfile(session, { force });
  if (!active && redirect) window.location.replace(profilePickerUrl());
  return active;
}

export async function createViewerProfile({ accountId, name, avatarKey, isKids = false, customAvatarUrl = null }) {
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Ingresá un nombre para el perfil.");
  if (cleanName.length > 30) throw new Error("El nombre puede tener hasta 30 caracteres.");
  if (!avatarKey) throw new Error("Elegí un avatar.");

  const { data, error } = await supabase
    .from("viewer_profiles")
    .insert({
      account_id: accountId,
      name: cleanName,
      avatar_key: avatarKey,
      custom_avatar_url: cleanString(customAvatarUrl),
      is_kids: !!isKids,
    })
    .select("id,account_id,name,avatar_key,custom_avatar_url,is_kids,created_at,updated_at")
    .single();
  if (error) throw error;

  return {
    ...data,
    avatar_url: await resolveViewerProfileAvatar(data),
  };
}

export async function updateViewerProfile(profileId, patch = {}) {
  const clean = {};
  if (patch.name !== undefined) clean.name = String(patch.name || "").trim();
  if (patch.avatarKey !== undefined) clean.avatar_key = patch.avatarKey;
  if (patch.isKids !== undefined) clean.is_kids = !!patch.isKids;
  if (patch.customAvatarUrl !== undefined) clean.custom_avatar_url = cleanString(patch.customAvatarUrl);

  const { data, error } = await supabase
    .from("viewer_profiles")
    .update(clean)
    .eq("id", profileId)
    .select("id,account_id,name,avatar_key,custom_avatar_url,is_kids,created_at,updated_at")
    .single();
  if (error) throw error;
  invalidateActiveProfileCache();

  return {
    ...data,
    avatar_url: await resolveViewerProfileAvatar(data),
  };
}

export async function uploadViewerProfileCustomAvatar({ accountId, profileId, file, previousUrl = null }) {
  if (!accountId || !profileId) throw new Error("No se pudo identificar el perfil.");
  if (!file) throw new Error("Elegí una imagen para subir.");
  if (!isAllowedAvatarFile(file)) {
    throw new Error("La foto debe ser PNG, JPG o WEBP.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("La foto pesa demasiado. Máximo 5 MB.");
  }

  const ext = fileExtension(file);
  const path = `${accountId}/${profileId}/${Date.now()}-${randomSuffix()}.${ext}`;

  const { error: uploadError } = await supabase
    .storage
    .from(VIEWER_PROFILE_PHOTOS_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || `image/${ext}`,
    });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(VIEWER_PROFILE_PHOTOS_BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl;
  if (!publicUrl) throw new Error("Supabase no devolvió la URL pública de la foto.");

  await updateViewerProfile(profileId, { customAvatarUrl: publicUrl });

  const previousPath = extractStoragePathFromPublicUrl(previousUrl);
  if (previousPath && previousPath !== path) {
    try {
      await supabase.storage.from(VIEWER_PROFILE_PHOTOS_BUCKET).remove([previousPath]);
    } catch (_) {}
  }

  return publicUrl;
}

export async function deleteViewerProfile(profileOrId) {
  let profileId = typeof profileOrId === "string" ? profileOrId : profileOrId?.id;
  const customUrl = typeof profileOrId === "object" ? cleanString(profileOrId?.custom_avatar_url) : null;
  if (!profileId) throw new Error("Perfil inválido.");

  const { error } = await supabase.from("viewer_profiles").delete().eq("id", profileId);
  if (error) throw error;
  invalidateActiveProfileCache();
  const accountId = typeof profileOrId === 'object' ? profileOrId?.account_id : null;
  if (accountId && getStoredActiveViewerProfileId(accountId) === profileId) clearActiveViewerProfile(accountId);

  const oldPath = extractStoragePathFromPublicUrl(customUrl);
  if (oldPath) {
    try {
      await supabase.storage.from(VIEWER_PROFILE_PHOTOS_BUCKET).remove([oldPath]);
    } catch (_) {}
  }
}

export function explainViewerProfileError(error) {
  const message = String(error?.message || error || "");
  const lower = message.toLowerCase();
  if (message.includes("PROFILE_LIMIT_REACHED")) return "Llegaste al máximo de 10 perfiles.";
  if (lower.includes("viewer_profiles_account_name_uidx") || lower.includes("duplicate key")) {
    return "Ya existe un perfil con ese nombre.";
  }
  if (lower.includes("row-level security") || lower.includes("permission")) {
    return "Supabase rechazó la operación. Ejecutá el SQL de perfiles completo, incluyendo Storage.";
  }
  if (lower.includes("mime") || lower.includes("file type")) return "La foto debe ser PNG, JPG o WEBP.";
  if (lower.includes("payload too large") || lower.includes("entity too large")) return "La foto es demasiado pesada.";
  return message || "No se pudo guardar el perfil.";
}
