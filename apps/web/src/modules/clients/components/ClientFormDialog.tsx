import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClientSchema, type ClientDetail, type CreateClientInput } from '@kora/contracts';
import styles from './ClientFormDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { ClientContactsEditor } from './ClientContactsEditor';
import {
  useClientDetail,
  useClientFormOptions,
  useCreateClient,
  useUpdateClient,
} from '../api/clients.queries';
import { ApiRequestError } from '@/shared/lib/api-client';

type ClientFormValues = z.input<typeof createClientSchema>;

export interface ClientFormDialogProps {
  open: boolean;
  /** null para un alta; el identificador del cliente para editarlo. */
  clientId: string | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

/**
 * Alta y edición de clientes.
 *
 * El resumen de la tabla (`ClientSummary`) no trae catálogos ni contactos, así
 * que al editar el diálogo pide el detalle completo por su cuenta
 * (`useClientDetail`) — la tabla muestra lo mínimo, el formulario pide lo
 * completo solo cuando hace falta.
 */
export function ClientFormDialog({ open, clientId, onClose, onSuccess }: ClientFormDialogProps) {
  const isEditing = clientId !== null;
  const { data: client, isLoading: loadingClient } = useClientDetail(open ? clientId : null);
  const { data: options } = useClientFormOptions();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues, unknown, CreateClientInput>({
    resolver: zodResolver(createClientSchema),
    defaultValues: emptyValues(),
  });

  useEffect(() => {
    if (!open) return;
    // En alta no hay nada que esperar; en edición se precarga en cuanto llega
    // el detalle (puede tardar el primer viaje de red).
    if (!isEditing) {
      reset(emptyValues());
      setServerError(null);
    } else if (client) {
      reset(toFormValues(client));
      setServerError(null);
    }
  }, [open, isEditing, client, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    try {
      if (isEditing && clientId) {
        await updateClient.mutateAsync({ clientId, input: values });
        onSuccess(`Se actualizaron los datos de ${values.companyName}.`);
      } else {
        await createClient.mutateAsync(values);
        onSuccess(`Se creó el cliente ${values.companyName}.`);
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const issues = error.fieldIssues;
        if (issues) {
          for (const [field, messages] of Object.entries(issues)) {
            if (field in values && messages[0]) {
              setError(field as keyof ClientFormValues, { message: messages[0] });
            }
          }
        }
        if (error.code === 'CLIENT_TAX_ID_ALREADY_IN_USE') {
          setError('taxId', { message: error.message });
        } else if (!issues) {
          setServerError(error.message);
        }
      } else {
        setServerError('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
      }
    }
  });

  return (
    <Modal
      open={open}
      wide
      title={isEditing ? 'Editar cliente' : 'Nuevo cliente'}
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="client-form"
            loading={isSubmitting}
            disabled={isEditing && loadingClient}
            loadingText="Guardando…"
          >
            {isEditing ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </>
      }
    >
      <form id="client-form" className={styles.form} onSubmit={onSubmit} noValidate>
        {isEditing && loadingClient && <p>Cargando datos del cliente…</p>}

        {serverError && (
          <div className={styles.alert} role="alert">
            <AlertIcon size={18} className={styles.alertIcon} />
            <span>{serverError}</span>
          </div>
        )}

        <div className={styles.row}>
          <TextField
            label="Nombre de la empresa"
            required
            errorText={errors.companyName?.message}
            {...register('companyName')}
          />
          <TextField
            label="Razón social"
            required
            errorText={errors.legalName?.message}
            {...register('legalName')}
          />
        </div>

        <div className={styles.row}>
          <TextField label="RUT" required errorText={errors.taxId?.message} {...register('taxId')} />
          <TextField label="Sitio web" {...register('website')} />
        </div>

        <TextField label="Dirección" {...register('address')} />

        <div className={styles.row}>
          <Select
            label="País"
            placeholder="Sin especificar"
            options={(options?.countries ?? []).map((c) => ({ value: c.id, label: c.name }))}
            {...register('countryId')}
          />
          <Select
            label="Comuna"
            placeholder="Sin especificar"
            options={(options?.comunas ?? []).map((c) => ({ value: c.id, label: c.name }))}
            {...register('comunaId')}
          />
        </div>

        <div className={styles.row}>
          <Select
            label="Giro"
            placeholder="Sin especificar"
            options={(options?.industries ?? []).map((c) => ({ value: c.id, label: c.name }))}
            {...register('industryId')}
          />
          <Select
            label="Responsable comercial"
            placeholder="Sin asignar"
            options={(options?.commercialManagers ?? []).map((c) => ({ value: c.id, label: c.name }))}
            {...register('commercialManagerUserId')}
          />
        </div>

        <div className={styles.section}>
          <span className={styles.sectionTitle}>Contactos</span>
          <ClientContactsEditor control={control} errors={errors} register={register} />
        </div>
      </form>
    </Modal>
  );
}

function emptyValues(): ClientFormValues {
  return {
    companyName: '',
    legalName: '',
    taxId: '',
    website: '',
    address: '',
    countryId: null,
    comunaId: null,
    industryId: null,
    businessSectorId: null,
    commercialManagerUserId: null,
    serviceStartDate: null,
    contacts: [],
  };
}

function toFormValues(client: ClientDetail): ClientFormValues {
  return {
    companyName: client.companyName,
    legalName: client.legalName,
    taxId: client.taxId,
    website: client.website ?? '',
    address: client.address ?? '',
    countryId: client.country?.id ?? null,
    comunaId: client.comuna?.id ?? null,
    industryId: client.industry?.id ?? null,
    businessSectorId: client.businessSector?.id ?? null,
    commercialManagerUserId: client.commercialManager?.id ?? null,
    serviceStartDate: client.serviceStartDate,
    contacts: client.contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      position: contact.position ?? '',
      email: contact.email ?? '',
      phone: contact.phone ?? '',
    })),
  };
}
