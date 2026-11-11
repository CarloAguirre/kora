import type {
  ClientBitacoraEntry, PhaseRoadmapDeliveryState, PhaseRoadmapTaskScope,
  PhaseRoadmapRole, ProjectPhaseRoadmap,
} from '../types';
import type {
  PortalActivity, PortalObservation, PortalProjectDetail, PortalReceipt,
} from '../api/client-portal.api';
import { roleFromTeamName } from './project-detail.adapter';
import type { CommittedDelivery } from '../components/CommittedDeliveriesRoadmap';

const SCOPE: Readonly<Record<PhaseRoadmapRole, PhaseRoadmapTaskScope>> = {
  pmo: 'desarrollo', ux: 'diseno', qa: 'qa',
  dev: 'desarrollo', ia: 'desarrollo', rpa: 'desarrollo',
};
const dateOnly = (value: string) => value.slice(0, 10);
const isoToday = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')].join('-');
};
function dayShift(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}
function fullDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value :
    parsed.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}
function shortDate(value: string) {
  const iso = dateOnly(value);
  const [yyyy, mm, dd] = iso.split('-');
  return yyyy && mm && dd ? `${dd}-${mm}-${yyyy}` : value;
}

/**
 * Agrupa entregas por ID real de la fase. No usar posición ni nombre:
 * pueden existir fases con el mismo nombre o fases sin entregas.
 * La agrupación respeta la autorización del endpoint externo.
 */
export function deliveriesGroupedByPhase(
  project: Pick<PortalProjectDetail, 'modules'>,
  receivedIds: ReadonlySet<string>,
): Map<string, CommittedDelivery[]> {
  return new Map(project.modules.map((phase) => [
    phase.id,
    phase.deliveries.map((delivery) => ({
      id: delivery.id,
      name: delivery.name ?? (delivery.teamName ? `Entrega ${delivery.teamName}` : 'Entrega'),
      phase: phase.name,
      team: delivery.teamName,
      estimatedDate: delivery.estimatedDate,
      status: delivery.status,
      received: receivedIds.has(delivery.id),
    })),
  ]));
}

/**
 * Recupera el gráfico temporal Nativo de Kora (PhaseRoadmap) utilizando solo
 * la geometría autorizada del portal; no recrea el Gantt con una librería
 * distinta ni transfiere HH, miembros ni notas operativas.
 */
export function toExternalPhaseRoadmap(project: PortalProjectDetail): ProjectPhaseRoadmap {
  const today = isoToday();
  const phases = project.modules.map((module, index) => {
    const tasks = module.timelineSegments.map((segment) => {
      const role = roleFromTeamName(segment.teamName);
      return {
        id: segment.id, role, scope: SCOPE[role], label: segment.name,
        startDate: segment.startDate, endDate: segment.endDate, closedAt: segment.closedAt,
      };
    });
    const hasStarted = module.timelineSegments.some((segment) => segment.startDate <= today);
    const deliveries = module.deliveries.map((delivery) => ({
      id: delivery.id,
      label: delivery.name ?? (delivery.teamName ? `Entrega ${delivery.teamName}` : 'Entrega'),
      date: delivery.estimatedDate,
      state: (delivery.status === 'approved' ? 'delivered' :
        delivery.estimatedDate < today ? 'delayed' : 'committed') as PhaseRoadmapDeliveryState,
    }));
    const delayed = deliveries.filter((item) => item.state === 'delayed').length;
    return {
      id: module.id,
      badge: `FASE ${index + 1}`,
      name: module.name,
      status: module.currentStage === 'closed' ? 'finished' as const
        : hasStarted ? 'in_progress' as const : 'upcoming' as const,
      alertLabel: delayed ? `${delayed} atraso${delayed > 1 ? 's' : ''}` : null,
      tasks,
      deliveries,
      taskItems: [], // Las tareas detalladas quedan en la vista interna.
      relatedBitacora: [], // Bitácora unificada de solo lectura debajo.
    };
  });
  const dates = [
    ...project.modules.flatMap((module) => [
      ...module.timelineSegments.flatMap((segment) => [segment.startDate, segment.endDate]),
      ...module.deliveries.map((delivery) => delivery.estimatedDate),
    ]),
    ...(project.startDate ? [project.startDate] : []),
    ...(project.endDate ? [project.endDate] : []),
  ].filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
  const first = dates[0] ?? today;
  const last = dates[dates.length - 1] ?? dayShift(first, 7);
  return {
    phaseCount: project.modules.length,
    teamSegmentCount: project.modules.reduce((sum, module) => sum + module.timelineSegments.length, 0),
    plannedDeliveryCount: project.modules.reduce((sum, module) => sum + module.deliveries.length, 0),
    rangeStartDate: dayShift(first, -7),
    rangeEndDate: dayShift(last, 7),
    phases,
  };
}

