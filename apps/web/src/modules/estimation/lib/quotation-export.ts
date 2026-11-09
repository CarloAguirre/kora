import * as XLSX from 'xlsx';
import { quotationEdtAssignments, type QuotationVersion } from '@kora/contracts';
import { quotationTeamWeeklyPlan } from '../components/quotation-team-weekly-plan';
import { patchFormattedQuotationTemplate } from './quotation-export-template';

/**
 * Exportación comercial de lectura. Nunca cambia la cotización, ejecuta Gemini,
 * aprueba la propuesta ni mueve HH al Roadmap operativo.
 *
 * PPTX: se edita el OOXML de la presentación corporativa ORIGINAL; no se
 * recrean sus imágenes, layouts, formas ni diapositivas. Para proyectos sin
 * RPA se conservan los mismos marcos gráficos con textos genéricos.
 */
export type QuotationExportContext = {
  version: QuotationVersion;
  project: { name: string; description?: string | null; client?: { companyName?: string | null } | null };
  teamNames: ReadonlyMap<string, string>;
};

type Cell = string | number | null | undefined;
const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const s = (input: unknown): string => {
  const value = typeof input === 'string' ? input.trim() : String(input ?? '');
  // Nunca permitir que nombres o contenido de fuentes se ejecuten como fórmulas.
  return /^[=+@\t\r]/.test(value) ? "'" + value : value;
};
const compact = (input: unknown, limit = 90) => {
  const text = s(input).replace(/\s+/g, ' ');
  return text.length > limit ? text.slice(0, limit - 1).trimEnd() + '…' : text;
};
const money = (value: number | null, currency: string) =>
  value === null ? 'Por definir' : fmt(value) + ' ' + currency;

export function quotationExportModel({ version, project, teamNames }: QuotationExportContext) {
  const draft = version.draft;
  const details = draft.aiPoc?.edt ? quotationEdtAssignments(draft) : [];
  const stages = draft.aiPoc?.edt?.stages ?? [];
  const overrides = new Map((draft.edtStageSettings ?? []).map((row) => [row.stageCode, row]));
  const commercialStages = draft.edtCommercialStages ?? [];
  const phases = stages.length
    ? [
        ...stages.map((row) => ({
          code: row.code, name: overrides.get(row.code)?.name ?? row.name,
          startWeek: overrides.get(row.code)?.startWeek ?? row.startWeek,
          durationWeeks: overrides.get(row.code)?.durationWeeks ?? row.durationWeeks,
        })),
        ...commercialStages,
      ]
    : draft.phases.map((row, index) => ({
        code: String(index + 1), name: row.name,
        startWeek: row.startWeek, durationWeeks: row.durationWeeks,
      }));
  const weeks = Math.max(0, ...phases.map((p) => p.startWeek + p.durationWeeks - 1));
  const team = (id: string | null) => id ? teamNames.get(id) ?? 'Equipo sin catálogo' : 'Sin equipo asignado';
  const client = project.client?.companyName?.trim() || 'Cliente no especificado';
  return {
    version, draft, details, phases, weeks, team, client, projectName: project.name,
    projectDescription: project.description ?? null,
    weekly: quotationTeamWeeklyPlan(draft),
    scope: draft.aiPoc?.confirmedUnderstanding ||
      draft.aiPoc?.proposal.summary || project.description ||
      'Objetivo pendiente de definición comercial.',
    status: version.status === 'approved' ? 'Aprobada' :
      version.status === 'sent' ? 'Enviada' : 'Borrador',
  };
}

const sheet = (book: XLSX.WorkBook, name: string, data: Cell[][], widths?: number[]) => {
  const rows = data.map((row) => row.map((v) => typeof v === 'string' ? s(v) : v ?? ''));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = (widths ?? rows[0]?.map(() => 22) ?? []).map((wch) => ({ wch }));
  ws['!autofilter'] = rows.length > 3 ? { ref: XLSX.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: rows.length - 1, c: (rows[1]?.length ?? 1) - 1 } }) } : undefined;
  XLSX.utils.book_append_sheet(book, ws, name);
  return ws;
};
const rows = (title: string, headings: string[], data: Cell[][]): Cell[][] =>
  [[title], headings, ...data];

