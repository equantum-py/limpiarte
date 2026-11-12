import "./embed.mjs";
import { estimate, validateConfig, TRANSITIONS } from "../lib/quote-engine.mjs";
import {
  initialConfig,
  seed,
  readState,
  writeState,
  KEY,
} from "./demo-state.mjs";
const $ = (s) => document.querySelector(s),
  form = $("#demo-quote"),
  send = $("#demo-send"),
  rates = $("#demo-rates");

const money = (n) =>
  n === null
    ? "A confirmar"
    : new Intl.NumberFormat("es-PY", {
        style: "currency",
        currency: "PYG",
        maximumFractionDigits: 0,
      }).format(n);
let { config, requests, version } = readState();
let current = null,
  selectedId = null,
  storageAvailable = true;
function persist() {
  storageAvailable = writeState({ config, requests, version });
  if (!storageAvailable)
    $("#demo-message").textContent =
      "El navegador no permite conservar esta presentación al cerrarla.";
}
function tab(id) {
  for (const name of ["cliente", "panel", "tarifas"])
    $("#" + name).hidden = name !== id;
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.tab === id)),
    );
  if (id === "panel") renderPanel();
  if (id === "tarifas") renderRates();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document
  .querySelectorAll("[data-tab]")
  .forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
function clearQuote() {
  current = null;
  $("#demo-result").hidden = true;
  $("#empty-estimate").hidden = false;
  $("#demo-success").hidden = true;
  send.hidden = false;
  $("#demo-message").textContent = "";
}
function fields() {
  const s = config.services.find((s) => s.id === form.elements.service.value);
  $("#quantity-label").hidden = s.method === "manual";
  form.elements.quantity.required = s.method !== "manual";
  $("#demo-extras").replaceChildren(
    Object.assign(document.createElement("legend"), {
      textContent: "Complementos opcionales",
    }),
  );
  for (const e of s.extras) {
    const label = document.createElement("label"),
      i = document.createElement("input");
    label.className = "check";
    i.type = "checkbox";
    i.value = e.id;
    i.name = "extra";
    label.append(i, document.createTextNode(e.name + " · " + money(e.price)));
    $("#demo-extras").append(label);
  }
  clearQuote();
}
for (const s of config.services)
  form.elements.service.add(new Option(s.name, s.id));
