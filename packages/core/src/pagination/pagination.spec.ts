import { describe, expect, it } from 'vitest';
import { buildPage, mapPage, toOffset } from './pagination';

describe('paginación', () => {
  it('calcula el número de páginas redondeando hacia arriba', () => {
    // 58 elementos de 25 en 25 son 3 páginas: la última va incompleta.
    const page = buildPage([], 58, { page: 1, pageSize: 25 });

    expect(page.pageCount).toBe(3);
  });

  it('sin resultados no hay páginas', () => {
    expect(buildPage([], 0, { page: 1, pageSize: 25 }).pageCount).toBe(0);
  });

  it('un tamaño de página cero no revienta con una división por cero', () => {
    expect(buildPage([], 10, { page: 1, pageSize: 0 }).pageCount).toBe(0);
  });

  it('el desplazamiento parte de cero en la primera página', () => {
    expect(toOffset({ page: 1, pageSize: 25 })).toBe(0);
    expect(toOffset({ page: 3, pageSize: 25 })).toBe(50);
  });

  it('mapPage transforma los elementos y conserva los metadatos', () => {
    const original = buildPage([1, 2, 3], 3, { page: 1, pageSize: 10 });

    const mapped = mapPage(original, (n) => n * 2);

    expect(mapped.items).toEqual([2, 4, 6]);
    expect(mapped.total).toBe(3);
    expect(mapped.pageCount).toBe(1);
  });
});
