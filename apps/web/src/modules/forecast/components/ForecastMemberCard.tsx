import { useState } from 'react';
import {
  FORECAST_ASSIGNMENT_TYPES,
  FORECAST_ASSIGNMENT_TYPE_LABELS,
  FORECAST_TYPES_WITH_PROJECT,
  type ForecastAssignment,
  type ForecastAssignmentType,
} from '@kora/contracts';
import styles from './ForecastMemberCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { CheckIcon, CloseIcon, PlusIcon } from '@/shared/components/icons/Icons';
import { useClientsList } from '@/modules/clients/api/clients.queries';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import {
  useCreateForecastAssignment,
  useRemoveForecastAssignment,
  useUpdateForecastAssignment,
} from '../api/forecast.queries';

const TYPE_OPTIONS = FORECAST_ASSIGNMENT_TYPES.map((type) => ({ value: type, label: FORECAST_ASSIGNMENT_TYPE_LABELS[type] }));

const TYPE_CHIP_CLASS: Record<ForecastAssignmentType, string | undefined> = {
  project: styles.chipProject,
  support: styles.chipSupport,
  vacation: styles.chipVacation,
  admin_day: styles.chipNeutral,
  day_off: styles.chipNeutral,
  sick_leave: styles.chipSick,
  training: styles.chipTraining,
  other: styles.chipNeutral,
};

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0]!;
  const second = parts.length > 1 ? parts[1]![0]! : (parts[0]![1] ?? '');
  return (first + second).toUpperCase();
}

function chipLabel(assignment: ForecastAssignment): string {
  if (FORECAST_TYPES_WITH_PROJECT.includes(assignment.type) && assignment.project) {
    return assignment.project.name;
  }
  return FORECAST_ASSIGNMENT_TYPE_LABELS[assignment.type];
}

export interface ForecastMemberCardMember {
  readonly teamMemberId: string;
  readonly fullName: string;
  readonly capacityHours: number;
  readonly assignedHours: number;
}

