import { z } from 'zod';

/**
 * Artefacto independiente del formato DOCX/XLSX y de la proyección comercial
 * de Kora. Permite reconstruir ERS/EDT y justificar cada HH después de la
 * generación. Modo simulated_fixture es la PoC; model_generated será R4.
 */
const hoursByRoleSchema = z.record(z.string().min(1), z.number().finite().min(0));
const looseSourceSchema = z.object({ artifact: z.string() }).passthrough();
export const estimationAnalysisArtifactSchema = z.object({
  schemaVersion: z.literal('kora.estimation.analysis.v1'),
  provenance: z.object({
    mode: z.enum(['simulated_fixture', 'model_generated']),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    label: z.string().min(1).max(200),
    warning: z.string().max(2000),
    sourceFiles: z.array(z.object({
      id: z.string().min(1), name: z.string().min(1), kind: z.string(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })).min(1).max(100),
  }).passthrough(),
  project: z.object({ name: z.string().min(1), client: z.string(), objective: z.string() }).passthrough(),
  scope: z.object({
    included: z.array(z.string()).max(200),
    excluded: z.array(z.string()).max(200),
    validationStatus: z.string(),
  }).passthrough(),
  sourceRequirements: z.array(z.object({
    id: z.string().min(1), text: z.string(), origin: z.string(), acceptance: z.string(),
  }).passthrough()).max(500),
  userStories: z.array(z.object({
    id: z.string(), actor: z.string(), need: z.string(), acceptance: z.string(),
    requirementIds: z.array(z.string()),
  }).passthrough()).max(500),
  pendingDecisions: z.array(z.object({
    id: z.string(), decision: z.string(), impact: z.string(), owner: z.string(),
  }).passthrough()).max(500),
  roles: z.array(z.object({
    role: z.string().min(1), headcount: z.number().int().min(1),
    baseHours: z.number().min(0),
  }).passthrough()).min(1).max(100),
  modules: z.array(z.object({
    name: z.string(), activityCount: z.number().int().min(0),
    hoursByRole: hoursByRoleSchema, totalHours: z.number().min(0),
  }).passthrough()).max(100),
  tranches: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1),
    startWeek: z.number().int().min(1), durationWeeks: z.number().int().min(1),
    totalHours: z.number().min(0), hoursByRole: hoursByRoleSchema,
  }).passthrough()).min(1).max(100),
  activities: z.array(z.object({
    wbs: z.string().min(1), trancheId: z.string().min(1),
    module: z.string(), description: z.string().min(1),
    requirementIds: z.array(z.string()), sourceClassification: z.string(),
    responsibleRole: z.string(), hoursByRole: hoursByRoleSchema,
    totalHours: z.number().min(0),
    trace: looseSourceSchema.optional(),
  }).passthrough()).min(1).max(1000),
  dailyPlan: z.array(z.object({
    workingDay: z.number().int().min(1), trancheId: z.string(), role: z.string(),
    activityId: z.string(), description: z.string(), hours: z.number().min(0),
  }).passthrough()).max(5000),
  weeklyPlan: z.array(z.object({
    week: z.string(), hoursByRole: hoursByRoleSchema,
  }).passthrough()).max(520),
  milestones: z.array(z.object({
    trancheId: z.string(), name: z.string(), workingDay: z.number().int().min(1),
  }).passthrough()).max(500),
  assumptions: z.array(z.object({ key: z.string(), condition: z.string() }).passthrough()).max(200),
  summary: z.object({
    baseHours: z.number().finite().min(0), reservePercent: z.number().min(0).max(100),
    reserveHours: z.number().min(0), hoursWithReserve: z.number().min(0),
    durationWorkingDays: z.number().int().positive(),
    hoursByRole: hoursByRoleSchema,
  }).passthrough(),
  commercial: z.object({
    hourlyRate: z.number().nullable(), currency: z.string().nullable(),
    tax: z.string().nullable(), paymentPlan: z.array(z.unknown()),
  }).passthrough(),
  roleTeamMappings: z.object({
    status: z.string(), suggestions: z.record(z.string(), z.string().nullable()),
  }).passthrough(),
  renderBlueprints: z.object({
    ers: z.array(z.string()), edt: z.array(z.string()),
  }).passthrough(),
}).passthrough().superRefine((artifact, ctx) => {
  const approx = (a: number, b: number) => Math.abs(a - b) <= 0.011;
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const teamRoles = artifact.roles.map((row) => row.role);
  const roleSet = new Set(teamRoles);
  const trancheSet = new Set(artifact.tranches.map((row) => row.id));
  if (roleSet.size !== teamRoles.length || trancheSet.size !== artifact.tranches.length) {
    ctx.addIssue({ code: 'custom', message: 'Roles y tramos deben tener identificadores únicos.' });
  }
  const activityIds = new Set<string>();
  for (const activity of artifact.activities) {
    if (activityIds.has(activity.wbs) || !trancheSet.has(activity.trancheId)) {
      ctx.addIssue({ code: 'custom', message: 'WBS duplicado o tramo inexistente.', path: ['activities'] });
    }
    activityIds.add(activity.wbs);
    if (!approx(sum(Object.values(activity.hoursByRole)), activity.totalHours)) {
      ctx.addIssue({ code: 'custom', message: 'HH de actividad no coinciden con su desglose.', path: ['activities'] });
    }
    if (Object.keys(activity.hoursByRole).some((role) => !roleSet.has(role))) {
      ctx.addIssue({ code: 'custom', message: 'Actividad contiene un rol no declarado.', path: ['activities'] });
    }
  }
  if (!approx(sum(artifact.activities.map((a) => a.totalHours)), artifact.summary.baseHours)) {
    ctx.addIssue({ code: 'custom', message: 'HH base no concuerdan con EDT.', path: ['summary', 'baseHours'] });
  }
  for (const role of artifact.roles) {
    const taskHours = sum(artifact.activities.map((activity) => activity.hoursByRole[role.role] ?? 0));
    if (!approx(taskHours, role.baseHours) || !approx(taskHours, artifact.summary.hoursByRole[role.role] ?? -1)) {
      ctx.addIssue({ code: 'custom', message: 'HH por perfil no concuerdan con el EDT.', path: ['roles'] });
    }
  }
  for (const tranche of artifact.tranches) {
    const taskHours = sum(artifact.activities.filter((activity) => activity.trancheId === tranche.id)
      .map((activity) => activity.totalHours));
    if (!approx(taskHours, tranche.totalHours) ||
        !approx(sum(Object.values(tranche.hoursByRole)), tranche.totalHours)) {
      ctx.addIssue({ code: 'custom', message: 'HH de tramo no concuerdan con las actividades.', path: ['tranches'] });
    }
  }
  if (!approx(artifact.summary.reserveHours, artifact.summary.baseHours * artifact.summary.reservePercent / 100) ||
      !approx(artifact.summary.hoursWithReserve, artifact.summary.baseHours + artifact.summary.reserveHours)) {
    ctx.addIssue({ code: 'custom', message: 'Reserva técnica inconsistente.', path: ['summary'] });
  }
  if (artifact.dailyPlan.length > 0 &&
      !approx(sum(artifact.dailyPlan.map((row) => row.hours)), artifact.summary.baseHours)) {
    ctx.addIssue({ code: 'custom', message: 'Plan diario no concuerda con HH base.', path: ['dailyPlan'] });
  }
});
export type EstimationAnalysisArtifact = z.infer<typeof estimationAnalysisArtifactSchema>;
