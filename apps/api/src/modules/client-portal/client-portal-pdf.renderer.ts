import type { ClientPortalService } from './client-portal.service';

type Detail = Awaited<ReturnType<ClientPortalService['getProject']>>;
type Project = Detail['project'];
type Receipt = Detail['receipts'][number];

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const NAVY = '#0f2a44';
const MUTED = '#64748b';
const GREEN = '#8bc53f';
const LIGHT = '#f2f6f9';
const BORDER = '#dfe6ec';
const WHITE = '#ffffff';

function rgb(color: string): string {
  const hex = color.replace('#', '');
  return [0, 2, 4].map((offset) => (parseInt(hex.slice(offset, offset + 2), 16) / 255).toFixed(3)).join(' ');
}

/** PDF Standard 14 /WinAnsiEncoding. No emite Unicode UTF-8 en el stream. */
function winAnsiHex(text: string): string {
  const punctuation: Record<number, number> = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84,
    0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
    0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
    0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
    0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
    0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
  };
  let hex = '';
  for (const char of text) {
    const value = char.codePointAt(0)!;
    const byte = punctuation[value] ?? (value >= 32 && value <= 255 ? value : 63);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
const safe = (value: unknown): string =>
  value === null || value === undefined || value === '' ? '—' : String(value);
const day = (value: string | null | undefined): string => {
  if (!value) return '—';
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value.slice(0, 10);
};
const number = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('es-CL', { maximumFractionDigits: 2 }) : '—';
const money = (value: number, currency: string) => `${number(value)} ${currency}`;
const truncate = (value: string, max = 190) => value.length > max ? value.slice(0, max - 1) + '…' : value;

/**
 * Generador PDF autocontenido, sin binarios ni servicios externos.
 * Es una proyección de los campos públicos del portal; nunca usa DTO internos.
 */
class PdfPageWriter {
  private pages: string[][] = [[]];
  private commands = this.pages[0]!;
  private y = 0;

  constructor() {
    this.header();
  }

  private page(): void {
    this.commands = [];
    this.pages.push(this.commands);
    this.fill(0, 0, PAGE_WIDTH, 18, NAVY);
    this.text(38, 6, 'KORA  /  SEGUIMIENTO DE PROYECTO', 8, true, WHITE);
    this.y = 36;
  }

  private header(): void {
    this.fill(0, 0, PAGE_WIDTH, 110, NAVY);
    this.fill(0, 106, PAGE_WIDTH, 4, GREEN);
    this.text(38, 21, 'KORA', 20, true, WHITE);
    this.text(38, 52, 'REPORTE DE SEGUIMIENTO PARA CLIENTE', 10, true, '#cbd5e1');
    this.text(38, 77, 'Documento PDF para compartir · Generado desde el portal de clientes', 9, false, WHITE);
    this.y = 129;
  }

  private ensure(height: number): void {
    if (this.y + height > PAGE_HEIGHT - 48) this.page();
  }

  fill(x: number, top: number, width: number, height: number, color: string): void {
    this.commands.push(`${rgb(color)} rg ${x.toFixed(2)} ${(PAGE_HEIGHT - top - height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
  }

  rule(x: number, top: number, x2: number, top2: number, color = BORDER, weight = 1): void {
    this.commands.push(`${rgb(color)} RG ${weight} w ${x.toFixed(2)} ${(PAGE_HEIGHT - top).toFixed(2)} m ${x2.toFixed(2)} ${(PAGE_HEIGHT - top2).toFixed(2)} l S`);
  }

  text(x: number, top: number, message: string, size = 10, bold = false, color = NAVY): void {
    const lines = message.replace(/[\r\n]+/g, ' ').trim();
    if (!lines) return;
    this.commands.push(`BT /${bold ? 'FB' : 'FR'} ${size} Tf ${rgb(color)} rg 1 0 0 1 ${x.toFixed(2)} ${(PAGE_HEIGHT - top - size).toFixed(2)} Tm <${winAnsiHex(lines)}> Tj ET`);
  }

  wrap(message: string, maxWidth: number, size = 10): string[] {
    // Aproximación deliberadamente conservadora para Helvetica, compatible
    // con nombres largos sin cortar el contenido ni salir del margen A4.
    const maxChars = Math.max(13, Math.floor(maxWidth / (size * 0.57)));
    const words = message.replace(/\s+/g, ' ').trim().split(' ');
    const result: string[] = [];
    let line = '';
    for (const word of words) {
      if (!word) continue;
      const next = line ? line + ' ' + word : word;
      if (next.length <= maxChars) { line = next; continue; }
      if (line) result.push(line);
      line = word;
      while (line.length > maxChars) {
        result.push(line.slice(0, maxChars));
        line = line.slice(maxChars);
      }
    }
    if (line) result.push(line);
    return result.length ? result : ['—'];
  }

  paragraph(message: string, maxWidth = 519, size = 10, color = NAVY, bold = false): void {
    for (const line of this.wrap(message, maxWidth, size)) {
      this.ensure(size + 8);
      this.text(38, this.y, line, size, bold, color);
      this.y += size + 6;
    }
  }

  title(title: string, subtitle?: string): void {
    this.ensure(subtitle ? 67 : 47);
    this.text(38, this.y, truncate(title, 130), 20, true);
    this.y += 31;
    if (subtitle) {
      this.paragraph(truncate(subtitle), 519, 9, MUTED);
    }
    this.y += 5;
  }

  section(label: string): void {
    this.ensure(48);
    this.y += 11;
    this.text(38, this.y, label, 13, true);
    this.y += 23;
    this.rule(38, this.y, PAGE_WIDTH - 38, this.y, BORDER);
    this.y += 13;
  }

  row(label: string, value: string, colX = 38, width = 519): void {
    const lines = this.wrap(value, width - 190, 10);
    const rowHeight = Math.max(29, lines.length * 14 + 12);
    this.ensure(rowHeight);
    this.text(colX + 9, this.y + 7, label, 9, false, MUTED);
    lines.forEach((line, idx) => this.text(colX + 180, this.y + 7 + idx * 14, line, 10, true));
    this.y += rowHeight;
    this.rule(colX, this.y, colX + width, this.y, BORDER, 0.5);
  }

  kpis(items: Array<{ label: string; value: string; sub?: string; accent?: string }>): void {
    const boxWidth = 121;
    const gap = 11.6;
    const x0 = 38;
    this.ensure(99);
    for (let i = 0; i < Math.min(4, items.length); i++) {
      const item = items[i]!;
      const x = x0 + i * (boxWidth + gap);
      this.fill(x, this.y, boxWidth, 90, LIGHT);
      this.fill(x, this.y, boxWidth, 3, item.accent ?? NAVY);
      this.text(x + 8, this.y + 12, truncate(item.label, 21), 8, true, MUTED);
      const valueLines = this.wrap(item.value, boxWidth - 16, 13).slice(0, 2);
      valueLines.forEach((v, idx) => this.text(x + 8, this.y + 30 + idx * 15, v, 13, true, item.accent ?? NAVY));
      if (item.sub) this.text(x + 8, this.y + 73, truncate(item.sub, 21), 7, false, MUTED);
    }
    this.y += 105;
  }

  progress(actual: number | null, expected: number | null): void {
    this.ensure(78);
    this.text(38, this.y, `Avance real: ${number(actual)}%`, 12, true);
    this.text(330, this.y, `Planificado: ${number(expected)}%`, 10, false, MUTED);
    this.y += 29;
    this.fill(38, this.y, 519, 12, BORDER);
    if (actual !== null) this.fill(38, this.y, 519 * Math.min(100, Math.max(0, actual)) / 100, 12, GREEN);
    if (expected !== null) {
      const xx = 38 + 519 * Math.min(100, Math.max(0, expected)) / 100;
      this.rule(xx, this.y - 5, xx, this.y + 17, NAVY, 2);
    }
    this.y += 27;
  }

  delivery(name: string, phase: string, date: string, status: string): void {
    const lines = this.wrap(name, 310, 10);
    const height = Math.max(48, lines.length * 14 + 25);
    this.ensure(height + 4);
    this.fill(38, this.y, 519, height, LIGHT);
    this.fill(38, this.y, 3, height, status.includes('OK') ? GREEN : status.includes('revisión') ? '#e5aa37' : NAVY);
    lines.forEach((line, index) => this.text(48, this.y + 7 + index * 14, line, 10, true));
    this.text(48, this.y + height - 15, truncate(phase, 65), 8, false, MUTED);
    this.text(395, this.y + 8, day(date), 10, true);
    this.text(395, this.y + 24, truncate(status, 27), 8, false, MUTED);
    this.y += height + 6;
  }

  finish(): Buffer {
    for (let i = 0; i < this.pages.length; i++) {
      const commands = this.pages[i]!;
      commands.push(`BT /FR 8 Tf ${rgb(MUTED)} rg 1 0 0 1 38 20 Tm <${winAnsiHex('Kora · Vista externa de proyectos')}> Tj ET`);
      commands.push(`BT /FR 8 Tf ${rgb(MUTED)} rg 1 0 0 1 505 20 Tm <${winAnsiHex(`${i + 1} / ${this.pages.length}`)}> Tj ET`);
    }
    const objects: string[] = [];
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    const pageRefs = this.pages.map((_, idx) => `${5 + idx * 2} 0 R`).join(' ');
    objects.push(`<< /Type /Pages /Kids [${pageRefs}] /Count ${this.pages.length} >>`);
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    for (let i = 0; i < this.pages.length; i++) {
      const stream = this.pages[i]!.join('\n') + '\n';
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /FR 3 0 R /FB 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
      objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`);
    }
    let output = '%PDF-1.4\n%KORA\n';
    const offsets = [0];
    for (const [index, object] of objects.entries()) {
      offsets.push(Buffer.byteLength(output, 'latin1'));
      output += `${index + 1} 0 obj\n${object}\nendobj\n`;
    }
    const xref = Buffer.byteLength(output, 'latin1');
    output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets.slice(1)) output += `${String(offset).padStart(10, '0')} 00000 n \n`;
    output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(output, 'latin1');
  }
}

