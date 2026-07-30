const fs = require("fs");
const p =
  "c:/Users/Esteban/Documents/proyectos nuevos/crmtrasporte/apps/api/src/modules/modules.controller.ts";
let s = fs.readFileSync(p, "utf8");
const map = [
  ["rrhh/employees", "rrhh"],
  ["atencion/tickets", "atencion"],
  ["calidad/events", "calidad"],
  ["calidad/summary", "calidad"],
  ["juridico/fuec", "juridico"],
  ["sarlaft/checks", "sarlaft"],
  ["archivo/documents", "archivo"],
  ["recepcion/visitors", "recepcion"],
  ["sistemas/alerts", "sistemas"],
  ["sistemas/health", "sistemas"],
  ["revisoria/findings", "revisoria"],
  ["apps/overview", "apps"],
  ["compras/orders", "compras"],
  ["tramites/procedures", "tramites"],
  ["parqueadero/logs", "parqueadero"],
  ["parqueadero/summary", "parqueadero"],
  ["parqueadero/checkin", "parqueadero"],
  ["parqueadero/checkout", "parqueadero"],
];
for (const [route, mod] of map) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(@(?:Get|Post|Patch)\\("${escaped}[^"]*"\\)\\s*\\n)(?!\\s*@RequireModule)`,
    "g",
  );
  s = s.replace(re, `$1  @RequireModule("${mod}")\n`);
}
fs.writeFileSync(p, s);
console.log("ok");
