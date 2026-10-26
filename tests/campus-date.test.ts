import { describe, expect, it } from 'vitest';
import { daysUntil, epochToCampusIso, parseCampusDate } from '../src/parsers/campus-date.js';

describe('campus dates', () => {
  it.each([
    ['miércoles, 2 de septiembre de 2026, 23:59', '2026-09-02T23:59:00-03:00'],
    ['mié, 21 de oct de 2026, 20:26', '2026-10-21T20:26:00-03:00'],
    ['21 oct 2026', '2026-10-21T00:00:00-03:00'],
    ['domingo, 1 de noviembre de 2026, 23:59', '2026-11-01T23:59:00-03:00'],
    ['2026-11-03 18:00', '2026-11-03T18:00:00-03:00'],
    ['03/11/2026 18:00', '2026-11-03T18:00:00-03:00']
  ])('parses %s', (text, expected) => {
    expect(parseCampusDate(text)).toBe(expected);
  });

  it('returns undefined when there is no date', () => {
    expect(parseCampusDate('Sin fecha de cierre')).toBeUndefined();
    expect(parseCampusDate('')).toBeUndefined();
    expect(parseCampusDate(undefined)).toBeUndefined();
    expect(parseCampusDate('31 de abril de 2026')).toBeUndefined();
  });

  it('resolves relative words against the campus timezone', () => {
    const now = new Date('2026-10-26T01:00:00Z'); // 22:00 del 25/10 en Mendoza
    expect(parseCampusDate('Hoy, 18:00', now)).toBe('2026-10-25T18:00:00-03:00');
    expect(parseCampusDate('Mañana, 10:30', now)).toBe('2026-10-26T10:30:00-03:00');
  });

  it('converts Moodle epochs to the campus offset', () => {
    expect(epochToCampusIso(1792625208)).toBe('2026-10-21T20:26:00-03:00');
    expect(epochToCampusIso(0)).toBeUndefined();
  });

  it('computes days until a deadline', () => {
    const now = new Date('2026-10-26T15:00:00Z');
    expect(daysUntil('2026-10-27T12:00:00-03:00', now)).toBe(1); // 15:00Z del día siguiente
    expect(daysUntil('2026-11-02T12:00:00-03:00', now)).toBe(7);
    expect(daysUntil('2026-10-20T12:00:00-03:00', now)).toBeLessThan(0);
    expect(daysUntil(undefined, now)).toBeUndefined();
  });
});
