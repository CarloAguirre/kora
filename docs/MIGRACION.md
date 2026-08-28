# Migración desde Kora v1

## Principio

Ni un dato se pierde y ninguna persona tiene que restablecer su contraseña. La
migración es idempotente y verificable: se ensaya tantas veces como haga falta y
al final se comprueba que origen y destino cuadran.

## Qué había en la v1

58 tablas, de las cuales:

- **Vivas**: `usuario`, `profiles`, `lider_equipo`, `equipo_miembro`, `proyecto`,
  `cliente`, `ticket`, `registro_hh` y su entorno.
- **Muertas**: `clients`, `projects`, `tickets`, `client_hours` — restos en inglés
  del andamiaje inicial, con cero referencias en el código del front. No se migran.
- **Restos de migraciones**: cuatro tablas `proyecto_lifecycle_*_20260724`. No se migran.

## El problema de la identidad

Una misma persona vivía en tres tablas enlazadas de formas distintas:

| Tabla | Clave | Quién la referencia |
|---|---|---|
| `usuario` | `id_usuario` (entero) | proyectos, tickets, participaciones |
| `profiles` | `user_id` (UUID de Supabase Auth) | `registro_hh`, `equipo_miembro`, forecast |
| `auth.users` | `id` (UUID) | las credenciales reales, gestionadas por GoTrue |

`usuario.auth_user_id` debería unir las dos primeras, pero **estaba a nulo en 55
de las 58 filas**. El enlace que funciona de verdad es el correo electrónico.

Por eso el ETL une por correo normalizado y conserva **ambos** identificadores
heredados en cada usuario nuevo:

```sql
users.legacy_id            -- usuario.id_usuario
users.legacy_auth_user_id  -- profiles.user_id
```

Conservar los dos no es opcional: cuando se migren las horas registradas
(5.872 filas que apuntan a `user_id`) y los proyectos (que apuntan a
`id_usuario`), cada tabla necesita uno u otro para reconectarse.

## Equivalencias

### Roles

`usuario.rol` era un entero con FK a la tabla `rol`:

| v1 | v2 | Nota |
|---|---|---|
| 1 Administrador | `admin` | |
| 2 Lider · 4 Líder PM · 5 Líder de equipo | `leader` | Los tres colapsan en uno |
| 6 Colaborador | `collaborator` | |
| 7 Comercial | `commercial` | |
| 8 PMO | `pmo` | |

Los tres sabores de líder desaparecen como rol porque la distinción entre PM y
líder de equipo **no es un rol**: es consecuencia de las asignaciones que tenga
la persona. En la v2 se deriva sola (`AssignmentLeaderProfileResolver`), como ya
hacía el front de la v1 en `useLiderProfile` — pero ahora sin arriesgarse a que
el rol guardado contradiga los datos reales.

Un rol desconocido se degrada a `collaborator` y se informa: conceder de menos
se corrige con un clic, conceder de más es un incidente.

### Estados

`profiles.estado` era texto en español con un CHECK:

| v1 | v2 |
|---|---|
| `Habilitado` | `active` |
| `Deshabilitado` | `disabled` |
| `Bloqueado` | `blocked` |

### Contraseñas

Se copia el hash bcrypt de `auth.users.encrypted_password` tal cual, marcado
como `password_algorithm = 'bcrypt'`. En el primer inicio de sesión correcto, el
caso de uso lo verifica con bcrypt y lo regraba en argon2id.

Consecuencia práctica: **nadie pierde su contraseña** y, tras unas semanas de
uso normal, no queda ningún bcrypt en la base. Quien nunca tuvo cuenta en
`auth.users` se migra como ficha sin acceso, y un administrador le envía la
invitación cuando corresponda.

## Ejecución

```sh
cd tools/etl
cp .env.example .env     # LEGACY_DATABASE_URL y DATABASE_URL

DRY_RUN=true pnpm users  # ensayo completo, revertido al final
pnpm users               # real
pnpm verify              # comprobación
```

El ensayo NO es una simulación parcial: corre exactamente el mismo código dentro
de una transacción que se revierte al terminar. Cada paso ve lo que escribieron
los anteriores, así que su informe es idéntico al de una ejecución real.

Toda la migración va en **una sola transacción**. O se migra todo, o no se migra
nada: no existe el estado intermedio de "la mitad de los usuarios migrados", que
es justo el escenario que obligó a la v1 a inventar una tabla de
`provisioning_reconciliation_hold`.

## Resultado sobre los datos reales

```
  equipos              | leídos:  5 | creados:  5 | omitidos: 0
  usuarios             | leídos: 58 | creados: 58 | omitidos: 0
  líderes de equipo    | leídos:  4 | actualizados: 4 | omitidos: 0
  miembros de equipo   | leídos: 47 | creados: 42 | omitidos: 5
```

Verificación:

```
OK   usuarios                       esperado: 58  obtenido: 58
OK   equipos                        esperado:  5  obtenido:  5
OK   cuentas con acceso             esperado:  7  obtenido:  7
OK   miembros de equipo             esperado: 42  obtenido: 42
OK   trazabilidad legacy_id         esperado: 58  obtenido: 58
OK   correos duplicados en destino  esperado:  0  obtenido:  0
OK   colaboradores                  esperado: 38  obtenido: 38
```

### Los 5 miembros de equipo omitidos

No son un fallo de la migración, son datos rotos en el origen:

| Fila | Problema |
|---|---|
| 235 "Claudio Abele" | `user_id` nulo |
| 238 "Christopher Abarca" | `user_id` nulo |
| 240 "Osler Ruiz" | `user_id` nulo |
| 243 "Francisca Ramirez" | `user_id` apunta a un perfil inexistente |
| 245 "bla bla" | fila de prueba con `user_id` inexistente |

El ETL las informa y las omite en lugar de inventarles un dueño. Las tres
primeras corresponden a personas que SÍ se migraron correctamente como usuarios:
solo falta reasignarlas a su equipo desde la interfaz. La última es basura.

## Qué falta

El ETL cubre el módulo de usuario (usuarios, credenciales, identidades, equipos
y pertenencias). Los siguientes módulos añadirán sus pasos al mismo pipeline,
reutilizando `legacy_id` y `legacy_auth_user_id` para reconectar:

| Módulo | Tablas de origen | Filas |
|---|---|---|
| Horas | `registro_hh` | 5.872 |
| Tickets | `ticket`, `ticket_history`, `ticket_hh_request` | ~5.300 |
| Proyectos | `proyecto`, `proyecto_colaborador`, `equipo_proyecto` | ~600 |
| Clientes | `cliente`, `contacto_cliente` | ~90 |
| Forecast | `forecast_asignacion`, `forecast_asignacion_log` | ~1.500 |

## Puesta en producción

1. Poner la v1 en solo lectura.
2. Ejecutar el ETL en ensayo contra una copia de producción y revisar el informe.
3. Resolver los avisos que requieran decisión humana.
4. Ejecutar el ETL real y `pnpm etl:verify`.
5. Apuntar el DNS a la v2.
6. Conservar la base v1 intacta al menos un trimestre: `legacy_id` permite
   contrastar cualquier dato en cualquier momento.
