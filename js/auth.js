import { supabase } from "./supabaseClient.js";

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function requireAuthOrRedirect({ requireProfile = true } = {}) {
  const session = await getSession();
  if (!session) {
    window.location.href = "/login.html";
    return null;
  }

  if (requireProfile) {
    const { requireActiveViewerProfile } = await import("./viewerProfiles.js");
    const activeProfile = await requireActiveViewerProfile(session, { redirect: true });
    if (!activeProfile) return null;
    session.viewerProfile = activeProfile;
  }

  return session;
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail({ email, password, full_name, username, phone }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, username, phone },
      emailRedirectTo: `${window.location.origin}/login.html`
    }
  });
  if (error) throw error;
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
      const { clearActiveViewerProfile } = await import("./viewerProfiles.js");
      clearActiveViewerProfile(accountId);
    }
  } catch (_) {}
  await supabase.auth.signOut();
}