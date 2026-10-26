import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { Database } from '@kora/db';
import { DrizzleHourEntryRepository } from './drizzle-hour-entry.repository';

/** Regression guard: the listing, dashboard and bell share this predicate. */
describe('DrizzleHourEntryRepository — SQL de visibilidad por líder', () => {
  function sqlForLeader() {
    const repository = new DrizzleHourEntryRepository({} as Database);
    const filter = (repository as unknown as { buildWhere: (input: { leaderScopeUserId: string }) => SQL })
      .buildWhere({ leaderScopeUserId: 'jose-1' });
    const compiled = new PgDialect().sqlToQuery(filter);
    return compiled;
  }

  it('solo concede liderazgo de equipo para proyectos development', () => {
    const query = sqlForLeader();
    expect(query.sql).toContain('development');
    expect(query.sql).toContain('project_teams');
    expect(query.params).toContain('jose-1');
  });

  it('para soporte permite líder de proyecto aunque exista equipo asignado', () => {
    const query = sqlForLeader();
    expect(query.sql).toContain('support');
    expect(query.sql).toContain('leader_user_id');
    expect(query.sql).toContain('not exists');
  });

  it('incluye al aprobador designado de horas sin proyecto', () => {
    expect(sqlForLeader().sql).toContain('designated_approver_user_id');
  });
});
