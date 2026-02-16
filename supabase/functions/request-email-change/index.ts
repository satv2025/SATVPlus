import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set<string>([
  "https://satvplus.com.ar",
  "https://www.satvplus.com.ar",
  "http://localhost:5173",
  "http://localhost:5500",
]);

function corsHeaders(origin: string | null) {
  const o = origin ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(o) ? o : "https://satvplus.com.ar";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // ✅ ACÁ está la clave: incluimos x-debug
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-debug",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  // ✅ Preflight SIEMPRE
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const headers = { "Content-Type": "application/json", ...cors };

  // neutro por defecto
  const ok = (extra: unknown = {}) =>
    new Response(JSON.stringify({ ok: true, ...extra }), { status: 200, headers });

  const debugOn = req.headers.get("x-debug") === "1";
  const debug: Record<string, unknown> = { debugOn };

  try {
    if (req.method !== "POST") return ok();

    const body = await req.json().catch(() => null) as any;
    debug.bodyReceived = Boolean(body);

    const username = body?.username;
    const password = body?.password;
    const new_email = body?.new_email;
    const bodyOrigin = body?.origin;

    if (!username || !password || !new_email || !bodyOrigin) {
      debug.missing = true;
      return debugOn ? ok({ debug }) : ok();
    }

    const SB_URL = Deno.env.get("SB_URL");
    const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");
    const SB_ANON_KEY = Deno.env.get("SB_ANON_KEY");

    debug.hasSBURL = Boolean(SB_URL);
    debug.hasSRK = Boolean(SB_SERVICE_ROLE_KEY);
    debug.hasAnon = Boolean(SB_ANON_KEY);

    if (!SB_URL || !SB_SERVICE_ROLE_KEY || !SB_ANON_KEY) {
      debug.envMissing = true;
      return debugOn ? ok({ debug }) : ok();
    }

    const safeOrigin = ALLOWED_ORIGINS.has(String(bodyOrigin))
      ? String(bodyOrigin)
      : "https://satvplus.com.ar";

    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

    const uname = String(username).toLowerCase().trim();
    const newEmail = String(new_email).toLowerCase().trim();
    const pw = String(password);

    // 1) Buscar UUID por username en profiles
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("id")
      .eq("username", uname)
      .maybeSingle();

    debug.profileFound = Boolean(profile?.id);
    debug.profileError = profErr?.message;

    if (!profile?.id) return debugOn ? ok({ debug }) : ok();

    // 2) Email actual desde auth.users
    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(String(profile.id));
    const currentEmail = userRes?.user?.email;

    debug.currentEmailFound = Boolean(currentEmail);
    debug.userErr = userErr?.message;

    if (!currentEmail) return debugOn ? ok({ debug }) : ok();

    // 3) Login con password (para crear sesión) y luego updateUser => "Change email address"
    const client = createClient(SB_URL, SB_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: signInData, error: signInErr } = await client.auth.signInWithPassword({
      email: String(currentEmail).toLowerCase(),
      password: pw,
    });

    debug.signInOk = Boolean(signInData?.session);
    debug.signInErr = signInErr?.message;

    if (signInErr || !signInData?.session) return debugOn ? ok({ debug }) : ok();

    const { error: updErr } = await client.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: `${safeOrigin}/login.html` }
    );

    debug.did_update_email = !updErr;
    debug.updateErr = updErr?.message;

    return debugOn ? ok({ debug }) : ok();
  } catch (e) {
    debug.exception = String(e?.message || e);
    return debugOn ? ok({ debug }) : ok();
  }
});