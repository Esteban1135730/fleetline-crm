/**
 * Matriz RBAC Fleetline — scopes por rol (sin inventar altas de usuario).
 * Usado por API Guards y por UI (useHasPermission / <Can />).
 */

export type PermissionAction =
  | "CREATE"
  | "READ"
  | "UPDATE"
  | "DELETE"
  | "MONITOR"
  | "AUDIT"
  | "ANALYZE";

export type PermissionResource =
  | "visitas"
  | "omnicanal"
  | "crm_comercial"
  | "qhse_pqrs"
  | "torre_rutas"
  | "finanzas"
  | "rrhh"
  | "contratos"
  | "logistica_despacho"
  | "mis_viajes"
  | "personal"
  | "nomina"
  | "recepcion"
  | "usuarios_roles"
  | "integraciones"
  | "helpdesk_ti"
  | "infra_monitoreo"
  | "audit_forense"
  | "contabilidad"
  | "archivo_digital"
  | "custodia_fisica"
  | "inventario_papeleria"
  | "tramites"
  | "taller"
  | "cxp_proveedores"
  | "legalizacion_gastos"
  | "conciliacion_bancaria"
  | "facturacion_clientes"
  | "puc"
  | "tesoreria_dispersion"
  | "gastos_ruta"
  | "facturacion_electronica"
  | "compras_proveedores"
  | "compras_oc"
  | "parada_flota"
  | "override_operativo"
  | "campo_radar"
  | "campo_abordaje"
  | "campo_auditoria"
  | "watchtower_radar"
  | "watchtower_sos"
  | "watchtower_iot"
  | "hallazgos_ci"
  | "smart_audit_fuel"
  | "founders_canvas"
  | "jarvis_ai"
  | "capex_approve"
  | "defcon_crisis"
  | "vinculaciones_afiliados"
  | "vinculaciones_conductores"
  | "vinculaciones_ocr"
  | "balance_scorecard"
  | "gerencia_override"
  | "gerencia_approvals"
  | "legal_contracts"
  | "legal_litigation"
  | "legal_sarlaft"
  | "legal_evidence"
  | "fiscal_dictamen"
  | "fiscal_hard_lock"
  | "fiscal_impuestos"
  | "fiscal_drilldown"
  | "taller_ot"
  | "taller_inventario"
  | "taller_despacho"
  | "taller_mecanico"
  | "taller_qc"
  | "parada_flota_taller"
  | "patio_acceso"
  | "patio_parqueo"
  | "patio_lavado"
  | "pilot_preop"
  | "pilot_sos"
  | "pilot_viatico"
  | "subgerencia_conflicto"
  | "subgerencia_proyectos";

/** Acciones permitidas por recurso; vacío / omitido = denegado */
export type RolePermissionMap = Partial<
  Record<PermissionResource, readonly PermissionAction[]>
>;

