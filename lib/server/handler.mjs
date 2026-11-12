import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  estimate,
  publicCatalog,
  validateConfig,
  validateContact,
  InputError,
  STATES,
  integer,
} from "../quote-engine.mjs";
import { defaultConfig } from "../default-config.mjs";
const hash = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
const uuid = (x) =>
  typeof x === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    x,
  );
export function createHandler({
  getStore,
  env = process.env,
  now = () => Date.now(),
}) {
  const mac = (x) =>
    createHmac("sha256", env.QUOTE_SIGNING_SECRET)
      .update(x)
      .digest("base64url");
  const sign = (x) => {
    const s = Buffer.from(JSON.stringify(x)).toString("base64url");
    return s + "." + mac(s);
  };
  const verify = (t) => {
    if (typeof t !== "string" || t.length > 12000)
      throw new InputError("INVALID_QUOTE_TOKEN");
    const [s, m, ...rest] = t.split(".");
    const a = Buffer.from(m || ""),
      b = Buffer.from(mac(s || ""));
    if (rest.length || a.length !== b.length || !timingSafeEqual(a, b))
      throw new InputError("INVALID_QUOTE_TOKEN");
    let p;
    try {
      p = JSON.parse(Buffer.from(s, "base64url"));
    } catch {
      throw new InputError("INVALID_QUOTE_TOKEN");
    }
    if (!p.exp || p.exp < now()) throw new InputError("QUOTE_EXPIRED", 409);
    return p;
  };
  return async function handle(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, data) => {
      res.statusCode = status;
      res.end(JSON.stringify(data));
    };
    try {
      const action =
        new URL(req.url, "http://local").searchParams.get("action") ||
        "catalog";
      const read = ["catalog", "auth", "admin-config", "requests"].includes(
        action,
      );
      if (req.method !== (read ? "GET" : "POST"))
        return send(405, { error: "METHOD_NOT_ALLOWED" });
      if (!read && req.headers.origin !== env.APP_ORIGIN)
        throw new InputError("ORIGIN_REJECTED", 403);
      let body = {};
      if (!read) {
        if (
          !String(req.headers["content-type"] || "").startsWith(
            "application/json",
          )
        )
          throw new InputError("JSON_REQUIRED", 415);
        if (Number(req.headers["content-length"] || 0) > 48000)
          throw new InputError("BODY_TOO_LARGE", 413);
        if (req.body !== undefined) {
          body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        } else {
          let raw = "";
          for await (const c of req) {
            raw += c;
            if (Buffer.byteLength(raw) > 48000)
              throw new InputError("BODY_TOO_LARGE", 413);
          }
          body = JSON.parse(raw);
        }
        if (
          !body ||
          typeof body !== "object" ||
          Array.isArray(body) ||
          Buffer.byteLength(JSON.stringify(body)) > 48000
        )
          throw new InputError("INVALID_BODY");
      }
      const store = await getStore();
      if (action === "auth") return send(200, store.publicAuth);
      if (["admin-config", "publish", "requests", "status"].includes(action)) {
        const token = String(req.headers.authorization || "").match(
          /^Bearer ([A-Za-z0-9_.-]+)$/,
        )?.[1];
        if (!token) throw new InputError("UNAUTHORIZED", 401);
        const admin = await store.admin(token);
        if (action === "admin-config") {
          const v = await admin.current();
          return send(200, {
            id: v?.id || null,
            config: v?.config || defaultConfig,
          });
        }
        if (action === "publish") {
          validateConfig(body.config);
          if (body.expected !== null && !uuid(body.expected))
            throw new InputError("INVALID_VERSION");
          return send(200, {
            id: await admin.publish(body.config, body.expected),
          });
        }
        if (action === "requests")
          return send(200, { requests: await admin.requests() });
        if (!uuid(body.id) || !STATES.includes(body.state))
          throw new InputError("INVALID_STATE");
        integer(body.revision, 1, 1000000);
        return send(
          200,
          await admin.status(body.id, body.revision, body.state),
        );
      }
      if (!["catalog", "estimate", "request"].includes(action))
        throw new InputError("UNKNOWN_ACTION", 404);
      // Only Vercel's overwritten header is trusted there. Local server uses its socket, never browser X-Forwarded-For.
      const ip = env.VERCEL
        ? String(req.headers["x-vercel-forwarded-for"] || "unknown").split(
            ",",
          )[0]
        : req.socket?.remoteAddress || "unknown";
      const key = createHmac("sha256", env.RATE_LIMIT_HASH_SECRET)
        .update(`${action}:${ip}:${Math.floor(now() / 3600000)}`)
        .digest("hex");
      if (!(await store.limit(key, action === "request" ? 10 : 120)))
        throw new InputError("RATE_LIMITED", 429);
      if (action === "catalog") {
        const v = await store.current();
        return send(
          200,
          v
            ? publicCatalog(v.config)
            : {
                services: [],
                cities: [],
                conditions: "",
                whatsapp: "595994837779",
              },
        );
      }
      if (action === "estimate") {
        const v = await store.current();
        if (!v) throw new InputError("TARIFF_NOT_APPROVED", 503);
        const q = estimate(v.config, body);
        return send(200, {
          quote: q,
          token: sign({
            input: q.input,
            version: v.id,
            exp: now() + 15 * 60000,
          }),
        });
      }
      if (!uuid(body.idempotencyKey))
        throw new InputError("INVALID_IDEMPOTENCY_KEY");
      const contact = validateContact(body.contact),
        p = verify(body.token);
      const idempotency_hash = hash(body.idempotencyKey),
        payload_hash = hash({ input: p.input, version: p.version, contact });
      let saved = await store.existing(idempotency_hash);
      if (!saved) {
        const v = await store.current();
        if (v?.id !== p.version) throw new InputError("TARIFF_CHANGED", 409);
        const q = estimate(v.config, p.input);
        saved = await store.insert({
          version_id: v.id,
          idempotency_hash,
          payload_hash,
          snapshot: q,
          contact,
          expires_at: new Date(now() + q.validityDays * 86400000).toISOString(),
        });
      }
      if (saved.payload_hash !== payload_hash)
        throw new InputError("IDEMPOTENCY_CONFLICT", 409);
      const q = saved.snapshot;
      const money = (n) =>
        n === null
          ? "A confirmar"
          : `${Math.round(n).toLocaleString("es-PY")} Gs.`;
      const message = `Hola Limpiarte. Solicitud ${saved.id}\nServicio: ${q.service.name}\nCiudad: ${q.input.city}\nDirección: ${q.input.address}\nDetalle: ${q.input.details}\nServicio estimado: ${money(q.serviceNet)}\nTraslado: ${money(q.transport.price)}\nTotal orientativo: ${money(q.total)}\n${q.conditions}\nVigencia hasta: ${saved.expires_at.slice(0, 10)}\nNombre: ${contact.name}\nTeléfono: ${contact.phone}`;
      return send(200, {
        id: saved.id,
        state: saved.state,
        expiresAt: saved.expires_at,
        quote: q,
        whatsappUrl: `https://wa.me/${q.whatsapp}?text=${encodeURIComponent(message)}`,
      });
    } catch (e) {
      return send(
        e instanceof InputError
          ? e.status
          : e instanceof SyntaxError
            ? 400
            : 500,
        {
          error:
            e instanceof InputError
              ? e.code
              : e instanceof SyntaxError
                ? "INVALID_JSON"
                : "INTERNAL_ERROR",
        },
      );
    }
  };
}
