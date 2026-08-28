import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  createTicketSchema,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_SERVICE_TYPES,
  TICKET_SERVICE_TYPE_LABELS,
  type CreateTicketInput,
} from '@kora/contracts';
import styles from './NewTicketPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { useToast } from '@/shared/components/ui/Toast';
import { useCreateTicket } from '../api/tickets.queries';
import { useClientsList } from '@/modules/clients/api/clients.queries';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import { useUsersList } from '@/modules/users/api/users.queries';
import { ApiRequestError } from '@/shared/lib/api-client';

type TicketFormValues = z.input<typeof createTicketSchema>;

const SERVICE_TYPE_OPTIONS = TICKET_SERVICE_TYPES.map((type) => ({ value: type, label: TICKET_SERVICE_TYPE_LABELS[type] }));
const PRIORITY_OPTIONS = TICKET_PRIORITIES.map((priority) => ({ value: priority, label: TICKET_PRIORITY_LABELS[priority] }));

export function NewTicketPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const createTicket = useCreateTicket();
  const { data: clients } = useClientsList({ page: 1, pageSize: 200, sortField: 'companyName' });
  const { data: projects } = useProjectsList({ page: 1, pageSize: 200, sortField: 'name' });
  const { data: users } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName' });
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TicketFormValues, unknown, CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: { title: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await createTicket.mutateAsync(values);
      toast.success(`Se creó el ticket "${values.title}".`);
      void navigate(`/tickets/${result.id}`);
    } catch (error) {
      setServerError(error instanceof ApiRequestError ? error.message : 'No se pudo crear el ticket.');
    }
  });

  return (
    <DashboardLayout title="Nuevo ticket">
      <Card className={styles.card}>
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {serverError && (
            <div className={styles.alert} role="alert">
              <AlertIcon size={18} className={styles.alertIcon} />
              <span>{serverError}</span>
            </div>
          )}

          <TextField label="Título" required errorText={errors.title?.message} {...register('title')} />

          <div className={styles.row}>
            <Select
              label="Cliente"
              placeholder="Sin cliente"
              options={(clients?.items ?? []).map((client) => ({ value: client.id, label: client.companyName }))}
              {...register('clientId')}
            />
            <Select
              label="Proyecto"
              placeholder="Sin proyecto"
              options={(projects?.items ?? []).map((project) => ({ value: project.id, label: project.name }))}
              {...register('projectId')}
            />
          </div>

          <div className={styles.row}>
            <Select label="Tipo de servicio" placeholder="Sin definir" options={SERVICE_TYPE_OPTIONS} {...register('serviceType')} />
            <Select label="Criticidad" placeholder="Sin definir" options={PRIORITY_OPTIONS} {...register('priority')} />
          </div>

          <div className={styles.row}>
            <Select
              label="Responsable"
              placeholder="Sin asignar"
              options={(users?.items ?? []).map((user) => ({ value: user.id, label: user.fullName }))}
              {...register('assigneeUserId')}
            />
            <TextField label="HH estimadas" type="number" {...register('estimatedHours')} />
          </div>

          <TextField label="Descripción del incidente" placeholder="Detalle lo ocurrido" {...register('description')} />

          <div className={styles.actions}>
            <Button variant="outline" type="button" onClick={() => void navigate('/tickets')}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting} loadingText="Creando…">
              Crear ticket
            </Button>
          </div>
        </form>
      </Card>
    </DashboardLayout>
  );
}
