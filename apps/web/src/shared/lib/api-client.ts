import type { ApiError } from '@kora/contracts';

/**
 * Cliente HTTP de la aplicación.
 *
 * Responsabilidades, y solo éstas: adjuntar el access token, renovarlo cuando
 * caduca, y convertir un error de la API en un error tipado. No sabe nada de
 * usuarios, proyectos ni pantallas — cada módulo construye sus llamadas encima.
 *
 * El access token se guarda EN MEMORIA, nunca en `localStorage`. Es la decisión
 * de seguridad más importante del cliente: en la v1 la sesión de Supabase vivía
 * en `localStorage`, de modo que cualquier script inyectado en la página podía
 * leerla y usarla indefinidamente. Aquí un XSS podría, como mucho, actuar
 * mientras la pestaña está abierta; el refresh token va en una cookie
 * `httpOnly` que JavaScript no puede leer.
 */

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly payload: ApiError,
  ) {
    super(payload.message);
    this.name = 'ApiRequestError';
  }

  get code(): string {
    return this.payload.code;
  }

  /** Problemas por campo, listos para inyectar en el formulario. */
  get fieldIssues(): Record<string, string[]> | null {
    const issues = this.payload.details?.issues;
    return issues && typeof issues === 'object' ? (issues as Record<string, string[]>) : null;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }
}

type TokenListener = (token: string | null) => void;

class TokenStore {
  private token: string | null = null;
  private readonly listeners = new Set<TokenListener>();

  get(): string | null {
    return this.token;
  }

  set(token: string | null): void {
    this.token = token;
    for (const listener of this.listeners) listener(token);
  }

  subscribe(listener: TokenListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const tokenStore = new TokenStore();

const BASE_URL = '/api';

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly query?: Record<string, string | number | boolean | readonly string[] | undefined>;
  readonly signal?: AbortSignal;
  /** Evita el intento de renovación; lo usa la propia renovación. */
  readonly skipRefresh?: boolean;
}

/**
 * Renovación compartida.
 *
 * Si tres peticiones caducan a la vez, deben esperar a UNA sola renovación en
 * lugar de disparar tres. Sin esta promesa compartida, las renovaciones
 * simultáneas rotarían el refresh token unas contra otras y el servidor lo
 * interpretaría —con razón— como reutilización de un token robado, cerrando la
 * sesión del usuario.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        tokenStore.set(null);
        return false;
      }

      const data = (await response.json()) as { tokens: { accessToken: string } };
      tokenStore.set(data.tokens.accessToken);
      return true;
    } catch {
      tokenStore.set(null);
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);

  // Un 401 con token presente significa "caducó": se renueva y se reintenta UNA
  // vez. Reintentar en bucle ante un 401 persistente solo produciría una
  // tormenta de peticiones.
  if (response.status === 401 && !options.skipRefresh && tokenStore.get()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retried = await send(path, options);
      return handleResponse<T>(retried);
    }
  }

  return handleResponse<T>(response);
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === '') continue;
    // Un filtro multi-valor viaja como lista separada por comas; el esquema
    // de la API la vuelve a partir en array al validar la query.
    if (Array.isArray(value)) {
      if (value.length > 0) url.searchParams.set(key, value.join(','));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  // Un `FormData` no se serializa: el navegador arma el `multipart/form-data`
  // con su propio boundary, y fijar el Content-Type a mano se lo rompería.
  const isFormData = options.body instanceof FormData;
  if (options.body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

  return fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers,
    // Necesario para que viaje la cookie del refresh token.
    credentials: 'include',
    ...(options.body !== undefined ? { body: isFormData ? (options.body as FormData) : JSON.stringify(options.body) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiRequestError(response.status, toApiError(data, response.status));
  }

  return data as T;
}

/** Toda respuesta de error acaba con la misma forma, aunque venga malformada. */
function toApiError(data: unknown, status: number): ApiError {
  if (
    data &&
    typeof data === 'object' &&
    'code' in data &&
    'message' in data &&
    typeof (data as { message: unknown }).message === 'string'
  ) {
    return data as ApiError;
  }

  return {
    code: `HTTP_${status}`,
    kind: status >= 500 ? 'internal' : 'validation',
    message:
      status >= 500
        ? 'El servidor no está disponible. Inténtalo de nuevo en unos minutos.'
        : 'La solicitud no pudo completarse.',
  };
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) =>
    apiRequest<T>(path, query ? { query } : {}),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  postFormData: <T>(path: string, body: FormData, query?: RequestOptions['query']) =>
    apiRequest<T>(path, { method: 'POST', body, ...(query ? { query } : {}) }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
  /** Intenta recuperar la sesión desde la cookie al arrancar la aplicación. */
  restoreSession: () => refreshAccessToken(),
};
