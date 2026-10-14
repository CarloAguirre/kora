import type { CatalogOption } from '@kora/contracts';

/**
 * Listado completo de un catálogo, para poblar los selectores del formulario.
 *
 * Distinto de `CatalogReader` (que resuelve identificadores puntuales) y de
 * `CommercialManagerReader` (que resuelve usuarios concretos): éste siempre
 * trae la lista entera, que es lo que un `<select>` necesita.
 */
/** Comuna con su país, para que el formulario filtre por el país elegido. */
export interface ComunaOption extends CatalogOption {
  readonly countryId: string | null;
}

export interface ClientCatalogLister {
  listCountries(): Promise<CatalogOption[]>;
  listComunas(): Promise<ComunaOption[]>;
  listIndustries(): Promise<CatalogOption[]>;
  listBusinessSectors(): Promise<CatalogOption[]>;
  listCommercialManagers(): Promise<CatalogOption[]>;
}

export const CLIENT_CATALOG_LISTER = Symbol('ClientCatalogLister');
