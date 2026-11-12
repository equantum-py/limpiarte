import { validateConfig } from "../lib/quote-engine.mjs";
import { estimate } from "../lib/quote-engine.mjs";
import { defaultConfig } from "../lib/default-config.mjs";
export const KEY = "limpiarte-presentacion-v1";
export function initialConfig() {
  const c = structuredClone(defaultConfig);
  c.commercial.approved = true;
  c.commercial.conditions =
    "Estimación ilustrativa, sujeta a evaluación del espacio y confirmación de disponibilidad. No constituye una contratación.";
  c.services = c.services.slice(0, 4);
  [3500, 3000, 5000, 7000].forEach((rate, i) =>
    Object.assign(c.services[i], {
      enabled: true,
      approved: true,
      rate,
      minimum: [180000, 160000, 250000, 350000][i],
      extras: [
        { id: "vidrios", name: "Limpieza de vidrios interiores", price: 50000 },
      ],
      method: i === 3 ? "manual" : "area",
    }),
  );
  c.transport.cities[0].approved = true;
  return c;
}
export function seed(c) {
  return [
    ["Empresa Horizonte", "oficinas", 120, "Luque", null, "Nueva"],
    ["Oficinas del Centro", "profunda", 80, "Asunción", 10, "Contactada"],
    [
      "Comercio Los Jardines",
      "residencial",
      100,
      "San Lorenzo",
      25,
      "Cotizada",
    ],
  ].map(([name, serviceId, quantity, city, km, state], i) => ({
    id: "LMP-" + String(1001 + i),
    createdAt: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
    name,
    phone: "No proporcionado",
    quote: estimate(
      c,
      {
        serviceId,
        quantity,
        city,
        extraIds: [],
        details: "Solicitud ficticia para mostrar el funcionamiento.",
        address: "",
      },
      km ? { verified: true, city, distanceMeters: km * 1000 } : null,
    ),
    state,
    version: 1,
    history: [{ state, at: new Date().toISOString() }],
  }));
}

export function readState() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null");
    if (value) {
      validateConfig(value.config);
      if (
        !Array.isArray(value.requests) ||
        value.requests.length > 200 ||
        !Number.isInteger(value.version)
      )
        throw Error();
      return value;
    }
  } catch {}
  const config = initialConfig();
  return { config, requests: seed(config), version: 1 };
}
export function writeState(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
