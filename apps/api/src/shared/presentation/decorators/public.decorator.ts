import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'kora:isPublic';

/**
 * Marca un endpoint como accesible sin autenticación.
 *
 * El guard de autenticación es global, por lo que el estado por defecto de
 * cualquier ruta nueva es "protegida". Abrir una ruta exige un acto explícito
 * y visible en el código; olvidarse de proteger una, en cambio, es imposible.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
