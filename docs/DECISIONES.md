# Decisiones técnicas

Qué se eligió, frente a qué, y por qué. Sin esto, dentro de un año nadie
recordará si una decisión fue deliberada o accidental.

## Backend: NestJS + Fastify

**Frente a:** Express suelto, Hono, Fastify a pelo.

NestJS trae inyección de dependencias de serie, que es el mecanismo sobre el que
descansa la inversión de dependencias: los casos de uso piden puertos y el
módulo decide qué implementación reciben. Sin un contenedor, ese cableado se
hace a mano en cada punto de entrada y se degrada rápido.

El coste es un framework opinado y con decoradores. Se acepta porque el
aislamiento por capas hace que solo lo toquen la presentación y la composición:
el dominio no importa NestJS en ningún archivo.

Fastify en lugar de Express por rendimiento y por su manejo de cookies y
esquemas. Nest abstrae el adaptador, así que la elección no llega a los
controladores.

## ORM: Drizzle

**Frente a:** Prisma, TypeORM, SQL a mano.

Drizzle genera SQL predecible y tipado sin una capa de runtime propia ni un
lenguaje de esquema aparte. Para migrar un esquema existente y escribir
consultas concretas —como la de permisos efectivos, que resuelve rol,
concesiones y revocaciones en una sola pasada— es más directo que Prisma.

TypeORM se descartó por sus patrones Active Record, que empujan a mezclar
persistencia y dominio: justo lo que esta arquitectura evita.

## Base de datos: esquema nuevo con ETL

**Frente a:** evolucionar el esquema actual con migraciones incrementales.

El esquema de la v1 arrastra tablas muertas en inglés, restos de migraciones,
nombres mezclados en dos idiomas, PKs enteras y UUID conviviendo, y tres tablas
para una misma persona. Evolucionarlo dejaba todo eso para siempre.

El coste es escribir y verificar un ETL. Se compensa porque el ETL es
idempotente y se ensaya contra una copia cuantas veces haga falta, y porque
`legacy_id` mantiene la trazabilidad hacia el origen indefinidamente.

## Sin RLS: la autorización vive en el backend

**Frente a:** conservar las 135 políticas RLS de la v1.

Las políticas RLS eran necesarias en la v1 porque el navegador hablaba
directamente con Postgres: sin ellas, cualquiera podía leer cualquier tabla. Con
un backend propio, esa razón desaparece.

Las reglas en TypeScript se leen, se prueban unitariamente y se versionan. Las
mismas reglas como PL/pgSQL requerían PGlite y reproducir 160 migraciones solo
para comprobar una condición.

La base sigue garantizando lo que le corresponde: claves foráneas, índices
únicos y enums. Integridad, no lógica de negocio.

## Autenticación propia

**Frente a:** seguir con Supabase Auth (GoTrue).

Objetivo declarado: dejar de depender del proyecto Supabase que administra un
tercero. Además elimina la clase de fallo que dominaba la v1: dos sistemas de
identidad que sincronizar sin transacción común, con toda la maquinaria de
reconciliación que eso obligó a construir.

El riesgo de implementar autenticación uno mismo se acota usando piezas
probadas: argon2id para contraseñas, JWT firmado para el access token, tokens
opacos hasheados y rotados para el refresh, y bloqueo temporal por intentos
fallidos.

## Rol único + excepciones, en vez de N:M

**Frente a:** una tabla `user_roles` con varios roles por persona.

En Kora una persona ES administrador, o colaborador, o comercial. Modelar N:M
obliga a responder "¿qué pasa si alguien es admin y colaborador a la vez?" en
cada consulta, para un caso que no ocurre.

La flexibilidad que hace falta de verdad —"a esta persona concreta hay que darle
un permiso extra"— se cubre con `user_permission_overrides`, que además deja
constancia del motivo y admite caducidad.

## Result en lugar de excepciones

**Frente a:** lanzar excepciones en los casos de uso.

Un `Result<T, E>` obliga al llamador a tratar el error y hace que la firma
documente los modos de fallo. Una excepción se puede olvidar y viaja invisible
hasta un `catch` genérico.

Las excepciones quedan para lo verdaderamente excepcional: base caída, bug.
`unwrapOrThrow` es el único punto de conversión, en el borde HTTP.

## Frontend: React + Vite + CSS Modules

**Frente a:** Next.js; Tailwind o styled-components.

Kora es una aplicación interna tras login: no necesita SSR, SEO ni
renderizado en servidor. Next.js añadiría complejidad sin beneficio.

CSS Modules frente a Tailwind: el diseño ya existe y está expresado en CSS.
Portarlo a clases de utilidad significaría reescribir 7.388 líneas traduciendo
cada valor, con el riesgo de desviaciones. Con CSS Modules el CSS se mueve casi
tal cual, gana aislamiento por componente, y los tokens dejan la paleta en un
único archivo.

Frente a CSS-en-JS: los módulos son CSS real, sin coste en tiempo de ejecución,
y el navegador los cachea aparte del JavaScript.

## Contratos compartidos con Zod

**Frente a:** tipos duplicados en front y back, u OpenAPI con generación.

Un esquema Zod es a la vez validación en servidor, validación en formulario y
tipo TypeScript. Si el servidor cambia la forma de una respuesta, el front deja
de compilar — que es exactamente cuándo conviene enterarse.

OpenAPI con generación de cliente daría algo parecido, a cambio de un paso de
compilación adicional y de un cliente generado que nadie lee.

## El access token en memoria

**Frente a:** `localStorage` (lo que hacía la v1).

Un token en `localStorage` es legible por cualquier script inyectado en la
página, y sigue siéndolo entre pestañas y recargas. En memoria, un XSS solo
puede actuar mientras la pestaña está abierta.

El coste es que al recargar hay que renovar; se resuelve con la cookie
`httpOnly` del refresh token, que JavaScript no puede leer.

## Duplicación deliberada: `teamRequirementFor`

La regla de qué roles llevan equipo existe en el backend
(`TeamAssignmentPolicy`) y en el frontend (`lib/team-requirement.ts`).

Es duplicación consciente: sin ella, el selector de equipo tendría que esperar
una respuesta del servidor cada vez que cambia el rol. Son tres líneas que
cambian muy rara vez, y el backend sigue siendo la autoridad — si discreparan,
gana el servidor y el formulario muestra su error.

Reglas más complejas o más cambiantes NO deben duplicarse: se consultan.

## Lo que queda pendiente

- **Envío de correo real.** Hoy `LogNotificationSender` escribe la invitación en
  el log, lo que permite trabajar sin servidor de correo. Falta un adaptador
  real; implementa el mismo puerto, así que no toca ningún caso de uso.
- **Perfil de líder PM.** `countActiveLedProjects` devuelve vacío hasta que
  exista el módulo de proyectos. El puerto y el resto de la cadena ya contemplan
  los cuatro resultados posibles.
- **Módulo de equipos.** Los equipos se migran y se leen, pero no hay pantalla
  de gestión. `DrizzleTeamReader` la sustituye mientras tanto.
- **Limitación de intentos por IP.** Hay bloqueo por cuenta; falta un límite por
  origen para frenar el sondeo masivo de correos.
