# Exportación de cotizaciones Kora — PPTX y XLSX

**Implementación inicial:** 09-11-2026. **Rama:** `feature/calculadora-roadmap-diseno-v5-02`. **No contiene migraciones ni cambios en BD, Drive o Gemini.**

## Alcance de esta integración

Se añadió `Exportar` a la cabecera de `QuotationWorkspacePage`, con `DropdownMenu` y `Button` del UI kit original. El menú exporta exactamente la versión guardada seleccionada; si hay modificaciones locales pendientes exige guardarlas o descartarlas antes de exportar. No cambia el estado comercial de la versión ni traspasa su planificación.

La implementación está en:

- `apps/web/src/modules/estimation/lib/quotation-export.ts`
- `apps/web/src/modules/estimation/lib/quotation-export.test.ts`
- `apps/web/src/modules/estimation/pages/QuotationWorkspacePage.tsx`
- `apps/web/src/modules/estimation/pages/QuotationWorkspacePage.module.css`

## Requisito binario: plantilla PPTX ORIGINAL

**Para máxima fidelidad se usa el archivo PowerPoint original de Kabeli, NO una reproducción.** La herramienta de edición GitHub empleada para publicar los archivos fuente no acepta adjuntos binarios locales del chat. Por eso el PPTX de **43 MB debe colocarse en el checkout por separado**, en:

```
apps/web/public/quotation-templates/Kabeli_Cotizaciones_DS.pptx
```

Se entrega `kora-exportacion-plantilla-pptx.zip`, con esa ruta relativa ya preparada. Descomprimirlo en la raíz del repositorio (la carpeta que contiene `apps/`). Añadir el PPTX a Git y desplegarlo junto con el frontend; de lo contrario la opción PowerPoint informa explícitamente que falta la plantilla. No subir el ZIP completo al repositorio; solo el PPTX contenido.

**PowerPoint:** se lee el paquete OOXML original, se cambia el texto en los párrafos editables identificados y se reposicionan las barras editables originales de los Gantt de las diapositivas 14 y 15. Preserva las 19 diapositivas, imágenes, maestros, estilos, formatos, formas, posiciones y textos corporativos fijos. Las cifras corporativas de la diapositiva 5 se mantienen ocultas hasta validación. En proyectos sin RPA, el contenido RPA de las diapositivas 4, 6 y 7 se reemplaza por contenidos pertinentes al software sin modificar su diseño. No inventa arquitectura aprobada, integrantes nominales, fecha de inicio ni condiciones de pago o garantía.

**Limitación gráfica explícita:** el resumen PPTX dispone de espacios finitos: muestra las primeras seis actividades/fases y remite al Excel para el detalle completo. Los gráficos Gantt usan semanas relativas, no fechas de calendario contractuales. La dimensión de cada barra se calcula desde `startWeek`/`durationWeeks` de la versión, sin alterar colores, formas o escalas geométricas fuera de esas barras.

**Excel:** se genera un archivo nuevo para evitar copiar los valores y rangos fijos de Zurich. Hojas: `Resumen`, `Carga_Equipo`, `Comercial`, y condicionalmente `EDT_Detalle`, `Resumen_Modulos`, `Tramos`, `Roadmap_Semanal`, `Supuestos`, `Fuentes`. Nunca incluye `Auditoria` histórica, `Pendientes` inventados ni `Plan_Diario` sin base ejecutable. Las HH de tareas salen de asignaciones canónicas WBS×perfil vigentes, incluyendo ediciones aprobadas en el borrador; no se recalculan desde la dotación. Compara su suma con `version.totalHours` y bloquea exportaciones incoherentes. La carga semanal se deriva del plan orientativo ya implementado por Kora.

## Validaciones locales pendientes

El conector GitHub **no ejecuta `pnpm`, Vitest ni Vite** en el equipo del usuario. Se requiere la validación de la integración local, además de abrir visualmente ambos documentos en Excel y PowerPoint. Estos son los comandos de Windows PowerShell:

```powershell
cd C:\Users\carlo\Desktop\a\kora2.0
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

# Rebuild obligatorio: la API importa los contratos desde dist.
pnpm --filter @kora/contracts build
if ($LASTEXITCODE -ne 0) { throw "Error build Contracts" }

pnpm --filter @kora/api exec vitest run `
  src/modules/estimation/application/use-cases/generate-estimation-poc-proposal.use-case.spec.ts `
  src/modules/estimation/domain/quotation-transfer-references.spec.ts
if ($LASTEXITCODE -ne 0) { throw "Error regresión EDT por perfil" }

pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Error typecheck Web" }

pnpm --filter @kora/web exec vitest run `
  src/modules/estimation/lib/quotation-export.test.ts `
  src/modules/estimation/pages/QuotationWorkspacePage.layout.test.ts `
  src/modules/estimation/pages/QuotationWorkspacePage.design-system.test.ts
if ($LASTEXITCODE -ne 0) { throw "Error pruebas exportación" }

pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw "Error build Web" }

git status --short
```

Si los dos tests EDT continúan fallando *después* de compilar `@kora/contracts`, revisar el import en runtime y el `dist` (actualmente la salida de estos tests parece consistente con un contrato compilado anterior, ya que se pierden **ambos** campos opcionales `taskName` y `taskDescription` durante la validación Zod). No modificar resultados esperados para hacer pasar tests.

## Pruebas manuales recomendadas

1. En una cotización de Gemini con EDT multiperfil, abrir la versión guardada, elegir Exportar → Excel; comprobar WBS, nombre/entregable **por perfil**, HH, sumas, equipos y fuentes.
2. Descargar PPTX y abrirlo en PowerPoint: verificar la portada, las 19 diapositivas, barras del Gantt, tablas, imágenes, tipografías y ausencia de datos CheckApp/Sinco/Zurich. También revisar el resultado en un proyecto no-RPA.
3. Cotización manual sin EDT: comprobar que Excel omite las hojas que requieren detalle inexistente.
4. Editar una HH sin guardar e intentar exportar: debe advertir y no descargar.
5. Validar otra versión distinta de la última: el nombre del archivo, HH, moneda y condiciones deben corresponder a esa versión.
6. Comprobar visualmente con el PPTX original, ya que el script no garantiza que contenidos excesivamente extensos quepan sin ajustes editoriales de la plantilla.

**Estado de verificabilidad:** código publicado y plantilla original empaquetada para instalación manual. Las pruebas TypeScript/Vitest, la apertura en PowerPoint de un archivo generado por navegador y el despliegue siguen pendientes de ejecución local. **No afirmar que la exportación está validada en producción hasta completar estos pasos.**
