import { defaultConfig } from "../lib/default-config.mjs";
export function fixture() {
  const c = structuredClone(defaultConfig);
  c.commercial.approved = true;
  c.services[0] = {
    ...c.services[0],
    enabled: true,
    approved: true,
    base: 10000,
    rate: 3000,
    minimum: 160000,
    extras: [{ id: "vidrios", name: "Vidrios", price: 50000 }],
  };
  c.transport.cities[0].approved = true;
  return c;
}
