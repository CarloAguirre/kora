import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CreateProjectTeamAssignmentInput, ProjectDetail } from '@kora/contracts';
import { projectTeamPath } from '@/app/router/paths';
import { Button } from '@/shared/components/ui/Button';
import { TrashIcon } from '@/shared/components/icons/Icons';
import { Card } from '@/shared/components/ui/Card';
import { Modal } from '@/shared/components/ui/Modal';
import { useToast } from '@/shared/components/ui/Toast';
import { useUsersList } from '@/modules/users/api/users.queries';
import { useUpdateProject } from '../api/projects.queries';
import { getTeamStyle } from '../utils/team-style';
import styles from './ProjectTeamsManagementCard.module.css';

interface TeamCatalogEntry {
  id: string;
  name: string;
  leader?: { id: string; fullName: string } | null;
}
interface TeamDraft {
  teamId: string;
  leaderUserId: string | null;
  memberCount: number | null;
  assignedHours: number;
}
interface Props {
  project: ProjectDetail;
  catalog: readonly TeamCatalogEntry[];
}

const hours = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const draftFromProject = (project: ProjectDetail): TeamDraft[] => project.teams.map((team) => ({
  teamId: team.teamId,
  leaderUserId: team.leader?.id ?? null,
  memberCount: team.maxMembers,
  assignedHours: team.assignedHours ?? 0,
}));

