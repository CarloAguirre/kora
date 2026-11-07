import { useMemo } from 'react';
import {
  PROJECT_PHASE_LABELS, PROJECT_STATUS_LABELS,
  type ProjectDetail,
} from '@kora/contracts';
import { Card } from '@/shared/components/ui/Card';
import { getTeamStyle } from '../utils/team-style';
import { TeamTasksCard } from './TeamTasksCard';
import { TeamDeliveriesCard } from './TeamDeliveriesCard';
import { TeamProgressCard } from './TeamProgressCard';
import { calculateTeamProgress } from '../lib/team-progress';
import styles from './ProjectManagerTeamDetailView.module.css';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const formatDate = (date: string | null | undefined) => date
  ? date.slice(8, 10) + '-' + date.slice(5, 7) + '-' + date.slice(0, 4) : '—';

interface Props {
  project: ProjectDetail;
  projectId: string;
  teamId: string;
}

/** Vista de seguimiento del PM/PMO. Nunca asigna colaboradores: los gestiona el líder del equipo. */
export function ProjectManagerTeamDetailView({ project, projectId, teamId }: Props) {
  const teamProgress = useMemo(() => calculateTeamProgress(project, teamId), [project, teamId]);
  const team = project.teams.find((item) => item.teamId === teamId);
  const members = project.members.filter((item) => item.teamId === teamId && !item.blockedAt);
  const modules = useMemo(() => project.modules.map((module) => ({
    ...module,
    tasks: module.tasks.filter((task) => task.teamId === teamId && !task.cancelledAt),
    segments: module.segments.filter((segment) => segment.teamId === teamId),
  })), [project.modules, teamId]);
  const segments = modules.flatMap((module) => module.segments);
  const used = project.members.filter((item) => item.teamId === teamId)
    .reduce((sum, member) => sum + member.consumedHours, 0);
  const assigned = team?.assignedHours ?? members.reduce((sum, member) => sum + member.assignedHours, 0);
  const perMemberAllocated = members.reduce((sum, member) => sum + member.assignedHours, 0);
  const remaining = Math.max(0, assigned - perMemberAllocated);
  const date = segments.map((segment) => segment.endDate).sort().at(-1) ?? project.estimatedDeliveryDate;
  const style = getTeamStyle(team?.teamName ?? '');
  const leaderName = team?.leader?.fullName ?? 'el líder del equipo';

  const pendingGroups = modules.filter((module) =>
    module.tasks.some((task) => !task.assigneeUserId)).map((module) => ({
      name: module.name, count: module.tasks.filter((task) => !task.assigneeUserId).length,
    }));

  return (
    <div className={styles.page}>
      <Card className={styles.summary}>
        <div><span>Cliente</span><strong>{project.client?.companyName ?? 'Sin cliente'}</strong></div>
        <div><span>Responsable comercial</span><strong>{project.commercialManager?.fullName ?? '—'}</strong></div>
        <div><span>Líder · PM responsable</span><strong>{project.leader?.fullName ?? '—'}</strong></div>
        <div><span>Fecha de inicio</span><strong>{formatDate(project.startDate)}</strong></div>
        <div><span>Estado del proyecto</span><strong className={styles.pill}>{PROJECT_STATUS_LABELS[project.status]}</strong></div>
        <div><span>Etapa de avance</span><strong>{project.phase ? PROJECT_PHASE_LABELS[project.phase] : '—'}</strong></div>
      </Card>

      <div className={styles.kpis}>
        <Card><span>HH asignadas</span><strong>{formatHours(assigned)}</strong></Card>
        <Card><span>HH consumidas</span><strong>{formatHours(used)}</strong></Card>
        <Card><span>Fecha de entrega estimada</span><strong>{formatDate(date)}</strong></Card>
        <Card><span>Avance real / esperado</span><strong>
          {teamProgress.hasPlan ? (teamProgress.actualPercent ?? 0) + '% / ' +
            (teamProgress.expectedPercent ?? 0) + '%' : 'Sin plan cargado'}
        </strong></Card>
      </div>

      <Card>
        <div className={styles.teamInfo}>
          <div className={styles.teamStats}>
            <span className={styles.logo} style={{ background: style.color }}>{style.sigla}</span>
            <h2>{team?.teamName ?? 'Equipo'}</h2>
            <small>Líder: {leaderName}</small>
            <span>Horas asignadas <strong>{formatHours(assigned)} hrs</strong></span>
            <span>Horas por asignar <strong>{formatHours(remaining)}</strong></span>
            <span>Horas consumidas <strong>{formatHours(used)}</strong></span>
          </div>
          <div className={styles.people}>
            <h3>Colaboradores: {members.length} de {team?.maxMembers ?? 'sin límite'} cupos</h3>
            {members.length === 0
              ? <p>Sin colaboradores asignados. Los asigna {leaderName}, líder del equipo.</p>
              : <table><thead><tr><th>Colaborador</th><th>Actividad</th><th>HH asignadas</th><th>HH utilizadas</th></tr></thead>
                  <tbody>{members.map((member) => <tr key={member.id}>
                    <td>{member.fullName}</td><td>{member.activity ?? '—'}</td>
                    <td>{formatHours(member.assignedHours)}</td><td>{formatHours(member.consumedHours)}</td>
                  </tr>)}</tbody></table>}
          </div>
        </div>
      </Card>

      <TeamProgressCard progress={teamProgress} teamName={team?.teamName ?? 'Equipo'} />

      {pendingGroups.length > 0 && <div className={styles.warnings}>
        {pendingGroups.map((group) => <div key={group.name} className={styles.warning}>
          <span className={styles.logo} style={{ background: style.color }}>{style.sigla}</span>
          <div><strong>{group.name}: {group.count} {group.count === 1 ? 'tarea espera' : 'tareas esperan'} asignación</strong>
            <p>{members.length === 0
              ? `No se pueden asignar tareas sin colaboradores asignados al proyecto. Esperando que ${leaderName} asigne colaboradores.`
              : 'Hay tareas pendientes de asignar a colaboradores del equipo.'}</p>
          </div>
        </div>)}
      </div>}

      <TeamTasksCard project={project} projectId={projectId} teamId={teamId} managerView />
      <TeamDeliveriesCard project={project} projectId={projectId} teamId={teamId} managerView />
    </div>
  );
}
