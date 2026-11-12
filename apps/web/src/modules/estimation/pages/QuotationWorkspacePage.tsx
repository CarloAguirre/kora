import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { estimationAnalysisArtifactSchema, isQuotationDraftEligibleProject, quotationDraftDataSchema, effectiveQuotationEdt, reconcilePocCommercialDraft, synchronizeQuotationEdtTeamLoad, projectPocRolesToQuotationDraft, withQuotationTaskSetting, withQuotationEdtStageSetting, quotationEdtAssignments, withQuotationCommercialStage, withoutQuotationEdtStage, withQuotationCommercialTask, withoutQuotationEdtTask, patchQuotationCommercialTask, withQuotationTaskDisplayName, type EstimationAnalysisArtifact, type QuotationDraftData, type QuotationVersion, type UpdateQuotationDraftInput } from '@kora/contracts';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useProjectDetail } from '@/modules/projects/api/projects.queries';
import { useTeamsList } from '@/modules/teams/api/teams.queries';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { DropdownMenu } from '@/shared/components/ui/DropdownMenu';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { Badge } from '@/shared/components/ui/Badge';
import { Modal } from '@/shared/components/ui/Modal';
import { useToast } from '@/shared/components/ui/Toast';
import { useConfirmAction } from '@/shared/components/ui/useConfirmAction';
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
import {
  alignQuotationEdtTeamsWithSchedule, replanQuotationEdtForWorkforce,
} from '../lib/quotation-fulltime-plan';
import { QuotationTeamsWorkspace } from '../components/QuotationTeamsWorkspace';
import { QuotationHoursRedistributionDialog } from '../components/QuotationHoursRedistributionDialog';
import { buildQuotationRedistributionPreview, type QuotationRedistributionPreview } from '../lib/quotation-hour-redistribution-preview';
import { buildQuotationTeamCapacityEdit, type QuotationTeamCapacityField } from '../lib/quotation-team-capacity-edit';
import { quotationAiAcceptanceBlockReason } from '../components/quotation-ai-acceptance';
import { readQuotationTaskExcel } from '../lib/quotation-task-excel';
import { downloadQuotationExcel, downloadQuotationPowerPoint } from '../lib/quotation-export';
import { emptyQuotationTeam, withQuotationTeamEdit } from '../lib/quotation-blank-team';
import { suggestedKoraTeamForRole } from '../components/quotation-role-team-suggestions';
import { QuotationCommercialSections } from '../components/QuotationCommercialSections';
import { QuotationDraftSaveBar } from '../components/QuotationDraftSaveBar';
import { QuotationAiReviewBanner } from '../components/QuotationAiReviewBanner';
import { NewProjectQuotationModal } from '../components/NewProjectQuotationModal';
import styles from './QuotationWorkspacePage.module.css';

type Form = Pick<UpdateQuotationDraftInput, 'name' | 'hourlyRate' | 'currency' | 'tax' | 'draft'>;

const money = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 4 });
const fromVersion = (version: QuotationVersion): Form => ({
  name: version.name, hourlyRate: version.hourlyRate, currency: version.currency,
  tax: version.tax, draft: version.draft.aiPoc?.edt
    ? synchronizeQuotationEdtTeamLoad(structuredClone(version.draft))
    : structuredClone(version.draft),
});
const numeric = (value: string): number => Math.max(0, Number(value) || 0);

