# Decisión — Contratos compartidos y estructura del monorepo para Calculadora

**Estado:** decisión técnica para implementación  
**Fecha:** 2026-10-21  
**Rama:** `feature/calculadora/carlo`

## Objetivo

Comparar el patrón de contratos compartidos de **Aurelia** con el patrón ya existente
en **Kora**, para decidir cómo debe integrarse el nuevo módulo de Calculadora /
Estimación IA sin introducir una segunda convención dentro del monorepo.

La conclusión es:

> Kora ya tiene el mismo principio arquitectónico que Aurelia: un package
> compartido de contratos consumido por API y frontend. Sin embargo, la
> implementación de Kora es distinta y debe respetarse. Para Calculadora no se
> debe copiar literalmente la organización de Aurelia.

## Resumen ejecutivo

| Tema | Aurelia | Kora | Decisión Calculadora |
|---|---|---|---|
| Workspace | pnpm + Turborepo | pnpm + Turborepo | Mantener Kora |
| Contratos compartidos | `@aurelia/contracts` | `@kora/contracts` | Usar `@kora/contracts` |
| Organización | `enums/`, `types/`, `interfaces/`, `dtos/`, `schemas/` | Por dominio: `projects/project.contract.ts`, `hours/hour-entry.contract.ts`, etc. | Crear dominio `estimation/` |
| Validación runtime | Nest DTO + class-validator | Zod compartido | Usar Zod |
| Tipos TS | interfaces/types explícitos | `z.infer<typeof schema>` principalmente | Seguir patrón Kora |
| DTO backend | Clase Nest que `implements` contrato | No es necesario; controller usa schema + `ZodValidationPipe` | No duplicar DTOs |
| Runtime contracts | enums + constraints | schemas Zod + constantes + labels | Seguir Kora |
| Build contracts | dual ESM/CJS | CJS para API; web consume source vía alias Vite | Mantener patrón Kora |
| Entidades DB | solo API/TypeORM | `@kora/db` + Drizzle | No exponer modelos DB |
| Núcleo dominio | no package dedicado equivalente | `@kora/core` | Mantener separación |

## Aurelia: patrón observado

Aurelia usa un monorepo con:

```text
apps/
  api
  web
  mobile-inspecciones
  mobile-incidentes

packages/
  contracts
```

`@aurelia/contracts` es la fuente de verdad para datos que cruzan la frontera
HTTP.

Su estructura está separada por naturaleza del artefacto:

```text
packages/contracts/src/
  enums/
  types/
  interfaces/
  dtos/
  schemas/
  index.ts
```

La convención relevante es:

- enums compartidos se reutilizan como tipo y como valor runtime;
- interfaces/types describen dominio y requests/responses;
- contracts no depende de NestJS, TypeORM, React o Expo;
- la API crea DTOs NestJS locales con `class-validator`;
- esos DTOs hacen `implements CreateXRequest` para que TypeScript detecte
  desviaciones;
- web y mobile consumen los mismos request/response types;
- entidades TypeORM permanecen solo en API.

Ejemplo conceptual:

```ts
// @aurelia/contracts
export interface CreateInspectionRequest {
  title: string;
  type: InspectionType;
}

// apps/api
export class CreateInspectionDto implements CreateInspectionRequest {
  @IsString()
  title: string;

  @IsEnum(InspectionType)
  type: InspectionType;
}
```

El package se construye en:

- ESM para Vite/Metro;
- CJS para NestJS;
- declarations `.d.ts`.

Esto es correcto para la arquitectura de Aurelia.

## Kora: mismo principio, distinta implementación

Kora también tiene un package compartido:

```text
packages/
  contracts
  core
  db
  config
```

`@kora/contracts` ya es dependencia directa de:

- `apps/api`;
- `apps/web`;
- otros packages internos cuando necesitan tipos/catálogos compartidos.

Por lo tanto, **sí existe ya en Kora el equivalente arquitectónico de
`@aurelia/contracts`**.

La diferencia importante es cómo modela los contratos.

### Organización por dominio

Kora no separa globalmente `enums/`, `interfaces/` y `dtos/`. Agrupa el
contrato por dominio:

```text
packages/contracts/src/
  auth/
    auth.contract.ts
  clients/
    client.contract.ts
  projects/
    project.contract.ts
  hours/
    hour-entry.contract.ts
  forecast/
    forecast.contract.ts
  teams/
    team.contract.ts
  tickets/
    ...
  index.ts
```

Esto reduce la dispersión de un mismo concepto entre varias carpetas.

Para Calculadora se debe seguir esta convención:

```text
packages/contracts/src/
  estimation/
    estimation.contract.ts
  index.ts
```

