# Decisión — Estimación inteligente de proyectos con IA

**Estado:** diseño funcional/técnico en curso  
**Fecha:** 2026-10-21  
**Rama de trabajo:** `feature/calculadora/carlo`

## Objetivo

Incorporar a Kora un módulo de **estimación inteligente de proyectos** que use los
antecedentes ya asociados a un proyecto, los datos existentes de Kora y un agente
de IA para producir una estimación estructurada y explicable.

La salida objetivo no es solamente un total de HH. Debe generar una **EDT
(Estructura de Desglose del Trabajo)** comparable a las planillas de estimación
que hoy se elaboran manualmente, incluyendo al menos:

- detalle de actividades;
- módulos y submódulos;
- referencias a requisitos / historias / reglas;
- complejidad y dependencias;
- esfuerzo por rol;
- HH totales;
- resumen por módulo;
- carga por equipo;
- escenarios de cantidad de desarrolladores;
- duración estimada;
- supuestos, riesgos y exclusiones;
- costos/licencias cuando corresponda;
- trazabilidad hacia la documentación fuente.

El principio central es:

> La IA interpreta, estructura y propone. Los cálculos de HH, costos, escenarios
> y reglas cuantitativas deben ejecutarse de forma determinística y auditable.

## Contexto dentro de Kora

El módulo no debe crear un universo paralelo de proyectos, personas o equipos.
Debe consumir las fuentes de verdad existentes de Kora.

Como mínimo podrá reutilizar:

- proyectos, clientes y estados;
- equipos y miembros;
- asignaciones/forecast;
- registro real de horas;
- roles y permisos;
- datos históricos de proyectos ejecutados.

Esto habilita una evolución posterior especialmente valiosa: comparar
**estimado vs. real** y usar el histórico de Kora para calibrar estimaciones
futuras.

## Flujo funcional acordado

No se debe pasar directamente de "archivos en Drive" a "EDT final". Entre ambos
extremos debe existir una capa intermedia de conocimiento normalizado.

```text
Proyecto Kora
    │
    ├── datos del proyecto / cliente / equipo
    └── carpeta de antecedentes en Drive
                │
                ▼
       Ingesta y análisis IA
                │
                ▼
      Contexto normalizado
                │
      ┌─────────┼───────────┬──────────────┐
      ▼         ▼           ▼              ▼
 Requisitos   Historias   Contexto      Vacíos /
 RF/RNF/RN    de usuario   técnico       contradicciones
      └─────────┼───────────┴──────────────┘
                ▼
        Preguntas mínimas
       fijas + dinámicas
                │
                ▼
       Contexto validado
                │
                ▼
         Generador EDT
                │
      ┌─────────┼──────────┬──────────────┐
      ▼         ▼          ▼              ▼
 EDT detalle  Resumen   Carga equipo   Escenarios
              módulos                  / duración
```

## Capa de contexto normalizado

La fuente real del sistema no deben ser documentos Word/Excel generados y
releídos por otros prompts. Los "predocumentos" son representaciones humanas de
un **modelo canónico persistido en Kora**.

Ejemplo conceptual:

```json
{
  "requirements": [],
  "businessRules": [],
  "nonFunctionalRequirements": [],
  "userStories": [],
  "useCases": [],
  "modules": [],
  "integrations": [],
  "actors": [],
  "dataEntities": [],
  "technicalConstraints": [],
  "openQuestions": [],
  "assumptions": [],
  "sourceReferences": []
}
```

La aplicación puede exportar o visualizar este contexto como tablas/documentos,
pero la IA de estimación debe trabajar sobre la estructura canónica.

### Ventaja

Si el usuario responde, por ejemplo, que "SAP dispone de API REST", Kora no
necesita regenerar tres documentos para continuar. Solo cambia el contexto:

```text
GAP-01 -> RESOLVED
integration.sap.apiAvailable = true
integration.sap.protocol = REST
```

y las etapas posteriores consumen esa versión validada.

## Predocumentos derivados de Drive

Se definen cuatro artefactos principales.