export const ROLE_PERMISSIONS: Record<string, RolePermissionMap> = {
  platform_master: {
    visitas: ["CREATE", "READ", "UPDATE", "DELETE"],
    omnicanal: ["CREATE", "READ", "UPDATE", "DELETE"],
    crm_comercial: ["CREATE", "READ", "UPDATE", "DELETE"],
    qhse_pqrs: ["CREATE", "READ", "UPDATE", "DELETE"],
    torre_rutas: ["CREATE", "READ", "UPDATE", "DELETE"],
    finanzas: ["CREATE", "READ", "UPDATE", "DELETE"],
    rrhh: ["CREATE", "READ", "UPDATE", "DELETE"],
    contratos: ["CREATE", "READ", "UPDATE", "DELETE"],
    logistica_despacho: ["CREATE", "READ", "UPDATE", "DELETE"],
    mis_viajes: ["CREATE", "READ", "UPDATE", "DELETE"],
    personal: ["CREATE", "READ", "UPDATE", "DELETE"],
    nomina: ["CREATE", "READ", "UPDATE", "DELETE"],
    recepcion: ["CREATE", "READ", "UPDATE", "DELETE"],
    usuarios_roles: ["CREATE", "READ", "UPDATE", "DELETE"],
    integraciones: ["CREATE", "READ", "UPDATE", "DELETE"],
    helpdesk_ti: ["CREATE", "READ", "UPDATE", "DELETE"],
    infra_monitoreo: ["CREATE", "READ", "UPDATE", "DELETE"],
    audit_forense: ["CREATE", "READ", "UPDATE", "DELETE"],
    contabilidad: ["CREATE", "READ", "UPDATE", "DELETE"],
    archivo_digital: ["CREATE", "READ", "UPDATE", "DELETE"],
    custodia_fisica: ["CREATE", "READ", "UPDATE", "DELETE"],
    inventario_papeleria: ["CREATE", "READ", "UPDATE", "DELETE"],
    tramites: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller_ot: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller_inventario: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller_despacho: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller_mecanico: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller_qc: ["CREATE", "READ", "UPDATE", "DELETE"],
    parada_flota_taller: ["CREATE", "READ", "UPDATE", "DELETE"],
    patio_acceso: ["CREATE", "READ", "UPDATE", "DELETE"],
    patio_parqueo: ["CREATE", "READ", "UPDATE", "DELETE"],
    patio_lavado: ["CREATE", "READ", "UPDATE", "DELETE"],
    pilot_preop: ["CREATE", "READ", "UPDATE", "DELETE"],
    pilot_sos: ["CREATE", "READ", "UPDATE", "DELETE"],
    pilot_viatico: ["CREATE", "READ", "UPDATE", "DELETE"],
    subgerencia_conflicto: ["CREATE", "READ", "UPDATE", "DELETE"],
    subgerencia_proyectos: ["CREATE", "READ", "UPDATE", "DELETE"],
    cxp_proveedores: ["CREATE", "READ", "UPDATE", "DELETE"],
    legalizacion_gastos: ["CREATE", "READ", "UPDATE", "DELETE"],
    conciliacion_bancaria: ["CREATE", "READ", "UPDATE", "DELETE"],
    facturacion_clientes: ["CREATE", "READ", "UPDATE", "DELETE"],
    puc: ["CREATE", "READ", "UPDATE", "DELETE"],
    tesoreria_dispersion: ["CREATE", "READ", "UPDATE", "DELETE"],
    gastos_ruta: ["CREATE", "READ", "UPDATE", "DELETE"],
    facturacion_electronica: ["CREATE", "READ", "UPDATE", "DELETE"],
  },
  org_admin: {
    visitas: ["CREATE", "READ", "UPDATE", "DELETE"],
    omnicanal: ["CREATE", "READ", "UPDATE", "DELETE"],
    crm_comercial: ["CREATE", "READ", "UPDATE", "DELETE"],
    qhse_pqrs: ["CREATE", "READ", "UPDATE", "DELETE"],
    torre_rutas: ["CREATE", "READ", "UPDATE", "DELETE"],
    finanzas: ["CREATE", "READ", "UPDATE", "DELETE"],
    rrhh: ["CREATE", "READ", "UPDATE", "DELETE"],
    contratos: ["CREATE", "READ", "UPDATE", "DELETE"],
    logistica_despacho: ["CREATE", "READ", "UPDATE", "DELETE"],
    mis_viajes: ["READ"],
    personal: ["CREATE", "READ", "UPDATE", "DELETE"],
    nomina: ["CREATE", "READ", "UPDATE", "DELETE"],
    recepcion: ["CREATE", "READ", "UPDATE", "DELETE"],
    usuarios_roles: ["CREATE", "READ", "UPDATE", "DELETE"],
    integraciones: ["CREATE", "READ", "UPDATE", "DELETE"],
    helpdesk_ti: ["CREATE", "READ", "UPDATE", "DELETE"],
    infra_monitoreo: ["READ"],
    audit_forense: ["READ"],
    contabilidad: ["CREATE", "READ", "UPDATE", "DELETE"],
    archivo_digital: ["CREATE", "READ", "UPDATE", "DELETE"],
    custodia_fisica: ["CREATE", "READ", "UPDATE", "DELETE"],
    inventario_papeleria: ["CREATE", "READ", "UPDATE", "DELETE"],
    tramites: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller_ot: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller_inventario: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller_despacho: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller_mecanico: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller_qc: ["CREATE", "READ", "UPDATE", "DELETE"],
    parada_flota_taller: ["CREATE", "READ", "UPDATE", "DELETE"],
    patio_acceso: ["CREATE", "READ", "UPDATE", "DELETE"],
    patio_parqueo: ["CREATE", "READ", "UPDATE", "DELETE"],
    patio_lavado: ["CREATE", "READ", "UPDATE", "DELETE"],
    pilot_preop: ["CREATE", "READ", "UPDATE", "DELETE"],
    pilot_sos: ["CREATE", "READ", "UPDATE", "DELETE"],
    pilot_viatico: ["CREATE", "READ", "UPDATE", "DELETE"],
    subgerencia_conflicto: ["CREATE", "READ", "UPDATE", "DELETE"],
    subgerencia_proyectos: ["CREATE", "READ", "UPDATE", "DELETE"],
    cxp_proveedores: ["CREATE", "READ", "UPDATE", "DELETE"],
    legalizacion_gastos: ["CREATE", "READ", "UPDATE", "DELETE"],
    conciliacion_bancaria: ["CREATE", "READ", "UPDATE", "DELETE"],
    facturacion_clientes: ["CREATE", "READ", "UPDATE", "DELETE"],
    puc: ["CREATE", "READ", "UPDATE", "DELETE"],
    tesoreria_dispersion: ["CREATE", "READ", "UPDATE", "DELETE"],
    gastos_ruta: ["CREATE", "READ", "UPDATE", "DELETE"],
    facturacion_electronica: ["CREATE", "READ", "UPDATE", "DELETE"],
    balance_scorecard: ["READ", "ANALYZE"],
    gerencia_override: ["CREATE", "READ", "UPDATE"],
    gerencia_approvals: ["CREATE", "READ", "UPDATE"],
  },

  /** Módulo 16 — Gerente General / Executive Operations Hub (Mauricio) */
  gerente_general: {
    balance_scorecard: ["CREATE", "READ", "UPDATE", "ANALYZE"],
    gerencia_override: ["CREATE", "READ", "UPDATE", "DELETE"],
    gerencia_approvals: ["CREATE", "READ", "UPDATE"],
    crm_comercial: ["READ", "UPDATE"],
    contratos: ["READ", "UPDATE"],
    finanzas: ["READ", "UPDATE"],
    tesoreria_dispersion: ["READ", "UPDATE"],
    contabilidad: ["READ"],
    logistica_despacho: ["READ", "UPDATE"],
    override_operativo: ["CREATE", "READ", "UPDATE"],
    taller: ["READ", "UPDATE"],
    taller_ot: ["READ", "UPDATE"],
    taller_qc: ["CREATE", "READ", "UPDATE"],
    nomina: ["READ", "UPDATE"],
    compras_oc: ["READ", "UPDATE"],
    compras_proveedores: ["READ", "UPDATE"],
    hallazgos_ci: ["READ", "AUDIT"],
    audit_forense: ["READ", "AUDIT"],
    torre_rutas: ["READ", "MONITOR"],
    watchtower_radar: ["READ", "MONITOR"],
    qhse_pqrs: ["READ"],
    rrhh: ["READ"],
    personal: ["READ"],
    gastos_ruta: ["READ"],
    facturacion_clientes: ["READ"],
  },

  /** Módulo 17 — Director Jurídico / Legal Hub 4.0 (Sofía) */
  director_juridico: {
    legal_contracts: ["CREATE", "READ", "UPDATE", "DELETE"],
    legal_litigation: ["CREATE", "READ", "UPDATE", "DELETE"],
    legal_sarlaft: ["CREATE", "READ", "UPDATE", "DELETE"],
    legal_evidence: ["CREATE", "READ", "UPDATE"],
    contratos: ["CREATE", "READ", "UPDATE", "DELETE"],
    crm_comercial: ["READ", "UPDATE"],
    vinculaciones_afiliados: ["READ", "UPDATE"],
    vinculaciones_conductores: ["READ", "UPDATE"],
    archivo_digital: ["READ", "CREATE"],
    custodia_fisica: ["READ"],
    logistica_despacho: ["READ"],
    torre_rutas: ["READ"],
    taller: ["READ"],
    rrhh: ["READ"],
    personal: ["READ"],
    audit_forense: ["READ", "AUDIT"],
    hallazgos_ci: ["READ"],
    tramites: ["CREATE", "READ", "UPDATE"],
    finanzas: [],
    contabilidad: [],
    tesoreria_dispersion: [],
    nomina: [],
    puc: [],
  },

  /** Alias legado → director jurídico (permisos reducidos compat) */
  juridico: {
    legal_contracts: ["CREATE", "READ", "UPDATE"],
    legal_litigation: ["CREATE", "READ", "UPDATE"],
    legal_sarlaft: ["CREATE", "READ", "UPDATE"],
    legal_evidence: ["CREATE", "READ"],
    contratos: ["CREATE", "READ", "UPDATE"],
    archivo_digital: ["READ"],
    tramites: ["CREATE", "READ", "UPDATE"],
    finanzas: [],
    contabilidad: [],
    tesoreria_dispersion: [],
  },

  /** Módulo 12 — Presidente / Founder's Canvas (Alejandro · God Mode) */
  presidente: {
    founders_canvas: ["READ", "ANALYZE"],
    jarvis_ai: ["CREATE", "READ", "ANALYZE"],
    capex_approve: ["CREATE", "READ", "UPDATE", "ANALYZE"],
    defcon_crisis: ["CREATE", "READ", "UPDATE"],
    finanzas: ["READ", "ANALYZE"],
    contabilidad: ["READ"],
    tesoreria_dispersion: ["READ"],
    logistica_despacho: ["READ"],
    torre_rutas: ["READ"],
    taller: ["READ"],
    rrhh: ["READ"],
    personal: ["READ"],
    nomina: ["READ"],
    compras_oc: ["READ"],
    compras_proveedores: ["READ"],
    crm_comercial: ["READ"],
    contratos: ["READ"],
    qhse_pqrs: ["READ"],
    audit_forense: ["READ", "AUDIT"],
    watchtower_radar: ["READ", "MONITOR"],
    gastos_ruta: ["READ"],
    facturacion_clientes: ["READ"],
  },

  /** Alias legado — Founder's Canvas directivo */
  presidencia: {
    founders_canvas: ["READ", "ANALYZE"],
    jarvis_ai: ["CREATE", "READ", "ANALYZE"],
    capex_approve: ["CREATE", "READ", "UPDATE", "ANALYZE"],
    defcon_crisis: ["CREATE", "READ", "UPDATE"],
    finanzas: ["READ", "ANALYZE"],
    contabilidad: ["READ"],
    tesoreria_dispersion: ["READ"],
    logistica_despacho: ["READ"],
    torre_rutas: ["READ"],
    taller: ["READ"],
    rrhh: ["READ"],
    personal: ["READ"],
    nomina: ["READ"],
    compras_oc: ["READ"],
    crm_comercial: ["READ"],
    contratos: ["READ"],
    qhse_pqrs: ["READ"],
    audit_forense: ["READ"],
    gastos_ruta: ["READ"],
  },

  /** Módulo 1 — Recepcionista (Flor) */
  recepcionista: {
    visitas: ["CREATE", "READ", "UPDATE"],
    omnicanal: ["CREATE", "READ", "UPDATE"],
    crm_comercial: ["CREATE"],
    qhse_pqrs: ["CREATE"],
    torre_rutas: ["READ"],
    recepcion: ["CREATE", "READ", "UPDATE"],
    finanzas: [],
    rrhh: [],
    contratos: [],
    logistica_despacho: [],
    mis_viajes: [],
    personal: [],
    nomina: [],
  },

  conductor: {
    mis_viajes: ["CREATE", "READ", "UPDATE"],
    torre_rutas: ["READ"],
    pilot_preop: ["CREATE", "READ", "UPDATE"],
    pilot_sos: ["CREATE", "READ"],
    pilot_viatico: ["CREATE", "READ"],
  },

  coordinador_patio: {
    patio_acceso: ["CREATE", "READ", "UPDATE", "DELETE"],
    patio_parqueo: ["CREATE", "READ", "UPDATE", "DELETE"],
    patio_lavado: ["CREATE", "READ", "UPDATE", "DELETE"],
    logistica_despacho: ["READ"],
  },

  auxiliar_patio: {
    patio_lavado: ["CREATE", "READ", "UPDATE"],
    patio_parqueo: ["CREATE", "READ", "UPDATE"],
    patio_acceso: ["READ"],
  },

  sub_gerente: {
    subgerencia_conflicto: ["CREATE", "READ", "UPDATE"],
    subgerencia_proyectos: ["CREATE", "READ", "UPDATE", "DELETE"],
    logistica_despacho: ["READ", "UPDATE"],
    taller: ["READ", "UPDATE"],
    taller_ot: ["READ", "UPDATE"],
    torre_rutas: ["READ", "MONITOR"],
    finanzas: ["READ"],
    crm_comercial: ["READ"],
    override_operativo: ["CREATE", "READ", "UPDATE"],
  },

  gestor_comercial: {
    crm_comercial: ["CREATE", "READ", "UPDATE"],
    contratos: ["READ", "CREATE"],
    omnicanal: ["CREATE", "READ", "UPDATE"],
    recepcion: ["READ", "UPDATE"],
    visitas: ["READ"],
    finanzas: [],
    logistica_despacho: [],
    mis_viajes: [],
    override_operativo: [],
    torre_rutas: [],
    taller: [],
    contabilidad: [],
    tesoreria_dispersion: [],
    nomina: [],
  },

  /** Alias de negocio → vinculaciones */
  rrhh: {
    personal: ["CREATE", "READ", "UPDATE"],
    nomina: ["CREATE", "READ", "UPDATE"],
    rrhh: ["CREATE", "READ", "UPDATE"],
  },
  vinculaciones: {
    personal: ["CREATE", "READ", "UPDATE"],
    nomina: ["CREATE", "READ", "UPDATE"],
    rrhh: ["CREATE", "READ", "UPDATE"],
    vinculaciones_afiliados: ["CREATE", "READ", "UPDATE"],
    vinculaciones_conductores: ["CREATE", "READ", "UPDATE"],
    vinculaciones_ocr: ["CREATE", "READ", "UPDATE"],
    archivo_digital: ["CREATE", "READ"],
    finanzas: ["READ"],
    logistica_despacho: [],
    torre_rutas: [],
  },

  /** Módulo 13 — Gestor Vinculaciones / Smart Onboarding (Laura) */
  gestor_vinculaciones: {
    vinculaciones_afiliados: ["CREATE", "READ", "UPDATE"],
    vinculaciones_conductores: ["CREATE", "READ", "UPDATE"],
    vinculaciones_ocr: ["CREATE", "READ", "UPDATE"],
    personal: ["CREATE", "READ", "UPDATE"],
    rrhh: ["READ", "UPDATE"],
    archivo_digital: ["CREATE", "READ"],
    finanzas: ["READ"],
    gastos_ruta: ["READ"],
    tramites: ["CREATE", "READ", "UPDATE"],
    logistica_despacho: [],
    torre_rutas: [],
    mis_viajes: [],
    override_operativo: [],
    tesoreria_dispersion: [],
    nomina: ["READ"],
  },

  /** Módulo 14 — Director Comercial / B2B Pipeline (Felipe) */
  director_comercial: {
    crm_comercial: ["CREATE", "READ", "UPDATE", "DELETE"],
    contratos: ["CREATE", "READ", "UPDATE", "DELETE"],
    finanzas: ["READ", "UPDATE"],
    torre_rutas: ["READ"],
    facturacion_clientes: ["READ", "UPDATE"],
    omnicanal: ["READ"],
    visitas: ["READ"],
    logistica_despacho: [],
    mis_viajes: [],
    override_operativo: [],
    taller: [],
    contabilidad: [],
    tesoreria_dispersion: [],
    nomina: [],
    puc: [],
  },

  /** Módulo 15 — Coordinador Comercial / Licitaciones (Sergio) */
  coordinador_comercial: {
    crm_comercial: ["CREATE", "READ", "UPDATE", "DELETE"],
    contratos: ["CREATE", "READ", "UPDATE"],
    omnicanal: ["CREATE", "READ", "UPDATE"],
    recepcion: ["READ", "UPDATE"],
    torre_rutas: ["READ"],
    visitas: ["READ"],
    archivo_digital: ["READ"],
    finanzas: [],
    contabilidad: [],
    tesoreria_dispersion: [],
    logistica_despacho: [],
    mis_viajes: [],
    override_operativo: [],
    taller: [],
    nomina: [],
    puc: [],
  },

  /** Supervisor logística / centro de control */
  supervisor_logistica: {
    torre_rutas: ["CREATE", "READ", "UPDATE", "DELETE"],
    logistica_despacho: ["CREATE", "READ", "UPDATE", "DELETE"],
    mis_viajes: ["READ", "UPDATE"],
  },
  centro_control: {
    watchtower_radar: ["READ", "MONITOR", "UPDATE"],
    watchtower_sos: ["CREATE", "READ", "UPDATE"],
    watchtower_iot: ["CREATE", "READ", "UPDATE"],
    torre_rutas: ["READ", "UPDATE"],
    logistica_despacho: ["READ", "UPDATE"],
    mis_viajes: ["READ", "UPDATE"],
    qhse_pqrs: ["CREATE", "READ"],
    finanzas: [],
    nomina: [],
    contratos: [],
    contabilidad: [],
    tesoreria_dispersion: [],
  },

  /** Módulo 10 — Operador Centro de Control / Watchtower (Valeria) */
  operador_centro_control: {
    watchtower_radar: ["READ", "MONITOR", "UPDATE"],
    watchtower_sos: ["CREATE", "READ", "UPDATE"],
    watchtower_iot: ["CREATE", "READ", "UPDATE"],
    torre_rutas: ["READ", "UPDATE"],
    logistica_despacho: ["READ", "UPDATE"],
    mis_viajes: ["READ", "UPDATE"],
    qhse_pqrs: ["CREATE"],
    campo_radar: ["READ"],
    finanzas: [],
    nomina: [],
    contratos: [],
    contabilidad: [],
    tesoreria_dispersion: [],
    crm_comercial: [],
    facturacion_clientes: [],
  },
  gestor_operativo: {
    torre_rutas: ["CREATE", "READ", "UPDATE"],
    logistica_despacho: ["CREATE", "READ", "UPDATE"],
    override_operativo: ["CREATE", "READ", "UPDATE"],
    mis_viajes: ["CREATE", "READ", "UPDATE"],
    taller: ["READ"],
    tramites: ["READ"],
    rrhh: ["READ"],
    personal: ["READ"],
    contratos: ["READ"],
    crm_comercial: ["READ"],
    visitas: ["READ"],
    omnicanal: ["READ"],
    campo_radar: ["READ"],
    campo_abordaje: ["READ", "UPDATE"],
    campo_auditoria: ["CREATE", "READ"],
    finanzas: [],
    contabilidad: [],
    tesoreria_dispersion: [],
    nomina: [],
    facturacion_clientes: [],
    facturacion_electronica: [],
    puc: [],
  },

  /** Módulo 9.2 — Coordinador de Campo / Field Commander (Carlos) */
  coordinador_campo: {
    campo_radar: ["READ"],
    campo_abordaje: ["READ", "UPDATE"],
    campo_auditoria: ["CREATE"],
    logistica_despacho: ["READ"],
    torre_rutas: ["READ"],
    mis_viajes: ["READ", "UPDATE"],
    qhse_pqrs: ["CREATE", "READ"],
    finanzas: [],
    contabilidad: [],
    tesoreria_dispersion: [],
    nomina: [],
    contratos: [],
    crm_comercial: [],
    facturacion_clientes: [],
  },

  /** Finanzas */
  finanzas: {
    finanzas: ["CREATE", "READ", "UPDATE", "DELETE"],
    contratos: ["READ"],
    tesoreria_dispersion: ["CREATE", "READ", "UPDATE", "DELETE"],
    facturacion_clientes: ["CREATE", "READ", "UPDATE", "DELETE"],
  },
  tesoreria: {
    finanzas: ["CREATE", "READ", "UPDATE", "DELETE"],
    contratos: ["READ"],
    tesoreria_dispersion: ["CREATE", "READ", "UPDATE", "DELETE"],
    facturacion_clientes: ["READ"],
  },
  director_financiero: {
    finanzas: ["CREATE", "READ", "UPDATE", "DELETE"],
    contratos: ["READ", "UPDATE"],
    contabilidad: ["READ"],
    puc: ["READ"],
    nomina: ["READ"],
    rrhh: ["READ"],
    taller: ["READ"],
    logistica_despacho: ["READ"],
    crm_comercial: ["READ", "UPDATE"],
    tesoreria_dispersion: ["CREATE", "READ", "UPDATE", "DELETE"],
    facturacion_clientes: ["READ"],
    cxp_proveedores: ["READ"],
    gastos_ruta: ["READ"],
    compras_oc: ["CREATE", "READ", "UPDATE"],
    compras_proveedores: ["READ"],
  },
  gestor_contable: {
    contabilidad: ["CREATE", "READ", "UPDATE", "DELETE"],
    puc: ["CREATE", "READ", "UPDATE", "DELETE"],
    facturacion_electronica: ["CREATE", "READ", "UPDATE"],
    facturacion_clientes: ["CREATE", "READ", "UPDATE"],
    gastos_ruta: ["READ", "UPDATE"],
    legalizacion_gastos: ["READ", "UPDATE"],
    cxp_proveedores: ["CREATE", "READ", "UPDATE"],
    conciliacion_bancaria: ["CREATE", "READ", "UPDATE"],
    nomina: ["READ"],
    rrhh: ["READ"],
    taller: ["READ"],
    finanzas: ["READ"],
    tesoreria_dispersion: [],
    logistica_despacho: [],
    torre_rutas: [],
  },

  /** Módulo 4.1 — Auxiliar Contable (Mateo) */
  auxiliar_contable: {
    cxp_proveedores: ["CREATE", "READ", "UPDATE"],
    legalizacion_gastos: ["READ", "UPDATE"],
    conciliacion_bancaria: ["CREATE", "READ", "UPDATE"],
    facturacion_clientes: ["READ"],
    contabilidad: ["READ"],
    puc: [],
    tesoreria_dispersion: [],
    finanzas: [],
  },

  /** Módulo 2 — Líder TI (David) */
  lider_ti: {
    usuarios_roles: ["CREATE", "READ", "UPDATE", "DELETE"],
    integraciones: ["CREATE", "READ", "UPDATE", "DELETE"],
    helpdesk_ti: ["CREATE", "READ", "UPDATE", "DELETE"],
    infra_monitoreo: ["READ"],
    recepcion: ["READ"],
    finanzas: [],
    contabilidad: [],
    audit_forense: [],
    rrhh: [],
    contratos: [],
  },

  /** Módulo 7 — Líder QHSE / Prevención 4.0 (Carolina) */
  lider_qhse: {
    qhse_pqrs: ["CREATE", "READ", "UPDATE", "DELETE"],
    logistica_despacho: ["READ"],
    torre_rutas: ["READ", "UPDATE"],
    taller: ["READ"],
    rrhh: ["READ", "UPDATE"],
    personal: ["READ", "UPDATE"],
    mis_viajes: ["READ"],
    finanzas: [],
    contabilidad: [],
    tesoreria_dispersion: [],
    puc: [],
    cxp_proveedores: [],
  },
  qhse: {
    qhse_pqrs: ["CREATE", "READ", "UPDATE", "DELETE"],
    logistica_despacho: ["READ"],
    torre_rutas: ["READ", "UPDATE"],
    taller: ["READ"],
    rrhh: ["READ", "UPDATE"],
    personal: ["READ", "UPDATE"],
    finanzas: [],
    contabilidad: [],
    tesoreria_dispersion: [],
    puc: [],
  },

  /** Módulo 8 — Líder Compras / Smart Procurement (Javier) */
  lider_compras: {
    compras_proveedores: ["CREATE", "READ", "UPDATE", "DELETE"],
    compras_oc: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller: ["CREATE", "READ", "UPDATE"],
    tramites: ["CREATE", "READ", "UPDATE"],
    contabilidad: ["READ"],
    tesoreria_dispersion: ["READ"],
    cxp_proveedores: ["READ"],
    finanzas: ["READ"],
    logistica_despacho: [],
    torre_rutas: [],
  },
  compras: {
    compras_proveedores: ["CREATE", "READ", "UPDATE", "DELETE"],
    compras_oc: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller: ["CREATE", "READ", "UPDATE"],
    tramites: ["CREATE", "READ", "UPDATE"],
    contabilidad: ["READ"],
    tesoreria_dispersion: ["READ"],
    cxp_proveedores: ["READ"],
    finanzas: ["READ"],
    logistica_despacho: [],
    torre_rutas: [],
  },

  /** Módulo 9 — Director Operativo / Control Tower (Héctor) */
  director_operativo: {
    torre_rutas: ["CREATE", "READ", "UPDATE", "DELETE"],
    logistica_despacho: ["CREATE", "READ", "UPDATE", "DELETE"],
    override_operativo: ["CREATE", "READ", "UPDATE", "DELETE"],
    parada_flota: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller: ["CREATE", "READ", "UPDATE"],
    mis_viajes: ["CREATE", "READ", "UPDATE"],
    qhse_pqrs: ["CREATE", "READ", "UPDATE"],
    campo_radar: ["READ"],
    campo_abordaje: ["READ", "UPDATE"],
    campo_auditoria: ["CREATE", "READ"],
    watchtower_radar: ["READ", "MONITOR", "UPDATE"],
    watchtower_sos: ["CREATE", "READ", "UPDATE"],
    watchtower_iot: ["CREATE", "READ", "UPDATE"],
    rrhh: ["READ"],
    personal: ["READ"],
    tramites: ["READ"],
    finanzas: ["READ"],
    gastos_ruta: ["READ"],
    contabilidad: [],
    tesoreria_dispersion: [],
    puc: [],
    cxp_proveedores: [],
    facturacion_electronica: [],
  },

  /** Control interno / lectura forense */
  control_interno: {
    audit_forense: ["READ", "AUDIT"],
    hallazgos_ci: ["CREATE", "READ", "UPDATE"],
    smart_audit_fuel: ["READ"],
    contabilidad: ["READ"],
    finanzas: ["READ"],
    compras_oc: ["READ"],
    compras_proveedores: ["READ"],
    logistica_despacho: ["READ"],
    torre_rutas: ["READ"],
    taller: ["READ"],
    rrhh: ["READ"],
    personal: ["READ"],
    nomina: ["READ"],
    gastos_ruta: ["READ"],
    override_operativo: ["READ"],
    tesoreria_dispersion: [],
  },

  /** Módulo 11 — Auditor Control Interno / Forensic Hub (Marta) */
  auditor_control_interno: {
    audit_forense: ["READ", "AUDIT"],
    hallazgos_ci: ["CREATE", "READ", "UPDATE"],
    smart_audit_fuel: ["READ", "AUDIT"],
    contabilidad: ["READ"],
    finanzas: ["READ"],
    compras_oc: ["READ"],
    compras_proveedores: ["READ"],
    logistica_despacho: ["READ"],
    torre_rutas: ["READ"],
    taller: ["READ"],
    rrhh: ["READ"],
    personal: ["READ"],
    nomina: ["READ"],
    gastos_ruta: ["READ"],
    override_operativo: ["READ"],
    cxp_proveedores: ["READ"],
    tesoreria_dispersion: [],
    contratos: ["READ"],
  },

  /** Módulo 18 — Revisor Fiscal / Truth Hub (Fernando) — solo lectura forense + CREATE dictamen/cierre */
  revisor_fiscal: {
    fiscal_dictamen: ["CREATE", "READ"],
    fiscal_hard_lock: ["CREATE", "READ"],
    fiscal_impuestos: ["READ", "AUDIT"],
    fiscal_drilldown: ["READ", "AUDIT"],
    contabilidad: ["READ", "AUDIT"],
    puc: ["READ", "AUDIT"],
    finanzas: ["READ", "AUDIT"],
    tesoreria_dispersion: ["READ", "AUDIT"],
    facturacion_clientes: ["READ", "AUDIT"],
    facturacion_electronica: ["READ", "AUDIT"],
    nomina: ["READ", "AUDIT"],
    audit_forense: ["READ", "AUDIT"],
    cxp_proveedores: ["READ", "AUDIT"],
    conciliacion_bancaria: ["READ", "AUDIT"],
    compras_oc: ["READ"],
    compras_proveedores: ["READ"],
    archivo_digital: ["READ"],
    crm_comercial: [],
    logistica_despacho: [],
    torre_rutas: [],
    taller: [],
  },

  /** Módulo 19 — Coordinador Taller (Miguel) */
  coordinador_taller: {
    taller_ot: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller_qc: ["CREATE", "READ", "UPDATE"],
    taller_mecanico: ["READ", "UPDATE"],
    parada_flota_taller: ["CREATE", "READ", "UPDATE"],
    parada_flota: ["CREATE", "READ", "UPDATE"],
    taller: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller_inventario: ["READ"],
    logistica_despacho: ["READ"],
    compras_oc: ["READ"],
  },

  /** Módulo 19.1 — Auxiliar Almacén Taller (Camilo) */
  auxiliar_almacen_taller: {
    taller_inventario: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller_despacho: ["CREATE", "READ", "UPDATE"],
    taller_ot: ["READ"],
    taller: ["READ", "UPDATE"],
    compras_oc: ["READ"],
  },

  /** Módulo 20 — Mecánico FSG Tech App (Pedro) */
  mecanico: {
    taller_mecanico: ["CREATE", "READ", "UPDATE"],
    taller_ot: ["READ", "UPDATE"],
    taller: ["READ", "UPDATE"],
    taller_inventario: ["READ"],
  },

  auxiliar_contable_taller: {
    taller: ["READ"],
    contabilidad: ["CREATE", "READ", "UPDATE"],
    puc: ["READ", "UPDATE"],
    compras_oc: ["READ"],
  },

  tecnologia: {
    usuarios_roles: ["CREATE", "READ", "UPDATE", "DELETE"],
    integraciones: ["CREATE", "READ", "UPDATE", "DELETE"],
    helpdesk_ti: ["CREATE", "READ", "UPDATE", "DELETE"],
    infra_monitoreo: ["READ"],
    finanzas: [],
    contabilidad: [],
    audit_forense: [],
  },

  /** Módulo 3 — Gestor Documental (Roberto) */
  gestor_documental: {
    archivo_digital: ["CREATE", "READ", "UPDATE"],
    custodia_fisica: ["CREATE", "READ", "UPDATE", "DELETE"],
    inventario_papeleria: ["CREATE", "READ", "UPDATE", "DELETE"],
    tramites: ["READ"],
    rrhh: ["READ"],
    personal: ["READ"],
    contratos: ["READ"],
    nomina: [],
    finanzas: [],
    contabilidad: [],
    logistica_despacho: [],
    taller: [],
    mis_viajes: [],
  },
  archivo: {
    archivo_digital: ["CREATE", "READ", "UPDATE"],
    custodia_fisica: ["CREATE", "READ", "UPDATE", "DELETE"],
    inventario_papeleria: ["CREATE", "READ", "UPDATE", "DELETE"],
    tramites: ["READ"],
    rrhh: ["READ"],
    personal: ["READ"],
    contratos: ["READ"],
    nomina: [],
    finanzas: [],
    contabilidad: [],
    logistica_despacho: [],
    taller: [],
  },
};

