/**
 * Política corporativa de estimación: asistencia de IA + esfuerzo bottom-up
 * + supervisión técnica semanal obligatoria.
 *
 * Reglas puras, sin dependencia del proveedor LLM ni de un proyecto concreto.
 */
export const ESTIMATION_METHODOLOGY_VERSION = '2026-11-06.ai-e2e.v1';
export const TECH_LEAD_HOURS_PER_WEEK = 5;
export const WEEKLY_HOURS_PER_PERSON = 40;

export const ESTIMATION_ANALYSIS_GUIDANCE = [
  'Identifica alcance explícito, exclusiones, actores, flujos, datos, reglas, interfaces e integraciones; separa hechos, derivaciones y supuestos.',
  'Una maqueta simula comportamientos: no conviertas sus datos de ejemplo en requisitos confirmados.',
  'Prioriza preguntas que mueven significativamente las HH o la arquitectura, y no supongas a cargo propio integraciones que hará otro proveedor.',
  'Evita contar pantallas o documentos como indicador suficiente de esfuerzo.',
].join('\n');

export const ESTIMATION_TEAM_GUIDANCE = [
  'Toda estimación considera agentes y asistentes de IA para análisis, Figma, frontend, backend, ORM, tests y documentación; no apliques descuentos dobles ni inventes un rol IA por el mero uso de herramientas.',
  'Prefiere features end-to-end con un Fullstack responsable de UI/API/datos/pruebas; no asignes FE y BE por separado salvo justificación explícita.',
  'Dimensiona UX y QA según colaboración e iteración real durante el proyecto; no los limites automáticamente al inicio y final.',
  'Incluye un Líder Técnico o Tech Lead de supervisión y control con exactamente 5 HH por semana del horizonte estimado. El servidor verificará la regla; arquitectura hands-on debe estimarse aparte.',
  'Respeta qué roles aporta el cliente y cuáles corresponden al proveedor. No inventes teamId ni integraciones ajenas al alcance.',
].join('\n');

export const ESTIMATION_EDT_GUIDANCE = [
  'Trabaja desde requisitos y flujos verificables: [CONFIRMADO] fuente documental; [DERIVADO] necesidad técnica mínima enlazada; [SUPUESTO] no confirmado; [EXCLUIDO] sin HH del proveedor.',
  'Produce etapas de avance reconocibles, módulos funcionales y tareas con entregables comprobables y lenguaje natural; tramos pueden solaparse entre equipos.',
  'Estima bottom-up la implementación mínima suficiente: evita duplicar CRUD, DTO, modelo, frontend y backend si corresponden al mismo feature end-to-end.',
  'Considera IA aplicada a todos los procesos, reutilización de componentes, nodos Figma, ORM/migraciones y pruebas asistidas, sin aplicar factores porcentuales arbitrarios.',
  'Una tarea de integración externa solo recibe HH propias para adaptar o entregar un contrato expresamente requerido. No presupuestes el trabajo del tercero.',
  'Para cada actividad justifica complejidad a partir de reglas de negocio, estados, permisos, datos, integraciones, errores y criterios de terminado; no inventes tareas de relleno.',
  'Las HH deben ser factibles para el calendario, las personas y el paralelismo real; distingue esfuerzo en HH, duración y capacidad.',
  'NO incluyas en activities ni roleHours la supervisión semanal ordinaria del Líder Técnico: el backend la añade una vez en un tramo propio con 5 HH por semana.',
  'Puedes asignar HH adicionales de Líder Técnico únicamente a arquitectura o implementación hands-on específica, separada de la supervisión.',
  'Devuelve como máximo 19 módulos, 19 tramos y 119 actividades generadas por IA: el motor reserva un módulo, un tramo y una actividad para supervisión técnica.',
  'Si una fuente se desconoce o falta una definición de alto impacto, identifica el supuesto o la exclusión; no la reemplaces por una tarea inventada.',
].join('\n');

export function isTechLeadRole(role: string): boolean {
  const normalized = role.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, ' ').trim();
  return normalized === 'tl' || /(^| )(tech lead|technical lead|lider tecnico|lider tecnica|lider de desarrollo)( |$)/.test(normalized);
}

export function estimatedWeeksFromRoles(
  roles: readonly { duration: number; unit: string }[],
): number {
  return Math.max(1, ...roles.map((role) =>
    Math.ceil(role.unit === 'day' ? role.duration / 5 : role.duration)));
}

export function isCompatibleTechLeadTeam(teamName: string): boolean {
  const normalized = teamName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
  return /(lider|arquitect|desarroll|ingenier|tecnolog|software)/.test(normalized);
}

export interface FlatEdtRows {
  stages: Array<{ code: string; name: string; startWeek: number; durationWeeks: number }>;
  activities: Array<{
    wbs: string; stageCode: string; module: string; submodule: string;
    name: string; description: string; references: string; classification: string;
  }>;
  roleHours: Array<{ wbs: string; role: string; hours: number }>;
}

/**
 * Se aplica solo a salidas reales del modelo, antes del validador de la EDT.
 * No corrige silenciosamente un perfil inexistente: el proceso previo debe
 * resolverlo con un equipo válido o informar el error al usuario.
 */
