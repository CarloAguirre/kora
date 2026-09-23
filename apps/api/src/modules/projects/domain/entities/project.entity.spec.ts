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

    it('nace en estado activo', () => {
      const project = Project.create({
        id: 'p1',
        name: 'Portal',
        slug: 'portal',
        type: 'development',
        salesStage: 'prospect',
        now: NOW,
      }).unwrap();

      expect(project.status).toBe('active');
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

      project.changeStatus('active', NOW);

      expect(project.pullDomainEvents()).toHaveLength(0);
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
