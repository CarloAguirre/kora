import { describe, expect, it } from 'vitest';
import { suggestedKoraTeamForRole } from './quotation-role-team-suggestions';

const teams = [
  { id: 'dev', name: 'Desarrollo' },
  { id: 'pmo', name: 'PMO' },
  { id: 'qa', name: 'QA' },
  { id: 'ux', name: 'UX-UI' },
  { id: 'ia', name: 'IA' },
  { id: 'rpa', name: 'RPA' },
];
describe('Sugerencias de correspondencia perfil IA → equipo Kora', () => {
  it.each([
    ['Tech Lead / Arquitecto de Software', 'dev'],
    ['Desarrollador Backend', 'dev'],
    ['Desarrollador Frontend (PWA)', 'dev'],
    ['Project Manager', 'pmo'],
    ['QA Engineer', 'qa'],
    ['Diseñador UX/UI', 'ux'],
    ['RPA Developer', 'rpa'],
    ['Ingeniero de Inteligencia Artificial', 'ia'],
  ])('%s sugiere el equipo real %s', (role, expected) => {
    expect(suggestedKoraTeamForRole(role, teams)?.id).toBe(expected);
  });

  it('nunca inventa un equipo para roles desconocidos ni catálogos vacíos', () => {
    expect(suggestedKoraTeamForRole('Especialista SAP', teams)).toBeNull();
    expect(suggestedKoraTeamForRole('Project Manager', [])).toBeNull();
  });

  it('no elige arbitrariamente entre equipos duplicados o ambiguos', () => {
    expect(suggestedKoraTeamForRole('Tech Lead', [
      ...teams, { id: 'dev2', name: 'Equipo Desarrollo' },
    ])).toBeNull();
    expect(suggestedKoraTeamForRole('QA', [
      ...teams, { id: 'qa2', name: 'QA' },
    ])).toBeNull();
  });

  it('respeta coincidencia exacta antes que heurísticas', () => {
    const exact = { id: 'backend', name: 'Desarrollador Backend' };
    expect(suggestedKoraTeamForRole('Desarrollador Backend', [...teams, exact]))
      .toEqual(exact);
  });
});
