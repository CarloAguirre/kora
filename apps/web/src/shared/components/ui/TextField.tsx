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
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "../icons/Icons";
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
  /**
   * Solo `type="date"`: días que el calendario destaca como feriados (con su
   * nombre en el tooltip y en la lista bajo la grilla). Solo los marca —
   * seguir permitiendo o no elegirlos es responsabilidad del formulario.
   */
  holidays?: readonly { date: string; name: string }[];
}

function applyRef(
  ref: ForwardedRef<HTMLInputElement>,
  node: HTMLInputElement | null,
) {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}

const WEEKDAY_LABELS = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];

/** Cuántos años muestra a la vez la vista de años (grilla de 3×4). */
const YEARS_PER_PAGE = 12;

/**
 * Vista del calendario: la grilla de días, o las de meses/años a las que se
 * llega pinchando el título — para saltar a una fecha lejana sin avanzar mes
 * a mes con las flechas.
 */
type CalendarView = "days" | "months" | "years";

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("es-CL") + text.slice(1);
}

const MONTH_LABELS = Array.from({ length: 12 }, (_, month) =>
  capitalize(
    new Date(2000, month, 1)
      .toLocaleDateString("es-CL", { month: "short" })
      .replace(".", ""),
  ),
);

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
      holidays,
      ...rest
    },
    ref,
  ) {
    const inputId = useId();
    const helperId = `${inputId}-helper`;
    const hasError = Boolean(errorText);
    const message = errorText ?? helperText;

    const isDate = rest.type === "date";
    const isSearch = rest.type === "search";
    const inputRef = useRef<HTMLInputElement | null>(null);
    const fieldRef = useRef<HTMLDivElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const setRefs = (node: HTMLInputElement | null) => {
      inputRef.current = node;
      applyRef(ref, node);
    };

    const [calendarOpen, setCalendarOpen] = useState(false);
    const [viewMonth, setViewMonth] = useState(() => new Date());
    const [calendarView, setCalendarView] = useState<CalendarView>("days");
    const [selectedISO, setSelectedISO] = useState("");
    // El panel se dibuja en un portal — de otro modo un ancestro con
    // `overflow: auto/hidden` (p. ej. el modal de detalle de un ticket, que
    // scrollea) lo recorta en vez de dejarlo flotar por encima. El destino no
    // es siempre `document.body`: un `<dialog>` abierto vive en la "top layer"
    // del navegador, que pinta por ENCIMA de cualquier z-index del documento
    // normal sin importar qué tan alto sea — así que un panel portado a
    // `document.body` queda tapado por cualquier modal (`Modal.tsx` usa
    // `<dialog>`). La salida es portar el panel DENTRO de ese `<dialog>`, para
    // que herede su promoción a la top layer.
    const getPortalTarget = (): Element =>
      fieldRef.current?.closest("dialog") ?? document.body;
    const [panelPosition, setPanelPosition] = useState<
      { top?: number; bottom?: number; left: number } | null
    >(null);

    const updatePanelPosition = () => {
      const rect = fieldRef.current?.getBoundingClientRect();
      if (!rect) return;
      const PANEL_WIDTH = 264; // ancho fijo de `.datePanel` en TextField.module.css
      // Alto aproximado del panel: siempre son 6 filas de días (42 celdas fijas
      // en `buildMonthGrid`) más cabecera/semana/pie, así que es estable sin
      // necesidad de medirlo en el DOM.
      const PANEL_HEIGHT = 320;
      const PANEL_GAP = 8; // var(--kora-space-2)
      const left = rect.right - PANEL_WIDTH;
      // Si no cabe debajo del campo (p. ej. un campo cerca del borde inferior de
      // la pantalla), se abre hacia arriba en su lugar — anclado por `bottom`,
      // para que siga pegado al campo aunque cambie de alto (las vistas de
      // meses/años o la lista de feriados no miden lo mismo que la de días).
      const fitsBelow = rect.bottom + PANEL_GAP + PANEL_HEIGHT <= window.innerHeight;
      setPanelPosition(
        fitsBelow
          ? { top: rect.bottom + PANEL_GAP, left }
          : { bottom: window.innerHeight - rect.top + PANEL_GAP, left },
      );
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
      setCalendarView("days");
      setCalendarOpen(true);
    };

    const applyDate = (value: string) => {
      if (inputRef.current) setNativeInputValue(inputRef.current, value);
      setSelectedISO(value);
      setCalendarOpen(false);
    };

    const clearSearch = () => {
      if (inputRef.current) setNativeInputValue(inputRef.current, "");
      inputRef.current?.focus();
    };

    const hasSearchValue = isSearch && typeof rest.value === "string" && rest.value.length > 0;

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
      ) : hasSearchValue ? (
        <button
          type="button"
          className={styles.clearTrigger}
          disabled={disabled}
          aria-label="Limpiar búsqueda"
          onClick={clearSearch}
        >
          <CloseIcon size={14} />
        </button>
      ) : undefined);

    const gridDays = isDate && calendarOpen ? buildMonthGrid(viewMonth) : [];
    const today = new Date();
    const todayISO = toISODate(today);
    const viewYear = viewMonth.getFullYear();
    const selectedDate = parseISODate(selectedISO);
    // La página de años deja el año visto en la segunda fila (4 años atrás, 7
    // adelante): las fechas de proyectos suelen ser futuras, y con bloques
    // fijos (2016–2027) el año siguiente quedaría a menudo en otra página.
    const yearsPageStart = viewYear - 4;
    const pageYears = Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearsPageStart + i);
    const panelTitle =
      calendarView === "days"
        ? capitalize(viewMonth.toLocaleDateString("es-CL", { month: "long", year: "numeric" }))
        : calendarView === "months"
          ? String(viewYear)
          : `${yearsPageStart} – ${yearsPageStart + YEARS_PER_PAGE - 1}`;
    // Cada vista mueve las flechas en su propia unidad: un mes, un año o una
    // página de años.
    const navStep = { days: 1, months: 12, years: 12 * YEARS_PER_PAGE }[calendarView];
    const [prevLabel, nextLabel] = {
      days: ["Mes anterior", "Mes siguiente"],
      months: ["Año anterior", "Año siguiente"],
      years: ["Años anteriores", "Años siguientes"],
    }[calendarView];
    const shiftView = (direction: 1 | -1) =>
      setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + direction * navStep, 1));
    const holidayNames = new Map((holidays ?? []).map((h) => [h.date, h.name]));
    const viewMonthHolidays = gridDays
      .filter((day) => day.getMonth() === viewMonth.getMonth() && holidayNames.has(toISODate(day)))
      .map((day) => ({ day: day.getDate(), name: holidayNames.get(toISODate(day)) ?? "" }));

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
            // En un buscador se escriben fragmentos de nombres y códigos: el
            // subrayado del corrector ahí solo distrae.
            spellCheck={isSearch ? false : undefined}
            {...rest}
          />

          {resolvedIconRight && (
            <span className={styles.adornment}>{resolvedIconRight}</span>
          )}

          {isDate && calendarOpen && panelPosition && createPortal(
            <div
              ref={panelRef}
              className={styles.datePanel}
              style={panelPosition}
              role="dialog"
              aria-label="Seleccionar fecha"
            >
              <div className={styles.datePanelHeader}>
                <button
                  type="button"
                  className={styles.datePanelNav}
                  aria-label={prevLabel}
                  onClick={() => shiftView(-1)}
                >
                  <ChevronLeftIcon size={16} />
                </button>
                {calendarView === "years" ? (
                  <span className={styles.datePanelTitle}>{panelTitle}</span>
                ) : (
                  <button
                    type="button"
                    className={[styles.datePanelTitle, styles.datePanelTitleButton].join(" ")}
                    aria-label={`${panelTitle}. ${calendarView === "days" ? "Elegir mes y año" : "Elegir año"}`}
                    onClick={() => setCalendarView(calendarView === "days" ? "months" : "years")}
                  >
                    {panelTitle}
                    <ChevronDownIcon size={14} />
                  </button>
                )}
                <button
                  type="button"
                  className={styles.datePanelNav}
                  aria-label={nextLabel}
                  onClick={() => shiftView(1)}
                >
                  <ChevronRightIcon size={16} />
                </button>
              </div>

              {calendarView === "months" && (
                <div className={styles.datePanelGridWide}>
                  {MONTH_LABELS.map((monthLabel, month) => {
                    const isSelected =
                      selectedDate?.getFullYear() === viewYear && selectedDate.getMonth() === month;
                    const isCurrent = today.getFullYear() === viewYear && today.getMonth() === month;
                    return (
                      <button
                        key={monthLabel}
                        type="button"
                        className={[
                          styles.dateCell,
                          styles.dateCellWide,
                          isSelected ? styles.dateCellSelected : "",
                          isCurrent && !isSelected ? styles.dateCellToday : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => {
                          setViewMonth(new Date(viewYear, month, 1));
                          setCalendarView("days");
                        }}
                      >
                        {monthLabel}
                      </button>
                    );
                  })}
                </div>
              )}

              {calendarView === "years" && (
                <div className={styles.datePanelGridWide}>
                  {pageYears.map((year) => {
                    const isSelected = selectedDate?.getFullYear() === year;
                    const isCurrent = today.getFullYear() === year;
                    return (
                      <button
                        key={year}
                        type="button"
                        className={[
                          styles.dateCell,
                          styles.dateCellWide,
                          isSelected ? styles.dateCellSelected : "",
                          isCurrent && !isSelected ? styles.dateCellToday : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => {
                          setViewMonth(new Date(year, viewMonth.getMonth(), 1));
                          setCalendarView("months");
                        }}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>
              )}

              {calendarView === "days" && (
                <div className={styles.datePanelWeekdays}>
                  {WEEKDAY_LABELS.map((weekday) => (
                    <span key={weekday}>{weekday}</span>
                  ))}
                </div>
              )}

              {calendarView === "days" && (
              <div className={styles.datePanelGrid}>
                {gridDays.map((day) => {
                  const iso = toISODate(day);
                  const inMonth = day.getMonth() === viewMonth.getMonth();
                  const isSelected = iso === selectedISO;
                  const isToday = iso === todayISO;
                  const holidayName = holidayNames.get(iso);
                  return (
                    <button
                      key={iso}
                      type="button"
                      title={holidayName ? `Feriado: ${holidayName}` : undefined}
                      aria-label={holidayName ? `${day.getDate()}, feriado: ${holidayName}` : undefined}
                      className={[
                        styles.dateCell,
                        holidayName ? styles.dateCellHoliday : "",
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
              )}

              {calendarView === "days" && viewMonthHolidays.length > 0 && (
                <ul className={styles.datePanelHolidays}>
                  {viewMonthHolidays.map((holiday) => (
                    <li key={holiday.day}>
                      <span className={styles.datePanelHolidayDay}>{holiday.day}</span>
                      {holiday.name}
                    </li>
                  ))}
                </ul>
              )}

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
            getPortalTarget(),
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
