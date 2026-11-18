import { describe, expect, it } from 'vitest';
import type { QuotationVersion } from '@kora/contracts';
import { buildQuotationWorkbook, patchQuotationSlideXml, quotationClientBrief, quotationClientExclusions, quotationRepresentativeTeamActivities, quotationExportModel } from './quotation-export';
import { patchStyledTableSheet } from './quotation-export-template';

const version = (patch: Record<string, unknown> = {}): QuotationVersion => ({
  id: 'v-a', quotationId: 'q-a', versionNumber: 1, name: 'Versión 1',
  origin: 'manual', status: 'draft', aiReviewStatus: null, revision: 3,
  createdByUserId: 'u-a', createdAt: '2026-11-08T12:00:00Z',
  updatedAt: '2026-11-08T12:00:00Z',
  hourlyRate: null, currency: 'UF', tax: 'iva19',
  totalHours: 0, netAmount: null, totalAmount: null,
  draft: {
    mode: 'team', teams: [], phases: [], costs: [], paymentPlan: [],
    assumptions: [], exclusions: [], sourceRefs: [], answers: {},
    analysis: null, aiPoc: null,
  },
  ...patch,
} as QuotationVersion);
const context = (v = version()) => ({
  version: v, project: { name: 'Proyecto sin EDT', client: { companyName: 'Cliente QA' } },
  teamNames: new Map<string, string>(),
});

