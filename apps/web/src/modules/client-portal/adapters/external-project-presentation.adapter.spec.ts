import { describe, expect, it } from 'vitest';
import type { PortalActivity, PortalProjectDetail, PortalReceipt } from '../api/client-portal.api';
import { deliveriesGroupedByPhase, externalProjectBitacora, toExternalPhaseRoadmap } from './external-project-presentation.adapter';

const project = {
  id: 'project-1',
  startDate: '2026-11-04', endDate: '2027-05-30',
  modules: [{
    id: 'module-1', name: 'Diseño y Arquitectura', currentStage: 'development',
    timelineSegments: [{
      id: 'segment-1', name: 'Diseño de interfaces', teamName: 'UX',
      startDate: '2026-11-04', endDate: '2026-11-19', closedAt: null,
    }],
    deliveries: [{
      id: 'delivery-1', name: 'Hito cierre', teamName: 'UX',
      status: 'approved', estimatedDate: '2026-11-19', createdAt: '2026-11-09T13:00:00.000Z',
    }],
  }],
  observations: [
    {
      id: 'obs-1', type: 'cambio_proyecto',
      title: 'Entrega de hito cierre', message: 'Entrega registrada',
      date: '2026-11-10', createdAt: '2026-11-10T09:31:00.000Z',
      authorName: 'Eduardo Aranda', moduleId: 'module-1', moduleName: 'Diseño y Arquitectura',
      deliveryId: 'delivery-1', taskId: null, status: 'activo',
    },
    {
      id: 'obs-2', type: 'cambio_proyecto',
      title: 'Tarea Diseño de interfaz aprobada', message: 'Aprobación de tarea',
      date: '2026-11-09', createdAt: '2026-11-09T11:00:00.000Z',
      authorName: 'Mangel Tort', moduleId: 'module-1', moduleName: 'Diseño y Arquitectura',
      deliveryId: null, taskId: 'task-1', status: 'activo',
    },
  ],
} as unknown as PortalProjectDetail;

describe('Presentación externa — datos reales del proyecto', () => {
  it('reutiliza Gantt nativo con barras de progreso por equipo y entregas', () => {
    const result = toExternalPhaseRoadmap(project);
    expect(result.phases).toHaveLength(1);
    expect(result.phases[0]?.tasks).toEqual([{
      id: 'segment-1', role: 'ux', scope: 'diseno', label: 'Diseño de interfaces',
      startDate: '2026-11-04', endDate: '2026-11-19', closedAt: null,
    }]);
    expect(result.phases[0]?.deliveries[0]).toMatchObject({
      label: 'Hito cierre', date: '2026-11-19', state: 'delivered',
    });
    expect(result.teamSegmentCount).toBe(1);
    // El listado es la única sección de detalles; ninguna tarea interna
    // debe transferirse al Gantt externo.
    expect(result.phases[0]?.taskItems).toEqual([]);
  });

  it('asigna cada entrega a su fase por ID aunque existan fases con nombres iguales', () => {
    const sameNameDifferentPhase: PortalProjectDetail = {
      ...project,
      modules: [
        project.modules[0]!,
        {
          ...project.modules[0]!,
          id: 'module-2',
          deliveries: [{
            id: 'delivery-2', name: 'Otra entrega', teamName: 'QA',
            status: 'planned', estimatedDate: '2026-12-01',
            createdAt: '2026-11-11T10:00:00.000Z',
          }],
        },
      ],
    };
    const byPhase = deliveriesGroupedByPhase(sameNameDifferentPhase, new Set(['delivery-1']));
    expect(byPhase.size).toBe(2);
    expect(byPhase.get('module-1')).toMatchObject([
      { id: 'delivery-1', phase: 'Diseño y Arquitectura', received: true },
    ]);
    expect(byPhase.get('module-2')).toMatchObject([
      { id: 'delivery-2', phase: 'Diseño y Arquitectura', received: false },
    ]);
    expect(byPhase.get('module-1')).toHaveLength(1);
    expect(byPhase.get('module-2')).toHaveLength(1);
  });

  it('muestra los mismos registros de tarea y entrega que PMO y conserva recepción', () => {
    const receipts: PortalReceipt[] = [{
      deliveryId: 'delivery-1', receivedAt: '2026-11-11T11:00:00.000Z',
      receivedByName: 'Contacto cliente',
    }];
    const activities: PortalActivity[] = [{
      id: 'hour-1', date: '2026-11-06', createdAt: '2026-11-06T14:00:00.000Z',
      status: 'approved', userName: 'Leslie Galaz',
      category: 'Diseño', moduleName: 'Diseño y Arquitectura', hasBlocker: false,
    }];
    const result = externalProjectBitacora(project, receipts, activities);
    expect(result).toHaveLength(5);
    expect(result.map((row) => row.title)).toEqual([
      'Recepción de entregable: Hito cierre',
      'Entrega de hito cierre',
      'Hito cierre',
      'Tarea Diseño de interfaz aprobada',
      'Registro de actividad: Diseño',
    ]);
    expect(result.find((row) => row.title === 'Entrega de hito cierre')).toMatchObject({
      isDeliveryOrTask: true, registeredByName: 'Eduardo Aranda',
    });
    expect(result.find((row) => row.title === 'Tarea Diseño de interfaz aprobada')?.phaseTag)
      .toContain('Diseño y Arquitectura');
  });
});
