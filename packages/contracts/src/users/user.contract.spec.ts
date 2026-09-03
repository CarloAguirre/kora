import { describe, expect, it } from 'vitest';
import { createUserSchema, listUsersQuerySchema } from './user.contract';
import { passwordSchema } from '../auth/auth.contract';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from './roles';

/**
 * Tests de los contratos.
 *
 * Estos esquemas los aplican a la vez el formulario del navegador y la API, así
 * que un fallo aquí se manifiesta en los dos lados. Se prueban como la frontera
 * de confianza que son.
 */
describe('createUserSchema', () => {
  const valido = {
    email: 'ana@kabeli.cl',
    firstName: 'Ana',
    lastName: 'Soto',
    role: 'collaborator' as const,
  };

  it('normaliza el correo a minúsculas y sin espacios', () => {
    const parsed = createUserSchema.parse({ ...valido, email: '  ANA@Kabeli.CL ' });

    expect(parsed.email).toBe('ana@kabeli.cl');
  });

  it('recorta los espacios del nombre', () => {
    const parsed = createUserSchema.parse({ ...valido, firstName: '  Ana  ' });

    expect(parsed.firstName).toBe('Ana');
  });

  it('rechaza un nombre vacío o solo espacios', () => {
    expect(createUserSchema.safeParse({ ...valido, firstName: '   ' }).success).toBe(false);
  });

  it('rechaza un rol inexistente', () => {
    expect(createUserSchema.safeParse({ ...valido, role: 'superusuario' }).success).toBe(false);
  });

  it('concede acceso por defecto', () => {
    expect(createUserSchema.parse(valido).grantAccess).toBe(true);
  });
});

describe('listUsersQuerySchema', () => {
  it('aplica valores por defecto de paginación y orden', () => {
    const parsed = listUsersQuerySchema.parse({});

    expect(parsed).toMatchObject({
      page: 1,
      pageSize: 25,
      sortField: 'firstName',
      sortDirection: 'asc',
    });
  });

  it('convierte los parámetros de la URL, que siempre llegan como texto', () => {
    const parsed = listUsersQuerySchema.parse({ page: '3', pageSize: '50' });

    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(50);
  });

  it('limita el tamaño de página para que nadie pida la tabla entera', () => {
    expect(listUsersQuerySchema.safeParse({ pageSize: '5000' }).success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('acepta una contraseña que cumple la política', () => {
    expect(passwordSchema.safeParse('MiClaveSegura1').success).toBe(true);
  });

  it.each([
    ['demasiado corta', 'Corta1'],
    ['sin mayúscula', 'minusculas123456'],
    ['sin minúscula', 'MAYUSCULAS123456'],
    ['sin número', 'SinNumerosAqui'],
  ])('rechaza una contraseña %s', (_caso, valor) => {
    expect(passwordSchema.safeParse(valor).success).toBe(false);
  });
});

describe('catálogo de permisos', () => {
  it('el administrador tiene todos los permisos', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toHaveLength(PERMISSIONS.length);
  });

  it('PMO tiene todo menos importar datos legados', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.pmo).not.toContain('admin:legacy_import');
    expect(DEFAULT_ROLE_PERMISSIONS.pmo).toHaveLength(PERMISSIONS.length - 1);
  });

  it('un colaborador no puede administrar usuarios', () => {
    const permisos = DEFAULT_ROLE_PERMISSIONS.collaborator;

    expect(permisos.some((p) => p.startsWith('users:'))).toBe(false);
  });

  it('un comercial no puede registrar horas', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.commercial).not.toContain('hours:register');
  });

  it('ningún rol declara un permiso que no exista en el catálogo', () => {
    const catalogo = new Set<string>(PERMISSIONS);

    for (const permisos of Object.values(DEFAULT_ROLE_PERMISSIONS)) {
      for (const permiso of permisos) {
        expect(catalogo.has(permiso)).toBe(true);
      }
    }
  });
});
