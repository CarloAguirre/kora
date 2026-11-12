import { describe, expect, it } from 'vitest';
import { isLegacyHourEntryProject } from './hour-entry.contract';

describe('bloqueo histórico de vinculación de HH al plan', () => {
  it('inicio anterior al 11-11-2026 => legacy, aunque Hito 0 sea posterior', () => {
    expect(isLegacyHourEntryProject({
      startDate: '2026-03-30',
      hito0At: '2026-11-12T12:00:00.000Z',
      createdAt: '2026-11-01T12:00:00.000Z',
    })).toBe(true);
  });
  it('inicio el mismo día 11-11-2026 o posterior => plan moderno', () => {
    expect(isLegacyHourEntryProject({ startDate: '2026-11-11' })).toBe(false);
    expect(isLegacyHourEntryProject({ startDate: '2026-11-12' })).toBe(false);
  });
  it('sin fecha de inicio usa Hito 0 y luego creación', () => {
    expect(isLegacyHourEntryProject({ hito0At: new Date('2026-11-10T14:00:00Z') })).toBe(true);
    expect(isLegacyHourEntryProject({ createdAt: '2026-10-20T00:00:00Z' })).toBe(true);
    expect(isLegacyHourEntryProject({})).toBe(false);
  });
});