Si el dominio crece mucho, puede subdividirse internamente, pero manteniendo el
agrupamiento funcional.

## Zod es la diferencia principal

En Kora el contrato no es solamente un tipo TypeScript.

El patrón habitual es:

```ts
export const PROJECT_STATUSES = [
  'draft',
  'active',
  'on_hold',
  'finished',
  'cancelled',
] as const;

export const projectStatusSchema = z.enum(PROJECT_STATUSES);

export type ProjectStatus =
  z.infer<typeof projectStatusSchema>;
```

El mismo archivo puede contener:

- catálogo de valores;
- schema Zod;
- tipo inferido;
- labels;
- input schemas;
- response schemas;
- restricciones y refinements.

Esto evita mantener por separado:

```text
interface
+
DTO
+
reglas class-validator
+
schema frontend
```

cuando todos expresan la misma forma de dato.

## Validación API en Kora

Kora ya tiene `ZodValidationPipe`.

El controlador importa directamente desde `@kora/contracts`:

```ts
import {
  createProjectSchema,
  type CreateProjectInput,
} from '@kora/contracts';
```

y valida el body/query con el mismo schema que puede usar el frontend.

Conceptualmente:

```ts
@Body(new ZodValidationPipe(createProjectSchema))
input: CreateProjectInput
```

Esto significa que en Kora **no necesitamos replicar el patrón de Aurelia de
crear una clase DTO de Nest que implemente una interface compartida**.

La garantía es incluso más directa:

```text
schema Zod compartido
        │
        ├── infiere tipo TypeScript
        ├── valida frontend
        └── valida backend
```

Una regla de validación vive una sola vez.

## Consumo desde el frontend

El frontend importa los mismos tipos:

```ts
import type {
  CreateUserInput,
  UserDetail,
} from '@kora/contracts';
```

y también puede reutilizar schemas:

```ts
import {
  createClientSchema,
  type CreateClientInput,
} from '@kora/contracts';
```

con `zodResolver`.

La API y la web quedan alineadas sobre el mismo contrato.

## Build: diferencia con Aurelia

Aurelia publica internamente contracts como dual build:

```text
dist/esm
dist/cjs
dist/types
```

Kora compila `@kora/contracts` a CommonJS para los consumidores Node/Nest.

Para la web, Vite tiene un alias explícito:

```ts
'@kora/contracts':
  resolve(__dirname, '../../packages/contracts/src/index.ts')
```

Por lo tanto la web consume directamente el source TypeScript y Vite lo
transforma como parte de la aplicación.

Consecuencias:

- API usa build del package;
- web obtiene HMR inmediato de contracts;
- no hace falta introducir dual build ESM/CJS solo por Calculadora;
- Turborepo ya ordena `build` mediante `dependsOn: ["^build"]`.

No hay razón para migrar Kora al modelo dual de Aurelia como parte de este
módulo.

## Kora tiene además dos boundaries que Aurelia no expresa igual

### @kora/core

Contiene piezas compartidas del núcleo de dominio, por ejemplo Result, errores,
entidades base o abstracciones internas.

No debe usarse como sustituto de contracts:

```text
@kora/contracts
  = frontera de datos / schemas / tipos compartidos

@kora/core
  = primitivas y conceptos de dominio reutilizables
```

### @kora/db

Contiene schema Drizzle, migraciones y persistencia compartida.

La web **no** debe depender de `@kora/db`.

La dirección debe seguir siendo:

```text
Web
  │
  │ @kora/contracts
  ▼
HTTP
  │
  ▼
API
  │
  ├── application/domain
  └── infrastructure -> @kora/db
```

## Decisión para Calculadora

### Nombre funcional y nombre técnico

UI:

```text
Calculadora
Estimación inteligente
```

Dominio técnico recomendado:

```text
estimation
```

El dominio es más estable que el nombre visual "calculadora".

### Contratos

Crear:

```text
packages/contracts/src/estimation/
  estimation.contract.ts
```

y exportarlo desde:

```text
packages/contracts/src/index.ts
```

No crear inicialmente:

```text
packages/contracts/src/dtos/
packages/contracts/src/interfaces/
packages/contracts/src/enums/
```

porque rompería la convención existente de Kora.

### Contratos iniciales previsibles

El contrato debería modelar progresivamente:

#### Estados

- estado de análisis documental;
- estado de estimación;
- estado de versión;
- estado de una pregunta;
- origen de una respuesta;
- tipo de requerimiento;
- impacto/prioridad;
- confianza IA.

#### Contexto normalizado

- requisitos funcionales;
- requisitos no funcionales;
- reglas de negocio;
- historias de usuario;
- casos/flujos complejos;
- integraciones;
- restricciones técnicas;
- gaps;
- supuestos;
- referencias a fuentes.