/** Descargable y compartible: los dos botones usan exactamente este documento. */
export function renderClientPortalPdf(detail: Detail): Buffer {
  const project: Project = detail.project;
  const receipts = new Map<string, Receipt>(detail.receipts.map((receipt) => [receipt.deliveryId, receipt]));
  const pdf = new PdfPageWriter();
  pdf.title(project.name, `Cliente: ${safe(project.client?.companyName)} · Estado: ${safe(project.status)}`);
  pdf.section('Información del proyecto');
  pdf.row('Responsable Kabeli', safe(project.commercialManager?.fullName ?? project.leader?.fullName));
  pdf.row('Contacto cliente', safe(project.primaryContact?.name));
  pdf.row('Fecha de inicio', day(project.startDate));
  pdf.row('Fecha de término', day(project.endDate));
  pdf.row('Última actualización', project.updatedAt ? day(project.updatedAt) : '—');

  pdf.section('Facturación');
  const currency = project.contractCurrency;
  const total = project.contractAmount ?? project.paymentMilestones.reduce((sum, milestone) => sum + milestone.amount, 0);
  const paid = project.paymentMilestones.filter((milestone) => milestone.status === 'paid')
    .reduce((sum, milestone) => sum + milestone.amount, 0);
  const invoiced = project.paymentMilestones.filter((milestone) => milestone.status === 'invoiced')
    .reduce((sum, milestone) => sum + milestone.amount, 0);
  pdf.kpis([
    { label: 'Total contrato', value: money(total, currency) },
    { label: 'Pagado', value: money(paid, currency), accent: '#31945a' },
    { label: 'Facturado', value: money(invoiced, currency), accent: '#c58b21' },
    { label: 'Por facturar', value: money(Math.max(0, total - paid - invoiced), currency) },
  ]);
  if (project.paymentMilestones.length === 0) pdf.paragraph('No hay tramos de facturación registrados.', 519, 9, MUTED);
  for (const milestone of project.paymentMilestones) {
    pdf.row(truncate(milestone.name, 26),
      `${money(milestone.amount, currency)} · ${milestone.status === 'paid' ? 'Pagado' : milestone.status === 'invoiced' ? 'Facturado' : 'Pendiente'} · Factura: ${safe(milestone.invoiceNumber)}`);
  }

  pdf.section('Avance del proyecto');
  pdf.progress(project.progress.actual, project.progress.expected);
  pdf.section('Horas y avance');
  pdf.kpis([
    { label: 'HH estimadas', value: number(project.soldHours) },
    { label: 'HH utilizadas', value: number(project.usedHours) },
    { label: 'Avance real', value: project.progress.actual === null ? '—' : `${number(project.progress.actual)}%` },
    { label: 'Término', value: day(project.endDate) },
  ]);

  pdf.section('Entregas comprometidas');
  const deliveries = project.modules.flatMap((phase) => phase.deliveries.map((delivery) => ({
    phase: phase.name, ...delivery,
  }))).sort((a, b) => a.estimatedDate.localeCompare(b.estimatedDate));
  if (!deliveries.length) pdf.paragraph('Aún no existen entregas comprometidas.', 519, 9, MUTED);
  for (const delivery of deliveries) {
    const receipt = receipts.get(delivery.id);
    const state = receipt ? `OK recibido ${day(receipt.receivedAt)}`
      : delivery.status === 'approved' ? 'Entregada para revisión' : 'Comprometida';
    pdf.delivery(delivery.name ?? 'Entrega', delivery.phase, delivery.estimatedDate, state);
  }

  if (project.impactBeforeHours !== null || project.impactAfterHours !== null) {
    pdf.section('Impacto en el negocio');
    pdf.row('Antes', `${number(project.impactBeforeHours)} horas · ${safe(project.impactBeforePeople)} personas · ${safe(project.impactBeforeModality)}`);
    pdf.row('Después', `${number(project.impactAfterHours)} horas · ${safe(project.impactAfterPeople)} personas · ${safe(project.impactAfterModality)}`);
    if (project.impactBeforeHours && project.impactAfterHours !== null)
      pdf.row('Variación', `${Math.round((project.impactAfterHours - project.impactBeforeHours) / project.impactBeforeHours * 100)}% del tiempo de proceso`);
  }

  if (detail.receipts.length) {
    pdf.section('Bitácora de recepción');
    for (const receipt of detail.receipts) {
      const delivery = deliveries.find((item) => item.id === receipt.deliveryId);
      pdf.paragraph(`${day(receipt.receivedAt)} · ${safe(delivery?.name)} · Recibido por ${receipt.receivedByName}`, 519, 9);
    }
  }
  return pdf.finish();
}
