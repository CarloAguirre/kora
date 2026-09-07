import { describe, expect, it } from 'vitest';
import { Ticket } from './ticket.entity';

const NOW = new Date('2026-08-26T12:00:00.000Z');

describe('Ticket', () => {
  describe('creación', () => {
    it('nace pendiente', () => {
      const result = Ticket.create({ id: 't1', title: 'No carga el reporte', now: NOW });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.status).toBe('pending');
    });

    it('rechaza título vacío', () => {
      const result = Ticket.create({ id: 't1', title: '   ', now: NOW });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('TICKET_INVALID_TITLE');
    });
  });

  describe('cambio de estado', () => {
    const pending = () => {
      const result = Ticket.create({ id: 't1', title: 'Ticket', now: NOW });
      if (result.isErr()) throw new Error('setup failed');
      return result.value;
    };

    it('avanzar de pendiente a en proceso no es un reabierto', () => {
      const ticket = pending();
      const { reopened } = ticket.changeStatus('in_progress', NOW);

      expect(reopened).toBe(false);
      expect(ticket.status).toBe('in_progress');
    });

    it('cerrar el ticket sin solución previa fija resolvedAt', () => {
      const ticket = pending();
      ticket.changeStatus('closed', NOW);

      expect(ticket.toSnapshot().resolvedAt).toEqual(NOW);
    });

    it('reabrir un ticket cerrado se marca como reabierto y limpia resolvedAt', () => {
      const ticket = pending();
      ticket.changeStatus('closed', NOW);

      const later = new Date('2026-08-27T09:00:00.000Z');
      const { reopened } = ticket.changeStatus('in_progress', later);

      expect(reopened).toBe(true);
      expect(ticket.status).toBe('in_progress');
      expect(ticket.toSnapshot().resolvedAt).toBeNull();
    });

    it('mover de terminado a cerrado no cuenta como reabierto', () => {
      const ticket = pending();
      ticket.changeStatus('done', NOW);
      const { reopened } = ticket.changeStatus('closed', NOW);

      expect(reopened).toBe(false);
    });
  });

  describe('edición', () => {
    it('rechaza vaciar el título al editar', () => {
      const created = Ticket.create({ id: 't1', title: 'Ticket', now: NOW });
      if (created.isErr()) throw new Error('setup failed');

      const result = created.value.updateDetails({ title: '   ' }, NOW);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('TICKET_INVALID_TITLE');
    });

    it('una clave presente pero en undefined no borra el valor ya guardado', () => {
      // Reproduce el flujo real de UpdateTicketUseCase: arma el objeto con
      // TODAS las claves del DTO, así que un campo que el cliente no mandó
      // en un PATCH parcial (p.ej. el diálogo de "Registrar solución", que
      // solo envía resolution/status) llega aquí como `title: undefined`,
      // no ausente. Antes de assignDefined, Object.assign lo tomaba como
      // "bórralo" y dejaba title en undefined — NOT NULL en la base, así
      // que el guardado fallaba siempre.
      const created = Ticket.create({ id: 't1', title: 'No carga el reporte', now: NOW });
      if (created.isErr()) throw new Error('setup failed');
      const ticket = created.value;

      const result = ticket.updateDetails(
        { title: undefined, description: undefined, resolution: 'Se reinició el servicio' },
        NOW,
      );

      expect(result.isOk()).toBe(true);
      const snapshot = ticket.toSnapshot();
      expect(snapshot.title).toBe('No carga el reporte');
      expect(snapshot.resolution).toBe('Se reinició el servicio');
    });
  });

  describe('eliminación', () => {
    it('no se puede eliminar dos veces', () => {
      const created = Ticket.create({ id: 't1', title: 'Ticket', now: NOW });
      if (created.isErr()) throw new Error('setup failed');
      const ticket = created.value;

      ticket.softDelete(NOW);
      const result = ticket.softDelete(NOW);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('TICKET_ALREADY_CLOSED');
    });
  });
});