const emptyTeam = emptyQuotationTeam;

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
  const [exporting, setExporting] = useState<'pptx' | 'xlsx' | null>(null);
  const [roleMappingOpen, setRoleMappingOpen] = useState(false);
  const [teamView, setTeamView] = useState<'team' | 'phases'>('phases');
  const [dirty, setDirty] = useState(false);
  const [hourPreview, setHourPreview] = useState<QuotationRedistributionPreview | null>(null);
  // Modo de revisión IA estrictamente por versión, sin modificar el artefacto
  // generado hasta que el usuario edite y guarde.
  const [adjustingAiVersionId, setAdjustingAiVersionId] = useState<string | null>(null);
  const [recentAiAcceptance, setRecentAiAcceptance] = useState<{ versionId: string; actor: string } | null>(null);
  // Si el usuario descarta la asignación sugerida por IA, no aplicarla de nuevo
  // sobre esa misma revisión guardada hasta que cambie de versión/revisión.
  const dismissedAutomaticMapping = useRef<string | null>(null);
  const toast = useToast();
  // Mensajes transitorios: usar siempre el snackbar nativo de Kora.
  const reportError = (message: string) => toast.error(message);
  const inform = (message: string) => toast.show(message);
  const reportSampleError = reportError;
  const [sampleAnalysis, setSampleAnalysis] = useState<EstimationAnalysisArtifact | null>(null);
  const [sampleTeamMap, setSampleTeamMap] = useState<Record<string, string>>({});
  const { confirm, dialog: confirmationDialog } = useConfirmAction();

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
    setAdjustingAiVersionId(null);
  }, [selected?.id]);

  useEffect(() => {
    setForm(selected ? fromVersion(selected) : null);
    setDirty(false);
    setHourPreview(null);

    setTeamView(selected?.draft.aiPoc?.edt || selected?.draft.mode === 'phases'
      ? 'phases' : 'team');
  }, [selected?.id, selected?.revision]);

  const quotationClosed = Boolean(quotation?.transferredVersionId);
  const mayWrite = Boolean(project && isQuotationDraftEligibleProject(project) && !quotationClosed);
  const editable = Boolean(mayWrite && selected?.status === 'draft' && form &&
    appliedPlan.data?.versionId !== selected?.id && !appliedPlan.isLoading);

  // Compatibilidad con cotizaciones anteriores a la generación con catálogo.
  // Reutiliza la EDT ya guardada: nunca gasta una nueva llamada Gemini.
  // Solo vincula si CADA perfil tiene una correspondencia única y no ambigua.
  useEffect(() => {
    if (!editable || dirty || !selected?.draft.aiPoc?.edt || !activeTeams.length) return;
    // No iniciar ajustes silenciosos antes de que el usuario elija «Ajustar».
    // Las cotizaciones históricas ya revisadas conservan su compatibilidad.
    if (selected.origin === 'ai' && selected.aiReviewStatus === 'pending' &&
        adjustingAiVersionId !== selected.id) return;
    if (dismissedAutomaticMapping.current === selected.id + ':' + selected.revision) return;
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
      inform('Se reconocieron los equipos reales para esta EDT existente. Guarda el borrador para conservar la distribución, sin regenerar Gemini.');
    } catch {
      // Si no concilia el artefacto histórico, preservar sus HH para revisión.
    }
  }, [editable, dirty, selected?.id, selected?.revision, activeTeams, adjustingAiVersionId]);

  const change = (update: (current: Form) => Form) => {
    setForm((current) => current ? update(current) : null);
    setDirty(true);


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
  const selectVersion = async (id: string) => {
    if (dirty && !await confirm({ title: 'Descartar cambios', description: 'Hay cambios sin guardar. ¿Deseas descartarlos?', confirmLabel: 'Descartar', destructive: true })) return;
    setParams({ version: id });

  };
  const newVersion = async (sourceVersionId?: string) => {
    if (!projectId || !mayWrite || createVersion.isPending) return;
    if (dirty && !await confirm({ title: 'Descartar cambios', description: 'Hay cambios sin guardar. ¿Deseas descartarlos?', confirmLabel: 'Descartar', destructive: true })) return;

    try {
      const created = await createVersion.mutateAsync(sourceVersionId ? { sourceVersionId } : {});
      setParams({ version: created.id });
      setForm(fromVersion(created));
      setDirty(false);
      inform('Borrador ' + created.name + ' creado.');
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'No se pudo crear la versión.');
    }
  };
  const discardChanges = () => {
    if (!editable || !selected || saveDraft.isPending) return;
    dismissedAutomaticMapping.current = selected.id + ':' + selected.revision;
    setForm(fromVersion(selected));
    setDirty(false);
    setTeamView(selected.draft.aiPoc?.edt || selected.draft.mode === 'phases'
      ? 'phases' : 'team');
    setAdjustingAiVersionId(null);
    inform('Se descartaron los cambios. Se restauró la versión guardada.');
  };

  const save = async () => {
    if (!editable || !selected || !projectId || !form || saveDraft.isPending) return;

    try {
      // Contratos compartidos: validación en navegador; el servidor vuelve a validarlo.
      const current = form.draft.aiPoc?.edt
        ? synchronizeQuotationEdtTeamLoad(form.draft) : form.draft;
      const draft = quotationDraftDataSchema.parse(current);
      const saved = await saveDraft.mutateAsync({
        versionId: selected.id,
        input: { revision: selected.revision, name: form.name, hourlyRate: form.hourlyRate,
          currency: form.currency, tax: form.tax, draft },
      });
      setForm(fromVersion(saved));
      setDirty(false);
      setAdjustingAiVersionId(null);
      toast.success('Cambios guardados en la versión. Revisión ' + saved.revision + '.');
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'No se pudo guardar. Revisa los campos.');
    }
  };


  const importSimulatedAnalysis = async (file?: File) => {
    setSampleAnalysis(null);
    setSampleTeamMap({});

    if (!file) return;
    if (file.size > 1_000_000) {
      reportSampleError('El JSON supera el límite de 1 MB para este ejemplo.');
      return;
    }
    try {
      const json: unknown = JSON.parse(await file.text());
      const validation = estimationAnalysisArtifactSchema.safeParse(json);
      if (!validation.success) {
        reportSampleError('El artefacto no coincide con el esquema o sus totales: ' +
          (validation.error.issues[0]?.message ?? 'JSON inválido.'));
        return;
      }
      if (validation.data.provenance.mode !== 'simulated_fixture') {
        reportSampleError('Este importador acepta solo simulaciones explícitas, no resultados de IA real.');
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
      reportSampleError('No se pudo interpretar el archivo JSON seleccionado.');
    }
  };

  const saveSimulatedAnalysis = async () => {
    if (!sampleAnalysis || !projectId || !mayWrite || createVersion.isPending) return;
    if (dirty && !await confirm({ title: 'Descartar cambios', description: 'Hay cambios sin guardar. ¿Deseas descartarlos?', confirmLabel: 'Descartar', destructive: true })) return;
    if (sampleAnalysis.roles.some((role) => !sampleTeamMap[role.role])) {
      reportSampleError('Asocia todos los perfiles del EDT con equipos activos de Kora.');
      return;
    }
    if (!await confirm({ title: 'Guardar demostración', description: 'El artefacto corresponde al ejemplo Zurich, no al análisis de este proyecto. ¿Deseas guardar una versión de DEMOSTRACIÓN explícitamente identificada?', confirmLabel: 'Guardar demostración', warning: 'No representa antecedentes reales del proyecto.' })) return;

    try {
      const created = await createVersion.mutateAsync({
        simulation: { analysis: sampleAnalysis, roleTeamIds: sampleTeamMap },
      });
      setParams({ version: created.id });
      setForm(fromVersion(created));
      setDirty(false);
      toast.success('Versión de demostración creada con trazabilidad y HH verificadas.');
      inform('Versión de IA simulada: pendiente de revisión.');
    } catch (err) {
      reportSampleError(err instanceof Error ? err.message : 'No se pudo guardar la simulación.');
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
    change((current) => {
      // El updater funcional evita perder la primera edición al activar un
      // equipo en blanco y luego cambiar otra celda inmediatamente.
      const draft = withQuotationTeamEdit(current.draft, teamId, patch);
      if (draft === current.draft) return current;
      // La disponibilidad del equipo no equivale a la carga real de las tareas.
      const normalized = draft.aiPoc?.edt ? synchronizeQuotationEdtTeamLoad(draft) : draft;
      return { ...current, draft: normalized };
    });
  };
  const editTeamCapacity = (
    teamId: string, field: QuotationTeamCapacityField, value: number,
  ) => {
    if (!editable || !form) return;
    try {
      const result = buildQuotationTeamCapacityEdit(form.draft, teamId, field, value);
      if (result.preview) {
        // Confirmación transaccional WBS×perfil; cancelar conserva el original.
        setHourPreview(result.preview);
      } else {
        change((current) => ({ ...current, draft: result.draft }));
      }
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message :
        'No se pudo modificar la dedicación del equipo.');
    }
  };
  const editPhase = (index: number, patch: Partial<QuotationDraftData['phases'][number]>) => {
    updateDraft({ phases: phaseRows.map((row, position) =>
      position === index ? { ...row, ...patch } : row) });
  };
  const applyEdtChanges = (draft: QuotationDraftData) => {
    try {
      quotationEdtAssignments(draft); // validación del mismo contrato que usa la API
      const saved = alignQuotationEdtTeamsWithSchedule(
        reconcilePocCommercialDraft(draft));
      change((current) => ({ ...current, draft: saved }));
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : 'No fue posible conciliar la EDT.');
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
        reportError(cause instanceof Error ? cause.message : 'No se pudo actualizar la tarea.');
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
      const preview = buildQuotationRedistributionPreview(form.draft, {
        teamKey, targetHours, stageCode, module,
      });
      if (preview.delta !== 0) setHourPreview(preview);
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message :
        'No se pudieron redistribuir las HH de este equipo.');
    }
  };
  const editEdtTaskFixed = (wbs: string, role: string, fixed: boolean) => {
    if (!editable || !form) return;
    try {
      applyEdtChanges(withQuotationTaskSetting(form.draft, wbs, role, { fixed }));
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : 'No se pudo modificar Fija.');
    }
  };
  const editEdtTaskTeam = (wbs: string, role: string, teamId: string | null) => {
    if (!editable || !form) return;
    if (teamId && !activeTeams.some((team) => team.id === teamId) &&
        !form.draft.teams.some((team) => team.teamId === teamId)) {
      reportError('El equipo seleccionado no está disponible.');
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
      reportError(cause instanceof Error ? cause.message : 'No se pudo reasignar la tarea.');
    }
  };
  const editEdtStage = (
    stageCode: string, patch: { name?: string; startWeek?: number; durationWeeks?: number },
  ) => {
    if (!editable || !form) return;
    try {
      applyEdtChanges(withQuotationEdtStageSetting(form.draft, stageCode, patch));
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : 'No se pudo actualizar el tramo.');
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
      reportError(cause instanceof Error ? cause.message : 'No se pudo agregar la fase.');
    }
  };
  const removeCommercialPhase = (code: string) => {
    if (!editable || !form) return;
    try {
      applyEdtChanges(withoutQuotationEdtStage(form.draft, code));
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : 'No se pudo quitar la fase.');
    }
  };
  const addCommercialTask = (stageCode: string) => {
    if (!editable || !form) return;
    const teamId = form.draft.phases.find((phase) => phase.name.startsWith(stageCode + ' · '))
      ?.teamHours.find((row) => row.hours > 0)?.teamId ?? activeTeams[0]?.id;
    if (!teamId || !activeTeams.some((team) => team.id === teamId)) {
      reportError('No hay equipos activos de Kora para asignar la tarea.');
      return;
    }
    try {
      const teams = form.draft.teams.some((team) => team.teamId === teamId)
        ? form.draft.teams
        : [...form.draft.teams, { ...emptyTeam(teamId), duration: 0, hoursPerWeek: 0 }];
      const task = {
        wbs: 'KT-' + crypto.randomUUID(), stageCode, name: 'Nueva tarea',
        teamId, hours: 8, fixed: false,
      };
      applyEdtChanges(withQuotationCommercialTask({ ...form.draft, teams }, task));
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : 'No se pudo agregar la tarea.');
    }
  };
  const removeCommercialTask = (wbs: string) => {
    if (!editable || !form) return;
    try {
      applyEdtChanges(withoutQuotationEdtTask(form.draft, wbs));
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : 'No se pudo quitar la tarea.');
    }
  };
  const editTaskName = (wbs: string, name: string, role?: string) => {
    if (!editable || !form) return;
    try {
      applyEdtChanges(withQuotationTaskDisplayName(form.draft, wbs, name, role));
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : 'Nombre de tarea inválido.');
    }
  };
  const importTaskExcel = async (stageCode: string, phaseName: string, file: File) => {
    if (!editable || !form) return;
    try {
      const records = await readQuotationTaskExcel(file, phaseName, activeTeams);
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
      inform(records.length + ' tareas importadas a la fase. Guarda el borrador para persistirlas.');
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : 'No se pudo leer el Excel.');
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
  const editMappedDuration = (teamId: string, maxWeeks: number) => {
    if (!editable || !form) return;
    try {
      const candidate = replanQuotationEdtForWorkforce(
        form.draft, { teamId, maxWeeks });
      applyEdtChanges(candidate);
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message :
        'El plazo solicitado no es viable con las tareas EDT.');
    }
  };
  const editMappedCollaborators = (teamId: string, collaborators: number) => {
    if (!editable || !form) return;
    try {
      const updated = withQuotationTeamEdit(form.draft, teamId, { collaborators });
      // El número de personas modifica el calendario, nunca las HH de WBS.
      applyEdtChanges(replanQuotationEdtForWorkforce(updated));
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message :
        'No se pudo replanificar el calendario a 40 HH semanales.');
    }
  };
  const toggleTeam = (teamId: string, checked: boolean) => {
    if (!editable || !form?.draft) return;
    if (form.draft.aiPoc?.edt) {
      if (!checked && quotationEdtAssignments(form.draft).some((row) => row.teamKey === teamId)) {
        reportError('Reasigna primero las tareas EDT de este equipo desde Por fases y módulos antes de desactivarlo.');
        return;
      }
      const next = checked
        ? { ...form.draft, teams: [...teamRows, { ...emptyTeam(teamId), hoursPerWeek: 0 }] }
        : { ...form.draft, teams: teamRows.filter((item) => item.teamId !== teamId) };
      // Una selección sin tareas todavía no pertenece a la proyección derivada.
      // No conciliar aquí: al reasignar actividades por fase sí se calcularán sus HH.
      quotationEdtAssignments(next);
      const normalized = synchronizeQuotationEdtTeamLoad(next);
      change((current) => ({ ...current, draft: normalized }));
      inform(checked
        ? 'Equipo incorporado. Asigna tareas desde Por fases y módulos antes de aprobar.'
        : 'Equipo sin tareas retirado de esta cotización.');
      return;
    }
    updateDraft(checked
      ? { teams: [...teamRows, emptyTeam(teamId)] }
      : { teams: teamRows.filter((item) => item.teamId !== teamId),
          phases: phaseRows.map((phase) => ({ ...phase,
            teamHours: phase.teamHours.filter((item) => item.teamId !== teamId),
          })) });
  };
  const exportQuotation = async (format: 'pptx' | 'xlsx') => {
    if (!project || !selected || exporting) return;
    if (dirty) {
      reportError('Guarda o descarta los cambios antes de exportar la versión.');
      return;
    }
    setExporting(format);
    try {
      const context = { project, version: selected, teamNames: teamById };
      if (format === 'pptx') await downloadQuotationPowerPoint(context);
      else await downloadQuotationExcel(context);
      inform('Archivo ' + format.toUpperCase() + ' generado desde la versión guardada.');
    } catch (error) {
      reportError(error instanceof Error ? error.message : 'No se pudo exportar la cotización.');
    } finally { setExporting(null); }
  };
  const acceptAiProposal = async () => {
    if (!selected || lifecycle.acceptAi.isPending) return;
    if (aiAcceptBlockReason) { reportError(aiAcceptBlockReason); return; }
    // «Usar tal cual» es la confirmación explícita del usuario.
    // El backend vuelve a validar revisión, equipos y conciliación antes de aceptar.
    try {
      await lifecycle.acceptAi.mutateAsync({ versionId: selected.id, revision: selected.revision });
      setAdjustingAiVersionId(null);
      setRecentAiAcceptance({ versionId: selected.id, actor: user?.fullName?.trim() ?? '' });
      toast.success('Propuesta IA aceptada. La aprobación del cliente es una acción posterior.');
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'No se pudo aceptar la propuesta de IA.');
    }
  };

  return (
    <DashboardLayout title="Proyectos" containedScroll>
      <main className={styles.page}>
        {project && (
          <div className={styles.projectHeading}>
            <h1 className={styles.projectTitle}>{project.name}</h1>
            {selected && (
              <DropdownMenu align="right"
                trigger={({ onClick, open }) => (
                  <Button variant="outline" size="sm" onClick={onClick}
                    disabled={Boolean(exporting)} loading={Boolean(exporting)}
                    aria-haspopup="menu" aria-expanded={open}>Exportar ▾</Button>
                )}
                items={[
                  { key: 'pptx', label: 'PowerPoint (.pptx)', onSelect: () => { void exportQuotation('pptx'); } },
                  { key: 'xlsx', label: 'Excel (.xlsx)', onSelect: () => { void exportQuotation('xlsx'); } },
                ]}
              />
            )}
          </div>
        )}
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
            <p>{quotationClosed
              ? 'Cotización cerrada: ya fue aprobada y traspasada al proyecto. Las versiones son históricas y no se pueden generar otras nuevas.'
              : 'Este proyecto no permite crear ni editar borradores en su etapa comercial actual.'}</p>
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
                    {selected && quotation?.transferredVersionId === selected.id ? 'Cerrada · traspasada' :
                      selected?.status === 'approved' ? 'Aprobada por el cliente' : selected?.status === 'sent' ? 'Enviada' : 'Cotización'}
                  </Badge>
                </div>
                <div className={styles.versions}>
                  {versions.map((version) => (
                    <Button key={version.id} size="sm"
                      variant={selected?.id === version.id ? 'secondary' : 'outline'}
                      className={styles.version}
                      onClick={() => void selectVersion(version.id)}
                      aria-label={'Abrir versión ' + version.versionNumber}
                      aria-pressed={selected?.id === version.id} title={version.name}>
                      v{version.versionNumber}{version.origin === 'ai' ? ' ✦' : ''}
                    </Button>
                  ))}
                  {mayWrite && <>
                    <Button variant="tertiary" size="sm" disabled={createVersion.isPending}
                      onClick={() => void newVersion(selected?.id)}>+ Nueva versión</Button>
                    <Button variant="tertiary" size="sm" disabled={createVersion.isPending}
                      onClick={() => void (async () => {
                        if (dirty && !await confirm({ title: 'Descartar cambios', description: 'Hay cambios sin guardar. ¿Deseas descartarlos?', confirmLabel: 'Descartar', destructive: true })) return;
                        setNewQuotationOpen(true);
                      })()}>✦ Nueva versión con IA</Button>
                    <Button variant="tertiary" size="sm" disabled={createVersion.isPending}
                      onClick={() => void newVersion()}>En blanco</Button>
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
                        {quotation?.transferredVersionId === selected.id ? 'Cerrada · traspasada' :
                          selected.status === 'approved' ? 'Aprobada por el cliente' : selected.status === 'sent' ? 'Enviada al cliente' : 'Borrador'}
                      </Badge>
                    </div>
                  </div>
                  {/* Tras editar desaparece el bloque inicial, pero la aceptación IA
                      sigue disponible para la versión guardada. Guardar los ajustes no
                      equivale a aceptar la IA ni a registrar aprobación del cliente. */}
                  {selected.origin === 'ai' && selected.revision === 1 &&
                    !dirty && adjustingAiVersionId !== selected.id && (
                    <QuotationAiReviewBanner
                      version={selected}
                      adjusting={adjustingAiVersionId === selected.id}
                      editable={editable}
                      dirty={dirty}
                      saving={saveDraft.isPending}
                      accepting={lifecycle.acceptAi.isPending}
                      acceptedBy={recentAiAcceptance?.versionId === selected.id
                        ? recentAiAcceptance.actor : undefined}
                      onAdjust={() => setAdjustingAiVersionId(selected.id)}
                      onAccept={() => void acceptAiProposal()}
                      onDiscard={discardChanges}
                      onSave={() => void save()}
                    />
                  )}
                  {selected.origin === 'ai' && selected.aiReviewStatus === 'pending' &&
                    selected.revision > 1 && (
                    <div className={styles.aiAcceptanceAction}>
                      <span>Propuesta IA pendiente de aceptación.</span>
                      <Button size="sm" variant="secondary"
                        disabled={!editable || dirty}
                        loading={lifecycle.acceptAi.isPending}
                        title={dirty
                          ? 'Guarda o descarta los cambios antes de aceptar la propuesta.'
                          : aiAcceptBlockReason ?? 'Aceptar la propuesta IA guardada, sin aprobar al cliente.'}
                        onClick={() => void acceptAiProposal()}>
                        Usar tal cual
                      </Button>
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
                        // Los tabs solo cambian el resumen superior cuando ya
                        // existen fases o una EDT. Nunca modificar el modo de
                        // cálculo ni ocultar la sección inferior de tareas.
                        if (!form.draft.aiPoc?.edt && form.draft.phases.length === 0) {
                          updateDraft({ mode: view });
                        }
                      }}
                      onEditTeam={editTeamById}
                      onEditTeamCapacity={editTeamCapacity}
                      onToggleTeam={toggleTeam}
                      onEditGroupHours={(teamKey, hours) =>
                        adjustEdtGroupHours(teamKey, hours)}
                      onEditRoleCollaborators={editRoleCollaborators}
                      onEditMappedCollaborators={editMappedCollaborators}
                      onEditMappedDuration={editMappedDuration}
                      mappingAction={form.draft.aiPoc && !aiRolesMapped
                        ? <Button variant="tertiary" size="sm"
                            disabled={dirty}
                            title={dirty ? 'Guarda el borrador antes de revisar la asignación de perfiles.' : undefined}
                            onClick={() => setRoleMappingOpen(true)}>
                            ✦ Resolver correspondencia pendiente con equipos Kora
                          </Button> : null}
                    />
                  </Card>

                  {/* El desglose de fases permanece visible bajo ambos tabs del
                      resumen. La fuente es la EDT o las fases de la cotización,
                      no la opción de presentación «Por equipo». */}
                  {(form.draft.mode === 'phases' ||
                    Boolean(form.draft.aiPoc?.edt) ||
                    form.draft.phases.length > 0) && (
                    <QuotationPhaseWorkspace
                      commercialMode={form.draft.mode}
                      draft={form.draft}
                      phases={phaseRows}
                      teams={teamRows}
                      teamNames={teamById}
                      activeTeams={activeTeams}
                      edt={effectiveEdt}
                      roleTeamIds={form.draft.aiPoc?.roleTeamIds}
                      editable={editable}
                      onEditTaskHours={editEdtHours}
                      onEditTaskFixed={editEdtTaskFixed}
                      onEditTaskTeam={editEdtTaskTeam}
                      onAddTask={addCommercialTask}
                      onDeleteTask={removeCommercialTask}
                      onEditTaskName={editTaskName}
                      onImportTaskExcel={importTaskExcel}
                      onRemoveCommercialPhase={removeCommercialPhase}
                      onEditGroupHours={adjustEdtGroupHours}
                      onEditStage={editEdtStage}
                      onOpenRoleMapping={() => {
                        if (dirty) {
                          reportError('Guarda el borrador antes de asociar perfiles a equipos.');
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

              <details className={styles.technicalPanel} hidden style={{ display: 'none' }} aria-hidden="true">
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

                              }} />
                          </div>
                        ))}
                      </div>
                      <p className={styles.helper}>La reserva no se suma a la cotización. Tarifa, impuesto y plan comercial requieren revisión humana. Se conserva el artefacto con ERS/EDT para futura generación documental.</p>
                      <Button
                        disabled={createVersion.isPending}
                        loading={createVersion.isPending}
                        onClick={() => void saveSimulatedAnalysis()}>
                        Crear versión de IA simulada
                      </Button>
                    </div>
                  )}
                </Card>
              )}

              </details>

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
                    key={selected.id}
                    project={project} version={selected}
                    quotation={quotation ?? null}
                    canOperate={mayWrite} hasUnsavedChanges={dirty}
                    embedded showAiAcceptance={false}
                  />
                ) : null}
              />

            </aside>
          </div>
        )}
        <QuotationDraftSaveBar
          visible={editable && (dirty || (adjustingAiVersionId === selected?.id &&
            selected?.aiReviewStatus === 'pending' && selected?.origin === 'ai'))}
          dirty={dirty}
          saving={saveDraft.isPending}
          fromAi={Boolean(selected?.draft.aiPoc)}
          onDiscard={discardChanges}
          onSave={() => void save()}
        />
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
                inform('Perfiles asociados. Guarda el borrador para conservar la distribución.');
              }}/>
          )}
        </Modal>
        <QuotationHoursRedistributionDialog
          preview={hourPreview}
          teamName={hourPreview ? teamById.get(hourPreview.teamKey) ??
            hourPreview.teamKey.replace(/^profile:/, '') : ''}
          phaseName={hourPreview?.stageCode
            ? form?.draft.phases.find((phase) =>
                phase.name.startsWith(hourPreview.stageCode + ' · '))?.name.split(' · ').slice(1).join(' · ') ??
              hourPreview.module ?? hourPreview.stageCode
            : undefined}
          onCancel={() => setHourPreview(null)}
          onApply={() => {
            if (!hourPreview || !editable || !form) return;
            if (form.draft !== hourPreview.sourceDraft) {
              setHourPreview(null);
              reportError('El borrador cambió durante la vista previa. Vuelve a indicar las HH.');
              return;
            }
            applyEdtChanges(hourPreview.nextDraft);
            setHourPreview(null);
          }}/>
        {confirmationDialog}
        {project && mayWrite && newQuotationOpen && (
          <NewProjectQuotationModal project={project} versions={versions} onClose={() => setNewQuotationOpen(false)} />
        )}
      </main>
    </DashboardLayout>
  );
}