const OBS_STATUS = {
  abierto: ['Abierto', 'danger'],
  resuelto: ['Resuelto', 'success'],
  pendiente: ['Pendiente', 'warning'],
  cumplido: ['Completado', 'success'],
  activo: ['Iniciado', 'info'],
  rechazado: ['Rechazado', 'danger'],
} as const satisfies Record<string, readonly [string, ClientBitacoraEntry['statusTone']]>;
function observationKind(observation: PortalObservation): ClientBitacoraEntry['kind'] {
  if (observation.type === 'hito') return 'milestone';
  if (observation.type === 'incidente' || observation.type === 'atencion') return 'attention';
  if (observation.type === 'compromiso') return observation.status === 'cumplido' ? 'completed' : 'pending';
  return 'marked';
}

/**
 * Mismas fuentes de datos que PMO: observaciones automáticas/manuales,
 * entregas y registros de horas. Se muestran con el componente read-only
 * ProjectBitacora, sin acciones internas de aprobar/rechazar/editar.
 */
export function externalProjectBitacora(
  project: PortalProjectDetail,
  receipts: readonly PortalReceipt[],
  activities: readonly PortalActivity[],
): ClientBitacoraEntry[] {
  const moduleBadges = new Map(project.modules.map((module, index) => [module.id, `FASE ${index + 1}`]));
  const rows: Array<{ order: string; entry: ClientBitacoraEntry }> = [];
  const push = (order: string, entry: ClientBitacoraEntry) => rows.push({ order, entry });

  for (const obs of project.observations) {
    const status = OBS_STATUS[obs.status as keyof typeof OBS_STATUS] ?? (['Registrado', 'info'] as const);
    push(obs.createdAt, {
      id: `registro-${obs.id}`,
      kind: observationKind(obs),
      title: obs.title || obs.message.slice(0, 110),
      registeredByName: obs.authorName,
      registeredAt: `${shortDate(obs.date)}, ${fullDateTime(obs.createdAt).split(', ').slice(-1)[0]}`,
      phaseTag: obs.moduleId && obs.moduleName
        ? `${moduleBadges.get(obs.moduleId) ?? ''} - ${obs.moduleName}` : null,
      description: obs.message,
      statusLabel: status[0],
      statusTone: status[1],
      isIncident: obs.type === 'incidente' || obs.type === 'atencion',
      isDeliveryOrTask: Boolean(obs.deliveryId || obs.taskId),
      filterDate: dateOnly(obs.date),
    });
  }

  for (const module of project.modules) for (const delivery of module.deliveries) {
    push(delivery.createdAt, {
      id: `entrega-${delivery.id}`,
      kind: delivery.status === 'approved' ? 'completed' : 'pending',
      title: delivery.name ?? `Entrega de fase: ${module.name}`,
      registeredByName: delivery.teamName ?? 'Equipo del proyecto',
      registeredAt: fullDateTime(delivery.createdAt),
      phaseTag: `${moduleBadges.get(module.id) ?? ''} - ${module.name}`,
      description: `Entrega comprometida para el ${shortDate(delivery.estimatedDate)}.`,
      statusLabel: delivery.status === 'approved' ? 'Aprobada' : 'Planificada',
      statusTone: delivery.status === 'approved' ? 'success' : 'warning',
      isIncident: false,
      isDeliveryOrTask: true,
      filterDate: dateOnly(delivery.createdAt),
    });
  }

  for (const activity of activities) {
    const badge = activity.status === 'approved' ? ['Aprobada', 'success'] as const
      : activity.status === 'rejected' ? ['Rechazada', 'danger'] as const
        : ['Pendiente', 'warning'] as const;
    push(activity.createdAt, {
      id: `actividad-${activity.id}`,
      kind: activity.hasBlocker ? 'attention' : 'marked',
      title: activity.category ? `Registro de actividad: ${activity.category}` : 'Actividad del proyecto',
      registeredByName: activity.userName,
      registeredAt: `${shortDate(activity.date)}, ${fullDateTime(activity.createdAt).split(', ').slice(-1)[0]}`,
      phaseTag: activity.moduleName,
      description: activity.hasBlocker ? 'El equipo informó un bloqueo.' : 'Actividad registrada en el proyecto.',
      statusLabel: badge[0],
      statusTone: badge[1],
      isIncident: activity.hasBlocker,
      isDeliveryOrTask: false,
      filterDate: dateOnly(activity.date),
    });
  }

  for (const receipt of receipts) {
    const relatedModule = project.modules.find((module) =>
      module.deliveries.some((delivery) => delivery.id === receipt.deliveryId));
    const delivery = relatedModule?.deliveries.find((item) => item.id === receipt.deliveryId);
    push(receipt.receivedAt, {
      id: `recepcion-${receipt.deliveryId}`,
      kind: 'completed',
      title: `Recepción de entregable: ${delivery?.name ?? 'Entrega'}`,
      registeredByName: receipt.receivedByName,
      registeredAt: fullDateTime(receipt.receivedAt),
      phaseTag: relatedModule
        ? `${moduleBadges.get(relatedModule.id) ?? ''} - ${relatedModule.name}` : null,
      description: 'El contacto del cliente confirmó la recepción del entregable.',
      statusLabel: 'Recibida', statusTone: 'success',
      isIncident: false, isDeliveryOrTask: true,
      filterDate: dateOnly(receipt.receivedAt),
    });
  }

  return rows.sort((a, b) => b.order.localeCompare(a.order))
    .map(({ entry }) => entry);
}
