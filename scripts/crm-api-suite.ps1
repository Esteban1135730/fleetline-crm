# Full CRM API regression suite
$ErrorActionPreference = "Continue"
$base = "http://localhost:4000"
$pass = 0
$fail = 0
$results = @()

function Ok($name, $detail = "") {
  $script:pass++
  $script:results += [pscustomobject]@{ Status = "OK"; Test = $name; Detail = $detail }
  Write-Host "OK  $name $detail" -ForegroundColor Green
}
function Fail($name, $detail) {
  $script:fail++
  $script:results += [pscustomobject]@{ Status = "FAIL"; Test = $name; Detail = "$detail" }
  Write-Host "FAIL $name - $detail" -ForegroundColor Red
}

function Login($email) {
  $r = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body (@{ email = $email; password = "fsg2026" } | ConvertTo-Json)
  return $r
}

function H($token) { @{ Authorization = "Bearer $token" } }

function Req($method, $path, $token, $body = $null) {
  $params = @{
    Uri = "$base$path"
    Method = $method
    Headers = (H $token)
  }
  if ($null -ne $body) {
    $params.ContentType = "application/json"
    $params.Body = ($body | ConvertTo-Json -Depth 8)
  }
  return Invoke-RestMethod @params
}

# Wait for API
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  try {
    Invoke-RestMethod -Uri "$base/health" -TimeoutSec 2 | Out-Null
    $ready = $true
    break
  } catch { Start-Sleep 2 }
}
if (-not $ready) {
  Write-Host "API no disponible en $base" -ForegroundColor Red
  exit 1
}

Write-Host "`n=== CRM FULL API SUITE ===`n"

# --- AUTH ---
try {
  $ceo = Login "ceo@fsg.co"
  Ok "auth/login ceo" $ceo.user.email
} catch { Fail "auth/login ceo" $_.Exception.Message; exit 1 }
$t = $ceo.accessToken

try {
  $me = Req GET "/auth/me" $t
  Ok "auth/me" $me.email
} catch { Fail "auth/me" $_.Exception.Message }

try {
  $fin = Login "fin@fsg.co"
  Ok "auth/login fin" $fin.user.email
} catch { Fail "auth/login fin" $_.Exception.Message }
$tFin = $fin.accessToken

try {
  $desp = Login "despacho@fsg.co"
  Ok "auth/login despacho" $desp.user.email
} catch { Fail "auth/login despacho" $_.Exception.Message }
$tDesp = $desp.accessToken

# --- DASHBOARD ---
foreach ($p in @("/dashboard/metrics", "/dashboard/charts", "/dashboard/ticker")) {
  try {
    $null = Req GET $p $t
    Ok "GET $p"
  } catch { Fail "GET $p" $_.Exception.Message }
}

# --- COMERCIAL ---
try {
  $cust = Req POST "/comercial/customers" $t @{
    name = "Cliente QA $(Get-Random -Maximum 9999)"
    nit = "900$(Get-Random -Maximum 999999)-1"
    segment = "B2B"
    email = "qa@test.co"
    phone = "3001234567"
  }
  Ok "POST customers" $cust.name
  $cust = Req PATCH "/comercial/customers/$($cust.id)" $t @{ phone = "3109998877" }
  Ok "PATCH customers" $cust.phone
} catch { Fail "customers CRUD" $_.Exception.Message }

try {
  $null = Req GET "/comercial/customers" $tFin
  Ok "finanzas GET customers (sin 403)"
} catch { Fail "finanzas GET customers" $_.Exception.Message }

try {
  $quote = Req POST "/comercial/quotes" $t @{
    customerId = $cust.id
    amount = 2500000
    notes = "Ruta QA Bogotá-Cali"
  }
  Ok "POST quotes" $quote.code
  $quote = Req PATCH "/comercial/quotes/$($quote.id)/status" $t @{ status = "SENT" }
  Ok "PATCH quote SENT" $quote.status
  $quote = Req PATCH "/comercial/quotes/$($quote.id)/status" $t @{ status = "APPROVED" }
  Ok "PATCH quote APPROVED" $quote.status
  $ctrFromQ = Req POST "/comercial/quotes/$($quote.id)/to-contract" $t @{}
  Ok "POST quote->contract" $ctrFromQ.code
} catch { Fail "quotes flow" $_.Exception.Message }

