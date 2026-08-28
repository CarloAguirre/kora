import { describe, expect, it } from 'vitest';
import { HourEntry } from './hour-entry.entity';

const NOW = new Date('2026-08-25T12:00:00.000Z');

const base = {
  id: 'h1',
  userId: 'u1',
  hours: 4,
  date: new Date('2026-08-24'),
  now: NOW,
};

describe('HourEntry', () => {
  describe('creación', () => {
    it('un colaborador nace pendiente', () => {
      const result = HourEntry.create({
        ...base,
        assignment: 'Proyecto',
        projectId: 'p1',
        ownerRequiresApproval: true,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.status).toBe('pending');
    });

    it('un líder autoregistrándose nace aprobado', () => {
      const result = HourEntry.create({
        ...base,
        assignment: 'Proyecto',
        projectId: 'p1',
        ownerRequiresApproval: false,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.status).toBe('approved');
    });

    it('"Proyecto" exige un proyecto', () => {
      const result = HourEntry.create({ ...base, assignment: 'Proyecto', ownerRequiresApproval: false });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('HOUR_ENTRY_PROJECT_REQUIRED');
    });

    it('"Vacaciones" rechaza llevar proyecto', () => {
      const result = HourEntry.create({
        ...base,
        assignment: 'Vacaciones',
        projectId: 'p1',
        ownerRequiresApproval: false,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('HOUR_ENTRY_PROJECT_NOT_ALLOWED');
    });

    it('un colaborador sin proyecto debe designar aprobador', () => {
      const result = HourEntry.create({ ...base, assignment: 'Vacaciones', ownerRequiresApproval: true });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('HOUR_ENTRY_DESIGNATED_APPROVER_REQUIRED');
    });

    it('un colaborador sin proyecto con aprobador designado se crea pendiente', () => {
      const result = HourEntry.create({
        ...base,
        assignment: 'Vacaciones',
        designatedApproverUserId: 'lider1',
        ownerRequiresApproval: true,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.status).toBe('pending');
    });

    it('las horas de proyecto no admiten aprobador designado', () => {
      const result = HourEntry.create({
        ...base,
        assignment: 'Proyecto',
        projectId: 'p1',
        designatedApproverUserId: 'lider1',
        ownerRequiresApproval: true,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('HOUR_ENTRY_DESIGNATED_APPROVER_NOT_ALLOWED');
    });

    it('rechaza horas fuera de rango', () => {
      const result = HourEntry.create({ ...base, hours: 25, assignment: 'Vacaciones', ownerRequiresApproval: false });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('HOUR_ENTRY_INVALID_HOURS');
    });
  });

  describe('aprobación y rechazo', () => {
    const pending = () => {
      const result = HourEntry.create({ ...base, assignment: 'Proyecto', projectId: 'p1', ownerRequiresApproval: true });
      if (result.isErr()) throw new Error('setup failed');
      return result.value;
    };

    it('aprobar un registro pendiente lo deja aprobado', () => {
      const entry = pending();
      const result = entry.approve('admin1', NOW);

      expect(result.isOk()).toBe(true);
      expect(entry.status).toBe('approved');
    });

    it('rechazar un registro pendiente exige motivo', () => {
      const entry = pending();
      const result = entry.reject('admin1', '', NOW);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('HOUR_ENTRY_REJECTION_REASON_REQUIRED');
    });

    it('rechazar con motivo deja el registro rechazado', () => {
      const entry = pending();
      const result = entry.reject('admin1', 'Horas duplicadas', NOW);

      expect(result.isOk()).toBe(true);
      expect(entry.status).toBe('rejected');
    });

    it('no se puede aprobar dos veces', () => {
      const entry = pending();
      entry.approve('admin1', NOW);
      const result = entry.approve('admin1', NOW);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('HOUR_ENTRY_INVALID_STATUS_TRANSITION');
    });
  });

  describe('edición', () => {
    it('un registro aprobado no se puede editar', () => {
      const result = HourEntry.create({ ...base, assignment: 'Proyecto', projectId: 'p1', ownerRequiresApproval: false });
      if (result.isErr()) throw new Error('setup failed');
      const entry = result.value;

      const update = entry.updateDetails({ hours: 5 }, false, NOW);

      expect(update.isErr()).toBe(true);
      if (update.isErr()) expect(update.error.code).toBe('HOUR_ENTRY_NOT_EDITABLE');
    });

    it('editar un registro rechazado lo vuelve a poner pendiente', () => {
      const created = HourEntry.create({ ...base, assignment: 'Proyecto', projectId: 'p1', ownerRequiresApproval: true });
      if (created.isErr()) throw new Error('setup failed');
      const entry = created.value;
      entry.reject('admin1', 'Motivo', NOW);

      const update = entry.updateDetails({ hours: 5 }, true, NOW);

      expect(update.isOk()).toBe(true);
      expect(entry.status).toBe('pending');
    });
  });
});
