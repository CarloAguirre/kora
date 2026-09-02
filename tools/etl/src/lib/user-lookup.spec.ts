import { describe, expect, it } from 'vitest';
import { resolveUserId } from './user-lookup';

describe('resolveUserId', () => {
  it('resuelve directo cuando el UUID de Supabase matchea', () => {
    const byAuth = new Map([['auth-1', 'user-1']]);

    const result = resolveUserId('auth-1', byAuth, new Map(), new Map());

    expect(result).toEqual({ userId: 'user-1', matchedBy: 'auth' });
  });

  it('cae al correo cuando el UUID no matchea pero el correo sí (cuenta de Supabase recreada)', () => {
    // Caso real: mangel.tort@kabeli.cl quedó con un UUID nuevo en el backup
    // legacy, pero `users.legacy_auth_user_id` en destino todavía tenía el viejo.
    const byAuth = new Map([['auth-viejo', 'user-mangel']]);
    const legacyEmailByAuthId = new Map([['auth-nuevo', 'mangel.tort@kabeli.cl']]);
    const byEmail = new Map([['mangel.tort@kabeli.cl', 'user-mangel']]);

    const result = resolveUserId('auth-nuevo', byAuth, legacyEmailByAuthId, byEmail);

    expect(result).toEqual({ userId: 'user-mangel', matchedBy: 'email' });
  });

  it('no resuelve cuando ni el UUID ni el correo matchean (usuario realmente no migrado)', () => {
    const legacyEmailByAuthId = new Map([['auth-x', 'nueva.persona@kabeli.cl']]);

    const result = resolveUserId('auth-x', new Map(), legacyEmailByAuthId, new Map());

    expect(result).toEqual({ userId: null, matchedBy: null });
  });

  it('no resuelve cuando el UUID no matchea y tampoco hay correo legacy conocido para ese UUID', () => {
    const result = resolveUserId('auth-desconocido', new Map(), new Map(), new Map([['alguien@kabeli.cl', 'user-1']]));

    expect(result).toEqual({ userId: null, matchedBy: null });
  });

  it('devuelve null sin buscar nada cuando el UUID de entrada es null o undefined', () => {
    expect(resolveUserId(null, new Map(), new Map(), new Map())).toEqual({ userId: null, matchedBy: null });
    expect(resolveUserId(undefined, new Map(), new Map(), new Map())).toEqual({ userId: null, matchedBy: null });
  });
});
