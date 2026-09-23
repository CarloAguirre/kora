import { describe, expect, it } from 'vitest';
import { Client } from './client.entity';
import { TaxId } from '../value-objects/tax-id.vo';

const NOW = new Date('2026-08-25T12:00:00.000Z');

function buildClient(): Client {
  return Client.create({
    id: 'client-1',
    companyName: 'Acme SpA',
    slug: 'acme-spa',
    legalName: 'Acme Servicios Limitada',
    taxId: TaxId.create('76.123.456-7').unwrap(),
    now: NOW,
  });
}

describe('Client', () => {
  it('nace activo', () => {
    expect(buildClient().status).toBe('active');
  });

  it('emite un evento de creación', () => {
    expect(buildClient().pullDomainEvents()[0]?.name).toBe('client.created');
  });

  it('recorta espacios del nombre al crear', () => {
    const client = Client.create({
      id: 'client-1',
      companyName: '  Acme SpA  ',
      slug: 'acme-spa',
      legalName: 'Acme',
      taxId: TaxId.create('1-9').unwrap(),
      now: NOW,
    });

    expect(client.companyName).toBe('Acme SpA');
  });

  describe('desactivar', () => {
    it('cierra la ventana de servicio', () => {
      const client = buildClient();
      const later = new Date('2026-09-01T00:00:00.000Z');

      client.deactivate(later);

      expect(client.status).toBe('inactive');
    });

    it('es idempotente: desactivar dos veces no duplica el evento', () => {
      const client = buildClient();
      client.pullDomainEvents();

      client.deactivate(NOW);
      client.deactivate(NOW);

      const events = client.pullDomainEvents().filter((e) => e.name === 'client.deactivated');
      expect(events).toHaveLength(1);
    });

    it('NO decide por sí sola si hace falta confirmar una cascada', () => {
      // La entidad no sabe cuántos proyectos tiene el cliente: esa pregunta
      // cruza el límite del agregado y la responde el caso de uso, no aquí.
      const client = buildClient();

      expect(() => client.deactivate(NOW)).not.toThrow();
    });
  });

  describe('activar', () => {
    it('reabre la ventana de servicio', () => {
      const client = buildClient();
      client.deactivate(NOW);

      client.activate(new Date('2026-09-05T00:00:00.000Z'));

      expect(client.status).toBe('active');
    });
  });

  describe('contacto principal', () => {
    it('empieza sin contacto principal', () => {
      expect(buildClient().primaryContactId).toBeNull();
    });

    it('se puede asignar y reasignar', () => {
      const client = buildClient();

      client.setPrimaryContact('contact-1', NOW);
      expect(client.primaryContactId).toBe('contact-1');

      client.setPrimaryContact('contact-2', NOW);
      expect(client.primaryContactId).toBe('contact-2');
    });

    it('se puede retirar pasando null', () => {
      const client = buildClient();
      client.setPrimaryContact('contact-1', NOW);

      client.setPrimaryContact(null, NOW);

      expect(client.primaryContactId).toBeNull();
    });
  });

  describe('borrado lógico', () => {
    it('marca la fecha sin destruir el registro', () => {
      const client = buildClient();

      client.softDelete(NOW);

      expect(client.isDeleted).toBe(true);
      expect(client.companyName).toBe('Acme SpA');
    });

    it('es idempotente', () => {
      const client = buildClient();
      client.pullDomainEvents();

      client.softDelete(NOW);
      client.softDelete(NOW);

      const events = client.pullDomainEvents().filter((e) => e.name === 'client.deleted');
      expect(events).toHaveLength(1);
    });
  });
});
