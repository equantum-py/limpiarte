import { createClient } from "@supabase/supabase-js";
const $ = (s) => document.querySelector(s),
  message = $("#message");
let auth, token, version, config, factor;
const labels = {
  NOT_CONFIGURED:
    "Administración pendiente de conexión a una base propia de Limpiarte.",
  UNAUTHORIZED: "Iniciá sesión para continuar.",
  MFA_REQUIRED: "Completá la verificación de dos factores.",
  FORBIDDEN: "Tu cuenta no tiene acceso administrativo activo.",
  PUBLISH_REJECTED:
    "No se publicó. Revisá tus permisos y actualizá la configuración: puede haber una versión más reciente.",
  STATE_CONFLICT_OR_FORBIDDEN:
    "El estado cambió o tu cuenta no tiene permiso. Actualizá las solicitudes.",
};
async function api(action, data) {
  if (auth) await session();
  const r = await fetch("/api/cotizador?action=" + action, {
    method: data ? "POST" : "GET",
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok)
    throw Error(
      labels[j.error] ||
        "No se pudo completar la operación. Revisá los datos e intentá nuevamente.",
    );
  return j;
}
async function session() {
  const { data, error } = await auth.auth.getSession();
  if (error) throw error;
  token = data.session?.access_token;
  return data.session;
}
async function enter() {
  const s = await session();
  $("#auth").hidden = !!s;
  $("#logout").hidden = !s;
  $("#workspace").hidden = true;
  $("#mfa").hidden = true;
  if (!s) {
    message.textContent = "Ingresá con tu cuenta autorizada.";
    return;
  }
  const { data: assurance, error } =
    await auth.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  if (assurance.currentLevel !== "aal2") {
    const { data: list, error } = await auth.auth.mfa.listFactors();
    if (error) throw error;
    factor = list.totp.find((f) => f.status === "verified");
    if (!factor) {
      for (const f of list.totp.filter((f) => f.status !== "verified"))
        await auth.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await auth.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Limpiarte " + new Date().toISOString(),
      });
      if (error) throw error;
      factor = { id: data.id };
      if (!data.totp.qr_code.startsWith("data:image/svg+xml;"))
        throw Error("No pudimos generar el código de configuración.");
      $("#qr").src = data.totp.qr_code;
      $("#qr").hidden = false;
      $("#secret").textContent = "Clave manual: " + data.totp.secret;
      $("#mfa-help").textContent =
        "Agregá esta cuenta a tu aplicación autenticadora y escribí el código.";
    } else {
      $("#qr").hidden = true;
      $("#secret").textContent = "";
      $("#mfa-help").textContent =
        "Escribí el código de tu aplicación autenticadora.";
    }
    $("#mfa").hidden = false;
    message.textContent = "Se requiere doble factor para acceder al panel.";
    return;
  }
  const c = await api("admin-config");
  version = c.id;
  config = c.config;
  renderConfig();
  await requests();
  $("#workspace").hidden = false;
  message.textContent =
    "Acceso verificado. Las solicitudes se guardan de forma centralizada.";
}
function input(label, value, type = "text", attrs = {}) {
  const l = document.createElement("label");
  l.textContent = label;
  const i = document.createElement(
    type === "textarea" ? "textarea" : type === "select" ? "select" : "input",
  );
  if (!["textarea", "select"].includes(type)) i.type = type;
  Object.assign(i, attrs);
  if (type === "checkbox") {
    l.className = "check";
    i.checked = value;
  } else i.value = value;
  l.append(i);
  return { label: l, input: i };
}
function renderConfig() {
  $("#services").replaceChildren();
  config.services.forEach((s, index) => {
    const row = document.createElement("div");
    row.className = "service-row";
    const h = document.createElement("h3");
    h.textContent = s.name;
    row.append(h);
    for (const [key, label, type, attrs] of [
      ["name", "Nombre", "text", { maxLength: 120, required: true }],
      ["enabled", "Disponible en el cotizador", "checkbox", {}],
      ["approved", "Tarifa del servicio aprobada", "checkbox", {}],
      [
        "base",
        "Importe base (Gs.)",
        "number",
        { min: 0, max: 1e9, required: true },
      ],
      [
        "rate",
        "Precio por m² / unidad (Gs.)",
        "number",
        { min: 0, max: 1e9, required: true },
      ],
      [
        "minimum",
        "Mínimo del servicio (Gs.)",
        "number",
        { min: 0, max: 1e9, required: true },
      ],
    ]) {
      const f = input(label, s[key], type, attrs);
      f.input.dataset.service = index;
      f.input.dataset.key = key;
      row.append(f.label);
    }
    const method = input("Forma de cálculo", "", "select");
    for (const [v, t] of [
      ["area", "Por m²"],
      ["unit", "Por unidad"],
      ["fixed", "Importe fijo (usa el importe base)"],
      ["manual", "Evaluación manual"],
    ])
      method.input.add(new Option(t, v));
    method.input.value = s.method;
    method.input.dataset.service = index;
    method.input.dataset.key = "method";
    row.append(method.label);
    const extras = input(
      "Complementos (JSON: id, name, price)",
      JSON.stringify(s.extras, null, 2),
      "textarea",
      { rows: 3 },
    );
    extras.input.dataset.service = index;
    extras.input.dataset.key = "extras";
    row.append(extras.label);
    $("#services").append(row);
  });
  $("#commercial").replaceChildren();
  for (const [key, label, type, attrs] of [
    [
      "whatsapp",
      "WhatsApp (código de país, solo números)",
      "text",
      { pattern: "[0-9]{8,15}", required: true },
    ],
    [
      "discountBps",
      "Descuento (100 = 1%)",
      "number",
      { min: 0, max: 5000, required: true },
    ],
    [
      "taxBps",
      "Impuesto (100 = 1%)",
      "number",
      { min: 0, max: 3000, required: true },
    ],
    [
      "rounding",
      "Redondear hacia arriba a múltiplos de (Gs.)",
      "number",
      { min: 1, max: 100000, required: true },
    ],
    [
      "validityDays",
      "Vigencia (días)",
      "number",
      { min: 1, max: 90, required: true },
    ],
    [
      "conditions",
      "Condiciones para el cliente",
      "textarea",
      { maxLength: 1500, required: true, rows: 4 },
    ],
  ]) {
    const f = input(label, config.commercial[key], type, attrs);
    f.input.dataset.commercial = key;
    $("#commercial").append(f.label);
  }
  const tax = input("Tratamiento del impuesto", "", "select");
  for (const [v, t] of [
    ["none", "Sin impuesto configurado"],
    ["included", "Incluido"],
    ["excluded", "Adicional"],
  ])
    tax.input.add(new Option(t, v));
  tax.input.value = config.commercial.taxMode;
  tax.input.dataset.commercial = "taxMode";
  $("#commercial").append(tax.label);
  $("#approved").checked = config.commercial.approved;
  $("#transport-mode").value = config.transport.mode;
  $("#origin").value = config.transport.origin;
  $("#bands").value = JSON.stringify(config.transport.bands, null, 2);
  $("#cities-config").value = JSON.stringify(config.transport.cities, null, 2);
  $("#extra-km").value = config.transport.extraKmPrice;
  $("#max-km").value = config.transport.maxKm;
  $("#version").textContent =
    "Versión vigente: " + (version || "Todavía no hay tarifas publicadas.");
}
function collect() {
  document.querySelectorAll("[data-service]").forEach((i) => {
    config.services[Number(i.dataset.service)][i.dataset.key] =
      i.type === "checkbox"
        ? i.checked
        : i.dataset.key === "extras"
          ? JSON.parse(i.value)
          : i.type === "number"
            ? Number(i.value)
            : i.value;
  });
  document.querySelectorAll("[data-commercial]").forEach((i) => {
    config.commercial[i.dataset.commercial] =
      i.type === "number" ? Number(i.value) : i.value;
  });
  config.commercial.approved = $("#approved").checked;
  config.transport = {
    mode: $("#transport-mode").value,
    origin: $("#origin").value,
    bands: JSON.parse($("#bands").value),
    cities: JSON.parse($("#cities-config").value),
    extraKmPrice: Number($("#extra-km").value),
    maxKm: Number($("#max-km").value),
  };
  return config;
}
async function requests() {
  const { requests: rows } = await api("requests");
  $("#requests").replaceChildren();
  if (!rows.length) {
    $("#requests").textContent = "Todavía no hay solicitudes.";
    return;
  }
  for (const r of rows) {
    const detail = document.createElement("details"),
      summary = document.createElement("summary");
    summary.textContent = `${new Date(r.created_at).toLocaleString("es-PY")} · ${r.snapshot.service.name} · ${r.state}`;
    detail.append(summary);
    const info = document.createElement("pre");
    info.textContent = JSON.stringify(
      {
        solicitud: r.id,
        contacto: r.contact,
        servicio: r.snapshot.service,
        ubicacion: r.snapshot.input,
        servicioEstimado: r.snapshot.serviceNet,
        traslado: r.snapshot.transport,
        total: r.snapshot.total,
        condiciones: r.snapshot.conditions,
        vigencia: r.expires_at,
      },
      null,
      2,
    );
    detail.append(info);
    const next = {
      Nueva: ["Contactada", "Rechazada"],
      Contactada: ["Cotizada", "Rechazada"],
      Cotizada: ["Aceptada", "Rechazada"],
      Aceptada: ["Finalizada", "Rechazada"],
      Rechazada: [],
      Finalizada: [],
    }[r.state];
    if (next.length) {
      const select = document.createElement("select");
      select.setAttribute("aria-label", "Nuevo estado de la solicitud");
      for (const s of next) select.add(new Option(s, s));
      const b = document.createElement("button");
      b.textContent = "Cambiar estado";
      b.type = "button";
      b.onclick = async () => {
        b.disabled = true;
        try {
          await api("status", {
            id: r.id,
            revision: r.revision,
            state: select.value,
          });
          await requests();
          message.textContent = "Estado actualizado.";
        } catch (e) {
          message.textContent = e.message;
        } finally {
          b.disabled = false;
        }
      };
      detail.append(select, b);
    }
    $("#requests").append(detail);
  }
}
$("#login").onsubmit = async (e) => {
  e.preventDefault();
  const b = e.target.querySelector("button");
  b.disabled = true;
  try {
    const d = new FormData(e.target);
    const { error } = await auth.auth.signInWithPassword({
      email: d.get("email"),
      password: d.get("password"),
    });
    if (error)
      throw Error("No se pudo iniciar sesión. Revisá tus credenciales.");
    e.target.reset();
    await enter();
  } catch (e) {
    message.textContent = e.message;
  } finally {
    b.disabled = false;
  }
};
$("#verify").onsubmit = async (e) => {
  e.preventDefault();
  const b = e.target.querySelector("button");
  b.disabled = true;
  try {
    const { error } = await auth.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: new FormData(e.target).get("code"),
    });
    if (error) throw Error("Código incorrecto o vencido. Intentá nuevamente.");
    e.target.reset();
    $("#secret").textContent = "";
    $("#qr").removeAttribute("src");
    await enter();
  } catch (e) {
    message.textContent = e.message;
  } finally {
    b.disabled = false;
  }
};
$("#logout").onclick = async () => {
  await auth.auth.signOut();
  token = null;
  $("#workspace").hidden = true;
  $("#requests").replaceChildren();
  $("#services").replaceChildren();
  $("#commercial").replaceChildren();
  $("#secret").textContent = "";
  $("#qr").removeAttribute("src");
  config = null;
  await enter();
};
$("#reload").onclick = async () => {
  try {
    await session();
    await requests();
    message.textContent = "Solicitudes actualizadas.";
  } catch (e) {
    message.textContent = e.message;
  }
};
$("#add-service").onclick = () => {
  try {
    collect();
    const id = $("#new-id").value,
      name = $("#new-name").value;
    if (
      !/^[a-z0-9-]{1,60}$/.test(id) ||
      !name.trim() ||
      config.services.some((s) => s.id === id)
    )
      throw Error("Ingresá un identificador único y un nombre.");
    config.services.push({
      id,
      name,
      method: "manual",
      enabled: false,
      approved: false,
      base: 0,
      rate: 0,
      minimum: 0,
      extras: [],
    });
    renderConfig();
    $("#new-id").value = "";
    $("#new-name").value = "";
  } catch (e) {
    message.textContent = e.message;
  }
};
$("#config").onsubmit = async (e) => {
  e.preventDefault();
  const b =
    e.target.querySelector('button[type="submit"]') ||
    e.target.querySelector("button:last-of-type");
  b.disabled = true;
  try {
    await session();
    const r = await api("publish", { config: collect(), expected: version });
    version = r.id;
    $("#version").textContent = "Versión vigente: " + version;
    message.textContent =
      "Nueva versión publicada. Las solicitudes anteriores conservan sus importes.";
  } catch (e) {
    message.textContent =
      e instanceof SyntaxError
        ? "Revisá el formato JSON de complementos, bandas y ciudades."
        : e.message;
  } finally {
    b.disabled = false;
  }
};
try {
  const c = await api("auth");
  auth = createClient(c.url, c.key, {
    auth: {
      storage: sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  auth.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      $("#password-setup").hidden = false;
      $("#auth").hidden = true;
      $("#workspace").hidden = true;
      $("#mfa").hidden = true;
      message.textContent = "Elegí una contraseña nueva para tu cuenta.";
    }
  });
  await enter();
  if (new URL(location.href).searchParams.get("setup") === "1" && token) {
    $("#password-setup").hidden = false;
    $("#workspace").hidden = true;
    $("#mfa").hidden = true;
  }
} catch (e) {
  message.textContent = e.message;
}

