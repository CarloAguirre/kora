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
  const names = new Set<string>();
  for (const role of roles) {
    if (names.has(role.role) || !roleTeamIds[role.role]) {
      throw new Error('Todos los perfiles únicos deben vincularse a un equipo Kora.');
    }
    if (role.duration <= 0 || role.people <= 0 || role.hoursPerUnit <= 0 ||
        role.totalHours <= 0 || !Number.isFinite(role.totalHours)) {
      throw new Error('La propuesta contiene HH o duraciones inválidas.');
    }
    names.add(role.role);
  }
  if (Object.keys(roleTeamIds).some((role) => !names.has(role))) {
    throw new Error('El mapeo incluye perfiles que no pertenecen a la propuesta original.');
  }
  const edt = aiPoc.edt;
  const detailed = edt?.schemaVersion === 'kora.quotation.reference-edt.v2';
  const grouped = new Map<string, { hours: number; maxWeeks: number; collaborators: number }>();
  // Los colaboradores por equipo representan perfiles de capacidad sugeridos
  // (nunca responsables nominativos ni asignaciones al proyecto real).
  for (const role of roles) {
    const teamId = roleTeamIds[role.role]!;
    const weeks = Math.max(1, Math.ceil(role.duration / (role.unit === 'day' ? 5 : 1)));
    const current = grouped.get(teamId) ?? { hours: 0, maxWeeks: 1, collaborators: 0 };
    grouped.set(teamId, {
      hours: current.hours + role.totalHours,
      maxWeeks: Math.max(weeks, current.maxWeeks),
      collaborators: current.collaborators + role.people,
    });
  }
  // v2: agrupar por tramo cronológico, no por perfil. Los roles pueden
  // participar en varios módulos, tareas y tramos simultáneamente.
  const phases = detailed
    ? (edt.stages ?? []).map((stage) => {
        const byTeam = new Map<string, number>();
        for (const module of edt.modules) {
          for (const task of module.tasks) {
            if (task.stageCode !== stage.code) continue;
            for (const effort of task.roleEffort ?? []) {
              const teamId = roleTeamIds[effort.role];
              if (!teamId) throw new Error('La EDT contiene perfiles sin equipo asignado.');
              byTeam.set(teamId, Math.round(((byTeam.get(teamId) ?? 0) + effort.hours) * 100) / 100);
            }
          }
        }
        const stageTotal = [...byTeam.values()].reduce((sum, hours) => sum + hours, 0);
        if (Math.abs(stageTotal - stage.totalHours) > 0.011) {
          throw new Error('Las HH del tramo no concilian con las actividades de la EDT.');
        }
        return {
          name: stage.code + ' · ' + stage.name,
          startWeek: stage.startWeek,
          durationWeeks: stage.durationWeeks,
          teamHours: [...byTeam].map(([teamId, hours]) => ({ teamId, hours })),
        };
      })
    : roles.map((role) => ({
        name: role.role,
        startWeek: 1,
        durationWeeks: Math.max(1, Math.ceil(role.duration / (role.unit === 'day' ? 5 : 1))),
        teamHours: [{ teamId: roleTeamIds[role.role]!, hours: role.totalHours }],
      }));
  const lastStageWeek = detailed
    ? Math.max(1, ...(edt.stages ?? []).map((stage) => stage.startWeek + stage.durationWeeks - 1))
    : 1;
  const teams = [...grouped.entries()].map(([teamId, group]) => {
    const collaborators = Math.max(1, group.collaborators);
    if (collaborators > 100) throw new Error('Los perfiles superan la capacidad de 100 colaboradores por equipo.');
    const duration = Math.max(group.maxWeeks, detailed ? lastStageWeek : 1,
      Math.ceil(group.hours / (168 * collaborators)));
    if (duration > 520 || !Number.isFinite(duration)) {
      throw new Error('Las HH de un equipo no caben en el horizonte máximo de 520 semanas.');
    }
    return {
      teamId, collaborators,
      unit: 'week' as const, duration,
      hoursPerWeek: Math.min(168, Math.round(group.hours / duration / collaborators * 100) / 100),
      dedicationPercent: 100,
    };
  });
  const projection = quotationDraftDataSchema.parse({
    ...draft,
    mode: 'phases',
    teams,
    phases,
    aiPoc: quotationAiPocSnapshotSchema.parse({
      ...aiPoc, roleTeamIds,
    }),
    analysisProjectionStatus: 'synced',
  });
  const calculated = projection.phases.reduce((sum, phase) =>
    sum + phase.teamHours.reduce((acc, item) => acc + item.hours, 0), 0);
  if (Math.abs(calculated - aiPoc.proposal.totalHours) > 0.011) {
    throw new Error('La proyección de roles no conserva el total HH de Gemini.');
  }
  return projection;
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
  if (!previous.aiPoc) return;
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
  const mappingChanged = !sameJson(
    previous.aiPoc.roleTeamIds, next.aiPoc.roleTeamIds,
  );
  if (mappingChanged) {
    const projected = projectPocRolesToQuotationDraft(
      previous, next.aiPoc.roleTeamIds,
    );
    if (!sameJson(projected.teams, next.teams) ||
        !sameJson(projected.phases, next.phases) ||
        next.mode !== 'phases' || next.analysisProjectionStatus !== 'synced') {
      throw new Error('El mapeo debe aplicar la proyección original de roles/HH sin alteraciones.');
    }
  } else if (Object.keys(next.aiPoc.roleTeamIds).length > 0 &&
      next.analysisProjectionStatus === 'synced') {
    const projected = projectPocRolesToQuotationDraft(
      previous, next.aiPoc.roleTeamIds,
    );
    if (!sameJson(projected.teams, next.teams) ||
        !sameJson(projected.phases, next.phases) || next.mode !== 'phases') {
      throw new Error('Las HH cambiaron: marca la propuesta como modificada antes de guardarla.');
    }
  }
}