### 1. Matriz de requerimientos

Es la base objetiva del alcance.

Debe contener al menos:

| Campo | Descripción |
|---|---|
| ID | RF-001, RNF-001, RN-001, etc. |
| Tipo | Funcional, no funcional, regla de negocio |
| Módulo | Agrupación funcional |
| Requerimiento | Descripción normalizada |
| Prioridad | Cuando pueda inferirse o esté declarada |
| Alcance | Incluido, opcional, fuera, pendiente |
| Fuente | Archivo/sección/página/origen |
| Confianza | Alta, media o baja |
| Estado | Detectado, validado, descartado, pendiente |

La trazabilidad hacia la fuente original debe conservarse siempre.

### 2. Historias de usuario

La IA transforma los requisitos funcionales en unidades de comportamiento que
posteriormente pueden referenciar actividades de la EDT.

Estructura mínima:

- ID;
- actor;
- necesidad;
- objetivo;
- criterios de aceptación;
- requisitos/reglas relacionados;
- fuente;
- módulo.

Ejemplo:

```text
HU-KDM-09 · Matching automático Factura–OC

Como analista de recepción
quiero que las facturas pendientes sean asociadas automáticamente
a las órdenes de compra correspondientes
para reducir la revisión manual.

Criterios
- Coincidencia por proveedor.
- Coincidencia por CECO.
- Considerar múltiples OC.
- Registrar resultado.
- Permitir reproceso seguro.

Referencias: RF-014, RF-015, RN-01, RN-02.
```

### 3. Contexto técnico e integraciones

Los RF y las HU por sí solos no son suficientes para producir una EDT técnica.

Este artefacto concentra, cuando exista evidencia:

- si es greenfield o evolución;
- plataforma/repo existente;
- frontend/backend;
- integraciones y protocolos;
- APIs disponibles o pendientes;
- autenticación/SSO;
- modelo y fuentes de datos;
- migraciones;
- infraestructura/cloud;
- ambientes;
- CI/CD;
- restricciones técnicas;
- auditoría;
- observabilidad;
- operación offline;
- licencias y servicios de terceros;
- restricciones de seguridad/compliance.

Esto permite incluir tareas técnicas necesarias aunque el cliente no las haya
redactado como historia de usuario.

### 4. Vacíos, contradicciones y supuestos

Es la entrada principal al motor de preguntas.

Ejemplo:

| ID | Tema | Hallazgo | Impacto | Acción |
|---|---|---|---|---|
| GAP-01 | SAP | No se especifica si la API está disponible | Alto | Preguntar |
| GAP-02 | UAT | No se indican ciclos | Medio | Preguntar |
| GAP-03 | Reportes | Formato exacto no definido | Bajo | Asumir |
| GAP-04 | SSO | Dos fuentes describen mecanismos distintos | Alto | Preguntar |

El agente no debe volver a leer todo el corpus arbitrariamente para decidir qué
preguntar; debe trabajar principalmente sobre estos hallazgos estructurados.

## Casos de uso: generación selectiva

No se generarán casos de uso formales para cada historia porque duplicaría
información y haría más costoso el flujo sin mejorar necesariamente la
estimación.

Regla:

```text
Historia sencilla
    -> HU + criterios de aceptación

Workflow complejo
    -> HU + caso de uso / flujo

Integración crítica
    -> HU + flujo de integración + excepciones
```

La IA decide qué historias requieren este nivel adicional y debe justificarlo.

## Cuestionario inteligente

El objetivo UX es que responder el cuestionario sea **mucho más rápido que
estimar manualmente el proyecto**.

Metas iniciales:

- 4–5 preguntas fijas como máximo;
- 0–5 preguntas dinámicas en la primera ronda;
- 0–2 preguntas adicionales únicamente si una respuesta abre un bloqueo;
- duración objetivo para el usuario: aproximadamente 3–5 minutos;
- si la documentación ya responde una pregunta, no volver a preguntarla;
- si existe una respuesta inferida con alta confianza, prellenarla;
- dudas de bajo impacto deben transformarse preferentemente en supuestos.

