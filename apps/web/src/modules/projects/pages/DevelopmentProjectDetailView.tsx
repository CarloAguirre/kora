import { useMemo, useState } from 'react';
import {
  addProjectObservationSchema,
  assignProjectTeamMemberSchema,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  type AddProjectObservationInput,
  type AssignProjectTeamMemberInput,
  type ProjectDetail,
  type ProjectStatus,
  type ProjectTeamMember,
} from '@kora/contracts';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styles from './ProjectDetailPage.module.css';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { useToast } from '@/shared/components/ui/Toast';
import { TrashIcon } from '@/shared/components/icons/Icons';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import { ProjectTypeBadge } from '../components/ProjectTypeBadge';
import { ProjectPhaseBadge } from '../components/ProjectPhaseBadge';
import { ProjectTimeline } from '../components/ProjectTimeline';
import { TeamHoursSummaryChart } from '../components/TeamHoursSummaryChart';
import { BitacoraCard } from '../components/BitacoraCard';
import { useAssignProjectMember, useChangeProjectStatus, useUnassignProjectMember, useAddProjectObservation } from '../api/projects.queries';
import { useHourEntriesList } from '@/modules/hours/api/hours.queries';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { ApiRequestError } from '@/shared/lib/api-client';

const STATUS_OPTIONS = PROJECT_STATUSES.map((status) => ({ value: status, label: PROJECT_STATUS_LABELS[status] }));
const formatDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '—');
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/** Colores por área — réplica de `EQUIPO_COLOR_MAP` en `LiderProyectoFicha` (v1). */
const TEAM_COLOR_MAP: Record<string, { color: string; bg: string; sigla: string }> = {
  UX: { color: 'var(--kora-success)', bg: 'var(--kora-success-surface)', sigla: 'UX' },
  'UX-UI': { color: 'var(--kora-success)', bg: 'var(--kora-success-surface)', sigla: 'UX' },
  DEV: { color: 'var(--kora-warning)', bg: 'var(--kora-warning-surface)', sigla: 'DEV' },
  Desarrollo: { color: 'var(--kora-warning)', bg: 'var(--kora-warning-surface)', sigla: 'DEV' },
  RPA: { color: 'var(--kora-success)', bg: 'var(--kora-success-surface)', sigla: 'RPA' },
  IA: { color: 'var(--kora-danger)', bg: 'var(--kora-danger-surface-soft)', sigla: 'IA' },
  QA: { color: 'var(--kora-blue-400)', bg: 'var(--kora-blue-surface-alt)', sigla: 'QA' },
};

const getTeamStyle = (teamName: string) =>
  TEAM_COLOR_MAP[teamName.toUpperCase()] ?? TEAM_COLOR_MAP[teamName] ?? {
    color: 'var(--kora-blue-600)',
    bg: 'var(--kora-blue-surface-alt)',
    sigla: teamName.slice(0, 3).toUpperCase(),
  };

/**
 * Ficha de proyecto de desarrollo — réplica de `LiderProyectoFicha` (v1, la
 * variante realmente usada en `/proyectos/:id/ficha`): datos generales,
 * KPIs, línea de tiempo por etapa, equipos asignados y bitácora. Sin
 * adjuntos en las observaciones — pendiente de Storage (ver
 * docs/PLAN-MODULOS.md). La ficha de soporte es una pantalla distinta —
 * ver `SupportProjectDetailView`.
 */
