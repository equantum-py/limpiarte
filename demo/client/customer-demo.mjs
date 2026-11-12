import "./embed.mjs";
import { estimate } from "../lib/quote-engine.mjs";
import { readState, writeState, KEY } from "./demo-state.mjs";
const $ = (s) => document.querySelector(s),
  form = $("#customer-quote"),
  send = $("#customer-send");
const money = (n) =>
  n === null
    ? "A confirmar"
    : new Intl.NumberFormat("es-PY", {
        style: "currency",
        currency: "PYG",
        maximumFractionDigits: 0,
      }).format(n);
let state = readState(),
  current = null,
  currentVersion = null;
function invalidate() {
  current = null;
  $("#customer-result").hidden = true;
  $("#customer-success").hidden = true;
  send.hidden = false;
  $("#customer-status").textContent = "";
}
function services() {
  const selected = form.elements.service.value;
  form.elements.service.replaceChildren();
  for (const s of state.config.services.filter((s) => s.enabled && s.approved))
    form.elements.service.add(new Option(s.name, s.id));
  if ([...form.elements.service.options].some((s) => s.value === selected))
    form.elements.service.value = selected;
  fields();
}
function fields() {
  const s = state.config.services.find(
    (s) => s.id === form.elements.service.value,
  );
  if (!s) return;
  $("#customer-quantity-label").hidden = s.method === "manual";
  form.elements.quantity.required = s.method !== "manual";
  $("#customer-extras").replaceChildren(
    Object.assign(document.createElement("legend"), {
      textContent: "¿Necesitás algún complemento?",
    }),
  );
  for (const e of s.extras) {
    const label = document.createElement("label"),
      i = document.createElement("input");
    label.className = "check";
    i.type = "checkbox";
    i.name = "extra";
    i.value = e.id;
    label.append(i, document.createTextNode(e.name));
    $("#customer-extras").append(label);
  }
  $("#customer-extras").hidden = !s.extras.length;
  invalidate();
}
form.oninput = invalidate;
form.onchange = (e) => (e.target.name === "service" ? fields() : invalidate());
form.onsubmit = (e) => {
  e.preventDefault();
  try {
    state = readState();
    const data = new FormData(form);
    current = estimate(state.config, {
      serviceId: data.get("service"),
      quantity: Number(data.get("quantity")),
      extraIds: data.getAll("extra"),
      city: data.get("city"),
      address: data.get("address"),
      details: data.get("details"),
    });
    currentVersion = state.version;
    $("#customer-summary").replaceChildren();
    for (const [k, v] of [
      ["Servicio", current.service.name],
      ["Servicio estimado", money(current.serviceNet)],
      ["Traslado", "A confirmar según ubicación"],
      ["Total final", "Se confirma con el equipo"],
    ]) {
      const dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = k;
      dd.textContent = v;
      $("#customer-summary").append(dt, dd);
    }
    $("#customer-conditions").textContent = current.conditions;
    $("#customer-result").hidden = false;
    send.hidden = false;
    $("#customer-success").hidden = true;
  } catch {
    $("#customer-status").textContent =
      "Revisá los datos para calcular la estimación.";
  }
};
send.onsubmit = (e) => {
  e.preventDefault();
  if (!current) return;
  state = readState();
  if (state.version !== currentVersion) {
    invalidate();
    $("#customer-status").textContent =
      "Los precios se actualizaron. Volvé a calcular tu estimación.";
    return;
  }
  if (state.requests.length >= 200) {
    $("#customer-status").textContent =
      "La presentación llegó a su límite de solicitudes. Pedí al presentador restablecer los ejemplos desde el panel.";
    return;
  }
  const d = new FormData(send),
    id =
      "LMP-" +
      String(
        Math.max(
          1000,
          ...state.requests.map((r) => Number(r.id.slice(4)) || 1000),
        ) + 1,
      );
  state.requests.unshift({
    id,
    createdAt: new Date().toISOString(),
    name: String(d.get("name")).trim() || "Empresa de ejemplo",
    phone: String(d.get("phone")).trim() || "No proporcionado",
    quote: structuredClone(current),
    state: "Nueva",
    version: state.version,
    source: "cliente",
    history: [{ state: "Nueva", at: new Date().toISOString() }],
  });
  const saved = writeState(state);
  if (!saved) {
    $("#customer-status").textContent =
      "El navegador no permitió guardar la solicitud de ejemplo. Habilitá el almacenamiento local para probar el recorrido completo.";
    return;
  }
  send.hidden = true;
  $("#customer-success").hidden = false;
  $("#customer-receipt").textContent =
    "Tu referencia de ejemplo es " + id + ".";
  $("#customer-status").textContent = "";
};
$("#customer-new").onclick = () => {
  form.reset();
  send.reset();
  state = readState();
  services();
};
window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  state = readState();
  services();
  $("#customer-status").textContent =
    "La configuración de esta presentación se actualizó. Podés preparar una nueva estimación.";
});
services();
