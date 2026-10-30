import type {
  QuotationOperationalSnapshot, QuotationTransferPreview, QuotationVersion,
} from '@kora/contracts';
import { calculateQuotation } from './quotation-math';

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Proyección informativa, NO un comando. No decide qué tablas actualizar y
 * nunca habilita un traspaso. Permite auditar proyectos legacy con HH facturadas.
 */
export function buildQuotationTransferPreview(
  version: QuotationVersion,
  project: QuotationOperationalSnapshot,
  calculatedAt: string,
): QuotationTransferPreview {
  const proposedByTeam = new Map<string, number>();
  if (version.draft.mode === 'phases') {
    for (const phase of version.draft.phases) {
      for (const row of phase.teamHours) {
        proposedByTeam.set(row.teamId, (proposedByTeam.get(row.teamId) ?? 0) + row.hours);
      }
    }
  } else {
    for (const team of version.draft.teams) {
      proposedByTeam.set(team.teamId,
        team.collaborators * (team.unit === 'day' ? team.duration / 5 : team.duration)
          * team.hoursPerWeek * team.dedicationPercent / 100);
    }
  }
  const existingByTeam = new Map(project.teams.map((row) => [row.teamId, row]));
  const teams = [...new Set([
    ...project.teams.map((row) => row.teamId), ...proposedByTeam.keys(),
  ])].map((teamId) => {
    const existing = existingByTeam.get(teamId);
    const current = existing?.assignedHours ?? null;
    const proposed = round(proposedByTeam.get(teamId) ?? 0);
    return {
      teamId, name: existing?.name ?? 'Equipo no asignado al proyecto',
      currentAssignedHours: current,
      proposedHours: proposed,
      delta: current === null ? null : round(proposed - current),
      existsInProject: Boolean(existing),
    };
  });

  const milestoneCounts = { pending: 0, toInvoice: 0, invoiced: 0, paid: 0 };
  for (const milestone of project.paymentMilestones) {
    if (milestone.status === 'to_invoice') milestoneCounts.toInvoice++;
    else if (milestone.status === 'pending') milestoneCounts.pending++;
    else if (milestone.status === 'invoiced') milestoneCounts.invoiced++;
    else milestoneCounts.paid++;
  }

  const findings: QuotationTransferPreview['findings'] = [
    { code: 'R3_NOT_IMPLEMENTED', severity: 'blocker',
      message: 'El traspaso a ejecución no está habilitado. Deben resolverse D04–D06 y validarse el flujo transaccional.' },
  ];
  if (version.status !== 'approved') findings.push({
    code: 'VERSION_NOT_APPROVED', severity: 'blocker',
    message: 'Solo una versión aprobada por el cliente podría transferirse en R3.',
  });
  if (version.origin === 'ai' && version.aiReviewStatus !== 'accepted') findings.push({
    code: 'AI_NOT_REVIEWED', severity: 'blocker',
    message: 'La propuesta de IA no tiene revisión aceptada.',
  });
  if (version.draft.analysis?.provenance.mode === 'simulated_fixture') findings.push({
    code: 'SIMULATION', severity: 'blocker',
    message: 'Este análisis es una simulación demostrativa; no se admite para ejecución real.',
  });
  if (version.draft.analysisProjectionStatus === 'modified') findings.push({
    code: 'ANALYSIS_MISMATCH', severity: 'blocker',
    message: 'El presupuesto fue editado después de generar el EDT; falta conciliar los cambios.',
  });
  if (version.hourlyRate === null || version.netAmount === null) findings.push({
    code: 'MISSING_RATE', severity: 'blocker',
    message: 'Falta confirmar la tarifa comercial y el monto neto.',
  });
  const paymentPercent = round(version.draft.paymentPlan.reduce((total, row) => total + row.percent, 0));
  if (paymentPercent !== 100) findings.push({
    code: 'PAYMENT_PLAN_INCOMPLETE', severity: 'blocker',
    message: 'El plan comercial no completa exactamente el 100% del contrato.',
  });
  if (project.status === 'finished' || project.status === 'cancelled') findings.push({
    code: 'PROJECT_CLOSED', severity: 'blocker',
    message: 'El proyecto está terminado o cancelado. No se permite reemplazar su ejecución.',
  });
  if (project.contractAmount !== null) findings.push({
    code: 'CONTRACT_AMOUNT_BASE_UNCONFIRMED', severity: 'review',
    message: 'Existe un monto de contrato operativo. No se conoce si es neto o total con impuestos; comparar montos está pendiente de D06.',
  });
  if (project.status === 'active' || project.status === 'on_hold') findings.push({
    code: 'PROJECT_IN_EXECUTION', severity: 'review',
    message: 'El estado operativo no es Borrador; revisar el alcance que ya está en ejecución.',
  });
  if (project.usedHours > 0) findings.push({
    code: 'HISTORICAL_HOURS', severity: 'review',
    message: 'El proyecto tiene HH consumidas; no pueden reemplazarse ni redistribuirse automáticamente.',
  });
  if (milestoneCounts.invoiced + milestoneCounts.paid > 0) findings.push({
    code: 'BILLED_MILESTONES', severity: 'review',
    message: 'Existen hitos facturados o pagados. Su historial debe preservarse.',
  });
  if (milestoneCounts.toInvoice > 0) findings.push({
    code: 'READY_TO_INVOICE', severity: 'review',
    message: 'Existen hitos pendientes de emisión. No reemplazar el plan de pago automáticamente.',
  });
  if (project.moduleCount + project.taskCount + project.segmentCount > 0) findings.push({
    code: 'EXISTING_ROADMAP', severity: 'review',
    message: 'Existen módulos, tareas o tramos de ejecución. No borrar ni prorratear.',
  });
  if (project.salesStage === 'approved') findings.push({
    code: 'LEGACY_APPROVED', severity: 'review',
    message: 'Proyecto con etapa comercial aprobada: verificar contrato y traspaso histórico.',
  });

  const totals = calculateQuotation(version.draft, version.hourlyRate, version.tax);
  // D06 sin resolver: `contractAmount` operativo no certifica si corresponde
  // al neto o al monto con impuestos. Ni siquiera con la misma moneda se puede
  // presentar una diferencia económica como verdadera.
  const comparable = false;
  return {
    projectId: project.projectId,
    versionId: version.id,
    versionNumber: version.versionNumber,
    revision: version.revision,
    calculatedAt,
    transferEnabled: false,
    proposed: {
      status: version.status, origin: version.origin,
      aiReviewStatus: version.aiReviewStatus,
      currency: version.currency, totalHours: totals.totalHours,
      netAmount: totals.netAmount, totalAmount: totals.totalAmount,
      hourlyRateDefined: version.hourlyRate !== null,
      paymentPercent,
    },
    operational: {
      salesStage: project.salesStage, status: project.status,
      soldHours: project.soldHours, usedHours: project.usedHours,
      startDate: project.startDate, contractAmount: project.contractAmount,
      contractCurrency: project.contractCurrency,
      moduleCount: project.moduleCount, taskCount: project.taskCount,
      segmentCount: project.segmentCount, milestoneCounts,
    },
    difference: {
      soldHoursDelta: round(totals.totalHours - project.soldHours),
      remainingComparedToUsed: round(totals.totalHours - project.usedHours),
      netAmountDelta: comparable && totals.netAmount !== null && project.contractAmount !== null
        ? round(totals.netAmount - project.contractAmount) : null,
    },
    teams,
    findings,
    pendingDecisionIds: ['D04', 'D05', 'D06'],
  };
}
