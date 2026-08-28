import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import type {
  PasswordAlgorithm,
  PasswordHasher,
  PasswordVerification,
} from '../../application/ports/password-hasher.port';

/**
 * Hasher de contraseñas con migración transparente desde bcrypt.
 *
 * Las contraseñas heredadas vienen de GoTrue como bcrypt. Este adaptador las
 * verifica tal cual y marca `needsRehash`, de modo que el caso de uso de login
 * las regrabe como argon2id tras la primera autenticación correcta. Nadie
 * tiene que restablecer su contraseña por el cambio de plataforma.
 *
 * Parámetros de argon2id: 19 MiB de memoria y 2 pasadas, la configuración
 * mínima que recomienda OWASP para argon2id.
 */
@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  readonly currentAlgorithm: PasswordAlgorithm = 'argon2id';

  private readonly options: argon2.HashOptions = {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  };

  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, { ...this.options, raw: false });
  }

  async verify(
    plainPassword: string,
    hash: string,
    algorithm: PasswordAlgorithm,
  ): Promise<PasswordVerification> {
    if (algorithm === 'bcrypt') {
      const valid = await this.verifyBcrypt(plainPassword, hash);
      // Un bcrypt válido siempre se considera obsoleto: es correcto, pero
      // queremos que la próxima vez ya esté en argon2id.
      return { valid, needsRehash: valid };
    }

    try {
      const valid = await argon2.verify(hash, plainPassword);
      return { valid, needsRehash: valid && argon2.needsRehash(hash, this.options) };
    } catch {
      // Un hash corrupto o de otro formato no es un error del servidor: es
      // simplemente una credencial que no valida.
      return { valid: false, needsRehash: false };
    }
  }

  private async verifyBcrypt(plainPassword: string, hash: string): Promise<boolean> {
    try {
      // GoTrue guarda el prefijo $2a$; bcryptjs lo acepta sin cambios.
      return await bcrypt.compare(plainPassword, hash);
    } catch {
      return false;
    }
  }
}
