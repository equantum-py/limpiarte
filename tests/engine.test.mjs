import test from "node:test";
import assert from "node:assert/strict";
import {
  estimate,
  transportPrice,
  validateConfig,
  publicCatalog,
  validateContact,
} from "../lib/quote-engine.mjs";
import { defaultConfig } from "../lib/default-config.mjs";
import { fixture } from "./helpers.mjs";
const raw = {
  serviceId: "oficinas",
  quantity: 100,
  extraIds: [],
  city: "Luque",
  address: "Dirección de prueba",
  details: "",
};
test("unapproved baseline cannot quote or expose rates", () => {
  assert.equal(publicCatalog(defaultConfig).services.length, 0);
  assert.throws(() => estimate(defaultConfig, raw), /TARIFF_NOT_APPROVED/);
  assert.equal(
    JSON.stringify(publicCatalog(fixture())).includes("3000"),
    false,
  );
});
test("browser totals and distance cannot alter server calculation", () => {
  const q = estimate(fixture(), {
    ...raw,
    total: 1,
    rate: 1,
    verified: true,
    distanceMeters: 1,
    transport: { price: 0 },
  });
  assert.equal(q.serviceNet, 310000);
  assert.equal(q.total, null);
  assert.equal(q.transport.status, "needs_confirmation");
  assert.equal("total" in q.input, false);
});
test("distance boundaries and Asuncion override only after verified location", () => {
  const t = fixture().transport;
  for (const [m, p] of [
    [0, 200000],
    [20000, 200000],
    [20001, 250000],
    [30000, 250000],
    [30001, 350000],
    [50000, 350000],
    [51000, 355000],
  ])
    assert.equal(
      transportPrice(t, "Luque", {
        verified: true,
        city: "Luque",
        distanceMeters: m,
      }).price,
      p,
    );
  assert.equal(transportPrice(t, "Asunción").price, null);
  assert.equal(
    transportPrice(t, "Asunción", {
      verified: true,
      city: "Asunción",
      distanceMeters: 20000,
    }).price,
    120000,
  );
  assert.throws(
    () =>
      transportPrice(t, "Luque", {
        verified: true,
        city: "Asunción",
        distanceMeters: 1000,
      }),
    /CITY_MISMATCH/,
  );
  assert.equal(
    transportPrice(t, "Luque", {
      verified: true,
      city: "Luque",
      distanceMeters: 100001,
    }).price,
    null,
  );
});
test("minimum extras discount tax rounding applied in defined order", () => {
  const c = fixture();
  c.commercial.discountBps = 1000;
  c.commercial.taxBps = 1000;
  c.commercial.taxMode = "excluded";
  const q = estimate(
    c,
    { ...raw, quantity: 1, extraIds: ["vidrios"] },
    { verified: true, city: "Luque", distanceMeters: 10000 },
  );
  assert.equal(q.serviceGross, 160000);
  assert.equal(q.serviceNet, 144000);
  assert.equal(q.tax, 34400);
  assert.equal(q.total, 378400);
  c.commercial.taxMode = "included";
  assert.equal(
    estimate(c, raw, { verified: true, city: "Luque", distanceMeters: 1000 })
      .total,
    479000,
  );
});
test("manual service and city/exclusions never produce a fabricated total", () => {
  const c = fixture();
  c.services[0].method = "manual";
  assert.equal(estimate(c, raw).serviceNet, null);
  c.transport.cities[1].rule = "excluded";
  assert.equal(estimate(c, raw).transport.status, "outside_coverage");
});
test("bad quantities, extras, contact, configuration rejected", () => {
  for (const q of [-1, 0, Infinity, NaN, "10", 100001])
    assert.throws(() => estimate(fixture(), { ...raw, quantity: q }));
  for (const extras of [["unknown"], ["vidrios", "vidrios"], null])
    assert.throws(() => estimate(fixture(), { ...raw, extraIds: extras }));
  assert.throws(() => validateContact({ consent: false }));
  assert.throws(() => validateContact({ phone: "abcdefghi", consent: true }));
  assert.deepEqual(validateContact({ consent: true }), { name: "", phone: "" });
  const c = fixture();
  c.transport.cities.push({ ...c.transport.cities[0], name: "Asuncion" });
  assert.throws(() => validateConfig(c), /DUPLICATE_CITY/);
});
