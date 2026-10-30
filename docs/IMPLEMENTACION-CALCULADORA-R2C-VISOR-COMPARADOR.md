# Corte R2-c · Visor de evidencia y comparación de cotizaciones
**Fecha:** 30-oct-2026 · **Rama:** feature/calculadora/carlo

## Alcance implementado

Se añade un visor **de consulta** directamente en la versión de cotización que incluye \`draft.analysis\`. El visor no depende de nuevas rutas HTTP, no interpreta archivos en vivo y no genera ERS/EDT. Consume el artefacto fuente que el backend ya persistió en JSONB.

### Visor EDT
- Resumen: actividades WBS, HH base, reserva técnica independiente y duración hábil.
- Tabla paginada de actividades WBS con búsqueda y filtro por módulo: tramo, actividad, perfil responsable, requisitos, HH y referencia precisa a fuente/hoja/fila cuando exista.
- Totales del filtro calculados solo para orientar la navegación; HH comerciales y monetarias permanecen calculadas en backend.
- Indicador visible \`simulated_fixture\` para no presentar la demo Zurich como un análisis Gemini.

### Visor ERS
- Requisitos funcionales, IDs, criterios de aceptación y origen.
- Historias de usuario con relación a IDs de requisitos.
- Definiciones pendientes, impacto y responsable.
- Archivos fuente registrados con nombre, tipo y SHA-256. El hash no implica que el servidor haya almacenado los DOCX/XLSX originales.

### Cronograma
- Tramos: inicio y duración en semanas, HH.
- Resumen de horas y dotación por perfil.
- Horas semanales por perfil y plan diario; la tabla diaria limita el render inicial a 250 registros y ofrece descarga del JSON íntegro para el resto.
- Sección \`Descargar JSON fuente\`: entrega el \`analysis\` almacenado, no una exportación del presupuesto local ni un documento ERS/EDT.

### Comparador de versiones
- Disponible con dos o más versiones, de solo lectura, sin endpoints ni migraciones.
- Comparación de HH totales y por equipo. Respeta la modalidad: \`team\` usa dedicación × semanas; \`phases\` suma las HH de sus fases, sin duplicar.
- Comparación de neto/total **solo** si ambas versiones tienen importes definidos y la misma moneda. Prohíbe diferencias monetarias entre UF, USD y CLP como si fuesen comparables.
- Los nombres de equipos inactivos/no disponibles no se inventan: se muestra su ID histórico abreviado.
- El comparador usa snapshots ya guardados, no cambios sin guardar.

### Protección de evidencia desde el backend
\`reconcileQuotationAnalysis(saved, incoming)\` ejecuta en la transacción de \`updateDraft\`:
- Si no había análisis en la versión, rechaza incorporarlo mediante PATCH. Solo creación de versión con validación de simulación puede añadirlo.
- Si existe evidencia \`analysis\`, **no permite reemplazarla ni eliminarla**, ni alterar \`sourceRefs\` o \`answers\` originales con PATCH.
- Si se modifica cualquier campo comercial derivado (\`teams\`, \`phases\`, \`costs\`, \`paymentPlan\`, \`assumptions\`, \`exclusions\`), asigna \`analysisProjectionStatus=modified\`, ignorando un valor \`synced\` falsificado por el navegador.
- Una marca \`modified\` permanece hasta implementar un flujo explícito de conciliación. Cambiar tarifa/moneda no altera las HH EDT y por eso no afecta la marca.
- Concurrencia: sigue vigente la revisión optimista \`revision\` y el UPDATE condicionado al estado \`draft\`.
- Sin migración nueva: la evidencia permanece en el JSONB de \`quotation_versions.draft\` definido en 0048.

## Archivos nuevos

- \`apps/web/src/modules/estimation/components/AnalysisEvidenceCard.tsx\`
- \`apps/web/src/modules/estimation/components/AnalysisEvidenceCard.module.css\`
- \`apps/web/src/modules/estimation/components/AnalysisEvidenceCard.test.tsx\`
- \`apps/web/src/modules/estimation/components/QuotationVersionComparison.tsx\`
- \`apps/web/src/modules/estimation/components/QuotationVersionComparison.module.css\`
- \`apps/web/src/modules/estimation/components/QuotationVersionComparison.test.tsx\`
- \`apps/api/src/modules/estimation/domain/quotation-analysis-integrity.ts\`
- \`apps/api/src/modules/estimation/domain/quotation-analysis-integrity.spec.ts\`

Modificados: \`QuotationWorkspacePage.tsx\` y \`drizzle-quotation.repository.ts\`.

## Validación de aceptación

1. Abrir versión de simulación Zurich creada anteriormente. Ver 45 actividades, 257 HH base, 25,7 de reserva y 21 días hábiles (datos del ejemplo suministrado).
2. Filtrar EDT por módulo y texto WBS, navegar páginas y abrir referencia de hoja/fila.
3. Abrir ERS: comprobar 15 requisitos, 10 historias y 7 decisiones; recorrer cronograma y plan diario.
4. Descargar JSON y comprobar que \`schemaVersion\` y \`provenance.mode=simulated_fixture\` se mantienen.
5. Crear una segunda versión, editar HH y comparar por equipo. Si ambas versiones tienen monedas distintas, mostrar que el importe no es comparable.
6. Modificar fases de versión simulada, guardar y recargar. La API debe devolver \`analysisProjectionStatus=modified\`, manteniendo las mismas actividades WBS originales.
7. Intentar enviar por PATCH \`draft.analysis=null\` o reemplazar el \`analysis\` por otro: debe devolver 400 y mantener la versión.
8. Confirmar que no hay endpoint de enviar, aprobar o traspasar; no se modifica \`projects\`, \`forecast\` ni hitos reales.

## Comandos PowerShell — remoto kora

~~~powershell
git switch feature/calculadora/carlo
git status --short
git fetch kora
git pull --ff-only kora feature/calculadora/carlo
git rev-parse --short HEAD

pnpm install --frozen-lockfile
pnpm --filter @kora/contracts build
pnpm --filter @kora/db build
pnpm --filter @kora/api typecheck
pnpm --filter @kora/web typecheck

pnpm --filter @kora/api exec vitest run src/modules/estimation/domain/quotation-analysis-integrity.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/estimation/components/AnalysisEvidenceCard.test.tsx src/modules/estimation/components/QuotationVersionComparison.test.tsx

pnpm --filter @kora/contracts test
pnpm --filter @kora/api test
pnpm --filter @kora/web test

pnpm --filter @kora/api build
pnpm --filter @kora/web build
git status --short
~~~

**Estado de verificación:** pruebas añadidas al repositorio; aún no ejecutadas por este agente. No afirmar resultados sin salida real. Sin modificación a master, migración o despliegue.

## Próxima etapa sugerida
R2 siguiente: filtros de listado y una vista de observaciones de análisis por cambios editados, antes del R3 de aprobación/traspaso. R3 depende de las decisiones D04–D06 y de validar proyectos activos con HH históricas en QA.
