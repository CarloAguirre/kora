import { describe, expect, it } from 'vitest';
import { combine, err, ok, okVoid } from './result';

/**
 * Tests del tipo `Result`.
 *
 * Es la pieza de la que depende todo el manejo de errores del sistema: si aquí
 * hay un fallo, se propaga a cada caso de uso. Merece cobertura exhaustiva
 * aunque el código sea corto.
 */
describe('Result', () => {
  describe('ok', () => {
    it('se identifica como éxito', () => {
      const result = ok(42);

      expect(result.isOk()).toBe(true);
      expect(result.isErr()).toBe(false);
    });

    it('devuelve su valor al desempaquetar', () => {
      expect(ok('hola').unwrap()).toBe('hola');
    });

    it('ignora el valor de reserva', () => {
      expect(ok(1).unwrapOr(99)).toBe(1);
    });

    it('transforma el valor con map', () => {
      expect(ok(2).map((n) => n * 3).unwrap()).toBe(6);
    });

    it('mapErr lo deja intacto', () => {
      const result = ok<number, string>(5).mapErr(() => 'otro');

      expect(result.unwrap()).toBe(5);
    });

    it('encadena con andThen', () => {
      const result = ok(4).andThen((n) => ok(n + 1));

      expect(result.unwrap()).toBe(5);
    });

    it('andThen puede fallar y devolver el error', () => {
      const result = ok<number, string>(4).andThen(() => err<string, number>('falló'));

      expect(result.isErr()).toBe(true);
    });

    it('okVoid representa un comando sin valor de retorno', () => {
      expect(okVoid().isOk()).toBe(true);
    });
  });

  describe('err', () => {
    it('se identifica como fallo', () => {
      const result = err('roto');

      expect(result.isErr()).toBe(true);
      expect(result.isOk()).toBe(false);
    });

    it('lanza al desempaquetar', () => {
      expect(() => err(new Error('roto')).unwrap()).toThrow('roto');
    });

    it('envuelve en Error un fallo que no lo era', () => {
      expect(() => err('texto suelto').unwrap()).toThrow(/texto suelto/);
    });

    it('devuelve el valor de reserva', () => {
      expect(err<string, number>('roto').unwrapOr(7)).toBe(7);
    });

    it('map no ejecuta la transformación', () => {
      let ejecutado = false;

      err<string, number>('roto').map(() => {
        ejecutado = true;
        return 1;
      });

      expect(ejecutado).toBe(false);
    });

    it('mapErr transforma el error', () => {
      const result = err<string, number>('roto').mapErr((e) => `${e}!`);

      expect(result.isErr() && result.error).toBe('roto!');
    });

    it('andThen corta la cadena', () => {
      let ejecutado = false;

      const result = err<string, number>('roto').andThen(() => {
        ejecutado = true;
        return ok(1);
      });

      expect(ejecutado).toBe(false);
      expect(result.isErr()).toBe(true);
    });
  });

  describe('combine', () => {
    it('reúne todos los valores cuando todos son correctos', () => {
      const result = combine([ok(1), ok(2), ok(3)]);

      expect(result.unwrap()).toEqual([1, 2, 3]);
    });

    it('devuelve el PRIMER error y descarta el resto', () => {
      // Devolver solo el primero es deliberado: al construir una entidad, el
      // primer dato inválido ya impide seguir, y un formulario muestra los
      // errores por campo a partir del esquema, no de aquí.
      const result = combine([ok(1), err<string, number>('primero'), err<string, number>('segundo')]);

      expect(result.isErr() && result.error).toBe('primero');
    });

    it('una lista vacía es un éxito vacío', () => {
      expect(combine([]).unwrap()).toEqual([]);
    });
  });
});
