import * as XLSX from 'xlsx';
import type { quotationExportModel } from './quotation-export';

type Model = ReturnType<typeof quotationExportModel>;
type CellValue = string | number | null | undefined;
type RowValues = CellValue[];
type TemplateArchive = ReturnType<typeof XLSX.CFB.read>;
type SheetSpec = { title: string; subtitle: string; headers: string[]; data: RowValues[] };
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const PREFIX = 'x:';
const parse = (s: string): Document => {
  const doc = new DOMParser().parseFromString(s, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML de plantilla Excel inválido.');
  return doc;
};
const children = (node: Element, name: string): Element[] =>
  Array.from(node.children).filter((el) => el.localName === name);
const el = (doc: Document, name: string): Element => doc.createElementNS(NS, PREFIX + name);
const serial = (doc: Document) => new XMLSerializer().serializeToString(doc);
const clean = (text: unknown): string => {
  const value = String(text ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
};
const col = (n: number): string => {
  let index = n + 1, out = '';
  while (index > 0) { index--; out = String.fromCharCode(65 + index % 26) + out; index = Math.floor(index / 26); }
  return out;
};
const cellIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.match(/^[A-Z]+/)?.[0] ?? '') n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};
const findFile = (cfb: TemplateArchive, path: string) => {
  const i = cfb.FullPaths.findIndex((p: string) => p.toLowerCase().endsWith('/' + path.toLowerCase()));
  return i < 0 ? undefined : cfb.FileIndex[i];
};
const readXml = (cfb: XLSX.CFB.CFB, path: string) => {
  const file = findFile(cfb, path);
  if (!file?.content) throw new Error('Falta ' + path + ' en el Excel corporativo.');
  return parse(new TextDecoder().decode(new Uint8Array(file.content)));
};
const writeXml = (cfb: XLSX.CFB.CFB, path: string, doc: Document) => {
  const file = findFile(cfb, path);
  if (!file) throw new Error('No se pudo escribir ' + path);
  file.content = new TextEncoder().encode(serial(doc));
  file.size = file.content.length;
};
function setCell(row: Element, index: number, value: CellValue, style?: string): void {
  const doc = row.ownerDocument;
  const rowNum = row.getAttribute('r')!;
  const ref = col(index) + rowNum;
  let target = children(row, 'c').find((c) => c.getAttribute('r') === ref);
  if (!target) {
    target = el(doc, 'c'); target.setAttribute('r', ref);
    if (style) target.setAttribute('s', style);
    const next = children(row, 'c').find((c) => cellIndex(c.getAttribute('r') ?? '') > index);
    row.insertBefore(target, next ?? null);
  }
  if (style) target.setAttribute('s', style);
  target.removeAttribute('t');
  for (const inner of Array.from(target.children)) target.removeChild(inner);
  if (value === null || value === undefined || value === '') return;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const v = el(doc, 'v'); v.textContent = String(value); target.appendChild(v);
  } else {
    target.setAttribute('t', 'inlineStr');
    const inline = el(doc, 'is'), t = el(doc, 't');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = clean(value);
    inline.appendChild(t); target.appendChild(inline);
  }
}
function clearRow(row: Element): void {
  for (const c of children(row, 'c')) {
    c.removeAttribute('t');
    for (const el of Array.from(c.children)) c.removeChild(el);
  }
}
function writeRow(row: Element, values: RowValues, styles?: Record<number,string>): void {
  for (let i = 0; i < values.length; i++) setCell(row, i, values[i], styles?.[i]);
}
function templateRows(sheet: Document) {
  const data = sheet.getElementsByTagNameNS(NS, 'sheetData')[0];
  if (!data) throw new Error('Plantilla Excel sin sheetData.');
  return { data, rows: children(data, 'row') };
}
function cloneRow(source: Element, targetNumber: number): Element {
  const row = source.cloneNode(true) as Element;
  row.setAttribute('r', String(targetNumber));
  for (const c of children(row, 'c')) {
    const old = c.getAttribute('r') ?? '';
    c.setAttribute('r', (old.match(/^[A-Z]+/)?.[0] ?? 'A') + targetNumber);
  }
  clearRow(row);
  return row;
}
/** Conserva el OOXML corporativo: estilos, colores de header, anchos, márgenes,
 * formatos, merges y distribución. Solo se sustituyen los datos de Zurich.
 */
