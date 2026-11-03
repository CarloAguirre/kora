import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { estimationAnalysisArtifactSchema, isQuotationDraftEligibleProject, quotationDraftDataSchema, effectiveQuotationEdt, reconcilePocCommercialDraft, projectPocRolesToQuotationDraft, redistributeQuotationEdtHours, withQuotationTaskSetting, withQuotationEdtStageSetting, quotationEdtAssignments, withQuotationCommercialStage, withoutQuotationCommercialStage, withQuotationCommercialTask, withoutQuotationCommercialTask, patchQuotationCommercialTask, withQuotationTaskDisplayName, withQuotationTaskCatalogType, type EstimationAnalysisArtifact, type QuotationDraftData, type QuotationVersion, type UpdateQuotationDraftInput } from '@kora/contracts';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useProjectDetail } from '@/modules/projects/api/projects.queries';
import { useTeamsList } from '@/modules/teams/api/teams.queries';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { Badge } from '@/shared/components/ui/Badge';
import { Modal } from '@/shared/components/ui/Modal';
import { TextField } from '@/shared/components/ui/TextField';
import { useAppliedQuotationPlanning, useCreateQuotationVersion, useProjectQuotation, useSaveQuotationDraft, useQuotationLifecycle, useQuotationTaskTypes } from '../api/quotation.queries';
import { AnalysisEvidenceCard } from '../components/AnalysisEvidenceCard';
import { QuotationVersionComparison } from '../components/QuotationVersionComparison';
import { QuotationTransferPreviewCard } from '../components/QuotationTransferPreviewCard';
import { QuotationCommercialPreflightCard } from '../components/QuotationCommercialPreflightCard';
import { AiPocRoleMappingCard } from '../components/AiPocRoleMappingCard';
import { QuotationPlanningAcceptanceCard } from '../components/QuotationPlanningAcceptanceCard';
import { QuotationCommercialLifecycleCard } from '../components/QuotationCommercialLifecycleCard';
import { QuotationCommercialSummary } from '../components/QuotationCommercialSummary';
import { QuotationPhaseWorkspace } from '../components/QuotationPhaseWorkspace';
import { QuotationTeamsWorkspace } from '../components/QuotationTeamsWorkspace';
import { quotationAiAcceptanceBlockReason } from '../components/quotation-ai-acceptance';
import { readQuotationTaskExcel } from '../lib/quotation-task-excel';
import { suggestedKoraTeamForRole } from '../components/quotation-role-team-suggestions';
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
  const taskTypesQuery = useQuotationTaskTypes(projectId);
  const taskTypes = taskTypesQuery.data ?? [];
  const teamQuery = useTeamsList({ page: 1, pageSize: 200, isActive: true, sortField: 'name' }, { enabled: Boolean(projectId) });

  const [form, setForm] = useState<Form | null>(null);
  const [newQuotationOpen, setNewQuotationOpen] = useState(false);
  const [roleMappingOpen, setRoleMappingOpen] = useState(false);
  const [teamView, setTeamView] = useState<'team' | 'phases'>('phases');
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
    setTeamView(selected?.draft.aiPoc?.edt || selected?.draft.mode === 'phases'
      ? 'phases' : 'team');
  }, [selected?.id, selected?.revision]);

  const mayWrite = Boolean(project && isQuotationDraftEligibleProject(project));
  const editable = Boolean(mayWrite && selected?.status === 'draft' && form &&
    appliedPlan.data?.versionId !== selected?.id && !appliedPlan.isLoading);

  // Compatibilidad con cotizaciones anteriores a la generación con catálogo.
  // Reutiliza la EDT ya guardada: nunca gasta una nueva llamada Gemini.
  // Solo vincula si CADA perfil tiene una correspondencia única y no ambigua.
  useEffect(() => {
    if (!editable || dirty || !selected?.draft.aiPoc?.edt || !activeTeams.length) return;
    const evidence = selected.draft.aiPoc;
    const mapping = { ...evidence.roleTeamIds };
    if (evidence.proposal.roles.every((role) => Boolean(mapping[role.role]))) return;
    for (const role of evidence.proposal.roles) {
      if (mapping[role.role]) continue;
      const match = suggestedKoraTeamForRole(role.role, activeTeams);
      if (!match) return; // Ambigüedad: nunca inventar ni asignar un equipo.
      mapping[role.role] = match.id;
    }
    try {
      const mapped = projectPocRolesToQuotationDraft(selected.draft, mapping);
      setForm((current) => current ? { ...current, draft: mapped } : current);
      setDirty(true);
      setNotice('Se reconocieron los equipos reales para esta EDT existente. Guarda el borrador para conservar la distribución, sin regenerar Gemini.');
    } catch {
      // Si no concilia el artefacto histórico, preservar sus HH para revisión.
    }
  }, [editable, dirty, selected?.id, selected?.revision, activeTeams]);

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
          (field) => ['mode', 'teams', 'phases'].includes(field),
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
  const effectiveEdt = form?.draft.aiPoc?.edt ? effectiveQuotationEdt(form.draft) : null;
  const aiSnapshot = form?.draft.aiPoc;
  const aiRolesMapped = Boolean(aiSnapshot && aiSnapshot.proposal.roles.length > 0 &&
    aiSnapshot.proposal.roles.every((role) => {
      const teamId = aiSnapshot.roleTeamIds[role.role];
      return Boolean(teamId && activeTeams.some((team) => team.id === teamId) &&
        form?.draft.teams.some((team) => team.teamId === teamId));
    }));
  const aiAcceptBlockReason = selected ? quotationAiAcceptanceBlockReason(selected, {
    editable, dirty, isLatest: selected.id === versions.at(-1)?.id,
  }) : null;
  const editTeamById = (teamId: string, patch: Partial<QuotationDraftData['teams'][number]>) => {
    if (!editable || !form) return;
    const draft = {
      ...form.draft,
      teams: form.draft.teams.map((row) =>
        row.teamId === teamId ? { ...row, ...patch } : row),
    };
    change((current) => ({ ...current, draft }));
  };
  const editPhase = (index: number, patch: Partial<QuotationDraftData['phases'][number]>) => {
    updateDraft({ phases: phaseRows.map((row, position) =>
      position === index ? { ...row, ...patch } : row) });
  };
  const applyEdtChanges = (draft: QuotationDraftData) => {
    try {
      quotationEdtAssignments(draft); // validación del mismo contrato que usa la API
      const saved = reconcilePocCommercialDraft(draft);
      change((current) => ({ ...current, draft: saved }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible conciliar la EDT.');
    }
  };
  const editEdtHours = (wbs: string, role: string, hours: number) => {
    if (!editable || !form) return;
    const source = form.draft.aiPoc?.edt;
    if (!source) return;
    if (wbs.startsWith('KT-')) {
      try {
        applyEdtChanges(patchQuotationCommercialTask(form.draft, wbs, { hours }));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la tarea.');
      }
      return;
    }
    const original = source.modules.flatMap((module) => module.tasks).find(
      (task) => task.wbs === wbs);
    const originalHours = original?.roleEffort?.find(
      (item) => item.role === role)?.hours ??
      (original?.role === role ? original.hours : null);
    if (originalHours === null || !Number.isFinite(hours) || hours <= 0) return;
    const edits = (form.draft.edtHourAdjustments ?? []).filter(
      (item) => item.wbs !== wbs || item.role !== role);
    if (Math.abs(originalHours - hours) > 0.000001)
      edits.push({ wbs, role, hours });
    applyEdtChanges({ ...form.draft, edtHourAdjustments: edits });
  };
  const adjustEdtGroupHours = (
    teamKey: string, targetHours: number, stageCode?: string, module?: string,
  ) => {
    if (!editable || !form) return;
    try {
      applyEdtChanges(redistributeQuotationEdtHours(form.draft, {
        teamKey, targetHours, stageCode, module,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message :
        'No se pudieron redistribuir las HH de este equipo.');
    }
  };
  const editEdtTaskFixed = (wbs: string, role: string, fixed: boolean) => {
    if (!editable || !form) return;
    try {
      applyEdtChanges(withQuotationTaskSetting(form.draft, wbs, role, { fixed }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo modificar Fija.');
    }
  };
  const editEdtTaskTeam = (wbs: string, role: string, teamId: string | null) => {
    if (!editable || !form) return;
    if (teamId && !activeTeams.some((team) => team.id === teamId) &&
        !form.draft.teams.some((team) => team.teamId === teamId)) {
      setError('El equipo seleccionado no está disponible.');
      return;
    }
    try {
      const teams = teamId && !form.draft.teams.some((row) => row.teamId === teamId)
        ? [...form.draft.teams, { ...emptyTeam(teamId), duration: 0, hoursPerWeek: 0 }]
        : form.draft.teams;
      const next = withQuotationTaskSetting(
        { ...form.draft, teams }, wbs, role, { teamId });
      applyEdtChanges(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo reasignar la tarea.');
    }
  };
  const editEdtStage = (
    stageCode: string, patch: { name?: string; startWeek?: number; durationWeeks?: number },
  ) => {
    if (!editable || !form) return;
    try {
      applyEdtChanges(withQuotationEdtStageSetting(form.draft, stageCode, patch));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el tramo.');
    }
  };
  /** Las nuevas fases y tareas no modifican el artefacto de origen Gemini. */
  const addPhase = () => {
    if (!editable || !form) return;
    if (!form.draft.aiPoc?.edt) {
      updateDraft({ phases: [...phaseRows, {
        name: 'Nuevo módulo', startWeek: 1, durationWeeks: 2, teamHours: [],
      }] });
      return;
    }
    try {
      const previous = [...(form.draft.aiPoc.edt.stages ?? []),
        ...(form.draft.edtCommercialStages ?? [])];
      const last = Math.max(0, ...previous.map((stage) =>
        stage.startWeek + stage.durationWeeks - 1));
      if (last >= 520) throw new Error('El calendario ya alcanzó la semana 520.');
      const stage = {
        code: 'KS-' + crypto.randomUUID(), name: 'Nuevo módulo',
        startWeek: last + 1, durationWeeks: Math.min(2, 520 - last),
      };
      applyEdtChanges(withQuotationCommercialStage(form.draft, stage));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo agregar la fase.');
    }
  };
  const removeCommercialPhase = (code: string) => {
    if (!editable || !form) return;
    try {
      applyEdtChanges(withoutQuotationCommercialStage(form.draft, code));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo quitar la fase.');
    }
  };
  const addCommercialTask = (stageCode: string) => {
    if (!editable || !form) return;
    const teamId = form.draft.phases.find((phase) => phase.name.startsWith(stageCode + ' · '))
      ?.teamHours.find((row) => row.hours > 0)?.teamId ?? activeTeams[0]?.id;
    if (!teamId || !activeTeams.some((team) => team.id === teamId)) {
      setError('No hay equipos activos de Kora para asignar la tarea.');
      return;
    }
    try {
      const teams = form.draft.teams.some((team) => team.teamId === teamId)
        ? form.draft.teams
        : [...form.draft.teams, { ...emptyTeam(teamId), duration: 0, hoursPerWeek: 0 }];
      const task = {
        wbs: 'KT-' + crypto.randomUUID(), stageCode, name: 'Nueva tarea',
        teamId, hours: 8, fixed: false, classification: 'Sin tipo',
      };
      applyEdtChanges(withQuotationCommercialTask({ ...form.draft, teams }, task));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo agregar la tarea.');
    }
  };
  const removeCommercialTask = (wbs: string) => {
    if (!editable || !form) return;
    try {
      applyEdtChanges(withoutQuotationCommercialTask(form.draft, wbs));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo quitar la tarea.');
    }
  };
  const editTaskName = (wbs: string, name: string) => {
    if (!editable || !form) return;
    try {
      applyEdtChanges(withQuotationTaskDisplayName(form.draft, wbs, name));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nombre de tarea inválido.');
    }
  };
  const editTaskType = (wbs: string, classification: string) => {
    if (!editable || !form || !taskTypes.some((type) => type.name === classification)) return;
    try {
      applyEdtChanges(withQuotationTaskCatalogType(form.draft, wbs, classification));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Tipo de tarea inválido.');
    }
  };
  const importTaskExcel = async (stageCode: string, phaseName: string, file: File) => {
    if (!editable || !form) return;
    try {
      const records = await readQuotationTaskExcel(file, phaseName, activeTeams, taskTypes);
      if ((form.draft.edtCommercialTasks?.length ?? 0) + records.length > 240) {
        throw new Error('El borrador admite un máximo de 240 tareas comerciales.');
      }
      let next = form.draft;
      for (const record of records) {
        if (!next.teams.some((team) => team.teamId === record.teamId)) {
          next = { ...next, teams: [...next.teams,
            { ...emptyTeam(record.teamId), duration: 0, hoursPerWeek: 0 }] };
        }
        next = withQuotationCommercialTask(next, {
          wbs: 'KT-' + crypto.randomUUID(), stageCode, ...record, fixed: false,
        });
      }
      applyEdtChanges(next); // operación atómica: sin importación parcial
      setNotice(records.length + ' tareas importadas a la fase. Guarda el borrador para persistirlas.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo leer el Excel.');
    }
  };
  const editRoleCollaborators = (role: string, collaborators: number) => {
    if (!editable || !form) return;
    const next = [
      ...(form.draft.edtRoleCollaborators ?? []).filter((item) => item.role !== role),
      { role, collaborators },
    ];
    applyEdtChanges({ ...form.draft, edtRoleCollaborators: next });
  };
  const editMappedCollaborators = (teamId: string, collaborators: number) => {
    editTeamById(teamId, { collaborators });
  };
  const toggleTeam = (teamId: string, checked: boolean) => {
    if (!editable || !form?.draft || form.draft.aiPoc?.edt) return;
    updateDraft(checked
      ? { teams: [...teamRows, emptyTeam(teamId)] }
      : { teams: teamRows.filter((item) => item.teamId !== teamId),
          phases: phaseRows.map((phase) => ({ ...phase,
            teamHours: phase.teamHours.filter((item) => item.teamId !== teamId),
          })) });
  };
  const acceptAiProposal = async () => {
    if (!selected || aiAcceptBlockReason || lifecycle.acceptAi.isPending) return;
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
                          {aiAcceptBlockReason ?? 'Revisa perfiles y HH antes de aceptar.'} La IA no define el valor HH comercial.</p>
                      </div>
                      {selected.draft.aiPoc && (
                        <Button size="sm" className={styles.aiAccept}
                          disabled={Boolean(aiAcceptBlockReason) || lifecycle.acceptAi.isPending}
                          loading={lifecycle.acceptAi.isPending}
                          title={aiAcceptBlockReason ?? undefined}
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
                    <QuotationTeamsWorkspace
                      draft={form.draft}
                      editable={editable}
                      teamNames={teamById}
                      activeTeams={activeTeams}
                      view={teamView}
                      onChangeView={(view) => {
                        setTeamView(view);
                        // En una EDT las tareas son la fuente de HH. Este switch
                        // cambia la vista, nunca la modalidad del cálculo.
                        if (!form.draft.aiPoc?.edt) updateDraft({ mode: view });
                      }}
                      onEditTeam={editTeamById}
                      onToggleTeam={toggleTeam}
                      onEditGroupHours={(teamKey, hours) =>
                        adjustEdtGroupHours(teamKey, hours)}
                      onEditRoleCollaborators={editRoleCollaborators}
                      onEditMappedCollaborators={editMappedCollaborators}
                      mappingAction={form.draft.aiPoc && !aiRolesMapped
                        ? <button type="button" className={styles.mappingLink}
                            disabled={dirty}
                            title={dirty ? 'Guarda el borrador antes de revisar la asignación de perfiles.' : undefined}
                            onClick={() => setRoleMappingOpen(true)}>
                            ✦ Resolver correspondencia pendiente con equipos Kora
                          </button> : null}
                    />
                  </Card>

                  {teamView === 'phases' &&
                    (form.draft.mode === 'phases' || form.draft.aiPoc?.edt) && (
                    <QuotationPhaseWorkspace
                      commercialMode={form.draft.mode}
                      draft={form.draft}
                      phases={phaseRows}
                      teams={teamRows}
                      teamNames={teamById}
                      activeTeams={activeTeams}
                      taskTypes={taskTypes}
                      edt={effectiveEdt}
                      roleTeamIds={form.draft.aiPoc?.roleTeamIds}
                      editable={editable}
                      onEditTaskHours={editEdtHours}
                      onEditTaskFixed={editEdtTaskFixed}
                      onEditTaskTeam={editEdtTaskTeam}
                      onAddTask={addCommercialTask}
                      onDeleteTask={removeCommercialTask}
                      onEditTaskName={editTaskName}
                      onEditTaskType={editTaskType}
                      onImportTaskExcel={importTaskExcel}
                      onRemoveCommercialPhase={removeCommercialPhase}
                      onEditGroupHours={adjustEdtGroupHours}
                      onEditStage={editEdtStage}
                      onOpenRoleMapping={() => {
                        if (dirty) {
                          setError('Guarda el borrador antes de asociar perfiles a equipos.');
                          return;
                        }
                        setRoleMappingOpen(true);
                      }}
                      onEditPhase={editPhase}
                      onAddPhase={addPhase}
                      onRemovePhase={(index) => updateDraft({
                        phases: phaseRows.filter((_, position) => position !== index),
                      })}
                    />
                  )}

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

              {false && <details className={styles.technicalPanel}>
                <summary>Auditoría técnica, EDT original y herramientas de traspaso</summary>
                {selected?.draft.aiPoc?.edt && (
                  <div id="quotation-edt-reference">
                    <QuotationPlanningAcceptanceCard
                      key={selected.id + ':' + selected.revision}
                      version={selected} teamNames={teamById}
                      roleTeamIds={form?.draft.aiPoc?.roleTeamIds}
                    />
                  </div>
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

              </details>}

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
        <Modal open={roleMappingOpen && Boolean(selected?.draft.aiPoc)}
          title="Asignar perfiles a equipos de Kora" wide
          onClose={() => setRoleMappingOpen(false)}>
          {selected?.draft.aiPoc && (
            <AiPocRoleMappingCard
              key={selected.id + ':' + selected.revision}
              version={selected} teams={activeTeams}
              canEdit={editable} hasUnsavedChanges={dirty}
              onApply={(draft) => {
                change((current) => ({ ...current, draft }));
                setRoleMappingOpen(false);
                setTeamView('phases');
                setNotice('Perfiles asociados. Guarda el borrador para conservar la distribución.');
              }}/>
          )}
        </Modal>
        {project && newQuotationOpen && (
          <NewProjectQuotationModal project={project} versions={versions} onClose={() => setNewQuotationOpen(false)} />
        )}
      </main>
    </DashboardLayout>
  );
}
