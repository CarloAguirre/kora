import { z } from 'zod';

/**
 * Validación del entorno.
 *
 * La aplicación no arranca si falta o es inválida una sola variable. Esto evita
 * la clase de fallo más cara: desplegar y descubrir en producción que un
 * secreto venía vacío. `process.env` no se lee en ningún otro punto del código.
 */

const csvList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.string()));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_PREFIX: z.string().default('api'),
  CORS_ORIGINS: csvList.default([]),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria.'),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_SSL: z.stringbool().default(false),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres.'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres.'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  ALLOWED_EMAIL_DOMAINS: csvList.default([]),

  // Opcionales: sin ellas, el login con Google queda deshabilitado (ver
  // AppConfigService.google.enabled) en vez de impedir que la API arranque.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),

  // Integración servidor-a-servidor con Google Drive para los antecedentes de
  // proyectos. Ambas son opcionales: sin ellas, Calculadora informa que Drive
  // no está configurado y no intenta acceder a carpetas privadas.
  GOOGLE_DRIVE_CLIENT_EMAIL: z.email().optional(),
  GOOGLE_DRIVE_PRIVATE_KEY: z.string().optional(),

  // Proveedor IA de la PoC de Calculadora. La API key es opcional: sin ella
  // AiModule cae al proveedor simulado y la aplicación sigue arrancando.
  GEMINI_API_KEY: z.string().trim().min(1).optional(),
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-3.5-flash-lite'),

  // Correo saliente (Resend). Sin RESEND_API_KEY los correos se escriben en el
  // log en vez de enviarse — solo admisible fuera de producción.
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().min(1).default('Kora <avisos@kora.kabeli.cl>'),
  // Desvía TODOS los correos a este buzón. Solo desarrollo: la base local suele
  // tener usuarios reales y probar un alta no debe escribirle a un compañero.
  MAIL_REDIRECT_TO: z.email().optional(),
  // URL pública del front: los enlaces de los correos tienen que ser absolutos.
  WEB_APP_URL: z.url().default('http://localhost:5173'),
  // Recordatorios diarios de horas (18:00 horas sin registrar, 08:00 horas por
  // aprobar — ver modules/reminders). Apagados por defecto: con la base local
  // de copia de producción, encenderlos en desarrollo le escribiría a gente real.
  HOUR_REMINDERS_ENABLED: z.stringbool().default(false),

  MAX_FAILED_LOGIN_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(5),
  ACCOUNT_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${issues}`);
  }

  if (parsed.data.NODE_ENV === 'production') {
    assertProductionSafety(parsed.data);
  }

  return parsed.data;
}

/** Comprobaciones que solo tienen sentido exigir en producción. */
function assertProductionSafety(env: Env): void {
  const problems: string[] = [];

  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    problems.push('JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deben ser distintos.');
  }
  if (env.JWT_ACCESS_SECRET.includes('cambia-esto')) {
    problems.push('JWT_ACCESS_SECRET conserva el valor de ejemplo.');
  }
  if (env.JWT_REFRESH_SECRET.includes('cambia-esto') || env.JWT_REFRESH_SECRET.includes('y-esto')) {
    problems.push('JWT_REFRESH_SECRET conserva el valor de ejemplo.');
  }
  if (env.CORS_ORIGINS.length === 0) {
    problems.push('CORS_ORIGINS no puede estar vacío en producción.');
  }
  // Sin clave, el adaptador de log escribiría los tokens de invitación y
  // recuperación en los logs de producción en vez de enviarlos.
  if (!env.RESEND_API_KEY) {
    problems.push('RESEND_API_KEY es obligatoria en producción.');
  }
  if (env.MAIL_REDIRECT_TO) {
    problems.push('MAIL_REDIRECT_TO no puede usarse en producción.');
  }
  if (/localhost|127\.0\.0\.1/.test(env.WEB_APP_URL)) {
    problems.push('WEB_APP_URL apunta a localhost: los enlaces de los correos no funcionarían.');
  }

  if (problems.length > 0) {
    throw new Error(`Configuración insegura para producción:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
}
