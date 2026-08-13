export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  tenantId?: string;
  companyId?: string;
  directiveReadOnly?: boolean;
  status?: string;
};

export type MobileRole =
  | "conductor"
  | "mecanico"
  | "auxiliar_patio"
  | "coordinador_patio"
  | "coordinador_campo"
  | string;

export type Trip = {
  id: string;
  code: string;
  origin: string;
  destination: string;
  status: string;
  vehicleId?: string | null;
  vehicle?: { id: string; plate: string } | null;
  driver?: { id: string; name: string } | null;
  notes?: string | null;
  preoperationalAt?: string | null;
  originLat?: number | null;
  originLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
  departAt?: string;
  arriveAt?: string;
};

export type GpsPoint = {
  lat: number;
  lng: number;
  timestamp: string;
};

export type WorkOrder = {
  id: string;
  code: string;
  description: string;
  status: string;
  severity?: string | null;
  bayCode?: string | null;
  vehicle?: { id: string; plate: string } | null;
  meta?: Record<string, unknown> | null;
};

export type SyncOpType =
  | "preoperational"
  | "incident"
  | "pod"
  | "time_tracking"
  | "finding"
  | "yard_access"
  | "yard_inspection"
  | "lpr_check"
  | "abordaje"
  | "falla_sitio"
  | "gps_ping";

export type SyncQueueItem = {
  id: string;
  type: SyncOpType;
  path: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
  createdAt: string;
  retries: number;
  lastError?: string;
};
