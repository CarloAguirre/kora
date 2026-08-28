import { describe, expect, it } from 'vitest';
import { Team } from './team.entity';

const NOW = new Date('2026-08-25T12:00:00.000Z');

function buildTeam(): Team {
  return Team.create({ id: 'team-1', name: '  Desarrollo  ', now: NOW });
}

describe('Team', () => {
  it('recorta el nombre al crear', () => {
    expect(buildTeam().name).toBe('Desarrollo');
  });

  it('nace activo', () => {
    expect(buildTeam().isActive).toBe(true);
  });

  it('emite un evento de creación', () => {
    expect(buildTeam().pullDomainEvents()[0]?.name).toBe('team.created');
  });

  it('el borrado lógico también lo desactiva', () => {
    const team = buildTeam();

    team.softDelete(NOW);

    expect(team.isDeleted).toBe(true);
    expect(team.isActive).toBe(false);
  });

  it('el borrado lógico es idempotente', () => {
    const team = buildTeam();
    team.pullDomainEvents();

    team.softDelete(NOW);
    team.softDelete(NOW);

    expect(team.pullDomainEvents().filter((e) => e.name === 'team.deleted')).toHaveLength(1);
  });

  it('actualiza solo los campos indicados', () => {
    const team = buildTeam();

    team.updateDetails({ description: 'Equipo de desarrollo' }, NOW);

    expect(team.name).toBe('Desarrollo');
    expect(team.description).toBe('Equipo de desarrollo');
  });
});
