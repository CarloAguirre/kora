import { Controller, useFieldArray, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { createClientSchema } from '@kora/contracts';

/** Coincide exactamente con el tipo de entrada que usa `ClientFormDialog`: los
 *  campos con valor por defecto en el esquema (como `contacts`) son opcionales
 *  aquí y obligatorios en la salida validada. */
type ClientFormValues = z.input<typeof createClientSchema>;
import styles from './ClientContactsEditor.module.css';
import { TextField } from '@/shared/components/ui/TextField';
import { PhoneField } from '@/shared/components/ui/PhoneField';
import { Button } from '@/shared/components/ui/Button';
import { PlusIcon, TrashIcon } from '@/shared/components/icons/Icons';

/**
 * Lista editable de contactos dentro del formulario de cliente.
 *
 * `useFieldArray` es lo que hace que agregar y quitar filas no reinicie el
 * resto del formulario: cada fila es su propio campo con su propia validación,
 * y `react-hook-form` reconcilia el array por índice.
 */
export interface ClientContactsEditorProps {
  control: Control<ClientFormValues>;
  errors: FieldErrors<ClientFormValues>;
  register: UseFormRegister<ClientFormValues>;
}

export function ClientContactsEditor({ control, errors, register }: ClientContactsEditorProps) {
  const { fields, append, remove } = useFieldArray({ control, name: 'contacts' });

  return (
    <div className={styles.list}>
      {fields.length === 0 && <p className={styles.empty}>Sin contactos registrados.</p>}

      {fields.map((field, index) => (
        <div key={field.id} className={styles.row}>
          <TextField
            label="Nombre"
            errorText={errors.contacts?.[index]?.name?.message}
            {...register(`contacts.${index}.name`)}
          />
          <TextField label="Cargo" {...register(`contacts.${index}.position`)} />
          <TextField
            label="Correo"
            type="email"
            errorText={errors.contacts?.[index]?.email?.message}
            {...register(`contacts.${index}.email`)}
          />
          <Controller
            control={control}
            name={`contacts.${index}.phone`}
            render={({ field: { ref, value, onChange, onBlur, name } }) => (
              <PhoneField
                ref={ref}
                name={name}
                label="Teléfono"
                value={value ?? ''}
                onChange={onChange}
                onBlur={onBlur}
                errorText={errors.contacts?.[index]?.phone?.message}
              />
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={styles.removeButton}
            onClick={() => remove(index)}
            aria-label="Quitar contacto"
          >
            <TrashIcon size={16} />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className={styles.addButton}
        onClick={() => append({ name: '', position: '', email: '', phone: '' })}
        iconLeft={<PlusIcon size={14} />}
      >
        Agregar contacto
      </Button>
    </div>
  );
}
