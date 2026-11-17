import { describe, expect, it, vi } from 'vitest';
import { projectModuleTasks, projectModuleDeliveries, projectModuleSegments, type Database } from '@kora/db';
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

  it('al aprobar todas las tareas NO cierra automáticamente: habilita cierre manual', async () => {
    const context = fixture(3, 0);
    await context.repository.refreshSegmentClosure('segment-1', date);
    expect(context.whereSelect).toHaveBeenCalledOnce();
    expect(context.update).not.toHaveBeenCalled();
    // Si había un closedAt histórico, queda intacto. Si no, sigue abierto
    // hasta ejecutar closureAction='close' mediante el caso de uso.
  });
});

describe('DrizzleProjectModuleRepository.removeSegmentWithDependencies', () => {
  it('elimina primero tareas y entregas y finalmente bloque, sin tocar las HH del proyecto', async () => {
    const deleted: unknown[] = [];
    const responses = [[{ id: 'task-1' }, { id: 'task-2' }],
      [{ id: 'delivery-1' }], [{ id: 'segment-1' }]];
    const remove = vi.fn((table: unknown) => {
      deleted.push(table);
      return { where: () => ({ returning: vi.fn().mockResolvedValue(
        responses[deleted.length - 1],
      ) }) };
    });
    const repo = new DrizzleProjectModuleRepository({ delete: remove } as unknown as Database);
    const result = await repo.removeSegmentWithDependencies('segment-1');
    expect(result).toEqual({ removed: true, taskCount: 2, deliveryCount: 1 });
    expect(deleted).toEqual([projectModuleTasks, projectModuleDeliveries, projectModuleSegments]);
    // La base configura hour_entries.task_id/segment_id ON DELETE SET NULL;
    // nunca se ejecuta un DELETE sobre hour_entries.
    expect(remove).toHaveBeenCalledTimes(3);
  });
  it('si falla cualquier eliminación, se propaga el error al UnitOfWork para hacer rollback', async () => {
    const remove = vi.fn().mockReturnValue({
      where: () => ({ returning: () => Promise.reject(new Error('FK conflict')) }),
    });
    const repo = new DrizzleProjectModuleRepository({ delete: remove } as unknown as Database);
    await expect(repo.removeSegmentWithDependencies('segment-1')).rejects.toThrow('FK conflict');
  });
});
