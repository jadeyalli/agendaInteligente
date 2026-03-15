/**
 * Funciones puras para traducir horarios entre zonas horarias.
 * Sin estado, sin dependencias de BD. Testeables en aislamiento.
 *
 * Convención: "ISO naive" = "YYYY-MM-DDTHH:mm:ss" sin offset ni 'Z'.
 */
import {
  dateAndTimeToDateLocal,
  dateToDateStringLocal,
  dateToTimeStringLocal,
} from '@/lib/timezone';

/**
 * Formatea un Date (UTC) como ISO naive en la zona horaria indicada.
 * Resultado: "YYYY-MM-DDTHH:mm:00".
 */
function dateToISONaive(date: Date, timeZone: string): string {
  const datePart = dateToDateStringLocal(date, timeZone);
  const timePart = dateToTimeStringLocal(date, timeZone);
  return `${datePart}T${timePart}:00`;
}

/**
 * Convierte un ISO naive interpretado en `fromTz` al ISO naive equivalente en `toTz`.
 *
 * @param isoString - Fecha en formato "YYYY-MM-DDTHH:mm:ss" sin offset.
 * @param fromTz - IANA timezone de origen, ej. "America/Mexico_City".
 * @param toTz - IANA timezone de destino, ej. "America/New_York".
 * @returns ISO naive en la zona destino.
 *
 * @example
 * translateTimezone("2026-03-16T09:00:00", "America/Mexico_City", "America/New_York")
 * // → "2026-03-16T11:00:00"  (CST→EDT, +2 h)
 */
export function translateTimezone(isoString: string, fromTz: string, toTz: string): string {
  const tIndex = isoString.indexOf('T');
  const datePart = tIndex !== -1 ? isoString.slice(0, tIndex) : isoString;
  const rawTime = tIndex !== -1 ? isoString.slice(tIndex + 1) : '00:00';
  // Tomar solo HH:mm (los primeros 5 caracteres del bloque horario)
  const timeHHMM = rawTime.slice(0, 5);

  const utcDate = dateAndTimeToDateLocal(datePart, timeHHMM, fromTz);
  if (!utcDate) {
    throw new Error(`No se pudo parsear "${isoString}" como fecha en ${fromTz}.`);
  }

  return dateToISONaive(utcDate, toTz);
}

/**
 * Genera la representación dual de un slot para una invitación colaborativa.
 * El input `start`/`end` son objetos Date (UTC) almacenados en BD.
 *
 * @param start - Inicio del slot (Date UTC).
 * @param end - Fin del slot (Date UTC).
 * @param hostTimezone - IANA timezone del anfitrión.
 * @param inviteeTimezone - IANA timezone del invitado.
 * @returns Objeto con el horario en ambas zonas como ISO naive.
 */
export function translateSlotForInvitee(
  start: Date,
  end: Date,
  hostTimezone: string,
  inviteeTimezone: string,
): {
  startHostTz: string;
  endHostTz: string;
  startLocalTz: string;
  endLocalTz: string;
  hostTimezone: string;
  localTimezone: string;
} {
  return {
    startHostTz: dateToISONaive(start, hostTimezone),
    endHostTz: dateToISONaive(end, hostTimezone),
    startLocalTz: dateToISONaive(start, inviteeTimezone),
    endLocalTz: dateToISONaive(end, inviteeTimezone),
    hostTimezone,
    localTimezone: inviteeTimezone,
  };
}
