import type { TransactionContext } from '@kora/core';

/**
 * Vincula el alta de usuarios externos con un contacto y una empresa existente.
 * Se ejecuta dentro de la misma unidad de trabajo del alta del usuario.
 * No concede proyectos ni contratos: los grants se gestionan por separado.
 */
export interface ClientPortalProvisioner {
  provision(input: {
    readonly userId: string;
    readonly clientId: string;
    readonly email: string;
    readonly fullName: string;
    readonly actorUserId: string;
    readonly enabled: boolean;
  }, context: TransactionContext): Promise<void>;
}

export const CLIENT_PORTAL_PROVISIONER = Symbol('ClientPortalProvisioner');
