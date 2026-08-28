import { Injectable } from '@nestjs/common';
import type { Clock } from '@kora/core';

/**
 * Reloj del sistema.
 *
 * Existe para que ningún caso de uso llame a `new Date()` directamente: con el
 * reloj inyectado, un test puede comprobar el bloqueo por intentos fallidos
 * adelantando el tiempo, sin esperar quince minutos ni parchear globales.
 */
@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Reloj fijo para tests. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  advanceBy(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }

  set(date: Date): void {
    this.current = new Date(date);
  }
}