/** Prefijos HTTP denegados por rol (403 inmediato) */
export const ROLE_DENIED_PATH_PREFIXES: Record<string, string[]> = {
  recepcionista: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/contabilidad",
    "/rrhh",
    "/api/v1/rrhh",
    "/comercial/contracts",
    "/contratos",
    "/logistica/servicios/despachar",
    "/logistica/despachar",
  ],
  conductor: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/rrhh",
    "/recepcion",
    "/api/v1/recepcion",
    "/omnicanal",
  ],
  lider_ti: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/contabilidad",
    "/api/v1/audit-forensic",
    "/audit-forensic",
    "/revisoria/audit-trail",
  ],
  lider_qhse: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/api/v1/tesoreria",
    "/contabilidad",
    "/api/v1/contabilidad",
    "/compras",
    "/api/v1/compras",
  ],
  qhse: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/api/v1/tesoreria",
    "/contabilidad",
    "/api/v1/contabilidad",
    "/compras",
    "/api/v1/compras",
  ],
  lider_compras: [
    "/logistica",
    "/api/v1/logistica",
    "/api/v1/logistics",
    "/torre",
    "/despacho",
    "/logistica/servicios",
    "/logistica/despachar",
  ],
  compras: [
    "/logistica",
    "/api/v1/logistica",
    "/api/v1/logistics",
    "/torre",
    "/despacho",
    "/logistica/servicios",
    "/logistica/despachar",
  ],
  director_operativo: [
    "/contabilidad",
    "/api/v1/contabilidad",
    "/tesoreria",
    "/api/v1/tesoreria",
    "/finanzas/cfo/dispersar",
    "/api/v1/finanzas/cfo/dispersar",
  ],
  gestor_operativo: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/api/v1/tesoreria",
    "/contabilidad",
    "/api/v1/contabilidad",
    "/nomina",
    "/api/v1/nomina",
    "/rrhh/nomina",
  ],
  coordinador_campo: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/api/v1/tesoreria",
    "/contabilidad",
    "/api/v1/contabilidad",
    "/nomina",
    "/api/v1/nomina",
    "/comercial",
    "/api/v1/comercial",
    "/compras",
    "/api/v1/compras",
  ],
  operador_centro_control: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/api/v1/tesoreria",
    "/contabilidad",
    "/api/v1/contabilidad",
    "/nomina",
    "/api/v1/nomina",
    "/rrhh/nomina",
    "/contratos",
    "/api/v1/contratos",
    "/comercial/contracts",
  ],
  centro_control: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/api/v1/tesoreria",
    "/contabilidad",
    "/api/v1/contabilidad",
    "/nomina",
    "/api/v1/nomina",
    "/contratos",
    "/api/v1/contratos",
  ],
  auditor_control_interno: [
    "/tesoreria/dispersar",
    "/api/v1/tesoreria/dispersar",
    "/api/v1/tesoreria/payments",
    "/tesoreria/payments",
    "/finanzas/payments/disburse",
    "/api/v1/finanzas/payments/disburse",
    "/finanzas/cfo/dispersar",
    "/api/v1/finanzas/cfo/dispersar",
    "/logistica/servicios/despachar",
    "/logistica/despachar",
    "/api/v1/logistica/servicios/despachar",
    "/operaciones/despacho/asignar",
    "/api/v1/operaciones/despacho/asignar",
  ],
  control_interno: [
    "/tesoreria/dispersar",
    "/api/v1/tesoreria/dispersar",
    "/logistica/servicios/despachar",
    "/logistica/despachar",
  ],
  gestor_vinculaciones: [
    "/logistica",
    "/api/v1/logistica",
    "/operaciones",
    "/api/v1/operaciones",
    "/centro-control",
    "/api/v1/centro-control",
    "/logistica/servicios/despachar",
    "/logistica/despachar",
  ],
  revisor_fiscal: [
    "/operaciones",
    "/api/v1/operaciones",
    "/logistica",
    "/api/v1/logistica",
    "/comercial",
    "/api/v1/comercial",
    "/parqueadero",
    "/api/v1/parqueadero",
    "/patio",
    "/api/v1/patio",
    "/logistica/servicios/despachar",
    "/logistica/despachar",
  ],
  director_juridico: [
    "/tesoreria",
    "/api/v1/tesoreria",
    "/contabilidad",
    "/api/v1/contabilidad",
    "/finanzas",
    "/api/v1/finanzas",
    "/nomina",
    "/api/v1/nomina",
  ],
  juridico: [
    "/tesoreria",
    "/api/v1/tesoreria",
    "/contabilidad",
    "/api/v1/contabilidad",
    "/finanzas",
    "/api/v1/finanzas",
  ],
  director_comercial: [
    "/operaciones",
    "/api/v1/operaciones",
    "/taller",
    "/api/v1/taller",
    "/contabilidad",
    "/api/v1/contabilidad",
    "/logistica/servicios/despachar",
    "/logistica/despachar",
    "/operaciones/despacho",
    "/api/v1/operaciones/despacho",
  ],
  gestor_comercial: [
    "/operaciones",
    "/api/v1/operaciones",
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/api/v1/tesoreria",
    "/contabilidad",
    "/api/v1/contabilidad",
    "/logistica/servicios/despachar",
    "/logistica/despachar",
    "/operaciones/despacho",
    "/api/v1/operaciones/despacho",
  ],
  coordinador_comercial: [
    "/contabilidad",
    "/api/v1/contabilidad",
    "/tesoreria",
    "/api/v1/tesoreria",
    "/finanzas/cfo",
    "/api/v1/finanzas/cfo",
  ],
  vinculaciones: [
    "/logistica/servicios/despachar",
    "/logistica/despachar",
    "/api/v1/logistica/servicios/despachar",
    "/operaciones/despacho",
    "/api/v1/operaciones/despacho",
  ],
  tecnologia: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/contabilidad",
    "/api/v1/audit-forensic",
    "/audit-forensic",
    "/revisoria/audit-trail",
  ],
  gestor_documental: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/contabilidad",
    "/taller",
    "/api/v1/taller",
    "/logistica/servicios/despachar",
    "/logistica/despachar",
    "/rrhh/payroll",
    "/api/v1/rrhh/payroll",
  ],
  archivo: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/contabilidad",
    "/taller",
    "/api/v1/taller",
    "/logistica/servicios/despachar",
    "/logistica/despachar",
    "/rrhh/payroll",
    "/api/v1/rrhh/payroll",
  ],
  auxiliar_contable: [
    "/api/v1/tesoreria/dispersar",
    "/tesoreria/dispersar",
    "/tesoreria/payments/disburse",
    "/api/v1/tesoreria/payments/disburse",
    "/api/v1/finanzas/payments/disburse",
    "/finanzas/payments/disburse",
    "/api/v1/contabilidad/puc",
    "/contabilidad/puc",
    "/accounting/puc",
    "/contabilidad/accounts",
    "/accounting/accounts",
    "/api/v1/contabilidad/accounts",
    "/contabilidad/trial-balance",
    "/accounting/trial-balance",
  ],
  gestor_contable: [
    "/logistica/servicios/despachar",
    "/logistica/despachar",
    "/api/v1/logistica/despachar",
    "/api/v1/tesoreria/dispersar",
    "/tesoreria/dispersar",
    "/tesoreria/payments/disburse",
    "/api/v1/tesoreria/payments/disburse",
    "/api/v1/finanzas/payments/disburse",
    "/finanzas/payments/disburse",
    "/parqueadero",
    "/patio",
    "/api/v1/patio",
  ],
};

