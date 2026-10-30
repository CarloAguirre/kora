import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { estimationAnalysisArtifactSchema, isQuotationDraftEligibleProject, quotationDraftDataSchema, type EstimationAnalysisArtifact, type QuotationDraftData, type QuotationVersion, type UpdateQuotationDraftInput } from '@kora/contracts';
import { useProjectDetail } from '@/modules/projects/api/projects.queries';
import { useTeamsList } from '@/modules/teams/api/teams.queries';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { useCreateQuotationVersion, useProjectQuotation, useSaveQuotationDraft } from '../api/quotation.queries';
import { AnalysisEvidenceCard } from '../components/AnalysisEvidenceCard';
import { QuotationVersionComparison } from '../components/QuotationVersionComparison';
import styles from './QuotationWorkspacePage.module.css';

type Form = Pick<UpdateQuotationDraftInput, 'name' | 'hourlyRate' | 'currency' | 'tax' | 'draft'>;

const money = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 4 });
const fromVersion = (version: QuotationVersion): Form => ({
  name: version.name, hourlyRate: version.hourlyRate, currency: version.currency,
  tax: version.tax, draft: structuredClone(version.draft),
});
const numeric = (value: string): number => Math.max(0, Number(value) || 0);

const emptyTeam = (teamId: string): QuotationDraftData['teams'][number] => ({
  teamId, collaborators: 1, unit: 'week', duration: 1, hoursPerWeek: 40, dedicationPercent: 100,
});

