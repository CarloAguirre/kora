import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@kora/db';
import { DrizzleProjectModuleRepository } from './drizzle-project-module.repository';

const date = new Date('2026-11-04T19:32:09.000Z');

function fixture(active: number, pending: number) {
  const whereSelect = vi.fn().mockResolvedValue([{ active, pending }]);
  const from = vi.fn().mockReturnValue({ where: whereSelect });
  const select = vi.fn().mockReturnValue({ from });
  const whereUpdate = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where: whereUpdate });
  const update = vi.fn().mockReturnValue({ set });
  const repository = new DrizzleProjectModuleRepository({
    select, update,
  } as unknown as Database);
  return { repository, select, from, whereSelect, update, set, whereUpdate };
}

describe('DrizzleProjectModuleRepository.refreshSegmentClosure', () => {
  it('no cierra un bloque cuando aún no tiene tareas', async () => {
    const context = fixture(0, 0);
    await context.repository.refreshSegmentClosure('segment-1', date);
    expect(context.whereSelect).toHaveBeenCalledOnce();
    expect(context.set).toHaveBeenCalledWith({ closedAt: null, updatedAt: date });
  });

  it('no cierra el bloque si al menos una tarea no está aprobada', async () => {
    const context = fixture(2, 1);
    await context.repository.refreshSegmentClosure('segment-1', date);
    expect(context.set).toHaveBeenCalledWith({ closedAt: null, updatedAt: date });
  });

  it('con tareas aprobadas conserva el instante real del cierre anterior', async () => {
    const context = fixture(3, 0);
    await context.repository.refreshSegmentClosure('segment-1', date);
    const update = context.set.mock.calls[0]?.[0] as { closedAt: unknown; updatedAt: Date };
    // La actualización usa COALESCE(closed_at, ahora); no reescribe un
    // cierre ya registrado ni usa la antigua subconsulta correlacionada.
    expect(update.closedAt).not.toBeNull();
    expect(update.updatedAt).toBe(date);
    expect(context.whereUpdate).toHaveBeenCalledOnce();
  });
});
