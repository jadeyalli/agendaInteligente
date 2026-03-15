import { describe, it, expect } from 'vitest';
import { translateTimezone, translateSlotForInvitee } from './timezone-translator';

describe('translateTimezone', () => {
  it('traduce CST (Mexico City) → EDT (New York) correctamente', () => {
    // America/Mexico_City = CST (UTC-6) sin DST desde 2023.
    // America/New_York en marzo 2026 (DST activo desde 8-mar) = EDT (UTC-4).
    // 09:00 CST → 15:00 UTC → 11:00 EDT  (+2 h)
    const result = translateTimezone(
      '2026-03-16T09:00:00',
      'America/Mexico_City',
      'America/New_York',
    );
    expect(result).toBe('2026-03-16T11:00:00');
  });

  it('traduce EDT (New York) → CST (Mexico City) correctamente', () => {
    // 11:00 EDT → 15:00 UTC → 09:00 CST  (-2 h)
    const result = translateTimezone(
      '2026-03-16T11:00:00',
      'America/New_York',
      'America/Mexico_City',
    );
    expect(result).toBe('2026-03-16T09:00:00');
  });

  it('devuelve la misma hora si ambas zonas son iguales', () => {
    const result = translateTimezone(
      '2026-03-16T14:30:00',
      'America/Mexico_City',
      'America/Mexico_City',
    );
    expect(result).toBe('2026-03-16T14:30:00');
  });

  it('maneja el cruce de medianoche hacia adelante', () => {
    // 22:00 CST → 04:00 UTC (+6) → 04:00 UTC → 00:00 EDT (+4)
    // 22:00 CST = 04:00 UTC del día siguiente → 00:00 EDT
    const result = translateTimezone(
      '2026-03-16T22:00:00',
      'America/Mexico_City',
      'America/New_York',
    );
    expect(result).toBe('2026-03-17T00:00:00');
  });

  it('maneja UTC como zona de origen', () => {
    // 15:00 UTC → 09:00 CST
    const result = translateTimezone('2026-03-16T15:00:00', 'UTC', 'America/Mexico_City');
    expect(result).toBe('2026-03-16T09:00:00');
  });
});

describe('translateSlotForInvitee', () => {
  it('genera representación dual del slot correctamente', () => {
    // 15:00 UTC = 09:00 CST = 11:00 EDT
    const start = new Date('2026-03-16T15:00:00Z');
    const end = new Date('2026-03-16T16:00:00Z');

    const result = translateSlotForInvitee(
      start,
      end,
      'America/Mexico_City',
      'America/New_York',
    );

    expect(result.startHostTz).toBe('2026-03-16T09:00:00');
    expect(result.endHostTz).toBe('2026-03-16T10:00:00');
    expect(result.startLocalTz).toBe('2026-03-16T11:00:00');
    expect(result.endLocalTz).toBe('2026-03-16T12:00:00');
    expect(result.hostTimezone).toBe('America/Mexico_City');
    expect(result.localTimezone).toBe('America/New_York');
  });
});