try {
  $start = (Get-Date).ToString("yyyy-MM-dd")
  $end = (Get-Date).AddYears(1).ToString("yyyy-MM-dd")
  $ctr = Req POST "/comercial/contracts" $t @{
    name = "Contrato QA"
    customerId = $cust.id
    channel = "PRIVATE"
    route = "Bogotá -> Cali"
    startDate = $start
    endDate = $end
    monthlyValue = 1800000
  }
  Ok "POST contracts" $ctr.code
  $ctr = Req PATCH "/comercial/contracts/$($ctr.id)" $t @{ status = "SUSPENDED"; route = "Bogotá -> Palmira" }
  Ok "PATCH contract" "$($ctr.status) $($ctr.route)"
  $ctr = Req PATCH "/comercial/contracts/$($ctr.id)" $t @{ status = "ACTIVE" }
  Ok "PATCH contract ACTIVE" $ctr.status
} catch { Fail "contracts" $_.Exception.Message }

# --- FLEET / TALLER ---
$plate = "QA$((Get-Random -Maximum 999).ToString('000'))"
try {
  $veh = Req POST "/fleet/vehicles" $t @{
    plate = $plate
    brand = "Chevrolet"
    model = "NPR"
    year = 2022
    capacity = 20
  }
  Ok "POST vehicles" $veh.plate
  $veh = Req PATCH "/fleet/vehicles/$($veh.id)" $t @{ status = "MAINTENANCE" }
  Ok "PATCH vehicle status" $veh.status
  $wo = Req POST "/fleet/work-orders" $t @{ vehicleId = $veh.id; description = "Frenos QA" }
  Ok "POST work-order" $wo.code
  $wo = Req PATCH "/fleet/work-orders/$($wo.id)" $t @{ status = "IN_PROGRESS" }
  Ok "PATCH WO IN_PROGRESS" $wo.status
  $wo = Req PATCH "/fleet/work-orders/$($wo.id)" $t @{ status = "DONE" }
  Ok "PATCH WO DONE" $wo.status
  $veh = Req PATCH "/fleet/vehicles/$($veh.id)" $t @{ status = "AVAILABLE" }
} catch { Fail "fleet/taller" $_.Exception.Message }

# --- LOGISTICS ---
try {
  $drv = Req POST "/logistics/drivers" $t @{
    name = "Conductor QA"
    document = "CC$(Get-Random -Maximum 99999999)"
    phone = "3001112233"
    license = "C2"
  }
  Ok "POST drivers" $drv.name
  $drv = Req PATCH "/logistics/drivers/$($drv.id)" $t @{ active = $false }
  Ok "PATCH driver inactive" "$($drv.active)"
  $drv = Req PATCH "/logistics/drivers/$($drv.id)" $t @{ active = $true }

  $trip = Req POST "/logistics/trips" $t @{
    origin = "Bogotá"
    destination = "Cali"
    scheduledAt = (Get-Date).ToString("o")
    contractId = $ctr.id
    vehicleId = $veh.id
    driverId = $drv.id
    fareAmount = 1800000
  }
  Ok "POST trip (hereda cliente)" "customer=$($trip.customerId) code=$($trip.code)"
  if (-not $trip.customerId) { Fail "trip hereda customerId" "null" } else { Ok "trip.customerId seteado" $trip.customerId }

  $trip = Req PATCH "/logistics/trips/$($trip.id)/status" $t @{ status = "IN_TRANSIT" }
  Ok "trip IN_TRANSIT" $trip.status
  $trip = Req PATCH "/logistics/trips/$($trip.id)/incident" $t @{ notes = "Demora QA en peaje" }
  Ok "trip incident" $trip.status
  $trip = Req PATCH "/logistics/trips/$($trip.id)/status" $t @{ status = "IN_TRANSIT" }
  $trip = Req PATCH "/logistics/trips/$($trip.id)/status" $t @{ status = "COMPLETED" }
  Ok "trip COMPLETED" $trip.status

  $gps = Req PATCH "/logistics/gps/$($veh.id)" $t @{ lat = 4.60971; lng = -74.08175 }
  Ok "PATCH gps web" "$($gps.plate) $($gps.lat),$($gps.lng)"

  $invTrip = Req POST "/logistics/trips/$($trip.id)/invoice" $t
  Ok "POST trip invoice" $invTrip.number
  try {
    $null = Req POST "/logistics/trips/$($trip.id)/invoice" $t
    Fail "bloquea factura duplicada" "permitió segunda factura"
  } catch { Ok "bloquea factura duplicada" }
} catch { Fail "logistics flow" $_.Exception.Message }

