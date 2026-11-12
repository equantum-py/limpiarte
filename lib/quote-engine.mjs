export class InputError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export const STATES = [
  "Nueva",
  "Contactada",
  "Cotizada",
  "Aceptada",
  "Rechazada",
  "Finalizada",
];
export const TRANSITIONS = {
  Nueva: ["Contactada", "Rechazada"],
  Contactada: ["Cotizada", "Rechazada"],
  Cotizada: ["Aceptada", "Rechazada"],
  Aceptada: ["Finalizada", "Rechazada"],
  Rechazada: [],
  Finalizada: [],
};
const fail = (code) => {
  throw new InputError(code);
};
export function number(value, min, max, code = "INVALID_NUMBER") {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail(code);
  return value;
}
export function integer(value, min, max, code) {
  number(value, min, max, code);
  if (!Number.isInteger(value)) fail(code || "INVALID_INTEGER");
  return value;
}
export function string(value, max, required = true) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    fail("INVALID_TEXT");
  return value.trim();
}
export function normalizeCity(s) {
  return s
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
export function validateConfig(c) {
  if (
    !c ||
    typeof c !== "object" ||
    Array.isArray(c) ||
    !Array.isArray(c.services) ||
    c.services.length > 40
  )
    fail("INVALID_CONFIG");
  const seen = new Set();
  for (const s of c.services) {
    if (!s || typeof s !== "object") fail("INVALID_SERVICE");
    if (!/^[a-z0-9-]{1,60}$/.test(s.id) || seen.has(s.id))
      fail("INVALID_SERVICE_ID");
    seen.add(s.id);
    string(s.name, 120);
    if (typeof s.enabled !== "boolean" || typeof s.approved !== "boolean")
      fail("INVALID_APPROVAL");
    if (s.enabled && !s.approved) fail("UNAPPROVED_SERVICE");
    if (!["area", "unit", "fixed", "manual"].includes(s.method))
      fail("INVALID_METHOD");
    for (const k of ["base", "rate", "minimum"])
      integer(s[k], 0, 1000000000, "INVALID_RATE");
    if (!Array.isArray(s.extras) || s.extras.length > 20)
      fail("INVALID_EXTRAS");
    const ids = new Set();
    for (const e of s.extras) {
      if (!e || typeof e !== "object") fail("INVALID_EXTRA");
      if (!/^[a-z0-9-]{1,40}$/.test(e.id) || ids.has(e.id))
        fail("INVALID_EXTRA");
      ids.add(e.id);
      string(e.name, 80);
      integer(e.price, 0, 100000000, "INVALID_RATE");
    }
  }
  const x = c.commercial;
  if (!x) fail("INVALID_COMMERCIAL");
  if (!/^\d{8,15}$/.test(x.whatsapp)) fail("INVALID_WHATSAPP");
  integer(x.discountBps, 0, 5000);
  integer(x.taxBps, 0, 3000);
  if (!["included", "excluded", "none"].includes(x.taxMode))
    fail("INVALID_TAX");
  integer(x.rounding, 1, 100000);
  integer(x.validityDays, 1, 90);
  string(x.conditions, 1500);
  if (typeof x.approved !== "boolean") fail("INVALID_APPROVAL");
  const t = c.transport;
  if (
    !t ||
    !["city", "distance", "hybrid"].includes(t.mode) ||
    !Array.isArray(t.cities) ||
    t.cities.length > 100
  )
    fail("INVALID_TRANSPORT");
  string(t.origin, 240, false);
  integer(t.extraKmPrice, 0, 1000000);
  number(t.maxKm, 50, 1000);
  if (!Array.isArray(t.bands) || t.bands.length < 1 || t.bands.length > 10)
    fail("INVALID_BANDS");
  let prior = 0;
  for (const b of t.bands) {
    if (!b || typeof b !== "object") fail("INVALID_BANDS");
    number(b.upTo, prior + 0.00001, 1000);
    integer(b.price, 0, 100000000);
    prior = b.upTo;
  }
  if (t.maxKm < prior) fail("INVALID_MAX_DISTANCE");
  const cities = new Set();
  for (const city of t.cities) {
    if (!city || typeof city !== "object") fail("INVALID_CITY_RULE");
    string(city.name, 100);
    const n = normalizeCity(city.name);
    if (cities.has(n)) fail("DUPLICATE_CITY");
    cities.add(n);
    if (!["fixed", "distance", "manual", "excluded"].includes(city.rule))
      fail("INVALID_CITY_RULE");
    integer(city.price, 0, 100000000);
    if (typeof city.approved !== "boolean") fail("INVALID_APPROVAL");
  }
  return c;
}
export function publicCatalog(c) {
  validateConfig(c);
  return {
    services: c.services
      .filter((s) => s.enabled && s.approved && c.commercial.approved)
      .map((s) => ({
        id: s.id,
        name: s.name,
        method: s.method,
        extras: s.extras.map((e) => ({ id: e.id, name: e.name })),
      })),
    cities: c.transport.cities
      .filter((x) => x.rule !== "excluded")
      .map((x) => x.name),
    conditions: c.commercial.conditions,
    whatsapp: c.commercial.whatsapp,
  };
}
// Only the backend may supply trustedRoute. Browser city/coordinates/km are never evidence.
export function transportPrice(t, city, trustedRoute = null) {
  const match = t.cities.find(
    (c) => normalizeCity(c.name) === normalizeCity(city),
  );
  if (match?.rule === "excluded")
    return {
      price: null,
      status: "outside_coverage",
      reason: "La ubicación está fuera de la cobertura configurada.",
    };
  if (match?.rule === "manual")
    return {
      price: null,
      status: "manual",
      reason: "Esta ubicación requiere evaluación.",
    };
  if (!trustedRoute?.verified)
    return {
      price: null,
      status: "needs_confirmation",
      reason: "Necesitamos confirmar tu ubicación para calcular el traslado",
    };
  if (normalizeCity(trustedRoute.city) !== normalizeCity(city))
    fail("CITY_MISMATCH");
  const km =
    number(trustedRoute.distanceMeters, 0, t.maxKm * 1000 + 10000000) / 1000;
  if (km > t.maxKm)
    return {
      price: null,
      status: "manual",
      reason: "La distancia requiere evaluación.",
    };
  if (
    match?.approved &&
    match.rule === "fixed" &&
    (t.mode === "city" ||
      t.mode === "hybrid" ||
      normalizeCity(city) === "asuncion")
  )
    return {
      price: match.price,
      status: "verified",
      distanceMeters: trustedRoute.distanceMeters,
    };
  if (t.mode === "city")
    return {
      price: null,
      status: "manual",
      reason: "No hay una tarifa fija aprobada para esta ciudad.",
    };
  const band = t.bands.find((b) => km <= b.upTo);
  const last = t.bands.at(-1);
  return {
    price: Math.round(
      band ? band.price : last.price + (km - last.upTo) * t.extraKmPrice,
    ),
    status: "verified",
    distanceMeters: trustedRoute.distanceMeters,
  };
}
export function estimate(c, raw, trustedRoute = null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    fail("INVALID_INPUT");
  validateConfig(c);
  if (!c.commercial.approved) throw new InputError("TARIFF_NOT_APPROVED", 503);
  const service = c.services.find(
    (s) => s.id === raw.serviceId && s.enabled && s.approved,
  );
  if (!service) fail("SERVICE_UNAVAILABLE");
  const city = string(raw.city, 100),
    address = string(raw.address || "", 300, false),
    details = string(raw.details || "", 1500, false);
  let quantity = null;
  if (service.method === "area") quantity = number(raw.quantity, 1, 100000);
  if (service.method === "unit") quantity = integer(raw.quantity, 1, 1000);
  if (
    !Array.isArray(raw.extraIds) ||
    raw.extraIds.length > 20 ||
    new Set(raw.extraIds).size !== raw.extraIds.length
  )
    fail("INVALID_EXTRAS");
  const extras = raw.extraIds.map((id) => {
    const e = service.extras.find((x) => x.id === id);
    if (!e) fail("INVALID_EXTRA");
    return e;
  });
  const input = {
    serviceId: service.id,
    quantity,
    extraIds: extras.map((e) => e.id),
    city,
    address,
    details,
  };
  const transport = transportPrice(c.transport, city, trustedRoute);
  const manual = service.method === "manual";
  const serviceGross = manual
    ? null
    : Math.max(
        service.minimum,
        service.base +
          service.rate * (quantity ?? (service.method === "fixed" ? 0 : 1)) +
          extras.reduce((n, e) => n + e.price, 0),
      );
  if (serviceGross !== null)
    integer(serviceGross, 0, 1000000000000, "TOTAL_OUT_OF_RANGE");
  const discount = manual
    ? null
    : Math.round((serviceGross * c.commercial.discountBps) / 10000);
  const serviceNet = manual ? null : serviceGross - discount;
  const taxable =
    serviceNet === null || transport.price === null
      ? null
      : serviceNet + transport.price;
  const tax =
    taxable === null
      ? null
      : c.commercial.taxMode === "excluded"
        ? Math.round((taxable * c.commercial.taxBps) / 10000)
        : c.commercial.taxMode === "included"
          ? Math.round(
              (taxable * c.commercial.taxBps) / (10000 + c.commercial.taxBps),
            )
          : 0;
  const total =
    taxable === null
      ? null
      : Math.ceil(
          (taxable + (c.commercial.taxMode === "excluded" ? tax : 0)) /
            c.commercial.rounding,
        ) * c.commercial.rounding;
  if (total !== null) integer(total, 0, 1000000000000, "TOTAL_OUT_OF_RANGE");
  return {
    input,
    service: {
      id: service.id,
      name: service.name,
      method: service.method,
      quantity,
      extras: extras.map((e) => e.name),
    },
    serviceGross,
    discount,
    serviceNet,
    transport,
    total,
    tax,
    taxMode: c.commercial.taxMode,
    validityDays: c.commercial.validityDays,
    conditions: c.commercial.conditions,
    whatsapp: c.commercial.whatsapp,
    requiresReview: manual || transport.price === null,
  };
}
export function validateContact(c = {}) {
  if (!c || typeof c !== "object" || Array.isArray(c)) fail("INVALID_CONTACT");
  const name = string(c.name || "", 150, false),
    phone = string(c.phone || "", 30, false);
  if (phone && !/^\+?[0-9 ()-]{8,30}$/.test(phone)) fail("INVALID_PHONE");
  if (c.consent !== true) fail("CONSENT_REQUIRED");
  return { name, phone };
}
