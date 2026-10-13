import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  createTicketSchema,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  SELECTABLE_TICKET_SERVICE_TYPES,
  TICKET_SERVICE_TYPE_LABELS,
  type CreateTicketInput,
} from '@kora/contracts';
import styles from './NewTicketDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Combobox } from '@/shared/components/ui/Combobox';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { useToast } from '@/shared/components/ui/Toast';
import { useCreateTicket, useTicketLinkableClients, useTicketLinkableProjects } from '../api/tickets.queries';
import { useUsersList } from '@/modules/users/api/users.queries';
import { ApiRequestError } from '@/shared/lib/api-client';

type TicketFormValues = z.input<typeof createTicketSchema>;

const SERVICE_TYPE_OPTIONS = SELECTABLE_TICKET_SERVICE_TYPES.map((type) => ({ value: type, label: TICKET_SERVICE_TYPE_LABELS[type] }));
const PRIORITY_OPTIONS = TICKET_PRIORITIES.map((priority) => ({ value: priority, label: TICKET_PRIORITY_LABELS[priority] }));

// El `<select>` nativo entrega '' para "Sin definir" — sin esto, un enum
// `.nullish()` (como `priority`) rechaza el string vacío en vez de tratarlo
// como "no elegido".
const emptyToUndefined = (value: string) => value || undefined;

export interface NewTicketDialogProps {
  open: boolean;
  onClose: () => void;
  /** Se dispara tras crear el ticket, para que el tablero abra su ficha — igual que el `TicketNavigationState` de la v1. */
  onCreated: (ticketId: string) => void;
}

/**
 * Réplica de la v1: crear un ticket es un modal sobre el tablero
 * (`Soporte/index.tsx`), no una ruta propia — igual criterio que
 * `EditTicketDialog` y `TicketDetailModal`.
 */
export function NewTicketDialog({ open, onClose, onCreated }: NewTicketDialogProps) {
  const toast = useToast();
  const createTicket = useCreateTicket();
  const { data: clients } = useTicketLinkableClients();
  // Cualquier persona del sistema puede ser responsable de un ticket — es
  // quien puede cargarle horas por tenerlo asignado, no solo colaboradores.
  // Los eliminados ya vienen fuera del listado; los deshabilitados se descartan
  // aquí: no entran al sistema, así que asignarles el ticket lo deja sin dueño.
  const { data: users } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName' });
  const assignableUsers = (users?.items ?? []).filter((user) => user.status !== 'disabled');
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TicketFormValues, unknown, CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: { title: '' },
  });

  // El cliente elegido acota los proyectos disponibles — un ticket no puede
  // quedar vinculado a un proyecto de otro cliente.
  const clientId = useWatch({ control, name: 'clientId' });
  const projectId = useWatch({ control, name: 'projectId' });
  const developmentProjectId = useWatch({ control, name: 'developmentProjectId' });
  const assigneeUserId = useWatch({ control, name: 'assigneeUserId' });
  const { data: supportProjects } = useTicketLinkableProjects(clientId || undefined, 'support');
  // Y el contrato acota los de desarrollo a los que cubre.
  const { data: developmentProjects } = useTicketLinkableProjects(clientId || undefined, 'development', projectId || undefined);

  const previousClientId = useRef(clientId);
  useEffect(() => {
    if (previousClientId.current === clientId) return;
    previousClientId.current = clientId;
    setValue('projectId', undefined);
    setValue('developmentProjectId', undefined);
  }, [clientId, setValue]);

  const previousProjectId = useRef(projectId);
  useEffect(() => {
    if (previousProjectId.current === projectId) return;
    previousProjectId.current = projectId;
    setValue('developmentProjectId', undefined);
  }, [projectId, setValue]);

  useEffect(() => {
    if (!open) return;
    setServerError(null);
    reset({ title: '' });
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await createTicket.mutateAsync(values);
      toast.success(`Se creó el ticket "${values.title}".`);
      onCreated(result.id);
    } catch (error) {
      setServerError(error instanceof ApiRequestError ? error.message : 'No se pudo crear el ticket.');
    }
  });

  return (
    <Modal
      open={open}
      title="Nuevo ticket"
      onClose={onClose}
      wide
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={() => void onSubmit()} loading={isSubmitting} loadingText="Creando…">
            Crear ticket
          </Button>
        </>
      }
    >
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {serverError && (
          <div className={styles.alert} role="alert">
            <AlertIcon size={18} className={styles.alertIcon} />
            <span>{serverError}</span>
          </div>
        )}

        <TextField label="Título" required errorText={errors.title?.message} {...register('title')} autoFocus />

        <div className={styles.row}>
          <Combobox
            label="Cliente"
            required
            placeholder="Buscar cliente…"
            options={[{ value: '', label: 'Sin cliente' }, ...(clients ?? []).map((client) => ({ value: client.id, label: client.companyName }))]}
            value={clientId ?? ''}
            onChange={(value) => setValue('clientId', value || undefined, { shouldValidate: true })}
            emptyMessage="No se encontraron clientes."
            errorText={errors.clientId?.message}
          />
          <Combobox
            label="Contrato"
            required
            placeholder="Buscar contrato…"
            options={[
              { value: '', label: 'Sin contrato' },
              ...(supportProjects ?? []).map((project) => ({ value: project.id, label: project.name })),
            ]}
            value={projectId ?? ''}
            onChange={(value) => setValue('projectId', value || undefined, { shouldValidate: true })}
            emptyMessage="No se encontraron contratos."
            errorText={errors.projectId?.message}
          />
        </div>

        <div className={styles.row}>
          <Select
            label="Tipo de servicio"
            required
            placeholder="Sin definir"
            options={SERVICE_TYPE_OPTIONS}
            errorText={errors.serviceType?.message}
            {...register('serviceType', { setValueAs: emptyToUndefined })}
          />
          <Select
            label="Criticidad"
            placeholder="Sin definir"
            options={PRIORITY_OPTIONS}
            {...register('priority', { setValueAs: emptyToUndefined })}
          />
        </div>

        <div className={styles.row}>
          <Combobox
            label="Responsable"
            required
            placeholder="Buscar persona…"
            options={[{ value: '', label: 'Sin asignar' }, ...assignableUsers.map((user) => ({ value: user.id, label: user.fullName }))]}
            value={assigneeUserId ?? ''}
            onChange={(value) => setValue('assigneeUserId', value || undefined, { shouldValidate: true })}
            emptyMessage="No se encontraron personas."
            errorText={errors.assigneeUserId?.message}
          />
          <TextField label="HH estimadas" type="number" {...register('estimatedHours')} />
        </div>

        <Combobox
          label="Proyecto de desarrollo"
          required
          placeholder="Buscar proyecto de desarrollo…"
          options={[
            { value: '', label: 'Sin vincular' },
            ...(developmentProjects ?? []).map((project) => ({ value: project.id, label: project.name })),
          ]}
          value={developmentProjectId ?? ''}
          onChange={(value) => setValue('developmentProjectId', value || undefined, { shouldValidate: true })}
          emptyMessage="No se encontraron proyectos de desarrollo."
          errorText={errors.developmentProjectId?.message}
        />

        <TextField label="Descripción del incidente" placeholder="Detalle lo ocurrido" {...register('description')} />

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
