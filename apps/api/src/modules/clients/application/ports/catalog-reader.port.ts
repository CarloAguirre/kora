/**
 * Lectura de los catálogos de referencia (país, comuna, giro, rubro).
 *
 * Son datos que casi nunca cambian; este puerto solo los lee para resolver
 * nombres y validar existencia. Su escritura, si algún día hace falta un CRUD
 * de catálogos, es un módulo aparte — no forma parte del dominio de clientes.
 */
export interface CatalogEntry {
  readonly id: string;
  readonly name: string;
}

export interface CatalogReader {
  findCountry(id: string): Promise<CatalogEntry | null>;
  findComuna(id: string): Promise<CatalogEntry | null>;
  findIndustry(id: string): Promise<CatalogEntry | null>;
  findBusinessSector(id: string): Promise<CatalogEntry | null>;

  findManyByIds(kind: 'country' | 'comuna' | 'industry' | 'businessSector', ids: readonly string[]): Promise<CatalogEntry[]>;
}

export const CATALOG_READER = Symbol('CatalogReader');
