import { useState } from 'react';
import type { QuotationVersion } from '@kora/contracts';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import styles from './QuotationVersionComparison.module.css';

function teamHours(version: QuotationVersion): Map<string, number> {
  const result = new Map<string, number>();
  if (version.draft.mode === 'phases') {
    for (const phase of version.draft.phases) {
      for (const team of phase.teamHours) {
        result.set(team.teamId, (result.get(team.teamId) ?? 0) + team.hours);
      }
    }
  } else {
    for (const team of version.draft.teams) {
      const weeks = team.unit === 'day' ? team.duration / 5 : team.duration;
      const hours = team.collaborators * weeks * team.hoursPerWeek * team.dedicationPercent / 100;
      result.set(team.teamId, hours);
    }
  }
  return result;
}

export interface TeamComparisonRow {
  teamId: string;
  fromHours: number;
  toHours: number;
  delta: number;
}

export function compareQuotationTeams(from: QuotationVersion, to: QuotationVersion): TeamComparisonRow[] {
  const first = teamHours(from);
  const second = teamHours(to);
  const ids = new Set([...first.keys(), ...second.keys()]);
  return [...ids].map((teamId) => ({
    teamId,
    fromHours: first.get(teamId) ?? 0,
    toHours: second.get(teamId) ?? 0,
    delta: (second.get(teamId) ?? 0) - (first.get(teamId) ?? 0),
  }));
}

const hour = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const delta = (n: number) => (n > 0 ? '+' : '') + hour(n);

export function QuotationVersionComparison({
  versions, teamNames,
}: {
  versions: readonly QuotationVersion[];
  teamNames: ReadonlyMap<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState(versions[0]?.id ?? '');
  const [toId, setToId] = useState(versions[versions.length - 1]?.id ?? '');

  if (versions.length < 2) return null;
  const first = versions.find((version) => version.id === fromId) ?? versions[0]!;
  const second = versions.find((version) => version.id === toId) ?? versions[versions.length - 1]!;
  const rows = compareQuotationTeams(first, second);
  const monetaryComparable = first.currency === second.currency &&
    first.netAmount !== null && second.netAmount !== null &&
    first.totalAmount !== null && second.totalAmount !== null;

  return (
    <Card>
      <div className={styles.header}>
        <div><h2>Comparar versiones</h2>
          <p>Revisa diferencias comerciales sin cambiar ninguna cotización guardada.</p></div>
        <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Ocultar comparación' : 'Comparar'}
        </Button>
      </div>
      {open && (
        <div className={styles.body}>
          <div className={styles.selectors}>
            <Select label="Versión de origen" value={first.id}
              options={versions.map((version) => ({ value: version.id,
                label: 'v' + version.versionNumber + ' · ' + version.name }))}
              onChange={(e) => setFromId(e.target.value)} />
            <Select label="Versión de destino" value={second.id}
              options={versions.map((version) => ({ value: version.id,
                label: 'v' + version.versionNumber + ' · ' + version.name }))}
              onChange={(e) => setToId(e.target.value)} />
          </div>
          {first.id === second.id ? (
            <p className={styles.note}>Selecciona dos versiones distintas para revisar diferencias.</p>
          ) : (
            <>
              <div className={styles.stats}>
                <div><span>HH de origen</span><strong>{hour(first.totalHours)}</strong></div>
                <div><span>HH de destino</span><strong>{hour(second.totalHours)}</strong></div>
                <div><span>Diferencia HH</span><strong>{delta(second.totalHours - first.totalHours)}</strong></div>
              </div>
              {monetaryComparable ? (
                <p className={styles.note}>
                  Diferencia de neto: <strong>{delta(second.netAmount! - first.netAmount!)} {second.currency}</strong>.
                  {' '}Diferencia total con impuestos: <strong>{delta(second.totalAmount! - first.totalAmount!)} {second.currency}</strong>.
                </p>
              ) : (
                <p className={styles.note}>
                  Los importes no son comparables: monedas diferentes o tarifa aún no definida.
                  Las HH sí se pueden comparar.
                </p>
              )}
              {first.draft.mode !== second.draft.mode && (
                <p className={styles.note}>
                  Las versiones usan modalidades distintas; el desglose muestra las HH calculadas
                  según la modalidad guardada de cada una.
                </p>
              )}
              <div className={styles.scroll}>
                <table className={styles.table}>
                  <thead><tr><th>Equipo</th><th>HH origen</th><th>HH destino</th><th>Δ HH</th></tr></thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.teamId}>
                        <td>{teamNames.get(row.teamId) ?? 'Equipo histórico (' + row.teamId.slice(0, 8) + ')'}</td>
                        <td>{hour(row.fromHours)}</td>
                        <td>{hour(row.toHours)}</td>
                        <td>{delta(row.delta)}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={4}>Sin equipos en ambas versiones.</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className={styles.note}>Fases: {first.draft.phases.length} → {second.draft.phases.length}.
                {' '}Las diferencias reflejan snapshots guardados, no cambios pendientes en el formulario.
              </p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
