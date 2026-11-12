import { createClient } from "@supabase/supabase-js";
import { InputError } from "../quote-engine.mjs";
export function createStore(env = process.env) {
  for (const key of [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "QUOTE_SIGNING_SECRET",
    "RATE_LIMIT_HASH_SECRET",
    "APP_ORIGIN",
  ])
    if (!env[key]) throw new InputError("NOT_CONFIGURED", 503);
  if (
    env.QUOTE_SIGNING_SECRET.length < 32 ||
    env.RATE_LIMIT_HASH_SECRET.length < 32
  )
    throw new InputError("NOT_CONFIGURED", 503);
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, opts);
  const check = ({ data, error }) => {
    if (error) throw new InputError("DATABASE_UNAVAILABLE", 503);
    return data;
  };
  return {
    publicAuth: { url: env.SUPABASE_URL, key: env.SUPABASE_PUBLISHABLE_KEY },
    async current() {
      const s = check(
        await db
          .from("quote_settings")
          .select("version_id")
          .eq("id", 1)
          .single(),
      );
      return s.version_id ? this.version(s.version_id) : null;
    },
    async version(id) {
      return check(
        await db
          .from("quote_versions")
          .select("id,config")
          .eq("id", id)
          .single(),
      );
    },
    async limit(key, max) {
      return check(
        await db.rpc("consume_quote_limit", { p_key: key, p_limit: max }),
      );
    },
    async existing(id) {
      return check(
        await db
          .from("quote_requests")
          .select("id,payload_hash,snapshot,expires_at,state")
          .eq("idempotency_hash", id)
          .maybeSingle(),
      );
    },
    async insert(row) {
      const r = await db.rpc("save_quote_request", { p_row: row });
      if (r.error) throw new InputError("REQUEST_REJECTED_RETRY", 409);
      return r.data[0];
    },
    async admin(token) {
      const userdb = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_PUBLISHABLE_KEY,
        { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } },
      );
      const { data, error } = await userdb.auth.getUser(token);
      if (error || !data.user) throw new InputError("UNAUTHORIZED", 401);
      // Signature is verified by Auth above. RLS additionally verifies membership and live session on EVERY query.
      const claims = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString(),
      );
      if (claims.aal !== "aal2") throw new InputError("MFA_REQUIRED", 403);
      const allowed = await userdb
        .from("quote_settings")
        .select("version_id")
        .eq("id", 1)
        .maybeSingle();
      if (allowed.error || !allowed.data)
        throw new InputError("FORBIDDEN", 403);
      return {
        async current() {
          const s = check(
            await userdb
              .from("quote_settings")
              .select("version_id")
              .eq("id", 1)
              .single(),
          );
          return s.version_id
            ? check(
                await userdb
                  .from("quote_versions")
                  .select("id,config")
                  .eq("id", s.version_id)
                  .single(),
              )
            : null;
        },
        async publish(config, expected) {
          const r = await userdb.rpc("publish_quote_version", {
            p_config: config,
            p_expected: expected,
          });
          if (r.error) throw new InputError("PUBLISH_REJECTED", 409);
          return r.data;
        },
        async requests() {
          return check(
            await userdb
              .from("quote_requests")
              .select(
                "id,created_at,state,revision,snapshot,contact,expires_at",
              )
              .order("created_at", { ascending: false })
              .limit(100),
          );
        },
        async status(id, revision, state) {
          const r = await userdb
            .from("quote_requests")
            .update({ state })
            .eq("id", id)
            .eq("revision", revision)
            .select("id,state,revision")
            .maybeSingle();
          if (r.error || !r.data)
            throw new InputError("STATE_CONFLICT_OR_FORBIDDEN", 409);
          return r.data;
        },
      };
    },
  };
}