#### Cuestionario

- pregunta fija/dinámica;
- tipo de respuesta;
- opciones;
- impacto;
- motivo;
- fuentes;
- valor detectado;
- confidence;
- supuesto si se omite;
- dependencias.

#### EDT

- WBS;
- fase;
- módulo;
- submódulo;
- actividad;
- tipo de trabajo;
- complejidad;
- alcance;
- referencias;
- dependencias;
- rol;
- HH;
- criterios/notas.

#### Resumen

- HH por módulo;
- HH por rol;
- total base;
- reserva;
- total;
- escenarios;
- duración;
- riesgos;
- supuestos;
- exclusiones.

## Qué NO debe ir en contracts

Siguiendo tanto Kora como Aurelia, no deben vivir en
`@kora/contracts`:

- entidades Drizzle;
- repositorios;
- clients SDK de OpenAI/Anthropic/etc.;
- implementación Google Drive;
- prompts;
- casos de uso Nest;
- servicios;
- componentes React;
- lógica para calcular costos o HH;
- credenciales/configuración del proveedor IA.

Sí deben vivir allí los **schemas y tipos que atraviesan boundaries**.

## Propuesta de módulos

### Backend

```text
apps/api/src/modules/estimation/
  domain/
  application/
    use-cases/
    ports/
  infrastructure/
    persistence/
    ai/
    drive/
  presentation/
    estimation.controller.ts
  estimation.module.ts
```

### Frontend

```text
apps/web/src/modules/estimation/
  api/
  components/
  hooks/
  lib/
  pages/
```

### Contracts

```text
packages/contracts/src/estimation/
  estimation.contract.ts
```

### DB

```text
packages/db/src/schema/
  estimation.ts
```

o el patrón exacto de schema que esté vigente al momento de implementar.

## Dependencias permitidas

```text
apps/web
   └── @kora/contracts

apps/api
   ├── @kora/contracts
   ├── @kora/core
   └── @kora/db

@kora/contracts
   └── zod
```

El contrato no puede depender de API, web o DB.

## Regla práctica para decidir dónde poner un tipo

### Va a @kora/contracts si

La forma:

- viaja por HTTP;
- es compartida entre frontend y backend;
- necesita validación igual en ambos;
- representa un catálogo utilizado en más de un consumidor.

Ejemplos:

```text
EstimationQuestion
SubmitEstimationAnswerInput
ProjectContext
WbsItem
EstimationSummary
EstimationStatus
```

### Va al backend si

Solo describe:

- una entidad de dominio interna;
- un puerto;
- un servicio;
- un proveedor IA;
- un modelo de persistencia;
- un objeto temporal del pipeline.

### Va al frontend si

Solo representa:

- estado visual;
- props;
- selección local;
- layout;
- filtros puramente UI.

## Diferencia conceptual Aurelia vs Kora

La comparación puede resumirse así:

```text
Aurelia
Contrato TS
   ↓
Interface Request
   ↓
Nest DTO implements Interface
   ↓
class-validator
   ↓
Controller

Kora
Schema Zod
   ├── type inferido
   ├── validación frontend
   └── ZodValidationPipe backend
        ↓
      Controller
```

Ambos evitan divergencia de contratos.

Para Kora, el segundo patrón ya está establecido y resulta especialmente útil
en Calculadora porque el módulo tendrá estructuras complejas y dinámicas:
requisitos, preguntas IA, respuestas, contexto y EDT.

## Decisión final

**Sí, Kora ya comparte contratos entre apps de manera equivalente a Aurelia.**

No está "igual" en la implementación interna:

- Aurelia organiza por clases de artefacto y usa interfaces + DTOs Nest;
- Kora organiza por dominio y usa Zod como fuente de verdad de runtime + tipos
  inferidos.

La Calculadora debe seguir **Kora nativo**, no trasplantar la implementación de
Aurelia.

Esto significa:

1. todo contrato nuevo compartido entra a `@kora/contracts`;
2. se organiza por dominio `estimation`;
3. Zod define la forma y validación;
4. TypeScript infiere los tipos;
5. API valida con `ZodValidationPipe`;
6. web reutiliza schema/tipos;
7. persistencia sigue en `@kora/db`;
8. lógica IA y Drive siguen como infraestructura de API;
9. no se crean DTOs Nest duplicados salvo que aparezca un caso técnico que
   realmente lo justifique;
10. el módulo se desarrolla en `feature/calculadora/carlo`.

## Documentos relacionados

- `docs/DECISION-ESTIMACION-IA.md` — flujo funcional, contexto normalizado,
  preguntas, trazabilidad y generación EDT.
- `docs/ARQUITECTURA.md` — reglas generales de Clean Architecture de Kora.
