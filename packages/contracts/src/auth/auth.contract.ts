import { z } from 'zod';
import { emailSchema, isoDateTimeSchema, uuidSchema } from '../common/primitives';
import { leaderProfileSchema, permissionSchema, roleCodeSchema } from '../users/roles';
import { userStatusSchema } from '../users/user.contract';

/**
 * Política de contraseñas. Vive en el contrato para que el formulario del front
 * y el caso de uso del back apliquen exactamente la misma regla — en la v1 el
 * front validaba una cosa y GoTrue otra.
 */
export const PASSWORD_MIN_LENGTH = 12;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(128, 'La contraseña no puede superar 128 caracteres.')
  .refine((value) => /[a-z]/.test(value), 'Debe incluir al menos una minúscula.')
  .refine((value) => /[A-Z]/.test(value), 'Debe incluir al menos una mayúscula.')
  .refine((value) => /\d/.test(value), 'Debe incluir al menos un número.');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'La contraseña es obligatoria.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const authenticatedUserSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  role: roleCodeSchema,
  status: userStatusSchema,
  permissions: z.array(permissionSchema),
  teamId: uuidSchema.nullable(),
  leaderProfile: leaderProfileSchema.nullable(),
  mustChangePassword: z.boolean(),
});

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  /** Segundos de vida del access token, para que el cliente renueve a tiempo. */
  expiresIn: z.number().int().positive(),
  tokenType: z.literal('Bearer'),
});

export type AuthTokens = z.infer<typeof authTokensSchema>;

export const loginResponseSchema = z.object({
  user: authenticatedUserSchema,
  tokens: authTokensSchema,
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const refreshResponseSchema = z.object({
  tokens: authTokensSchema,
});

export type RefreshResponse = z.infer<typeof refreshResponseSchema>;



export const googleDriveConnectSchema = z.object({
  returnTo: z
    .string()
    .trim()
    .max(1000)
    .refine(
      (value) => value.startsWith('/') && !value.startsWith('//'),
      'La ruta de retorno debe ser interna.',
    )
    .default('/calculadora'),
});
export type GoogleDriveConnectInput = z.infer<typeof googleDriveConnectSchema>;

export const googleDriveConnectionStatusSchema = z.object({
  connected: z.boolean(),
  email: emailSchema.nullable(),
  scopes: z.array(z.string().trim().min(1)),
});
export type GoogleDriveConnectionStatus = z.infer<
  typeof googleDriveConnectionStatusSchema
>;

export const googleDriveConnectResponseSchema = z.object({
  authorizationUrl: z.url(),
});
export type GoogleDriveConnectResponse = z.infer<
  typeof googleDriveConnectResponseSchema
>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'La contraseña actual es obligatoria.'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'La nueva contraseña debe ser distinta de la actual.',
    path: ['newPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const requestPasswordResetSchema = z.object({ email: emailSchema });
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const confirmPasswordResetSchema = z
  .object({
    token: z.string().min(20, 'Token inválido.'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

export type ConfirmPasswordResetInput = z.infer<typeof confirmPasswordResetSchema>;

export const sessionSchema = z.object({
  id: uuidSchema,
  createdAt: isoDateTimeSchema,
  lastUsedAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema,
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  current: z.boolean(),
});

export type SessionInfo = z.infer<typeof sessionSchema>;

/** Códigos de error de autenticación estables: el front decide qué mensaje
 *  mostrar sin comparar textos. */
export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  ACCOUNT_DISABLED: 'AUTH_ACCOUNT_DISABLED',
  ACCOUNT_BLOCKED: 'AUTH_ACCOUNT_BLOCKED',
  ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  NO_ACCESS_GRANTED: 'AUTH_NO_ACCESS_GRANTED',
  PASSWORD_CHANGE_REQUIRED: 'AUTH_PASSWORD_CHANGE_REQUIRED',
  MISSING_ACCESS_TOKEN: 'AUTH_MISSING_ACCESS_TOKEN',
  INVALID_ACCESS_TOKEN: 'AUTH_INVALID_ACCESS_TOKEN',
  INVALID_REFRESH_TOKEN: 'AUTH_INVALID_REFRESH_TOKEN',
  EMAIL_DOMAIN_NOT_ALLOWED: 'AUTH_EMAIL_DOMAIN_NOT_ALLOWED',
  GOOGLE_NOT_CONFIGURED: 'AUTH_GOOGLE_NOT_CONFIGURED',
  GOOGLE_STATE_MISMATCH: 'AUTH_GOOGLE_STATE_MISMATCH',
  GOOGLE_LOGIN_FAILED: 'AUTH_GOOGLE_LOGIN_FAILED',
  GOOGLE_EMAIL_NOT_VERIFIED: 'AUTH_GOOGLE_EMAIL_NOT_VERIFIED',
  GOOGLE_ACCOUNT_NOT_FOUND: 'AUTH_GOOGLE_ACCOUNT_NOT_FOUND',
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];
