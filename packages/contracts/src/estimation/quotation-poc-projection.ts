import { effectiveQuotationEdt } from './quotation-edt-adjustments';
import { quotationEdtAssignments } from './quotation-edt-task-planning';
import {
  quotationDraftDataSchema,
  quotationAiPocSnapshotSchema,
  type QuotationDraftData,
} from './quotation.contract';

/** Comparación de snapshots JSON compatible con navegador y Node. */
function sameJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) &&
      a.length === b.length && a.every((item, index) => sameJson(item, b[index]));
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const first = a as Record<string, unknown>;
  const second = b as Record<string, unknown>;
  const keysA = Object.keys(first).sort();
  const keysB = Object.keys(second).sort();
  return keysA.length === keysB.length &&
    keysA.every((key, index) => key === keysB[index] && sameJson(first[key], second[key]));
}

/** Las fases por rol se proyectan desde la propuesta ORIGINAL guardada,
 * nunca desde totales HH calculados por el navegador.
 * Varios roles pueden asignarse al mismo equipo; las HH se agregan por equipo.
 */
export function projectPocRolesToQuotationDraft(
  draft: QuotationDraftData,
  roleTeamIds: Readonly<Record<string, string>>,
): QuotationDraftData {
  const aiPoc = draft.aiPoc;
  if (!aiPoc) {
    throw new Error('El borrador no contiene una propuesta IA con procedencia documental coherente.');
  }
  // La propuesta, el snapshot y la EDT deben declarar el mismo origen.
  // Preservar el fixture KDM histórico sin confundirlo con Drive real.
  const isKdmDemo = aiPoc.source === 'kdm_demo' &&
    aiPoc.proposal.sourceMode === 'poc_simulated';
  const isRealDrive = aiPoc.source === 'drive' &&
    aiPoc.proposal.sourceMode === 'drive';
  if ((!isKdmDemo && !isRealDrive) ||
      (aiPoc.edt && aiPoc.edt.source !== aiPoc.source)) {
    throw new Error('El borrador no contiene una propuesta IA con procedencia documental coherente.');
  }
  const roles = aiPoc.proposal.roles;
  if (roles.length === 0 || roles.length > 100) {
    throw new Error('La propuesta no contiene una cantidad válida de perfiles.');
  }
  const roleNames = new Set<string>();
  for (const role of roles) {
    if (roleNames.has(role.role) || !roleTeamIds[role.role]) {
      throw new Error('Todos los perfiles únicos deben vincularse a un equipo Kora.');
    }
    if (role.duration <= 0 || role.people <= 0 || role.hoursPerUnit <= 0 ||
        role.totalHours <= 0 || !Number.isFinite(role.totalHours)) {
      throw new Error('La propuesta contiene HH o duraciones inválidas.');
    }
    roleNames.add(role.role);
  }
  if (Object.keys(roleTeamIds).some((role) => !roleNames.has(role))) {
    throw new Error('El mapeo incluye perfiles que no pertenecen a la propuesta original.');
  }
  // Para comparar y resolver asignaciones por tarea, utilizar el mapeo nuevo
  // en vez del snapshot previo (que puede estar todavía vacío).
  const mappedDraft: QuotationDraftData = {
    ...draft, aiPoc: { ...aiPoc, roleTeamIds: { ...roleTeamIds } },
  };
  const edt = effectiveQuotationEdt(mappedDraft);
  const assignments = edt ? quotationEdtAssignments(mappedDraft) : [];
  const detailed = edt?.schemaVersion === 'kora.quotation.reference-edt.v2';
  const commercialStages = draft.edtCommercialStages ?? [];
  const commercialTotal = Math.round((draft.edtCommercialTasks ?? [])
    .reduce((sum, item) => sum + item.hours, 0) * 100) / 100;
  const stageRows = [
    ...(edt?.stages ?? []),
    ...commercialStages.map((stage) => ({ ...stage, totalHours: 0 })),
  ];
  type Capacity = { hours: number; maxWeeks: number; collaborators: number };
  const grouped = new Map<string, Capacity>();
  for (const role of roles) {
    const id = roleTeamIds[role.role]!;
    const weeks = Math.max(1, Math.ceil(role.duration / (role.unit === 'day' ? 5 : 1)));
    const current = grouped.get(id) ?? { hours: 0, maxWeeks: 1, collaborators: 0 };
    grouped.set(id, {
      ...current,
      hours: current.hours + (edt ? 0 : role.totalHours),
      maxWeeks: Math.max(current.maxWeeks, weeks),
      collaborators: current.collaborators +
        (draft.edtRoleCollaborators?.find((row) => row.role === role.role)?.collaborators ??
          role.people),
    });
  }
  for (const assignment of assignments) {
    const teamId = assignment.teamId ?? roleTeamIds[assignment.role];
    if (!teamId) throw new Error('La EDT contiene perfiles sin equipo Kora.');
    const current = grouped.get(teamId) ?? { hours: 0, maxWeeks: 1, collaborators: 1 };
    grouped.set(teamId, {
      ...current,
      hours: Math.round((current.hours + assignment.hours) * 100) / 100,
    });
  }
  const phases = detailed && edt
    ? stageRows.map((stage) => {
        const byTeam = new Map<string, number>();
        for (const assignment of assignments) {
          if (assignment.stageCode !== stage.code) continue;
          const teamId = assignment.teamId ?? roleTeamIds[assignment.role];
          if (!teamId) throw new Error('La EDT contiene perfiles sin equipo asignado.');
          byTeam.set(teamId, Math.round(
            ((byTeam.get(teamId) ?? 0) + assignment.hours) * 100) / 100);
        }
        const sourceHours = assignments
          .filter((row) => row.stageCode === stage.code && !row.wbs.startsWith('KT-'))
          .reduce((sum, row) => sum + row.hours, 0);
        if (!stage.code.startsWith('KS-') &&
            Math.abs(sourceHours - stage.totalHours) > 0.011) {
          throw new Error('Las HH originales del tramo no concilian con la EDT.');
        }
        const edited = draft.edtStageSettings?.find((item) => item.stageCode === stage.code);
        return {
          name: stage.code + ' · ' + (edited?.name ?? stage.name),
          startWeek: edited?.startWeek ?? stage.startWeek,
          durationWeeks: edited?.durationWeeks ?? stage.durationWeeks,
          teamHours: [...byTeam].map(([teamId, hours]) => ({ teamId, hours })),
        };
      })
    : roles.map((role) => {
        const effort = assignments.filter((row) => row.role === role.role);
        const byTeam = new Map<string, number>();
        for (const row of effort) {
          const id = row.teamId ?? roleTeamIds[role.role]!;
          byTeam.set(id, Math.round(((byTeam.get(id) ?? 0) + row.hours) * 100) / 100);
        }
        return {
          name: role.role,
          startWeek: 1,
          durationWeeks: Math.max(1, Math.ceil(role.duration / (role.unit === 'day' ? 5 : 1))),
          teamHours: edt
            ? [...byTeam].map(([teamId, hours]) => ({ teamId, hours }))
            : [{ teamId: roleTeamIds[role.role]!, hours: role.totalHours }],
        };
      });
  // En EDT v1 también se conservan las fases comerciales nuevas.
  if (!detailed && commercialStages.length) {
    for (const stage of commercialStages) {
      const grouped = new Map<string, number>();
      for (const assignment of assignments.filter((row) => row.stageCode === stage.code)) {
        const id = assignment.teamId ?? roleTeamIds[assignment.role];
        if (!id) throw new Error('La tarea comercial no tiene equipo Kora.');
        grouped.set(id, Math.round(((grouped.get(id) ?? 0) + assignment.hours) * 100) / 100);
      }
      phases.push({
        name: stage.code + ' · ' + stage.name,
        startWeek: stage.startWeek, durationWeeks: stage.durationWeeks,
        teamHours: [...grouped].map(([teamId, hours]) => ({ teamId, hours })),
      });
    }
  }
  // Cuando varios perfiles usan un mismo equipo, sus personas se COMPARTEN
  // si la capacidad lo permite. No sumamos personal preliminar de Gemini:
  // encontramos cuántas personas trabajan simultáneamente como máximo.
  const peakCentsByTeam = new Map<string, Map<number, number>>();
  if (detailed) for (const phase of phases) {
    for (const row of phase.teamHours) {
      const weeks = peakCentsByTeam.get(row.teamId) ?? new Map<number, number>();
      const cents = Math.round(row.hours * 100);
      const base = Math.floor(cents / phase.durationWeeks);
      const remainder = cents % phase.durationWeeks;
      for (let i = 0; i < phase.durationWeeks; i++) {
        const week = phase.startWeek + i;
        weeks.set(week, (weeks.get(week) ?? 0) + base + (i < remainder ? 1 : 0));
      }
      peakCentsByTeam.set(row.teamId, weeks);
    }
  }
  const teams = [...grouped.entries()].map(([teamId, group]) => {
    const peak = Math.max(0, ...(peakCentsByTeam.get(teamId)?.values() ?? []));
    const optimizedPeople = peak ? Math.ceil(peak / (40 * 100)) : 1;
    // Conservamos asignaciones manuales explícitas de colaboradores
    // en remapeos posteriores (historial y revisiones del usuario).
    const manuallyStaffed = roles.some((role) =>
      roleTeamIds[role.role] === teamId &&
      draft.edtRoleCollaborators?.some((entry) => entry.role === role.role));
    const collaborators = detailed && !manuallyStaffed
      ? optimizedPeople : Math.max(1, group.collaborators);
    if (collaborators > 100) {
      throw new Error('La cantidad de colaboradores del equipo supera 100.');
    }
    // En EDT las semanas son actividad real del equipo, no la duración previa
    // sugerida por Gemini para todo el proyecto.
    const activeWeeks = detailed ? (peakCentsByTeam.get(teamId)?.size ?? 1) : group.maxWeeks;
    const duration = Math.max(activeWeeks,
      Math.ceil(group.hours / ((detailed ? 40 : 168) * collaborators)));
    if (duration > 520 || !Number.isFinite(duration)) {
      throw new Error('Las HH exceden el horizonte máximo de 520 semanas.');
    }
    return {
      teamId, collaborators,
      unit: 'week' as const, duration,
      hoursPerWeek: Math.min(168,
        Math.round(group.hours / duration / collaborators * 100) / 100),
      dedicationPercent: 100,
    };
  });
  const projection = quotationDraftDataSchema.parse({
    ...mappedDraft, mode: 'phases', teams, phases,
    aiPoc: quotationAiPocSnapshotSchema.parse(mappedDraft.aiPoc),
    analysisProjectionStatus: 'synced',
  });
  const calculated = projection.phases.reduce((sum, phase) =>
    sum + phase.teamHours.reduce((acc, item) => acc + item.hours, 0), 0);
  if (Math.abs(calculated -
      ((edt?.totalHours ?? aiPoc.proposal.totalHours) + commercialTotal)) > 0.011) {
    throw new Error('La proyección de roles no conserva el total HH de la EDT.');
  }
  return projection;
}


