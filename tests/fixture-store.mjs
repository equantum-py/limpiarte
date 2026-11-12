// Local QA only. Never imported by the deployed API and never copied into dist/.
import { randomUUID } from "node:crypto";
import { fixture } from "./helpers.mjs";
import { createHandler } from "../lib/server/handler.mjs";
import { InputError } from "../lib/quote-engine.mjs";
export function fixtureHandler() {
  if (process.env.VERCEL || process.env.NODE_ENV === "production")
    throw Error("Local fixtures forbidden in production");
  const rows = new Map(),
    limits = new Map(),
    v = { id: "11111111-1111-4111-8111-111111111111", config: fixture() };
  return createHandler({
    env: {
      APP_ORIGIN: "http://127.0.0.1:4173",
      QUOTE_SIGNING_SECRET: randomUUID(),
      RATE_LIMIT_HASH_SECRET: randomUUID(),
    },
    getStore: () => ({
      publicAuth: { url: "", key: "" },
      current: async () => v,
      limit: async (k, max) => {
        const count = (limits.get(k) || 0) + 1;
        limits.set(k, count);
        return count <= max;
      },
      existing: async (k) => rows.get(k),
      insert: async (r) => {
        const saved = { ...r, id: randomUUID(), state: "Nueva" };
        rows.set(r.idempotency_hash, saved);
        return saved;
      },
      admin: async () => {
        throw new InputError("FORBIDDEN", 403);
      },
    }),
  });
}
