import { useEffect, useState } from 'react';
import { TextField } from '@/shared/components/ui/TextField';

/** Evita que una EDT abra el modal a mitad de escribir 20 o 75.
 * Se confirma en blur/Enter, se revierte en Escape y cancelar conserva la
 * capacidad anterior. No se guarda nada hasta que se confirme el modal WBS.
 */
export function QuotationCapacityInput({
  label, value, max, disabled, className, onCommit,
}: {
  label: string; value: number; max: number;
  disabled: boolean; className?: string; onCommit: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  const restore = () => {
    setEditing(false);
    setText(String(value));
  };
  const commit = () => {
    const raw = text.trim();
    const next = raw ? Number(raw) : Number.NaN;
    restore();
    if (!Number.isFinite(next) || next < 0 || next > max) return;
    if (next !== value) onCommit(next);
  };

  return <TextField className={className} type="number" min={0}
    max={max} step={0.01} disabled={disabled} aria-label={label}
    value={text}
    onChange={(event) => {
      setEditing(true);
      setText(event.target.value);
    }}
    onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') {
        restore();
        event.currentTarget.blur();
      }
    }}/>;
}