$("#recover").onclick = async () => {
  const email = $("#login").elements.email.value;
  if (!email || !$("#login").elements.email.checkValidity()) {
    message.textContent =
      "Ingresá tu correo para solicitar un enlace de acceso.";
    return;
  }
  try {
    const { error } = await auth.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + "/admin/?setup=1",
    });
    if (error) throw error;
    message.textContent =
      "Si tu cuenta existe, recibirás un enlace. Revisá tu correo.";
  } catch {
    message.textContent = "No se pudo solicitar el enlace. Intentá más tarde.";
  }
};
$("#set-password").onsubmit = async (e) => {
  e.preventDefault();
  const d = new FormData(e.target);
  if (d.get("password") !== d.get("confirm")) {
    message.textContent = "Las contraseñas no coinciden.";
    return;
  }
  const b = e.target.querySelector("button");
  b.disabled = true;
  try {
    const { error } = await auth.auth.updateUser({
      password: d.get("password"),
    });
    if (error)
      throw Error(
        "No se pudo actualizar la contraseña. Solicitá otro enlace o contactá al administrador.",
      );
    e.target.reset();
    $("#password-setup").hidden = true;
    history.replaceState(null, "", "/admin/");
    await enter();
  } catch (e) {
    message.textContent = e.message;
  } finally {
    b.disabled = false;
  }
};