/**
 * Compatibilidad de borradores EDT: hoursPerWeek es solo una media derivada
 * de las HH de tareas. Nunca multiplica ni reduce las HH originales.
 * Se normaliza al modificar dotación, duración, distribución o antes de guardar.
 * El contrato legado admite hasta 168; el indicador visual de carga utiliza
 * las HH reales y advierte sobre excesos, incluso por encima de ese límite.
 */
export function synchronizeQuotationEdtTeamLoad(draft: QuotationDraftData): QuotationDraftData {
  if (!draft.aiPoc?.edt) return draft;
  const totals = new Map<string, number>();
  for (const assignment of quotationEdtAssignments(draft)) {
    if (assignment.teamKey.startsWith('profile:')) continue;
    totals.set(assignment.teamKey,
      (totals.get(assignment.teamKey) ?? 0) + assignment.hours);
  }
  return {
    ...draft,
    teams: draft.teams.map((team) => {
      const weeks = team.unit === 'day' ? team.duration / 5 : team.duration;
      const total = totals.get(team.teamId) ?? 0;
      const derived = weeks > 0 && team.collaborators > 0
        ? Math.round(total / weeks / team.collaborators * 100) / 100 : 0;
      return { ...team, hoursPerWeek: Math.min(168, derived) };
    }),
  };
}