export function DevelopmentProjectDetailView({ project, projectId }: { project: ProjectDetail; projectId: string }) {
  const { can, canAny } = usePermissions();
  const { user } = useAuth();
  const toast = useToast();
  const changeStatus = useChangeProjectStatus();
  const assignMember = useAssignProjectMember();
  const unassignMember = useUnassignProjectMember();
  const addObservation = useAddProjectObservation();
  const { data: projectHourEntries } = useHourEntriesList({ projectId, page: 1, pageSize: 20, sortField: 'date', sortDirection: 'desc' });

  const [memberError, setMemberError] = useState<string | null>(null);

  const memberForm = useForm<z.input<typeof assignProjectTeamMemberSchema>, unknown, AssignProjectTeamMemberInput>({
    resolver: zodResolver(assignProjectTeamMemberSchema),
    defaultValues: { teamMemberId: '', activity: '', assignedHours: 0 },
  });

  const observationForm = useForm<z.input<typeof addProjectObservationSchema>, unknown, AddProjectObservationInput>({
    resolver: zodResolver(addProjectObservationSchema),
    defaultValues: { message: '' },
  });

  const teamSummaries = useMemo(() => {
    const byTeam = new Map<string, { teamId: string; teamName: string; memberCount: number; assignedHours: number; consumedHours: number }>();
    for (const member of project.members) {
      const existing = byTeam.get(member.teamId);
      if (existing) {
        existing.memberCount += 1;
        existing.assignedHours += member.assignedHours;
        existing.consumedHours += member.consumedHours;
      } else {
        byTeam.set(member.teamId, {
          teamId: member.teamId,
          teamName: member.teamName,
          memberCount: 1,
          assignedHours: member.assignedHours,
          consumedHours: member.consumedHours,
        });
      }
    }
    return [...byTeam.values()];
  }, [project]);

  const remainingHours = project.soldHours - project.usedHours;

  /**
   * Espejo exacto de la regla del backend (`AddProjectObservationUseCase`):
   * con `projects:manage` no hace falta más; sin él, `projects:read_assigned`
   * solo habilita el formulario si el actor participa en ESTE proyecto
   * (líder, desarrollador, responsable comercial o miembro asignado) — igual
   * que la v1 restringía la bitácora a "administradores, PMO y líderes con
   * acceso al proyecto".
   */
  const canAddObservation =
    can('projects:manage') ||
    (canAny('projects:read_assigned') &&
      user !== null &&
      (project.leader?.id === user.id ||
        project.developer?.id === user.id ||
        project.commercialManager?.id === user.id ||
        project.members.some((member) => member.userId === user.id)));

  const onStatusChange = async (status: ProjectStatus) => {
    await changeStatus.mutateAsync({ projectId, input: { status } });
    toast.success('Se actualizó el estado del proyecto.');
  };

  const onAssignMember = memberForm.handleSubmit(async (values) => {
    setMemberError(null);
    try {
      await assignMember.mutateAsync({ projectId, input: values });
      toast.success('Se asignó a la persona al proyecto.');
      memberForm.reset({ teamMemberId: '', activity: '', assignedHours: 0 });
    } catch (error) {
      setMemberError(error instanceof ApiRequestError ? error.message : 'No se pudo asignar.');
    }
  });

  const onUnassign = async (assignmentId: string) => {
    await unassignMember.mutateAsync({ projectId, assignmentId });
    toast.success('Se retiró a la persona del proyecto.');
  };

  const onAddObservation = observationForm.handleSubmit(async (values) => {
    await addObservation.mutateAsync({ projectId, input: values });
    observationForm.reset({ message: '' });
  });

  const memberColumns: Column<ProjectTeamMember>[] = [
    { key: 'fullName', header: 'Persona', render: (m) => m.fullName },
    { key: 'team', header: 'Equipo', render: (m) => m.teamName },
    { key: 'activity', header: 'Actividad', render: (m) => m.activity ?? '—' },
    { key: 'assignedHours', header: 'HH asignadas', render: (m) => formatHours(m.assignedHours) },
    { key: 'consumedHours', header: 'HH consumidas', render: (m) => formatHours(m.consumedHours) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '50px',
      render: (m) =>
        can('projects:manage') ? (
          <Button variant="ghost" size="icon" onClick={() => void onUnassign(m.id)} aria-label={`Quitar a ${m.fullName}`}>
            <TrashIcon size={16} />
          </Button>
        ) : null,
    },
  ];

  return (
    <div className={styles.layout}>
      <div className={styles.colLeft}>
        <Card>
          <div className={styles.summaryHeader}>
            <div>
              <h1 className={styles.title}>{project.name}</h1>
              <p className={styles.client}>{project.client?.companyName ?? 'Sin cliente'}</p>
            </div>
            <div className={styles.badgeRow}>
              <ProjectTypeBadge type={project.type} />
              <ProjectStatusBadge status={project.status} />
              <ProjectPhaseBadge phase={project.phase} />
            </div>
          </div>

          <div className={styles.fields}>
            <Field label="Líder" value={project.leader?.fullName} />
            <Field label="Desarrollador" value={project.developer?.fullName} />
            <Field label="Responsable comercial" value={project.commercialManager?.fullName} />
            <Field label="Fecha inicio" value={formatDate(project.startDate)} />
            <Field label="Fecha fin" value={formatDate(project.endDate)} />
          </div>

          {can('projects:manage') && (
            <div className={styles.statusRow}>
              <Select
                label="Cambiar estado"
                options={STATUS_OPTIONS}
                value={project.status}
                onChange={(event) => void onStatusChange(event.target.value as ProjectStatus)}
              />
            </div>
          )}
        </Card>

        <div className={styles.kpis}>
          <Card className={styles.kpiCard}>
            <span className={styles.kpiLabel}>HH vendidas</span>
            <span className={styles.kpiValue}>{formatHours(project.soldHours)}</span>
          </Card>
          <Card className={styles.kpiCard}>
            <span className={styles.kpiLabel}>HH consumidas</span>
            <span className={styles.kpiValue}>{formatHours(project.usedHours)}</span>
          </Card>
          <Card className={styles.kpiCard}>
            <span className={styles.kpiLabel}>HH restantes</span>
            <span className={[styles.kpiValue, remainingHours < 0 ? styles.kpiValueDanger : styles.kpiValueSuccess].join(' ')}>
              {formatHours(remainingHours)}
            </span>
          </Card>
          <Card className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Eficiencia</span>
            <span className={[styles.kpiValue, project.usedHours > project.soldHours ? styles.kpiValueDanger : styles.kpiValueSuccess].join(' ')}>
              {project.soldHours > 0 ? Math.round((project.usedHours / project.soldHours) * 100) : 0}%
            </span>
          </Card>
          <Card className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Avance real / esperado</span>
            <span className={styles.kpiValue} style={{ fontSize: 'var(--kora-text-lg)' }}>
              {project.actualProgress ?? '—'}% / {project.expectedProgress ?? '—'}%
            </span>
          </Card>
        </div>

        <Card>
          <p className={styles.sectionTitle}>Línea de tiempo</p>
          <div style={{ marginTop: 'var(--kora-space-4)' }}>
            <ProjectTimeline
              phase={project.phase}
              isActive={project.status === 'active'}
              startDate={project.startDate}
              endDate={project.estimatedDeliveryDate ?? project.endDate}
            />
          </div>
        </Card>

        <TeamHoursSummaryChart teams={teamSummaries} />

        <Card>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>Equipo asignado ({project.members.length})</p>
          </div>

          {teamSummaries.length > 0 && (
            <div className={styles.teamGrid} style={{ marginBottom: 'var(--kora-space-4)' }}>
              {teamSummaries.map((team) => {
                const style = getTeamStyle(team.teamName);
                const deviatedHours = Math.max(0, team.consumedHours - team.assignedHours);
                return (
                  <div key={team.teamId} className={styles.teamCard} style={{ background: style.bg, borderColor: style.color }}>
                    <div className={styles.teamHeader}>
                      <span className={styles.teamAvatar} style={{ background: style.color }}>
                        {style.sigla}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <p className={styles.teamName}>{team.teamName}</p>
                        <p className={styles.teamMemberCount}>
                          {team.memberCount} persona{team.memberCount === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    <div className={styles.teamStats}>
                      <span>
                        Asignadas: <span className={styles.teamStatValue}>{formatHours(team.assignedHours)}h</span>
                      </span>
                      <span>
                        Consumidas: <span className={styles.teamStatValue}>{formatHours(team.consumedHours)}h</span>
                      </span>
                    </div>
                    <p className={deviatedHours > 0 ? styles.teamHealthDanger : styles.teamHealthOk}>
                      {deviatedHours > 0 ? `Desviación: ${formatHours(deviatedHours)} hrs` : 'En rango'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          <DataTable
            caption="Miembros asignados al proyecto"
            columns={memberColumns}
            items={project.members}
            getRowKey={(m) => m.id}
            loading={false}
            error={null}
            emptyMessage="Nadie está asignado a este proyecto todavía."
          />

          {can('projects:manage') && (
            <form className={styles.inlineForm} onSubmit={onAssignMember}>
              {memberError && <p className={styles.error}>{memberError}</p>}
              <div className={styles.inlineFormRow}>
                <TextField
                  label="ID de miembro de equipo"
                  placeholder="UUID de team_members"
                  errorText={memberForm.formState.errors.teamMemberId?.message}
                  {...memberForm.register('teamMemberId')}
                />
                <TextField label="Actividad" {...memberForm.register('activity')} />
                <TextField label="HH asignadas" type="number" {...memberForm.register('assignedHours')} />
                <Button type="submit" loading={memberForm.formState.isSubmitting} loadingText="Asignando…">
                  Asignar
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>

      <div className={styles.colRight}>
        <BitacoraCard
          events={projectHourEntries?.items ?? []}
          observations={project.observations}
          canManage={canAddObservation}
          observationRegister={observationForm.register('message')}
          observationError={observationForm.formState.errors.message?.message}
          observationSubmitting={observationForm.formState.isSubmitting}
          onSubmitObservation={onAddObservation}
        />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className={styles.fieldLabel}>{label}</p>
      <p className={styles.fieldValue}>{value || '—'}</p>
    </div>
  );
}
