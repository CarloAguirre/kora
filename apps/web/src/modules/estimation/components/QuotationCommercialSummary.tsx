import type { ReactNode } from 'react';
import { effectiveQuotationEdt, type QuotationDraftData, type QuotationVersion } from '@kora/contracts';
import { Card } from '@/shared/components/ui/Card';
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
  version, draft, hourlyRate, currency, tax, teamNames, dirty, actions,
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
  const edt = draft.aiPoc?.edt ? effectiveQuotationEdt(draft) : null;
  const referenceOnly = Boolean(edt && (draft.mode !== 'phases' || draft.phases.length === 0));
  const hoursShown = referenceOnly && edt ? edt.totalHours : numbers.totalHours;
  const commercialRows: TeamHours[] = numbers.byTeam.filter((row) => row.hours > 0)
    .map((row) => {
      const name = teamNames.get(row.teamId) ?? 'Equipo no disponible';
      return { ...row, name, tone: teamTone(name) };
    });
  const roleHours = new Map<string, number>();
  if (edt) {
    for (const module of edt.modules) {
      for (const task of module.tasks) {
        for (const effort of task.roleEffort ?? [{ role: task.role, hours: task.hours }]) {
          roleHours.set(effort.role, round((roleHours.get(effort.role) ?? 0) + effort.hours, 2));
        }
      }
    }
  }
  const referenceRows: TeamHours[] = [...roleHours].map(([role, hours]) => ({
    teamId: 'role:' + role, name: role, hours, tone: teamTone(role),
  })).filter((row) => row.hours > 0);
  const rows = referenceOnly ? referenceRows : commercialRows;
  const duration = referenceOnly && edt
    ? edt.schemaVersion === 'kora.quotation.reference-edt.v2'
      ? Math.max(1, ...(edt.stages ?? []).map((p) => p.startWeek + p.durationWeeks - 1)) +
        ' semanas · ' + (edt.stages?.length ?? 0) + ' fases'
      : edt.modules.length + ' módulos'
    : durationLabel(draft);
  const recurringMonthly = draft.costs.filter((cost) => cost.recurrence === 'monthly')
    .reduce((sum, cost) => sum + cost.amount, 0);
  const recurringYearly = draft.costs.filter((cost) => cost.recurrence === 'annual')
    .reduce((sum, cost) => sum + cost.amount, 0);
  const displayAmount = (amount: number | null) =>
    fmtMoney(amount ?? 0) + ' ' + currency;

  return (
    <Card>
      <section className={styles.summary} aria-label="Resumen comercial de cotización">
        <div className={styles.topLine}>
          <span>Horas totales del proyecto</span>
          {dirty && <span className={styles.unsaved}>Sin guardar</span>}
        </div>
        <div className={styles.bigNumber}>{fmt(hoursShown)}<small> hh</small></div>
        <p className={styles.duration}>{duration}</p>
        <div className={styles.money}>
          <div><span>Neto</span>
            <strong>{displayAmount(referenceOnly ? null : numbers.netAmount)}</strong></div>
          <div><span>{tax === 'exempt' ? 'Total exento' :
            tax === 'iva19' ? 'Total con IVA' : 'Total con IGV'}</span>
            <strong>{displayAmount(referenceOnly ? null : numbers.totalAmount)}</strong></div>
        </div>
        {recurringMonthly > 0 && <p className={styles.recurring}>
          Recurrentes: + {fmtMoney(recurringMonthly)} {currency} / mes
        </p>}
        {recurringYearly > 0 && <p className={styles.recurring}>
          Recurrentes: + {fmtMoney(recurringYearly)} {currency} / año
        </p>}
        {(hourlyRate === null || hourlyRate <= 0) && hoursShown > 0 &&
          <p className={styles.warning}>Falta el valor HH del proyecto.</p>}
        <div className={styles.distribution}
          aria-label={referenceOnly ? 'Distribución referencial por perfil' :
            'Distribución de horas por equipo'}>
          {rows.length > 0 ? rows.map((row) =>
            <span key={row.teamId} className={styles[row.tone]}
              style={{ width: (row.hours / Math.max(1, hoursShown) * 100) + '%' }}
              title={row.name + ': ' + fmt(row.hours) + ' hh'} />
          ) : <span className={styles.emptyBar} />}
        </div>
        <div className={styles.legend}>
          {rows.length > 0 ? rows.map((row) => (
            <div key={row.teamId} className={styles.legendRow}>
              <span className={styles.name}><span className={styles.dot + ' ' +
                styles[row.tone]} />{row.name}</span>
              <strong>{fmt(row.hours)} hh</strong>
            </div>
          )) : <p>Sin HH distribuidas.</p>}
        </div>
        {actions}
      </section>
    </Card>
  );
}
