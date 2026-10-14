import type { CatalogOption } from '@kora/contracts';

/**
 * Opciones del formulario de cliente.
 *
 * Es el tipo de la respuesta de `GET /clients/form-options`. Vive aparte del
 * contrato Zod porque es una agregación específica de este endpoint —cinco
 * catálogos a la vez— y no un recurso de negocio que otro módulo vaya a
 * reutilizar.
 */
/** Comuna con su país: el formulario solo ofrece las del país elegido. */
export interface ComunaOption extends CatalogOption {
  readonly countryId: string | null;
}

export interface ClientFormOptions {
  readonly countries: readonly CatalogOption[];
  readonly comunas: readonly ComunaOption[];
  readonly industries: readonly CatalogOption[];
  readonly businessSectors: readonly CatalogOption[];
  readonly commercialManagers: readonly CatalogOption[];
}
