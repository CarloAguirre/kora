import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { estimationAnalysisArtifactSchema, isQuotationDraftEligibleProject, quotationDraftDataSchema, effectiveQuotationEdt, projectPocRolesToQuotationDraft, type EstimationAnalysisArtifact, type QuotationDraftData, type QuotationVersion, type UpdateQuotationDraftInput } from '@kora/contracts';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useProjectDetail } from '@/modules/projects/api/projects.queries';
import { useTeamsList } from '@/modules/teams/api/teams.queries';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { Badge } from '@/shared/components/ui/Badge';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { TextField } from '@/shared/components/ui/TextField';
import { useAppliedQuotationPlanning, useCreateQuotationVersion, useProjectQuotation, useSaveQuotationDraft, useQuotationLifecycle } from '../api/quotation.queries';
import { AnalysisEvidenceCard } from '../components/AnalysisEvidenceCard';
import { QuotationVersionComparison } from '../components/QuotationVersionComparison';
import { QuotationTransferPreviewCard } from '../components/QuotationTransferPreviewCard';
import { QuotationCommercialPreflightCard } from '../components/QuotationCommercialPreflightCard';
import { AiPocRoleMappingCard } from '../components/AiPocRoleMappingCard';
import { QuotationPlanningAcceptanceCard } from '../components/QuotationPlanningAcceptanceCard';
import { QuotationCommercialLifecycleCard } from '../components/QuotationCommercialLifecycleCard';
import { QuotationCommercialSummary } from '../components/QuotationCommercialSummary';
import { QuotationPhaseWorkspace } from '../components/QuotationPhaseWorkspace';
import { QuotationCommercialSections } from '../components/QuotationCommercialSections';
import { NewProjectQuotationModal } from '../components/NewProjectQuotationModal';
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
  const { user } = useAuth();
  const { can } = usePermissions();
  const { projectId: projectRef } = useParams<{ projectId: string }>();
  const [params, setParams] = useSearchParams();
  // El segmento de la ruta puede ser un slug; la API de cotizaciones usa el UUID.
  const projectQuery = useProjectDetail(projectRef ?? null);
  const project = projectQuery.data;
  const projectId = project?.id ?? null;
  const quotationQuery = useProjectQuotation(projectId);
  const appliedPlan = useAppliedQuotationPlanning(projectId);
  const createVersion = useCreateQuotationVersion(projectId ?? '');
  const saveDraft = useSaveQuotationDraft(projectId ?? '');
  const lifecycle = useQuotationLifecycle(projectId ?? '');
  const teamQuery = useTeamsList({ page: 1, pageSize: 200, isActive: true, sortField: 'name' }, { enabled: Boolean(projectId) });

  const [form, setForm] = useState<Form | null>(null);
  const [newQuotationOpen, setNewQuotationOpen] = useState(false);
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
  const editable = Boolean(mayWrite && selected?.status === 'draft' && form &&
    appliedPlan.data?.versionId !== selected?.id && !appliedPlan.isLoading);

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
        ...((current.draft.analysis || current.draft.aiPoc) && Object.keys(patch).some(
          (field) => ['mode', 'teams', 'phases', 'costs', 'paymentPlan', 'assumptions', 'exclusions'].includes(field),
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
  const effectiveEdt = form?.draft.aiPoc?.edt ? effectiveQuotationEdt(form.draft) : null;
  const aiSnapshot = selected?.draft.aiPoc;
  const aiRolesMapped = Boolean(aiSnapshot && aiSnapshot.proposal.roles.every((role) =>
    Boolean(aiSnapshot.roleTeamIds[role.role]) &&
    teamRows.some((team) => team.teamId === aiSnapshot.roleTeamIds[role.role]),
  ));
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

  const editEdtHours = (wbs: string, role: string, hours: number) => {
    if (!editable) return;
    try {
      change((current) => {
        const source = current.draft.aiPoc?.edt;
        if (!source) return current;
        const task = source.modules.flatMap((module) => module.tasks)
          .find((item) => item.wbs === wbs);
        const initial = task?.roleEffort?.find((item) => item.role === role)?.hours ??
          (task?.role === role ? task.hours : null);
        if (initial === null || !Number.isFinite(hours) || hours <= 0) return current;
        const edits = current.draft.edtHourAdjustments.filter((entry) =>
          entry.wbs !== wbs || entry.role !== role);
        if (Math.abs(initial - hours) > 0.0001) edits.push({ wbs, role, hours });
        const nextDraft: QuotationDraftData = {
          ...current.draft, edtHourAdjustments: edits,
          analysisProjectionStatus: 'modified',
        };
        const roleTeamIds = nextDraft.aiPoc?.roleTeamIds ?? {};
        const mapped = nextDraft.aiPoc?.proposal.roles.every((item) =>
          Boolean(roleTeamIds[item.role]) && nextDraft.teams.some(
            (team) => team.teamId === roleTeamIds[item.role])) ?? false;
        const projected = mapped && nextDraft.mode === 'phases'
          ? projectPocRolesToQuotationDraft(nextDraft, roleTeamIds) : nextDraft;
        return { ...current, draft: projected };
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'HH no válidas para el WBS y perfil.');
    }
  };

  const acceptAiProposal = async () => {
    if (!selected || !editable || dirty || selected.status !== 'draft' ||
      selected.aiReviewStatus !== 'pending' || !aiRolesMapped ||
      selected.id !== versions.at(-1)?.id || lifecycle.acceptAi.isPending) return;
    if (!window.confirm('Aceptar la propuesta de Gemini no aprueba al cliente ni traspasa el proyecto. ¿Confirmas?')) return;
    setError('');
    setNotice('');
    try {
      await lifecycle.acceptAi.mutateAsync({ versionId: selected.id, revision: selected.revision });
      setNotice('Propuesta IA aceptada. La aprobación del cliente es una acción posterior.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aceptar la propuesta de IA.');
    }
  };

  return (
    <DashboardLayout title="Proyectos" containedScroll>
      <main className={styles.page}>
        {project && <h1 className={styles.projectTitle}>{project.name}</h1>}
        <nav className={styles.breadcrumb} aria-label="Navegación de cotización">
          <Link to={project ? '/proyectos/' + project.slug : '/proyectos'}>‹ Volver a la ficha del proyecto</Link>
          <Link className={styles.listLink} to="/calculadora">Ver todas las cotizaciones</Link>
        </nav>

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
                <div className={styles.identityHeading}>
                  <div>
                    <h2>Cotización · {project?.client?.companyName ?? project?.name ?? 'Proyecto'}</h2>
                  </div>
                  <Badge tone={selected?.status === 'approved' ? 'success' : selected?.status === 'sent' ? 'info' : 'neutral'}>
                    {selected?.status === 'approved' ? 'Aprobada' : selected?.status === 'sent' ? 'Enviada' : 'Cotización'}
                  </Badge>
                </div>
                <div className={styles.versions}>
                  {versions.map((version) => (
                    <button key={version.id} type="button" onClick={() => selectVersion(version.id)}
                      aria-label={'Abrir versión ' + version.versionNumber}
                      aria-pressed={selected?.id === version.id} title={version.name}
                      className={[styles.version, selected?.id === version.id ? styles.selected : ''].join(' ')}>
                      v{version.versionNumber}{version.origin === 'ai' ? ' ✦' : ''}
                    </button>
                  ))}
                  {mayWrite && <>
                    <button type="button" className={styles.textAction} disabled={createVersion.isPending}
                      onClick={() => void newVersion(selected?.id)}>+ Nueva versión</button>
                    <button type="button" className={styles.textAction + ' ' + styles.aiAction}
                      onClick={() => {
                        if (dirty && !window.confirm('Hay cambios sin guardar. ¿Deseas descartarlos?')) return;
                        setNewQuotationOpen(true);
                      }}>✦ Nueva versión con IA</button>
                    <button type="button" className={styles.textAction} disabled={createVersion.isPending}
                      onClick={() => void newVersion()}>En blanco</button>
                    {editable && dirty &&
                      <Button size="sm" className={styles.saveDraftAction}
                        loading={saveDraft.isPending} onClick={() => void save()}>
                        Guardar borrador
                      </Button>}
                  </>}
                </div>
                {selected && form && <>
                  <div className={styles.identityFields}>
                    <TextField label="Nombre de la versión" value={form.name} maxLength={200} disabled={!editable}
                      onChange={(e) => change((current) => ({ ...current, name: e.target.value }))} />
                    <div className={styles.readonlyField}>
                      <span>Origen · fecha</span>
                      <strong>{selected.origin === 'ai' ? 'Agente IA' : selected.origin === 'copy' ? 'Copia' : 'Manual'} · {new Date(selected.createdAt).toLocaleDateString('es-CL')}</strong>
                    </div>
                    <div className={styles.statusField}>
                      <span>Estado</span>
                      <Badge tone={selected.status === 'approved' ? 'success' : selected.status === 'sent' ? 'info' : 'neutral'}>
                        {selected.status === 'approved' ? 'Aprobada' : selected.status === 'sent' ? 'Enviada al cliente' : 'Borrador'}
                      </Badge>
                    </div>
                  </div>
                  {selected.origin === 'ai' && selected.aiReviewStatus === 'pending' && (
                    <div className={styles.aiBanner}>
                      <div><strong>✦ Propuesta generada con Gemini</strong>
                        <p>{selected.draft.aiPoc
                          ? money(selected.draft.aiPoc.proposal.totalHours) + ' HH propuestas desde KDM de demostración y ' + selected.draft.aiPoc.answers.length + ' respuestas. '
                          : 'Propuesta IA pendiente. '}
                          Revisa perfiles y HH antes de aceptar. La IA no define el valor HH comercial.</p>
                      </div>
                      {selected.draft.aiPoc && (
                        <Button size="sm" className={styles.aiAccept}
                          disabled={!editable || dirty || !aiRolesMapped ||
                            selected.id !== versions.at(-1)?.id || lifecycle.acceptAi.isPending}
                          loading={lifecycle.acceptAi.isPending}
                          title={!aiRolesMapped
                            ? 'Asigna todos los perfiles IA a equipos activos y guarda la versión.'
                            : dirty ? 'Guarda los cambios antes de aceptar la propuesta.' : undefined}
                          onClick={() => void acceptAiProposal()}>
                          Aceptar propuesta
                        </Button>
                      )}
                    </div>
                  )}
                </>}
                {versions.length === 0 && <p className={styles.helper}>Aún no hay versiones. Crea un borrador para comenzar.</p>}
              </Card>


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
                     <div className={styles.cardTitle}><h2>Valor HH del proyecto</h2></div>
                     <div className={styles.priceGrid}>
                       <TextField label="Valor HH" type="number" min={0} step="0.0001" placeholder="Ej. 0,62"
                         value={form.hourlyRate ?? ''} disabled={!editable}
                         onChange={(e) => change((current) => ({ ...current, hourlyRate: e.target.value === '' ? null : numeric(e.target.value) }))} />
                       <Select label="Moneda" value={form.currency} disabled={!editable}
                         options={[{ value: 'UF', label: 'UF' }, { value: 'CLP', label: 'CLP' }, { value: 'USD', label: 'USD' }]}
                         onChange={(e) => change((current) => ({ ...current, currency: e.target.value as Form['currency'] }))} />
                       <Select label="Impuesto" value={form.tax} disabled={!editable}
                         options={[{ value: 'iva19', label: 'Neto + IVA 19%' }, { value: 'igv18', label: 'Neto + IGV 18%' }, { value: 'exempt', label: 'Exento' }]}
                         onChange={(e) => change((current) => ({ ...current, tax: e.target.value as Form['tax'] }))} />
                     </div>
                   </Card>

                  <Card>
                    <div className={styles.teamsHeading}>
                      <div><h2>Equipos</h2><p>Las HH se suman según la modalidad de estimación. Los líderes se asignan en Kora.</p></div>
                      {editable
                        ? <SegmentedControl aria-label="Modalidad de estimación"
                            options={[{ value: 'team', label: 'Por equipo' }, { value: 'phases', label: 'Por fases y módulos' }]}
                            value={form.draft.mode}
                            onChange={(mode) => updateDraft({ mode: mode as QuotationDraftData['mode'] })} />
                        : <span className={styles.readonlyMode}>{form.draft.mode === 'team' ? 'Por equipo' : 'Por fases y módulos'}</span>}
                    </div>
                    {form.draft.mode === 'phases' && phaseRows.length === 0 && teamRows.length > 0 && (
                      <p className={styles.modeNotice} role="status">
                        No hay fases configuradas. Esta modalidad calcula HH desde las fases,
                        no desde la duración de cada equipo; agrega una fase para distribuirlas.
                      </p>
                    )}
                    <div className={styles.teamOverview}>
                      <div className={styles.teamColumns}>
                        <span>Equipo</span><span>N° colab.</span><span>Horas</span>
                      </div>
                      {teamRows.map((team, index) => {
                        const name = teamById.get(team.teamId) ?? 'Equipo no disponible';
                        const hours = form.draft.mode === 'team'
                          ? team.collaborators * (team.unit === 'day' ? team.duration / 5 : team.duration) *
                            team.hoursPerWeek * team.dedicationPercent / 100
                          : phaseRows.reduce((sum, phase) =>
                            sum + (phase.teamHours.find((row) => row.teamId === team.teamId)?.hours ?? 0), 0);
                        const category = name.toLocaleLowerCase('es');
                        const color = category.includes('desarrollo') || category.includes('dev') ? 'var(--kora-orange)'
                          : category.includes('qa') ? 'var(--kora-blue-link)'
                          : category.includes('ux') || category.includes('diseño') ? 'var(--kora-success)'
                          : category.includes('pmo') ? 'var(--kora-text-muted)'
                          : category.includes('rpa') ? 'var(--kora-cyan)' : 'var(--kora-blue-400)';
                        return (
                          <div className={styles.teamLine} key={team.teamId}>
                            <label className={styles.teamLabel}>
                              <input type="checkbox" checked disabled={!editable}
                                aria-label={'Incluir ' + name}
                                onChange={() => updateDraft({
                                  teams: teamRows.filter((_, i) => i !== index),
                                  phases: phaseRows.map((p) => ({
                                    ...p, teamHours: p.teamHours.filter((h) => h.teamId !== team.teamId),
                                  })),
                                })} />
                              <span className={styles.teamDot} style={{ background: color }} aria-hidden="true" />
                              <strong>{name}</strong>
                            </label>
                            <input className={styles.collabInput} aria-label={'Colaboradores de ' + name}
                              type="number" min={1} max={100} disabled={!editable} value={team.collaborators}
                              onChange={(event) => editTeam(index, { collaborators: numeric(event.target.value) })} />
                            <strong className={styles.teamHours}>{money(hours)} HH</strong>
                          </div>
                        );
                      })}
                      {available.filter((team) => ['desarrollo', 'pmo', 'qa', 'rpa', 'ux', 'diseño', 'inteligencia', 'ia']
                        .some((keyword) => team.name.toLocaleLowerCase('es').includes(keyword))).slice(0, 8)
                        .map((team) => {
                          const name = team.name.toLocaleLowerCase('es');
                          const color = name.includes('desarrollo') ? 'var(--kora-orange)'
                            : name.includes('qa') ? 'var(--kora-blue-link)'
                            : name.includes('ux') || name.includes('diseño') ? 'var(--kora-success)'
                            : name.includes('pmo') ? 'var(--kora-text-muted)'
                            : name.includes('rpa') ? 'var(--kora-cyan)' : 'var(--kora-blue-400)';
                          return (
                            <div key={team.id} className={styles.teamLine + ' ' + styles.inactiveTeam}>
                              <label className={styles.teamLabel}>
                                <input type="checkbox" checked={false} disabled={!editable}
                                  aria-label={'Incluir ' + team.name}
                                  onChange={() => updateDraft({ teams: [...teamRows, emptyTeam(team.id)] })} />
                                <span className={styles.teamDot} style={{ background: color }} aria-hidden="true" />
                                <strong>{team.name}</strong>
                              </label>
                              <input className={styles.collabInput} type="number" value={1} disabled
                                aria-label={'Colaboradores de ' + team.name} />
                              <strong className={styles.teamHours}>—</strong>
                            </div>
                          );
                        })}
                      {teamRows.length === 0 && available.length === 0 && (
                        <p className={styles.emptyTeams}>Todavía no hay HH distribuidas. Agrega equipos activos para comenzar.</p>
                      )}
                      {teamRows.length === 0 && available.length > 0 &&
                        !form.draft.aiPoc && (
                          <p className={styles.emptyTeams}>Selecciona un equipo para comenzar a distribuir las HH.</p>
                        )}
                    </div>
                    {editable && available.length > 0 && (
                      <details className={styles.addTeams}>
                        <summary>+ Agregar equipo de Kora</summary>
                        <div className={styles.availableTeams}>
                          {available.map((team) => (
                            <Button size="sm" variant="outline" key={team.id}
                              onClick={() => updateDraft({ teams: [...teamRows, emptyTeam(team.id)] })}>
                              + {team.name}
                            </Button>
                          ))}
                        </div>
                      </details>
                    )}
                    <details className={styles.advanced}>
                      <summary>Ajustes avanzados de equipos · duración, unidad y dedicación</summary>
                      <p className={styles.helper}>Horas por equipo = colaboradores × duración × HH semanales × dedicación. En modalidad por fases, las HH se toman de las fases.</p>
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
                    </details>
                  </Card>

                  {(form.draft.mode === 'phases' || form.draft.aiPoc?.edt) && (
                    <QuotationPhaseWorkspace
                      commercialMode={form.draft.mode}
                      phases={phaseRows}
                      teams={teamRows}
                      teamNames={teamById}
                      edt={effectiveEdt}
                      roleTeamIds={form.draft.aiPoc?.roleTeamIds}
                      editable={editable}
                      adjustedHoursCount={form.draft.edtHourAdjustments.length}
                      onEditTaskHours={editEdtHours}
                      onEditPhase={editPhase}
                      onAddPhase={() => updateDraft({ phases: [
                        ...phaseRows, { name: 'Nuevo módulo', startWeek: 1,
                          durationWeeks: 1, teamHours: [] },
                      ] })}
                      onRemovePhase={(index) => updateDraft({
                        phases: phaseRows.filter((_, position) => position !== index),
                      })}
                    />
                  )}

                  <div id="quotation-ai-role-review" className={styles.aiRoleReview}>
              {selected?.draft.aiPoc && form && (
                <AiPocRoleMappingCard
                  key={selected.id + ':' + selected.revision}
                  version={selected}
                  teams={activeTeams}
                  canEdit={editable}
                  hasUnsavedChanges={dirty}
                  onApply={(draft) => {
                    change((current) => ({ ...current, draft }));
                    setNotice('Proyección de HH aplicada. Guarda el borrador para persistir la distribución.');
                  }}
                />
              )}


                  </div>
                  <div className={styles.edtView} id="quotation-edt-reference">
              {selected?.draft.aiPoc?.edt && projectId && (
                <QuotationPlanningAcceptanceCard
                  key={selected.id + ':' + selected.revision}
                  version={selected}
                  teamNames={teamById}
                  roleTeamIds={form?.draft.aiPoc?.roleTeamIds}
                />
              )}


                  </div>
                  <QuotationCommercialSections
                    version={selected}
                    draft={form.draft}
                    rate={form.hourlyRate}
                    currency={form.currency}
                    editable={editable}
                    onDraftChange={updateDraft}
                  />
                </>
              )}

              {versions.length > 1 && (
                <QuotationVersionComparison versions={versions} teamNames={teamById} />
              )}
              {selected && projectId && (
                <QuotationCommercialPreflightCard key={selected.id + ':' + selected.revision}
                  projectId={projectId} version={selected} hasUnsavedChanges={dirty} />
              )}
              {selected && projectId && (
                <QuotationTransferPreviewCard projectId={projectId} version={selected} teamNames={teamById}
                  canSaveReview={mayWrite} canAssessReview={mayWrite && can('projects:manage')}
                  currentUserId={user?.id ?? null} />
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

            </section>

            <aside className={styles.sidebar}>
              <QuotationCommercialSummary
                version={selected}
                draft={form?.draft ?? null}
                hourlyRate={form?.hourlyRate ?? null}
                tax={form?.tax ?? 'iva19'}
                currency={form?.currency ?? 'UF'}
                teamNames={teamById}
                editable={editable}
                dirty={dirty}
                saving={saveDraft.isPending}
                onSave={() => void save()}
                actions={selected && project ? (
                  <QuotationCommercialLifecycleCard
                    key={selected.id + ':' + selected.revision}
                    project={project} version={selected}
                    quotation={quotation ?? null}
                    canOperate={mayWrite} hasUnsavedChanges={dirty}
                    embedded showAiAcceptance={false}
                  />
                ) : null}
              />

              {dirty && <p className={styles.pendingNotice}>Guarda los cambios de la versión antes de enviar o aprobar.</p>}
              {notice && <p role="status" className={styles.success}>{notice}</p>}
              {error && <p role="alert" className={styles.error}>{error}</p>}
            </aside>
          </div>
        )}
        {project && newQuotationOpen && (
          <NewProjectQuotationModal project={project} versions={versions} onClose={() => setNewQuotationOpen(false)} />
        )}
      </main>
    </DashboardLayout>
  );
}