/** Hojas condicionales: nunca copiar cifras, rangos fijos o ejemplos de Zurich. */
export function buildQuotationWorkbook(context: QuotationExportContext): XLSX.WorkBook {
  const model = quotationExportModel(context);
  const { version, draft, details, phases, weekly, team } = model;
  const book = XLSX.utils.book_new();
  const reserved = draft.aiPoc?.edt?.reserveHours ?? 0;
  sheet(book, 'Resumen', [
    ['KORA · COTIZACIÓN · REVISIÓN INTERNA'],
    ['Proyecto', model.projectName],
    ['Cliente', model.client],
    ['Versión', version.name],
    ['N° versión', version.versionNumber],
    ['Revisión', version.revision],
    ['Estado', model.status],
    ['Origen', version.origin],
    ['Última modificación', version.updatedAt.slice(0, 10)],
    ['HH vendidas', version.totalHours],
    ['Reserva IA referencial (fuera de HH vendidas)', reserved],
    ['Moneda', version.currency],
    ['Valor por HH', version.hourlyRate ?? 'No definido'],
    ['Neto', version.netAmount ?? 'No definido'],
    ['Total impuestos incluidos', version.totalAmount ?? 'No definido'],
    ['Semanas relativas', model.weeks || 'Sin planificación'],
    ['Fuente técnica', draft.aiPoc?.source === 'kdm_demo' ? 'DEMO KDM · no enviar al cliente' :
      draft.aiPoc?.edt ? 'EDT Gemini versionada' : 'Cotización manual'],
    ['Aviso', 'Exportación informativa; no equivale a aprobación, envío ni traspaso operativo.'],
  ], [38, 72]);
  if (details.length) {
    const table = details.map((d) => [
      d.wbs, d.stageCode ?? '', d.module, d.name, d.description, d.role,
      team(d.teamId), d.hours, d.fixed ? 'Sí' : 'No',
      d.references.join('; '),
    ]);
    const ws = sheet(book, 'EDT_Detalle', rows('EDT por actividad × perfil · HH vigentes', [
      'WBS', 'Tramo', 'Módulo', 'Actividad / entregable del perfil',
      'Descripción específica', 'Perfil', 'Equipo Kora', 'HH', 'Fija', 'Fuente',
    ], table), [18, 19, 29, 47, 65, 22, 26, 13, 11, 30]);
    const last = table.length + 2;
    const totalCell = XLSX.utils.encode_cell({ r: last, c: 7 });
    ws[totalCell] = { t: 'n', f: `SUM(H3:H${last})` };
    ws['!ref'] = `A1:J${last + 1}`;
    const sourceTotal = details.reduce((sum, r) => sum + Math.round(r.hours * 100), 0) / 100;
    if (Math.abs(sourceTotal - version.totalHours) > 0.011) {
      throw new Error('No se exporta: las HH de la EDT vigente no coinciden con la versión persistida.');
    }
    const moduleHours = new Map<string, number>();
    for (const entry of details) moduleHours.set(entry.module, (moduleHours.get(entry.module) ?? 0) + entry.hours);
    sheet(book, 'Resumen_Modulos', rows('Distribución por módulos', ['Módulo', 'HH'],
      [...moduleHours].map(([name, hh]) => [name, Math.round(hh * 100) / 100])), [48, 18]);
  }
  if (phases.length) {
    sheet(book, 'Tramos', rows('Fases relativas · no son fechas contractuales',
      ['Código', 'Fase / tramo', 'Semana de inicio', 'Duración semanas', 'Semana final'],
      phases.map((phase) => [
        phase.code, phase.name, phase.startWeek, phase.durationWeeks,
        phase.startWeek + phase.durationWeeks - 1,
      ])), [20, 66, 23, 24, 22]);
  }
  sheet(book, 'Carga_Equipo', rows('Dotación y capacidad de referencia ≠ HH de la EDT',
    ['Equipo', 'Colaboradores', 'Unidad', 'Duración', 'HH/sem persona',
      'Dedicación (%)', 'Capacidad referencial HH', 'HH cotizadas'],
    draft.teams.map((entry) => {
      const hh = details.length
        ? details.reduce((sum, row) => sum + (row.teamId === entry.teamId ? row.hours : 0), 0)
        : draft.mode === 'phases'
          ? draft.phases.reduce((sum, phase) =>
            sum + (phase.teamHours.find((row) => row.teamId === entry.teamId)?.hours ?? 0), 0)
          : entry.collaborators * (entry.unit === 'day' ? entry.duration / 5 : entry.duration) *
            entry.hoursPerWeek * entry.dedicationPercent / 100;
      const capacity = entry.collaborators *
        (entry.unit === 'day' ? entry.duration / 5 : entry.duration) *
        entry.hoursPerWeek * entry.dedicationPercent / 100;
      return [team(entry.teamId), entry.collaborators, entry.unit === 'day' ? 'Días' : 'Semanas',
        entry.duration, entry.hoursPerWeek, entry.dedicationPercent,
        Math.round(capacity * 100) / 100, Math.round(hh * 100) / 100];
    })), [32, 18, 18, 17, 23, 22, 29, 21]);
  if (weekly?.rows.length) {
    const items: Cell[][] = [];
    for (const row of weekly.rows) for (const [week, hours] of row.weeklyHours) {
      items.push([week, row.teamKey.startsWith('profile:')
        ? row.teamKey.slice('profile:'.length) + ' (sin mapear)' : team(row.teamKey), hours]);
    }
    items.sort((a, b) => Number(a[0]) - Number(b[0]));
    sheet(book, 'Roadmap_Semanal', rows('Carga orientativa por semana · sin fechas asignadas',
      ['Semana relativa', 'Equipo / perfil', 'HH estimadas'], items), [24, 40, 23]);
  }
  sheet(book, 'Comercial', rows('Condiciones comerciales de la versión',
    ['Tipo', 'Concepto', 'Monto / porcentaje', 'Unidad / evento'],
    [
      ...draft.costs.map((c) => ['Costo externo', c.description, c.amount, c.recurrence]),
      ...draft.paymentPlan.map((p) => ['Hito de pago', p.name, p.percent,
        p.trigger === 'phase' ? p.triggerPhase ?? 'Fase pendiente' :
          p.trigger === 'date' ? p.triggerDate ?? 'Fecha pendiente' : 'Aprobación']),
    ]), [25, 55, 24, 38]);
  const notes = [
    ...draft.assumptions.map((note) => ['Supuesto', note]),
    ...draft.exclusions.map((note) => ['Fuera de alcance', note]),
  ];
  if (notes.length) sheet(book, 'Supuestos', rows('Declaraciones explícitas de la cotización',
    ['Tipo', 'Descripción'], notes), [24, 100]);
  const references = [
    ...draft.sourceRefs.map((reference) => ['Referencia', reference]),
    ...(draft.aiPoc?.edt?.modules ?? []).flatMap((m) =>
      m.tasks.flatMap((task) => (task.referenceIds ?? []).map((ref) => ['EDT ' + task.wbs, ref]))),
  ];
  if (references.length) sheet(book, 'Fuentes', rows('Fuentes conservadas en Kora',
    ['Origen', 'Referencia'], references), [32, 95]);
  return book;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 15000);
}
const safeName = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 75) || 'proyecto';
const fileName = (model: ReturnType<typeof quotationExportModel>, ext: string) =>
  `Kora-${safeName(model.projectName)}-v${model.version.versionNumber}-rev${model.version.revision}.${ext}`;

