import type {
  SchoolBoardingKind,
  SchoolRouteDirection,
  StudentTripStatus,
} from "@fsg/db";

/**
 * Resuelve estado del estudiante tras abordaje/descenso.
 */
export function resolveStudentStatusAfterBoarding(input: {
  kind: SchoolBoardingKind | string;
  direction: SchoolRouteDirection | string;
  previous?: StudentTripStatus | string | null;
}): StudentTripStatus {
  const kind = String(input.kind).toUpperCase();
  const direction = String(input.direction).toUpperCase();

  if (kind === "ABSENT") return "AUSENTE" as StudentTripStatus;
  if (kind === "BOARD") return "ABORDADO" as StudentTripStatus;

  // ALIGHT
  if (direction === "TO_HOME") {
    return "ENTREGADO_EN_CASA" as StudentTripStatus;
  }
  return "ENTREGADO_EN_COLEGIO" as StudentTripStatus;
}

export function kafkaTopicForBoarding(
  kind: SchoolBoardingKind | string,
): "student.boarded" | "student.alighted" | "student.absent" {
  const k = String(kind).toUpperCase();
  if (k === "BOARD") return "student.boarded";
  if (k === "ABSENT") return "student.absent";
  return "student.alighted";
}

export function parentNotificationCopy(input: {
  studentName: string;
  kind: string;
  status: string;
}): { title: string; body: string } {
  const name = input.studentName;
  switch (String(input.kind).toUpperCase()) {
    case "BOARD":
      return {
        title: `${name} abordó el bus`,
        body: `Estado: ABORDADO — uplink escolar confirmado`,
      };
    case "ABSENT":
      return {
        title: `${name} marcado ausente`,
        body: `Estado: AUSENTE — novedad registrada por monitora`,
      };
    default:
      if (input.status === "ENTREGADO_EN_CASA") {
        return {
          title: `${name} entregado en casa`,
          body: `Estado: ENTREGADO_EN_CASA`,
        };
      }
      return {
        title: `${name} entregado en colegio`,
        body: `Estado: ENTREGADO_EN_COLEGIO`,
      };
  }
}
