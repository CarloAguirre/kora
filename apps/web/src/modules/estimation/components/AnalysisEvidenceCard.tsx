import { useEffect, useMemo, useState } from 'react';
import type { EstimationAnalysisArtifact } from '@kora/contracts';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import styles from './AnalysisEvidenceCard.module.css';

type Tab = 'edt' | 'ers' | 'schedule';
const PAGE_SIZE = 20;
const formatHours = (hours: number) =>
  hours.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const normalize = (input: string) => input.toLocaleLowerCase('es-CL');
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export interface AnalysisEvidenceCardProps {
  analysis: EstimationAnalysisArtifact;
  /** Estado de conciliación entre el presupuesto editable y el EDT fuente. */
  projectionStatus?: 'synced' | 'modified';
  /** Revisión comercial guardada; no se exportan los cambios del formulario sin guardar. */
  versionLabel: string;
}

export function AnalysisEvidenceCard({
  analysis, projectionStatus, versionLabel,
}: AnalysisEvidenceCardProps) {
  const [tab, setTab] = useState<Tab>('edt');
  const [moduleFilter, setModuleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const modules = useMemo(
    () => [...new Set(analysis.activities.map((activity) => activity.module))].sort(),
    [analysis.activities],
  );
  const trancheNames = useMemo(
    () => new Map(analysis.tranches.map((tranche) => [tranche.id, tranche.name])),
    [analysis.tranches],
  );

  const filtered = useMemo(() => analysis.activities.filter((activity) => {
    if (moduleFilter && activity.module !== moduleFilter) return false;
    const term = normalize(search.trim());
    return !term || normalize([
      activity.wbs, activity.description, activity.module, activity.responsibleRole,
      activity.trancheId, ...activity.requirementIds,
    ].join(' ')).includes(term);
  }), [analysis.activities, moduleFilter, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filteredHours = sum(filtered.map((activity) => activity.totalHours));

  useEffect(() => { setPage(1); }, [moduleFilter, search]);

  const downloadJson = () => {
    // Descarga exclusivamente el artefacto original ya guardado, no un ERS/EDT
    // regenerado ni las modificaciones comerciales locales.
    const blob = new Blob([JSON.stringify(analysis, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kora-analisis-' + versionLabel.replace(/[^a-zA-Z0-9-_]/g, '_') + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Trazabilidad del análisis · {versionLabel}</span>
          <h2>EDT y antecedentes de la propuesta</h2>
          <p>Contenido persistido con la versión. Sirve para auditar las HH y preparar documentos cuando se acuerde su formato.</p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadJson}>
          Descargar JSON fuente
        </Button>
      </div>

      <div className={styles.kpis}>
        <div><span>Actividades WBS</span><strong>{analysis.activities.length}</strong></div>
        <div><span>HH base del EDT</span><strong>{formatHours(analysis.summary.baseHours)}</strong></div>
        <div><span>Reserva separada</span><strong>{formatHours(analysis.summary.reserveHours)}</strong></div>
        <div><span>Duración hábil</span><strong>{analysis.summary.durationWorkingDays} días</strong></div>
      </div>
      <p className={styles.provenance}>
        {analysis.provenance.mode === 'simulated_fixture'
          ? 'Simulación con documentos de ejemplo, no generada por Gemini.'
          : 'Análisis de modelo registrado en los metadatos de procedencia.'}
        {' '}{analysis.provenance.sourceFiles.length} archivos de referencia.
      </p>
      {projectionStatus === 'modified' && (
        <p className={styles.warning} role="status">
          El presupuesto fue editado después de importar este análisis. La información de abajo
          representa el EDT fuente; las HH y fases comerciales pueden diferir.
          No generar documentos definitivos hasta conciliar ambas capas.
        </p>
      )}
      <div className={styles.tabs} role="tablist" aria-label="Secciones del análisis">
        <button type="button" role="tab" aria-selected={tab === 'edt'}
          onClick={() => setTab('edt')}>EDT · actividades</button>
        <button type="button" role="tab" aria-selected={tab === 'ers'}
          onClick={() => setTab('ers')}>ERS · requisitos y decisiones</button>
        <button type="button" role="tab" aria-selected={tab === 'schedule'}
          onClick={() => setTab('schedule')}>Cronograma y perfiles</button>
      </div>

      {tab === 'edt' && (
        <div role="tabpanel" className={styles.panel}>
          <div className={styles.filters}>
            <TextField label="Buscar actividad, WBS o requisito" type="search"
              value={search} onChange={(event) => setSearch(event.target.value)} />
            <Select label="Módulo" value={moduleFilter}
              options={[{ value: '', label: 'Todos los módulos' },
                ...modules.map((name) => ({ value: name, label: name }))]}
              onChange={(event) => setModuleFilter(event.target.value)} />
          </div>
          <p className={styles.helper}>
            {filtered.length} actividades · {formatHours(filteredHours)} HH base en el filtro.
            Las reservas técnicas se muestran aparte.
          </p>
          <div className={styles.scroller}>
            <table className={styles.table}>
              <thead><tr>
                <th>WBS</th><th>Tramo / Módulo</th><th>Actividad</th>
                <th>Perfil</th><th>Requisitos</th><th className={styles.right}>HH</th><th>Referencia</th>
              </tr></thead>
              <tbody>
                {visible.map((activity) => (
                  <tr key={activity.wbs}>
                    <td className={styles.code}>{activity.wbs}</td>
                    <td><strong>{trancheNames.get(activity.trancheId) ?? activity.trancheId}</strong>
                      <small>{activity.module}</small></td>
                    <td>{activity.description}
                      <small>Tipo {activity.sourceClassification}</small></td>
                    <td>{activity.responsibleRole}</td>
                    <td>{activity.requirementIds.join(', ') || '—'}</td>
                    <td className={styles.right}>{formatHours(activity.totalHours)}</td>
                    <td>{activity.trace
                      ? <details><summary>Ver origen</summary>
                          <span>{activity.trace.artifact}</span>
                          {activity.trace.sheet ? <span> / {String(activity.trace.sheet)}</span> : null}
                          {activity.trace.row ? <span> · fila {String(activity.trace.row)}</span> : null}
                        </details>
                      : 'Sin referencia específica'}</td>
                  </tr>
                ))}
                {visible.length === 0 && <tr><td colSpan={7}>No hay actividades que coincidan con los filtros.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className={styles.pagination}>
            <span>Página {page} de {pageCount}</span>
            <Button variant="outline" size="sm" disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= pageCount}
              onClick={() => setPage((value) => value + 1)}>Siguiente</Button>
          </div>
        </div>
      )}

      {tab === 'ers' && (
        <div role="tabpanel" className={styles.panel}>
          <h3>Requisitos funcionales ({analysis.sourceRequirements.length})</h3>
          <div className={styles.scroller}><table className={styles.table}>
            <thead><tr><th>ID</th><th>Requisito</th><th>Origen</th><th>Criterio de aceptación</th></tr></thead>
            <tbody>{analysis.sourceRequirements.map((item) => (
              <tr key={item.id}><td className={styles.code}>{item.id}</td>
                <td>{item.text}</td><td>{item.origin}</td><td>{item.acceptance}</td></tr>
            ))}</tbody>
          </table></div>
          <h3>Historias de usuario ({analysis.userStories.length})</h3>
          <div className={styles.scroller}><table className={styles.table}>
            <thead><tr><th>ID</th><th>Actor</th><th>Necesidad</th><th>Aceptación</th><th>RF</th></tr></thead>
            <tbody>{analysis.userStories.map((story) => (
              <tr key={story.id}><td className={styles.code}>{story.id}</td>
                <td>{story.actor}</td><td>{story.need}</td><td>{story.acceptance}</td>
                <td>{story.requirementIds.join(', ') || '—'}</td></tr>
            ))}</tbody>
          </table></div>
          <h3>Definiciones pendientes ({analysis.pendingDecisions.length})</h3>
          <div className={styles.scroller}><table className={styles.table}>
            <thead><tr><th>ID</th><th>Definición</th><th>Impacto</th><th>Responsable</th></tr></thead>
            <tbody>{analysis.pendingDecisions.map((decision) => (
              <tr key={decision.id}><td className={styles.code}>{decision.id}</td>
                <td>{decision.decision}</td><td>{decision.impact}</td><td>{decision.owner}</td></tr>
            ))}</tbody>
          </table></div>
          <div className={styles.sourceFiles}>
            <h3>Fuentes documentales registradas</h3>
            {analysis.provenance.sourceFiles.map((source) => (
              <div key={source.id}><strong>{source.name}</strong>
                <small>{source.kind.toUpperCase()} · SHA-256 {source.sha256}</small></div>
            ))}
            <p className={styles.helper}>Las referencias y huellas digitales no sustituyen el almacenamiento de los archivos originales.</p>
          </div>
        </div>
      )}

      {tab === 'schedule' && (
        <div role="tabpanel" className={styles.panel}>
          <h3>Tramos de trabajo ({analysis.tranches.length})</h3>
          <div className={styles.scroller}><table className={styles.table}>
            <thead><tr><th>Tramo</th><th>Inicio</th><th>Duración</th><th className={styles.right}>HH</th></tr></thead>
            <tbody>{analysis.tranches.map((tranche) => (
              <tr key={tranche.id}><td><span className={styles.code}>{tranche.id} </span>{tranche.name}</td>
                <td>Semana {tranche.startWeek}</td><td>{tranche.durationWeeks} semanas</td>
                <td className={styles.right}>{formatHours(tranche.totalHours)}</td></tr>
            ))}</tbody>
          </table></div>
          <h3>HH por perfil</h3>
          <div className={styles.roleGrid}>
            {analysis.roles.map((role) => (
              <div key={role.role}><span>{role.role}</span><strong>{formatHours(role.baseHours)} HH</strong>
                <small>{role.headcount} {role.headcount === 1 ? 'persona' : 'personas'} estimadas</small></div>
            ))}
          </div>
          <h3>Plan semanal — HH por perfil</h3>
          <div className={styles.scroller}><table className={styles.table}>
            <thead><tr><th>Semana</th>
              {analysis.roles.map((role) => <th key={role.role} className={styles.right}>{role.role}</th>)}
              <th className={styles.right}>Total</th>
            </tr></thead>
            <tbody>{analysis.weeklyPlan.map((week) => (
              <tr key={week.week}><td>{week.week}</td>
                {analysis.roles.map((role) => (
                  <td className={styles.right} key={role.role}>{formatHours(week.hoursByRole[role.role] ?? 0)}</td>
                ))}
                <td className={styles.right}>{formatHours(sum(Object.values(week.hoursByRole)))}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <details className={styles.dailyDetails}>
            <summary>Ver plan diario ({analysis.dailyPlan.length} asignaciones)</summary>
            <div className={styles.scroller}><table className={styles.table}>
              <thead><tr><th>Día hábil</th><th>Tramo</th><th>Actividad WBS</th>
                <th>Perfil</th><th className={styles.right}>HH</th></tr></thead>
              <tbody>{analysis.dailyPlan.slice(0, 250).map((day, index) => (
                <tr key={day.activityId + '-' + day.workingDay + '-' + day.role + '-' + index}>
                  <td>{day.workingDay}</td><td>{day.trancheId}</td>
                  <td>{day.activityId} · {day.description}</td><td>{day.role}</td>
                  <td className={styles.right}>{formatHours(day.hours)}</td>
                </tr>
              ))}</tbody>
            </table></div>
            {analysis.dailyPlan.length > 250 && <p className={styles.helper}>
              Se muestran 250 asignaciones; descarga el JSON fuente para consultar el plan completo.
            </p>}
          </details>
        </div>
      )}
      <p className={styles.helper}>Esta vista es de consulta. No genera ni valida todavía archivos ERS/EDT definitivos.</p>
    </Card>
  );
}