export function addMandatoryTechLeadSupervision<T extends FlatEdtRows>(
  edt: T, leadRole: string,
): T {
  if (!edt.stages.length || !edt.activities.length) {
    throw new Error('La EDT no contiene tramos y actividades verificables.');
  }
  if (edt.stages.length >= 20 || edt.activities.length >= 120 ||
      edt.roleHours.length >= 240) {
    throw new Error('La EDT no dejó espacio reservado para la supervisión técnica semanal.');
  }
  const overlapping = edt.activities.find((activity) =>
    edt.roleHours.some((hours) => hours.wbs === activity.wbs &&
      hours.role === leadRole) &&
    /supervisi[oó]n|seguimiento semanal|control t[eé]cnico semanal/i
      .test(activity.name + ' ' + activity.description));
  if (overlapping) {
    throw new Error('Supervisión técnica duplicada en WBS ' + overlapping.wbs +
      ': la supervisión semanal la incorpora el servidor, no Gemini.');
  }
  const horizonWeeks = Math.max(...edt.stages.map((stage) =>
    stage.startWeek + stage.durationWeeks - 1));
  if (!Number.isInteger(horizonWeeks) || horizonWeeks < 1 || horizonWeeks > 520) {
    throw new Error('Horizonte semanal de la EDT fuera de rango.');
  }
  const stageCode = 'TL-GOV';
  const wbs = 'TL-GOV.01';
  if (edt.stages.some((stage) => stage.code === stageCode) ||
      edt.activities.some((activity) => activity.wbs === wbs)) {
    throw new Error('La EDT reserva TL-GOV para supervisión obligatoria; código duplicado.');
  }
  return {
    ...edt,
    stages: [...edt.stages, {
      code: stageCode,
      name: 'Supervisión y control técnico transversal',
      startWeek: 1,
      durationWeeks: horizonWeeks,
    }],
    activities: [...edt.activities, {
      wbs,
      stageCode,
      module: 'Gobierno técnico',
      submodule: 'Supervisión semanal',
      name: 'Supervisar avances, decisiones técnicas, calidad y riesgos cada semana',
      description: 'Asignación determinística: 5 HH por semana por un único Líder Técnico. ' +
        'No incluye trabajo de arquitectura o desarrollo hands-on. Política ' +
        ESTIMATION_METHODOLOGY_VERSION + '.',
      references: '',
      classification: 'derivado_tecnico',
    }],
    roleHours: [...edt.roleHours, {
      wbs, role: leadRole, hours: TECH_LEAD_HOURS_PER_WEEK * horizonWeeks,
    }],
  } as T;
}

export function validateStageCapacity(
  edt: FlatEdtRows,
  roles: readonly { role: string; people: number }[],
): void {
  const stages = new Map(edt.stages.map((stage) => [stage.code, stage]));
  const activities = new Map(edt.activities.map((task) => [task.wbs, task]));
  const peopleByRole = new Map(roles.map((role) => [role.role, role.people]));
  const totals = new Map<string, number>();
  const totalsByRole = new Map<string, number>();
  for (const row of edt.roleHours) {
    const task = activities.get(row.wbs);
    if (!task) continue; // El validador de relaciones existente informa la FK.
    const stage = stages.get(task.stageCode);
    if (!stage) continue;
    const key = stage.code + '\u0000' + row.role;
    totals.set(key, (totals.get(key) ?? 0) + row.hours);
    totalsByRole.set(row.role, (totalsByRole.get(row.role) ?? 0) + row.hours);
  }
  for (const [key, hours] of totals) {
    const [stageCode, role] = key.split('\u0000');
    const stage = stages.get(stageCode)!;
    const people = peopleByRole.get(role);
    if (!people) continue; // El validador de perfiles existente informa la FK.
    const physicalMaximum = WEEKLY_HOURS_PER_PERSON * stage.durationWeeks * people;
    if (hours > physicalMaximum + 0.001) {
      throw new Error('Tramo ' + stageCode + ': ' + role + ' acumula ' + hours +
        ' HH en ' + stage.durationWeeks + ' semana(s) con ' + people +
        ' persona(s), excediendo el máximo físico de ' + physicalMaximum +
        ' HH. Ajusta tramos, dotación o esfuerzo; no alteres HH para cuadrar.');
    }
  }
  // Además del control por tramo, comprueba el máximo global para evitar
  // sobrecargas ocultas en tramos paralelos dentro del mismo horizonte.
  const horizon = Math.max(1, ...edt.stages.map((stage) =>
    stage.startWeek + stage.durationWeeks - 1));
  for (const [role, hours] of totalsByRole) {
    const people = peopleByRole.get(role);
    if (!people) continue;
    const maximum = WEEKLY_HOURS_PER_PERSON * horizon * people;
    if (hours > maximum + 0.001) {
      throw new Error('La carga total de ' + role + ': ' + hours +
        ' HH supera la capacidad de ' + people + ' persona(s) en ' +
        horizon + ' semanas (' + maximum +
        ' HH). Revisa paralelismo y duración, no redistribuyas horas artificialmente.');
    }
  }
}
