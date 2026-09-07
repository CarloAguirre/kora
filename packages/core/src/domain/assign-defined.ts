/**
 * Fusiona solo las claves de `patch` que vienen definidas dentro de `target`.
 *
 * `Object.assign(target, patch)` copia una clave presente en `patch` aunque
 * su valor sea `undefined` — así es como funciona `Object.assign`, no un
 * error de esta base de código. El problema es que un `updateDetails(data)`
 * de dominio recibe casi siempre un objeto donde TODAS las claves están
 * presentes (el caso de uso arma `{ title: data.title, ... }` para cada
 * campo del DTO), así que un campo que el cliente no envió en un PATCH
 * parcial llega como `undefined` y `Object.assign` lo usa para BORRAR el
 * valor ya guardado en la entidad. Bug real detectado en producción: al
 * registrar la solución de un ticket (que solo manda `resolution`/`status`),
 * el resto de sus campos —incluido `title`, `NOT NULL`— se volvían
 * `undefined`, y la fila fallaba al guardarse.
 */
export function assignDefined<T extends object>(target: T, patch: Partial<T>): void {
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const value = patch[key];
    if (value !== undefined) target[key] = value;
  }
}
