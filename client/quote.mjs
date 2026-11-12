const $ = (s) => document.querySelector(s),
  form = $("#quote-form"),
  request = $("#request-form"),
  notice = $("#notice");
let catalog, current, requestKey;
const errors = {
  NOT_CONFIGURED:
    "El cotizador estará disponible próximamente. Consultanos por WhatsApp.",
  TARIFF_NOT_APPROVED:
    "Estamos actualizando las tarifas. Consultanos por WhatsApp.",
  RATE_LIMITED: "Alcanzaste el límite de consultas. Intentá más tarde.",
  TARIFF_CHANGED: "Las tarifas cambiaron. Volvé a calcular tu estimación.",
  QUOTE_EXPIRED: "La estimación venció. Volvé a calcularla.",
  ORIGIN_REJECTED: "No pudimos validar el origen de la solicitud.",
};
async function api(action, data) {
  const r = await fetch("/api/cotizador?action=" + action, {
    method: data ? "POST" : "GET",
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok)
    throw Error(
      errors[j.error] ||
        "No pudimos completar la solicitud. Revisá los datos o contactanos.",
    );
  return j;
}
const money = (n) =>
  n === null
    ? "A confirmar"
    : new Intl.NumberFormat("es-PY", {
        style: "currency",
        currency: "PYG",
        maximumFractionDigits: 0,
      }).format(n);
function reset() {
  current = null;
  requestKey = null;
  $("#result").hidden = true;
  $("#saved").textContent = "";
  $("#whatsapp").hidden = true;
  request.hidden = false;
}
function fields() {
  const s = catalog.services.find(
    (s) => s.id === form.elements.serviceId.value,
  );
  const quantity = form.elements.quantity;
  $("#quantity-label").hidden = ["fixed", "manual"].includes(s.method);
  quantity.required = !$("#quantity-label").hidden;
  quantity.step = s.method === "unit" ? "1" : "0.01";
  quantity.max = s.method === "unit" ? "1000" : "100000";
  $("#quantity-label").firstChild.textContent =
    s.method === "unit" ? "Cantidad de unidades" : "Superficie aproximada (m²)";
  $("#extras").replaceChildren(
    Object.assign(document.createElement("legend"), {
      textContent: "Complementos opcionales",
    }),
  );
  $("#extras").hidden = !s.extras.length;
  for (const e of s.extras) {
    const l = document.createElement("label");
    l.className = "check";
    const i = document.createElement("input");
    i.type = "checkbox";
    i.name = "extraIds";
    i.value = e.id;
    l.append(i, document.createTextNode(e.name));
    $("#extras").append(l);
  }
  reset();
}
form.addEventListener("change", (e) => {
  if (e.target.name === "serviceId") fields();
  else reset();
});
form.addEventListener("input", reset);
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  reset();
  const b = form.querySelector("button");
  b.disabled = true;
  notice.textContent = "Calculando…";
  try {
    const d = new FormData(form);
    current = await api("estimate", {
      serviceId: d.get("serviceId"),
      quantity: Number(d.get("quantity")),
      extraIds: d.getAll("extraIds"),
      city: d.get("city"),
      address: d.get("address"),
      details: d.get("details"),
    });
    requestKey = crypto.randomUUID();
    const q = current.quote;
    $("#summary").replaceChildren();
    for (const [k, v] of [
      ["Servicio", q.service.name],
      ["Importe del servicio", money(q.serviceGross)],
      ["Descuento", money(q.discount)],
      ["Servicio estimado", money(q.serviceNet)],
      ["Traslado", money(q.transport.price)],
      [
        "Impuesto",
        q.taxMode === "none"
          ? "Según condiciones"
          : q.tax === null
            ? "A confirmar"
            : money(q.tax) +
              (q.taxMode === "included" ? " (incluido)" : " (adicional)"),
      ],
      ["Total orientativo", money(q.total)],
    ]) {
      const dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = k;
      dd.textContent = v;
      $("#summary").append(dt, dd);
    }
    $("#conditions").textContent =
      q.conditions + ` Vigencia de la solicitud: ${q.validityDays} días.`;
    $("#transport-note").textContent = q.transport.reason || "";
    $("#result").hidden = false;
    notice.textContent =
      "Estimación orientativa. La contratación requiere confirmación.";
  } catch (e) {
    notice.textContent = e.message;
  } finally {
    b.disabled = false;
  }
});
request.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!current) return;
  const b = request.querySelector("button");
  b.disabled = true;
  const d = new FormData(request);
  try {
    const saved = await api("request", {
      token: current.token,
      idempotencyKey: requestKey,
      contact: {
        name: d.get("name"),
        phone: d.get("phone"),
        consent: d.get("consent") === "on",
      },
    });
    $("#saved").textContent =
      `Solicitud ${saved.id} guardada. Abrí WhatsApp para enviarla al equipo.`;
    $("#whatsapp").href = saved.whatsappUrl;
    $("#whatsapp").hidden = false;
    request.hidden = true;
  } catch (e) {
    $("#saved").textContent = e.message;
  } finally {
    b.disabled = false;
  }
});
try {
  catalog = await api("catalog");
  if (!catalog.services.length) {
    notice.textContent =
      "Estamos preparando el cotizador. Pedí tu presupuesto por WhatsApp.";
  } else {
    for (const s of catalog.services)
      form.elements.serviceId.add(new Option(s.name, s.id));
    for (const c of catalog.cities) $("#cities").append(new Option(c, c));
    form.hidden = false;
    notice.textContent = "Elegí el servicio que necesitás.";
    fields();
  }
} catch (e) {
  notice.textContent = e.message;
}