# --- FINANCE ---
try {
  $due = (Get-Date).AddDays(15).ToString("yyyy-MM-dd")
  $inv = Req POST "/finance/invoices" $tFin @{
    type = "RECEIVABLE"
    amount = 500000
    dueDate = $due
    customerId = $cust.id
    description = "CxC QA manual"
  }
  Ok "POST invoice CxC" $inv.number
  $inv = Req PATCH "/finance/invoices/$($inv.id)" $tFin @{ description = "CxC QA editada" }
  Ok "PATCH invoice" $inv.description
  $inv = Req PATCH "/finance/invoices/$($inv.id)/pay" $tFin
  Ok "PATCH pay" $inv.status

  $cxp = Req POST "/finance/invoices" $tFin @{
    type = "PAYABLE"
    amount = 200000
    dueDate = $due
    supplierName = "Proveedor QA"
    description = "CxP QA"
  }
  Ok "POST invoice CxP" $cxp.number
  $cxp = Req PATCH "/finance/invoices/$($cxp.id)/pay" $tFin
  Ok "PATCH pay CxP" $cxp.status

  $sum = Req GET "/finance/summary" $tFin
  Ok "GET finance/summary" "cxcOpen=$($sum.cxcOpen)"
} catch { Fail "finance" $_.Exception.Message }

# --- ACCOUNTING ---
try {
  $accs = Req GET "/accounting/accounts" $tFin
  Ok "GET accounts" "count=$($accs.Count)"
  $j = Req GET "/accounting/journal" $tFin
  Ok "GET journal" "count=$($j.Count)"
  $tb = Req GET "/accounting/trial-balance" $tFin
  Ok "GET trial-balance" "rows=$($tb.Count)"
  $a1305 = $accs | Where-Object { $_.code -eq "1305" } | Select-Object -First 1
  $a1110 = $accs | Where-Object { $_.code -eq "1110" } | Select-Object -First 1
  $entry = Req POST "/accounting/journal" $tFin @{
    description = "Asiento QA manual"
    lines = @(
      @{ accountId = $a1110.id; debit = 1000; credit = 0 }
      @{ accountId = $a1305.id; debit = 0; credit = 1000 }
    )
  }
  Ok "POST journal" $entry.number
  $voided = Req PATCH "/accounting/journal/$($entry.id)/void" $tFin
  Ok "PATCH journal void" $voided.status
} catch { Fail "accounting" $_.Exception.Message }

# --- COMPRAS ---
try {
  $po = Req POST "/compras/orders" $t @{
    description = "Repuestos QA"
    supplier = "Repuestos SA"
    amount = 350000
    category = "TALLER"
  }
  Ok "POST compra" $po.code
  $po = Req PATCH "/compras/orders/$($po.id)/status" $t @{ status = "APPROVED" }
  $po = Req PATCH "/compras/orders/$($po.id)/status" $t @{ status = "ORDERED" }
  $po = Req PATCH "/compras/orders/$($po.id)/status" $t @{ status = "RECEIVED" }
  Ok "compra RECEIVED" $po.status
  $invoices = Req GET "/finance/invoices" $tFin
  $fromPo = $invoices | Where-Object { $_.description -like "*$($po.code)*" } | Select-Object -First 1
  if ($fromPo) { Ok "compra->CxP auto" $fromPo.number } else { Fail "compra->CxP auto" "no encontrada" }
} catch { Fail "compras" $_.Exception.Message }

