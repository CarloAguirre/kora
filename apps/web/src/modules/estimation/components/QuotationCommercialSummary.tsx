import type { ReactNode } from 'react';
import type { QuotationDraftData, QuotationVersion } from '@kora/contracts';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Badge } from '@/shared/components/ui/Badge';
import styles from './QuotationCommercialSummary.module.css';

type TeamHours = { teamId: string; name: string; hours: number; tone: string };
const fmt = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const fmtMoney = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 4 });
const round = (n: number, places: number) =>
  Math.round((n + Number.EPSILON) * 10 ** places) / 10 ** places;

/** Vista previa del mismo cálculo de quotation-math.ts; el servidor es autoritativo al guardar. */
function preview(draft: QuotationDraftData, rate: number | null, tax: 'iva19' | 'igv18' | 'exempt') {
  const active = new Set(draft.teams.map((row) => row.teamId));
  const byTeam = draft.teams.map((team) => ({
    teamId: team.teamId,
    hours: draft.mode === 'team'
      ? team.collaborators * (team.unit === 'day' ? team.duration / 5 : team.duration) *
        team.hoursPerWeek * team.dedicationPercent / 100
      : draft.phases.reduce((sum, phase) =>
        sum + phase.teamHours.filter((row) => row.teamId === team.teamId && active.has(row.teamId))
          .reduce((acc, row) => acc + row.hours, 0), 0),
  }));
  const totalHours = round(byTeam.reduce((sum, row) => sum + row.hours, 0), 2);
  if (rate === null) return { totalHours, netAmount: null, totalAmount: null, byTeam };
  const once = draft.costs.filter((row) => row.recurrence === 'once')
    .reduce((sum, row) => sum + row.amount, 0);
  const netAmount = round(totalHours * rate + once, 4);
  return {
    totalHours,
    netAmount,
    totalAmount: round(netAmount * (tax === 'iva19' ? 1.19 : tax === 'igv18' ? 1.18 : 1), 4),
    byTeam,
  };
}
function teamTone(name: string) {
  const normalized = name.toLocaleLowerCase('es');
  if (normalized.includes('desarrollo') || normalized.includes('dev')) return 'dev';
  if (normalized.includes('qa') || normalized.includes('calidad')) return 'qa';
  if (normalized.includes('ux') || normalized.includes('diseño')) return 'ux';
  if (normalized.includes('pmo') || normalized.includes('gestión')) return 'pmo';
  if (normalized.includes('rpa') || normalized.includes('automatiza')) return 'rpa';
  if (normalized.includes('ia') || normalized.includes('inteligencia')) return 'ai';
  return 'other';
}
function durationLabel(draft: QuotationDraftData) {
  if (draft.mode === 'phases') {
    if (draft.phases.length === 0) return 'Sin fases definidas';
    const lastWeek = Math.max(...draft.phases.map((p) => p.startWeek + p.durationWeeks - 1));
    return lastWeek + ' semanas · ' + draft.phases.length + ' fase' + (draft.phases.length === 1 ? '' : 's');
  }
  if (draft.teams.length === 0) return 'Sin equipos definidos';
  const weeks = Math.max(...draft.teams.map((t) => t.unit === 'day' ? t.duration / 5 : t.duration));
  return fmt(weeks) + ' semanas · por equipo';
}

