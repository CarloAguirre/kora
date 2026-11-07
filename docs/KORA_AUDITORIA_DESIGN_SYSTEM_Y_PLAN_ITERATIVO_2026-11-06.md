# Kora — Auditoría de reutilización UI y plan de homologación incremental

**Fecha:** 2026-11-06  
**Rama de trabajo:** `feature/calculadora-roadmap-diseno-v5-02`
**Estado:** Iteraciones 1–3 validadas localmente por el equipo; iteración 4 implementada y pendiente de validación local.  
**Alcance:** Calculadora de cotizaciones y estimaciones, no reescritura funcional.

## 1. Contexto y conclusión

Kora ya contaba con una librería compartida en `apps/web/src/shared/components/ui` antes de incorporar `apps/web/src/modules/estimation`. La comparación de esta rama con `master` muestra que el módulo de estimación se agregó después, pero la mayoría de los controles base (Button, Badge, Card, Modal, TextField, Select, Tabs, SegmentedControl, DataTable, Toast) ya existían.

**Conclusión:** hay reutilización real pero incompleta. Son correctos los componentes propios que encapsulan reglas comerciales o de EDT; no lo son los botones, chips de estado, controles o colores genéricos duplicados cuando existe una alternativa nativa de Kora.

### Inventario verificado

| Elemento compartido | Reutilización encontrada | Hallazgo |
| --- | --- | --- |
| `Button` | Sí: acciones comerciales, guardado, aprobación IA y asistentes | Algunos botones del editor de fases, módulos y tablas son HTML con estilos propios |
| `Card` | Sí: contenedores de cotización y submódulos | Correcto; conservar |
| `Badge` | Parcial: estados de versión | No reemplazar con Badge las numeraciones "Fase 1/2" porque no representan un estado |
| `Modal` | Sí: asistente IA, gestión de asociación y operaciones | Correcto; conservar |
| `TextField` / `Select` | Parcial: asistente, cabecera y asignación | Entradas editables de equipos, EDT, costos y pagos usan controles estilizados localmente |
| `SegmentedControl` | Sí: vista por equipo / fases | Se detectaron overrides visuales locales; reducirlos si no son necesarios |
| `Toast` / `useConfirmAction` | Sí: avisos y confirmaciones de varios flujos | Mantener snackbar y confirmación compartidos |
| `DataTable` | No generalizado en tablas editables de cotización | Puede ser razonable conservar grillas editables especializadas; evaluar reutilización de elementos y estados sin romper edición |
| `Tabs` | No en selector de versiones | Evaluar adecuación semántica; las versiones no siempre son pestañas de contenido |

### Evidencia técnica principal

- `QuotationPhaseWorkspace.tsx` y `.module.css`: mezcla de `Card` con botones, campos y chips estilizados localmente; colores literales y reglas para fases/tareas.
- `QuotationTeamsWorkspace.tsx` y `.module.css`: reutiliza `SegmentedControl` pero configura campos y colores propios.
- `QuotationCommercialSections.tsx` y `.module.css`: tablas editables construidas con inputs/selects/botones nativos, sin los controles compartidos.
- `QuotationWorkspacePage.tsx` y `.module.css`: reutiliza `Button`, `Badge`, `Card`, `Modal`, `TextField`, `Select`; aún existen acciones y colores de versión definidos localmente.
- `QuotationAiReviewBanner.tsx` y `.module.css`: reutiliza `Button`, pero sobrescribe sus colores con CSS violeta.
- `AiQuotationWizardModal.tsx`: reutiliza `Modal`, `Button` y `TextField`; conserva radios/checkboxes y campos largos particulares del cuestionario.

**Referencia de marca:** `apps/web/src/styles/tokens.css`. Los componentes compartidos NO deben cambiarse globalmente para resolver el aspecto de un único módulo.

## 2. Política de implementación

