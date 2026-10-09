import { supabase } from "./supabaseClient.js";
import { loginUrl } from "./navigation.js?v=20261009-copas-10";
import { requireActiveViewerProfile, clearActiveViewerProfile } from "./viewerProfiles.js?v=20261009-copas-10";

let __returnGuardInstalled = false;
let __returnGuardIdentity = null;
function installProfileReturnGuard(session) {
  if (__returnGuardInstalled) return;
  __returnGuardIdentity = { accountId: session.user.id, profileId: session.viewerProfile.id };
  __returnGuardInstalled = true;
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    const root = document.documentElement;
    const previousVisibility = root.style.visibility;
    root.style.visibility = 'hidden';
    const videos = [...document.querySelectorAll('video')];
    const resumeVideos = videos.filter(video => !video.paused);
    videos.forEach(video => video.pause());
    void (async () => {
      const current = await getSession();
      if (!current) { window.location.replace(loginUrl()); return; }
      const profile = await requireActiveViewerProfile(current, { redirect: true, force: true });
      if (!profile) return;
      if (current.user.id !== __returnGuardIdentity.accountId || profile.id !== __returnGuardIdentity.profileId) {
        window.location.reload();
        return;
      }
      root.style.visibility = previousVisibility;
      resumeVideos.forEach(video => { void video.play().catch(() => {}); });
    })().catch(error => {
      console.warn('[auth] no se pudo validar el perfil al volver:', error);
      window.location.reload();
    });
  });
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function requireAuthOrRedirect({ requireProfile = true } = {}) {
  const session = await getSession();
  if (!session) {
    window.location.replace(loginUrl());
    return null;
  }

  if (requireProfile) {
    const activeProfile = await requireActiveViewerProfile(session, { redirect: true });
    if (!activeProfile) return null;
    const verifiedSession = { ...session, viewerProfile: activeProfile };
    installProfileReturnGuard(verifiedSession);
    return verifiedSession;
  }

  return session;
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  clearActiveViewerProfile(data?.user?.id || data?.session?.user?.id);
  return data;
}

export async function signUpWithEmail({ email, password, full_name, username, phone }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, username, phone },
      emailRedirectTo: `${window.location.origin}/login`
    }
  });
  if (error) throw error;
  clearActiveViewerProfile(data?.user?.id || data?.session?.user?.id);
  return data;
}

// ✅ AGREGÁ ESTO
export async function sendRecoveryEmail(email) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/recovery-pass.html`,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  try {
    const { data } = await supabase.auth.getSession();
    const accountId = data?.session?.user?.id;
    if (accountId) {
      clearActiveViewerProfile(accountId);
    }
  } catch (_) {}
  await supabase.auth.signOut();
}