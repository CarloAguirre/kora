import { describe, expect, it } from 'vitest';
import { User } from './user.entity';
import { Email } from '../value-objects/email.vo';
import { PersonName } from '../value-objects/person-name.vo';

/**
 * Tests del agregado `User`.
 *
 * No hay base de datos, ni contenedor de inyección, ni servidor: son las reglas
 * de negocio en estado puro. Que se puedan probar así es la ventaja concreta de
 * tenerlas en el dominio y no repartidas entre triggers de Postgres y
 * componentes de React, como en la v1 — donde comprobar "un admin no puede
 * cambiarse el rol a sí mismo" exigía levantar Postgres entero.
 */

const NOW = new Date('2026-08-25T12:00:00.000Z');
const ACTOR = 'actor-0000-0000-0000-000000000001';

function buildUser(id = 'user-0000-0000-0000-000000000002'): User {
  return User.create({
    id,
    email: Email.create('ana.soto@kabeli.cl').unwrap(),
    name: PersonName.create('Ana', 'Soto').unwrap(),
    role: 'collaborator',
    teamId: 'team-1',
    now: NOW,
  });
}

describe('User', () => {
  describe('creación', () => {
    it('nace activo y sin marca de borrado', () => {
      const user = buildUser();

      expect(user.status).toBe('active');
      expect(user.isDeleted).toBe(false);
      expect(user.canSignIn).toBe(true);
    });

    it('emite un evento de dominio de creación', () => {
      const events = buildUser().pullDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]?.name).toBe('user.created');
    });
  });

  describe('cambio de rol', () => {
    it('rechaza que alguien se cambie el rol a sí mismo', () => {
      const user = buildUser(ACTOR);

      const result = user.changeRole('admin', ACTOR, NOW);

      expect(result.isErr()).toBe(true);
      expect(user.role).toBe('collaborator');
    });

    it('permite que otro administrador cambie el rol', () => {
      const user = buildUser();

      const result = user.changeRole('leader', ACTOR, NOW);

      expect(result.isOk()).toBe(true);
      expect(user.role).toBe('leader');
    });

    it('no emite evento si el rol no cambia realmente', () => {
      const user = buildUser();
      user.pullDomainEvents();

      user.changeRole('collaborator', ACTOR, NOW);

      expect(user.pullDomainEvents()).toHaveLength(0);
    });
  });

  describe('cambio de estado', () => {
    it('rechaza que alguien se deshabilite a sí mismo', () => {
      const user = buildUser(ACTOR);

      const result = user.changeStatus('disabled', ACTOR, NOW);

      expect(result.isErr()).toBe(true);
      expect(user.status).toBe('active');
    });

    it('deshabilitar impide iniciar sesión', () => {
      const user = buildUser();

      user.changeStatus('disabled', ACTOR, NOW);

      expect(user.canSignIn).toBe(false);
    });

    it('el bloqueo del sistema no pasa por la regla del autocambio', () => {
      // Lo aplica un proceso automático tras varios intentos fallidos, no una
      // persona: exigirle un actor distinto no tendría sentido.
      const user = buildUser(ACTOR);

      user.blockBySystem(NOW);

      expect(user.status).toBe('blocked');
      expect(user.canSignIn).toBe(false);
    });

    it('rechaza cambiar el estado de un usuario ya eliminado', () => {
      const user = buildUser();
      user.softDelete(ACTOR, NOW);

      const result = user.changeStatus('active', ACTOR, NOW);

      expect(result.isErr()).toBe(true);
    });
  });

  describe('eliminación', () => {
    it('rechaza que alguien elimine su propia cuenta', () => {
      const user = buildUser(ACTOR);

      expect(user.softDelete(ACTOR, NOW).isErr()).toBe(true);
      expect(user.isDeleted).toBe(false);
    });

    it('es lógica: marca la fecha y deshabilita, sin destruir el registro', () => {
      const user = buildUser();

      const result = user.softDelete(ACTOR, NOW);

      expect(result.isOk()).toBe(true);
      expect(user.deletedAt).toEqual(NOW);
      expect(user.status).toBe('disabled');
      // El correo sigue ahí: las horas y tickets históricos siguen atribuibles.
      expect(user.email.value).toBe('ana.soto@kabeli.cl');
    });

    it('rechaza eliminar dos veces', () => {
      const user = buildUser();
      user.softDelete(ACTOR, NOW);

      expect(user.softDelete(ACTOR, NOW).isErr()).toBe(true);
    });

    it('restaurar devuelve al usuario al estado activo', () => {
      const user = buildUser();
      user.softDelete(ACTOR, NOW);

      user.restoreFromDeletion(NOW);

      expect(user.isDeleted).toBe(false);
      expect(user.status).toBe('active');
    });
  });

  describe('datos', () => {
    it('actualiza la marca de tiempo solo cuando algo cambia', () => {
      const user = buildUser();
      const later = new Date('2026-08-26T12:00:00.000Z');

      user.rename(PersonName.create('Ana', 'Soto').unwrap(), later);
      expect(user.updatedAt).toEqual(NOW);

      user.rename(PersonName.create('Ana María', 'Soto').unwrap(), later);
      expect(user.updatedAt).toEqual(later);
    });

    it('la instantánea no expone ningún dato de credenciales', () => {
      const snapshot = buildUser().toSnapshot();

      expect(Object.keys(snapshot)).not.toContain('passwordHash');
      expect(Object.keys(snapshot)).not.toContain('password');
    });
  });
});