const RESOURCE_ALIASES: Record<string, PermissionResource> = {
  visitor_control: "visitas",
  visitas: "visitas",
  visitors: "visitas",
  omnicanal: "omnicanal",
  bandeja: "omnicanal",
  comercial_crm: "crm_comercial",
  crm_comercial: "crm_comercial",
  crm: "crm_comercial",
  leads: "crm_comercial",
  qhse_pqrs: "qhse_pqrs",
  pqrs: "qhse_pqrs",
  qhse: "qhse_pqrs",
  torre_rutas: "torre_rutas",
  rutas: "torre_rutas",
  radar: "torre_rutas",
  finanzas: "finanzas",
  tesoreria: "finanzas",
  rrhh: "rrhh",
  personal: "personal",
  nomina: "nomina",
  contratos: "contratos",
  contracts: "contratos",
  logistica_despacho: "logistica_despacho",
  despacho: "logistica_despacho",
  despachar: "logistica_despacho",
  mis_viajes: "mis_viajes",
  recepcion: "recepcion",
  usuarios_roles: "usuarios_roles",
  usuarios: "usuarios_roles",
  roles: "usuarios_roles",
  integraciones: "integraciones",
  integrations: "integraciones",
  helpdesk_ti: "helpdesk_ti",
  helpdesk: "helpdesk_ti",
  infra_monitoreo: "infra_monitoreo",
  monitoreo: "infra_monitoreo",
  noc: "infra_monitoreo",
  audit_forense: "audit_forense",
  audit: "audit_forense",
  contabilidad: "contabilidad",
  archivo_digital: "archivo_digital",
  archivo: "archivo_digital",
  data_room: "archivo_digital",
  custodia_fisica: "custodia_fisica",
  custodia: "custodia_fisica",
  inventario_papeleria: "inventario_papeleria",
  papeleria: "inventario_papeleria",
  suministros: "inventario_papeleria",
  tramites: "tramites",
  taller: "taller",
  compras_proveedores: "compras_proveedores",
  proveedores: "compras_proveedores",
  vendors: "compras_proveedores",
  compras_oc: "compras_oc",
  ordenes_compra: "compras_oc",
  purchase_orders: "compras_oc",
  parada_flota: "parada_flota",
  fleet_stop: "parada_flota",
  override_operativo: "override_operativo",
  override: "override_operativo",
  campo_radar: "campo_radar",
  radar_geocerca: "campo_radar",
  campo_abordaje: "campo_abordaje",
  abordaje: "campo_abordaje",
  campo_auditoria: "campo_auditoria",
  falla_sitio: "campo_auditoria",
  watchtower_radar: "watchtower_radar",
  radar_unificado: "watchtower_radar",
  telemetria: "watchtower_radar",
  desvio_geocerca: "watchtower_radar",
  watchtower_sos: "watchtower_sos",
  sos: "watchtower_sos",
  war_room: "watchtower_sos",
  watchtower_iot: "watchtower_iot",
  apagado_remoto: "watchtower_iot",
  iot: "watchtower_iot",
  hallazgos_ci: "hallazgos_ci",
  hallazgos: "hallazgos_ci",
  smart_audit_fuel: "smart_audit_fuel",
  combustible_smart_audit: "smart_audit_fuel",
  founders_canvas: "founders_canvas",
  canvas: "founders_canvas",
  jarvis_ai: "jarvis_ai",
  jarvis: "jarvis_ai",
  voice_query: "jarvis_ai",
  capex_approve: "capex_approve",
  capex: "capex_approve",
  defcon_crisis: "defcon_crisis",
  defcon: "defcon_crisis",
  vinculaciones_afiliados: "vinculaciones_afiliados",
  afiliados: "vinculaciones_afiliados",
  portal_link: "vinculaciones_afiliados",
  vinculaciones_conductores: "vinculaciones_conductores",
  background_check: "vinculaciones_conductores",
  vinculaciones_ocr: "vinculaciones_ocr",
  validar_ocr: "vinculaciones_ocr",
  balance_scorecard: "balance_scorecard",
  scorecard: "balance_scorecard",
  gerencia_override: "gerencia_override",
  override_gerencial: "gerencia_override",
  gerencia_approvals: "gerencia_approvals",
  aprobaciones_ejecutivas: "gerencia_approvals",
  cxp_proveedores: "cxp_proveedores",
  cxp: "cxp_proveedores",
  cuentas_por_pagar: "cxp_proveedores",
  legalizacion_gastos: "legalizacion_gastos",
  legalizaciones: "legalizacion_gastos",
  viaticos: "legalizacion_gastos",
  conciliacion_bancaria: "conciliacion_bancaria",
  conciliacion: "conciliacion_bancaria",
  facturacion_clientes: "facturacion_clientes",
  cartera: "facturacion_clientes",
  puc: "puc",
  plan_cuentas: "puc",
  tesoreria_dispersion: "tesoreria_dispersion",
  dispersar: "tesoreria_dispersion",
  disburse: "tesoreria_dispersion",
  gastos_ruta: "gastos_ruta",
  smart_wallet: "gastos_ruta",
  peajes: "gastos_ruta",
  facturacion_electronica: "facturacion_electronica",
  dian: "facturacion_electronica",
  emitir_dian: "facturacion_electronica",
};

