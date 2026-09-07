import { describe, expect, it } from 'vitest';
import { assignDefined } from './assign-defined';

describe('assignDefined', () => {
  it('copia los valores definidos, igual que Object.assign', () => {
    const target = { a: 1, b: 2 };
    assignDefined(target, { a: 10 });

    expect(target).toEqual({ a: 10, b: 2 });
  });

  it('ignora una clave presente cuyo valor es undefined, sin borrar lo existente', () => {
    // Es exactamente el caso que Object.assign maneja mal: una clave presente
    // con valor undefined no significa "sin cambios", significa "bórralo" —
    // y en un `updateDetails(data)` de dominio esa clave casi siempre está
    // presente porque el caso de uso arma el objeto con todos los campos del
    // DTO, aunque el cliente no haya mandado ese campo en el PATCH.
    const target = { a: 1, b: 2 };
    assignDefined(target, { a: undefined, b: 20 });

    expect(target).toEqual({ a: 1, b: 20 });
  });

  it('null sí se copia: es un valor real, no "ausente"', () => {
    const target: { a: number | null } = { a: 1 };
    assignDefined(target, { a: null });

    expect(target.a).toBeNull();
  });
});
