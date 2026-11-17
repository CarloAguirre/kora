import { describe, expect, it } from 'vitest';
import { linkedSegmentTaskIds } from './linked-segment-task-ids';
import type { ProjectModuleRecord } from '../repositories/project-module.repository';

const id = '0777e456-fd76-445e-83f1-afc25061c101';
const second = '0777e456-fd76-445e-83f1-afc25061c102';
const segment = { id, teamId: 'team-dev' };
const task = (id: string, props: Record<string, unknown>) =>
  ({ id, teamId: 'team-dev', segmentId: null, cancelledAt: null,
    description: null, ...props });
const moduleOf = (segments: unknown[], tasks: unknown[]) =>
  ({ segments, tasks }) as unknown as Pick<ProjectModuleRecord, 'segments' | 'tasks'>;

describe('Resolución de tareas heredadas al eliminar un bloque', () => {
  it('elimina vínculos explícitos aunque exista otro bloque en la fase', () => {
    expect(linkedSegmentTaskIds(moduleOf([segment, { ...segment, id: second }], [
      task('explicit', { segmentId: id }),
      task('other', { segmentId: second }),
    ]), segment)).toEqual(['explicit']);
  });
  it('reconoce el marcador de bloque en la descripción sin eliminar la otra fase', () => {
    expect(linkedSegmentTaskIds(moduleOf([segment, { ...segment, id: second }], [
      task('legacy', { description: 'Trabajo histórico · ID ' + id }),
      task('wrong-block', { description: 'Trabajo histórico · ID ' + second }),
    ]), segment)).toEqual(['legacy']);
  });
  it('solo asocia tareas sin FK al único bloque del equipo, sin borrar otros equipos', () => {
    const data = moduleOf([segment], [
      task('sole-team', {}),
      task('other-team', { teamId: 'team-ux' }),
      task('cancelled', { cancelledAt: new Date() }),
    ]);
    expect(linkedSegmentTaskIds(data, segment)).toEqual(['sole-team']);
    expect(linkedSegmentTaskIds(moduleOf([segment, { ...segment, id: second }],
      data.tasks), segment)).toEqual([]);
  });
});
