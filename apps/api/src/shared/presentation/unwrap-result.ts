import type { Result } from '@kora/core';

/**
 * Puente entre el estilo `Result` de la capa de aplicación y el manejo de
 * excepciones que espera Nest.
 *
 * Los casos de uso devuelven errores en lugar de lanzarlos, porque eso obliga a
 * tratarlos y hace explícitos los modos de fallo. En el borde HTTP, en cambio,
 * lanzar es lo natural: el filtro global ya sabe traducir cada error a su
 * respuesta. Esta función es ese único punto de conversión.
 */
export function unwrapOrThrow<T, E>(result: Result<T, E>): T {
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}
