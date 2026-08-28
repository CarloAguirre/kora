import type { Result } from '@kora/core';

/**
 * Contrato de un caso de uso.
 *
 * Una operación de negocio = una clase con un único método `execute`. Es la
 * aplicación literal del principio de responsabilidad única, y tiene un efecto
 * práctico: el archivo de 2.554 líneas que en la v1 concentraba TODA la
 * administración de usuarios se convierte aquí en una carpeta de clases de 60
 * a 120 líneas, cada una con su test y su motivo para cambiar.
 */
export interface UseCase<TInput, TOutput, TError = Error> {
  execute(input: TInput): Promise<Result<TOutput, TError>>;
}

/**
 * Quién ejecuta la operación y desde dónde.
 *
 * Viaja explícitamente en la entrada de cada caso de uso en lugar de leerse de
 * un contexto global: hace visible en la firma que la operación depende del
 * actor, y permite probar "un admin degrada a otro" sin simular una petición.
 */
export interface ActorContext {
  readonly userId: string;
  readonly email: string;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly requestId?: string | null;
}

/** Actor del sistema, para procesos automáticos y para el ETL. */
export const SYSTEM_ACTOR: ActorContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  email: 'sistema@kora',
};
