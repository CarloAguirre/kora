import { describe, expect, it } from 'vitest';
import { shouldShowProjectManagerTeamView } from './team-detail-view';

describe('shouldShowProjectManagerTeamView', () => {
  it('prioriza la vista editable cuando una persona lidera el proyecto y el equipo', () => {
    expect(shouldShowProjectManagerTeamView(true, true)).toBe(false);
  });

  it('mantiene la vista de seguimiento cuando lidera solo el proyecto', () => {
    expect(shouldShowProjectManagerTeamView(true, false)).toBe(true);
  });

  it('mantiene la vista de equipo para el líder que no gestiona el proyecto', () => {
    expect(shouldShowProjectManagerTeamView(false, true)).toBe(false);
  });

  it('no otorga por sí sola permisos de edición a otros participantes', () => {
    expect(shouldShowProjectManagerTeamView(false, false)).toBe(false);
  });
});
