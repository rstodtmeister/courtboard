import { createClient } from "npm:@supabase/supabase-js@2";

function secretKey(): string {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) {
    return legacyKey;
  }

  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    return JSON.parse(secretKeys).default;
  }

  throw new Error("Missing Supabase service role key");
}

export function createAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createUserClient(req: Request) {
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")
    ?? JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default;

  if (!publishableKey) {
    throw new Error("Missing Supabase publishable key");
  }

  return createClient(Deno.env.get("SUPABASE_URL")!, publishableKey, {
    global: {
      headers: {
        Authorization: req.headers.get("Authorization") ?? "",
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
