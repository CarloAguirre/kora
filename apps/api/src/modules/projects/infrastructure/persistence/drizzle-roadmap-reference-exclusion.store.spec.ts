import { describe, expect, it, vi } from 'vitest';
import { ROADMAP_REMOVED_TEAM_BLOCK_WBS } from '@kora/contracts';
import type { Database } from '@kora/db';
import { DrizzleRoadmapReferenceExclusionStore } from './drizzle-roadmap-reference-exclusion.store';

const versionId = '0777e456-fd76-445e-83f1-afc25061c106';
function fixture(moduleIds: string[]) {
  const query = {
    innerJoin: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    limit: vi.fn().mockResolvedValue([{ versionId, metadata: { moduleIds } }]),
  };
  query.innerJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  const from = vi.fn().mockReturnValue(query);
  const select = vi.fn().mockReturnValue({ from });
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  const insert = vi.fn().mockReturnValue({ values });
  const store = new DrizzleRoadmapReferenceExclusionStore({
    select, insert,
  } as unknown as Database);
  return { store, select, values, insert, onConflictDoNothing };
}
describe('Tombstone persistente del bloque comercial retirado', () => {
  it('escribe módulo + versión + equipo sin modificar la cotización fuente', async () => {
    const fx = fixture(['module-1']);
    expect(await fx.store.suppressTeamBlock('project-1', 'module-1', 'team-ux', 'actor-1'))
      .toBe(true);
    expect(fx.values).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1', versionId,
      wbs: ROADMAP_REMOVED_TEAM_BLOCK_WBS,
      role: 'team-ux', actorUserId: 'actor-1',
    });
    expect(fx.onConflictDoNothing).toHaveBeenCalledOnce();
  });
  it('no registra exclusión si la fase no pertenece a la versión traspasada', async () => {
    const fx = fixture(['module-other']);
    expect(await fx.store.suppressTeamBlock('project-1', 'module-1', 'team-ux', 'actor-1'))
      .toBe(false);
    expect(fx.insert).not.toHaveBeenCalled();
  });
});