export async function downloadQuotationExcel(context: QuotationExportContext): Promise<void> {
  const model = quotationExportModel(context);
  const templateUrl = import.meta.env.BASE_URL +
    'quotation-templates/EDT_Kora_Formato_Corporativo.xlsx';
  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error('Falta la plantilla Excel corporativa en public/quotation-templates.');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const output = patchFormattedQuotationTemplate(bytes, model);
  const exactBytes = new Uint8Array(output.byteLength);
  exactBytes.set(output);
  download(new Blob([exactBytes.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), fileName(model, 'xlsx'));
}

const PPT_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
/** Orden de párrafos NO VACÍOS del archivo Kabeli_Cotizaciones_DS.pptx adjunto.
 * Los números se validan antes de editar para evitar sustituir otra plantilla. */
function slideChanges(i: number, m: ReturnType<typeof quotationExportModel>): Record<number, string> {
  const { draft, version, details, phases } = m;
  const isRpa = draft.teams.length > 0 && draft.teams.every((row) =>
    /rpa|robot/i.test(m.team(row.teamId)));
  const featureNames = [...new Set(details.map((row) => row.name))];
  const activities = details.length ? details.map((row) => ({ team: m.team(row.teamId), name: row.name, hours: row.hours }))
    : draft.phases.flatMap((p) => p.teamHours.map((r) => ({ team: m.team(r.teamId), name: p.name, hours: r.hours })));
  const ass = draft.assumptions;
  const pay = draft.paymentPlan.map((p) => p.name + ': ' + fmt(p.percent) + '%');
  const phaseLabel = (n: number) => phases[n]?.name ?? '—';
  const preview = (n: number, max = 70) => compact(n < featureNames.length ? featureNames[n] : '—', max);
  const chunk = (n: number) => activities[n];
  const amt = money(version.netAmount, version.currency);
  // Dos escalas diferentes sobre las MISMAS semanas persistidas.
  // Sin fecha contractual, los meses son relativos de 4,345 semanas.
  const weekStep = Math.max(1, Math.ceil(Math.max(1, m.weeks) / 8));
  const monthStep = Math.max(1, Math.ceil(Math.ceil(Math.max(1, m.weeks) / (365.25 / 12 / 7)) / 6));
  const weekAxis = (slot: number) => 'Sem ' + (1 + slot * weekStep);
  const monthAxis = (slot: number) => 'Mes ' + (1 + slot * monthStep);
  switch (i) {
    case 2: return { 0: (draft.aiPoc?.source === 'kdm_demo' ? 'DEMO INTERNA' : 'PROPUESTA COMERCIAL') + ' · ' + m.status.toUpperCase(), 1: compact(m.projectName, 58),
      2: compact(m.client + ' · ' + version.name, 85) };
    case 4: return isRpa ? {} : {
      0: 'DESARROLLO DE SOLUCIONES',
      1: 'Tecnología aplicada a necesidades reales del negocio.',
      2: '¿Qué desarrollamos?', 3: 'Software, aplicaciones e integraciones basadas en requerimientos validados con el cliente.',
      4: '¿Qué valor aporta?', 5: 'Optimización de procesos, trazabilidad, calidad de datos y mejor experiencia para los usuarios.',
      6: '¿Dónde aplicarlo?', 7: 'En procesos y productos digitales identificados dentro del alcance de cada proyecto.',
      8: '¿Cómo implementarlo?', 9: 'Por etapas, con validaciones, entregables y revisión continua del alcance.',
    };
    case 6: return isRpa ? {} : {
      0: 'ACOMPAÑAMIENTO TECNOLÓGICO',
      1: 'Trabajo colaborativo con el equipo del cliente.',
      2: 'Acompañamos cada etapa con prácticas de desarrollo, revisión y transferencia de conocimientos.',
      3: 'Soporte técnico de implementación',
      4: 'Revisión de decisiones y resolución de incidencias según alcance contratado.',
      5: 'Colaboración con especialistas',
      6: 'Coordinación de equipos y tecnologías necesarias para construir la solución.',
    };
    case 9: return { 1: compact(m.projectName + ' · alcance y plan de trabajo', 75) };
    case 10: return {
      2: compact(m.scope, 280),
      3: compact(m.projectDescription || 'Detalle de alcance y estimación disponible en la EDT adjunta.', 230),
      5: preview(0, 52), 6: preview(1, 52), 7: preview(2, 52),
      8: preview(3, 52), 9: preview(4, 52), 10: preview(5, 52),
    };
    case 11: return {
      1: 'Actividades principales · HH totales de la cotización. Detalle completo en Excel.',
      5: compact(chunk(0)?.team ?? '—', 28),
      6: compact(chunk(0)?.name ?? 'Sin EDT desglosada', 98),
      // La columna TOTAL H/H está combinada verticalmente en el PPTX original.
      // Este valor es el TOTAL de la versión, no las HH de una tarea.
      7: fmt(version.totalHours) + ' H/H',
      8: compact(chunk(1)?.team ?? '—', 28),
      9: compact(chunk(1)?.name ?? '—', 98),
      10: compact(chunk(2)?.team ?? '—', 28),
      11: compact(chunk(2)?.name ?? '—', 98),
      12: compact(chunk(3)?.team ?? '—', 28),
      13: compact(chunk(3)?.name ?? '—', 98),
    };
    case 12: return { 1: 'Arquitectura sujeta a validación del líder técnico.',
      2: 'ARQUITECTURA PENDIENTE DE VALIDACIÓN',
      3: 'El detalle técnico debe ser validado antes de comprometer componentes, integraciones e infraestructura.' };
    case 13: return { 4: 'Contraparte cliente: por definir',
      5: 'Gestión del proyecto: por definir',
      6: 'Liderazgo técnico: por confirmar',
      7: 'Arquitectura: según alcance validado',
      8: compact('Perfiles previstos: ' + draft.teams.map((t) => m.team(t.teamId)).join(', '), 105) };
    case 14: return {
      0: 'PLANIFICACIÓN · VISTA MENSUAL',
      1: 'Cronograma relativo por meses; sin fecha de inicio contractual.',
      2: 'ETAPA / MES',
      3: monthAxis(0), 4: monthAxis(1), 5: monthAxis(2),
      6: monthAxis(3), 7: monthAxis(4), 8: monthAxis(5),
      9: compact(phaseLabel(0), 28), 10: compact(phaseLabel(1), 28),
      11: compact(phaseLabel(2), 28), 12: compact(phaseLabel(3), 28),
      13: compact(phaseLabel(4), 28), 14: compact(phaseLabel(5), 28),
      15: 'Meses relativos calculados desde semanas. Detalle de fases en Excel.' };
    case 15: return {
      0: 'PLANIFICACIÓN · VISTA SEMANAL',
      1: 'Cronograma relativo por semanas; sin fecha de inicio contractual.',
      3: weekAxis(0), 4: weekAxis(1), 5: weekAxis(2), 6: weekAxis(3),
      7: weekAxis(4), 8: weekAxis(5), 9: weekAxis(6), 10: weekAxis(7),
      11: compact(phaseLabel(0), 28), 12: compact(phaseLabel(1), 28),
      13: compact(phaseLabel(2), 28), 14: compact(phaseLabel(3), 28),
      15: compact(phaseLabel(4), 28), 16: compact(phaseLabel(5), 28),
      17: 'Cronograma referencial en semanas. Detalle completo en Excel.' };
    case 16: return { 1: 'Esfuerzo y valor de la versión seleccionada.',
      3: String(m.weeks || '—') + ' semanas relativas',
      7: compact(m.projectName, 85), 8: fmt(version.totalHours) + ' horas',
      9: amt, 10: compact(draft.costs[0]?.description ?? 'Costos externos', 65),
      11: draft.costs[0] ? fmt(draft.costs[0]!.amount) + ' ' + version.currency : '—',
      12: money(version.totalAmount, version.currency),
      13: 'Impuestos: ' + (version.tax === 'iva19' ? 'IVA 19%' : version.tax === 'igv18' ? 'IGV 18%' : 'exento') };
    case 17: return {
      4: compact(ass[0] ?? 'Supuestos comerciales sujetos a validación.', 130),
      7: 'Inicio sujeto a confirmación y disponibilidad acordada con el cliente.',
      10: compact(pay.join('; ') || 'Plan de pagos pendiente de definición comercial.', 140),
      13: 'Condiciones de equipamiento según acuerdo comercial firmado.',
      16: compact(ass[1] ?? 'Garantía y soporte sujetos al contrato aplicable.', 135),
    };
    case 18: return { 2: 'Exclusiones registradas para esta versión comercial:',
      3: compact(draft.exclusions[0] ?? 'No se registraron exclusiones específicas.', 95),
      4: compact(draft.exclusions[1] ?? '—', 95),
      5: compact(draft.exclusions[2] ?? '—', 95),
      6: compact(draft.exclusions[3] ?? '—', 95) };
    default: return {};
  }
}

const expectedParagraphs: Record<number, number> = {
  2: 7, 4: 11, 5: 25, 6: 8, 7: 8, 9: 3, 10: 12,
  11: 15, 12: 5, 13: 16, 14: 17, 15: 19, 16: 15, 17: 18, 18: 8,
};

/** Se reposicionan ÚNICAMENTE las seis barras originales de la plantilla:
 * geometría, estilos, rellenos y líneas se conservan tal como están.
 * Cuando el proyecto tiene menos de seis fases se eliminan barras de ejemplo.
 */
function patchQuotationGanttBars(
  doc: Document, slideNumber: number,
  model: ReturnType<typeof quotationExportModel>,
): void {
  if (slideNumber !== 14 && slideNumber !== 15) return;
  const pns = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const ans = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const ids = slideNumber === 14 ? [338, 346, 354, 362, 370, 378]
    : [415, 425, 435, 445, 455, 465];
  const origin = 2542032;
  const usableWidth = 6050000;
  const monthWeeks = 365.25 / 12 / 7;
  const monthStep = Math.max(1, Math.ceil(Math.ceil(Math.max(1, model.weeks) / monthWeeks) / 6));
  const weekStep = Math.max(1, Math.ceil(Math.max(1, model.weeks) / 8));
  const horizon = slideNumber === 14
    ? 6 * monthStep * monthWeeks : 8 * weekStep;
  const shapes = Array.from(doc.getElementsByTagNameNS(pns, 'sp'));
  ids.forEach((id, index) => {
    const shape = shapes.find((sp) =>
      Array.from(sp.getElementsByTagNameNS(pns, 'cNvPr'))
        .some((n) => (n.getAttribute('name') ?? '').includes(';' + id + ';')));
    if (!shape) throw new Error('La barra ' + id + ' falta en el Gantt corporativo.');
    const phase = model.phases[index];
    if (!phase) {
      shape.parentNode?.removeChild(shape);
      return;
    }
    const spPr = Array.from(shape.children).find((n) => n.localName === 'spPr');
    const xfrm = spPr ? Array.from(spPr.getElementsByTagNameNS(ans, 'xfrm'))[0] : null;
    const off = xfrm ? Array.from(xfrm.getElementsByTagNameNS(ans, 'off'))[0] : null;
    const ext = xfrm ? Array.from(xfrm.getElementsByTagNameNS(ans, 'ext'))[0] : null;
    if (!off || !ext) throw new Error('Barra sin geometría en diapositiva ' + slideNumber);
    const start = Math.max(0, phase.startWeek - 1);
    const end = Math.min(horizon, start + phase.durationWeeks);
    const x = origin + Math.round((start / horizon) * usableWidth);
    const width = Math.max(1, Math.round(((end - start) / horizon) * usableWidth));
    off.setAttribute('x', String(x));
    ext.setAttribute('cx', String(width));
  });
}

/** Extraído para probar reemplazos XML sin copiar el binario de 43 MB a tests. */
export function patchQuotationSlideXml(
  xml: string, slideNumber: number, model: ReturnType<typeof quotationExportModel>,
): string {
  // Las diapositivas 5 y 7 son material institucional fijo de Kabeli.
  // Conservar los bytes XML originales: cifras, textos, estilos y formas intactos.
  if (slideNumber === 5 || slideNumber === 7) return xml;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Plantilla PPTX inválida: XML ilegible.');
  const ns = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const paragraphs = Array.from(doc.getElementsByTagNameNS(ns, 'p')).filter((p) =>
    Array.from(p.getElementsByTagNameNS(ns, 't')).some((t) => t.textContent?.trim()));
  if (expectedParagraphs[slideNumber] && paragraphs.length !== expectedParagraphs[slideNumber]) {
    throw new Error('La diapositiva ' + slideNumber + ' no corresponde a la plantilla aprobada.');
  }
  for (const [index, value] of Object.entries(slideChanges(slideNumber, model))) {
    const p = paragraphs[Number(index)];
    if (!p) throw new Error('Falta el campo ' + index + ' en la diapositiva ' + slideNumber);
    const texts = Array.from(p.getElementsByTagNameNS(ns, 't'));
    texts.forEach((text, n) => { text.textContent = n === 0 ? value : ''; });
  }
  patchQuotationGanttBars(doc, slideNumber, model);
  return new XMLSerializer().serializeToString(doc);
}

export async function downloadQuotationPowerPoint(context: QuotationExportContext): Promise<void> {
  const model = quotationExportModel(context);
  // Archivo original entregado por Kabeli; no se intenta reconstruir el diseño.
  const templateUrl = import.meta.env.BASE_URL + 'quotation-templates/Kabeli_Cotizaciones_DS.pptx';
  const result = await fetch(templateUrl);
  if (!result.ok) throw new Error('Falta la plantilla PPTX corporativa en public/quotation-templates.');
  const bytes = new Uint8Array(await result.arrayBuffer());
  if (bytes.length < 100_000) throw new Error('El archivo PPTX recibido no es la plantilla corporativa.');
  const cfb = XLSX.CFB.read(bytes, { type: 'buffer' });
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  for (let i = 1; i <= 19; i++) {
    // Se reutilizan SIN CAMBIOS las láminas corporativas 5 y 7 del PPTX base.
    if (i === 5 || i === 7) continue;
    if (!Object.keys(slideChanges(i, model)).length) continue;
    const index = cfb.FullPaths.findIndex((p: string) =>
      p.toLowerCase().endsWith('/ppt/slides/slide' + i + '.xml'));
    const entry = index < 0 ? null : cfb.FileIndex[index];
    if (!entry?.content) throw new Error('Falta la diapositiva ' + i + ' de la plantilla corporativa.');
    const xml = decoder.decode(new Uint8Array(entry.content));
    entry.content = encoder.encode(patchQuotationSlideXml(xml, i, model));
    entry.size = entry.content.length;
  }
  // Las notas originales son instrucciones editoriales del deck (CheckApp,
  // Sinco, fechas de ejemplo). No forman parte de la propuesta entregable.
  // Vaciar solo su texto mantiene intactas relaciones, geometría y maestros.
  for (const [index, fullPath] of cfb.FullPaths.entries()) {
    if (!/\/ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(fullPath)) continue;
    const entry = cfb.FileIndex[index];
    if (!entry?.content) continue;
    const note = new DOMParser().parseFromString(
      decoder.decode(new Uint8Array(entry.content)), 'application/xml');
    if (note.getElementsByTagName('parsererror').length) continue;
    for (const run of Array.from(note.getElementsByTagNameNS(
      'http://schemas.openxmlformats.org/drawingml/2006/main', 't'))) {
      run.textContent = '';
    }
    entry.content = encoder.encode(new XMLSerializer().serializeToString(note));
    entry.size = entry.content.length;
  }
  const output = XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' });
  download(new Blob([new Uint8Array(output)], { type: PPT_MIME }), fileName(model, 'pptx'));
}