/** Vista PM/PMO. El líder de equipo mantiene su interfaz propia en TeamLeaderProjectView. */
export function ProjectTeamsManagementCard({ project, catalog }: Props) {
  const toast = useToast();
  const updateProject = useUpdateProject();
  const [managing, setManaging] = useState(false);
  const [drafts, setDrafts] = useState<TeamDraft[]>(() => draftFromProject(project));
  const draftsRef = useRef(drafts);
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: leaders } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'leader' }, { enabled: managing });
  const { data: pmoUsers } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'pmo' }, { enabled: managing });
  useEffect(() => {
    if (!managing) {
      const next = draftFromProject(project);
      draftsRef.current = next;
      setDrafts(next);
    }
  }, [project, managing]);

  const patchDraft = (id: string, patch: Partial<TeamDraft>) => {
    const next = draftsRef.current.map((row) => row.teamId === id ? { ...row, ...patch } : row);
    draftsRef.current = next;
    setDrafts(next);
  };
  const candidateLeaders = [...(leaders?.items ?? []), ...(pmoUsers?.items ?? [])];
  const leaderOptions = Array.from(new Map(candidateLeaders.map((person) =>
    [person.id, { id: person.id, name: person.fullName }])).values());
  const teamMap = new Map(project.teams.map((team) => [team.teamId, team]));
  const usedIds = new Set(drafts.map((row) => row.teamId));
  const availableTeams = catalog.filter((team) => !usedIds.has(team.id));

  const blockHours = (teamId: string) => project.modules.flatMap((module) => module.segments)
    .filter((segment) => segment.teamId === teamId)
    .reduce((sum, segment) => sum + (segment.estimatedHours ?? 0), 0);
  const blockCount = (teamId: string) => project.modules.flatMap((module) => module.segments)
    .filter((segment) => segment.teamId === teamId).length;
  const totalAssigned = project.teams.reduce((sum, team) => sum + (team.assignedHours ?? 0), 0);
  const plannedHours = project.modules.flatMap((module) => module.segments)
    .reduce((sum, segment) => sum + (segment.estimatedHours ?? 0), 0);
  const unassigned = Math.max(0, project.soldHours - totalAssigned);
  const teamMembers = (id: string) => project.members.filter((member) => member.teamId === id);
  const updateAvailable = !busy && !updateProject.isPending;

  const persist = async (next = draftsRef.current) => {
    if (next.some((row) => !Number.isFinite(row.assignedHours) || row.assignedHours < 0 ||
        (row.memberCount !== null && (!Number.isInteger(row.memberCount) || row.memberCount < 1)))) {
      toast.error('Las HH deben ser positivas y los cupos deben ser al menos 1.');
      return false;
    }
    const input: CreateProjectTeamAssignmentInput[] = next.map((row) => ({
      teamId: row.teamId,
      leaderUserId: row.leaderUserId,
      memberCount: row.memberCount,
      assignedHours: row.assignedHours,
    }));
    setBusy(true);
    try {
      await updateProject.mutateAsync({ projectId: project.id, input: { teams: input } });
      toast.success('Equipos del proyecto actualizados.');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron guardar los equipos.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addTeam = async (teamId: string) => {
    if (!teamId || usedIds.has(teamId) || !updateAvailable) return;
    const selected = catalog.find((team) => team.id === teamId);
    const next = [...draftsRef.current, {
      teamId, leaderUserId: selected?.leader?.id ?? null,
      memberCount: 1, assignedHours: 0,
    }];
    if (await persist(next)) {
      draftsRef.current = next;
      setDrafts(next);
    }
    setAdding('');
  };

  const confirmedRemoval = async () => {
    if (!removing) return;
    const next = draftsRef.current.filter((row) => row.teamId !== removing);
    if (await persist(next)) {
      draftsRef.current = next;
      setDrafts(next);
      setRemoving(null);
    }
  };
  const removalTeam = removing ? teamMap.get(removing) : undefined;
  const blockingCount = removing ? blockCount(removing) : 0;

  return (
    <Card>
      <div className={styles.header}>
        <div>
          <h2>Equipos asignados</h2>
          {managing && <p>Define el líder, los cupos y las HH de cada equipo. Los colaboradores los asigna el líder de cada equipo desde la pantalla de su equipo. Los cambios se guardan al instante.</p>}
        </div>
        <Button variant={managing ? 'primary' : 'outlineDark'} size="sm"
          disabled={!updateAvailable} onClick={() => setManaging(!managing)}>
          {managing ? 'Listo' : 'Gestionar equipos'}
        </Button>
      </div>

      <div className={styles.summary}>
        <div><span>HH vendidas</span><strong>{hours(project.soldHours)}</strong></div>
        <div><span>Asignadas a equipos</span><strong>{hours(totalAssigned)}</strong></div>
        <div><span>Por asignar</span><strong>{hours(unassigned)}</strong></div>
        <div><span>Planificadas en bloques</span><strong>{hours(plannedHours)}</strong></div>
        <div className={styles.track}><span style={{ width: `${Math.min(100, project.soldHours > 0 ? totalAssigned / project.soldHours * 100 : 0)}%` }} /></div>
      </div>

      <div className={styles.grid}>
        {drafts.map((draft) => {
          const original = teamMap.get(draft.teamId);
          const catalogTeam = catalog.find((t) => t.id === draft.teamId);
          const name = original?.teamName ?? catalogTeam?.name ?? 'Equipo';
          const style = getTeamStyle(name);
          const members = teamMembers(draft.teamId);
          const consumed = members.reduce((sum, member) => sum + member.consumedHours, 0);
          const inBlocks = blockHours(draft.teamId);
          const leader = original?.leader ?? catalogTeam?.leader;
          const selectedLeader = leaderOptions.find((person) => person.id === draft.leaderUserId);
          const leaderName = draft.leaderUserId
            ? (selectedLeader?.name ?? (draft.leaderUserId === leader?.id ? leader?.fullName : null) ?? 'Sin líder asignado')
            : (leader?.fullName ?? 'Sin líder asignado');
          const assignmentLeft = Math.max(0, draft.assignedHours - inBlocks);
          const health = consumed > draft.assignedHours ? 'Sobre presupuesto'
            : assignmentLeft > 0 ? `${hours(assignmentLeft)} HH pendientes de planificar` : 'Excelente';
          const content = <>
            <span className="srOnly">Equipo {name}</span>
            <div className={styles.teamTitle}>
              <span className={styles.avatar} style={{ background: style.color }}>{style.sigla}</span>
              <strong>{name}</strong>
            </div>
            <p className={styles.leader}>Líder de equipo · <strong>{leaderName}</strong></p>
            <div className={styles.stats}>
              <div><span>Asignadas</span><b>{hours(draft.assignedHours)} hrs</b></div>
              <div><span>En bloques</span><b>{hours(inBlocks)} hrs</b></div>
              <div><span>Utilizadas</span><b>{hours(consumed)} hrs</b></div>
            </div>
            <p className={styles.members}>{members.length === 0 ? 'Sin colaboradores asignados' : `${members.length} colaboradores asignados`}
              {' '}({members.length} de {draft.memberCount ?? 'sin límite'} cupos)
            </p>
            <span className={consumed > draft.assignedHours ? styles.problem : styles.healthy}>● {health}</span>
          </>;

          return managing ? (
            <div className={styles.manageCard} key={draft.teamId}>
              <div className={styles.manageHeading}>
                <div className={styles.teamTitle}>
                  <span className={styles.avatar} style={{ background: style.color }}>{style.sigla}</span>
                  <b>{name}</b>
                </div>
                <button type="button" className={styles.trash} disabled={!updateAvailable}
                  aria-label={`Quitar equipo ${name}`} title="Quitar equipo"
                  onClick={() => setRemoving(draft.teamId)}><TrashIcon size={14} /></button>
              </div>
              <div className={styles.fields}>
                <label>Líder
                  <select value={draft.leaderUserId ?? ''} disabled={!updateAvailable}
                    onChange={(event) => {
                      const nextId = event.target.value || null;
                      patchDraft(draft.teamId, { leaderUserId: nextId });
                      void persist(draftsRef.current);
                    }}>
                    <option value="">Líder del catálogo (sin override)</option>
                    {draft.leaderUserId && !leaderOptions.some((person) => person.id === draft.leaderUserId) &&
                      <option value={draft.leaderUserId}>{leaderName}</option>}
                    {leaderOptions.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                  </select>
                </label>
                <label>N° colaboradores
                  <input type="number" min="1" step="1" value={draft.memberCount ?? ''}
                    disabled={!updateAvailable} placeholder="—"
                    onChange={(event) => patchDraft(draft.teamId, {
                      memberCount: event.target.value === '' ? null : Number(event.target.value),
                    })}
                    onBlur={() => void persist()} />
                </label>
                <label>Horas asignadas
                  <input type="number" min="0" step="0.5" value={draft.assignedHours}
                    disabled={!updateAvailable}
                    onChange={(event) => patchDraft(draft.teamId, { assignedHours: Number(event.target.value) })}
                    onBlur={() => void persist()} />
                </label>
              </div>
              <p className={styles.hint}>{hours(inBlocks)} HH ya en bloques de trabajo; {hours(consumed)} HH utilizadas.</p>
              <p className={styles.hint}>Colaboradores ({members.length} de {draft.memberCount ?? 'sin límite'} cupos). Los asigna {leaderName}, líder del equipo.</p>
            </div>
          ) : (
            <Link key={draft.teamId} className={styles.teamCard}
              style={{ background: style.bg }} to={projectTeamPath(project, {
                id: draft.teamId, slug: original?.teamSlug,
              })}>{content}</Link>
          );
        })}
        {managing && <div className={styles.addCard}>
          <b>Agregar equipo</b>
          <select aria-label="Agregar equipo" value={adding} disabled={!updateAvailable}
            onChange={(event) => { setAdding(event.target.value); void addTeam(event.target.value); }}>
            <option value="">+ Elegir equipo...</option>
            {availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </div>}
      </div>
      {!managing && <p className={styles.footer}>Haz clic en un equipo para ver y gestionar sus colaboradores, tareas y entregas.</p>}
      {drafts.length === 0 && !managing && <p>Este proyecto no tiene equipos asignados.</p>}

      <Modal open={removing !== null} title={blockingCount > 0 ? 'No se puede quitar el equipo' : 'Quitar equipo'}
        onClose={() => setRemoving(null)}
        footer={blockingCount > 0
          ? <Button size="sm" onClick={() => setRemoving(null)}>Entendido</Button>
          : <>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancelar</Button>
            <Button size="sm" disabled={!updateAvailable}
              onClick={() => void confirmedRemoval()}>Quitar equipo</Button>
          </>}>
        <p>{blockingCount > 0
          ? `${removalTeam?.teamName ?? 'Este equipo'} tiene ${blockingCount} ${blockingCount === 1 ? 'bloque de trabajo' : 'bloques de trabajo'} en el Roadmap. Elimínalos antes de quitar el equipo del proyecto.`
          : `¿Quitar ${removalTeam?.teamName ?? 'este equipo'} del proyecto? Esta acción no puede deshacerse.`}</p>
      </Modal>
    </Card>
  );
}
