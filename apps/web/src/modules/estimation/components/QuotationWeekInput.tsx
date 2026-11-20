import { useEffect, useState, type KeyboardEvent } from 'react';

type Props = {
  value: number;
  label: string;
  min: number;
  max?: number;
  disabled?: boolean;
  onCommit: (value: number) => boolean | void;
};

/**
 * Editor decimal estable: no intenta persistir cada pulsación ni transforma
 * un campo temporalmente vacío en 1. Soporta coma decimal y medios períodos.
 */
export function QuotationWeekInput({ value, label, min, max = 520, disabled, onCommit }: Props) {
  const format = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 1 });
  const [raw, setRaw] = useState(() => format(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setRaw(format(value)); setInvalid(false); }, [value]);

  const commit = (text: string) => {
    const parsed = Number(text.trim().replace(',', '.'));
    if (!text.trim() || !Number.isFinite(parsed) || parsed < min || parsed > max ||
        !Number.isInteger(parsed * 2)) {
      setRaw(format(value));
      setInvalid(true);
      return;
    }
    if (Math.abs(parsed - value) > 0.000001 && onCommit(parsed) === false) {
      setRaw(format(value));
      setInvalid(true);
      return;
    }
    setRaw(format(parsed));
    setInvalid(false);
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      setRaw(format(value));
      setInvalid(false);
      event.currentTarget.blur();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const current = Number(raw.replace(',', '.'));
      const basis = Number.isFinite(current) ? current : value;
      const next = Math.min(max, Math.max(min, Math.round((basis +
        (event.key === 'ArrowUp' ? 0.5 : -0.5)) * 2) / 2));
      commit(String(next));
    }
  };
  return (
    <input type="text" inputMode="decimal" aria-label={label}
      aria-invalid={invalid} title="Admite medias semanas (ej.: 1,5). Intro para aplicar."
      value={raw} disabled={disabled} onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => { setRaw(event.target.value); setInvalid(false); }}
      onBlur={() => commit(raw)} onKeyDown={onKey} />
  );
}