### Preguntas fijas mínimas

Las preguntas base propuestas son:

1. **Nivel de entrega:** PoC, MVP, fase específica, solución completa o
   evolutivo.
2. **Plazo:** fecha/duración objetivo o sin restricción.
3. **Equipo:** equipo ideal, disponibilidad real de Kora, perfiles específicos
   o comparación de escenarios.
4. **Postproducción:** si deben incluirse UAT, estabilización, marcha blanca y/o
   soporte inicial.
5. **Contexto adicional opcional:** condición, exclusión o decisión importante
   que no esté en la documentación.

Aunque se denominan "fijas", F01–F04 pueden omitirse o aparecer prellenadas si el
contexto validado ya contiene una respuesta inequívoca.

### Preguntas dinámicas

Se generan solo si existe:

```text
ambigüedad o vacío
+
impacto material sobre HH / plazo / arquitectura / equipo / riesgo
+
respuesta no disponible con suficiente confianza
```

Ejemplos:

- "Los antecedentes indican integración con SAP. ¿La API ya existe y está
  documentada?"
- "Se requiere migrar información histórica. ¿Qué volumen aproximado debemos
  considerar?"
- "El proyecto requiere operación offline. ¿Qué procesos deben funcionar sin
  conexión?"
- "Se solicita IA para clasificación documental. ¿La salida debe ser validada
  por una persona antes de quedar definitiva?"
- "No encontramos diseños aprobados. ¿Debemos considerar diseño UX/UI completo?"
- "Una fuente incluye carga masiva y otra la excluye del MVP. ¿Debe incluirse
  en esta estimación?"

Cada pregunta dinámica debe tener al menos:

- categoría;
- pregunta;
- motivo;
- impacto: HIGH / MEDIUM / LOW;
- tipo de respuesta;
- opciones cuando corresponda;
- referencias a fuente;
- respuesta detectada, si existe;
- confianza;
- supuesto adoptable si el usuario no sabe;
- prioridad;
- dependencias con otras preguntas.

Las preguntas LOW normalmente no se muestran.

## Regla de selección de preguntas

Orden de decisión:

1. Si la respuesta está explícita y consistente -> **no preguntar**.
2. Si puede inferirse con alta confianza y su impacto es relevante ->
   **prellenar y permitir corregir**.
3. Si hay contradicción entre fuentes -> **preguntar**.
4. Si falta información que puede cambiar materialmente la estimación ->
   **preguntar**.
5. Si falta información de impacto bajo -> **registrar supuesto**.
6. Si existen varias preguntas sobre el mismo tema -> **agrupar**.
7. Ordenar candidatas por impacto y mostrar máximo 5 en la primera ronda.
8. Permitir máximo 2 nuevas preguntas cuando una respuesta revele una
   dependencia realmente bloqueante.

## Stepper propuesto

### Paso 0 · Análisis

Sin interacción.

Kora/IA:

- consulta antecedentes;
- analiza Drive;
- recupera contexto existente del proyecto;
- construye los predocumentos;
- identifica vacíos.

### Paso 1 · Entendimiento

La IA presenta un resumen corto:

- objetivo;
- alcance;
- módulos;
- integraciones;
- restricciones principales.

El usuario elige "Está correcto" o corrige el resumen.

No se debe pedir que confirme individualmente cada requisito.

### Paso 2 · Condiciones de estimación

Se muestran solo las preguntas fijas que aún sean necesarias.

### Paso 3 · Aclaraciones

Se muestran las preguntas dinámicas priorizadas.

Cada pregunta debe poder explicar:

- por qué se hace;
- qué impacto tiene;
- qué documento originó la duda.

Debe existir opción "No lo sé / usar supuesto" cuando sea razonable.

### Paso 4 · Confirmación

Una sola pantalla resume:

- alcance;
- plazo;
- equipo;
- integraciones;
- migraciones;
- SSO;
- offline;
- UAT;
- soporte;
- respuestas;
- supuestos;
- bloqueos pendientes.

Solo después se habilita "Generar estimación".

