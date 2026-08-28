import { describe, expect, it } from 'vitest';
import { TaxId } from './tax-id.vo';

describe('TaxId', () => {
  it('acepta un RUT con formato normal', () => {
    expect(TaxId.create('76.123.456-7').isOk()).toBe(true);
  });

  it('rechaza un valor vacío', () => {
    expect(TaxId.create('   ').isErr()).toBe(true);
  });

  it('rechaza un valor que supera el largo de la columna', () => {
    expect(TaxId.create('a'.repeat(51)).isErr()).toBe(true);
  });

  it('recorta espacios pero conserva el formato original para mostrar', () => {
    const taxId = TaxId.create('  76.123.456-7  ').unwrap();

    expect(taxId.value).toBe('76.123.456-7');
  });

  it('compara sin distinguir puntos, guiones ni mayúsculas', () => {
    // Dos formas de escribir el mismo RUT no deben leerse como dos clientes.
    const a = TaxId.create('76.123.456-7').unwrap();
    const b = TaxId.create('76123456-7').unwrap();

    expect(a.comparableValue).toBe(b.comparableValue);
  });

  it('la igualdad estricta (equals) SÍ distingue el formato', () => {
    // `equals` compara el value object completo, útil para "¿cambió el campo?";
    // `comparableValue` es la que se usa para la regla de unicidad de negocio.
    const a = TaxId.create('76.123.456-7').unwrap();
    const b = TaxId.create('76123456-7').unwrap();

    expect(a.equals(b)).toBe(false);
  });
});
