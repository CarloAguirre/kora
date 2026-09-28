import { useState } from 'react';
import {
  FORECAST_ASSIGNMENT_TYPES,
  FORECAST_ASSIGNMENT_TYPE_LABELS,
  FORECAST_TYPES_WITH_PROJECT,
  type ForecastAssignment,
  type ForecastAssignmentType,
} from '@kora/contracts';
import styles from './ForecastMemberEditor.module.css';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { CloseIcon, PlusIcon } from '@/shared/components/icons/Icons';
import { useClientsList } from '@/modules/clients/api/clients.queries';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import {
  useCreateForecastAssignment,
  useRemoveForecastAssignment,
  useUpdateForecastAssignment,
} from '../api/forecast.queries';

const TYPE_OPTIONS = FORECAST_ASSIGNMENT_TYPES.map((type) => ({ value: type, label: FORECAST_ASSIGNMENT_TYPE_LABELS[type] }));

export interface ForecastMemberEditorMember {
  readonly teamMemberId: string;
  readonly capacityHours: number;
  readonly assignedHours: number;
}

/**
 * Editor de las asignaciones de un colaborador en el período — lo que en la
 * v1 (`LiderEquipoForecast`) se abría al expandir su tarjeta. En la v2 vive
 * dentro del modal "Editar" de la tabla de Forecast.
 */
export function ForecastMemberEditor({
  member,
  assignments,
  periodStart,
  periodEnd,
}: {
  member: ForecastMemberEditorMember;
  assignments: ForecastAssignment[];
  periodStart: string;
  periodEnd: string;
}) {
  const createAssignment = useCreateForecastAssignment();
  const remaining = Math.max(0, member.capacityHours - member.assignedHours);

  return (
    <div className={styles.editor}>
      <div className={styles.rows}>
        {assignments.map((assignment) => (
          <ForecastAssignmentRow key={assignment.id} assignment={assignment} maxHours={member.capacityHours} canEdit />
        ))}

        {remaining > 0 && (
          <div className={styles.unassignedRow}>
            <span>Sin asignación</span>
            <span>{remaining}h</span>
          </div>
        )}
      </div>

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
    </div>
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