# --- TRAMITES ---
try {
  $proc = Req POST "/tramites/procedures" $t @{
    vehicleId = $veh.id
    type = "SOAT"
    reference = "SOAT-QA-1"
    validTo = (Get-Date).AddMonths(12).ToString("yyyy-MM-dd")
  }
  Ok "POST tramite" $proc.type
  $proc = Req PATCH "/tramites/procedures/$($proc.id)" $t @{ status = "VALID" }
  Ok "PATCH tramite" $proc.status
} catch { Fail "tramites" $_.Exception.Message }

# --- PARQUEADERO ---
try {
  $park = Req POST "/parqueadero/checkin" $t @{
    plate = $veh.plate
    vehicleId = $veh.id
    notes = "Ingreso QA"
  }
  Ok "POST parqueadero checkin" $park.plate
  $park = Req PATCH "/parqueadero/checkout/$($park.id)" $t
  Ok "PATCH parqueadero checkout" "$($park.checkOut)"
  $null = Req GET "/parqueadero/summary" $t
  Ok "GET parqueadero/summary"
} catch { Fail "parqueadero" $_.Exception.Message }

# --- RRHH ---
try {
  $emp = Req POST "/rrhh/employees" $t @{
    name = "Empleado QA"
    document = "CC$(Get-Random -Maximum 9999999)"
    position = "Conductor"
    area = "Operaciones"
  }
  Ok "POST employee" $emp.name
  $emp = Req PATCH "/rrhh/employees/$($emp.id)" $t @{ status = "MEDICAL"; position = "Conductor senior" }
  Ok "PATCH employee" $emp.status
} catch { Fail "rrhh" $_.Exception.Message }

# --- ATENCION ---
try {
  $tk = Req POST "/atencion/tickets" $t @{
    subject = "Ticket QA"
    channel = "PHONE"
    priority = "HIGH"
  }
  Ok "POST ticket" $tk.code
  $tk = Req PATCH "/atencion/tickets/$($tk.id)" $t @{ priority = "MEDIUM" }
  Ok "PATCH ticket priority" $tk.priority
  $tk = Req PATCH "/atencion/tickets/$($tk.id)/status" $t @{ status = "IN_PROGRESS" }
  $tk = Req PATCH "/atencion/tickets/$($tk.id)/status" $t @{ status = "RESOLVED" }
  Ok "PATCH ticket RESOLVED" $tk.status
} catch { Fail "atencion" $_.Exception.Message }

# --- CALIDAD ---
try {
  $ev = Req POST "/calidad/events" $t @{ type = "INCIDENT"; title = "Incidente QA"; score = 3 }
  Ok "POST calidad" $ev.title
  $ev = Req PATCH "/calidad/events/$($ev.id)" $t @{ status = "CLOSED" }
  Ok "PATCH calidad CLOSED" $ev.status
  $null = Req GET "/calidad/summary" $t
  Ok "GET calidad/summary"
} catch { Fail "calidad" $_.Exception.Message }

# --- JURIDICO ---
try {
  $fuec = Req POST "/juridico/fuec" $t @{
    number = "FUEC-QA-$(Get-Random -Maximum 9999)"
    route = "Bogotá-Cali"
    validTo = (Get-Date).AddMonths(6).ToString("yyyy-MM-dd")
    vehicleId = $veh.id
  }
  Ok "POST fuec" $fuec.number
  $fuec = Req PATCH "/juridico/fuec/$($fuec.id)" $t @{ status = "VALID"; route = "Bogotá-Palmira" }
  Ok "PATCH fuec" $fuec.status
} catch { Fail "juridico" $_.Exception.Message }

# --- SARLAFT ---
try {
  $sf = Req POST "/sarlaft/checks" $t @{
    subject = "Cliente QA"
    risk = "LOW"
    customerId = $cust.id
  }
  Ok "POST sarlaft" $sf.subject
  $sf = Req PATCH "/sarlaft/checks/$($sf.id)" $t @{ risk = "MEDIUM" }
  Ok "PATCH sarlaft" $sf.risk
} catch { Fail "sarlaft" $_.Exception.Message }

