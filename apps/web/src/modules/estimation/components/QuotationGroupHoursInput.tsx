import { useRef, useState } from 'react';

/** Confirma el TOTAL de un grupo una sola vez (blur/Enter).
 * No redistribuir en cada pulsación o click de spinner: si el usuario resta
 * 0,01 varias veces, cada render repartía el centésimo siempre a la primera
 * tarea, en vez de dividir el cambio completo entre todas las no fijas. */
export function QuotationGroupHoursInput({
  value, onCommit, disabled = false, className, label,
}: {
  value: number;
  onCommit: (hours: number) => void;
  disabled?: boolean;
  className?: string;
  label: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const cancelled = useRef(false);
  const committed = useRef(false);
  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    const raw = editing;
    setEditing(null);
    if (cancelled.current || raw === null || raw.trim() === '') return;
    const hours = Number(raw);
    // Las validaciones de precisión y mínimos las realiza el contrato
    // compartido; valores no numéricos no deben enviarse.
    if (Number.isFinite(hours) && hours >= 0 && Math.abs(hours - value) > 0.00000001) {
      onCommit(hours);
    }
  };
  return (
    <input type="number" min={0} max={1000000} step="0.01"
      className={className} aria-label={label}
      title="Aplica la redistribución al salir del campo o pulsar Enter"
      disabled={disabled} value={editing ?? String(value)}
      onFocus={() => {
        cancelled.current = false;
        committed.current = false;
        setEditing(String(value));
      }}
      onChange={(event) => {
        committed.current = false;
        setEditing(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          cancelled.current = true;
          commit();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