export function patchStyledTableSheet(xml: string, spec: SheetSpec): string {
  const doc = parse(xml);
  const { data, rows: original } = templateRows(doc);
  const byRow = (n: number) => original.find((r) => Number(r.getAttribute('r')) === n);
  const title = byRow(1), subtitle = byRow(2), header = byRow(4), sample = byRow(5);
  if (!title || !subtitle || !header || !sample) throw new Error('Formato de hoja corporativa no reconocido.');
  const rows: Element[] = [];
  for (const [num, values] of [[1,[spec.title]],[2,[spec.subtitle]],[4,spec.headers]] as [number,RowValues][]) {
    const row = cloneRow(byRow(num)!, num);
    writeRow(row, values ?? []);
    rows.push(row);
  }
  for (let i = 0; i < spec.data.length; i++) {
    const row = cloneRow(sample, i + 5);
    writeRow(row, spec.data[i]);
    rows.push(row);
  }
  data.replaceChildren(...rows);
  // Antiguas fórmulas de Zurich, rangos fijos y reglas condicionales se
  // eliminan al reemplazar las filas. Evitar rangos obsoletos.
  for (const section of Array.from(doc.documentElement.children)) {
    if (['conditionalFormatting', 'autoFilter', 'dataValidations', 'extLst'].includes(section.localName)) {
      section.remove();
    }
  }
  return serial(doc);
}
function patchSummary(xml: string, model: Model): string {
  const doc = parse(xml);
  const { rows } = templateRows(doc);
  for (const row of rows) clearRow(row);
  const get = (r: number) => {
    const row = rows.find((x) => Number(x.getAttribute('r')) === r);
    if (!row) throw new Error('Fila ' + r + ' no existe en Resumen corporativo.');
    return row;
  };
  const set = (r: number, c: number, value: CellValue, style?: string) =>
    setCell(get(r), c, value, style);
  const { version, draft, details } = model;
  const groups = new Map<string, number>(), modules = new Map<string, number>();
  if (details.length) {
    for (const d of details) {
      groups.set(d.role, (groups.get(d.role) ?? 0) + d.hours);
      modules.set(d.module, (modules.get(d.module) ?? 0) + d.hours);
    }
  } else for (const t of draft.teams) {
    const hours = draft.mode === 'phases'
      ? draft.phases.reduce((sum,p) => sum + (p.teamHours.find((r) => r.teamId === t.teamId)?.hours ?? 0),0)
      : t.collaborators * (t.unit === 'day' ? t.duration / 5 : t.duration) *
        t.hoursPerWeek * t.dedicationPercent / 100;
    groups.set(model.team(t.teamId), (groups.get(model.team(t.teamId)) ?? 0) + hours);
  }
  const groupDisplay = [...groups].sort((a,b) => b[1] - a[1]);
  const moduleDisplay = [...modules].sort((a,b) => b[1] - a[1]);
  const top = (rows: [string,number][], limit: number): [string,number][] =>
    rows.length <= limit ? rows : [
      ...rows.slice(0, limit - 1),
      ['Otros (ver detalle)', rows.slice(limit-1).reduce((a,r) => a+r[1],0)],
    ];
  const reserve = draft.aiPoc?.edt?.reserveHours ?? 0;
  const total = version.totalHours;
  set(1, 0, model.projectName + ' | Estimación de proyecto');
  set(2, 0, String(model.scope).slice(0, 230));
  for (const [cell, text] of [[0, 'HH cotizadas'],[3, 'Reserva IA'],[6, 'HH + reserva'],
    [9, 'Días hábiles'],[11, 'Semanas relativas']] as [number,string][]) {
    set(4, cell, text);
  }
  set(5, 0, total); set(5, 3, reserve);
  set(5, 6, total + reserve);
  set(5, 9, null); // Sin planificación diaria, no inventar días hábiles.
  set(5, 11, model.weeks || null);
  set(8, 0, 'Perfil / equipo'); set(8, 1, 'HH'); set(8, 2, '% total');
  set(8, 4, 'Módulo'); set(8, 5, 'HH base'); set(8, 6, '% total');
  for (let i = 0; i < 7; i++) {
    const role = top(groupDisplay, 7)[i], mod = top(moduleDisplay, 7)[i];
    set(9+i, 0, role?.[0]); set(9+i, 1, role?.[1]);
    set(9+i, 2, role && total > 0 ? role[1]/total : null, '48');
    set(9+i, 4, mod?.[0]); set(9+i, 5, mod?.[1]);
    set(9+i, 6, mod && total > 0 ? mod[1]/total : null, '48');
  }
  set(18, 0, 'Alcance: ' + String(model.scope).slice(0, 290));
  set(19, 0, 'Fuera de alcance: ' + (draft.exclusions.join('; ') || 'Sin exclusiones específicas registradas.').slice(0, 275));
  set(20, 0, 'Plan: ' + (model.weeks ? model.weeks + ' semanas relativas; ' : '') +
    'fases y HH sujetas a la versión de cotización seleccionada.');
  set(21, 0, 'Supuestos: ' + (draft.assumptions.join('; ') || 'Sin supuestos adicionales registrados.').slice(0, 270));
  set(22, 0, 'Reserva técnica: ' + reserve + ' HH registradas por separado. No duplicar esfuerzo comercial.');
  return serial(doc);
}
function workbookNames(cfb: XLSX.CFB.CFB, keep: Set<string>): void {
  const work = readXml(cfb, 'xl/workbook.xml');
  const rels = readXml(cfb, 'xl/_rels/workbook.xml.rels');
  const list = work.getElementsByTagNameNS(NS, 'sheets')[0];
  if (!list) throw new Error('Libro corporativo sin hojas.');
  const removed = new Set<string>();
  for (const item of Array.from(list.children)) {
    const old = item.getAttribute('name') ?? '';
    const name = old === 'Pendientes' ? 'Comercial' : old;
    if (!keep.has(name)) {
      removed.add(item.getAttributeNS(REL,'id') ?? '');
      item.remove();
    } else {
      item.setAttribute('name', name);
      item.removeAttribute('state');
    }
  }
  for (const relation of Array.from(rels.getElementsByTagNameNS(PKG_REL,'Relationship'))) {
    if (removed.has(relation.getAttribute('Id') ?? '')) relation.remove();
  }
  // Resumen se presenta primero, como en una EDT ejecutiva.
  const summary = Array.from(list.children).find((s) => s.getAttribute('name') === 'Resumen');
  if (summary) list.insertBefore(summary, list.firstChild);
  const defined = work.getElementsByTagNameNS(NS,'definedNames')[0];
  defined?.remove(); // zonas impresas antiguas de Zurich
  const calc = work.getElementsByTagNameNS(NS,'calcPr')[0];
  if (calc) calc.setAttribute('fullCalcOnLoad','1');
  writeXml(cfb,'xl/workbook.xml',work);
  writeXml(cfb,'xl/_rels/workbook.xml.rels',rels);
}
const round = (n: number) => Math.round(n*100)/100;
const grouped = (items: [string,number][]) => {
  const m = new Map<string,number>();
  for (const [key,hh] of items) m.set(key,(m.get(key) ?? 0)+hh);
  return [...m].map(([name,hours]) => [name,round(hours)] as [string,number]);
};
function buildSpecs(model: Model): Map<string, SheetSpec> {
  const { draft, details, phases, weekly, version } = model;
  const out = new Map<string,SheetSpec>();
  const base = model.projectName + ' | ';
  const roles = [...new Set(details.map((row)=>row.role))];
  const roleSlots = roles.length > 5
    ? [...roles.slice(0,4),'Otros perfiles'] : roles;
  const roleColumn = (role: string) => {
    const index = roleSlots.indexOf(role);
    return index >= 0 ? index : 4;
  };
  const modules = grouped(details.map((row) => [row.module,row.hours]));
  const actualTotal = round(details.reduce((sum,row)=>sum+row.hours,0));
  if (details.length && Math.abs(actualTotal-version.totalHours)>0.011) {
    throw new Error('No se exporta: el total de la EDT vigente no coincide con las HH de la versión.');
  }
  if (details.length) {
    const list: RowValues[] = details.map((d)=>{
      const roleHours = [0,0,0,0,0];
      const index = roleColumn(d.role);
      roleHours[index] = (roleHours[index] ?? 0) + d.hours;
      const phase = phases.find((phase)=>phase.code===d.stageCode);
      return [d.wbs,d.stageCode ?? '',phase?.name ?? '',d.module,'',d.name,
        d.references.join('; '),d.role,model.team(d.teamId),...roleHours,
        d.hours,d.description || ''];
    });
    out.set('EDT_Detalle',{
      title:base+'EDT de actividades',subtitle:'Actividades WBS × perfil; HH de la cotización vigente, sin duplicar esfuerzo.',
      headers:['WBS','Tramo','Fase','Módulo','Submódulo','Actividad / entregable','Fuente',
        'Perfil','Equipo Kora',...Array.from({length:5},(_,i)=>roleSlots[i]??'—'),'HH base','Descripción específica'],
      data:list,
    });
    out.set('Resumen_Modulos',{
      title:base+'Distribución de módulos',
      subtitle:'Distribución real de horas por perfil y módulo. Totales tomados de EDT.',
      headers:['Módulo','Actividades',...Array.from({length:5},(_,i)=>roleSlots[i]??'—'),
        'HH base','% total'],
      data:modules.map(([module,hours])=>{
        const rows=details.filter(d=>d.module===module);
        const totals=[0,0,0,0,0];
        for(const r of rows)totals[roleColumn(r.role)]+=r.hours;
        return [module,rows.length,...totals,round(hours),version.totalHours?hours/version.totalHours:0];
      }),
    });
  }
  const groups = new Map<string,{count:number;hours:number;id:string|null}>();
  if(details.length) for(const d of details) {
    const key=d.teamId ?? 'Perfil '+d.role;
    const existing=groups.get(key)??{count:1,hours:0,id:d.teamId};
    existing.hours +=d.hours;
    const fromTeam=draft.teams.find(t=>t.teamId===d.teamId);
    if(fromTeam)existing.count=fromTeam.collaborators;
    groups.set(key,existing);
  } else for(const team of draft.teams) {
    const hh = draft.mode==='phases' ?
      draft.phases.reduce((a,p)=>a+(p.teamHours.find(t=>t.teamId===team.teamId)?.hours??0),0) :
      team.collaborators*(team.unit==='day'?team.duration/5:team.duration)*
      team.hoursPerWeek*team.dedicationPercent/100;
    groups.set(team.teamId,{id:team.teamId,count:team.collaborators,hours:hh});
  }
  const teamRows=[...groups].map(([key,g])=>{
    const hh=round(g.hours),count=g.count || 1;
    return [g.id?model.team(g.id):key,count,hh,round(hh/count),
      round(hh/count/8),version.totalHours?hh/version.totalHours:0,
      'Referencia de estimación. La asignación operativa se gestiona en Kora.',
      'Incluido'] as RowValues;
  });
  if(teamRows.length)out.set('Carga_Equipo',{
    title:base+'Carga por equipo',subtitle:'Distribución por equipo y capacidad referencial; sin asignación de personas nominales.',
    headers:['Equipo','Cantidad','HH base','HH/persona','Días-persona (8h)','Participación','Responsabilidad','Estado'],
    data:teamRows,
  });
  if(phases.length)out.set('Tramos',{
    title:base+'Roadmap por fases',subtitle:'Semanas relativas desde el inicio del proyecto; sin fechas contractuales asumidas.',
    headers:['Tramo','Sección del proyecto','Entregable / alcance','Semana inicio','Semana fin','HH base',
      'Duración sem.','Equipos','Estado','Referencia'],
    data:phases.map((p)=>{
      const matching=details.filter(d=>d.stageCode===p.code);
      const hh=details.length?matching.reduce((sum,d)=>sum+d.hours,0):
        draft.phases.find(x=>x.name===p.name)?.teamHours.reduce((a,x)=>a+x.hours,0)??0;
      const teams=[...new Set(matching.map(d=>model.team(d.teamId)))].join(', ');
      return [p.code,p.name,p.name,p.startWeek,p.startWeek+p.durationWeeks-1,
        round(hh),p.durationWeeks,teams||'Por asignar','Planificada','EDT / cotización'];
    }),
  });
  if(weekly?.rows.length){
    const teamKeys=[...new Set(weekly.rows.map(r=>r.teamKey))];
    const cols=teamKeys.length>5?[...teamKeys.slice(0,4),'Otros equipos']:teamKeys;
    const nameForKey=(key:string)=>key.startsWith('profile:')
      ? key.slice('profile:'.length)+' (sin equipo)'
      : model.team(key);
    const weeks=Array.from({length:Math.max(0,model.weeks)},(_,i)=>i+1);
    out.set('Roadmap_Semanal',{
      title:base+'Carga semanal',subtitle:'HH distribuidas semanalmente según la planificación referencial de Kora.',
      headers:['Semana','Día inicial','Día final',...Array.from({length:5},(_,i)=>
        cols[i]?(cols[i]==='Otros equipos'?'Otros equipos':nameForKey(cols[i])):'—'),'Fases activas'],
      data:weeks.map((week)=>{
        const hours=[0,0,0,0,0];
        for(const r of weekly.rows){
          let i=cols.indexOf(r.teamKey);
          if(i<0&&cols.includes('Otros equipos'))i=4;
          if(i>=0)hours[i]=(hours[i] ?? 0)+(r.weeklyHours.get(week)??0);
        }
        const active=phases.filter(p=>p.startWeek<=week&&p.startWeek+p.durationWeeks>week)
          .map(p=>p.code).join(', ');
        return ['S'+String(week).padStart(2,'0'),(week-1)*5+1,week*5,
          ...hours.map(round),active];
      }),
    });
  }
  const assumptions=[...draft.assumptions.map(text=>['Supuesto','Declarado en cotización',text] as RowValues),
    ...draft.exclusions.map(text=>['Exclusión','Fuera de alcance',text] as RowValues)];
  if(assumptions.length)out.set('Supuestos',{
    title:base+'Supuestos y exclusiones',subtitle:'Condiciones declaradas en esta versión de la cotización.',
    headers:['Tipo','Origen','Criterio / condición'],data:assumptions,
  });
  const sources=[...draft.sourceRefs.map((ref,i)=>['F'+String(i+1).padStart(2,'0'),ref,'Referencia comercial'] as RowValues),
    ...(draft.aiPoc?.edt?.modules??[]).flatMap(m=>m.tasks.flatMap(t=>
      (t.referenceIds??[]).map(ref=>['WBS '+t.wbs,ref,'EDT / '+m.name] as RowValues)))];
  if(sources.length)out.set('Fuentes',{
    title:base+'Fuentes de la cotización',subtitle:'Fuentes declaradas. No se inventa evidencia documental.',
    headers:['ID','Fuente','Uso de la fuente'],data:sources,
  });
  out.set('Comercial',{
    title:base+'Condiciones comerciales',
    subtitle:'Importes y pagos de la versión seleccionada; exportar no envía ni aprueba la cotización.',
    headers:['Tipo','Concepto','Monto / porcentaje','Detalle'],
    data:[
      ['Resumen','HH',version.totalHours,'Horas cotizadas'],
      ['Resumen','Tarifa por HH',version.hourlyRate??'No definido',version.currency],
      ['Resumen','Neto',version.netAmount??'No definido',version.currency],
      ['Resumen','Total',version.totalAmount??'No definido',version.currency],
      ...draft.costs.map(c=>['Costo externo',c.description,c.amount,c.recurrence]),
      ...draft.paymentPlan.map(p=>['Plan de pago',p.name,p.percent+'%',p.trigger]),
    ],
  });
  return out;
}
export function patchFormattedQuotationTemplate(
  bytes: Uint8Array, model: Model,
): Uint8Array {
  if (bytes.length<8000)throw new Error('La plantilla Excel recibida no corresponde al archivo corporativo.');
  const cfb=XLSX.CFB.read(bytes,{type:'buffer'});
  const specs=buildSpecs(model);
  const keep=new Set(['Resumen',...specs.keys()]);
  const sheetNumbers:Record<string,number> = {
    Supuestos:1,Fuentes:2,EDT_Detalle:3,Plan_Diario:4,
    Tramos:5,Resumen_Modulos:6,Carga_Equipo:7,Roadmap_Semanal:8,
    Trazabilidad:9,Hitos:10,Comercial:11,Auditoria:12,Resumen:13,
  };
  for(const [name,num] of Object.entries(sheetNumbers)){
    const path='xl/worksheets/sheet'+num+'.xml';
    const xml=serial(readXml(cfb,path));
    if(name==='Resumen'){
      writeXml(cfb,path,parse(patchSummary(xml,model)));
    }else if(keep.has(name)){
      writeXml(cfb,path,parse(patchStyledTableSheet(xml,specs.get(name)!)));
    }else{
      // Elimina el contenido de Zurich incluso de los XML huérfanos; no
      // conservar datos de otros clientes dentro del ZIP.
      const doc=parse(xml);
      doc.getElementsByTagNameNS(NS,'sheetData')[0]?.replaceChildren();
      writeXml(cfb,path,doc);
    }
  }
  workbookNames(cfb,keep);
  // Todas las celdas exportadas son inlineStr o numéricas; el diccionario
  // histórico ya no debe contener documentos ni personas de Zurich.
  const shared=findFile(cfb,'xl/sharedStrings.xml');
  if(shared){
    const value='<?xml version="1.0" encoding="UTF-8"?><sst xmlns="'+NS+'" count="0" uniqueCount="0"/>';
    shared.content=new TextEncoder().encode(value);
    shared.size=shared.content.length;
  }
  const output=XLSX.CFB.write(cfb,{fileType:'zip',type:'array'});
  return new Uint8Array(output);
}
