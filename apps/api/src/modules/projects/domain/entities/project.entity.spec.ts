import { describe, expect, it } from 'vitest';
import { Project } from './project.entity';

const NOW = new Date('2026-08-25T12:00:00.000Z');

describe('Project', () => {
  describe('creación', () => {
    it('un proyecto de desarrollo exige etapa comercial', () => {
      const result = Project.create({ id: 'p1', name: 'Portal', slug: 'portal', type: 'development', now: NOW });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('PROJECT_SALES_STAGE_REQUIRED');
    });

    it('un proyecto de desarrollo con etapa comercial se crea sin problema', () => {
      const result = Project.create({
        id: 'p1',
        name: 'Portal',
        slug: 'portal',
        type: 'development',
        salesStage: 'approved',
        now: NOW,
      });

      expect(result.isOk()).toBe(true);
    });

    it('un proyecto de soporte rechaza tener etapa comercial', () => {
      const result = Project.create({
        id: 'p1',
        name: 'Soporte Acme',
        slug: 'soporte-acme',
        type: 'support',
        salesStage: 'approved',
        now: NOW,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('PROJECT_SALES_STAGE_NOT_ALLOWED');
    });

    it('un proyecto de soporte sin etapa comercial se crea sin problema', () => {
      const result = Project.create({ id: 'p1', name: 'Soporte Acme', slug: 'soporte-acme', type: 'support', now: NOW });

      expect(result.isOk()).toBe(true);
    });

    it('un desarrollo sin aprobar nace en "No iniciado"', () => {
      const project = Project.create({
        id: 'p1',
        name: 'Portal',
        slug: 'portal',
        type: 'development',
        salesStage: 'prospect',
        now: NOW,
      }).unwrap();

      expect(project.status).toBe('draft');
    });

    it('un desarrollo ya aprobado nace No iniciado — solo el Hito 0 lo activa', () => {
      const project = Project.create({
        id: 'p1',
        name: 'Portal',
        slug: 'portal',
        type: 'development',
        salesStage: 'approved',
        now: NOW,
      }).unwrap();

      expect(project.status).toBe('draft');
      expect(project.hito0At).toBeNull();
    });

    it('un proyecto de soporte nace activo', () => {
      const project = Project.create({
        id: 'p1',
        name: 'Soporte Acme',
        slug: 'soporte-acme',
        type: 'support',
        now: NOW,
      }).unwrap();

      expect(project.status).toBe('active');
    });

    it('respeta el estado explícito por sobre el default', () => {
      const project = Project.create({
        id: 'p1',
        name: 'Portal',
        slug: 'portal',
        type: 'development',
        salesStage: 'prospect',
        status: 'on_hold',
        now: NOW,
      }).unwrap();

      expect(project.status).toBe('on_hold');
    });
  });

  describe('actualización', () => {
    it('rechaza asignar etapa comercial a un proyecto de soporte', () => {
      const project = Project.create({ id: 'p1', name: 'Soporte', slug: 'soporte', type: 'support', now: NOW }).unwrap();

      const result = project.updateDetails({ salesStage: 'approved' }, NOW);

      expect(result.isErr()).toBe(true);
    });

    it('al pasar a soporte, la fase se limpia (aunque hoy el tipo no cambia tras crear)', () => {
      const project = Project.create({
        id: 'p1',
        name: 'Portal',
        slug: 'portal',
        type: 'development',
        salesStage: 'approved',
        now: NOW,
      }).unwrap();

      project.updateDetails({ phase: 'development' }, NOW);

      expect(project.phase).toBe('development');
    });
  });

  describe('cambio de estado', () => {
    it('al finalizar, fija la fecha de término si no la tenía', () => {
      const project = Project.create({
        id: 'p1',
        name: 'Portal',
        slug: 'portal',
        type: 'development',
        salesStage: 'approved',
        now: NOW,
      }).unwrap();

      project.changeStatus('finished', NOW);

      expect(project.status).toBe('finished');
      expect(project.toSnapshot().endDate).toEqual(NOW);
    });

    it('no emite evento si el estado no cambia', () => {
      const project = Project.create({
        id: 'p1',
        name: 'Portal',
        slug: 'portal',
        type: 'development',
        salesStage: 'approved',
        now: NOW,
      }).unwrap();
      project.pullDomainEvents();

      project.changeStatus('draft', NOW);

      expect(project.pullDomainEvents()).toHaveLength(0);
    });
  });

  describe('Hito 0', () => {
    it('activateFromHito0 fija fecha/origen/motivo y activa el proyecto', () => {
      const project = Project.create({
        id: 'p1',
        name: 'Portal',
        slug: 'portal',
        type: 'development',
        salesStage: 'approved',
        status: 'draft',
        now: NOW,
      }).unwrap();

      project.activateFromHito0(NOW, 'auto_invoice', null);

      expect(project.status).toBe('active');
      expect(project.hito0At).toEqual(NOW);
      expect(project.hito0Source).toBe('auto_invoice');
      expect(project.hito0Reason).toBeNull();
    });

    it('activateFromHito0 manual guarda el motivo', () => {
      const project = Project.create({
        id: 'p1',
        name: 'Portal',
        slug: 'portal',
        type: 'development',
        salesStage: 'approved',
        status: 'draft',
        now: NOW,
      }).unwrap();

      project.activateFromHito0(NOW, 'manual', 'Contrato firmado, sin factura aún.');

      expect(project.hito0Source).toBe('manual');
      expect(project.hito0Reason).toBe('Contrato firmado, sin factura aún.');
    });

    it('reactivar desde on_hold vía changeStatus no toca el Hito 0 ya registrado', () => {
      const project = Project.create({
        id: 'p1',
        name: 'Portal',
        slug: 'portal',
        type: 'development',
        salesStage: 'approved',
        status: 'draft',
        now: NOW,
      }).unwrap();
      project.activateFromHito0(NOW, 'auto_invoice', null);
      project.changeStatus('on_hold', NOW);

      const later = new Date('2026-09-10T12:00:00.000Z');
      project.changeStatus('active', later);

      expect(project.status).toBe('active');
      expect(project.hito0At).toEqual(NOW);
      expect(project.hito0Source).toBe('auto_invoice');
    });

    it('correctHito0Date solo cambia la fecha', () => {
      const project = Project.create({
        id: 'p1',
        name: 'Portal',
        slug: 'portal',
        type: 'development',
        salesStage: 'approved',
        status: 'draft',
        now: NOW,
      }).unwrap();
      project.activateFromHito0(NOW, 'auto_invoice', null);

      const corrected = new Date('2026-08-20T12:00:00.000Z');
      project.correctHito0Date(corrected, NOW);

      expect(project.hito0At).toEqual(corrected);
      expect(project.hito0Source).toBe('auto_invoice');
      expect(project.status).toBe('active');
    });

    it('resolveManagementApproval de un Hito 0 sin fecha previa la fija en `now` con origen auto_invoice', () => {
      const project = Project.create({
        id: 'p1',
        name: 'Portal',
        slug: 'portal',
        type: 'development',
        salesStage: 'approved',
        status: 'draft',
        now: NOW,
      }).unwrap();
      project.pauseForManagementApproval(NOW);

      const later = new Date('2026-09-10T12:00:00.000Z');
      project.resolveManagementApproval(later);

      expect(project.status).toBe('active');
      expect(project.pendingManagementApproval).toBe(false);
      expect(project.hito0At).toEqual(later);
      expect(project.hito0Source).toBe('auto_invoice');
    });
  });

  describe('borrado lógico', () => {
    it('conserva el nombre y las horas: no es destructivo', () => {
      const project = Project.create({
        id: 'p1',
        name: 'Portal',
        slug: 'portal',
        type: 'development',
        salesStage: 'approved',
        soldHours: 120,
        now: NOW,
      }).unwrap();

      project.softDelete(NOW);

      expect(project.isDeleted).toBe(true);
      expect(project.name).toBe('Portal');
      expect(project.toSnapshot().soldHours).toBe(120);
    });
  });
});
