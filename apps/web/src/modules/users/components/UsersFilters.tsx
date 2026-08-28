import {
  ROLE_CODES,
  ROLE_LABELS,
  USER_STATUSES,
  USER_STATUS_LABELS,
  type RoleCode,
  type UserStatus,
} from '@kora/contracts';
import styles from './UsersFilters.module.css';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Button } from '@/shared/components/ui/Button';
import { SearchIcon } from '@/shared/components/icons/Icons';

/**
 * Barra de filtros del listado.
 *
 * Es un componente controlado y sin estado propio: recibe los filtros y avisa
 * de los cambios. Toda la lógica de qué hacer con ellos vive en la página, así
 * que este componente se puede reutilizar o probar aisladamente.
 */

export interface UsersFiltersValue {
  readonly search: string;
  readonly role: RoleCode | '';
  readonly status: UserStatus | '';
}

export interface UsersFiltersProps {
  value: UsersFiltersValue;
  onChange: (value: UsersFiltersValue) => void;
}

const ROLE_OPTIONS = ROLE_CODES.map((code) => ({ value: code, label: ROLE_LABELS[code] }));
const STATUS_OPTIONS = USER_STATUSES.map((status) => ({
  value: status,
  label: USER_STATUS_LABELS[status],
}));

export function UsersFilters({ value, onChange }: UsersFiltersProps) {
  const hasActiveFilters = value.search !== '' || value.role !== '' || value.status !== '';

  return (
    <div className={styles.filters}>
      <TextField
        className={styles.search}
        label="Buscar"
        type="search"
        placeholder="Nombre, apellido o correo"
        value={value.search}
        onChange={(event) => onChange({ ...value, search: event.target.value })}
        iconLeft={<SearchIcon size={16} />}
      />

      <Select
        className={styles.filter}
        label="Rol"
        placeholder="Todos"
        options={ROLE_OPTIONS}
        value={value.role}
        onChange={(event) => onChange({ ...value, role: event.target.value as RoleCode | '' })}
      />

      <Select
        className={styles.filter}
        label="Estado"
        placeholder="Todos"
        options={STATUS_OPTIONS}
        value={value.status}
        onChange={(event) => onChange({ ...value, status: event.target.value as UserStatus | '' })}
      />

      {hasActiveFilters && (
        <Button
          className={styles.reset}
          variant="tertiary"
          size="sm"
          onClick={() => onChange({ search: '', role: '', status: '' })}
        >
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
