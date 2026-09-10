import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  SELECTABLE_TICKET_SERVICE_TYPES,
  TICKET_SERVICE_TYPE_LABELS,
  updateTicketSchema,
  type TicketDetail,
  type UpdateTicketInput,
} from '@kora/contracts';
import styles from './EditTicketDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Combobox } from '@/shared/components/ui/Combobox';
import { useUpdateTicket } from '../api/tickets.queries';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import { useUsersList } from '@/modules/users/api/users.queries';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';

type FormValues = z.input<typeof updateTicketSchema>;

const PRIORITY_OPTIONS = TICKET_PRIORITIES.map((priority) => ({ value: priority, label: TICKET_PRIORITY_LABELS[priority] }));

/**
 * Réplica de la vista `edit` del modal de ticket en la v1: título, tipo de
 * servicio, criticidad, responsable, proyecto de desarrollo vinculado, HH
 * estimadas y descripción. La solución tiene su propio editor en la ficha
 * (se guarda aparte), así que no vive aquí.
 */
export function EditTicketDialog({ ticket, open, onClose }: { ticket: TicketDetail; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const updateTicket = useUpdateTicket();
  // "Consulta" y "Error" ya no son seleccionables para tickets nuevos, pero un
  // ticket viejo puede tenerlos: se agrega como opción extra solo en ese caso
  // para no perder la clasificación existente si se guarda sin tocar el campo.
  const serviceTypeOptions =
    ticket.serviceType && !(SELECTABLE_TICKET_SERVICE_TYPES as readonly string[]).includes(ticket.serviceType)
      ? [...SELECTABLE_TICKET_SERVICE_TYPES, ticket.serviceType]
      : SELECTABLE_TICKET_SERVICE_TYPES;
  const serviceTypeSelectOptions = serviceTypeOptions.map((type) => ({ value: type, label: TICKET_SERVICE_TYPE_LABELS[type] }));
  const { data: projects } = useProjectsList({
    page: 1,
    pageSize: 200,
    sortField: 'name',
    type: 'development',
    clientId: ticket.client?.id,
  });
  // Cualquier persona del sistema puede ser responsable de un ticket — es
  // quien puede cargarle horas por tenerlo asignado, no solo colaboradores.
  // Los eliminados ya vienen fuera del listado; los deshabilitados se descartan
  // aquí: no entran al sistema, así que asignarles el ticket lo deja sin dueño.
  const { data: users } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName' });
  const assignableOptions = (users?.items ?? [])
    .filter((user) => user.status !== 'disabled')
    .map((user) => ({ value: user.id, label: user.fullName }));
  // El responsable actual puede haber quedado fuera (se dio de baja después de
  // asignarlo). Se mantiene como opción para que el campo no aparezca vacío y
  // guardar otro cambio no lo borre sin que nadie lo note. Solo se marca como
  // deshabilitado si consta en el listado: si no vino, no hay cómo saberlo.
  const currentAssignee = ticket.assignee;
  const assigneeOptions =
    currentAssignee && !assignableOptions.some((option) => option.value === currentAssignee.id)
      ? [
          ...assignableOptions,
          {
            value: currentAssignee.id,
            label: (users?.items ?? []).some((user) => user.id === currentAssignee.id)
              ? `${currentAssignee.fullName} (deshabilitado)`
              : currentAssignee.fullName,
          },
        ]
      : assignableOptions;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, UpdateTicketInput>({ resolver: zodResolver(updateTicketSchema) });

  const developmentProjectId = useWatch({ control, name: 'developmentProjectId' });
  const assigneeUserId = useWatch({ control, name: 'assigneeUserId' });

  useEffect(() => {
    if (!open) return;
    reset({
      title: ticket.title,
      developmentProjectId: ticket.developmentProject?.id ?? undefined,
      serviceType: ticket.serviceType ?? undefined,
      priority: ticket.priority ?? undefined,
      assigneeUserId: ticket.assignee?.id ?? undefined,
      estimatedHours: ticket.estimatedHours ?? '',
      description: ticket.description ?? '',
      evidenceUrl: ticket.evidenceUrl ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticket.id]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await updateTicket.mutateAsync({ ticketId: ticket.id, input: values });
      toast.success('Se guardaron los cambios del ticket.');
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo actualizar el ticket.');
    }
  });

  return (
    <Modal
      open={open}
      title="Editar ticket"
      onClose={onClose}
      wide
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={() => void onSubmit()} loading={isSubmitting} loadingText="Guardando…">
            Guardar cambios
          </Button>
        </>
      }
    >
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <TextField label="Título" required errorText={errors.title?.message} {...register('title')} />

        <div className={styles.row}>
          <Select label="Tipo de servicio" placeholder="Sin definir" options={serviceTypeSelectOptions} {...register('serviceType')} />
          <Select label="Criticidad" placeholder="Sin definir" options={PRIORITY_OPTIONS} {...register('priority')} />
        </div>

        <div className={styles.row}>
          <Combobox
            label="Responsable"
            placeholder="Buscar persona…"
            options={[{ value: '', label: 'Sin asignar' }, ...assigneeOptions]}
            value={assigneeUserId ?? ''}
            onChange={(value) => setValue('assigneeUserId', value || undefined, { shouldValidate: true })}
            emptyMessage="No se encontraron personas."
          />
          <TextField label="HH estimadas" type="number" errorText={errors.estimatedHours?.message} {...register('estimatedHours')} />
        </div>

        <Combobox
          label="Proyecto de desarrollo"
          placeholder="Buscar proyecto de desarrollo…"
          options={[{ value: '', label: 'Sin vincular' }, ...(projects?.items ?? []).map((project) => ({ value: project.id, label: project.name }))]}
          value={developmentProjectId ?? ''}
          onChange={(value) => setValue('developmentProjectId', value || undefined, { shouldValidate: true })}
          emptyMessage="No se encontraron proyectos de desarrollo."
        />

        <TextField label="Descripción del incidente" errorText={errors.description?.message} {...register('description')} />

        <TextField
          label="Evidencia"
          placeholder="Enlace a captura, video o documento de respaldo"
          errorText={errors.evidenceUrl?.message}
          {...register('evidenceUrl')}
        />
      </form>
    </Modal>
  );
}