export function QuotationWorkspacePage() {
  const { projectId: projectRef } = useParams<{ projectId: string }>();
  const [params, setParams] = useSearchParams();
  // El segmento de la ruta puede ser un slug; la API de cotizaciones usa el UUID.
  const projectQuery = useProjectDetail(projectRef ?? null);
  const project = projectQuery.data;
  const projectId = project?.id ?? null;
  const quotationQuery = useProjectQuotation(projectId);
  const createVersion = useCreateQuotationVersion(projectId ?? '');
  const saveDraft = useSaveQuotationDraft(projectId ?? '');
  const teamQuery = useTeamsList({ page: 1, pageSize: 200, isActive: true, sortField: 'name' }, { enabled: Boolean(projectId) });

  const [form, setForm] = useState<Form | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sampleAnalysis, setSampleAnalysis] = useState<EstimationAnalysisArtifact | null>(null);
  const [sampleTeamMap, setSampleTeamMap] = useState<Record<string, string>>({});
  const [sampleError, setSampleError] = useState('');
  const [sampleSuccess, setSampleSuccess] = useState('');

  const quotation = quotationQuery.data;
  const versions = quotation?.versions ?? [];
  const versionParam = params.get('version');
  const selected = useMemo(
    () => versions.find((item) => item.id === versionParam) ?? versions[versions.length - 1] ?? null,
    [versionParam, versions],
  );
  const activeTeams = useMemo(
    () => (teamQuery.data?.items ?? []).filter((team) => team.isActive),
    [teamQuery.data?.items],
  );
  const teamById = useMemo(() => new Map(activeTeams.map((team) => [team.id, team.name])), [activeTeams]);

  // La edición local no se sobreescribe en cada refetch, solo al cambiar de versión/revisión.
  useEffect(() => {
    setForm(selected ? fromVersion(selected) : null);
    setDirty(false);
    setError('');
  }, [selected?.id, selected?.revision]);

  const mayWrite = Boolean(project && isQuotationDraftEligibleProject(project));
  const editable = Boolean(mayWrite && selected?.status === 'draft' && form);

  const change = (update: (current: Form) => Form) => {
    setForm((current) => current ? update(current) : null);
    setDirty(true);
    setNotice('');
    setError('');
  };
  const updateDraft = (patch: Partial<QuotationDraftData>) =>
    change((current) => ({
      ...current,
      draft: {
        ...current.draft,
        ...patch,
        // El artefacto conserva el cálculo original; editar el presupuesto
        // requiere conciliarlo antes de usarlo para producir documentos.
        ...(current.draft.analysis && Object.keys(patch).some(
          (field) => ['teams', 'phases', 'costs', 'paymentPlan', 'assumptions', 'exclusions'].includes(field),
        ) ? { analysisProjectionStatus: 'modified' as const } : {}),
      },
    }));
  const selectVersion = (id: string) => {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Deseas descartarlos?')) return;
    setParams({ version: id });
    setNotice('');
  };
  const newVersion = async (sourceVersionId?: string) => {
    if (!projectId || !mayWrite || createVersion.isPending) return;
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Deseas descartarlos?')) return;
    setError('');
    setNotice('');
    try {
      const created = await createVersion.mutateAsync(sourceVersionId ? { sourceVersionId } : {});
      setParams({ version: created.id });
      setForm(fromVersion(created));
      setDirty(false);
      setNotice('Borrador ' + created.name + ' creado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la versión.');
    }
  };
  const save = async () => {
    if (!editable || !selected || !projectId || !form || saveDraft.isPending) return;
    setError('');
    setNotice('');
    try {
      // Contratos compartidos: validación en navegador; el servidor vuelve a validarlo.
      const draft = quotationDraftDataSchema.parse(form.draft);
      const saved = await saveDraft.mutateAsync({
        versionId: selected.id,
        input: { revision: selected.revision, name: form.name, hourlyRate: form.hourlyRate,
          currency: form.currency, tax: form.tax, draft },
      });
      setForm(fromVersion(saved));
      setDirty(false);
      setNotice('Borrador guardado. Revisión ' + saved.revision + '.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar. Revisa los campos.');
    }
  };


  const importSimulatedAnalysis = async (file?: File) => {
    setSampleAnalysis(null);
    setSampleTeamMap({});
    setSampleError('');
    setSampleSuccess('');
    if (!file) return;
    if (file.size > 1_000_000) {
      setSampleError('El JSON supera el límite de 1 MB para este ejemplo.');
      return;
    }
    try {
      const json: unknown = JSON.parse(await file.text());
      const validation = estimationAnalysisArtifactSchema.safeParse(json);
      if (!validation.success) {
        setSampleError('El artefacto no coincide con el esquema o sus totales: ' +
          (validation.error.issues[0]?.message ?? 'JSON inválido.'));
        return;
      }
      if (validation.data.provenance.mode !== 'simulated_fixture') {
        setSampleError('Este importador acepta solo simulaciones explícitas, no resultados de IA real.');
        return;
      }
      setSampleAnalysis(validation.data);
      // Sugerencias de nombre, pero ningún mapeo es definitivo sin revisión.
      const suggested: Record<string, string> = {};
      for (const role of validation.data.roles) {
        const name = validation.data.roleTeamMappings.suggestions[role.role];
        if (typeof name !== 'string') continue;
        const team = activeTeams.find((candidate) =>
          candidate.name.toLocaleLowerCase('es-CL') === name.toLocaleLowerCase('es-CL'));
        if (team) suggested[role.role] = team.id;
      }
      setSampleTeamMap(suggested);
    } catch {
      setSampleError('No se pudo interpretar el archivo JSON seleccionado.');
    }
  };

  const saveSimulatedAnalysis = async () => {
    if (!sampleAnalysis || !projectId || !mayWrite || createVersion.isPending) return;
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Deseas descartarlos?')) return;
    if (sampleAnalysis.roles.some((role) => !sampleTeamMap[role.role])) {
      setSampleError('Asocia todos los perfiles del EDT con equipos activos de Kora.');
      return;
    }
    if (!window.confirm('El artefacto corresponde al ejemplo Zurich, no al análisis de este proyecto. ¿Deseas guardar una versión de DEMOSTRACIÓN explícitamente identificada?')) return;
    setSampleError('');
    setSampleSuccess('');
    try {
      const created = await createVersion.mutateAsync({
        simulation: { analysis: sampleAnalysis, roleTeamIds: sampleTeamMap },
      });
      setParams({ version: created.id });
      setForm(fromVersion(created));
      setDirty(false);
      setSampleSuccess('Versión de demostración creada con trazabilidad y HH verificadas.');
      setNotice('Versión de IA simulada: pendiente de revisión.');
    } catch (err) {
      setSampleError(err instanceof Error ? err.message : 'No se pudo guardar la simulación.');
    }
  };

  const teamRows = form?.draft.teams ?? [];
  const phaseRows = form?.draft.phases ?? [];
  const available = activeTeams.filter((team) => !teamRows.some((row) => row.teamId === team.id));
  const usedPercent = (form?.draft.paymentPlan ?? []).reduce((sum, payment) => sum + payment.percent, 0);
  const editTeam = (index: number, patch: Partial<QuotationDraftData['teams'][number]>) => {
    if (!form) return;
    const original = teamRows[index];
    const changedId = original && patch.teamId && patch.teamId !== original.teamId;
    updateDraft({
      teams: teamRows.map((row, position) => position === index ? { ...row, ...patch } : row),
      ...(changedId ? { phases: phaseRows.map((phase) => ({
        ...phase,
        teamHours: phase.teamHours.map((hours) =>
          hours.teamId === original.teamId ? { ...hours, teamId: patch.teamId as string } : hours),
      })) } : {}),
    });
  };
  const editPhase = (index: number, patch: Partial<QuotationDraftData['phases'][number]>) => {
    updateDraft({ phases: phaseRows.map((row, position) => position === index ? { ...row, ...patch } : row) });
  };

  return (
    <DashboardLayout title="Cotizaciones">
      <main className={styles.page}>
        <nav className={styles.breadcrumb}>
          <Link to="/proyectos">Proyectos</Link> <span>/</span>
          <Link to={project ? '/proyectos/' + project.slug : '/proyectos'}>{project?.name ?? 'Proyecto'}</Link>
          <span>/</span> <strong>Cotización{selected ? ' v' + selected.versionNumber : ''}</strong>
        </nav>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Cotizaciones · Kora</span>
            <h1>{project?.name ?? 'Cotización del proyecto'}</h1>
            <p>Versiones comerciales independientes de la planificación y las HH reales del proyecto, incluso si su estado operativo es Activo.</p>
          </div>
          <Link to="/calculadora">Volver al listado</Link>
        </header>

        {projectQuery.isLoading && <Card>Cargando proyecto…</Card>}
        {projectQuery.error && <Card>No se pudo cargar el proyecto.</Card>}
        {quotationQuery.isLoading && project && <Card>Cargando cotizaciones…</Card>}
        {quotationQuery.error && <Card>No se pudieron consultar las versiones. Confirma migración 0048 y permisos.</Card>}
        {teamQuery.error && <Card>No se pudo consultar el catálogo de equipos.</Card>}

        {project && !mayWrite && (
          <Card>
            <strong>Consulta histórica</strong>
            <p>Este proyecto no permite crear o editar borradores en su etapa comercial actual. Los proyectos aprobados, detenidos, finalizados o cancelados quedan en modo consulta hasta acordar el flujo de recotización.</p>
          </Card>
        )}

        {project && !quotationQuery.isLoading && !quotationQuery.error && (
          <div className={styles.layout}>
            <section className={styles.main}>
              <Card>
                <div className={styles.cardTitle}>
                  <div><h2>Versiones de cotización</h2><p>Solo se pueden editar versiones en Borrador.</p></div>
                  {mayWrite && (
                    <div className={styles.actions}>
                      <Button size="sm" variant="outline" loading={createVersion.isPending}
                        onClick={() => void newVersion()}>Nueva en blanco</Button>
                      {selected && <Button size="sm" variant="secondary" loading={createVersion.isPending}
                        onClick={() => void newVersion(selected.id)}>Copiar versión</Button>}
                    </div>
                  )}
                </div>
                {versions.length === 0
                  ? <p>No hay versiones guardadas para este proyecto.</p>
                  : <div className={styles.versions}>
                      {versions.map((version) => (
                        <button key={version.id} type="button" onClick={() => selectVersion(version.id)}
                          className={[styles.version, selected?.id === version.id ? styles.selected : ''].join(' ')}>
                          <b>v{version.versionNumber} · {version.name}</b>
                          <span>{version.status === 'draft' ? 'Borrador' : version.status === 'sent' ? 'Enviada' : 'Aprobada'} · {money(version.totalHours)} HH</span>
                        </button>
                      ))}
                    </div>}
              </Card>


              {versions.length > 1 && (
                <QuotationVersionComparison versions={versions} teamNames={teamById} />
              )}

              {mayWrite && (
                <Card>
                  <div className={styles.cardTitle}>
                    <div>
                      <span className={styles.eyebrow}>PoC · simulación controlada</span>
                      <h2>Importar análisis estructurado de ejemplo</h2>
                      <p>Carga el JSON de Zurich generado a partir de su ERS y EDT. No invoca Gemini ni analiza documentos nuevos.</p>
                    </div>
                  </div>
                  <label className={styles.longField}>Archivo JSON (máximo 1 MB)
                    <input type="file" accept=".json,application/json" onChange={(e) =>
                      void importSimulatedAnalysis(e.target.files?.[0])} />
                  </label>
                  {sampleAnalysis && (
                    <div className={styles.simulation}>
                      <strong>{sampleAnalysis.project.name}</strong>
                      <p className={styles.helper}>{sampleAnalysis.provenance.warning}</p>
                      <div className={styles.summaryStats}>
                        <span>{sampleAnalysis.activities.length} actividades WBS</span>
                        <span>{sampleAnalysis.tranches.length} tramos</span>
                        <span>{money(sampleAnalysis.summary.baseHours)} HH base</span>
                        <span>Reserva separada: {money(sampleAnalysis.summary.reserveHours)} HH</span>
                      </div>
                      <p className={styles.warn}>Los perfiles del EDT no son necesariamente los equipos registrados en Kora. Revisa cada correspondencia. Si varios perfiles usan el mismo equipo, sus HH se agregan sin perder el desglose original.</p>
                      <div className={styles.mapping}>
                        {sampleAnalysis.roles.map((role) => (
                          <div key={role.role} className={styles.mappingRow}>
                            <div><strong>{role.role}</strong><small>{money(role.baseHours)} HH</small></div>
                            <Select label="Equipo Kora" placeholder="Asignar equipo"
                              value={sampleTeamMap[role.role] ?? ''}
                              options={activeTeams.map((team) => ({ value: team.id, label: team.name }))}
                              onChange={(e) => {
                                setSampleTeamMap((mapping) => ({ ...mapping, [role.role]: e.target.value }));
                                setSampleError('');
                              }} />
                          </div>
                        ))}
                      </div>
                      <p className={styles.helper}>La reserva no se suma a la cotización. Tarifa, impuesto y plan comercial requieren revisión humana. Se conserva el artefacto con ERS/EDT para futura generación documental.</p>
                      <Button
                        disabled={sampleAnalysis.roles.some((role) => !sampleTeamMap[role.role])}
                        loading={createVersion.isPending}
                        onClick={() => void saveSimulatedAnalysis()}>
                        Crear versión de IA simulada
                      </Button>
                    </div>
                  )}
                  {sampleError && <p className={styles.error} role="alert">{sampleError}</p>}
                  {sampleSuccess && <p className={styles.success} role="status">{sampleSuccess}</p>}
                </Card>
              )}

              {selected && form && (
                <>
                  {form.draft.analysis && (
                    <AnalysisEvidenceCard
                      analysis={form.draft.analysis}
                      projectionStatus={form.draft.analysisProjectionStatus}
                      versionLabel={`v${selected.versionNumber}`}
                    />
                  )}
                  <Card>
                    <div className={styles.cardTitle}>
                      <div><span className={styles.eyebrow}>v{selected.versionNumber} · {selected.origin}</span><h2>Datos generales</h2></div>
                      <span className={styles.status}>{selected.status === 'draft' ? 'Borrador' : selected.status === 'sent' ? 'Enviada' : 'Aprobada'}</span>
                    </div>
                    <div className={styles.grid}>
                      <TextField label="Nombre de versión" value={form.name} maxLength={200} disabled={!editable}
                        onChange={(e) => change((f) => ({ ...f, name: e.target.value }))} />
                      <TextField label="Valor de HH" type="number" min={0} step="0.0001"
                        value={form.hourlyRate ?? ''} disabled={!editable}
                        onChange={(e) => change((f) => ({ ...f, hourlyRate: e.target.value === '' ? null : numeric(e.target.value) }))} />
                      <Select label="Moneda" value={form.currency} disabled={!editable}
                        options={[{ value: 'UF', label: 'UF' }, { value: 'CLP', label: 'CLP' }, { value: 'USD', label: 'USD' }]}
                        onChange={(e) => change((f) => ({ ...f, currency: e.target.value as Form['currency'] }))} />
                      <Select label="Impuesto" value={form.tax} disabled={!editable}
                        options={[{ value: 'iva19', label: 'IVA 19%' }, { value: 'igv18', label: 'IGV 18%' }, { value: 'exempt', label: 'Exento' }]}
                        onChange={(e) => change((f) => ({ ...f, tax: e.target.value as Form['tax'] }))} />
                    </div>
                    <p className={styles.helper}>El valor HH es comercial y nunca lo determina la IA. Importes no se transfieren al proyecto hasta una aprobación y traspaso futuros.</p>
                  </Card>

                  <Card>
                    <div className={styles.cardTitle}><div><h2>Equipos y dedicación</h2><p>Selecciona equipos activos del catálogo Kora.</p></div>
                      {editable && <Button size="sm" variant="outline" disabled={!available.length}
                        onClick={() => {
                          const nextTeam = available[0];
                          if (nextTeam) updateDraft({ teams: [...teamRows, emptyTeam(nextTeam.id)] });
                        }}>Añadir equipo</Button>}
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead><tr><th>Equipo</th><th>Personas</th><th>Unidad</th><th>Duración</th><th>HH/sem.</th><th>Dedicación %</th><th></th></tr></thead>
                        <tbody>
                          {teamRows.map((team, index) => (
                            <tr key={team.teamId}>
                              <td><Select value={team.teamId} disabled={!editable}
                                options={[{ value: team.teamId, label: teamById.get(team.teamId) ?? 'Equipo no disponible' }, ...available.map((t) => ({ value: t.id, label: t.name }))]}
                                onChange={(e) => editTeam(index, { teamId: e.target.value })} /></td>
                              <td><input aria-label="Personas" type="number" min={1} max={100} disabled={!editable}
                                value={team.collaborators} onChange={(e) => editTeam(index, { collaborators: numeric(e.target.value) })} /></td>
                              <td><Select value={team.unit} disabled={!editable}
                                options={[{ value: 'week', label: 'Semanas' }, { value: 'day', label: 'Días' }]}
                                onChange={(e) => editTeam(index, { unit: e.target.value as 'week' | 'day' })} /></td>
                              <td><input aria-label="Duración" type="number" min={0} disabled={!editable}
                                value={team.duration} onChange={(e) => editTeam(index, { duration: numeric(e.target.value) })} /></td>
                              <td><input aria-label="Horas semanales" type="number" min={0} disabled={!editable}
                                value={team.hoursPerWeek} onChange={(e) => editTeam(index, { hoursPerWeek: numeric(e.target.value) })} /></td>
                              <td><input aria-label="Dedicación porcentual" type="number" min={0} max={100} disabled={!editable}
                                value={team.dedicationPercent} onChange={(e) => editTeam(index, { dedicationPercent: numeric(e.target.value) })} /></td>
                              <td>{editable && <Button variant="ghost" size="sm"
                                onClick={() => updateDraft({ teams: teamRows.filter((_, i) => i !== index),
                                  phases: phaseRows.map((p) => ({ ...p, teamHours: p.teamHours.filter((h) => h.teamId !== team.teamId) })) })}>Quitar</Button>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {teamRows.length === 0 && <p className={styles.helper}>Agrega un equipo para comenzar a calcular HH.</p>}
                  </Card>

                  <Card>
                    <div className={styles.cardTitle}><div><h2>Modalidad de estimación</h2><p>Las HH por fases reemplazan el cálculo global de equipos, no se suman dos veces.</p></div></div>
                    <Select value={form.draft.mode} disabled={!editable}
                      options={[{ value: 'team', label: 'Equipos / dedicación' }, { value: 'phases', label: 'Por fases y semanas' }]}
                      onChange={(e) => updateDraft({ mode: e.target.value as QuotationDraftData['mode'] })} />
                    {form.draft.mode === 'phases' && (
                      <>
                        <div className={styles.cardTitle}>
                          <h3>Fases</h3>
                          {editable && <Button size="sm" variant="outline"
                            onClick={() => updateDraft({ phases: [...phaseRows, { name: 'Nueva fase', startWeek: 1, durationWeeks: 1, teamHours: [] }] })}>Añadir fase</Button>}
                        </div>
                        {phaseRows.map((phase, index) => (
                          <div className={styles.subcard} key={index}>
                            <div className={styles.grid}>
                              <TextField label="Fase" value={phase.name} disabled={!editable}
                                onChange={(e) => editPhase(index, { name: e.target.value })} />
                              <TextField label="Semana inicio" type="number" min={1} disabled={!editable} value={phase.startWeek}
                                onChange={(e) => editPhase(index, { startWeek: numeric(e.target.value) })} />
                              <TextField label="Duración (semanas)" type="number" min={1} disabled={!editable} value={phase.durationWeeks}
                                onChange={(e) => editPhase(index, { durationWeeks: numeric(e.target.value) })} />
                            </div>
                            <div className={styles.phaseHours}>
                              {teamRows.map((team) => (
                                <label key={team.teamId}>
                                  <span>{teamById.get(team.teamId) ?? team.teamId} · HH fase</span>
                                  <input type="number" min={0} disabled={!editable}
                                    value={phase.teamHours.find((h) => h.teamId === team.teamId)?.hours ?? 0}
                                    onChange={(e) => editPhase(index, { teamHours: [
                                      ...phase.teamHours.filter((h) => h.teamId !== team.teamId),
                                      { teamId: team.teamId, hours: numeric(e.target.value) },
                                    ] })} />
                                </label>
                              ))}
                            </div>
                            {editable && <Button variant="ghost" size="sm"
                              onClick={() => updateDraft({ phases: phaseRows.filter((_, i) => i !== index) })}>Quitar fase</Button>}
                          </div>
                        ))}
                      </>
                    )}
                  </Card>

                  <Card>
                    <div className={styles.cardTitle}><div><h2>Costos externos</h2><p>Los recurrentes se registran aparte; no inflan el neto inicial.</p></div>
                      {editable && <Button size="sm" variant="outline" onClick={() => updateDraft({ costs: [
                        ...form.draft.costs, { description: 'Nuevo costo', amount: 0, recurrence: 'once' },
                      ] })}>Añadir costo</Button>}
                    </div>
                    {form.draft.costs.map((cost, index) => (
                      <div className={styles.inlineRow} key={index}>
                        <TextField label="Descripción" value={cost.description} disabled={!editable}
                          onChange={(e) => updateDraft({ costs: form.draft.costs.map((c, i) => i === index ? { ...c, description: e.target.value } : c) })} />
                        <TextField label="Monto" type="number" min={0} step="0.01" value={cost.amount} disabled={!editable}
                          onChange={(e) => updateDraft({ costs: form.draft.costs.map((c, i) => i === index ? { ...c, amount: numeric(e.target.value) } : c) })} />
                        <Select label="Periodicidad" value={cost.recurrence} disabled={!editable}
                          options={[{ value: 'once', label: 'Único' }, { value: 'monthly', label: 'Mensual' }, { value: 'annual', label: 'Anual' }]}
                          onChange={(e) => updateDraft({ costs: form.draft.costs.map((c, i) => i === index ? { ...c, recurrence: e.target.value as typeof c.recurrence } : c) })} />
                        {editable && <Button size="sm" variant="ghost" onClick={() => updateDraft({ costs: form.draft.costs.filter((_, i) => i !== index) })}>Quitar</Button>}
                      </div>
                    ))}
                  </Card>

                  <Card>
                    <div className={styles.cardTitle}>
                      <div><h2>Plan de pago</h2><p>Para enviar o aprobar se exigirá que los hitos sumen exactamente 100%.</p></div>
                      {editable && <Button size="sm" variant="outline"
                        onClick={() => updateDraft({ paymentPlan: [...form.draft.paymentPlan, { name: 'Nuevo hito', percent: 0, trigger: 'approval' }] })}>Añadir hito</Button>}
                    </div>
                    {form.draft.paymentPlan.map((payment, index) => (
                      <div key={index}>
                      <div className={styles.inlineRow}>
                        <TextField label="Hito" value={payment.name} disabled={!editable}
                          onChange={(e) => updateDraft({ paymentPlan: form.draft.paymentPlan.map((p, i) => i === index ? { ...p, name: e.target.value } : p) })} />
                        <TextField label="%" type="number" min={0} max={100} step="0.01" value={payment.percent} disabled={!editable}
                          onChange={(e) => updateDraft({ paymentPlan: form.draft.paymentPlan.map((p, i) => i === index ? { ...p, percent: numeric(e.target.value) } : p) })} />
                        <Select label="Disparador" value={payment.trigger} disabled={!editable}
                          options={[{ value: 'approval', label: 'Aprobación' }, { value: 'phase', label: 'Fase' }, { value: 'date', label: 'Fecha' }]}
                          onChange={(e) => updateDraft({ paymentPlan: form.draft.paymentPlan.map((p, i) => i === index ? { ...p, trigger: e.target.value as typeof p.trigger } : p) })} />
                        {editable && <Button variant="ghost" size="sm"
                          onClick={() => updateDraft({ paymentPlan: form.draft.paymentPlan.filter((_, i) => i !== index) })}>Quitar</Button>}
                      </div>
                      {payment.trigger === 'phase' && (
                        <div className={styles.paymentDetail} key={'phase-' + index}>
                          <Select label="Fase disparadora" disabled={!editable}
                            value={payment.triggerPhase ?? ''}
                            placeholder="Seleccionar fase"
                            options={phaseRows.map((phase) => ({ value: phase.name, label: phase.name }))}
                            onChange={(e) => updateDraft({ paymentPlan: form.draft.paymentPlan.map((p, i) =>
                              i === index ? { ...p, triggerPhase: e.target.value || null } : p) })} />
                        </div>
                      )}
                      {payment.trigger === 'date' && (
                        <div className={styles.paymentDetail} key={'date-' + index}>
                          <TextField label="Fecha disparadora" type="date" value={payment.triggerDate ?? ''}
                            disabled={!editable} onChange={(e) => updateDraft({ paymentPlan: form.draft.paymentPlan.map((p, i) =>
                              i === index ? { ...p, triggerDate: e.target.value || null } : p) })} />
                        </div>
                      )}
                      </div>
                    ))}
                    <p className={styles.helper}>Porcentaje configurado: {money(usedPercent)}% {usedPercent === 100 ? '· Completo' : '· Pendiente de completar'}</p>
                    <p className={styles.helper}>Puedes registrar fecha o fase como referencia comercial. La ejecución y validación del plan de pago se habilitarán recién en R3.</p>
                  </Card>

                  <Card>
                    <h2>Supuestos y exclusiones</h2>
                    <label className={styles.longField}>Supuestos (uno por línea)
                      <textarea disabled={!editable} value={form.draft.assumptions.join('\n')}
                        onChange={(e) => updateDraft({ assumptions: e.target.value.split('\n').slice(0, 100) })} />
                    </label>
                    <label className={styles.longField}>Exclusiones (una por línea)
                      <textarea disabled={!editable} value={form.draft.exclusions.join('\n')}
                        onChange={(e) => updateDraft({ exclusions: e.target.value.split('\n').slice(0, 100) })} />
                    </label>
                  </Card>
                </>
              )}
            </section>

            <aside className={styles.sidebar}>
              <Card>
                <h2>Resumen de versión</h2>
                {selected ? (
                  <>
                    <div className={styles.stat}><span>HH guardadas</span><strong>{money(selected.totalHours)}</strong></div>
                    <div className={styles.stat}><span>Neto guardado</span><strong>{selected.netAmount === null ? 'Sin valor HH' : money(selected.netAmount) + ' ' + selected.currency}</strong></div>
                    <div className={styles.stat}><span>Total guardado</span><strong>{selected.totalAmount === null ? '—' : money(selected.totalAmount) + ' ' + selected.currency}</strong></div>
                    <p className={styles.helper}>Revisión {selected.revision}. Los importes se recalculan en servidor al guardar.</p>
                    {form?.draft.analysis && (
                      <p className={form.draft.analysisProjectionStatus === 'modified' ? styles.warn : styles.helper}>
                        {form.draft.analysis.provenance.mode === 'simulated_fixture' ? 'IA simulada · ' : 'IA · '}
                        {form.draft.analysisProjectionStatus === 'modified'
                          ? 'La edición manual difiere del EDT de origen. Conciliar antes de generar documentos.'
                          : 'WBS y trazabilidad conservados para generación documental.'}
                      </p>
                    )}
                    {dirty && <p className={styles.warn}>Hay cambios sin guardar; los totales aún corresponden a la última versión guardada.</p>}
                    {notice && <p className={styles.success} role="status">{notice}</p>}
                    {error && <p className={styles.error} role="alert">{error}</p>}
                    {editable && <Button onClick={() => void save()} loading={saveDraft.isPending}
                      disabled={!dirty || !form?.name.trim()}>Guardar borrador</Button>}
                    {!editable && <p className={styles.helper}>La versión es de consulta o el proyecto ya no permite editarla.</p>}
                  </>
                ) : (
                  <p className={styles.helper}>Crea una versión en blanco para empezar.</p>
                )}
                {!selected && error && <p className={styles.error} role="alert">{error}</p>}
                {!selected && notice && <p className={styles.success} role="status">{notice}</p>}
              </Card>
              <Card>
                <h3>Siguiente etapa</h3>
                <p className={styles.helper}>Envío, aprobación y traspaso todavía no están habilitados. Los cambios de esta pantalla no afectan Proyectos ni Forecast.</p>
              </Card>
            </aside>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
