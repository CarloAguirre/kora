import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ForwardedRef,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "../icons/Icons";
import styles from "./TextField.module.css";

/**
 * Campo de texto con etiqueta, texto de ayuda y estado de error.
 *
 * Reenvía la `ref`, que es lo que permite usarlo con `react-hook-form` sin
 * envoltorios. El vínculo entre etiqueta, campo y mensaje de error se hace con
 * identificadores generados (`useId`) y `aria-describedby`: sin eso, un lector
 * de pantalla anuncia el campo pero no el motivo del error.
 *
 * Para `type="date"` dibuja además un calendario propio (`.datePanel`): el
 * calendario nativo del navegador no tiene ningún gancho de CSS (ni con
 * prefijo `-webkit-`), así que la única forma de que se vea "con espíritu
 * Kora" es no depender de él. El `<input>` nativo se mantiene intacto por
 * debajo — sigue siendo editable por segmentos (día/mes/año) y sigue
 * funcionando con `register()` de react-hook-form — y el calendario propio
 * solo le escribe el valor con el setter nativo + un evento `input`, que es
 * la forma estándar de que tanto un `onChange` controlado como
 * react-hook-form se enteren de un cambio hecho por código.
 */

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id"
> {
  label?: string;
  helperText?: string;
  errorText?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

function applyRef(
  ref: ForwardedRef<HTMLInputElement>,
  node: HTMLInputElement | null,
) {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}

const WEEKDAY_LABELS = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODate(value: string | undefined): Date | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function buildMonthGrid(monthStart: Date): Date[] {
  const startWeekday = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    1 - startWeekday,
  );
  return Array.from(
    { length: 42 },
    (_, i) =>
      new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + i,
      ),
  );
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    {
      label,
      helperText,
      errorText,
      iconLeft,
      iconRight,
      required,
      disabled,
      className,
      onFocus,
      ...rest
    },
    ref,
  ) {
    const inputId = useId();
    const helperId = `${inputId}-helper`;
    const hasError = Boolean(errorText);
    const message = errorText ?? helperText;

    const isDate = rest.type === "date";
    const inputRef = useRef<HTMLInputElement | null>(null);
    const fieldRef = useRef<HTMLDivElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const setRefs = (node: HTMLInputElement | null) => {
      inputRef.current = node;
      applyRef(ref, node);
    };

    const [calendarOpen, setCalendarOpen] = useState(false);
    const [viewMonth, setViewMonth] = useState(() => new Date());
    const [selectedISO, setSelectedISO] = useState("");
    // El panel se dibuja en un portal a `document.body` — de otro modo un
    // ancestro con `overflow: auto/hidden` (p. ej. el modal de detalle de un
    // ticket, que scrollea) lo recorta en vez de dejarlo flotar por encima.
    const [panelPosition, setPanelPosition] = useState<{ top: number; left: number } | null>(null);

    const updatePanelPosition = () => {
      const rect = fieldRef.current?.getBoundingClientRect();
      if (!rect) return;
      const PANEL_WIDTH = 264; // ancho fijo de `.datePanel` en TextField.module.css
      const PANEL_GAP = 8; // var(--kora-space-2)
      setPanelPosition({ top: rect.bottom + PANEL_GAP, left: rect.right - PANEL_WIDTH });
    };

    useEffect(() => {
      if (!calendarOpen) return;
      updatePanelPosition();
      const handlePointerDown = (event: MouseEvent) => {
        const target = event.target as Node;
        if (
          fieldRef.current &&
          !fieldRef.current.contains(target) &&
          !panelRef.current?.contains(target)
        ) {
          setCalendarOpen(false);
        }
      };
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") setCalendarOpen(false);
      };
      const handleReposition = () => updatePanelPosition();
      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      window.addEventListener("scroll", handleReposition, true);
      window.addEventListener("resize", handleReposition);
      return () => {
        document.removeEventListener("mousedown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("scroll", handleReposition, true);
        window.removeEventListener("resize", handleReposition);
      };
    }, [calendarOpen]);

    const openCalendar = () => {
      if (disabled) return;
      const current = inputRef.current?.value ?? "";
      const parsed = parseISODate(current) ?? new Date();
      setSelectedISO(current);
      setViewMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
      setCalendarOpen(true);
    };

    const applyDate = (value: string) => {
      if (inputRef.current) setNativeInputValue(inputRef.current, value);
      setSelectedISO(value);
      setCalendarOpen(false);
    };

    const resolvedIconRight =
      iconRight ??
      (isDate ? (
        <button
          type="button"
          className={styles.dateTrigger}
          disabled={disabled}
          aria-label="Abrir calendario"
          onClick={openCalendar}
        >
          <CalendarIcon size={16} />
        </button>
      ) : undefined);

    const gridDays = isDate && calendarOpen ? buildMonthGrid(viewMonth) : [];
    const todayISO = toISODate(new Date());
    const rawMonthLabel = viewMonth.toLocaleDateString("es-CL", {
      month: "long",
      year: "numeric",
    });
    const monthLabel =
      rawMonthLabel.charAt(0).toLocaleUpperCase("es-CL") +
      rawMonthLabel.slice(1);

    return (
      <div className={[styles.wrapper, className].filter(Boolean).join(" ")}>
        {label && (
          <label className={styles.label} htmlFor={inputId}>
            {label}
            {required && (
              <span className={styles.required} aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        <div
          ref={fieldRef}
          className={[
            styles.field,
            hasError ? styles.invalid : "",
            disabled ? styles.disabled : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {iconLeft && <span className={styles.adornment}>{iconLeft}</span>}

          <input
            ref={setRefs}
            id={inputId}
            className={[styles.input, isDate ? styles.dateInput : ""]
              .filter(Boolean)
              .join(" ")}
            disabled={disabled}
            required={required}
            aria-invalid={hasError || undefined}
            aria-describedby={message ? helperId : undefined}
            onFocus={
              isDate
                ? (event) => {
                    openCalendar();
                    onFocus?.(event);
                  }
                : onFocus
            }
            {...rest}
          />

          {resolvedIconRight && (
            <span className={styles.adornment}>{resolvedIconRight}</span>
          )}

          {isDate && calendarOpen && panelPosition && createPortal(
            <div
              ref={panelRef}
              className={styles.datePanel}
              style={{ top: panelPosition.top, left: panelPosition.left }}
              role="dialog"
              aria-label="Seleccionar fecha"
            >
              <div className={styles.datePanelHeader}>
                <button
                  type="button"
                  className={styles.datePanelNav}
                  aria-label="Mes anterior"
                  onClick={() =>
                    setViewMonth(
                      (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1),
                    )
                  }
                >
                  <ChevronLeftIcon size={16} />
                </button>
                <span className={styles.datePanelTitle}>{monthLabel}</span>
                <button
                  type="button"
                  className={styles.datePanelNav}
                  aria-label="Mes siguiente"
                  onClick={() =>
                    setViewMonth(
                      (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1),
                    )
                  }
                >
                  <ChevronRightIcon size={16} />
                </button>
              </div>

              <div className={styles.datePanelWeekdays}>
                {WEEKDAY_LABELS.map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>

              <div className={styles.datePanelGrid}>
                {gridDays.map((day) => {
                  const iso = toISODate(day);
                  const inMonth = day.getMonth() === viewMonth.getMonth();
                  const isSelected = iso === selectedISO;
                  const isToday = iso === todayISO;
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={[
                        styles.dateCell,
                        !inMonth ? styles.dateCellMuted : "",
                        isSelected ? styles.dateCellSelected : "",
                        isToday && !isSelected ? styles.dateCellToday : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => applyDate(iso)}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className={styles.datePanelFooter}>
                <button
                  type="button"
                  className={styles.datePanelLink}
                  onClick={() => applyDate("")}
                >
                  Borrar
                </button>
                <button
                  type="button"
                  className={styles.datePanelLink}
                  onClick={() => applyDate(todayISO)}
                >
                  Hoy
                </button>
              </div>
            </div>,
            document.body,
          )}
        </div>
        {message && (
          <span
            id={helperId}
            className={[styles.helper, hasError ? styles.helperError : ""]
              .filter(Boolean)
              .join(" ")}
            // Anuncia el error en cuanto aparece, sin que la persona tenga que
            // volver a recorrer el formulario para descubrirlo.
            role={hasError ? "alert" : undefined}
          >
            {message}
          </span>
        )}
      </div>
    );
  },
);
