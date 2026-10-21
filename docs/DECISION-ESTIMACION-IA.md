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
