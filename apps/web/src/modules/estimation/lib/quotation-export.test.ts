import { describe, expect, it } from 'vitest';
import type { QuotationVersion } from '@kora/contracts';
import { buildQuotationWorkbook, patchQuotationSlideXml, quotationClientBrief, quotationExportModel } from './quotation-export';
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
    expect(workbook.Sheets.Resumen?.B13?.v).toBe('No definido');
    expect(workbook.SheetNames).not.toContain('Auditoria');
    expect(workbook.SheetNames).not.toContain('EDT_Detalle');
    expect(workbook.SheetNames).not.toContain('Plan_Diario');
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
