import { useMemo, useRef, useState } from 'react';
import { PROJECT_PHASE_LABELS, PROJECT_STATUS_LABELS, type ProjectDetail } from '@kora/contracts';
import styles from './TeamLeaderProjectView.module.css';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { Modal } from '@/shared/components/ui/Modal';
import { DataTable } from '@/shared/components/ui/DataTable';
import { Pagination, usePaginatedItems } from '@/shared/components/ui/Pagination';
import { useToast } from '@/shared/components/ui/Toast';
import { AlertIcon, PencilIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { ProjectTimeline } from './ProjectTimeline';
import { TeamTasksCard } from './TeamTasksCard';
import { TeamDeliveriesCard } from './TeamDeliveriesCard';
import deliveryModalStyles from './DeliveryModal.module.css';
import { useAssignProjectMember, useUnassignProjectMember, useUpdateProjectMember } from '../api/projects.queries';
import { useTeamMemberOptions } from '@/modules/teams/api/teams.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { ApiRequestError } from '@/shared/lib/api-client';
import { getTeamStyle } from '../utils/team-style';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');

interface TeamMemberDraftRow {
  key: string;
  assignmentId: string | null;
  teamMemberId: string;
  fullName: string;
  activity: string;
  assignedHours: string;
  consumedHours: number;
  isNew: boolean;
}

/**
 * Vista restringida de la ficha del proyecto para quien lidera SOLO un
 * equipo dentro de él (no el proyecto completo) — mismo `/proyectos/:id`,
 * `ProjectDetailPage` decide renderizar esto en vez de
 * `DevelopmentProjectDetailView` cuando el actor no tiene `projects:manage`
 * pero sí lidera uno de los equipos asignados (ver mockup
 * "10-vista-proyecto-lider-equipo.html"). Aquí gestiona a su propia gente y
 * las tareas de su equipo — el resto de la ficha (Roadmap, Bitácora,
 * Extras) queda fuera de esta vista.
 */
export function TeamLeaderProjectView({
  project,
  projectId,
  teamId,
}: {
  project: ProjectDetail;
  projectId: string;
  teamId: string;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { data: teamMemberOptions } = useTeamMemberOptions();
  const assignMember = useAssignProjectMember();
  const unassignMember = useUnassignProjectMember();
  const updateMember = useUpdateProjectMember();

  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamDraft, setTeamDraft] = useState<TeamMemberDraftRow[]>([]);
  const [savingTeam, setSavingTeam] = useState(false);
  // Key propia por fila nueva: no puede derivarse de la persona elegida,
  // porque se puede cambiar en el Select y dos filas terminarían con la misma
  // key (y `updateDraftRow` editaría ambas a la vez).
  const draftRowSeq = useRef(0);

  const team = useMemo(() => {
    const teamRow = project.teams.find((t) => t.teamId === teamId);
    const members = project.members.filter((m) => m.teamId === teamId);
    const teamName = teamRow?.teamName ?? members[0]?.teamName ?? 'Equipo';
    const leaderId = teamRow?.leader?.id ?? null;
    const leaderName = teamRow?.leader?.fullName ?? null;
    const maxMembers = teamRow?.maxMembers || null;
    const assignedHours = teamRow?.assignedHours ?? members.reduce((sum, m) => sum + m.assignedHours, 0);
    const consumedHours = members.reduce((sum, m) => sum + m.consumedHours, 0);
    return { teamId, teamName, leaderId, leaderName, maxMembers, assignedHours, consumedHours, members };
  }, [project, teamId]);
  const { pageItems: pagedMembers, pagination: membersPagination } = usePaginatedItems(team.members);

  const canManageTeam = can('projects:manage') || (user !== null && team.leaderId === user.id);

  const availableMembers = (teamMemberOptions?.items ?? []).filter((m) => m.teamId === teamId);

  const teamStyle = getTeamStyle(team.teamName);
  const totalAssignedHours = team.members.reduce((sum, m) => sum + m.assignedHours, 0);
  const hoursToAssign = Math.max(0, team.assignedHours - totalAssignedHours);

  const openTeamModal = () => {
    setTeamDraft(
      team.members.map((m) => ({
        key: m.id,
        assignmentId: m.id,
        teamMemberId: m.teamMemberId,
        fullName: m.fullName,
        activity: m.activity ?? '',
        assignedHours: String(m.assignedHours),
        consumedHours: m.consumedHours,
        isNew: false,
      })),
    );
    setTeamModalOpen(true);
  };

  const draftTotalAssigned = teamDraft.reduce((sum, row) => sum + (Number(row.assignedHours) || 0), 0);
  const draftTotalConsumed = teamDraft.reduce((sum, row) => sum + row.consumedHours, 0);
  const draftOverBudget = team.assignedHours > 0 && draftTotalAssigned > team.assignedHours;
  const usedTeamMemberIds = new Set(teamDraft.map((row) => row.teamMemberId));
  // Todo el equipo, no solo quienes no estaban asignados: si en el borrador se
  // quita o reemplaza a alguien, vuelve a quedar disponible para otra fila.
  const poolLeft = availableMembers.filter((m) => !usedTeamMemberIds.has(m.id));
  // Cupos libres según el `N° colaboradores` definido en el proyecto (nulo = sin tope).
  const slotsLeft = team.maxMembers != null ? Math.max(0, team.maxMembers - teamDraft.length) : Infinity;
  const addableCount = Math.min(poolLeft.length, slotsLeft);

  const updateDraftRow = (key: string, patch: Partial<TeamMemberDraftRow>) => {
    setTeamDraft((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const addDraftRow = () => {
    const next = poolLeft[0];
    if (!next || addableCount === 0) return;
    setTeamDraft((prev) => [
      ...prev,
      {
        key: `new-${++draftRowSeq.current}`,
        assignmentId: null,
        teamMemberId: next.id,
        fullName: next.fullName,
        activity: '',
        assignedHours: '0',
        consumedHours: 0,
        isNew: true,
      },
    ]);
  };

  const removeDraftRow = (key: string) => {
    setTeamDraft((prev) => prev.filter((row) => row.key !== key));
  };

  const onSaveTeamModal = async () => {
    if (draftOverBudget) return;
    setSavingTeam(true);
    try {
      // La asignación no admite cambiar de persona (`updateProjectTeamMemberSchema`
      // solo trae actividad y horas): reemplazar a alguien es quitar la
      // asignación original y crear una nueva. Primero se quita, para no
      // chocar con el tope de colaboradores del equipo.
      const isReplaced = (row: TeamMemberDraftRow) =>
        !row.isNew && team.members.find((m) => m.id === row.assignmentId)?.teamMemberId !== row.teamMemberId;
      const keptAssignmentIds = new Set(
        teamDraft.filter((row) => !row.isNew && !isReplaced(row)).map((row) => row.assignmentId),
      );
      for (const member of team.members) {
        if (!keptAssignmentIds.has(member.id)) {
          await unassignMember.mutateAsync({ projectId, assignmentId: member.id });
        }
      }
      for (const row of teamDraft) {
        if (row.isNew || isReplaced(row)) {
          await assignMember.mutateAsync({
            projectId,
            input: { teamMemberId: row.teamMemberId, activity: row.activity || undefined, assignedHours: Number(row.assignedHours) || 0 },
          });
          continue;
        }
        const original = team.members.find((m) => m.id === row.assignmentId);
        if (!original) continue;
        const activityChanged = (original.activity ?? '') !== row.activity;
        const hoursChanged = original.assignedHours !== (Number(row.assignedHours) || 0);
        if (activityChanged || hoursChanged) {
          await updateMember.mutateAsync({
            projectId,
            assignmentId: row.assignmentId as string,
            input: { activity: row.activity || null, assignedHours: Number(row.assignedHours) || 0 },
          });
        }
      }
      toast.success('Se actualizó el equipo.');
      setTeamModalOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo guardar los cambios del equipo.');
    } finally {
      setSavingTeam(false);
    }
  };

  return (
    <div className={styles.page}>
      <Card>
        <div className={styles.infoRow}>
          <div>
            <span className={styles.infoLabel}>Cliente</span>
            <span className={styles.infoValue}>{project.client?.companyName ?? 'Sin cliente'}</span>
          </div>
          <div>
            <span className={styles.infoLabel}>Responsable comercial</span>
            <span className={styles.infoValue}>{project.commercialManager?.fullName ?? '—'}</span>
          </div>
          <div>
            <span className={styles.infoLabel}>Fecha de inicio</span>
            <span className={styles.infoValue}>{project.startDate ? formatDate(project.startDate) : '—'}</span>
          </div>
          <div>
            <span className={styles.infoLabel}>Estado del proyecto</span>
            <span className={styles.chip}>{PROJECT_STATUS_LABELS[project.status]}</span>
          </div>
          <div>
            <span className={styles.infoLabel}>Etapa de avance</span>
            <span className={styles.chip}>{project.phase ? PROJECT_PHASE_LABELS[project.phase] : '—'}</span>
          </div>
        </div>
      </Card>

      <div className={styles.kpiRow}>
        <Card className={styles.kpiCard}>
          <span className={styles.kpiLabel}>HH asignadas</span>
          <span className={styles.kpiValue}>{formatHours(team.assignedHours)}</span>
        </Card>
        <Card className={styles.kpiCard}>
          <span className={styles.kpiLabel}>HH consumidas</span>
          <span className={styles.kpiValue}>{formatHours(team.consumedHours)}</span>
        </Card>
        <Card className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Fecha de entrega estimada</span>
          <span className={styles.kpiValue}>{project.estimatedDeliveryDate ? formatDate(project.estimatedDeliveryDate) : '—'}</span>
        </Card>
        <Card className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Avance real / esperado</span>
          <span className={styles.kpiValue}>
            {project.progress.actual != null
              ? `${project.progress.actual}% / ${project.progress.expected ?? 0}%`
              : 'Sin plan cargado'}
          </span>
        </Card>
      </div>

      <Card>
        <div className={styles.equipoGrid}>
          <div className={styles.equipoLeft}>
            <div className={styles.equipoIcon} style={{ background: teamStyle.color }}>
              {teamStyle.sigla}
            </div>
            <h3 className={styles.equipoName}>{team.teamName}</h3>
            <div className={styles.equipoStat}>
              <span className={styles.equipoStatLabel}>Horas Asignadas</span>
              <span className={styles.equipoStatValue}>{formatHours(team.assignedHours)} hrs</span>
            </div>
            <div className={styles.equipoStat}>
              <span className={styles.equipoStatLabel}>Horas por asignar</span>
              <span className={`${styles.equipoStatValue} ${styles.equipoStatBlue}`}>{formatHours(hoursToAssign)}</span>
            </div>
            <div className={styles.equipoStat}>
              <span className={styles.equipoStatLabel}>Horas consumidas</span>
              <span className={`${styles.equipoStatValue} ${styles.equipoStatBlue}`}>{formatHours(team.consumedHours)}</span>
            </div>
          </div>

          <div className={styles.equipoRight}>
            <div className={styles.equipoRightHead}>
              <h4>Colaboradores: {team.members.length}</h4>
              {canManageTeam && (
                <Button variant="ghost" size="icon" aria-label="Editar equipo" onClick={openTeamModal}>
                  <PencilIcon size={14} />
                </Button>
              )}
            </div>

            {team.members.length === 0 ? (
              <div className={styles.equipoEmpty}>
                <p>Todavía no hay colaboradores asignados a este equipo en el proyecto.</p>
                {canManageTeam && (
                  <Button type="button" variant="outline" onClick={openTeamModal}>
                    + Asignar colaboradores
                  </Button>
                )}
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: 'name', header: 'Nombre', render: (member) => member.fullName },
                  { key: 'activity', header: 'Actividad', render: (member) => member.activity ?? '—' },
                  { key: 'assigned', header: 'HH asignadas', align: 'right', render: (member) => formatHours(member.assignedHours) },
                  { key: 'consumed', header: 'HH consumidas', align: 'right', render: (member) => formatHours(member.consumedHours) },
                  {
                    key: 'participation',
                    header: '% participación',
                    align: 'right',
                    render: (member) =>
                      team.assignedHours > 0 ? `${Math.round((member.assignedHours / team.assignedHours) * 100)}%` : '—',
                  },
                ]}
                items={pagedMembers}
                getRowKey={(member) => member.id}
              />
            )}
            <Pagination {...membersPagination} />
          </div>
        </div>
      </Card>

      <Card>
        <p className={styles.sectionTitle}>Avance del proyecto</p>
        <div style={{ marginTop: 'var(--kora-space-4)' }}>
          <ProjectTimeline
            progress={project.progress}
            startDate={project.startDate}
            endDate={project.estimatedDeliveryDate ?? project.endDate}
          />
        </div>
      </Card>

      <TeamTasksCard project={project} projectId={projectId} teamId={teamId} />
      <TeamDeliveriesCard project={project} projectId={projectId} teamId={teamId} />

      <Modal
        open={teamModalOpen}
        title="Editar Equipo"
        wide
        className={styles.teamModal}
        onClose={() => setTeamModalOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setTeamModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void onSaveTeamModal()} loading={savingTeam} disabled={draftOverBudget}>
              Guardar
            </Button>
          </>
        }
      >
        <div className={styles.teamModalBody}>
          <div className={styles.teamModalLeft}>
            <div className={styles.equipoIcon} style={{ background: teamStyle.color }}>
              {teamStyle.sigla}
            </div>
            <h3 className={styles.equipoName}>{team.teamName}</h3>
            <div className={styles.equipoStat}>
              <span className={styles.equipoStatLabel}>Horas {teamStyle.sigla}</span>
              <span className={styles.equipoStatValue}>{formatHours(team.assignedHours)} hrs</span>
            </div>
            <div className={styles.equipoStat}>
              <span className={styles.equipoStatLabel}>Horas por asignar</span>
              <span className={`${styles.equipoStatValue} ${styles.equipoStatBlue}`}>
                {formatHours(Math.max(0, team.assignedHours - draftTotalAssigned))}
              </span>
            </div>
            <div className={styles.equipoStat}>
              <span className={styles.equipoStatLabel}>Horas consumidas</span>
              <span className={`${styles.equipoStatValue} ${styles.equipoStatBlue}`}>{formatHours(draftTotalConsumed)}</span>
            </div>
            <div className={styles.equipoStat}>
              <span className={styles.equipoStatLabel}>Colaboradores</span>
              <span className={styles.equipoStatValue}>{teamDraft.length}</span>
            </div>
          </div>

          <div className={styles.teamModalRight}>
            {draftOverBudget && (
              <p className={styles.modalError}>Excede el límite de horas disponibles del equipo ({formatHours(team.assignedHours)} hrs).</p>
            )}
            <table className={styles.modalTable}>
              <colgroup>
                <col style={{ width: '24%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '9%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Actividad</th>
                  <th>HH asig.</th>
                  <th>HH cons.</th>
                  <th>% partic.</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {teamDraft.map((row) => {
                  const locked = !row.isNew && row.consumedHours > 0;
                  const pct = team.assignedHours > 0 ? Math.round(((Number(row.assignedHours) || 0) / team.assignedHours) * 100) : 0;
                  // Quien sigue en esta fila + quienes nadie más ocupa. La persona
                  // actual se agrega a mano si ya no figura en el catálogo del
                  // equipo, para que el Select no quede en blanco.
                  const rowOptions = [
                    ...(availableMembers.some((m) => m.id === row.teamMemberId)
                      ? []
                      : [{ value: row.teamMemberId, label: row.fullName }]),
                    ...availableMembers
                      .filter((m) => m.id === row.teamMemberId || !usedTeamMemberIds.has(m.id))
                      .map((m) => ({ value: m.id, label: m.fullName })),
                  ];
                  return (
                    <tr key={row.key}>
                      <td>
                        {!locked ? (
                          <Select
                            options={rowOptions}
                            value={row.teamMemberId}
                            aria-label="Colaborador"
                            onChange={(event) => {
                              const picked = availableMembers.find((m) => m.id === event.target.value);
                              updateDraftRow(row.key, {
                                teamMemberId: event.target.value,
                                fullName: picked?.fullName ?? row.fullName,
                              });
                            }}
                          />
                        ) : (
                          <span className={styles.modalLockedText}>{row.fullName}</span>
                        )}
                      </td>
                      <td>
                        <TextField
                          value={row.activity}
                          placeholder="Actividad"
                          onChange={(event) => updateDraftRow(row.key, { activity: event.target.value })}
                        />
                      </td>
                      <td>
                        <TextField
                          type="number"
                          min={row.consumedHours}
                          value={row.assignedHours}
                          onChange={(event) =>
                            updateDraftRow(row.key, { assignedHours: event.target.value.replace(/^0+(?=\d)/, '') })
                          }
                        />
                      </td>
                      <td className={styles.modalReadonlyCell}>{row.consumedHours}</td>
                      <td className={styles.modalReadonlyCell}>{pct}%</td>
                      <td>
                        {locked ? (
                          <span
                            className={styles.warnIcon}
                            title={`No se puede quitar: ya registró ${row.consumedHours} hh consumidas. Solo se puede modificar horas y actividad.`}
                          >
                            <AlertIcon size={16} />
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Quitar a ${row.fullName}`}
                            onClick={() => removeDraftRow(row.key)}
                          >
                            <TrashIcon size={16} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={deliveryModalStyles.addButton}
              disabled={addableCount === 0}
              onClick={addDraftRow}
            >
              + Agregar
            </Button>
            <p className={styles.cupoHint}>
              {slotsLeft === 0
                ? `Se alcanzó el tope de ${team.maxMembers} colaborador(es) definido para este equipo en el proyecto.`
                : poolLeft.length === 0
                  ? 'No hay más personas disponibles en este equipo para agregar.'
                  : `Puedes agregar hasta ${addableCount} colaborador(es) más.`}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
