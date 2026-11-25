import { describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Database } from '@kora/db';
import { DrizzleProjectModuleRepository } from './drizzle-project-module.repository';

/**
 * El dashboard no puede ofrecer transiciones sobre tareas de proyectos
 * borrados lógicamente: UpdateProjectModuleTaskUseCase rechaza esos proyectos.
 * Probamos el SQL de ambas consultas sin necesitar una BD ni tocar históricos.
 */
function captureFilters() {
  const conditions: SQL[] = [];
  const query = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn((condition: SQL) => {
      conditions.push(condition);
      return query;
    }),
    orderBy: vi.fn().mockResolvedValue([]),
  };
  const database = { select: vi.fn(() => query) } as unknown as Database;
  return { repository: new DrizzleProjectModuleRepository(database), conditions };
}

function expectOnlyLiveProjects(where: SQL) {
  const sql = new PgDialect().sqlToQuery(where).sql;
  expect(sql).toMatch(/"projects"\."deleted_at" is null/i);
}

describe('DrizzleProjectModuleRepository — dashboard del colaborador', () => {
  it('lista tareas asignadas solo desde proyectos no eliminados y tareas no canceladas', async () => {
    const { repository, conditions } = captureFilters();
    expect(await repository.listTasksAssignedToUser('user-1')).toEqual([]);
    expect(conditions).toHaveLength(1);
    expectOnlyLiveProjects(conditions[0]!);
    const sql = new PgDialect().sqlToQuery(conditions[0]!).sql;
    expect(sql).toMatch(/cancelled_at.*is null/i);
    expect(sql).toContain('assignee_user_id');
  });

  it('lista entregas asignadas solo desde proyectos no eliminados', async () => {
    const { repository, conditions } = captureFilters();
    expect(await repository.listDeliveriesAssignedToUser('user-1')).toEqual([]);
    expect(conditions).toHaveLength(1);
    expectOnlyLiveProjects(conditions[0]!);
    expect(new PgDialect().sqlToQuery(conditions[0]!).sql).toContain('assignee_user_id');
  });
});
