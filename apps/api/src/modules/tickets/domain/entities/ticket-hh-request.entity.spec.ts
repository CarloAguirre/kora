import { describe, expect, it } from 'vitest';
import { TicketHhRequest } from './ticket-hh-request.entity';

const NOW = new Date('2026-08-26T12:00:00.000Z');
const DATE = new Date('2026-08-26T00:00:00.000Z');

const build = (hours = 2.5) => {
  const result = TicketHhRequest.create({
    id: 'r1',
    ticketId: 't1',
    projectId: 'p1',
    userId: 'u1',
    date: DATE,
    hours,
    note: '  Trabajo extra  ',
    now: NOW,
  });
  if (result.isErr()) throw new Error('setup failed');
  return result.value;
};

describe('TicketHhRequest', () => {
  describe('creación', () => {
    it('nace pendiente y recorta la nota', () => {
      const request = build();

      expect(request.status).toBe('pending');
      expect(request.note).toBe('Trabajo extra');
    });

    it('rechaza horas en 0', () => {
      const result = TicketHhRequest.create({ id: 'r1', ticketId: 't1', projectId: 'p1', userId: 'u1', date: DATE, hours: 0, now: NOW });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('TICKET_HH_REQUEST_INVALID_HOURS');
    });

    it('rechaza más de 24 horas', () => {
      const result = TicketHhRequest.create({ id: 'r1', ticketId: 't1', projectId: 'p1', userId: 'u1', date: DATE, hours: 25, now: NOW });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('TICKET_HH_REQUEST_INVALID_HOURS');
    });
  });

  describe('aprobación', () => {
    it('aprueba una solicitud pendiente y vincula el registro de horas generado', () => {
      const request = build();
      const result = request.approve('reviewer1', 'entry1', NOW);

      expect(result.isOk()).toBe(true);
      expect(request.status).toBe('approved');
      expect(request.toSnapshot().hourEntryId).toBe('entry1');
      expect(request.toSnapshot().reviewedByUserId).toBe('reviewer1');
    });

    it('no se puede aprobar dos veces', () => {
      const request = build();
      request.approve('reviewer1', 'entry1', NOW);

      const result = request.approve('reviewer2', 'entry2', NOW);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('TICKET_HH_REQUEST_NOT_PENDING');
    });
  });

  describe('rechazo', () => {
    it('rechaza una solicitud pendiente con motivo', () => {
      const request = build();
      const result = request.reject('reviewer1', 'No corresponde', NOW);

      expect(result.isOk()).toBe(true);
      expect(request.status).toBe('rejected');
      expect(request.toSnapshot().rejectionReason).toBe('No corresponde');
    });

    it('exige un motivo no vacío', () => {
      const request = build();
      const result = request.reject('reviewer1', '   ', NOW);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('TICKET_HH_REQUEST_REJECTION_REASON_REQUIRED');
    });

    it('no se puede rechazar una solicitud ya aprobada', () => {
      const request = build();
      request.approve('reviewer1', 'entry1', NOW);

      const result = request.reject('reviewer2', 'Motivo', NOW);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('TICKET_HH_REQUEST_NOT_PENDING');
    });
  });
});