/** Conserva la edición humana de colaboradores y semanas, pero nunca las HH
 * calculadas desde tareas. Las HH son siempre la única fuente comercial. */
export function reconcilePocCommercialDraft(draft: QuotationDraftData): QuotationDraftData {
  const mapping = draft.aiPoc?.roleTeamIds ?? {};
  const roles = draft.aiPoc?.proposal.roles ?? [];
  if (!roles.length || !roles.every((role) => mapping[role.role])) return draft;
  const projected = projectPocRolesToQuotationDraft(draft, mapping);
  const oldTeams = new Map(draft.teams.map((team) => [team.teamId, team]));
  const oldPhases = new Map(draft.phases.map((phase) =>
    [phase.name.split(' · ')[0], phase]));
  const merged = quotationDraftDataSchema.parse({
    ...projected,
    teams: projected.teams.map((team) => {
      const current = oldTeams.get(team.teamId);
      return current ? { ...team, collaborators: current.collaborators,
        unit: current.unit,
        duration: current.duration > 0 ? current.duration : team.duration,
        // EDT: la carga media depende de colaboradores y duración actuales.
        // El usuario sigue editando la dedicación/disponibilidad de forma libre.
        hoursPerWeek: draft.aiPoc?.edt ? team.hoursPerWeek :
          current.hoursPerWeek > 0 ? current.hoursPerWeek : team.hoursPerWeek,
        dedicationPercent: current.dedicationPercent } : team;
    }),
    phases: projected.phases.map((phase) => {
      const code = phase.name.split(' · ')[0];
      const old = oldPhases.get(code);
      if (draft.edtStageSettings?.some((stage) => stage.stageCode === code) ||
          draft.edtCommercialStages?.some((stage) => stage.code === code)) {
        return phase; // decisión más reciente del editor de etapas
      }
      return old ? { ...phase, name: old.name,
        startWeek: old.startWeek, durationWeeks: old.durationWeeks } : phase;
    }),
    analysisProjectionStatus: 'synced',
  });
  return synchronizeQuotationEdtTeamLoad(merged);
}

