// Proposed values only. Nothing is published or sold until an owner explicitly approves.
export const defaultConfig = {
  services: [
    ["oficinas", "Limpieza de oficinas y comercios", "area"],
    ["residencial", "Limpieza residencial habitual", "area"],
    ["profunda", "Limpieza profunda", "area"],
    ["postobra", "Limpieza postobra", "manual"],
    ["terrenos", "Limpieza de terrenos y exteriores", "manual"],
    ["piscinas", "Limpieza de piscinas", "manual"],
    ["techos", "Limpieza de techos y canaletas", "manual"],
    ["fumigacion", "Fumigación", "manual"],
  ].map(([id, name, method]) => ({
    id,
    name,
    method,
    enabled: false,
    approved: false,
    base: 0,
    rate: 0,
    minimum: 0,
    extras: [],
  })),
  commercial: {
    approved: false,
    whatsapp: "595994652377",
    discountBps: 0,
    taxBps: 0,
    taxMode: "none",
    rounding: 100,
    validityDays: 7,
    conditions:
      "Este presupuesto es orientativo y está sujeto a confirmación según las condiciones del lugar y la disponibilidad del servicio.",
  },
  transport: {
    mode: "hybrid",
    origin: "",
    bands: [
      { upTo: 20, price: 200000 },
      { upTo: 30, price: 250000 },
      { upTo: 50, price: 350000 },
    ],
    extraKmPrice: 5000,
    maxKm: 100,
    cities: [
      { name: "Asunción", rule: "fixed", price: 120000, approved: false },
      { name: "Luque", rule: "distance", price: 200000, approved: false },
      { name: "San Lorenzo", rule: "distance", price: 200000, approved: false },
    ],
  },
};
