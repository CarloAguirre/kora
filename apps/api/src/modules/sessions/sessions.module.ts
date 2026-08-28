import { Global, Module } from '@nestjs/common';
import { SESSION_REPOSITORY } from './application/ports/session.repository';
import { SESSION_REVOKER } from '../users/application/ports/session-revoker.port';
import { DrizzleSessionRepository } from './infrastructure/persistence/drizzle-session.repository';

/**
 * Sesiones: un único repositorio expuesto a través de dos puertos distintos.
 *
 * `SESSION_REVOKER` es la vista reducida que consume el módulo de usuarios
 * (solo revocar); `SESSION_REPOSITORY` es la completa que consume autenticación
 * (emitir, rotar, listar). Ambos apuntan con `useExisting` a la MISMA instancia,
 * así que no hay dos estados posibles, pero cada consumidor solo ve lo que
 * necesita — Segregación de Interfaces aplicada a la composición.
 *
 * Vive en su propio módulo para romper el ciclo que aparecería si el
 * repositorio estuviera en autenticación: usuarios necesita revocar y
 * autenticación necesita usuarios.
 */
@Global()
@Module({
  providers: [
    DrizzleSessionRepository,
    { provide: SESSION_REPOSITORY, useExisting: DrizzleSessionRepository },
    { provide: SESSION_REVOKER, useExisting: DrizzleSessionRepository },
  ],
  exports: [SESSION_REPOSITORY, SESSION_REVOKER],
})
export class SessionsModule {}
