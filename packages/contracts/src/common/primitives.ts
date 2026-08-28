import { z } from 'zod';

/** Primitivas reutilizables. Definir el formato una sola vez evita que el
 *  front valide una cosa y el back otra distinta. */

export const uuidSchema = z.uuid({ message: 'Identificador inválido.' });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, 'El correo es demasiado corto.')
  .max(255, 'El correo es demasiado largo.')
  .pipe(z.email({ message: 'Formato de correo inválido.' }));

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const nonEmptyTrimmed = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} es obligatorio.`)
    .max(max, `${label} no puede superar ${max} caracteres.`);

export const sortDirectionSchema = z.enum(['asc', 'desc']);

/** Filtro de query multi-valor: acepta claves repetidas (Fastify las junta en
 *  array) o una lista separada por comas, y normaliza ambas a un array —
 *  o a `undefined` si viene vacío, para no armar un `WHERE ... IN ()` inútil. */
export const arrayQueryParam = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') return undefined;
    const raw = Array.isArray(value) ? value : [value];
    const items = raw
      .flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]))
      .map((item) => (typeof item === 'string' ? item.trim() : item))
      .filter((item) => item !== '');
    return items.length > 0 ? items : undefined;
  }, z.array(schema).optional());

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const pageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    pageCount: z.number().int().min(0),
  });

export interface PageResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/** Envoltura estándar de error de la API. Un único formato para todo el sistema. */
export const apiErrorSchema = z.object({
  code: z.string(),
  kind: z.enum([
    'validation',
    'not_found',
    'conflict',
    'unauthorized',
    'forbidden',
    'unprocessable',
    'rate_limited',
    'internal',
  ]),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