describe('Exportación de cotizaciones · versión guardada', () => {
  it('manual vacía exporta solamente hojas con datos reales, nunca plantillas Zurich', () => {
    const workbook = buildQuotationWorkbook(context());
    expect(workbook.SheetNames).toEqual(['Resumen', 'Carga_Equipo', 'Comercial']);
    expect(workbook.Sheets.Resumen?.B4?.v).toBe('Versión 1');
    expect(workbook.Sheets.Resumen?.B10?.v).toBe(0);
    expect(workbook.Sheets.Resumen?.B12?.v).toBe(0);
    expect(workbook.Sheets.Resumen?.B15?.v).toBe('No definido');
    expect(workbook.SheetNames).not.toContain('Auditoria');
    expect(workbook.SheetNames).not.toContain('EDT_Detalle');
    expect(workbook.SheetNames).not.toContain('Plan_Diario');
  });

  it('Excel separa HH futuras y Fase 0 dentro de las HH totales cobrables', () => {
    const quote = version({
      totalHours: 1108, hourlyRate: 0.6,
      netAmount: 993.9, totalAmount: 1182.741,
      draft: { ...version().draft, phaseZeroBillableHours: 548.5 },
    });
    const workbook = buildQuotationWorkbook(context(quote));
    expect(workbook.Sheets.Resumen?.B10?.v).toBe(1108);
    expect(workbook.Sheets.Resumen?.B11?.v).toBe(548.5);
    expect(workbook.Sheets.Resumen?.B12?.v).toBe(1656.5);
    expect(workbook.Sheets.Resumen?.B16?.v).toBe(993.9);
  });

  it('no inventa arquitectura, cronograma aprobado ni importes cuando faltan', () => {
    const model = quotationExportModel(context());
    expect(model.scope).toMatch(/pendiente/);
    expect(model.weeks).toBe(0);
    expect(model.version.totalAmount).toBeNull();
    expect(model.details).toEqual([]);
  });

  it('conserva el XML, estilos y geometría de portada mientras sustituye los textos', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:spTree>
          ${['PROPUESTA COMERCIAL','Nombre de proyecto','Descripción si es necesario',
            'Texto 4','Texto 5','Texto 6','‹#›'].map((text) =>
              `<p:sp><p:spPr><a:off x="200" y="300"/></p:spPr><p:txBody><a:p><a:r><a:rPr lang="es"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`).join('')}
        </p:spTree>
      </p:sld>`;
    const changed = patchQuotationSlideXml(xml, 2, quotationExportModel(context()));
    expect(changed).toContain('Proyecto sin EDT');
    expect(changed).toContain('Cliente QA');
    expect(changed).not.toContain('Nombre de proyecto');
    expect(changed).toContain('x="200"');
    expect(changed).toContain('lang="es"');
  });

  it.each([
    { slide: 5, figures: ['+190', '+150', '+40', '+5'] },
    { slide: 7, figures: ['+80.000', '+1.000'] },
  ])('no altera la lámina institucional $slide, ni sus cifras ni su XML original',
    ({ slide, figures }) => {
      const corporateXml =
        '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
        '<p:spTree><p:sp><p:txBody><a:p>' +
        figures.map((figure) => '<a:r><a:t>' + figure + '</a:t></a:r>').join('') +
        '</a:p></p:txBody></p:sp></p:spTree></p:sld>';
      const quote = version({ totalHours: 1592 });
      const result = patchQuotationSlideXml(
        corporateXml, slide, quotationExportModel(context(quote)));
      expect(result).toBe(corporateXml);
      for (const figure of figures) expect(result).toContain(figure);
      expect(result).not.toContain('HORAS HOMBRE ESTIMADAS');
      expect(result).not.toContain('SEMANAS REFERENCIALES');
    });

  it('sintetiza objetivos y funcionalidades sin narración documental ni nombres recortados', () => {
    const phases = [
      'Levantamiento UI/UX y Wireframes de Controles Críticos',
      'Definición de Arquitectura y Modelo Relacional de Controles',
      'Administración del Catálogo Maestro de 43 Controles',
      'Sistema de Inspecciones Pre-Operacionales y Chequeos',
      'Registro y Seguimiento de Mantenimiento Preventivo',
      'Verificación de Integridad de Sistemas de Contención',
    ].map((name, index) => ({
      name, startWeek: index + 1, durationWeeks: 1, teamHours: [],
    }));
    const model = quotationExportModel({
      ...context(version({ draft: { ...version().draft, mode: 'phases', phases } })),
      project: {
        name: 'Pruebas QA',
        description: 'El documento "Environmental Critical Control Performance Specifications Library" ' +
          '(119 páginas) establece las especificaciones corporativas mínimas para el control ' +
          'de riesgos ambientales críticos en operaciones mineras.',
        client: { companyName: 'Cliente QA' },
      },
    });
    const brief = quotationClientBrief(model);
    expect(brief.features).toEqual([
      'Gestión del catálogo de controles',
      'Inspecciones y chequeos',
      'Mantenimiento preventivo',
      'Integridad de sistemas de contención',
      'Diseño UX/UI y prototipos',
      'Arquitectura y modelo de datos',
    ]);
    expect(brief.objective).toContain('gestión del catálogo de controles');
    expect(brief.objective).not.toMatch(/documento|119 páginas|Gemini|Library/i);
    expect(brief.scope).not.toMatch(/documento|EDT adjunta|PDF/i);
    expect(brief.features.every((feature) => !/[.…]$/.test(feature))).toBe(true);

    const xml = '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:spTree>' +
      Array.from({ length: 12 }, (_, i) => '<p:sp><p:txBody><a:p><a:r><a:t>' +
        (i === 2 ? 'Texto de prueba CheckApp' : 'Ejemplo original ' + i) +
        '</a:t></a:r></a:p></p:txBody></p:sp>').join('') + '</p:spTree></p:sld>';
    const exported = patchQuotationSlideXml(xml, 10, model);
    const document = new DOMParser().parseFromString(exported, 'application/xml');
    const paragraphs = Array.from(document.getElementsByTagNameNS(
      'http://schemas.openxmlformats.org/drawingml/2006/main', 'p'));
    expect(paragraphs[2]?.textContent).toBe(brief.objective);
    expect(paragraphs[3]?.textContent).toBe(brief.scope);
    for (let i = 0; i < 6; i++) {
      expect(paragraphs[5 + i]?.textContent).toBe(brief.features[i]);
    }
    expect(exported).not.toMatch(/Environmental Critical|119 páginas|CheckApp|Wireframes de Controles Crí/i);
  });

  it('prioriza un objetivo comercial válido y omite nombres de documentos en proyectos manuales', () => {
    const model = quotationExportModel({
      ...context(),
      project: {
        name: 'Portal clientes',
        description: 'Implementar un portal para que los clientes consulten sus solicitudes y aprobaciones.',
        client: { companyName: 'Cliente QA' },
      },
    });
    const brief = quotationClientBrief(model);
    expect(brief.objective).toBe(
      'Implementar un portal para que los clientes consulten sus solicitudes y aprobaciones.');
    expect(brief.features).toHaveLength(0);
    expect(brief.scope).not.toContain('EDT');
  });

  it('no reutiliza las funcionalidades CheckApp de la plantilla si no existen en la versión', () => {
    const model = quotationExportModel(context());
    const brief = quotationClientBrief(model);
    expect(brief.features).toHaveLength(0);
    expect(brief.objective).toContain('Proyecto sin EDT');
    expect(brief.objective).not.toContain('finanzas');
  });

  it('enriquece el objetivo con entendimiento confirmado y funcionalidades de la EDT sin inventar contenido', () => {
    const names = [
      'Gestión de usuarios y accesos',
      'Inspecciones y chequeos',
      'Aprobaciones y validaciones',
      'Reportes e indicadores',
      'Integraciones y servicios',
      'Diseño UX/UI y prototipos',
    ];
    const v = version({ draft: {
      ...version().draft,
      mode: 'phases',
      phases: names.map((name, index) => ({
        name, startWeek: index + 1, durationWeeks: 1, teamHours: [],
      })),
      aiPoc: {
        confirmedUnderstanding: 'Implementar una plataforma para la gestión de inspecciones, validaciones y responsables operativos.',
        proposal: { summary: 'El cliente requiere trazabilidad y reportes.' },
      },
    } });
    const model = quotationExportModel({
      ...context(v),
      project: { name: 'Inspecciones', description: 'Proyecto de inspecciones.', client: { companyName: 'Cliente QA' } },
    });
    const brief = quotationClientBrief(model);
    expect(brief.objective).toContain('Implementar una plataforma');
    expect(brief.objective.length).toBeGreaterThan(115);
    expect(brief.scope).toMatch(/reportes|integraciones|diseño/iu);
    expect(brief.scope.length).toBeGreaterThan(125);
    expect(brief.objective + brief.scope).not.toMatch(/Gemini|página|documento|PDF/iu);
  });

  it('la diapositiva 10 presenta un alcance propio del proyecto sin enviar al cliente a un Excel', () => {
    const v = version({ draft: {
      ...version().draft, mode: 'phases',
      phases: [
        'Gestión de usuarios y accesos',
        'Inspecciones y chequeos',
        'Aprobaciones y validaciones',
        'Reportes e indicadores',
        'Integraciones y servicios',
        'Diseño UX/UI y prototipos',
      ].map((name, index) => ({
        name, startWeek: index + 1, durationWeeks: 1, teamHours: [],
      })),
      aiPoc: {
        confirmedUnderstanding:
          'Implementar una plataforma para que supervisores registren y validen inspecciones operativas. ' +
          'Los responsables podrán consultar la trazabilidad de las inspecciones por sede y revisar sus resultados.',
        proposal: {
          summary: 'El sistema facilita el seguimiento de las inspecciones.',
        },
      },
    } });
    const model = quotationExportModel({
      ...context(v),
      project: {
        name: 'Control de inspecciones',
        description: 'Portal de inspecciones para distintas sedes.',
        client: { companyName: 'Cliente QA' },
      },
    });
    const brief = quotationClientBrief(model);
    expect(brief.scope).toContain('aprobaciones y validaciones');
    expect(brief.scope).toContain('trazabilidad de las inspecciones por sede');
    expect(brief.scope).not.toMatch(/Excel|HH por equipo|EDT|documento|PDF/iu);
    const ns = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    const slide = '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
      'xmlns:a="' + ns + '"><p:spTree>' +
      Array.from({ length: 12 }, (_, i) =>
        '<p:sp><p:txBody><a:p><a:r><a:t>Campo ' + i +
        '</a:t></a:r></a:p></p:txBody></p:sp>').join('') + '</p:spTree></p:sld>';
    const xml = patchQuotationSlideXml(slide, 10, model);
    const paragraphs = Array.from(new DOMParser().parseFromString(xml, 'application/xml')
      .getElementsByTagNameNS(ns, 'p'));
    expect(paragraphs[3]?.textContent).toBe(brief.scope);
    expect(xml).not.toMatch(/Excel de cotización|desglose de tareas y HH/iu);
  });

  it('sin narrativa adicional, no inventa entregables ni referencia documentación ajena', () => {
    const v = version({ draft: {
      ...version().draft, mode: 'phases',
      phases: ['Aprobaciones y validaciones', 'Reportes e indicadores', 'Integraciones y servicios']
        .map((name) => ({
          name, startWeek: 1, durationWeeks: 1, teamHours: [],
        })),
    } });
    const brief = quotationClientBrief(quotationExportModel(context(v)));
    expect(brief.scope).toContain('integración de servicios');
    expect(brief.scope).not.toMatch(/Excel|EDT|HH por equipo|plantilla|documentación/iu);
  });

  it('la lámina 11 cubre todos los equipos con HH y una actividad propia aunque las primeras WBS sean del mismo equipo', () => {
    const teamNames = new Map([
      ['dev', 'Desarrollo'], ['ux', 'UX-UI'], ['qa', 'QA'],
      ['ia', 'IA'], ['rpa', 'RPA'], ['pmo', 'PMO'],
    ]);
    const phase = (name: string, teamId: string, hours: number) => ({
      name, startWeek: 1, durationWeeks: 1,
      teamHours: [{ teamId, hours }],
    });
    const v = version({ totalHours: 180, draft: {
      ...version().draft, mode: 'phases',
      teams: [...teamNames.keys()].map((teamId) => ({
        teamId, collaborators: 1, unit: 'week', duration: 1,
        hoursPerWeek: 40, dedicationPercent: 100,
      })),
      phases: [
        phase('Desarrollo de APIs', 'dev', 30),
        phase('Desarrollo de reglas', 'dev', 30),
        phase('Desarrollo de plataforma', 'dev', 30),
        phase('Desarrollo de controles', 'dev', 30),
        phase('Diseñar prototipos', 'ux', 15),
        phase('Validación de calidad', 'qa', 15),
        phase('Entrenar modelos', 'ia', 10),
        phase('Implementar robot', 'rpa', 10),
        phase('Coordinar entregas', 'pmo', 10),
      ],
    } });
    const model = quotationExportModel({ ...context(v), teamNames });
    const rows = quotationRepresentativeTeamActivities(model);
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.team)).toEqual(['Desarrollo', 'UX-UI', 'QA', 'IA']);
    expect(rows.every((row) => !row.team.includes(' / '))).toBe(true);
    for (const activity of [
      'Desarrollo de APIs', 'Diseñar prototipos', 'Validación de calidad', 'Entrenar modelos',
    ]) {
      expect(rows.map((row) => row.name).join(' · ')).toContain(activity);
    }
    const ns = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    const xml = '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
      'xmlns:a="' + ns + '"><p:spTree>' +
      Array.from({ length: 15 }, (_, i) =>
        '<p:sp><p:txBody><a:p><a:r><a:t>Campo ' + i +
        '</a:t></a:r></a:p></p:txBody></p:sp>').join('') + '</p:spTree></p:sld>';
    const patched = patchQuotationSlideXml(xml, 11, model);
    const paragraphs = Array.from(new DOMParser().parseFromString(patched, 'application/xml')
      .getElementsByTagNameNS(ns, 'p'));
    expect(paragraphs[7]?.textContent).toBe('180 H/H');
    expect([5, 8, 10, 12].map((i) => paragraphs[i]?.textContent))
      .toEqual(['Desarrollo', 'UX-UI', 'QA', 'IA']);
    expect(paragraphs[1]?.textContent).toContain('equipo y perfil');
  });

  it('separa Líder técnico de Desarrollo aun si Gemini mapea ambos al mismo equipo Kora', () => {
    const task = (role: string, name: string, hours: number, index: number) => ({
      wbs: 'WBS-' + index, role, name, description: '', hours,
    });
    const tasks = [
      task('Líder Técnico', 'Supervisar calidad, riesgos y decisiones técnicas de forma semanal', 48, 1),
      task('Desarrollador Fullstack', 'Implementar módulos y servicios de negocio', 32, 2),
      task('Diseñador UX', 'Diseñar interfaces y prototipos', 12, 3),
      task('Tester QA', 'Ejecutar pruebas de regresión integradas', 8, 4),
    ];
    const teamNames = new Map([
      ['dev', 'Desarrollo'], ['ux', 'UX-UI'], ['qa', 'QA'],
    ]);
    const draft = {
      ...version().draft,
      teams: [...teamNames.keys()].map((teamId) => ({
        teamId, collaborators: 1, unit: 'week', duration: 1,
        hoursPerWeek: 40, dedicationPercent: 100,
      })),
      aiPoc: {
        source: 'drive',
        roleTeamIds: {
          'Líder Técnico': 'dev', 'Desarrollador Fullstack': 'dev',
          'Diseñador UX': 'ux', 'Tester QA': 'qa',
        },
        proposal: { roles: tasks.map(({ role }) => ({ role })) },
        edt: {
          schemaVersion: 'kora.quotation.reference-edt.v1',
          source: 'drive', provider: 'gemini',
          modules: [{ name: 'Sistema de inspecciones', totalHours: 100, tasks }],
          totalHours: 100,
        },
      },
    };
    const model = quotationExportModel({
      ...context(version({ totalHours: 100, draft })), teamNames,
    });
    expect(model.details).toHaveLength(4);
    // Las 48 HH de TL NO pueden elegir la actividad más representativa
    // del equipo Desarrollo, aunque superen las 32 HH de implementación.
    const rows = quotationRepresentativeTeamActivities(model);
    expect(rows).toEqual([
      { team: 'Líder técnico',
        name: 'Supervisar calidad, riesgos y decisiones técnicas de forma semanal' },
      { team: 'Desarrollo', name: 'Implementar módulos y servicios de negocio' },
      { team: 'UX-UI', name: 'Diseñar interfaces y prototipos' },
      { team: 'QA', name: 'Ejecutar pruebas de regresión integradas' },
    ]);
    const ns = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    const xml = '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
      'xmlns:a="' + ns + '"><p:spTree>' +
      Array.from({ length: 15 }, (_, i) =>
        '<p:sp><p:txBody><a:p><a:r><a:t>Campo ' + i +
        '</a:t></a:r></a:p></p:txBody></p:sp>').join('') + '</p:spTree></p:sld>';
    const output = patchQuotationSlideXml(xml, 11, model);
    const paragraphs = Array.from(new DOMParser().parseFromString(output, 'application/xml')
      .getElementsByTagNameNS(ns, 'p'));
    expect(paragraphs[2]?.textContent).toBe('EQUIPO / PERFIL');
    expect(paragraphs[5]?.textContent).toBe('Líder técnico');
    expect(paragraphs[6]?.textContent).toContain('Supervisar calidad');
    expect(paragraphs[8]?.textContent).toBe('Desarrollo');
    expect(paragraphs[9]?.textContent).toContain('Implementar módulos');
    expect(paragraphs[7]?.textContent).toBe('100 H/H');
  });

  it('si hay 5 perfiles, muestra UX-UI con su propia fila y NO mezcla su tarea con Líder técnico', () => {
    const task = (role: string, name: string, hours: number, i: number) => ({
      wbs: 'T' + i, role, name, description: '', hours,
    });
    const tasks = [
      task('Líder técnico', 'Supervisar calidad, riesgos y decisiones técnicas de forma semanal', 50, 1),
      task('Desarrollador', 'Implementar formulario y borrador mensual', 70, 2),
      task('Diseñador UX', 'Diseñar prototipos de ambos módulos', 25, 3),
      task('Especialista IA', 'Construir análisis IA de consistencia documental', 45, 4),
      task('Tester QA', 'Ejecutar pruebas funcionales integradas', 30, 5),
    ];
    const draft = {
      ...version().draft,
      teams: ['dev', 'ux', 'ai', 'qa'].map((teamId) => ({
        teamId, collaborators: 1, unit: 'week', duration: 1,
        hoursPerWeek: 40, dedicationPercent: 100,
      })),
      aiPoc: {
        source: 'drive',
        roleTeamIds: {
          'Líder técnico': 'dev', Desarrollador: 'dev',
          'Diseñador UX': 'ux', 'Especialista IA': 'ai', 'Tester QA': 'qa',
        },
        proposal: { roles: tasks.map(({ role }) => ({ role })) },
        edt: {
          schemaVersion: 'kora.quotation.reference-edt.v1',
          source: 'drive', provider: 'gemini',
          modules: [{ name: 'Proyecto', totalHours: 220, tasks }],
          totalHours: 220,
        },
      },
    };
    const model = quotationExportModel({
      ...context(version({ totalHours: 220, draft })),
      teamNames: new Map([
        ['dev', 'Desarrollo'], ['ux', 'UX-UI'],
        ['ai', 'IA'], ['qa', 'QA'],
      ]),
    });
    expect(quotationRepresentativeTeamActivities(model)).toEqual([
      { team: 'Desarrollo', name: 'Implementar formulario y borrador mensual' },
      { team: 'UX-UI', name: 'Diseñar prototipos de ambos módulos' },
      { team: 'IA', name: 'Construir análisis IA de consistencia documental' },
      { team: 'QA', name: 'Ejecutar pruebas funcionales integradas' },
    ]);
    const ns = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    const xml = '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
      'xmlns:a="' + ns + '"><p:spTree>' +
      Array.from({ length: 15 }, (_, i) =>
        '<p:sp><p:txBody><a:p><a:r><a:t>Campo ' + i +
        '</a:t></a:r></a:p></p:txBody></p:sp>').join('') + '</p:spTree></p:sld>';
    const patched = patchQuotationSlideXml(xml, 11, model);
    const paragraphs = Array.from(new DOMParser().parseFromString(patched, 'application/xml')
      .getElementsByTagNameNS(ns, 'p'));
    expect([5, 8, 10, 12].map((i) => paragraphs[i]?.textContent)).toEqual([
      'Desarrollo', 'UX-UI', 'IA', 'QA',
    ]);
    expect(patched).not.toContain('Supervisar calidad');
    expect(paragraphs[7]?.textContent).toBe('220 H/H');
  });

  it('una supervisión técnica con perfil legacy genérico no sustituye la actividad de Desarrollo', () => {
    const tasks = [
      { wbs: 'WBS-A', role: 'Desarrollo',
        name: 'Supervisar calidad, riesgos y decisiones técnicas de forma semanal',
        description: '', hours: 45 },
      { wbs: 'WBS-B', role: 'Desarrollo',
        name: 'Construir el módulo de inspecciones', description: '', hours: 15 },
    ];
    const draft = {
      ...version().draft,
      teams: [{ teamId: 'dev', collaborators: 1, unit: 'week', duration: 1,
        hoursPerWeek: 40, dedicationPercent: 100 }],
      aiPoc: {
        source: 'drive', proposal: { roles: [{ role: 'Desarrollo' }] },
        roleTeamIds: { Desarrollo: 'dev' },
        edt: {
          schemaVersion: 'kora.quotation.reference-edt.v1',
          source: 'drive', provider: 'gemini',
          modules: [{ name: 'Operación', totalHours: 60, tasks }],
          totalHours: 60,
        },
      },
    };
    const model = quotationExportModel({
      ...context(version({ totalHours: 60, draft })),
      teamNames: new Map([['dev', 'Desarrollo']]),
    });
    expect(quotationRepresentativeTeamActivities(model)).toEqual([
      { team: 'Líder técnico',
        name: 'Supervisar calidad, riesgos y decisiones técnicas de forma semanal' },
      { team: 'Desarrollo', name: 'Construir el módulo de inspecciones' },
    ]);
  });

  it('agrupa equipos desde las asignaciones WBS×perfil de una EDT Gemini real, no desde las primeras actividades', () => {
    const teamNames = new Map([
      ['dev', 'Desarrollo'], ['ux', 'UX-UI'], ['qa', 'QA'],
      ['ia', 'IA'], ['rpa', 'RPA'], ['pmo', 'PMO'],
    ]);
    const work = [
      ['Dev', 'Desarrollo 1', 20], ['Dev', 'Desarrollo 2', 20],
      ['Dev', 'Desarrollo 3', 20], ['Dev', 'Desarrollo 4', 20],
      ['UX', 'Diseño de pantallas', 12], ['QA', 'Pruebas de aceptación', 10],
      ['IA', 'Configurar extracción', 8], ['RPA', 'Integrar automatización', 6],
      ['PMO', 'Planificar entregas', 4],
    ] as const;
    const roleIds = Object.fromEntries([...teamNames.keys()].map((id) =>
      [id === 'dev' ? 'Dev' : id.toUpperCase(), id]));
    const modules = [{
      name: 'Módulo único',
      totalHours: 120,
      tasks: work.map(([role, name, hours], index) => ({
        wbs: 'WBS-' + index, role, name, description: '', hours,
      })),
    }];
    const draft = {
      ...version().draft,
      teams: [...teamNames.keys()].map((teamId) => ({
        teamId, collaborators: 1, unit: 'week', duration: 1,
        hoursPerWeek: 40, dedicationPercent: 100,
      })),
      aiPoc: {
        source: 'drive',
        proposal: { roles: work.map(([role]) => ({ role })) },
        roleTeamIds: roleIds,
        edt: {
          schemaVersion: 'kora.quotation.reference-edt.v1',
          source: 'drive', provider: 'gemini', modules, totalHours: 120,
        },
      },
    };
    const model = quotationExportModel({
      ...context(version({ totalHours: 120, draft })), teamNames,
    });
    expect(model.details).toHaveLength(work.length);
    const rows = quotationRepresentativeTeamActivities(model);
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.team)).toEqual(['Desarrollo', 'UX-UI', 'QA', 'IA']);
    expect(rows.every((row) => !row.team.includes(' / '))).toBe(true);
    expect(rows.map((row) => row.name).join(' · ')).toContain('Diseño de pantallas');
    expect(rows.map((row) => row.name).join(' · ')).toContain('Configurar extracción');
  });

  it('lámina 18 y Excel usan exclusiones confirmadas del cuestionario y análisis, sin asumir que todo F05 es exclusión', () => {
    const draft = {
      ...version().draft,
      exclusions: ['Integración SAP fuera de alcance'],
      assumptions: ['La API será proporcionada por el cliente'],
      analysis: { scope: { excluded: ['Aplicación móvil nativa'] } },
      aiPoc: {
        answers: [
          { questionId: 'F05', value: 'No se incluye la migración histórica', usedAssumption: false },
          { questionId: 'F04', value: ['none'], usedAssumption: false },
          { questionId: 'D01', value: 'exclude', usedAssumption: false },
          { questionId: 'D02', value: 'no_definido', usedAssumption: false },
        ],
        dynamicQuestions: [
          { id: 'D01', kind: 'dynamic', question: '¿Debe incluirse la generación de facturas?',
            options: [{ value: 'exclude', label: 'Excluir' }] },
          { id: 'D02', kind: 'dynamic', question: '¿Debe incluirse notificación SMS?',
            options: [{ value: 'no_definido', label: 'No definido' }] },
        ],
      },
    };
    const exclusions = quotationClientExclusions(draft as QuotationVersion['draft']);
    expect(exclusions).toHaveLength(5);
    expect(exclusions.join(' ')).toContain('Integración SAP');
    expect(exclusions.join(' ')).toContain('Aplicación móvil');
    expect(exclusions.join(' ')).toContain('migración histórica');
    expect(exclusions.join(' ')).toContain('UAT');
    expect(exclusions.join(' ')).toContain('generación de facturas');
    expect(exclusions.join(' ')).not.toMatch(/SMS|La API será proporcionada/);
    const v = version({ draft });
    const workbook = buildQuotationWorkbook(context(v));
    const sheetData = workbook.Sheets.Supuestos!;
    expect(Object.values(sheetData).filter((cell) => cell?.v === 'Fuera de alcance')).toHaveLength(5);
    const model = quotationExportModel(context(v));
    const ns = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    const xml = '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
      'xmlns:a="' + ns + '"><p:spTree>' +
      Array.from({ length: 8 }, (_, i) =>
        '<p:sp><p:txBody><a:p><a:r><a:t>Campo ' + i +
        '</a:t></a:r></a:p></p:txBody></p:sp>').join('') + '</p:spTree></p:sld>';
    const patched = patchQuotationSlideXml(xml, 18, model);
    const paragraphs = Array.from(new DOMParser().parseFromString(patched, 'application/xml')
      .getElementsByTagNameNS(ns, 'p'));
    expect(paragraphs[2]?.textContent).toContain('cuestionario');
    expect(paragraphs[3]?.textContent).toContain('Integración SAP');
    expect(paragraphs[6]?.textContent).toContain('2 exclusiones más');
    expect(patched).not.toContain('No definido');
  });

  it('separa las hojas comerciales y fuentes solo cuando hay datos persistidos', () => {
    const v = version({ draft: {
      ...version().draft,
      assumptions: ['API externa disponible'],
      exclusions: ['Soporte postproducción'],
      sourceRefs: ['https://ejemplo.cl/ERS'],
      costs: [{ description: 'Licencia', amount: 12, recurrence: 'once' }],
    } });
    const workbook = buildQuotationWorkbook(context(v));
    expect(workbook.SheetNames).toContain('Supuestos');
    expect(workbook.SheetNames).toContain('Fuentes');
    expect(workbook.Sheets.Supuestos?.B3?.v).toBe('API externa disponible');
    expect(workbook.Sheets.Comercial?.C3?.v).toBe(12);
  });
  it('adapta las barras editables del Gantt a las semanas reales de la cotización', () => {
    const v = version({ draft: {
      ...version().draft, mode: 'phases',
      phases: [{ name: 'Implementación', startWeek: 3, durationWeeks: 2, teamHours: [] }],
    } });
    const model = quotationExportModel(context(v));
    const pns = 'http://schemas.openxmlformats.org/presentationml/2006/main';
    const ans = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    const xml = `<p:sld xmlns:p="${pns}" xmlns:a="${ans}"><p:spTree>` +
      Array.from({ length: 17 }, (_, n) =>
        `<p:sp><p:txBody><a:p><a:r><a:t>Texto ${n}</a:t></a:r></a:p></p:txBody></p:sp>`).join('') +
      [338, 346, 354, 362, 370, 378].map((id) =>
        `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Google Shape;${id};p22"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="2542032" y="1929384"/><a:ext cx="1000000" cy="173736"/></a:xfrm></p:spPr></p:sp>`).join('') +
      '</p:spTree></p:sld>';
    const changed = new DOMParser().parseFromString(patchQuotationSlideXml(xml, 14, model), 'application/xml');
    const shapes = Array.from(changed.getElementsByTagNameNS(pns, 'sp'));
    const bars = shapes.filter((node) => node.getElementsByTagNameNS(pns, 'cNvPr').length);
    expect(bars).toHaveLength(1);
    const x = bars[0]!.getElementsByTagNameNS(ans, 'off')[0]!.getAttribute('x');
    expect(Number(x)).toBeGreaterThan(2542032);
    expect(changed.documentElement.textContent).toContain('Implementación');
  });



  it('usa la suma TOTAL de la versión en la columna combinada de HH, no una tarea individual', () => {
    const v = version({ totalHours: 1592 });
    const doc = '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:spTree>' +
      Array.from({ length: 15 }, (_, i) => '<p:sp><p:txBody><a:p><a:r><a:t>' +
        (i === 7 ? '48 H/H' : 'Texto ' + i) +
        '</a:t></a:r></a:p></p:txBody></p:sp>').join('') + '</p:spTree></p:sld>';
    const output = new DOMParser().parseFromString(
      patchQuotationSlideXml(doc, 11, quotationExportModel(context(v))), 'application/xml');
    const paragraphs = Array.from(output.getElementsByTagNameNS(
      'http://schemas.openxmlformats.org/drawingml/2006/main', 'p'));
    expect(paragraphs[7]?.textContent).toBe('1.592 H/H');
    expect(paragraphs[12]?.textContent).toBe('—');
    expect(paragraphs[13]?.textContent).toBe('—');
  });

  it('mantiene estilos originales de encabezados y elimina datos Zurich en las hojas de EDT', () => {
    const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const xml = '<x:worksheet xmlns:x="' + ns + '"><x:sheetData>' +
      '<x:row r="1"><x:c r="A1" s="4"/></x:row>' +
      '<x:row r="2"><x:c r="A2" s="10"/></x:row>' +
      '<x:row r="4"><x:c r="A4" s="16"/><x:c r="B4" s="16"/></x:row>' +
      '<x:row r="5"><x:c r="A5" s="24"/><x:c r="B5" s="24"/></x:row>' +
      '<x:row r="6"><x:c r="A6" s="24"><x:f>SUM(EDT_Detalle!O5:O49)</x:f>' +
      '<x:v>257</x:v></x:c></x:row></x:sheetData></x:worksheet>';
    const result = new DOMParser().parseFromString(patchStyledTableSheet(xml, {
      title: 'Nuevo proyecto | EDT', subtitle: 'Fuente: Kora',
      headers: ['Actividad','HH'], data: [['Diseñar UI', 24], ['Implementar UI', 40]],
    }), 'application/xml');
    const get = (ref: string) => Array.from(result.getElementsByTagNameNS(ns,'c'))
      .find(c=>c.getAttribute('r')===ref);
    expect(get('A4')?.getAttribute('s')).toBe('16');
    expect(get('B4')?.getAttribute('s')).toBe('16');
    expect(get('A6')?.getAttribute('s')).toBe('24');
    expect(result.documentElement.textContent).toContain('Implementar UI');
    expect(result.documentElement.textContent).not.toContain('257');
    expect(result.getElementsByTagNameNS(ns, 'f')).toHaveLength(0);
  });


});
