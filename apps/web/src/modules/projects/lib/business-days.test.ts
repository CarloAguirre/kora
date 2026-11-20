import { describe, expect, it } from 'vitest';
import { addBusinessDays, countBusinessDays } from './business-days';

const NONE = new Set<string>();

describe('countBusinessDays', () => {
  it('cuenta lunes-viernes, inclusive', () => {
    // vie 23-10-2026 → vie 06-11-2026
    expect(countBusinessDays('2026-10-23', '2026-11-06', NONE)).toBe(11);
  });

  it('descuenta feriados que caen en día hábil', () => {
    expect(countBusinessDays('2026-10-23', '2026-11-06', new Set(['2026-10-26']))).toBe(10);
  });

  it('rango vacío o invertido da 0', () => {
    expect(countBusinessDays('', '2026-11-06', NONE)).toBe(0);
    expect(countBusinessDays('2026-11-06', '2026-10-23', NONE)).toBe(0);
  });
});

describe('addBusinessDays', () => {
  it('es la inversa de countBusinessDays', () => {
    expect(addBusinessDays('2026-10-23', 11, NONE)).toBe('2026-11-06');
    expect(addBusinessDays('2026-10-23', 1, NONE)).toBe('2026-10-23');
  });

  it('salta fines de semana y feriados', () => {
    // vie 23 + 2 hábiles → lun 26 es feriado → mar 27
    expect(addBusinessDays('2026-10-23', 2, new Set(['2026-10-26']))).toBe('2026-10-27');
  });

  it('si el inicio cae en fin de semana cuenta desde el lunes', () => {
    expect(addBusinessDays('2026-10-24', 1, NONE)).toBe('2026-10-26');
  });
});
