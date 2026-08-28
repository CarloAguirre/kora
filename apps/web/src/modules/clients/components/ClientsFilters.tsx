import styles from './ClientsFilters.module.css';
import { TextField } from '@/shared/components/ui/TextField';
import { Button } from '@/shared/components/ui/Button';
import { SearchIcon } from '@/shared/components/icons/Icons';

export interface ClientsFiltersValue {
  readonly search: string;
}

export interface ClientsFiltersProps {
  value: ClientsFiltersValue;
  onChange: (value: ClientsFiltersValue) => void;
}

export function ClientsFilters({ value, onChange }: ClientsFiltersProps) {
  const hasActiveFilters = value.search !== '';

  return (
    <div className={styles.filters}>
      <TextField
        className={styles.search}
        label="Buscar"
        type="search"
        placeholder="Empresa, razón social o RUT"
        value={value.search}
        onChange={(event) => onChange({ ...value, search: event.target.value })}
        iconLeft={<SearchIcon size={16} />}
      />

      {hasActiveFilters && (
        <Button className={styles.reset} variant="tertiary" size="sm" onClick={() => onChange({ search: '' })}>
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
