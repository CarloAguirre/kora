# Arquitectura

## La regla que sostiene todo lo demás

Las dependencias apuntan siempre hacia dentro. El dominio no conoce nada; la
aplicación conoce el dominio; la infraestructura conoce a ambos.

```
   presentación  ─┐
                  ├──►  aplicación  ──►  dominio
   infraestructura┘                        ▲
                  └────────────────────────┘
                     (implementa sus puertos)
```

En la práctica esto significa que en `modules/*/domain/` no hay un solo `import`
de NestJS, de Drizzle ni de nada externo salvo `@kora/core` y `@kora/contracts`.
Se puede comprobar:

```sh
grep -rE "from '(@nestjs|drizzle-orm|@kora/db)" apps/api/src/modules/*/domain/
# no devuelve nada
```

Que no devuelva nada es la garantía de que las reglas de negocio se pueden
probar sin levantar nada, y de que cambiar de ORM o de framework no las toca.

## Las capas, con un ejemplo

Tomemos "dar de baja a un usuario".

**Dominio** — `modules/users/domain/entities/user.entity.ts`

Sabe que una baja es lógica, que nadie puede darse de baja a sí mismo y que no
se puede dar de baja dos veces. No sabe qué es una tabla ni un `DELETE`.

```ts
softDelete(actorUserId: string, now: Date): Result<void, ...> {
  if (actorUserId === this.id) return err(new SelfAuthorizationChangeError('cuenta'));
  if (this.isDeleted) return err(new UserAlreadyDeletedError());
  this.props.deletedAt = now;
  ...
}
```

**Aplicación** — `modules/users/application/use-cases/delete-user.use-case.ts`

Orquesta: busca al usuario, comprueba lo que exige mirar fuera del agregado (que
quede otro administrador), delega la regla en la entidad, y decide el límite
transaccional.

**Infraestructura** — `modules/users/infrastructure/persistence/drizzle-user.repository.ts`

Traduce la entidad a filas y las filas a entidad. Es el único archivo del módulo
que contiene SQL.

**Presentación** — `modules/users/presentation/users.controller.ts`

Valida la entrada, invoca un caso de uso, traduce el `Result`. Sin un solo `if`
de negocio.

**Composición** — `modules/users/users.module.ts`

El único sitio donde `USER_REPOSITORY` se ata a `DrizzleUserRepository`.

## Cómo se aplica cada principio SOLID

**Responsabilidad única.** Un caso de uso = una operación de negocio = una clase
con un método. La administración de usuarios de la v1 (2.554 líneas en un
archivo) son aquí siete clases de entre 60 y 150 líneas, cada una con su test.

**Abierto/cerrado.** La autorización se expresa en permisos, no en roles. Añadir
un rol es añadir una fila al catálogo y su lista de permisos: ni un controlador
ni un componente cambia. En la v1, la llegada del rol PMO obligó a introducir
`isAdminLikeRole()` y a repasar cada comparación `role === 'administrador'`
esparcida por el proyecto.

**Sustitución de Liskov.** Todas las implementaciones de un puerto son
intercambiables sin que el llamador note la diferencia. Los tests lo demuestran:
`InMemoryUserRepository` sustituye a `DrizzleUserRepository` y los casos de uso
funcionan igual.

**Segregación de interfaces.** El módulo de usuarios necesita revocar sesiones,
pero no emitirlas: depende de `SessionRevoker` (dos métodos), no de
`SessionRepository` (ocho). Ambos apuntan a la misma instancia vía `useExisting`,
así que no hay estado duplicado — solo vistas distintas del mismo objeto.

**Inversión de dependencias.** Los puertos los define quien los consume
(`domain/repositories/`, `application/ports/`) y los implementa infraestructura.
La dependencia va de lo concreto a lo abstracto, nunca al revés.

## Frontend

La misma idea, adaptada:

```
src/
  app/        Composición: proveedores, rutas, guardas
  modules/
    <módulo>/
      api/          Llamadas HTTP y hooks de datos
      components/   Piezas de interfaz del módulo
      hooks/        Lógica de estado reutilizable
      lib/          Utilidades puras
      pages/        Pantallas que componen lo anterior
  shared/
    components/ui/      Sistema de diseño
    components/layout/  Estructura general
    lib/                Cliente HTTP
  styles/       Tokens y estilos globales
```

Una página solo compone. `UsersListPage` tiene 150 líneas y no contiene ni una
regla de negocio ni una llamada `fetch`.

### CSS Modules

Cada componente tiene su `.module.css` al lado. Los nombres de clase se aíslan
en compilación, así que `.header` en `TopBar.module.css` y `.header` en
`Modal.module.css` no se pisan. Los colores y medidas salen de variables CSS
globales definidas en `styles/tokens.css`.

El diseño es exactamente el de la v1 —los valores están tomados de su
`dashboard.css` y `kora-button.css`—, pero mientras allí `#122235` aparecía
escrito a mano 1.010 veces en 7.388 líneas de CSS global, aquí está declarado
una vez como `--kora-navy`.

## Autenticación

- **Access token**: JWT de 15 minutos, en memoria del cliente. Lleva los
  permisos ya resueltos, así que autorizar no consulta la base.
- **Refresh token**: opaco, en cookie `httpOnly`, rotado en cada uso. Solo se
  guarda su hash.
- **Detección de robo**: reutilizar un token ya rotado revoca todas las sesiones
  de esa persona.
- **Contraseñas**: argon2id. Los hashes bcrypt heredados de Supabase se
  verifican tal cual y se regraban en argon2id en el primer inicio de sesión.

Ningún dato de identidad se guarda en `localStorage`. En la v1 la sesión de
Supabase vivía ahí, de modo que un XSS podía leerla y reutilizarla sin límite.

## Qué NO está en la base de datos

La v1 tenía 135 políticas RLS y 144 funciones PL/pgSQL: la lógica de negocio
vivía en Postgres, sin control de versiones efectivo, sin tests unitarios y solo
editable desde la consola de Supabase.

En la v2 la base guarda datos y garantiza integridad (claves, índices únicos,
enums). Las reglas de negocio están en TypeScript, versionadas y probadas.