/** La igualdad comercial exige equipo y HH idénticos en cada tramo.
 * La dotación, duración y nombre sí son decisiones editables del usuario. */
function commercialProjectionMatches(
  expected: QuotationDraftData, actual: QuotationDraftData,
): boolean {
  if (actual.mode !== 'phases' ||
      actual.teams.length !== expected.teams.length ||
      actual.phases.length !== expected.phases.length) return false;
  const expectedIds = expected.teams.map((team) => team.teamId).sort();
  const actualIds = actual.teams.map((team) => team.teamId).sort();
  if (!sameJson(expectedIds, actualIds)) return false;
  return expected.phases.every((phase, index) => {
    const actualPhase = actual.phases[index];
    if (!actualPhase) return false;
    const phaseId = phase.name.split(' · ')[0];
    if (actualPhase.name.split(' · ')[0] !== phaseId) return false;
    if (actualPhase.startWeek + actualPhase.durationWeeks - 1 > 520) return false;
    const rows = (value: QuotationDraftData['phases'][number]) =>
      value.teamHours.map((item) =>
        [item.teamId, Math.round(item.hours * 100)]).sort((a, b) =>
          String(a[0]).localeCompare(String(b[0])));
    return sameJson(rows(phase), rows(actualPhase));
  });
}

/** Evita que la edición reemplace el documento/propuesta original por
 * un JSON fabricado en el navegador. Permite editar presupuesto si queda
 * expresamente marcado como no conciliado.
 */
export function validatePocDraftIntegrity(
  previous: QuotationDraftData,
  next: QuotationDraftData,
): void {
  if (!previous.aiPoc && next.aiPoc) {
    throw new Error('No se puede introducir un análisis IA ajeno al borrador.');
  }
  if (!previous.aiPoc) {
    quotationEdtAssignments(next); // no permitir metadatos IA sin una EDT real
    return;
  }
  if (!next.aiPoc ||
      !sameJson(previous.aiPoc.proposal, next.aiPoc.proposal) ||
      !sameJson(previous.aiPoc.answers, next.aiPoc.answers) ||
      !sameJson(previous.aiPoc.dynamicQuestions, next.aiPoc.dynamicQuestions) ||
      !sameJson(previous.aiPoc.confirmedUnderstanding, next.aiPoc.confirmedUnderstanding) ||
      !sameJson(previous.aiPoc.edt, next.aiPoc.edt) ||
      !sameJson(previous.sourceRefs, next.sourceRefs) ||
      !sameJson(previous.answers, next.answers) ||
      previous.aiPoc.source !== next.aiPoc.source) {
    throw new Error('La evidencia original de IA no puede borrarse ni reemplazarse.');
  }
  quotationEdtAssignments(next); // valida HH, equipo por tarea, fijas y colaboradores
  const mappingChanged = !sameJson(
    previous.aiPoc.roleTeamIds, next.aiPoc.roleTeamIds,
  );
  const selected = next.aiPoc.roleTeamIds;
  const mappingComplete = next.aiPoc.proposal.roles.every((role) => selected[role.role]);
  if (mappingChanged && !mappingComplete) {
    throw new Error('El mapeo nuevo debe incluir todos los perfiles originales.');
  }
  if (mappingComplete && next.analysisProjectionStatus === 'synced') {
    const projected = projectPocRolesToQuotationDraft(next, selected);
    if (!commercialProjectionMatches(projected, next)) {
      throw new Error('Las HH cambiaron: la proyección por fase y equipo no concilia con las tareas WBS. ' +
        'Redistribuye desde las tareas antes de guardar.');
    }
  } else if (mappingChanged) {
    throw new Error('El mapeo debe generar fases comerciales conciliadas.');
  }
}