export function ForecastMemberCard({
  member,
  assignments,
  periodStart,
  periodEnd,
  canEdit,
}: {
  member: ForecastMemberCardMember;
  assignments: ForecastAssignment[];
  periodStart: string;
  periodEnd: string;
  canEdit: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const createAssignment = useCreateForecastAssignment();
  const remaining = Math.max(0, member.capacityHours - member.assignedHours);
  const isOverloaded = member.assignedHours > member.capacityHours;
  const percent = member.capacityHours > 0 ? Math.round((member.assignedHours / member.capacityHours) * 100) : 0;

  const barClass = isOverloaded ? styles.barDanger : percent === 100 ? styles.barSuccess : styles.barWarning;
  const statusClass = isOverloaded ? styles.statusDanger : percent === 100 ? styles.statusSuccess : styles.statusWarning;

  const statusLabel = isOverloaded
    ? `Sobrecargado (+${member.assignedHours - member.capacityHours}h)`
    : percent === 100
      ? 'Completo'
      : member.assignedHours === 0
        ? 'Sin asignación'
        : `${remaining}h libres`;

  return (
    <Card className={[styles.card, expanded ? styles.expandedSpan : ''].filter(Boolean).join(' ')}>
      <div className={styles.header}>
        <span className={styles.avatar}>{initials(member.fullName)}</span>
        <div className={styles.identity}>
          <span className={styles.name} title={member.fullName}>
            {member.fullName}
          </span>
          <div className={styles.loadRow}>
            <div className={styles.barTrack}>
              <div className={[styles.barFill, barClass].join(' ')} style={{ width: `${Math.min(100, percent)}%` }} />
            </div>
            <span className={[styles.statusText, statusClass].join(' ')}>
              {percent}% · {statusLabel}
            </span>
          </div>
        </div>
        {canEdit && (
          <Button
            variant={expanded ? 'secondary' : 'outline'}
            size="sm"
            iconLeft={expanded ? <CheckIcon size={14} /> : undefined}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? 'Listo' : 'Editar'}
          </Button>
        )}
      </div>

      {!expanded && (
        <div className={styles.chips}>
          {assignments.map((assignment) => (
            <span key={assignment.id} className={[styles.chip, TYPE_CHIP_CLASS[assignment.type]].join(' ')}>
              {chipLabel(assignment)} · {assignment.assignedHours}h
            </span>
          ))}
          {remaining > 0 && (
            <span className={styles.chipUnassigned}>
              Sin asignación · {remaining}h{assignments.length === 0 ? ' libres' : ''}
            </span>
          )}
        </div>
      )}

      {expanded && (
        <>
          <div className={styles.rows}>
            {assignments.map((assignment) => (
              <ForecastAssignmentRow key={assignment.id} assignment={assignment} maxHours={member.capacityHours} canEdit={canEdit} />
            ))}

            {remaining > 0 && (
              <div className={styles.unassignedRow}>
                <span>Sin asignación</span>
                <span>{remaining}h</span>
              </div>
            )}
          </div>

          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              className={styles.addRow}
              iconLeft={<PlusIcon size={16} />}
              loading={createAssignment.isPending}
              onClick={() =>
                createAssignment.mutate({
                  teamMemberId: member.teamMemberId,
                  periodStart,
                  periodEnd,
                  type: 'other',
                  assignedHours: 0,
                })
              }
            >
              Agregar
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

function ForecastAssignmentRow({
  assignment,
  maxHours,
  canEdit,
}: {
  assignment: ForecastAssignment;
  maxHours: number;
  canEdit: boolean;
}) {
  const updateAssignment = useUpdateForecastAssignment();
  const removeAssignment = useRemoveForecastAssignment();
  const [comments, setComments] = useState(assignment.comments);
  const [hours, setHours] = useState(String(assignment.assignedHours));

  const showProjectSelectors = FORECAST_TYPES_WITH_PROJECT.includes(assignment.type);
  const { data: clients } = useClientsList(showProjectSelectors ? { page: 1, pageSize: 200, sortField: 'companyName' } : { pageSize: 1 });
  const { data: projects } = useProjectsList(
    showProjectSelectors && assignment.client
      ? { page: 1, pageSize: 200, sortField: 'name', clientId: assignment.client.id }
      : { pageSize: 1 },
  );

  const commit = (patch: Partial<{ type: ForecastAssignmentType; clientId: string | null; projectId: string | null; comments: string; assignedHours: number }>) => {
    updateAssignment.mutate({
      assignmentId: assignment.id,
      input: {
        type: patch.type ?? assignment.type,
        clientId: patch.clientId !== undefined ? patch.clientId : (assignment.client?.id ?? null),
        projectId: patch.projectId !== undefined ? patch.projectId : (assignment.project?.id ?? null),
        comments: patch.comments ?? comments,
        assignedHours: patch.assignedHours ?? Number(hours),
      },
    });
  };

  return (
    <div className={styles.row}>
      <div className={[styles.typeGroup, showProjectSelectors ? styles.typeGroupWithProject : ''].filter(Boolean).join(' ')}>
        <Select
          label="Tipo"
          options={TYPE_OPTIONS}
          value={assignment.type}
          disabled={!canEdit}
          onChange={(event) => commit({ type: event.target.value as ForecastAssignmentType, clientId: null, projectId: null })}
        />
        {showProjectSelectors && (
          <>
            <Select
              label="Cliente"
              placeholder="Sin cliente"
              options={(clients?.items ?? []).map((client) => ({ value: client.id, label: client.companyName }))}
              value={assignment.client?.id ?? ''}
              disabled={!canEdit}
              onChange={(event) => commit({ clientId: event.target.value || null, projectId: null })}
            />
            <Select
              label="Proyecto"
              placeholder="Sin proyecto"
              options={(projects?.items ?? []).map((project) => ({ value: project.id, label: project.name }))}
              value={assignment.project?.id ?? ''}
              disabled={!canEdit || !assignment.client}
              onChange={(event) => commit({ projectId: event.target.value || null })}
            />
          </>
        )}
      </div>

      <TextField
        label="Comentarios"
        value={comments}
        disabled={!canEdit}
        onChange={(event) => setComments(event.target.value)}
        onBlur={() => commit({ comments })}
      />

      <TextField
        label="HH"
        type="number"
        min={0}
        max={maxHours}
        step="0.5"
        value={hours}
        disabled={!canEdit}
        onChange={(event) => setHours(event.target.value)}
        onBlur={() => commit({ assignedHours: Number(hours) || 0 })}
      />

      {canEdit ? (
        <button
          type="button"
          className={styles.deleteButton}
          aria-label="Eliminar asignación"
          onClick={() => removeAssignment.mutate(assignment.id)}
        >
          <CloseIcon size={16} />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
