import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';

const VERSION = 'v1';
const IV_BYTES = 12;

@Injectable()
export class GoogleOAuthTokenCipher {
  constructor(private readonly config: AppConfigService) {}

  encrypt(value: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      VERSION,
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  decrypt(value: string): string {
    const [version, ivRaw, tagRaw, encryptedRaw] = value.split('.');
    if (
      version !== VERSION ||
      !ivRaw ||
      !tagRaw ||
      !encryptedRaw
    ) {
      throw new Error('La credencial Google almacenada tiene un formato inválido.');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(ivRaw, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private key(): Buffer {
    return createHash('sha256')
      .update('kora:google-oauth:')
      .update(this.config.auth.refreshSecret)
      .digest();
  }
}
