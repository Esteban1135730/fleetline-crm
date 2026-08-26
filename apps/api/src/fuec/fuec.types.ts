/** Snapshot del Formato Único de Extracto de Contrato (FUEC) */

export type FuecDocCheck = {
  type: string;
  label: string;
  number: string | null;
  expiresAt: string | null;
  expired: boolean;
  missing: boolean;
};

export type FuecDriverSnap = {
  driverId: string;
  index: number;
  name: string;
  document: string;
  licenseNumber: string | null;
  licenseExpiresAt: string | null;
  licenseExpired: boolean;
  dispatchBlocked: boolean;
};

export type FuecOwnerSnap = {
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal: string;
  document: string;
  phone: string;
};

export type FuecVehicleSnap = {
  vehicleId: string;
  plate: string;
  model: string;
  brand: string;
  vehicleClass: string;
  internalNumber: string;
  operationCard: string;
};

export type FuecPayload = {
  organizationName: string;
  organizationNit: string;
  extractNumber: string;
  contractNumber: string;
  contractorName: string;
  contractorNit: string;
  contractorAddress: string;
  contractorPhone: string;
  contractObject: string;
  origin: string;
  destination: string;
  routeDescription: string;
  consortium: string;
  validFrom: string;
  validTo: string;
  responsibleName: string;
  responsibleDocument: string;
  responsiblePhone: string;
  responsibleAddress: string;
  vehicle: FuecVehicleSnap;
  owner: FuecOwnerSnap;
  drivers: FuecDriverSnap[];
  importantDocs: FuecDocCheck[];
  issuedAt: string;
};

export type CreateFuecBody = {
  number?: string;
  contractNumber: string;
  contractorName: string;
  contractorNit?: string;
  contractorAddress?: string;
  contractorPhone?: string;
  contractObject: string;
  origin: string;
  destination: string;
  routeDescription: string;
  consortium?: string;
  validFrom: string;
  validTo: string;
  responsibleName?: string;
  responsibleDocument?: string;
  responsiblePhone?: string;
  responsibleAddress?: string;
  vehicleId: string;
  owner?: Partial<FuecOwnerSnap>;
  driverIds: string[];
  tripId?: string;
};
