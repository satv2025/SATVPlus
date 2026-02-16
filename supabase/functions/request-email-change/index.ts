import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const ok = new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });

  try {
    const { username, new_email, origin } = await req.json();
    if (!username || !new_email || !origin) return ok;

    // ✅ nombres correctos (NO SUPABASE_)
    const SB_URL = Deno.env.get("SB_URL");
    const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");
    if (!SB_URL || !SB_SERVICE_ROLE_KEY) return ok;

    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

    const uname = String(username).toLowerCase().trim();
    const newEmail = String(new_email).toLowerCase().trim();

    // 1) Buscar UUID por username en profiles
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("username", uname)
      .maybeSingle();

    if (!profile?.id) return ok;
    const uid = String(profile.id);

    // 2) Email real del usuario desde auth.users
    const { data: userRes } = await admin.auth.admin.getUserById(uid);
    const currentEmail = userRes?.user?.email;
    if (!currentEmail) return ok;

    // 3) Magic link al email ACTUAL → redirect con uid + new
    const redirectTo =
      `${origin}/emailchange-approve.html?uid=${encodeURIComponent(uid)}&new=${encodeURIComponent(newEmail)}`;

    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: currentEmail,
      options: { redirectTo },
    });

    return ok;
  } catch {
    return ok;
  }
});