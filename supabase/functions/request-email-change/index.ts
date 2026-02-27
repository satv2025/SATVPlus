import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set<string>([
  "https://satvplus.com.ar",
  "https://www.satvplus.com.ar",
  "http://localhost:5173",
  "http://localhost:5500",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const o = origin ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(o) ? o : "https://satvplus.com.ar";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-debug",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type RequestBody = {
  username?: string;
  password?: string;
  new_email?: string;
  origin?: string;
};

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  // Preflight SIEMPRE
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...cors,
  };

  // Respuesta neutra (anti-enumeración)
  const ok = (extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ ok: true, ...extra }), {
      status: 200,
      headers,
    });

  const debugOn = req.headers.get("x-debug") === "1";
  const debug: Record<string, unknown> = { debugOn };

  try {
    if (req.method !== "POST") return ok();

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    debug.bodyReceived = Boolean(body);

    const usernameRaw = typeof body?.username === "string" ? body.username : "";
    const passwordRaw = typeof body?.password === "string" ? body.password : "";
    const newEmailRaw = typeof body?.new_email === "string" ? body.new_email : "";
    const bodyOriginRaw = typeof body?.origin === "string" ? body.origin : "";

    const username = usernameRaw.trim().toLowerCase();
    const password = passwordRaw;
    const newEmail = newEmailRaw.trim().toLowerCase();
    const bodyOrigin = bodyOriginRaw.trim();

    if (!username || !password || !newEmail || !bodyOrigin) {
      debug.missing = true;
      return debugOn ? ok({ debug }) : ok();
    }

    if (!isValidEmail(newEmail)) {
      debug.invalidEmail = true;
      return debugOn ? ok({ debug }) : ok();
    }

    const SB_URL =
      Deno.env.get("SB_URL") ??
      Deno.env.get("SUPABASE_URL");

    const SB_SERVICE_ROLE_KEY =
      Deno.env.get("SB_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const SB_ANON_KEY =
      Deno.env.get("SB_ANON_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY");

    debug.hasSBURL = Boolean(SB_URL);
    debug.hasSRK = Boolean(SB_SERVICE_ROLE_KEY);
    debug.hasAnon = Boolean(SB_ANON_KEY);

    if (!SB_URL || !SB_SERVICE_ROLE_KEY || !SB_ANON_KEY) {
      debug.envMissing = true;
      return debugOn ? ok({ debug }) : ok();
    }

    const safeOrigin = ALLOWED_ORIGINS.has(bodyOrigin)
      ? bodyOrigin
      : "https://satvplus.com.ar";

    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) Buscar UUID por username en profiles (case-insensitive)
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("id, username")
      .ilike("username", username)
      .limit(1)
      .maybeSingle();

    debug.profileFound = Boolean(profile?.id);
    debug.profileError = profErr?.message ?? null;

    if (profErr || !profile?.id) {
      return debugOn ? ok({ debug }) : ok();
    }

    // 2) Email actual desde auth.users (source of truth del login)
    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(String(profile.id));
    const currentEmail = userRes?.user?.email?.toLowerCase?.() ?? null;

    debug.currentEmailFound = Boolean(currentEmail);
    debug.userErr = userErr?.message ?? null;

    if (userErr || !currentEmail) {
      return debugOn ? ok({ debug }) : ok();
    }

    if (currentEmail === newEmail) {
      debug.sameEmail = true;
      return debugOn ? ok({ debug }) : ok();
    }

    // 3) Login con password del usuario (anon client) para iniciar flujo de cambio de email
    const client = createClient(SB_URL, SB_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: signInData, error: signInErr } = await client.auth.signInWithPassword({
      email: currentEmail,
      password,
    });

    debug.signInOk = Boolean(signInData?.session);
    debug.signInErr = signInErr?.message ?? null;

    if (signInErr || !signInData?.session) {
      return debugOn ? ok({ debug }) : ok();
    }

    // 4) Disparar cambio de email con redirect a tu página de aprobación
    const approveUrl = new URL("/emailchange-approve.html", safeOrigin);
    approveUrl.searchParams.set("uid", String(profile.id));
    approveUrl.searchParams.set("new", newEmail);

    const { error: updErr } = await client.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: approveUrl.toString() }
    );

    debug.did_update_email_request = !updErr;
    debug.updateErr = updErr?.message ?? null;
    debug.redirectTo = approveUrl.toString();

    return debugOn ? ok({ debug }) : ok();

  } catch (e) {
    debug.exception = String((e as Error)?.message || e);
    return debugOn ? ok({ debug }) : ok();
  }
});