1. **Priorizar importación:** usar controles bajo `shared/components/ui` si el comportamiento es equivalente.
2. **No clonar diseño genérico:** evitar nuevos fondos, sombras, tamaños de control y colores literales donde hay tokens `--kora-*`.
3. **Conservar dominios específicos:** editor EDT WBS×perfil, distribución HH, barra temporal, cálculo de fases y lógica de estimación siguen siendo específicos de la calculadora.
4. **Extender por prop opt-in cuando sea necesario:** no alterar otras pantallas que usan los componentes compartidos.
5. **Accesibilidad y comportamiento:** conservar nombres accesibles, disabled, callbacks, teclado, carga, aprobación y confirmación.
6. **Sin cambios de datos:** no tocar esquemas, migraciones, contratos, Gemini, Google Drive ni algoritmos de cotización por razones exclusivamente visuales.
7. **No cambiar `master`:** trabajar sólo en esta rama, con un commit por iteración, typecheck/tests/build antes de integrar a producción.

## 3. Roadmap en iteraciones

| Iteración | Área | Cambios previstos | Criterio de salida |
| --- | --- | --- | --- |
| **1** | Editor `QuotationPhaseWorkspace` | Sustituir acciones genéricas por `Button` compartido; tokens en fase, encabezado, aviso de mapeo; no tocar edición de HH | Pruebas de fase/tareas; acciones funcionan; presentación coherente |
| **2** | `QuotationTeamsWorkspace` | Normalizar inputs/selectores y tokens; conservar cálculos de colaboradores, semanas y HH | Los cambios producen iguales HH y mismas llamadas; no cambia selector entre vistas |
| **3** | `QuotationCommercialSections` | Estandarizar botones, campos y selects de costos/pagos; estudiar uso de DataTable sin perder edición | Pagos, IVA, costos y supuestos conservan datos y validaciones |
| **4** | Cabecera, versiones y mensajes IA | Revisar acciones de versión, estados, banner de revisión, toolbar/footer y tokens; evitar clases que sobrescriban `Button` | Conservar flujos «Ajustar», «Usar tal cual», guardar/descartar y estados |
| **5** | Validación transversal | Auditoría residual de hexadecimales, CSS duplicado, focus/hover, responsive y regresiones end-to-end | Typecheck, tests orientados a cambios, build y revisión visual en Kora |

## 4. Validación por iteración

- Probar estados editable/solo lectura y permisos de proyecto.
- Comparar estructura del sistema Kora en tarjetas, chips y espaciados; la maqueta HTML es referencia funcional/visual, no una segunda librería de componentes.
- En cotizaciones IA verificar que **no** se alteren propuestas, WBS, HH, fases, versiones ni estados.
- No modificar tests para ocultar fallos del comportamiento. Acompañar cada sustitución con un test de regresión donde corresponda.
- Validar en navegador la apariencia final: el conector GitHub permite editar, pero no ejecutar el frontend local ni comprobar el píxel a píxel.

## 5. Bitácora

- **2026-11-06 — Auditoría:** identificadas reutilizaciones y duplicaciones. Se prioriza fase/tareas para iniciar con cambios pequeños y reversibles.
- **Iteración 1 — commit `148da8b`:** se integró el `Button` compartido en cinco acciones del editor: asociar equipos, eliminar fase, agregar tarea, ver plantilla y agregar fase/módulo. Se homologaron superficie/identificador de fase, textos estructurales y aviso de mapeo a tokens `--kora-*`. La carga de Excel conserva su etiqueta con input de archivo (patrón nativo) y el ícono × de eliminación de tarea se evaluará en una iteración posterior por su ancho de columna.
- **Regresión añadida:** `QuotationPhaseWorkspace.test.tsx` verifica las variantes de `Button` compartido y la acción de asociación. Se conservan pruebas de edición de HH, tareas, equipos y operaciones sobre fases.
- **Validación iteración 1:** el equipo confirmó que los comandos de integración pasaron tras corregir la prueba CSS Module en commit `f2d522d`.
- **Iteración 2 — commit `d15819c`:** `QuotationTeamsWorkspace.tsx` ahora usa 5 instancias de `TextField` y un `Select` compartidos en vez de campos `<input type="number">` y `<select>` estilizados manualmente. Los números de colaboradores, duración, horas semanales, dedicación y perfiles IA mantienen sus callbacks, límites y validaciones. El selector «Por equipo / Por fases y módulos» sigue usando el `SegmentedControl` ya existente, pero se eliminaron las reglas `:global([role="radio"])` que anulaban su apariencia nativa.
- **Estilos iteración 2:** tokens Kora para encabezados, tabla, estados deshabilitados y perfiles sin asignación. El espacio compacto de la grilla solo ajusta alto/alineación de los wrappers nativos; sus focos, bordes y estados permanecen en sus CSS Modules. No se toca el motor `quotationEdtAssignments` ni `QuotationGroupHoursInput`.
- **Pruebas iteración 2:** `QuotationTeamsWorkspace.test.tsx` verifica estilos reales de `TextField`, `Select` y `SegmentedControl`; 160 HH del modo manual, callbacks de duración, dedicación y HH; estados disabled, modo EDT y perfiles pendientes.
- **Pendiente:** ejecutar el typecheck, Vitest y build local de iteración 2; revisión visual en desktop y responsive antes de continuar con costos/pagos.

