import { describe, expect, it } from 'vitest';
import { Email } from './email.vo';

describe('Email', () => {
  it('normaliza a minúsculas y sin espacios', () => {
    // Ésta es la causa raíz que la v1 tuvo que parchear a posteriori con un
    // índice sobre lower(btrim(...)): normalizar al construir lo evita de origen.
    const email = Email.create('  Ana.Soto@Kabeli.CL  ').unwrap();

    expect(email.value).toBe('ana.soto@kabeli.cl');
  });

  it('considera iguales dos correos que solo difieren en formato', () => {
    const a = Email.create('ana@kabeli.cl').unwrap();
    const b = Email.create('ANA@KABELI.CL ').unwrap();

    expect(a.equals(b)).toBe(true);
  });

  it.each([
    ['vacío', '   '],
    ['sin arroba', 'ana.kabeli.cl'],
    ['sin dominio', 'ana@'],
    ['con espacios internos', 'an a@kabeli.cl'],
    ['sin extensión', 'ana@kabeli'],
  ])('rechaza un correo %s', (_caso, valor) => {
    expect(Email.create(valor).isErr()).toBe(true);
  });

  it('rechaza correos que superan el largo de la columna', () => {
    const largo = `${'a'.repeat(250)}@kabeli.cl`;

    expect(Email.create(largo).isErr()).toBe(true);
  });

  describe('dominios autorizados', () => {
    it('acepta cualquier dominio si la lista está vacía', () => {
      const email = Email.create('ana@gmail.com').unwrap();

      expect(email.belongsToAnyDomain([])).toBe(true);
    });

    it('acepta un dominio de la lista sin importar mayúsculas', () => {
      const email = Email.create('ana@kabeli.cl').unwrap();

      expect(email.belongsToAnyDomain(['KABELI.CL'])).toBe(true);
    });

    it('rechaza un dominio fuera de la lista', () => {
      const email = Email.create('ana@otraempresa.cl').unwrap();

      expect(email.belongsToAnyDomain(['kabeli.cl'])).toBe(false);
    });

    it('no se deja engañar por un dominio que solo termina igual', () => {
      const email = Email.create('ana@nokabeli.cl').unwrap();

      expect(email.belongsToAnyDomain(['kabeli.cl'])).toBe(false);
    });
  });
});
