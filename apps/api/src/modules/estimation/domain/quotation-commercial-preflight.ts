import type {
  QuotationCommercialPreflight,
  QuotationEligibilityProject,
  QuotationOperationalSnapshot,
  QuotationTeamCatalogEntry,
  QuotationVersion,
} from '@kora/contracts';
import { isQuotationDraftEligibleProject } from '@kora/contracts';
import { calculateQuotation } from './quotation-math';

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Preflight previo a un posible envío. No cambia estados, no aprueba IA,
 * no interpreta impuestos sin D06 y NO proporciona permiso para enviar.
 */
export function buildQuotationCommercialPreflight(
  version: QuotationVersion,
  project: QuotationEligibilityProject,
  operational: QuotationOperationalSnapshot,
  catalog: readonly QuotationTeamCatalogEntry[],
  calculatedAt: string,
): QuotationCommercialPreflight {
  const findings: QuotationCommercialPreflight['findings'] = [];
  const add = (
    code: string,
    section: QuotationCommercialPreflight['findings'][number]['section'],
    severity: 'blocker' | 'warning',
    message: string,
  ) => { findings.push({ code, section, severity, message }); };
  const draft = version.draft;
  const totals = calculateQuotation(draft, version.hourlyRate, version.tax);
  const paymentPercent = round(draft.paymentPlan.reduce((sum, row) => sum + row.percent, 0));

  if (version.status !== 'draft') add('VERSION_NOT_DRAFT', 'version', 'blocker',
    'La validación para un futuro envío solo admite versiones en borrador.');
  if (!isQuotationDraftEligibleProject(project)) add('PROJECT_INELIGIBLE', 'project', 'blocker',
    'El proyecto no admite nuevas gestiones comerciales de borrador en su etapa y estado actual.');
  if (!version.name.trim()) add('NAME_EMPTY', 'version', 'blocker',
    'La versión debe tener un nombre descriptivo.');

  const ids = draft.teams.map((team) => team.teamId);
  const catalogById = new Map(catalog.map((row) => [row.teamId, row]));
  if (ids.length === 0) add('NO_TEAMS', 'teams', 'blocker',
    'Asigna al menos un equipo al presupuesto.');
  if (new Set(ids).size !== ids.length) add('TEAM_DUPLICATED', 'teams', 'blocker',
    'Hay equipos repetidos en la cotización.');
  for (const team of draft.teams) {
    const found = catalogById.get(team.teamId);
    if (!found || !found.isActive) add('TEAM_UNAVAILABLE', 'teams', 'blocker',
      'El equipo ' + (found?.name ?? team.teamId) + ' no existe, fue eliminado o está inactivo.');
    if (team.collaborators <= 0 || team.hoursPerWeek <= 0 || team.dedicationPercent <= 0 ||
        team.duration <= 0) add('TEAM_ALLOCATION_ZERO', 'hours', 'blocker',
      'El equipo ' + (found?.name ?? team.teamId) + ' no tiene una dedicación y duración válidas.');
  }

  if (draft.mode === 'phases') {
    if (draft.phases.length === 0) add('NO_PHASES', 'scope', 'blocker',
      'El modo por fases requiere al menos una fase.');
    const phaseNames = new Set<string>();
    const hoursByTeam = new Map<string, number>();
    for (const phase of draft.phases) {
      const name = phase.name.trim().toLocaleLowerCase('es-CL');
      if (phaseNames.has(name)) add('DUPLICATE_PHASE_NAME', 'scope', 'warning',
        'El nombre de la fase "' + phase.name + '" se repite.');
      phaseNames.add(name);
      if (phase.teamHours.length === 0 || !phase.teamHours.some((row) => row.hours > 0)) {
        add('PHASE_WITHOUT_HOURS', 'hours', 'blocker',
          'La fase "' + phase.name + '" no tiene HH positivas asignadas.');
      }
      const assigned = new Set<string>();
      for (const row of phase.teamHours) {
        if (!ids.includes(row.teamId)) add('PHASE_UNKNOWN_TEAM', 'teams', 'blocker',
          'La fase "' + phase.name + '" utiliza un equipo que no figura en la cotización.');
        if (assigned.has(row.teamId)) add('PHASE_DUPLICATE_TEAM', 'teams', 'blocker',
          'La fase "' + phase.name + '" repite un equipo.');
        assigned.add(row.teamId);
        hoursByTeam.set(row.teamId, (hoursByTeam.get(row.teamId) ?? 0) + row.hours);
      }
      if (phase.startWeek + phase.durationWeeks - 1 > 520) add('PHASE_OUT_OF_RANGE', 'scope', 'blocker',
        'La fase "' + phase.name + '" excede el horizonte máximo de 520 semanas.');
    }
    for (const team of draft.teams) {
      const assignedHours = round(hoursByTeam.get(team.teamId) ?? 0);
      if (assignedHours <= 0) add('TEAM_WITHOUT_PHASE_HOURS', 'hours', 'warning',
        'Un equipo cotizado no tiene HH asignadas en las fases.');
      const capacity = team.collaborators * (team.unit === 'day' ? team.duration / 5 : team.duration)
        * team.hoursPerWeek * team.dedicationPercent / 100;
      if (assignedHours > round(capacity) + 0.01) add('PHASE_HOURS_ABOVE_REFERENCE', 'hours', 'warning',
        'Las HH por fases exceden la capacidad referencial de un equipo; revisa la distribución temporal.');
    }
  } else if (draft.phases.length > 0) {
    add('UNUSED_PHASES', 'scope', 'warning',
      'Hay fases cargadas, pero el modo por equipos no las utiliza para calcular las HH.');
  }

  if (totals.totalHours <= 0) add('ZERO_HOURS', 'hours', 'blocker',
    'La cotización debe contener HH positivas.');
  if (Math.abs(totals.totalHours - version.totalHours) > 0.011) {
    add('STORED_HOURS_MISMATCH', 'hours', 'blocker',
      'Las HH guardadas difieren del cálculo actual. Vuelve a guardar el borrador.');
  }

  if (version.hourlyRate === null || version.hourlyRate <= 0) {
    add('RATE_REQUIRED', 'pricing', 'blocker', 'Debes establecer una tarifa por HH mayor que cero.');
  } else if (totals.netAmount === null || totals.totalAmount === null ||
             totals.netAmount <= 0 || totals.totalAmount <= 0) {
    add('AMOUNT_REQUIRED', 'pricing', 'blocker', 'Los importes comerciales deben ser positivos.');
  } else if (version.netAmount === null || version.totalAmount === null ||
             Math.abs(totals.netAmount - version.netAmount) > 0.00011 ||
             Math.abs(totals.totalAmount - version.totalAmount) > 0.00011) {
    add('STORED_AMOUNT_MISMATCH', 'pricing', 'blocker',
      'Los importes guardados difieren del cálculo; vuelve a guardar el borrador.');
  }
  if (draft.costs.some((cost) => cost.recurrence !== 'once')) {
    add('RECURRING_COSTS_EXCLUDED', 'pricing', 'warning',
      'Los costos mensuales o anuales no están incluidos en el total actual. Definir su tratamiento en D06.');
  }
  add('TAX_POLICY_PENDING', 'policy', 'warning',
    'La moneda, los impuestos, el redondeo y la base neta/bruta requieren la regla comercial D06.');

  if (draft.paymentPlan.length === 0 || Math.abs(paymentPercent - 100) > 0.001) {
    add('PAYMENT_PLAN_NOT_100', 'payments', 'blocker',
      'El plan de pagos debe existir y sumar exactamente 100 %.');
  }
  for (const payment of draft.paymentPlan) {
    if (payment.percent <= 0) add('PAYMENT_ZERO', 'payments', 'blocker',
      'El hito de pago "' + payment.name + '" debe tener porcentaje positivo.');
    if (payment.trigger === 'date' && !payment.triggerDate) {
      add('PAYMENT_DATE_MISSING', 'payments', 'blocker',
        'El hito de pago "' + payment.name + '" requiere fecha.');
    }
    if (payment.trigger === 'phase' && (
      !payment.triggerPhase ||
      draft.mode !== 'phases' ||
      !draft.phases.some((phase) => phase.name === payment.triggerPhase)
    )) {
      add('PAYMENT_PHASE_INVALID', 'payments', 'blocker',
        'El hito "' + payment.name + '" debe asociarse a una fase existente del modo por fases.');
    }
  }

  if (version.origin === 'ai') {
    if (!draft.analysis && !draft.aiPoc) add('AI_EVIDENCE_MISSING', 'ai', 'blocker',
      'La versión IA no conserva un artefacto de análisis verificable.');
    if (draft.aiPoc) {
      if (draft.aiPoc.dynamicQuestions.some((q) => q.kind !== 'dynamic')) {
        add('AI_QUESTIONS_INVALID', 'ai', 'blocker',
          'El expediente IA contiene preguntas que no corresponden al análisis dinámico.');
      }
      add('AI_POC_DEMO_NOT_COMMERCIAL', 'ai', 'blocker',
        'La propuesta de roles proviene de Gemini con el PDF KDM de prueba; no tiene EDT ni documentación del proyecto real.');
      if (Object.keys(draft.aiPoc.roleTeamIds).length !== draft.aiPoc.proposal.roles.length) {
        add('AI_ROLE_MAPPING_PENDING', 'ai', 'blocker',
          'Debes mapear todos los perfiles propuestos a equipos activos de Kora.');
      }
    }
    if (version.aiReviewStatus !== 'accepted') add('AI_REVIEW_REQUIRED', 'ai', 'blocker',
      'La propuesta IA sigue pendiente de aceptación por una persona autorizada.');
  }
  if (draft.analysis?.provenance.mode === 'simulated_fixture') add('SIMULATED_ANALYSIS', 'ai', 'blocker',
    'El análisis proviene de un fixture de demostración: no puede utilizarse para envío real.');
  if (draft.analysisProjectionStatus === 'modified') add('ANALYSIS_NOT_RECONCILED', 'ai', 'blocker',
    'Se editaron HH o condiciones después del EDT de origen; requiere conciliación.');

  if (operational.status === 'active' || operational.usedHours > 0 ||
      operational.paymentMilestones.some((row) => row.status === 'invoiced' || row.status === 'paid')) {
    add('HISTORICAL_EXECUTION', 'project', 'warning',
      'El proyecto ya registra ejecución o facturación. No asumir que esta cotización reemplaza el contrato actual: revisar D05.');
  }
  const blockerCount = findings.filter((row) => row.severity === 'blocker').length;
  return {
    projectId: operational.projectId,
    versionId: version.id,
    versionNumber: version.versionNumber,
    revision: version.revision,
    calculatedAt,
    sendEnabled: false,
    contentChecksPassed: blockerCount === 0,
    blockerCount,
    warningCount: findings.length - blockerCount,
    summary: {
      mode: draft.mode,
      teamCount: draft.teams.length,
      phaseCount: draft.phases.length,
      totalHours: totals.totalHours,
      paymentPercent,
      netAmount: totals.netAmount,
      totalAmount: totals.totalAmount,
    },
    findings,
    pendingDecisionIds: ['D02', 'D05', 'D06'],
  };
}
