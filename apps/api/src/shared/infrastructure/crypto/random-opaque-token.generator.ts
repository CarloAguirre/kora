import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { OpaqueTokenGenerator } from '../../application/ports/token.port';

/**
 * Genera secretos opacos de 256 bits y su hash SHA-256.
 *
 * Los refresh tokens y los tokens de recuperación se guardan HASHEADOS: si
 * alguien lee la tabla `sessions` no obtiene nada con lo que suplantar a nadie.
 * SHA-256 basta aquí (a diferencia de las contraseñas) porque el secreto es
 * aleatorio de 256 bits: no hay diccionario que atacar, así que no se necesita
 * una función lenta.
 */
@Injectable()
export class RandomOpaqueTokenGenerator implements OpaqueTokenGenerator {
  generate(): { value: string; hash: string } {
    const value = randomBytes(32).toString('base64url');
    return { value, hash: this.hash(value) };
  }

  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