### Paso 5 · Resultado

La salida debe poder revisarse, aceptar, ajustar y versionar.

## Generación de la EDT

El agente recibe:

```text
requisitos validados
+
historias
+
casos/flujos complejos
+
contexto técnico
+
respuestas del usuario
+
supuestos
+
datos relevantes de Kora
```

Reglas principales:

- no inventar funcionalidades sin respaldo;
- una actividad funcional debe poder referenciar una HU/RF/RN;
- una actividad técnica derivada debe indicar qué requisito o necesidad
  operacional la justifica;
- diferenciar requisito explícito, derivación técnica y supuesto;
- evitar duplicar esfuerzo entre actividades;
- separar esfuerzo (HH) de calendario;
- mantener trazabilidad hasta las fuentes originales.

Campos esperados por actividad:

- WBS;
- macro/fase;
- módulo;
- submódulo;
- actividad/entregable;
- tipo de trabajo;
- complejidad;
- alcance;
- referencia HU/RF/RN/RNF;
- fuente;
- dependencias;
- responsable;
- notas/criterio;
- HH por rol;
- HH total.

## Vistas derivadas de la EDT

La lista granular de actividades no es la única representación del resultado.

Kora debe derivar al menos:

### Resumen por módulo

- módulo;
- HH;
- porcentaje del total;
- cantidad de actividades;
- complejidad/riesgo;
- estado de alcance.

### Carga por equipo

- rol;
- cantidad de personas;
- HH;
- dedicación;
- carga equivalente;
- duración teórica.

### Escenarios

Permitir comparar, cuando aplique, distintas cantidades de desarrolladores.

Agregar desarrolladores **redistribuye el pool de desarrollo** y puede reducir
calendario, pero no hace desaparecer HH ni comprime necesariamente UAT,
estabilización, esperas del cliente o piloto.

### Resumen ejecutivo

- HH base;
- reserva;
- HH total;
- duración estimada;
- roles/equipo;
- módulos principales;
- riesgos;
- supuestos;
- exclusiones;
- dependencias críticas.

## IA vs. motor determinístico

Separación obligatoria:

### IA

Puede:

- leer y clasificar antecedentes;
- extraer requisitos;
- producir HU;
- detectar contradicciones;
- proponer preguntas;
- proponer EDT;
- clasificar complejidad;
- redactar supuestos;
- explicar una estimación.

### Motor determinístico

Debe calcular:

- sumatorias de HH;
- distribución por roles;
- costos a partir de tarifas;
- reservas;
- escenarios de dotación;
- porcentajes por módulo;
- conversiones de semanas/meses;
- validaciones aritméticas.

Una modificación manual de una HH no puede depender de volver a invocar un LLM
para recalcular los totales.

## Integración con datos de Kora

En una primera etapa la IA puede proponer un **equipo ideal**.

Posteriormente debe poder ofrecer también:

- equipo considerando disponibilidad real;
- carga actual/forecast por persona;
- perfiles que ya trabajaron con el cliente;
- comparación equipo ideal vs. equipo disponible.

Kora tiene además un activo relevante para etapas posteriores: las horas reales
registradas.

Evolución esperada:

```text
estimación aprobada
        │
        ▼
ejecución real
        │
        ▼
horas registradas por proyecto/persona
        │
        ▼
estimado vs. real
        │
        ▼
calibración de futuras estimaciones
```

Ejemplo futuro:

> Proyectos comparables tuvieron una desviación media de +9 %. La EDT actual
> suma 1.320 HH; se recomienda considerar 1.440 HH para la propuesta.

Esta calibración debe ser transparente y separarse del cálculo base.

## Trazabilidad

La cadena ideal es:

```text
Fuente original
    ↓
RF / RNF / RN
    ↓
HU / flujo
    ↓
Actividad EDT
    ↓
HH por rol
    ↓
Estimación total
```

El usuario debe poder navegar en ambos sentidos.

Una HH generada por IA debe poder explicar qué la originó.

## Versionamiento

Cada ejecución de estimación debe crear o actualizar una versión controlada.

