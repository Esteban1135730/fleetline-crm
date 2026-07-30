/**
 * Full CRM API regression suite (Node)
 * Run: node scripts/crm-api-suite.mjs
 */
const BASE = process.env.API_URL || "http://localhost:4000";

let pass = 0;
let fail = 0;
const fails = [];

function ok(name, detail = "") {
  pass++;
  console.log(`OK  ${name}${detail ? " — " + detail : ""}`);
}
function bad(name, detail) {
  fail++;
  fails.push({ name, detail: String(detail) });
  console.log(`FAIL ${name} — ${detail}`);
}

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("API no disponible");
}

async function login(email) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "fsg2026" }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function api(method, path, token, body) {
  const headers = { Authorization: `Bearer ${token}` };
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const r = await fetch(`${BASE}${path}`, init);
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) {
    const msg =
      data?.message ||
      (Array.isArray(data?.message) ? data.message.join(", ") : text) ||
      r.statusText;
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = r.status;
    throw err;
  }
  return data;
}

async function main() {
  console.log("\n=== CRM FULL API SUITE ===\n");
  await waitReady();

  const ceo = await login("ceo@fsg.co");
  ok("auth/login ceo", ceo.user.email);
  const t = ceo.accessToken;

  const fin = await login("fin@fsg.co");
  ok("auth/login fin", fin.user.email);
  const tFin = fin.accessToken;

  await login("despacho@fsg.co");
  ok("auth/login despacho");

  try {
    const me = await api("GET", "/auth/me", t);
    ok("auth/me", me.email);
  } catch (e) {
    bad("auth/me", e.message);
  }

  for (const p of ["/dashboard/metrics", "/dashboard/charts", "/dashboard/ticker"]) {
    try {
      await api("GET", p, t);
      ok(`GET ${p}`);
    } catch (e) {
      bad(`GET ${p}`, e.message);
    }
  }

  let cust, ctr, veh, trip;

  try {
    cust = await api("POST", "/comercial/customers", t, {
      name: `Cliente QA ${Date.now() % 10000}`,
      nit: `900${Date.now() % 1000000}-1`,
      segment: "B2B",
      email: "qa@test.co",
      phone: "3001234567",
    });
    ok("POST customers", cust.name);
    cust = await api("PATCH", `/comercial/customers/${cust.id}`, t, {
      phone: "3109998877",
    });
    ok("PATCH customers", cust.phone);
  } catch (e) {
    bad("customers CRUD", e.message);
  }

  try {
    await api("GET", "/comercial/customers", tFin);
    ok("finanzas GET customers (sin 403)");
  } catch (e) {
    bad("finanzas GET customers", e.message);
  }

  try {
    let quote = await api("POST", "/comercial/quotes", t, {
      customerId: cust.id,
      amount: 2500000,
      notes: "Ruta QA Bogota-Cali",
    });
    ok("POST quotes", quote.code);
    quote = await api("PATCH", `/comercial/quotes/${quote.id}/status`, t, {
      status: "APPROVED",
    });
    ok("PATCH quote APPROVED", quote.status);
    const ctrQ = await api("POST", `/comercial/quotes/${quote.id}/to-contract`, t, {});
    ok("POST quote->contract", ctrQ.code);
  } catch (e) {
    bad("quotes flow", e.message);
  }

  try {
    const start = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
    ctr = await api("POST", "/comercial/contracts", t, {
      name: "Contrato QA",
      customerId: cust.id,
      channel: "PRIVATE",
      route: "Bogota -> Cali",
      startDate: start,
      endDate: end,
      monthlyValue: 1800000,
    });
    ok("POST contracts", ctr.code);
    ctr = await api("PATCH", `/comercial/contracts/${ctr.id}`, t, {
      status: "SUSPENDED",
      route: "Bogota -> Palmira",
    });
    ok("PATCH contract", `${ctr.status}`);
    ctr = await api("PATCH", `/comercial/contracts/${ctr.id}`, t, {
      status: "ACTIVE",
    });
    ok("PATCH contract ACTIVE", ctr.status);
  } catch (e) {
    bad("contracts", e.message);
  }

  try {
    const plate = `QA${String(Date.now() % 1000).padStart(3, "0")}`;
    veh = await api("POST", "/fleet/vehicles", t, {
      plate,
      brand: "Chevrolet",
      model: "NPR",
      year: 2022,
      capacity: 20,
    });
    ok("POST vehicles", veh.plate);
    veh = await api("PATCH", `/fleet/vehicles/${veh.id}`, t, {
      status: "MAINTENANCE",
    });
    ok("PATCH vehicle", veh.status);
    let wo = await api("POST", "/fleet/work-orders", t, {
      vehicleId: veh.id,
      description: "Frenos QA",
    });
    ok("POST work-order", wo.code);
    wo = await api("PATCH", `/fleet/work-orders/${wo.id}`, t, {
      status: "IN_PROGRESS",
    });
    ok("PATCH WO IN_PROGRESS", wo.status);
    wo = await api("PATCH", `/fleet/work-orders/${wo.id}`, t, { status: "DONE" });
    ok("PATCH WO DONE", wo.status);
    veh = await api("PATCH", `/fleet/vehicles/${veh.id}`, t, {
      status: "AVAILABLE",
    });
  } catch (e) {
    bad("fleet/taller", e.message);
  }

  try {
    let drv = await api("POST", "/logistics/drivers", t, {
      name: "Conductor QA",
      document: `CC${Date.now() % 1e8}`,
      phone: "3001112233",
      license: "C2",
    });
    ok("POST drivers", drv.name);
    drv = await api("PATCH", `/logistics/drivers/${drv.id}`, t, { active: false });
    ok("PATCH driver inactive", String(drv.active));
    drv = await api("PATCH", `/logistics/drivers/${drv.id}`, t, { active: true });

    trip = await api("POST", "/logistics/trips", t, {
      origin: "Bogota",
      destination: "Cali",
      scheduledAt: new Date().toISOString(),
      contractId: ctr.id,
      vehicleId: veh.id,
      driverId: drv.id,
      fareAmount: 1800000,
    });
    ok("POST trip", trip.code);
    if (!trip.customerId) bad("trip hereda customerId", "null");
    else ok("trip.customerId seteado", trip.customerId);

    trip = await api("PATCH", `/logistics/trips/${trip.id}/status`, t, {
      status: "IN_TRANSIT",
    });
    ok("trip IN_TRANSIT", trip.status);
    trip = await api("PATCH", `/logistics/trips/${trip.id}/incident`, t, {
      notes: "Demora QA",
    });
    ok("trip incident", trip.status);
    trip = await api("PATCH", `/logistics/trips/${trip.id}/status`, t, {
      status: "COMPLETED",
    });
    ok("trip COMPLETED", trip.status);

    const gps = await api("PATCH", `/logistics/gps/${veh.id}`, t, {
      lat: 4.60971,
      lng: -74.08175,
    });
    ok("PATCH gps web", `${gps.plate} ${gps.lat}`);

    const invTrip = await api("POST", `/logistics/trips/${trip.id}/invoice`, t);
    ok("POST trip invoice", invTrip.number);
    try {
      await api("POST", `/logistics/trips/${trip.id}/invoice`, t);
      bad("bloquea factura duplicada", "permitio segunda");
    } catch {
      ok("bloquea factura duplicada");
    }
  } catch (e) {
    bad("logistics flow", e.message);
  }

  try {
    const due = new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10);
    let inv = await api("POST", "/finance/invoices", tFin, {
      type: "RECEIVABLE",
      amount: 500000,
      dueDate: due,
      customerId: cust.id,
      description: "CxC QA manual",
    });
    ok("POST invoice CxC", inv.number);
    inv = await api("PATCH", `/finance/invoices/${inv.id}`, tFin, {
      description: "CxC QA editada",
    });
    ok("PATCH invoice", inv.description);
    inv = await api("PATCH", `/finance/invoices/${inv.id}/pay`, tFin);
    ok("PATCH pay CxC", inv.status);

    let cxp = await api("POST", "/finance/invoices", tFin, {
      type: "PAYABLE",
      amount: 200000,
      dueDate: due,
      supplierName: "Proveedor QA",
      description: "CxP QA",
    });
    ok("POST invoice CxP", cxp.number);
    cxp = await api("PATCH", `/finance/invoices/${cxp.id}/pay`, tFin);
    ok("PATCH pay CxP", cxp.status);

    const sum = await api("GET", "/finance/summary", tFin);
    ok("GET finance/summary", `cxcOpen=${sum.cxcOpen}`);
  } catch (e) {
    bad("finance", e.message);
  }

  try {
    const accs = await api("GET", "/accounting/accounts", tFin);
    ok("GET accounts", `count=${accs.length}`);
    const j = await api("GET", "/accounting/journal", tFin);
    ok("GET journal", `count=${j.length}`);
    const tb = await api("GET", "/accounting/trial-balance", tFin);
    ok("GET trial-balance", `rows=${tb.length}`);
    const a1305 = accs.find((a) => a.code === "1305");
    const a1110 = accs.find((a) => a.code === "1110");
    const entry = await api("POST", "/accounting/journal", tFin, {
      description: "Asiento QA manual",
      lines: [
        { accountId: a1110.id, debit: 1000, credit: 0 },
        { accountId: a1305.id, debit: 0, credit: 1000 },
      ],
    });
    ok("POST journal", entry.number);
    const voided = await api("PATCH", `/accounting/journal/${entry.id}/void`, tFin);
    ok("PATCH journal void", voided.status);
  } catch (e) {
    bad("accounting", e.message);
  }

  try {
    let po = await api("POST", "/compras/orders", t, {
      description: "Repuestos QA",
      supplier: "Repuestos SA",
      amount: 350000,
      category: "TALLER",
    });
    ok("POST compra", po.code);
    po = await api("PATCH", `/compras/orders/${po.id}/status`, t, {
      status: "APPROVED",
    });
    po = await api("PATCH", `/compras/orders/${po.id}/status`, t, {
      status: "ORDERED",
    });
    po = await api("PATCH", `/compras/orders/${po.id}/status`, t, {
      status: "RECEIVED",
    });
    ok("compra RECEIVED", po.status);
    const invoices = await api("GET", "/finance/invoices", tFin);
    const fromPo = invoices.find((i) => (i.description || "").includes(po.code));
    if (fromPo) ok("compra->CxP auto", fromPo.number);
    else bad("compra->CxP auto", "no encontrada");
  } catch (e) {
    bad("compras", e.message);
  }

  try {
    let proc = await api("POST", "/tramites/procedures", t, {
      vehicleId: veh.id,
      type: "SOAT",
      reference: "SOAT-QA-1",
      validTo: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10),
    });
    ok("POST tramite", proc.type);
    proc = await api("PATCH", `/tramites/procedures/${proc.id}`, t, {
      status: "VALID",
    });
    ok("PATCH tramite", proc.status);
  } catch (e) {
    bad("tramites", e.message);
  }

  try {
    let park = await api("POST", "/parqueadero/checkin", t, {
      plate: veh.plate,
      vehicleId: veh.id,
      guardName: "Guarda QA",
      driverName: "Conductor QA",
    });
    ok("POST parqueadero checkin", park.plate);
    park = await api("PATCH", `/parqueadero/checkout/${park.id}`, t);
    ok("PATCH parqueadero checkout");
    await api("GET", "/parqueadero/summary", t);
    ok("GET parqueadero/summary");
  } catch (e) {
    bad("parqueadero", e.message);
  }

  try {
    let emp = await api("POST", "/rrhh/employees", t, {
      name: "Empleado QA",
      document: `CC${Date.now() % 1e7}`,
      position: "Conductor",
      area: "Operaciones",
    });
    ok("POST employee", emp.name);
    emp = await api("PATCH", `/rrhh/employees/${emp.id}`, t, {
      status: "MEDICAL",
      position: "Conductor senior",
    });
    ok("PATCH employee", emp.status);
  } catch (e) {
    bad("rrhh", e.message);
  }

  try {
    let tk = await api("POST", "/atencion/tickets", t, {
      subject: "Ticket QA",
      requester: "Cliente QA",
      message: "Consulta de prueba",
      channel: "PHONE",
      priority: "HIGH",
    });
    ok("POST ticket", tk.code);
    tk = await api("PATCH", `/atencion/tickets/${tk.id}`, t, {
      priority: "MEDIUM",
    });
    ok("PATCH ticket priority", tk.priority);
    tk = await api("PATCH", `/atencion/tickets/${tk.id}/status`, t, {
      status: "IN_PROGRESS",
    });
    tk = await api("PATCH", `/atencion/tickets/${tk.id}/status`, t, {
      status: "RESOLVED",
    });
    ok("PATCH ticket RESOLVED", tk.status);
  } catch (e) {
    bad("atencion", e.message);
  }

  try {
    let ev = await api("POST", "/calidad/events", t, {
      type: "INCIDENT",
      title: "Incidente QA",
      score: 3,
    });
    ok("POST calidad", ev.title);
    ev = await api("PATCH", `/calidad/events/${ev.id}`, t, { status: "CLOSED" });
    ok("PATCH calidad CLOSED", ev.status);
    await api("GET", "/calidad/summary", t);
    ok("GET calidad/summary");
  } catch (e) {
    bad("calidad", e.message);
  }

  try {
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 180 * 864e5).toISOString().slice(0, 10);
    let fuec = await api("POST", "/juridico/fuec", t, {
      number: `FUEC-QA-${Date.now() % 10000}`,
      contractor: "Contratante QA",
      route: "Bogota-Cali",
      validFrom: from,
      validTo: to,
      vehicleId: veh.id,
    });
    ok("POST fuec", fuec.number);
    fuec = await api("PATCH", `/juridico/fuec/${fuec.id}`, t, {
      status: "VALID",
      route: "Bogota-Palmira",
    });
    ok("PATCH fuec", fuec.status);
  } catch (e) {
    bad("juridico", e.message);
  }

  try {
    let sf = await api("POST", "/sarlaft/checks", t, {
      subjectName: "Cliente QA",
      subjectDoc: "900111222-3",
      risk: "LOW",
      customerId: cust.id,
    });
    ok("POST sarlaft", sf.subjectName);
    sf = await api("PATCH", `/sarlaft/checks/${sf.id}`, t, { risk: "MEDIUM" });
    ok("PATCH sarlaft", sf.risk);
  } catch (e) {
    bad("sarlaft", e.message);
  }

  try {
    let doc = await api("POST", "/archivo/documents", t, {
      title: "Doc QA",
      category: "CONTRACT",
      tags: "qa,test",
    });
    ok("POST archivo", doc.title);
    doc = await api("PATCH", `/archivo/documents/${doc.id}`, t, {
      title: "Doc QA editado",
      tags: "qa",
    });
    ok("PATCH archivo", doc.title);
    await api("POST", `/archivo/documents/${doc.id}/delete`, t);
    ok("DELETE archivo");
  } catch (e) {
    bad("archivo", e.message);
  }

  try {
    let vis = await api("POST", "/recepcion/visitors", t, {
      name: "Visitante QA",
      document: "CC123",
      hostName: "Ana CEO",
      purpose: "Reunion",
      company: "QA Corp",
    });
    ok("POST visitante", vis.name);
    vis = await api("PATCH", `/recepcion/visitors/${vis.id}`, t, {
      purpose: "Auditoria",
    });
    ok("PATCH visitante", vis.purpose);
    await api("PATCH", `/recepcion/visitors/${vis.id}/checkout`, t);
    ok("checkout visitante");
  } catch (e) {
    bad("recepcion", e.message);
  }

  try {
    let f = await api("POST", "/revisoria/findings", t, {
      title: "Hallazgo QA",
      detail: "Detalle de prueba",
      severity: "HIGH",
      amount: 100000,
    });
    ok("POST hallazgo", f.code);
    f = await api("PATCH", `/revisoria/findings/${f.id}`, t, { status: "CLOSED" });
    ok("PATCH hallazgo", f.status);
  } catch (e) {
    bad("revisoria", e.message);
  }

  try {
    const h = await api("GET", "/sistemas/health", t);
    ok("GET sistemas/health", `db=${h.db}`);
    let al = await api("POST", "/sistemas/alerts", t, {
      severity: "WARN",
      source: "QA",
      message: "Alerta de prueba",
    });
    ok("POST alert", al.message);
    al = await api("PATCH", `/sistemas/alerts/${al.id}/resolve`, t);
    ok("PATCH alert resolve", String(al.resolved));
  } catch (e) {
    bad("sistemas", e.message);
  }

  try {
    const users = await api("GET", "/users", t);
    ok("GET users", `count=${users.length}`);
    const u = users.find((x) => x.email === "atencion@fsg.co");
    const u2 = await api("PATCH", `/users/${u.id}`, t, {
      name: "Pedro Atencion QA",
    });
    ok("PATCH user name", u2.name);
    await api("PATCH", `/users/${u.id}`, t, { name: "Pedro Atencion" });
  } catch (e) {
    bad("usuarios", e.message);
  }

  try {
    await api("GET", "/apps/overview", t);
    ok("GET apps/overview");
  } catch (e) {
    bad("apps/overview", e.message);
  }

  try {
    const cond = await login("conductor@fsg.co");
    const mt = await api("GET", "/logistics/my-trips", cond.accessToken);
    ok(
      "GET my-trips conductor",
      `driver=${mt.driver?.name} trips=${mt.trips?.length}`,
    );
  } catch (e) {
    bad("my-trips", e.message);
  }

  try {
    await api("POST", "/logistics/trips", tFin, {
      origin: "X",
      destination: "Y",
      scheduledAt: new Date().toISOString(),
    });
    bad("finanzas bloqueada en logistica", "permitio crear viaje");
  } catch (e) {
    if (e.status === 403) ok("finanzas bloqueada en logistica (403)");
    else bad("finanzas bloqueada en logistica", e.message);
  }

  console.log("\n=== RESUMEN ===");
  console.log(`OK:   ${pass}`);
  console.log(`FAIL: ${fail}`);
  console.log(`Total: ${pass + fail}`);
  if (fails.length) {
    console.log("\nFallos:");
    for (const f of fails) console.log(` - ${f.name}: ${f.detail}`);
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
