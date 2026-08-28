import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '@kora/core';

/** Genera los identificadores de las entidades nuevas. */
@Injectable()
export class UuidGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}