form.oninput = clearQuote;
form.onchange = (e) => {
  if (e.target.name === "service") fields();
  else clearQuote();
};
fields();
$("#example").onclick = () => {
  form.elements.service.value = "oficinas";
  fields();
  form.elements.quantity.value = "150";
  form.elements.city.value = "Asunción";
  form.elements.distance.value = "10";
  form.elements.details.value =
    "Oficina de ejemplo: limpieza semanal de áreas de trabajo y sala de reuniones.";
  form.requestSubmit();
};
function addBreakdown(parent, items) {
  parent.replaceChildren();
  for (const [k, v] of items) {
    const dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = k;
    dd.textContent = v;
    parent.append(dt, dd);
  }
}
form.onsubmit = (e) => {
  e.preventDefault();
  try {
    const d = new FormData(form),
      km = d.get("distance");
    current = estimate(
      config,
      {
        serviceId: d.get("service"),
        quantity: Number(d.get("quantity")),
        city: d.get("city"),
        extraIds: d.getAll("extra"),
        details: d.get("details"),
        address: "",
      },
      km && d.get("city") !== "Otra"
        ? {
            verified: true,
            city: d.get("city"),
            distanceMeters: Number(km) * 1000,
          }
        : null,
    );
    const q = current;
    addBreakdown($("#demo-breakdown"), [
      ["Servicio", q.service.name],
      ["Importe del servicio", money(q.serviceGross)],
      ["Descuento", money(q.discount)],
      ["Traslado simulado", money(q.transport.price)],
      [
        "Impuesto",
        q.taxMode === "none"
          ? "Sin configurar"
          : money(q.tax) +
            (q.taxMode === "included" ? " (incluido)" : " (adicional)"),
      ],
    ]);
    $("#demo-total").textContent = money(q.total);
    $("#demo-conditions").textContent =
      q.conditions + " Vigencia: " + q.validityDays + " días.";
    $("#location-warning").textContent =
      q.service.method === "manual"
        ? "Este servicio requiere una evaluación antes de asignar un importe."
        : q.transport.reason ||
          "Traslado ilustrativo; no se verificó una ubicación real.";
    $("#demo-result").hidden = false;
    $("#empty-estimate").hidden = true;
    $("#demo-success").hidden = true;
    send.hidden = false;
  } catch {
    $("#demo-message").textContent =
      "Revisá la cantidad y los datos de la estimación.";
  }
};
send.onsubmit = (e) => {
  e.preventDefault();
  if (!current) return;
  const d = new FormData(send);
  if (requests.length >= 200) {
    $("#demo-message").textContent =
      "La presentación llegó al límite de 200 solicitudes. Restablecé los datos de ejemplo para continuar.";
    return;
  }
  const id =
    "LMP-" +
    String(
      Math.max(1000, ...requests.map((r) => Number(r.id.slice(4)) || 1000)) + 1,
    );
  requests.unshift({
    id,
    createdAt: new Date().toISOString(),
    name: String(d.get("name")).trim() || "Empresa de ejemplo",
    phone: String(d.get("phone")).trim() || "No proporcionado",
    quote: structuredClone(current),
    state: "Nueva",
    version,
    history: [{ state: "Nueva", at: new Date().toISOString() }],
  });
  selectedId = id;
  persist();
  $("#success-text").textContent =
    `Solicitud ${id} creada${storageAvailable ? " en este navegador" : ""}. Ya podés verla en el panel.`;
  send.hidden = true;
  $("#demo-success").hidden = false;
  renderPanel();
};
$("#see-request").onclick = () => {
  tab("panel");
  if (selectedId) detail(selectedId);
};
function renderPanel() {
  const filtered = requests.filter(
    (r) => !$("#filter").value || r.state === $("#filter").value,
  );
  $("#nav-count").textContent = requests.length;
  $("#metrics").replaceChildren();
  for (const [label, n] of [
    ["Solicitudes", requests.length],
    ["Por atender", requests.filter((r) => r.state === "Nueva").length],
    [
      "En seguimiento",
      requests.filter((r) => ["Contactada", "Cotizada"].includes(r.state))
        .length,
    ],
    [
      "Aceptadas",
      requests.filter((r) => r.state === "Aceptada" || r.state === "Finalizada")
        .length,
    ],
  ]) {
    const card = document.createElement("div"),
      l = document.createElement("span"),
      v = document.createElement("strong");
    card.className = "metric";
    l.textContent = label;
    v.textContent = n;
    card.append(l, v);
    $("#metrics").append(card);
  }
  $("#demo-requests").replaceChildren();
  if (!filtered.length)
    $("#demo-requests").textContent = "No hay solicitudes en este estado.";
  for (const r of filtered) {
    const row = document.createElement("div");
    row.className = "request-row";
    const company = document.createElement("div"),
      name = document.createElement("strong"),
      info = document.createElement("small");
    name.textContent = r.name;
    info.textContent = r.id + " · " + r.quote.service.name;
    company.append(name, info);
    const amount = document.createElement("div");
    amount.className = "amount";
    amount.textContent = money(r.quote.total);
    const pill = document.createElement("span");
    pill.className = "status-pill";
    pill.dataset.state = r.state;
    pill.textContent = r.state;
    const b = document.createElement("button");
    b.className = "subtle";
    b.textContent = "Ver detalle ↗";
    b.onclick = () => detail(r.id);
    row.append(company, amount, pill, b);
    $("#demo-requests").append(row);
  }
}
$("#filter").onchange = renderPanel;
function detail(id) {
  const r = requests.find((r) => r.id === id);
  if (!r) return;
  selectedId = id;
  const root = $("#detail-content");
  root.replaceChildren();
  const h = document.createElement("h3");
  h.textContent = r.name + " · " + r.id;
  root.append(h);
  const dl = document.createElement("dl");
  addBreakdown(dl, [
    ["Servicio", r.quote.service.name],
    [
      "Cantidad",
      r.quote.service.quantity === null
        ? "Evaluación manual"
        : r.quote.service.quantity + " m²",
    ],
    ["Ciudad", r.quote.input.city],
    ["Servicio estimado", money(r.quote.serviceNet)],
    ["Traslado simulado", money(r.quote.transport.price)],
    ["Total orientativo", money(r.quote.total)],
    ["Versión de tarifa", r.version],
    ["Estado", r.state],
  ]);
  root.append(dl);
  for (const text of [
    r.quote.input.details,
    r.quote.conditions,
    "Teléfono de ejemplo: " + r.phone,
  ]) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = text;
    root.append(p);
  }
  const transitions = TRANSITIONS[r.state] || [];
  if (transitions.length) {
    const l = document.createElement("label");
    l.textContent = "Siguiente estado";
    const select = document.createElement("select");
    for (const state of transitions) select.add(new Option(state, state));
    l.append(select);
    const b = document.createElement("button");
    b.textContent = "Actualizar estado";
    b.onclick = () => {
      r.state = select.value;
      r.history.push({ state: r.state, at: new Date().toISOString() });
      persist();
      renderPanel();
      detail(id);
    };
    root.append(l, b);
  }
  const hist = document.createElement("p");
  hist.className = "history";
  hist.textContent = "Recorrido: " + r.history.map((x) => x.state).join(" → ");
  root.append(hist);
  const label = document.createElement("label");
  label.textContent = "Vista previa del mensaje para WhatsApp (no se envía)";
  const text = document.createElement("textarea");
  text.readOnly = true;
  text.rows = 7;
  text.value = `Hola Limpiarte. Solicitud ${r.id}\nServicio: ${r.quote.service.name}\nCiudad: ${r.quote.input.city}\nServicio estimado: ${money(r.quote.serviceNet)}\nTraslado: ${money(r.quote.transport.price)}\nTotal orientativo: ${money(r.quote.total)}\n${r.quote.conditions}\nNombre: ${r.name}`;
  label.append(text);
  root.append(label);
  if (!$("#request-detail").open) $("#request-detail").showModal();
}
$("#close-detail").onclick = () => $("#request-detail").close();
function renderRates() {
  const root = $("#rate-rows");
  root.replaceChildren();
  for (const s of config.services) {
    const row = document.createElement("div");
    row.className = "rate-row";
    const title = document.createElement("strong");
    title.textContent =
      s.name + (s.method === "manual" ? " · Evaluación manual" : "");
    row.append(title);
    for (const [key, label] of [
      ["rate", "Precio por m²"],
      ["minimum", "Importe mínimo"],
    ]) {
      const l = document.createElement("label"),
        i = document.createElement("input");
      l.textContent = label;
      i.type = "number";
      i.min = "0";
      i.max = "1000000";
      i.required = true;
      i.value = s[key];
      i.name = s.id + "-" + key;
      i.disabled = s.method === "manual";
      l.append(i);
      row.append(l);
    }
    root.append(row);
  }
  rates.elements.asu.value = config.transport.cities[0].price;
  rates.elements.validity.value = config.commercial.validityDays;
  rates.elements.discount.value = config.commercial.discountBps / 100;
  rates.elements.tax.value = config.commercial.taxMode;
  rates.elements.conditions.value = config.commercial.conditions;
}
rates.onsubmit = (e) => {
  e.preventDefault();
  try {
    const next = structuredClone(config);
    for (const s of next.services)
      if (s.method !== "manual")
        for (const key of ["rate", "minimum"])
          s[key] = Number(rates.elements[s.id + "-" + key].value);
    next.transport.cities[0].price = Number(rates.elements.asu.value);
    next.commercial.validityDays = Number(rates.elements.validity.value);
    next.commercial.discountBps = Math.round(
      Number(rates.elements.discount.value) * 100,
    );
    next.commercial.taxMode = rates.elements.tax.value;
    next.commercial.taxBps = next.commercial.taxMode === "none" ? 0 : 1000;
    next.commercial.conditions = rates.elements.conditions.value;
    validateConfig(next);
    config = next;
    version++;
    persist();
    clearQuote();
    $("#rates-status").textContent =
      "Cambios aplicados · Versión " +
      version +
      ". Las solicitudes anteriores se conservan.";
  } catch {
    $("#rates-status").textContent = "Revisá los importes y las condiciones.";
  }
};
$("#reset-demo").onclick = () => {
  if (
    !confirm(
      "¿Restablecer únicamente las tarifas y solicitudes de esta presentación?",
    )
  )
    return;
  config = initialConfig();
  requests = seed(config);
  version = 1;
  selectedId = null;
  persist();
  $("#filter").value = "";
  clearQuote();
  fields();
  renderPanel();
  renderRates();
  tab("cliente");
  $("#demo-message").textContent = "Datos de ejemplo restablecidos.";
};
renderPanel();
renderRates();

window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  ({ config, requests, version } = readState());
  clearQuote();
  renderPanel();
  renderRates();
  if ($("#request-detail").open) $("#request-detail").close();
});
tab("panel");