Debe ser posible conservar:

- contexto utilizado;
- archivos/versions de fuente;
- preguntas;
- respuestas;
- supuestos;
- EDT generada;
- ajustes manuales;
- autor;
- fecha;
- modelo/agente utilizado;
- estimación resultante.

Una modificación posterior de los documentos de Drive no debe alterar
silenciosamente una estimación ya aprobada.

## Arquitectura dentro de Kora

La implementación debe respetar la Clean Architecture del repositorio.

Propuesta de ubicación conceptual:

```text
apps/api/src/modules/estimation/
  domain/
  application/
  infrastructure/
  presentation/

apps/web/src/modules/estimation/
  api/
  components/
  hooks/
  lib/
  pages/

packages/contracts/
  schemas y tipos de estimación

packages/db/
  tablas/migraciones necesarias
```

Puertos de aplicación previsibles:

- `ProjectContextRepository`;
- `EstimationRepository`;
- `DocumentSourceReader`;
- `AiProjectAnalyzer`;
- `AiQuestionGenerator`;
- `AiWbsGenerator`;
- `TeamAvailabilityReader`;
- `HistoricalEffortReader`.

Las implementaciones concretas de Drive y del proveedor LLM deben permanecer en
infraestructura.

## Qué NO debe hacer el MVP

Para evitar que el módulo se transforme en una iniciativa demasiado grande, el
MVP no necesita:

- aprender automáticamente un modelo de estimación con todo el histórico;
- generar decenas de preguntas por proyecto;
- casos de uso formales para cada HU;
- reemplazar la aprobación humana;
- modificar automáticamente equipos/forecast por aceptar una estimación;
- asumir que toda sugerencia de IA es un requisito del cliente.

## Principios de producto

1. **Preguntar menos es una característica.**
2. **La evidencia documental manda sobre la inferencia.**
3. **Toda inferencia relevante debe ser trazable.**
4. **IA para interpretación; código para aritmética.**
5. **Un supuesto explícito es mejor que una pregunta innecesaria.**
6. **No se duplica en Estimaciones lo que ya pertenece a Proyectos, Equipos,
   Forecast u Horas.**
7. **La EDT es el núcleo del resultado, no una tabla secundaria.**
8. **Las HH y el calendario son conceptos distintos.**
9. **El usuario conserva la decisión final.**
10. **El histórico de ejecución debe permitir mejorar el sistema con el tiempo.**

## Pendientes de definición

Antes de cerrar el diseño técnico se debe resolver:

- mecanismo de acceso de Kora a las carpetas de Drive;
- formatos soportados en la primera versión;
- proveedor/modelo LLM;
- persistencia del contexto canónico;
- política de refresco cuando cambian archivos fuente;
- permisos para crear/revisar/aprobar estimaciones;
- catálogo de roles/tarifas que usará el motor;
- fórmula inicial de reserva técnica;
- criterios de complejidad;
- qué datos históricos estarán disponibles para comparación;
- si el equipo real/forecast entra en MVP o en una etapa posterior.

---

Este documento debe mantenerse como fuente de las decisiones del módulo mientras
se completa el levantamiento. Los detalles que se acuerden en nuevas sesiones
de diseño deben incorporarse aquí o separarse en decisiones más específicas si
el documento crece demasiado.


## Estado de implementación · Iteración 1

Se creó el primer scaffold funcional en `feature/calculadora/carlo`.

### Contratos compartidos

Existe ahora:

```text
packages/contracts/src/estimation/
  estimation.contract.ts
```

El contrato ya modela:

- estados del flujo de estimación;
- requerimientos RF/RNF/RN;
- referencias a fuentes;
- historias de usuario;
- contexto técnico e integraciones;
- gaps/decisiones;
- preguntas fijas y dinámicas;
- respuestas;
- ítems EDT;
- esfuerzo por rol;
- resumen por módulo;
- escenarios;
- resultado de estimación.

Se exporta desde `@kora/contracts` y sigue el patrón Zod nativo del proyecto.

### API