- **Iteración 3 — commit `2c3749e`:** `QuotationCommercialSections.tsx` reutiliza `TextField` en descripciones, montos, tramos, porcentajes y fechas; `Select` para periodicidad, hitos y fases; `Button` para crear/eliminar costos y pagos. Se mantienen las tablas editables actuales: el `DataTable` genérico no ofrece la misma interacción de celdas controladas sin adaptación riesgosa.
- **Estilos iteración 3:** `QuotationCommercialSections.module.css` elimina bordes, focus y disabled personalizados de inputs/selects, adopta tokens `--kora-*` y ajusta solo densidad/alineación dentro de tablas. Se preservan `textarea` nativos, pues no existe un `Textarea` compartido.
- **Sin cambios funcionales:** `commercialNet` sigue incorporando únicamente costos `once` y excluyendo mensual/anual; el importe de tramos conserva sus porcentajes y 4 decimales; validación del 100%, supuestos, exclusiones ocultas y solo lectura permanecen idénticos. Sin modificaciones a backend, contratos o BD.
- **Regresiones añadidas:** `QuotationCommercialSections.test.tsx` cubre estilos de componentes compartidos, edición de descripciones y montos, triggers de fase/fecha, alta y baja de registros, supuestos, cálculo y controles deshabilitados.
- **Pendiente:** ejecutar typecheck + Vitest + build en la máquina local y validar los selectores/fechas en navegador, incluido el scroll horizontal con seis columnas.

- **Validación iteración 3:** el equipo confirmó las pruebas e integración antes de dar continuidad a la iteración 4.
- **Iteración 4 — commit `6dc5814`:** el selector de versiones y las acciones crear/copia/nueva IA/en blanco usan `Button` del design system. La versión seleccionada utiliza `variant="secondary"` y las demás `outline`, preservando `aria-pressed`, `title` y la confirmación destructiva cuando hay cambios sin guardar. No se usa `Tabs`: la selección de una versión no es una pestaña de sección y puede pedir confirmación.
- **Revisión IA:** `QuotationAiReviewBanner` mantiene Ajustar / Usar tal cual / Guardar / Descartar y la aceptación transaccional existente, pero deja de pintar los botones con overrides violetas. El aviso emplea `--kora-*` y la propuesta aceptada usa `Badge tone="success"` compartido. `QuotationDraftSaveBar` conserva posición y comportamiento; sus colores usan tokens Kora directos.
- **Limpieza:** eliminado CSS local de versiones activas, vínculos de IA, botones de mapeo, avisos viejos sin uso y estilos de hover/disabled que entraban en conflicto con los componentes nativos. El mapeo de equipos mantiene su guardado previo y bloqueo mientras hay cambios pendientes.
- **Pruebas iteración 4:** `QuotationAiReviewBanner.test.tsx` verifica variante de Button y Badge; `QuotationWorkspacePage.design-system.test.ts` comprueba selección, accesibilidad, callbacks, confirmación al salir y footer. Se mantienen los tests existentes de aceptación, guardado y layout.
- **Sin cambios funcionales:** no cambian API, contratos, Gemini, Drive, EDT, costos, reglas de cotización, migraciones ni `master`.
- **Pendiente:** ejecutar validaciones locales y revisar encabezado de versiones, aceptación IA, modo ajuste, responsive y footer en navegador.

