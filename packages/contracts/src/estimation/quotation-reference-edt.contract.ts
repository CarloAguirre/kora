import { z } from 'zod';
import { uuidSchema } from '../common/primitives';

/**
 * EDT comercial de referencia. v1 conserva íntegros los borradores KDM previos.
 * v2 guarda las HH propuestas por Gemini POR ACTIVIDAD Y PERFIL; Kora
 * solamente consolida y reconcilia las sumas.
 * Las semanas son relativas, no fechas ni asignaciones a colaboradores reales.
 */
export const quotationReferenceRoleEffortSchema = z.object({
  role: z.string().trim().min(1).max(120),
  hours: z.number().positive().max(1000000),
  /** Instrucción ejecutable propia del perfil. Opcional en EDT históricas. */
  taskName: z.string().trim().min(1).max(300).optional(),
  taskDescription: z.string().trim().min(1).optional(),
});

export const quotationReferenceStageSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(300),
  startWeek: z.number().int().min(1).max(520),
  durationWeeks: z.number().int().min(1).max(520),
  totalHours: z.number().positive().max(1000000),
});

export const quotationReferenceTaskSchema = z.object({
  wbs: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(300),
  description: z.string().trim().default(''),
  /** Perfil predominante. Mantiene consumidores v1 (traspaso y conciliación). */
  role: z.string().trim().min(1).max(120),
  /** Suma de roleEffort en v2; valor persistido sin prorrateos de IA. */
  hours: z.number().positive().max(1000000),
  stageCode: z.string().trim().min(1).max(40).optional(),
  submodule: z.string().trim().max(300).optional(),
  /** Citas y coordenadas del documento de origen, sin truncamiento de texto.
   * El tamaño de respuesta del proveedor IA está limitado globalmente.
   * El máximo de entradas se mantiene para proteger la estructura de la EDT.
   */
  referenceIds: z.array(z.string().trim().min(1)).max(30).optional(),
  classification: z.string().trim().max(40).optional(),
  roleEffort: z.array(quotationReferenceRoleEffortSchema).min(1).max(12).optional(),
});

export const quotationReferenceModuleSchema = z.object({
  name: z.string().trim().min(1).max(300),
  tasks: z.array(quotationReferenceTaskSchema).min(1).max(80),
  totalHours: z.number().positive().max(1000000),
});

export const quotationReferenceEdtSchema = z.object({
  schemaVersion: z.enum([
    'kora.quotation.reference-edt.v1',
    'kora.quotation.reference-edt.v2',
  ]),
  source: z.enum(['kdm_demo', 'drive']),
  provider: z.enum(['gemini', 'openai']),
  modules: z.array(quotationReferenceModuleSchema).min(1).max(30),
  /** Horas base, sin reserva técnica. */
  totalHours: z.number().positive().max(1000000),
  stages: z.array(quotationReferenceStageSchema).max(30).optional(),
  reservePercent: z.number().min(0).max(100).optional(),
  reserveHours: z.number().nonnegative().optional(),
  totalWithReserve: z.number().positive().optional(),
}).superRefine((edt, ctx) => {
  if (edt.schemaVersion !== 'kora.quotation.reference-edt.v2') return;
  const rounding = (n: number) => Math.round(n * 100) / 100;
  const stages = edt.stages ?? [];
  const codes = new Set(stages.map((stage) => stage.code));
  if (stages.length === 0 || codes.size !== stages.length) {
    ctx.addIssue({ code: 'custom', message: 'La EDT v2 requiere tramos únicos y completos.' });
  }
  const wbs = new Set<string>();
  const hoursByStage = new Map<string, number>();
  for (const module of edt.modules) {
    let sum = 0;
    for (const task of module.tasks) {
      if (wbs.has(task.wbs)) {
        ctx.addIssue({ code: 'custom', message: 'El WBS debe ser único en la EDT.' });
      }
      wbs.add(task.wbs);
      if (!task.stageCode || !codes.has(task.stageCode)) {
        ctx.addIssue({ code: 'custom', message: 'Cada actividad debe referir a un tramo existente.' });
      }
      const effort = task.roleEffort ?? [];
      if (!effort.length || new Set(effort.map((item) => item.role)).size !== effort.length ||
          !effort.some((item) => item.role === task.role) ||
          Math.abs(rounding(effort.reduce((total, item) => total + item.hours, 0)) - task.hours) > 0.011) {
        ctx.addIssue({ code: 'custom', message: 'Las HH de actividad deben cuadrar con sus perfiles.' });
      }
      sum += task.hours;
      if (task.stageCode) {
        hoursByStage.set(task.stageCode, (hoursByStage.get(task.stageCode) ?? 0) + task.hours);
      }
    }
    if (Math.abs(rounding(sum) - module.totalHours) > 0.011) {
      ctx.addIssue({ code: 'custom', message: 'Las HH de módulo no concilian con sus actividades.' });
    }
  }
  for (const stage of stages) {
    if (Math.abs(rounding(hoursByStage.get(stage.code) ?? 0) - stage.totalHours) > 0.011) {
      ctx.addIssue({ code: 'custom', message: 'Las HH por tramo no concilian.' });
    }
  }
  if (Math.abs(rounding(edt.modules.reduce((sum, module) => sum + module.totalHours, 0)) - edt.totalHours) > 0.011) {
    ctx.addIssue({ code: 'custom', message: 'Las HH base deben coincidir con los módulos.' });
  }
  if (edt.reservePercent === undefined || edt.reserveHours === undefined ||
      edt.totalWithReserve === undefined ||
      Math.abs(rounding(edt.totalHours * edt.reservePercent / 100) - edt.reserveHours) > 0.011 ||
      Math.abs(rounding(edt.totalHours + edt.reserveHours) - edt.totalWithReserve) > 0.011) {
    ctx.addIssue({ code: 'custom', message: 'La reserva debe conservarse separada de las HH base.' });
  }
});
export type QuotationReferenceEdt = z.infer<typeof quotationReferenceEdtSchema>;

export const applyQuotationPlanningSchema = z.object({
  revision: z.number().int().positive(),
  confirmation: z.literal('APLICAR_PLANIFICACION_KDM_DEMO'),
});
export type ApplyQuotationPlanningInput = z.infer<typeof applyQuotationPlanningSchema>;

export const appliedQuotationPlanningSchema = z.object({
  projectId: uuidSchema,
  versionId: uuidSchema,
  versionNumber: z.number().int().positive(),
  revision: z.number().int().positive(),
  appliedAt: z.string().datetime(),
  appliedByUserId: uuidSchema.nullable(),
  source: z.enum(['kdm_demo', 'drive', 'manual', 'copy']),
  status: z.enum(['accepted_for_planning_only', 'transferred']),
  commercialApproval: z.boolean(),
  totalHours: z.number().positive(),
  modules: z.array(z.object({
    moduleId: uuidSchema,
    name: z.string(),
    totalHours: z.number().positive(),
    tasks: z.array(quotationReferenceTaskSchema.extend({ teamId: uuidSchema.optional() })),
    /** Referencia comercial sin fechas concretas; no crea tramos de Forecast. */
    relativeTeamBlocks: z.array(z.object({
      teamId: uuidSchema, hours: z.number().nonnegative(),
      startWeek: z.number().int().positive(),
      durationWeeks: z.number().int().positive(),
    })).optional(),
  })),
  /** Referencias cuyo módulo de ejecución no es inequívoco, para revisión humana. */
  unassignedTasks: z.array(quotationReferenceTaskSchema).optional(),
});
export type AppliedQuotationPlanning = z.infer<typeof appliedQuotationPlanningSchema>;
