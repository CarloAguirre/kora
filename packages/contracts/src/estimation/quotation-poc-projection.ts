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
  if (!aiPoc || aiPoc.source !== 'kdm_demo') {
    throw new Error('El borrador no contiene una propuesta PoC de KDM.');
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
    ? (edt.stages ?? []).map((stage) => {
        const byTeam = new Map<string, number>();
        for (const assignment of assignments) {
          if (assignment.stageCode !== stage.code) continue;
          const teamId = assignment.teamId ?? roleTeamIds[assignment.role];
          if (!teamId) throw new Error('La EDT contiene perfiles sin equipo asignado.');
          byTeam.set(teamId, Math.round(
            ((byTeam.get(teamId) ?? 0) + assignment.hours) * 100) / 100);
        }
        const total = [...byTeam.values()].reduce((sum, hours) => sum + hours, 0);
        if (Math.abs(total - stage.totalHours) > 0.011) {
          throw new Error('Las HH del tramo no concilian con sus tareas.');
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
  const lastWeek = detailed && edt
    ? Math.max(1, ...(edt.stages ?? []).map((stage) =>
        stage.startWeek + stage.durationWeeks - 1))
    : 1;
  const teams = [...grouped.entries()].map(([teamId, group]) => {
    const collaborators = Math.max(1, group.collaborators);
    if (collaborators > 100) {
      throw new Error('La cantidad de colaboradores del equipo supera 100.');
    }
    const duration = Math.max(group.maxWeeks, detailed ? lastWeek : 1,
      Math.ceil(group.hours / (168 * collaborators)));
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
  if (Math.abs(calculated - (edt?.totalHours ?? aiPoc.proposal.totalHours)) > 0.011) {
    throw new Error('La proyección de roles no conserva el total HH de la EDT.');
  }
  return projection;
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
        unit: current.unit, duration: current.duration,
        hoursPerWeek: current.hoursPerWeek,
        dedicationPercent: current.dedicationPercent } : team;
    }),
    phases: projected.phases.map((phase) => {
      const code = phase.name.split(' · ')[0];
      const old = oldPhases.get(code);
      if (draft.edtStageSettings?.some((stage) => stage.stageCode === code)) {
        return phase; // decisión más reciente del editor de etapas
      }
      return old ? { ...phase, name: old.name,
        startWeek: old.startWeek, durationWeeks: old.durationWeeks } : phase;
    }),
    analysisProjectionStatus: 'synced',
  });
  return merged;
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