export function QuotationCommercialSummary({
  version, draft, hourlyRate, currency, tax, teamNames, editable, dirty, saving, onSave, actions,
}: {
  version: QuotationVersion | null;
  draft: QuotationDraftData | null;
  hourlyRate: number | null;
  currency: 'UF' | 'CLP' | 'USD';
  tax: 'iva19' | 'igv18' | 'exempt';
  teamNames: ReadonlyMap<string, string>;
  editable: boolean;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  actions?: ReactNode;
}) {
  if (!version || !draft) return <Card><h2>Resumen comercial</h2><p>Selecciona una versión.</p></Card>;
  const numbers = preview(draft, hourlyRate, tax);
  const edt = draft.aiPoc?.edt;
  const referenceOnly = Boolean(edt && (draft.mode !== 'phases' || draft.phases.length === 0));
  // La EDT precede a la asignación comercial: nunca contar sus HH como vendidas
  // hasta proyectar y guardar los equipos de Kora.
  const hoursShown = referenceOnly && edt ? edt.totalHours : numbers.totalHours;
  const commercialRows: TeamHours[] = numbers.byTeam.filter((row) => row.hours > 0)
    .map((row) => {
      const name = teamNames.get(row.teamId) ?? 'Equipo no disponible';
      return { ...row, name, tone: teamTone(name) };
    });
  const referenceRows: TeamHours[] = (draft.aiPoc?.proposal.roles ?? []).map((role) => ({
    teamId: 'profile:' + role.role,
    name: role.role,
    hours: role.totalHours,
    tone: teamTone(role.role),
  })).filter((role) => role.hours > 0);
  const rows = referenceOnly ? referenceRows : commercialRows;
  const aiHours = draft.aiPoc?.proposal.totalHours ?? null;
  const duration = referenceOnly && edt
    ? edt.schemaVersion === 'kora.quotation.reference-edt.v2'
      ? Math.max(1, ...(edt.stages ?? []).map((p) => p.startWeek + p.durationWeeks - 1)) +
        ' semanas · ' + (edt.stages?.length ?? 0) + ' tramos propuestos'
      : edt.modules.length + ' módulos referenciales'
    : durationLabel(draft);
  const displayAmount = (amount: number | null) =>
    amount === null ? '—' : fmtMoney(amount) + ' ' + currency;

  return (
    <Card>
      <section className={styles.summary} aria-label="Resumen comercial de cotización">
        <div className={styles.topLine}>
          <span>{referenceOnly ? 'Horas propuestas por Gemini' : 'Horas totales del proyecto'}</span>
          {dirty && <Badge tone="warning">Sin guardar</Badge>}
        </div>
        <div className={styles.bigNumber}>{fmt(hoursShown)}<small> HH</small></div>
        <p className={styles.duration}>{duration}</p>
        {referenceOnly && (
          <div className={styles.aiNotice} role="status">
            <strong>Vista previa · no es el total comercial guardado</strong>
            <span>{fmt(numbers.totalHours)} HH comerciales. Asigna los perfiles de Gemini a equipos de Kora,
              aplica la propuesta y guarda la revisión.</span>
          </div>
        )}
        {!referenceOnly && aiHours !== null && numbers.totalHours === 0 && aiHours > 0 &&
          <div className={styles.aiNotice} role="status">
            <strong>{fmt(aiHours)} HH propuestas por IA</strong>
            <span>Pendientes de asignar a equipos de Kora.</span>
          </div>}
        {dirty && <p className={styles.draftNotice}>Vista previa. Los importes definitivos se recalculan al guardar.</p>}
        <div className={styles.money}>
          <div><span>Neto</span><strong>{displayAmount(referenceOnly ? null : numbers.netAmount)}</strong></div>
          <div><span>{tax === 'exempt' ? 'Total exento' : tax === 'iva19' ? 'Total con IVA' : 'Total con IGV'}</span>
            <strong>{displayAmount(referenceOnly ? null : numbers.totalAmount)}</strong></div>
        </div>
        {hourlyRate === null && hoursShown > 0 && (
          <p className={styles.warning}>Falta el valor HH del proyecto.</p>
        )}
        {referenceOnly && <p className={styles.roleHint}>Distribución de HH propuesta por perfil</p>}
        <div className={styles.distribution}
          aria-label={referenceOnly ? 'Distribución referencial por perfil' : 'Distribución de horas por equipo'}>
          {rows.length > 0 ? rows.map((row) => (
            <span key={row.teamId} className={styles[row.tone]}
              style={{ width: (row.hours / hoursShown * 100) + '%' }}
              title={row.name + ': ' + fmt(row.hours) + ' HH'} />
          )) : <span className={styles.emptyBar} />}
        </div>
        <div className={styles.legend}>
          {rows.length > 0 ? rows.map((row) => (
            <div key={row.teamId} className={styles.legendRow}>
              <span className={styles.name}><span className={styles.dot + ' ' + styles[row.tone]} />{row.name}</span>
              <strong>{fmt(row.hours)} HH</strong>
            </div>
          )) : <p>Sin HH distribuidas entre equipos.</p>}
        </div>
        {editable && <Button onClick={onSave} loading={saving} disabled={!dirty}
          aria-label="Guardar cambios del borrador">Guardar borrador</Button>}
        {actions}
        <small className={styles.saved}>
          {dirty ? 'Los valores mostrados son una vista previa sin guardar.' :
            'Versión v' + version.versionNumber + ' guardada · revisión ' + version.revision}
        </small>
      </section>
    </Card>
  );
}
