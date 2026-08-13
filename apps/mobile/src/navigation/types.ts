import type { Trip, WorkOrder } from "../types";

export type RootStackParamList = {
  Login: undefined;
  ConductorHome: undefined;
  TripDetail: { trip: Trip };
  Preoperational: { trip: Trip };
  Incident: { trip: Trip };
  Pod: { trip: Trip };
  MechanicHome: undefined;
  WorkOrderDetail: { order: WorkOrder };
  PatioHome: undefined;
  GateCheck: undefined;
  YardInspection: undefined;
  CampoHome: undefined;
  FieldAudit: undefined;
  Boarding: undefined;
  UnsupportedHome: undefined;
};