### Comandos de validación — iteración 4 (PowerShell)
```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Error typecheck Web" }

pnpm --filter @kora/web exec vitest run `
  src/modules/estimation/pages/QuotationWorkspacePage.design-system.test.ts `
  src/modules/estimation/components/QuotationAiReviewBanner.test.tsx `
  src/modules/estimation/components/QuotationDraftSaveBar.test.tsx `
  src/modules/estimation/pages/QuotationWorkspacePage.ai-review.test.ts `
  src/modules/estimation/pages/QuotationWorkspacePage.save-bar.test.ts `
  src/modules/estimation/pages/QuotationWorkspacePage.layout.test.ts
if ($LASTEXITCODE -ne 0) { throw "Error pruebas de cotización" }

pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw "Error build Web" }
```

**Verificación visual:** navegar entre versiones con/sin cambios pendientes y confirmar cancelación; iniciar cotización manual, copiar y generar IA; comparar los estados de Badge y Button con el resto de Kora; probar «Ajustar antes de aceptar», «Usar tal cual», guardar y descartar; comprobar snackbar y footer sin tapar los controles.

### Comandos de validación — iteración 3 (PowerShell)
```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Error typecheck Web" }

pnpm --filter @kora/web exec vitest run `
  src/modules/estimation/components/QuotationCommercialSections.test.tsx `
  src/modules/estimation/components/QuotationTeamsWorkspace.test.tsx `
  src/modules/estimation/components/QuotationPhaseWorkspace.test.tsx `
  src/modules/estimation/pages/QuotationWorkspacePage.save-bar.test.ts

if ($LASTEXITCODE -ne 0) { throw "Error tests Web" }

pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw "Error build Web" }
```

**Pruebas manuales:** abrir cotización con tarifa definida; editar costo único y recurrente, cambiar periodicidad; variar % de pago y verificar el aviso del 100%, alternar hito de aprobación/fase/fecha; agregar/eliminar filas; verificar fechas con el calendario nativo de Kora. Comprobar que los costos recurrentes no aumenten el neto y que la vista aprobada sea de solo lectura.

### Comandos de validación — iteración 1 (PowerShell)
```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Error typecheck Web" }

pnpm --filter @kora/web exec vitest run `
  src/modules/estimation/components/QuotationPhaseWorkspace.test.tsx `
  src/modules/estimation/pages/QuotationWorkspacePage.ai-review.test.ts `
  src/modules/estimation/pages/QuotationWorkspacePage.save-bar.test.ts
if ($LASTEXITCODE -ne 0) { throw "Error tests Web" }

pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw "Error build Web" }
```

### Comandos de validación — iteración 2 (PowerShell)
```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Error typecheck Web" }

pnpm --filter @kora/web exec vitest run `
  src/modules/estimation/components/QuotationTeamsWorkspace.test.tsx `
  src/modules/estimation/components/QuotationPhaseWorkspace.test.tsx `
  src/modules/estimation/pages/QuotationWorkspacePage.ai-review.test.ts `
  src/modules/estimation/pages/QuotationWorkspacePage.save-bar.test.ts

if ($LASTEXITCODE -ne 0) { throw "Error tests Web" }

pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw "Error build Web" }
```

**Prueba manual:** cambiar entre «Por equipo» y «Por fases y módulos», editar colaboradores, unidad, duración, HH/semana y dedicación; comprobar que en EDT estas variables siguen siendo referenciales, no alteran las HH de tareas. Verificar disabled de QA, perfiles IA sin equipo y el scroll horizontal en ventanas angostas.