# --- ARCHIVO ---
try {
  $doc = Req POST "/archivo/documents" $t @{
    title = "Doc QA"
    category = "CONTRACT"
    tags = "qa,test"
  }
  Ok "POST archivo" $doc.title
  $doc = Req PATCH "/archivo/documents/$($doc.id)" $t @{ title = "Doc QA editado"; tags = "qa" }
  Ok "PATCH archivo" $doc.title
  $null = Req POST "/archivo/documents/$($doc.id)/delete" $t
  Ok "DELETE archivo"
} catch { Fail "archivo" $_.Exception.Message }

# --- RECEPCION ---
try {
  $vis = Req POST "/recepcion/visitors" $t @{
    name = "Visitante QA"
    document = "CC123"
    host = "Ana CEO"
    reason = "Reunión"
    company = "QA Corp"
  }
  Ok "POST visitante" $vis.name
  $vis = Req PATCH "/recepcion/visitors/$($vis.id)" $t @{ reason = "Auditoría" }
  Ok "PATCH visitante" $vis.reason
  $vis = Req PATCH "/recepcion/visitors/$($vis.id)/checkout" $t
  Ok "checkout visitante"
} catch { Fail "recepcion" $_.Exception.Message }

# --- REVISORIA ---
try {
  $f = Req POST "/revisoria/findings" $t @{
    title = "Hallazgo QA"
    detail = "Detalle de prueba"
    severity = "HIGH"
    amount = 100000
  }
  Ok "POST hallazgo" $f.code
  $f = Req PATCH "/revisoria/findings/$($f.id)" $t @{ status = "CLOSED" }
  Ok "PATCH hallazgo" $f.status
} catch { Fail "revisoria" $_.Exception.Message }

# --- SISTEMAS ---
try {
  $h = Req GET "/sistemas/health" $t
  Ok "GET sistemas/health" "db=$($h.db)"
  $al = Req POST "/sistemas/alerts" $t @{
    severity = "WARN"
    source = "QA"
    message = "Alerta de prueba"
  }
  Ok "POST alert" $al.message
  $al = Req PATCH "/sistemas/alerts/$($al.id)/resolve" $t
  Ok "PATCH alert resolve" "$($al.resolved)"
} catch { Fail "sistemas" $_.Exception.Message }

# --- USUARIOS ---
try {
  $users = Req GET "/users" $t
  Ok "GET users" "count=$($users.Count)"
  $u = $users | Where-Object { $_.email -eq "atencion@fsg.co" } | Select-Object -First 1
  $u2 = Req PATCH "/users/$($u.id)" $t @{ name = "Pedro Atención QA" }
  Ok "PATCH user name" $u2.name
  $u2 = Req PATCH "/users/$($u.id)" $t @{ name = "Pedro Atención" }
} catch { Fail "usuarios" $_.Exception.Message }

# --- APPS / HEALTH ---
try {
  $null = Req GET "/apps/overview" $t
  Ok "GET apps/overview"
} catch { Fail "apps/overview" $_.Exception.Message }

try {
  $null = Invoke-RestMethod -Uri "$base/health"
  Ok "GET /health"
} catch { Fail "GET /health" $_.Exception.Message }

# --- MY-TRIPS conductor ---
try {
  $cond = Login "conductor@fsg.co"
  $mt = Req GET "/logistics/my-trips" $cond.accessToken
  Ok "GET my-trips conductor" "driver=$($mt.driver.name) trips=$($mt.trips.Count)"
} catch { Fail "my-trips" $_.Exception.Message }

# --- PERMISOS: finanzas no debería crear viajes (si ModulesGuard lo bloquea) ---
try {
  $null = Req POST "/logistics/trips" $tFin @{
    origin = "X"; destination = "Y"; scheduledAt = (Get-Date).ToString("o")
  }
  Fail "finanzas bloqueada en logística" "permitió crear viaje"
} catch { Ok "finanzas bloqueada en logística (403 esperado)" }

Write-Host "`n=== RESUMEN ==="
Write-Host "OK:   $pass" -ForegroundColor Green
Write-Host "FAIL: $fail" -ForegroundColor $(if ($fail -gt 0) { "Red" } else { "Green" })
Write-Host "Total: $($pass + $fail)"
$results | Where-Object { $_.Status -eq "FAIL" } | Format-Table -AutoSize
if ($fail -gt 0) { exit 1 } else { exit 0 }

