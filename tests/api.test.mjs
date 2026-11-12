import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../lib/server/handler.mjs";
import { createStore } from "../lib/server/store.mjs";
import { fixture } from "./helpers.mjs";
import { InputError } from "../lib/quote-engine.mjs";
const env = {
  APP_ORIGIN: "https://limpiarte.example",
  QUOTE_SIGNING_SECRET: "a".repeat(40),
  RATE_LIMIT_HASH_SECRET: "b".repeat(40),
};
const v = "11111111-1111-4111-8111-111111111111",
  key = "22222222-2222-4222-8222-222222222222";
const raw = {
  serviceId: "oficinas",
  quantity: 100,
  extraIds: [],
  city: "Luque",
};
function setup() {
  let current = { id: v, config: fixture() },
    allow = true;
  const rows = new Map();
  let writes = 0;
  const store = {
    publicAuth: { url: "https://example.supabase.co", key: "public" },
    current: async () => current,
    limit: async () => allow,
    existing: async (k) => rows.get(k),
    insert: async (r) => {
      writes++;
      const saved = { ...r, id: key, state: "Nueva" };
      rows.set(r.idempotency_hash, saved);
      return saved;
    },
    admin: async () => {
      throw new InputError("FORBIDDEN", 403);
    },
  };
  const handler = createHandler({ getStore: () => store, env });
  async function call(
    action,
    body,
    headers = {},
    method = body ? "POST" : "GET",
  ) {
    const req = {
      url: "/api/cotizador?action=" + action,
      method,
      body,
      headers: {
        origin: env.APP_ORIGIN,
        "content-type": "application/json",
        ...headers,
      },
      socket: { remoteAddress: "127.0.0.1" },
    };
    let output;
    const res = {
      setHeader() {},
      end(x) {
        output = { status: this.statusCode, data: JSON.parse(x) };
      },
    };
    await handler(req, res);
    return output;
  }
  return {
    call,
    store,
    rows,
    get writes() {
      return writes;
    },
    setCurrent: (x) => (current = x),
    setAllow: (x) => (allow = x),
  };
}
test("estimate and stored request use server snapshot; double click is idempotent", async () => {
  const s = setup();
  const q = await s.call("estimate", { ...raw, total: 1 });
  assert.equal(q.status, 200);
  const body = {
    token: q.data.token,
    idempotencyKey: key,
    contact: { name: "Cliente", phone: "0994837779", consent: true },
    total: 1,
  };
  const r = await s.call("request", body);
  assert.equal(r.status, 200);
  assert.equal(r.data.quote.serviceNet, 310000);
  assert.equal(r.data.quote.total, null);
  assert.match(r.data.whatsappUrl, /^https:\/\/wa.me\/595994837779\?text=/);
  s.setCurrent({
    id: "33333333-3333-4333-8333-333333333333",
    config: fixture(),
  });
  assert.equal((await s.call("request", body)).status, 200);
  assert.equal(s.writes, 1);
  assert.equal(
    (
      await s.call("request", {
        ...body,
        contact: { name: "Otro", consent: true },
      })
    ).status,
    409,
  );
});
test("signed token tamper, new tariff, missing consent, origin abuse rejected", async () => {
  const s = setup(),
    q = await s.call("estimate", raw);
  const b = {
    token: q.data.token,
    idempotencyKey: key,
    contact: { consent: true },
  };
  assert.equal(
    (await s.call("request", { ...b, token: "X" + b.token })).status,
    400,
  );
  assert.equal(
    (await s.call("request", { ...b, contact: { consent: false } })).status,
    400,
  );
  assert.equal(
    (await s.call("request", b, { origin: "https://evil.example" })).status,
    403,
  );
  s.setCurrent({ id: key, config: fixture() });
  assert.equal((await s.call("request", b)).status, 409);
  assert.equal(s.writes, 0);
});
test("admin cannot read without auth and live membership", async () => {
  const s = setup();
  assert.equal((await s.call("requests")).status, 401);
  assert.equal(
    (
      await s.call("requests", undefined, {
        authorization: "Bearer fake.token.value",
      })
    ).status,
    403,
  );
});
test("rate limit, malformed input, wrong methods and fail-closed missing environment", async () => {
  const s = setup();
  s.setAllow(false);
  assert.equal((await s.call("estimate", raw)).status, 429);
  assert.equal((await s.call("estimate", null, {}, "GET")).status, 405);
  assert.equal((await s.call("estimate", "{")).status, 400);
  assert.throws(() => createStore({}), /NOT_CONFIGURED/);
});
