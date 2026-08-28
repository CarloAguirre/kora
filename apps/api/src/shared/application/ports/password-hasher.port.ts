/**
 * Puerto de hashing de contraseñas.
 *
 * El caso de uso de login no sabe si detrás hay argon2, bcrypt o lo que venga
 * en cinco años: solo sabe verificar y, si el hash está anticuado, pedir que se
 * rehashee. Esa indirección es la que permite migrar los hashes bcrypt heredados
 * de Supabase a argon2id de forma transparente, sin que nadie pierda su
 * contraseña ni note el cambio.
 */

export type PasswordAlgorithm = 'argon2id' | 'bcrypt';

export interface PasswordVerification {
  readonly valid: boolean;
  /** True cuando el hash es válido pero usa un algoritmo o coste obsoleto. */
  readonly needsRehash: boolean;
}

export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;
  verify(plainPassword: string, hash: string, algorithm: PasswordAlgorithm): Promise<PasswordVerification>;
  readonly currentAlgorithm: PasswordAlgorithm;
}

export const PASSWORD_HASHER = Symbol('PasswordHasher');