Se creó:

```text
apps/api/src/modules/estimation/
  application/
    ports/
      ai-project-analyzer.port.ts
      document-source-reader.port.ts
    use-cases/
      get-estimation-questionnaire-definition.use-case.ts
  domain/
    repositories/
      estimation.repository.ts
  presentation/
    estimation.controller.ts
  estimation.module.ts
```

El módulo ya está registrado en `AppModule`.

El primer endpoint real es:

```http
GET /api/estimations/questionnaire-definition
```

Requiere `projects:manage` y devuelve la definición del cuestionario mínimo
(5 preguntas base, máximo 5 dinámicas iniciales, máximo 2 de seguimiento,
objetivo de 3–5 minutos).

Los puertos de Drive, IA y persistencia están definidos pero todavía no tienen
adaptadores concretos. Esto es deliberado: permite cerrar primero autenticación
Drive, modelo LLM y versionado sin acoplar la aplicación a proveedores.

### Frontend

Se creó:

```text
apps/web/src/modules/estimation/
  api/
  components/
  hooks/
  lib/
  pages/
```

Existe un workspace inicial accesible en:

```text
/proyectos/:projectId/estimacion
```

bajo el mismo permiso `projects:manage`.

La pantalla consume el contrato real de la API y visualiza:

- pipeline previsto;
- cuestionario mínimo;
- límites de preguntas dinámicas;
- siguiente vertical slice.

No se agregó aún al menú lateral ni se alteró el wizard `Nuevo proyecto`.
La integración al paso "Estimación" se hará cuando el flujo pueda continuar
realmente hacia Drive/análisis, evitando exponer un CTA que todavía no complete
la operación.

### Decisión de persistencia

No se agregaron tablas Drizzle ni migraciones en esta iteración.

Antes deben cerrarse:

- si una estimación se crea antes o después de persistir el proyecto;
- política de versionado;
- refresh cuando cambian fuentes Drive;
- snapshot exacto de documentos/contexto;
- qué parte del contexto canónico queda normalizada en columnas y qué parte en
  JSONB.

Esta decisión evita fijar un modelo físico prematuramente.

### Próximo vertical slice recomendado

1. Resolver acceso de Kora a la carpeta Drive del proyecto.
2. Implementar `DocumentSourceReader`.
3. Implementar un primer `AiProjectAnalyzer`.
4. Generar `ProjectEstimationContext` con requisitos, HU, contexto técnico y
   gaps.
5. Persistir un snapshot mínimo.
6. Renderizar resumen de entendimiento + preguntas dinámicas.
7. Recién entonces conectar el CTA "Estimar con IA" del paso Estimación de
   `NewProjectPage`.


## PoC de Calculadora · Separación Calculadora / IA

Se implementó una PoC navegable basada en el prototipo HTML de Calculadora.

### Boundary acordado

La Calculadora es un dominio de negocio y **no debe contener directamente el
SDK ni la implementación de un proveedor LLM**.

La composición actual queda:

```text
apps/web
  Calculadora / estimation
        │
        ▼
apps/api
  EstimationModule
        │
        ▼
      AiModule
        │
        ▼
    AI_PROVIDER
        │
        ├── PocAiProvider           (PoC actual)
        └── proveedor real futuro   (OpenAI/Azure OpenAI/etc.)
```

`AiModule` es una capacidad técnica reutilizable por otros dominios de Kora.
`EstimationModule` conserva la lógica propia de estimación: contratos,
preguntas, EDT y cálculos.

### Regla de cálculo

El proveedor IA propone una estructura de roles:

```text
rol
unidad
duración
HH por unidad
cantidad de personas
fuente / explicación
```

La IA **no entrega el total autoritativo**.

El caso de uso de Calculadora calcula:

```text
HH rol = duración × HH/unidad × personas
HH total = suma(HH rol)
```

Esto prueba desde la PoC la separación "IA propone / motor determinístico
calcula".

### Alcance funcional de la PoC

Ruta principal:

```text
/calculadora
```

La pantalla:

- reutiliza proyectos reales de Kora;
- muestra proyectos de desarrollo en Cotización/Aprobado;
- permite buscar por cliente/proyecto;
- navega al workspace de estimación de un proyecto.

Workspace:

```text
/proyectos/:projectId/estimacion
```

Replica elementos centrales del HTML de referencia:

- cliente/proyecto como datos de solo lectura provenientes de Proyectos;
- carpeta Drive del levantamiento;
- indicaciones opcionales al agente;
- acción "Generar propuesta IA";
- roles, duración, HH/unidad, personas y HH resultantes;
- trazabilidad/explicación por rol;
- resumen lateral;
- supuestos;
- aclaraciones detectadas;
- cuestionario mínimo.

### Limitación intencional

`PocAiProvider` es **simulado y determinístico**.

En esta iteración:

- no descarga archivos de Drive;
- no llama a un LLM externo;
- no persiste versiones de estimación;
- no modifica el proyecto;
- devuelve `documentsAnalyzed = 0`;
- el frontend lo identifica explícitamente como proveedor simulado.

No se debe presentar esta PoC como análisis real de antecedentes.

### Siguiente vertical slice

El siguiente bloque debe reemplazar solo la parte necesaria detrás de los
boundaries ya creados:

1. resolver identidad/acceso a Drive;
2. implementar `DocumentSourceReader`;
3. descargar/exportar formatos soportados;
4. implementar proveedor IA real en `AiModule`;
5. producir contexto normalizado;
6. generar las preguntas dinámicas desde gaps reales;
7. persistir versión/snapshot;
8. conectar el flujo de creación de proyecto con la opción "Estimar con IA".

La UI y los contratos consumidores no deberían requerir una reescritura para
cambiar `PocAiProvider` por el proveedor real.


## Corrección de flujo PoC · Calculadora como punto de entrada

A partir de la validación visual contra el prototipo HTML, el flujo de
Calculadora queda definido así:

```text
/calculadora
   │
   ├── muestra proyectos vigentes como referencia
   │   └── NO expone un botón "Estimar" por fila
   │
   └── + Nueva estimación
         │
         ├── solo permite seleccionar prospectos en Cotización
         │
         ├── Plantilla estándar
         │      └── abre la estimación con roles base
         │
         ├── Plantilla RPA
         │      └── abre la estimación con roles base RPA
         │
         └── Propuesta del agente IA
                │
                ├── requiere carpeta Drive
                ├── analiza antecedentes
                ├── consolida entendimiento
                ├── genera preguntas fijas + dinámicas
                ├── usuario responde
                ├── genera propuesta final
                └── futuro: escribe documentos normalizados + EDT en Drive
```

La selección de un proyecto ya aprobado o en ejecución no inicia una nueva
estimación. Los proyectos existentes pueden seguir visibles en la vista
principal, pero el alta de una estimación siempre parte desde
`+ Nueva estimación`.

### Secuencia IA

La PoC separa explícitamente dos operaciones:

1. `POST /api/estimations/poc/analyze`
   - antecede a cualquier cálculo de HH;
   - devuelve resumen preliminar y preguntas dinámicas;
   - no devuelve roles ni HH.
2. `POST /api/estimations/poc/proposal`
   - se ejecuta después de responder el cuestionario;
   - recibe las respuestas;
   - genera la propuesta estructurada;
   - el caso de uso calcula las HH de forma determinística.

Esto corrige el flujo anterior, donde la propuesta de roles se generaba antes
del cuestionario.

### Fidelidad al prototipo

Se mantiene del HTML de referencia:

- botón superior `+ Nueva estimación`;
- modal de selección de prospecto;
- alternativas Agente IA / Plantilla estándar / Plantilla RPA;
- Drive visible únicamente para el flujo IA;
- navegación posterior al editor/workspace de la estimación;
- proyectos aprobados o ya en curso fuera del selector de nueva estimación.

La opción "Copiar una estimación existente" permanece visible como futura
capacidad, pero está deshabilitada en la PoC mientras no exista persistencia
del historial/versionado de estimaciones.
