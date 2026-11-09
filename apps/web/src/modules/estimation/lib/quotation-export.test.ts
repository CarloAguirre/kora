import { describe, expect, it } from 'vitest';
import type { QuotationVersion } from '@kora/contracts';
import { buildQuotationWorkbook, patchQuotationSlideXml, quotationExportModel } from './quotation-export';

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


});
