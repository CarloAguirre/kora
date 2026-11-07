# Kora — Auditoría de reutilización UI y plan de homologación incremental

**Fecha:** 2026-11-06  
**Rama de trabajo:** `feature/calculadora-roadmap-diseno-v5-02`  
**Estado:** Auditoría completada; iteración 1 implementada en la rama, pendiente de validación local.  
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
- **Validación:** revisión estática de los tres archivos publicados; faltan ejecutar las pruebas de Vitest, typecheck y build en el entorno local del proyecto y confirmar la apariencia visual en navegador.

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