export function resolvePermissionResource(
  raw: string,
): PermissionResource | null {
  const key = String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/-/g, "_");
  return RESOURCE_ALIASES[key] ?? null;
}

export function hasPermission(
  role: string,
  resource: PermissionResource | string,
  action: PermissionAction,
): boolean {
  const r = String(role || "")
    .toLowerCase()
    .trim();
  const res =
    typeof resource === "string" && !(resource in ({} as Record<PermissionResource, 1>))
      ? resolvePermissionResource(resource) || (resource as PermissionResource)
      : (resource as PermissionResource);

  const map =
    ROLE_PERMISSIONS[r] ||
    ROLE_PERMISSIONS[
      r === "recepcion" || r === "atencion"
        ? "recepcionista"
        : r === "supervisor" || r === "despacho"
          ? "centro_control"
          :       r === "tecnologia" || r === "sistemas"
            ? "lider_ti"
            : r === "archivo"
              ? "gestor_documental"
              : r === "qhse_lider"
                ? "lider_qhse"
                : r === "compras_lider"
                  ? "lider_compras"
                  : r
    ];

  if (!map) return false;
  const actions = map[res as PermissionResource];
  if (!actions || actions.length === 0) return false;
  return actions.includes(action);
}

export function isPathDeniedForRole(role: string, path: string): boolean {
  const r = String(role || "")
    .toLowerCase()
    .trim();
  const normalizedRole =
    r === "recepcion" || r === "atencion"
      ? "recepcionista"
      : r === "tecnologia" || r === "sistemas"
        ? "lider_ti"
        : r === "archivo"
          ? "gestor_documental"
          : r === "qhse_lider"
            ? "lider_qhse"
            : r;
  const prefixes =
    ROLE_DENIED_PATH_PREFIXES[normalizedRole] ||
    ROLE_DENIED_PATH_PREFIXES[r] ||
    [];
  const p = String(path || "").toLowerCase();
  return prefixes.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`) || p.startsWith(prefix),
  );
}

/** Compat Módulo 1 */
export const RECEPCIONISTA_PERMISSIONS = {
  visitor_control: ROLE_PERMISSIONS.recepcionista!.visitas!,
  omnicanal: ROLE_PERMISSIONS.recepcionista!.omnicanal!,
  comercial_crm: ROLE_PERMISSIONS.recepcionista!.crm_comercial!,
  qhse_pqrs: ROLE_PERMISSIONS.recepcionista!.qhse_pqrs!,
  torre_rutas: ROLE_PERMISSIONS.recepcionista!.torre_rutas!,
  finanzas: [] as PermissionAction[],
  rrhh: [] as PermissionAction[],
  contratos: [] as PermissionAction[],
} as const;

export type RecepcionPermissionAction = PermissionAction;
export type RecepcionPermissionDomain = keyof typeof RECEPCIONISTA_PERMISSIONS;

export function recepcionistaCan(
  domain: RecepcionPermissionDomain,
  action: PermissionAction,
): boolean {
  return (RECEPCIONISTA_PERMISSIONS[domain] as readonly string[]).includes(
    action,
  );
}

export const RECEPCIONISTA_DENIED_MODULES = [
  "tesoreria",
  "contabilidad",
  "rrhh",
  "compras",
  "comercial",
  "juridico",
  "sarlaft",
  "finanzas",
] as const;

export function isRecepcionistaDeniedModule(module: string): boolean {
  const m = String(module || "")
    .toLowerCase()
    .replace(/-/g, "_");
  return (RECEPCIONISTA_DENIED_MODULES as readonly string[]).some(
    (d) => d === m || m.includes(d),
  );
}

/** Ítems de menú forzados para recepcionista (sidebar) */
export type RoleNavItem = {
  href: string;
  label: string;
  view: string;
  tip: string;
};

export const RECEPCIONISTA_NAV: RoleNavItem[] = [
  {
    href: "/recepcion/dashboard",
    label: "Recepción omnicanal",
    view: "call_center",
    tip: "Bandeja WhatsApp / correo / llamadas",
  },
  {
    href: "/recepcion/dashboard#visitantes",
    label: "Visitantes",
    view: "call_center",
    tip: "Tablero de visitantes · ingreso y gafete",
  },
  {
    href: "/recepcion/dashboard#pqrs",
    label: "Radicar PQRS",
    view: "call_center",
    tip: "Quejas e incidentes de primer contacto",
  },
  {
    href: "/recepcion/dashboard#radar",
    label: "Radar de Rutas (Lectura)",
    view: "logistica",
    tip: "Estado GPS de buses · sin despacho",
  },
];

/** Sidebar forzado — Líder TI (David) */
export const LIDER_TI_NAV: RoleNavItem[] = [
  {
    href: "/ti/dashboard",
    label: "Centro de Control TI",
    view: "tecnologia_ti",
    tip: "Salud de APIs, usuarios y mesa de ayuda",
  },
  {
    href: "/ti/dashboard#usuarios",
    label: "Usuarios y roles",
    view: "usuarios",
    tip: "Aprovisionamiento y suspensión",
  },
  {
    href: "/ti/dashboard#helpdesk",
    label: "Mesa de ayuda",
    view: "tecnologia_ti",
    tip: "Tickets técnicos internos",
  },
  {
    href: "/ti/dashboard#integraciones",
    label: "Integraciones y servicios",
    view: "tecnologia_ti",
    tip: "GPS, WhatsApp, facturación electrónica",
  },
];

/** Sidebar forzado — Gestor Documental (Roberto) */
export const GESTOR_DOCUMENTAL_NAV: RoleNavItem[] = [
  {
    href: "/archivo/dashboard",
    label: "Archivo y Papelería",
    view: "archivo",
    tip: "Búsqueda universal · custodia · inventario",
  },
  {
    href: "/archivo/dashboard#pendientes",
    label: "Pendientes de digitalizar",
    view: "archivo",
    tip: "Escaneos solicitados",
  },
  {
    href: "/archivo/dashboard#prestamos",
    label: "Carpetas en préstamo",
    view: "archivo",
    tip: "Cadena de custodia física",
  },
  {
    href: "/archivo/dashboard#inventario",
    label: "Inventario administrativo",
    view: "archivo",
    tip: "Papelería y dotación · stock crítico",
  },
];

/** Sidebar forzado — Auxiliar Contable (Mateo) */
export const AUXILIAR_CONTABLE_NAV: RoleNavItem[] = [
  {
    href: "/contabilidad/auxiliar/dashboard",
    label: "Operación financiera",
    view: "contabilidad",
    tip: "CxP · legalizaciones · conciliación",
  },
  {
    href: "/contabilidad/auxiliar/dashboard#facturas",
    label: "Facturas por radicar",
    view: "contabilidad",
    tip: "Cruce triple · causar / devolver",
  },
  {
    href: "/contabilidad/auxiliar/dashboard#legalizaciones",
    label: "Anticipos por legalizar",
    view: "contabilidad",
    tip: "Viáticos y caja menor",
  },
  {
    href: "/contabilidad/auxiliar/dashboard#conciliacion",
    label: "Transacciones por conciliar",
    view: "contabilidad",
    tip: "Cruce automático del extracto bancario",
  },
];

/** Sidebar forzado — Gestor Contable (Diana) */
export const GESTOR_CONTABLE_NAV: RoleNavItem[] = [
  {
    href: "/contabilidad/gestor/dashboard",
    label: "Libro diario y facturación",
    view: "contabilidad",
    tip: "PUC · DIAN · cartera digital · costeo de flota",
  },
  {
    href: "/contabilidad/gestor/dashboard#gastos",
    label: "Gastos de ruta",
    view: "contabilidad",
    tip: "Auditar peajes y tanqueos",
  },
  {
    href: "/contabilidad/gestor/dashboard#facturacion",
    label: "Facturación B2B",
    view: "contabilidad",
    tip: "Prefactura y timbrado DIAN",
  },
  {
    href: "/contabilidad/gestor/dashboard#diario",
    label: "Libro diario",
    view: "contabilidad",
    tip: "Filtro por placa / cuenta PUC",
  },
];

/** Sidebar forzado — Director Financiero / CFO (Elena) */
export const DIRECTOR_FINANCIERO_NAV: RoleNavItem[] = [
  {
    href: "/finanzas/cfo/dashboard",
    label: "Dirección financiera",
    view: "tesoreria",
    tip: "Resultados · aprobación de lotes · simulador de rentabilidad",
  },
  {
    href: "/finanzas/cfo/dashboard#aprobaciones",
    label: "Aprobaciones con clave",
    view: "tesoreria",
    tip: "Lotes sobre el tope · clave de dirección financiera",
  },
  {
    href: "/comercial",
    label: "Contratos y cotizaciones",
    view: "comercial",
    tip: "Aprobación financiera · margen mínimo",
  },
  {
    href: "/tesoreria",
    label: "Tesorería (lectura/ops)",
    view: "tesoreria",
    tip: "Cola de dispersión y cartera",
  },
  {
    href: "/contabilidad/gestor/dashboard",
    label: "Contabilidad (auditoría)",
    view: "contabilidad",
    tip: "Lectura PUC · facturación · costeo",
  },
];

/** Sidebar forzado — Líder QHSE (Carolina) */
export const LIDER_QHSE_NAV: RoleNavItem[] = [
  {
    href: "/qhse/dashboard",
    label: "Radar de Prevención",
    view: "qhse",
    tip: "Semáforos · telemetría · tablero de siniestros",
  },
  {
    href: "/qhse/dashboard#novedades",
    label: "Bandeja de novedades",
    view: "qhse",
    tip: "Excesos · frenadas · PQRS en vivo",
  },
  {
    href: "/qhse/dashboard#siniestros",
    label: "Sala de siniestros",
    view: "qhse",
    tip: "Investigación · ARL · orden taller",
  },
  {
    href: "/qhse/dashboard#esg",
    label: "Huella ambiental",
    view: "qhse",
    tip: "NPS · emisiones · exportación",
  },
  {
    href: "/rrhh",
    label: "Fatiga y capacitaciones",
    view: "rrhh",
    tip: "Salud ocupacional · alcoholimetría",
  },
];

/** Sidebar forzado — Líder Compras (Javier) */
export const LIDER_COMPRAS_NAV: RoleNavItem[] = [
  {
    href: "/compras/dashboard",
    label: "Centro de proveedores",
    view: "compras",
    tip: "Requisiciones · tablero de órdenes · ahorros",
  },
  {
    href: "/compras/dashboard#requisiciones",
    label: "Bandeja requisiciones",
    view: "compras",
    tip: "Crítico · stock bajo · admin",
  },
  {
    href: "/compras/dashboard#ordenes",
    label: "Tablero de órdenes",
    view: "compras",
    tip: "Cotizando → Recibido",
  },
  {
    href: "/compras/dashboard#ahorros",
    label: "Ahorros y proveedores",
    view: "compras",
    tip: "Calificación · ahorros · homologados",
  },
  {
    href: "/taller",
    label: "Inventario Taller",
    view: "taller",
    tip: "Re-orden · recepción mercancía",
  },
  {
    href: "/tramites",
    label: "SOAT y pólizas",
    view: "tramites",
    tip: "Renovación · OCR pólizas",
  },
];

/** Sidebar forzado — Director Operativo (Héctor) */
export const DIRECTOR_OPERATIVO_NAV: RoleNavItem[] = [
  {
    href: "/operaciones/director/dashboard",
    label: "Torre de control",
    view: "logistica",
    tip: "Gantt táctico · radar novedades · SLA",
  },
  {
    href: "/operaciones/director/dashboard#gantt",
    label: "Gantt de flota",
    view: "logistica",
    tip: "Arrastrar y soltar · reasignación en vivo",
  },
  {
    href: "/operaciones/director/dashboard#novedades",
    label: "Radar novedades",
    view: "logistica",
    tip: "Tráfico · ingreso · SOS",
  },
  {
    href: "/operaciones/director/dashboard#capacidad",
    label: "Planeación de capacidad",
    view: "logistica",
    tip: "Taller + RRHH · picos demanda",
  },
  {
    href: "/taller",
    label: "Paradas de flota",
    view: "taller",
    tip: "Aprobar mantenimiento sincronizado",
  },
  {
    href: "/parqueadero",
    label: "Patio inteligente",
    view: "parqueadero",
    tip: "Inmovilizaciones · patio",
  },
];

/** Sidebar forzado — Gestor Operativo / Micro-Dispatch (Luis) */
export const GESTOR_OPERATIVO_NAV: RoleNavItem[] = [
  {
    href: "/operaciones/despacho/dashboard",
    label: "Microdespacho",
    view: "logistica",
    tip: "Gantt diario · filtros · acuse en la app",
  },
  {
    href: "/operaciones/despacho/dashboard#gantt",
    label: "Gantt diario",
    view: "logistica",
    tip: "Azul asignado · Verde en ruta · Gris taller · Rojo bloqueado",
  },
  {
    href: "/operaciones/despacho/dashboard#relevo",
    label: "Relevo flash",
    view: "logistica",
    tip: "Viaje descubierto · retén GPS",
  },
  {
    href: "/logistica/servicios",
    label: "Servicios",
    view: "logistica",
    tip: "Programación y seguimiento",
  },
  {
    href: "/logistica/conductores",
    label: "Conductores",
    view: "logistica",
    tip: "Fatiga · disponibilidad",
  },
];

/** Sidebar forzado — Coordinador de Campo (Carlos) */
export const COORDINADOR_CAMPO_NAV: RoleNavItem[] = [
  {
    href: "/operaciones/campo/dashboard",
    label: "Comando de campo",
    view: "logistica",
    tip: "Radar de geocerca · error de dedo · sin conexión",
  },
  {
    href: "/operaciones/campo/dashboard#radar",
    label: "Radar en vivo",
    view: "logistica",
    tip: "Geocerca 5 km · ETA llegada",
  },
  {
    href: "/operaciones/campo/dashboard#acciones",
    label: "Acciones de sitio",
    view: "logistica",
    tip: "Novedad · Manifiesto · Base",
  },
];

/** Sidebar forzado — Operador Centro de Control / Watchtower (Valeria) */
export const OPERADOR_CENTRO_CONTROL_NAV: RoleNavItem[] = [
  {
    href: "/centro-control/dashboard",
    label: "Torre de control",
    view: "logistica",
    tip: "Pantalla de monitoreo · excepciones · SOS",
  },
  {
    href: "/centro-control/dashboard#anomalias",
    label: "Excepciones",
    view: "logistica",
    tip: "Desvíos · fatiga · alarmas",
  },
  {
    href: "/centro-control/dashboard#voip",
    label: "Consola de llamadas",
    view: "logistica",
    tip: "Marcación rápida conductores",
  },
  {
    href: "/centro-control/dashboard#warroom",
    label: "Sala de crisis",
    view: "logistica",
    tip: "Emergencia · protocolo extremo · sensores",
  },
];

/** Sidebar forzado — Coordinador Patio (Roberto) */
export const COORDINADOR_PATIO_NAV: RoleNavItem[] = [
  {
    href: "/patio/dashboard",
    label: "Patio inteligente",
    view: "parqueadero",
    tip: "Mapa de patio · talanquera",
  },
  {
    href: "/patio/dashboard#talanquera",
    label: "Consola Talanquera",
    view: "parqueadero",
    tip: "Lectura de placa · bloqueo operativo",
  },
];

/** Sidebar forzado — Auxiliar Patio (Juan) */
export const AUXILIAR_PATIO_NAV: RoleNavItem[] = [
  {
    href: "/patio/yard-app",
    label: "App de patio",
    view: "parqueadero",
    tip: "Lavado · movimientos de patio",
  },
];

/** Sidebar forzado — Conductor FSG Pilot (Diego) */
export const CONDUCTOR_PILOT_NAV: RoleNavItem[] = [
  {
    href: "/pilot",
    label: "App del conductor",
    view: "logistica",
    tip: "Preoperacional · emergencia · viático",
  },
];

/** Sidebar forzado — Subgerente (Martín) */
export const SUBGERENTE_NAV: RoleNavItem[] = [
  {
    href: "/subgerencia/dashboard",
    label: "Ejecución Táctica",
    view: "gerencia",
    tip: "Conflictos · kilómetros en vacío · proyectos",
  },
];

/** Sidebar forzado — Coordinador Taller (Miguel) */
export const COORDINADOR_TALLER_NAV: RoleNavItem[] = [
  {
    href: "/taller/coordinador/dashboard",
    label: "Torre de Taller",
    view: "taller",
    tip: "Tablero de órdenes · Bahías · control de calidad",
  },
  {
    href: "/taller/coordinador/dashboard#bahias",
    label: "Plano de bahías",
    view: "taller",
    tip: "Mapa de bahías · cronómetro",
  },
  {
    href: "/taller/coordinador/dashboard#qc",
    label: "Alta médica",
    view: "taller",
    tip: "Control de calidad · liberación Logística",
  },
];

/** Sidebar forzado — Auxiliar Almacén Taller (Camilo) */
export const AUXILIAR_ALMACEN_TALLER_NAV: RoleNavItem[] = [
  {
    href: "/taller/almacen/dashboard",
    label: "Almacén del taller",
    view: "taller",
    tip: "Código · referencia · despacho en mostrador",
  },
  {
    href: "/taller/almacen/dashboard#despacho",
    label: "Despacho rápido",
    view: "taller",
    tip: "Escanear · imputar costo",
  },
];

/** Sidebar forzado — Mecánico FSG Tech App (Pedro) */
export const MECANICO_NAV: RoleNavItem[] = [
  {
    href: "/taller/mecanico",
    label: "App de taller",
    view: "taller",
    tip: "Órdenes asignadas · foto y voz · cronómetro",
  },
];

/** Sidebar forzado — Revisor Fiscal (Fernando · Truth Hub) */
export const REVISOR_FISCAL_NAV: RoleNavItem[] = [
  {
    href: "/revisoria-fiscal/dashboard",
    label: "Centro de revisoría",
    view: "revisoria_fiscal",
    tip: "Impuestos · detalle · cierre de periodo",
  },
  {
    href: "/revisoria-fiscal/dashboard#balance",
    label: "Balance PUC",
    view: "contabilidad",
    tip: "Árbol colapsable hasta factura",
  },
  {
    href: "/revisoria-fiscal/dashboard#muestreo",
    label: "Bandeja de Muestreo",
    view: "revisoria_fiscal",
    tip: "5% aleatorio del mes",
  },
  {
    href: "/revisoria-fiscal/dashboard#impuestos",
    label: "Panel DIAN",
    view: "revisoria_fiscal",
    tip: "Retenciones · prevalidador",
  },
  {
    href: "/revisoria-fiscal/dashboard#cierre",
    label: "Dictamen y Cierre",
    view: "revisoria_fiscal",
    tip: "Cierre definitivo del periodo",
  },
];

/** Sidebar forzado — Auditor Control Interno (Marta) */
export const AUDITOR_CONTROL_INTERNO_NAV: RoleNavItem[] = [
  {
    href: "/control-interno/dashboard",
    label: "Centro forense",
    view: "revisoria_fiscal",
    tip: "Caja negra · hallazgos · auditoría",
  },
  {
    href: "/control-interno/dashboard#audit-log",
    label: "Caja Negra",
    view: "revisoria_fiscal",
    tip: "Bitácora inmutable",
  },
  {
    href: "/control-interno/dashboard#anomalias",
    label: "Radar anomalías",
    view: "revisoria_fiscal",
    tip: "Alertas automáticas · bloqueos",
  },
  {
    href: "/control-interno/dashboard#hallazgos",
    label: "Hallazgos",
    view: "revisoria_fiscal",
    tip: "Abierta → Descargos → Cerrada",
  },
];

/** Sidebar forzado — Presidente / Founder's Canvas (Alejandro) */
export const PRESIDENTE_NAV: RoleNavItem[] = [
  {
    href: "/presidencia/dashboard",
    label: "Lienzo de presidencia",
    view: "presidencia",
    tip: "4 pilares · asistente · inversión · crisis",
  },
  {
    href: "/presidencia/dashboard#jarvis",
    label: "Asistente de presidencia",
    view: "presidencia",
    tip: "Comandos de voz y lenguaje natural",
  },
  {
    href: "/presidencia/dashboard#capex",
    label: "Simulador de inversión",
    view: "presidencia",
    tip: "Inversión flota · utilización",
  },
  {
    href: "/presidencia/dashboard#defcon",
    label: "Protocolo de crisis",
    view: "presidencia",
    tip: "Protocolo extremo · sala de crisis",
  },
];

/** Sidebar forzado — Gestor Vinculaciones (Laura) */
export const GESTOR_VINCULACIONES_NAV: RoleNavItem[] = [
  {
    href: "/vinculaciones/dashboard",
    label: "Alta de afiliados",
    view: "rrhh",
    tip: "Embudo legal · OCR · RUNT/SIMIT",
  },
  {
    href: "/vinculaciones/dashboard#kanban",
    label: "Embudo de afiliados",
    view: "rrhh",
    tip: "Solicitud → Activo en flota",
  },
  {
    href: "/vinculaciones/dashboard#vencimientos",
    label: "Matriz vencimientos",
    view: "rrhh",
    tip: "SOAT · TO · Pólizas · Tecno",
  },
  {
    href: "/vinculaciones/dashboard#ocr",
    label: "Visor OCR",
    view: "rrhh",
    tip: "Pantalla partida · validación del documento",
  },
];

/** Sidebar forzado — Director Comercial (Felipe) */
export const DIRECTOR_COMERCIAL_NAV: RoleNavItem[] = [
  {
    href: "/comercial/director/dashboard",
    label: "Centro de Conversión",
    view: "comercial",
    tip: "Embudo empresas · cuota · renovaciones",
  },
  {
    href: "/comercial/director/dashboard#pipeline",
    label: "Embudo comercial",
    view: "comercial",
    tip: "Lead → Cerrado Ganado",
  },
  {
    href: "/comercial/director/dashboard#cotizador",
    label: "Cotizador Inteligente",
    view: "comercial",
    tip: "Costo real $/km · límites de margen",
  },
  {
    href: "/comercial/director/dashboard#renovaciones",
    label: "Radar renovaciones",
    view: "comercial",
    tip: "90 días · NPS · cartera",
  },
];

/** Sidebar forzado — Gestor Comercial (Valentina) */
export const GESTOR_COMERCIAL_NAV: RoleNavItem[] = [
  {
    href: "/comercial/gestor/dashboard",
    label: "Acción Rápida",
    view: "comercial",
    tip: "Tareas · mini-embudo · línea de tiempo",
  },
  {
    href: "/comercial/gestor/dashboard#tareas",
    label: "Bandeja de tareas",
    view: "comercial",
    tip: "Llamadas · correos · reuniones",
  },
  {
    href: "/comercial/gestor/dashboard#pipeline",
    label: "Embudo personal",
    view: "comercial",
    tip: "Cartera personal",
  },
  {
    href: "/comercial/gestor/dashboard#marcador",
    label: "Marcador integrado",
    view: "comercial",
    tip: "Llamada + notas de voz",
  },
];

/** Sidebar forzado — Coordinador Comercial (Sergio) */
export const COORDINADOR_COMERCIAL_NAV: RoleNavItem[] = [
  {
    href: "/comercial/coordinador/dashboard",
    label: "Centro Analítico",
    view: "comercial",
    tip: "Tabla de posiciones · proyección · SECOP",
  },
  {
    href: "/comercial/coordinador/dashboard#leaderboard",
    label: "Tabla de posiciones",
    view: "comercial",
    tip: "Posiciones y ventas",
  },
  {
    href: "/comercial/coordinador/dashboard#secop",
    label: "Seguimiento SECOP",
    view: "comercial",
    tip: "Gantt de licitaciones públicas",
  },
  {
    href: "/comercial/coordinador/dashboard#sla",
    label: "Tiempos y asignación en ronda",
    view: "comercial",
    tip: "2h contacto · reasignación",
  },
];

/** Sidebar forzado — Gerente General (Mauricio) */
export const GERENTE_GENERAL_NAV: RoleNavItem[] = [
  {
    href: "/gerencia/dashboard",
    label: "Puente de Decisiones",
    view: "gerencia",
    tip: "Cuadro de mando · excepciones · aprobaciones",
  },
  {
    href: "/gerencia/dashboard#aprobaciones",
    label: "Bandeja ejecutiva",
    view: "gerencia",
    tip: "Pagos · contratos · PIN",
  },
  {
    href: "/gerencia/dashboard#scorecard",
    label: "Cuadro de mando integral",
    view: "gerencia",
    tip: "Ventas × Ops × Finanzas",
  },
  {
    href: "/gerencia/dashboard#comando",
    label: "Directorio de Comando",
    view: "gerencia",
    tip: "Sala de crisis con directores",
  },
];

/** Sidebar forzado — Director Jurídico (Sofía) */
export const DIRECTOR_JURIDICO_NAV: RoleNavItem[] = [
  {
    href: "/juridico/dashboard",
    label: "Centro jurídico",
    view: "juridico",
    tip: "Riesgos · Contratos · SARLAFT",
  },
  {
    href: "/juridico/dashboard#contratos",
    label: "Gestor de Contratos",
    view: "juridico",
    tip: "Revisión automática · comentarios",
  },
  {
    href: "/juridico/dashboard#calendario",
    label: "Calendario Judicial",
    view: "juridico",
    tip: "Audiencias · plazos inamovibles",
  },
  {
    href: "/juridico/dashboard#sarlaft",
    label: "Riesgo SARLAFT",
    view: "sarlaft",
    tip: "Semáforos · listas restrictivas",
  },
  {
    href: "/juridico/dashboard#expediente",
    label: "Expediente Probatorio",
    view: "juridico",
    tip: "PDF inmutable por placa",
  },
];

export const RBAC_FORBIDDEN_MESSAGE =
  "No tienes permisos para acceder a este recurso.";
