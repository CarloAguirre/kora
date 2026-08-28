import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Guardián de la arquitectura.
 *
 * La regla "las dependencias apuntan hacia dentro" es fácil de enunciar y fácil
 * de romper sin darse cuenta: basta con que alguien, con prisa, importe Drizzle
 * dentro de una entidad porque "es solo una consulta". Nada en el compilador lo
 * impide, y una vez roto el aislamiento, deshacerlo cuesta semanas.
 *
 * Este test convierte la regla en algo que falla en CI. Es el equivalente
 * automático de la revisión que, en la práctica, nadie hace siempre.
 */

const SRC = join(__dirname, '..');

interface Rule {
  readonly name: string;
  /** Fragmento de ruta que identifica la capa. */
  readonly layer: string;
  readonly forbidden: readonly string[];
  readonly why: string;
}

const RULES: readonly Rule[] = [
  {
    name: 'el dominio no conoce frameworks ni persistencia',
    layer: '/domain/',
    forbidden: ["from '@nestjs", "from 'drizzle-orm", "from '@kora/db", "from 'fastify"],
    why: 'Las reglas de negocio deben poder probarse sin levantar nada y sobrevivir a un cambio de ORM o de framework.',
  },
  {
    name: 'la aplicación no conoce la persistencia concreta',
    layer: '/application/',
    forbidden: ["from 'drizzle-orm", "from '@kora/db", "from 'fastify"],
    why: 'Los casos de uso dependen de puertos; la implementación la elige el módulo al componer.',
  },
  {
    name: 'la presentación no consulta la base directamente',
    layer: '/presentation/',
    forbidden: ["from 'drizzle-orm", "from '@kora/db"],
    why: 'Un controlador que consulta la base se salta las reglas de negocio del caso de uso.',
  },
];

/** Recorre los archivos .ts del árbol, ignorando tests y compilados. */
function collectSourceFiles(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);

    if (statSync(fullPath).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      found.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) continue;
    found.push(fullPath);
  }

  return found;
}

describe('límites de la arquitectura', () => {
  const files = collectSourceFiles(SRC);

  it('encuentra archivos que analizar', () => {
    // Si el recorrido fallara en silencio, todas las reglas pasarían por vacío
    // y el guardián dejaría de guardar nada.
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(RULES)('$name', (rule) => {
    const violations: string[] = [];

    for (const file of files) {
      const normalized = file.replaceAll('\\', '/');
      if (!normalized.includes(rule.layer)) continue;

      const content = readFileSync(file, 'utf8');

      for (const forbidden of rule.forbidden) {
        if (content.includes(forbidden)) {
          violations.push(`  ${relative(SRC, file).replaceAll('\\', '/')} → ${forbidden}...`);
        }
      }
    }

    expect(
      violations,
      `\n${rule.why}\n\nInfracciones:\n${violations.join('\n')}\n`,
    ).toEqual([]);
  });

  it('el dominio de usuarios no importa de otros módulos', () => {
    // Un módulo que importa el dominio de otro los acopla para siempre: la
    // comunicación entre módulos va por puertos, no por importaciones directas.
    const violations: string[] = [];

    for (const file of files) {
      const normalized = file.replaceAll('\\', '/');
      if (!normalized.includes('/modules/users/domain/')) continue;

      const content = readFileSync(file, 'utf8');
      const matches = content.matchAll(/from '(\.\.\/)+([a-z-]+)\/domain/g);

      for (const match of matches) {
        if (match[2] && match[2] !== 'users') {
          violations.push(`${relative(SRC, file)} → ${match[0]}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('ningún caso de uso importa otro caso de uso', () => {
    // Encadenar casos de uso los vuelve dependientes entre sí y hace imposible
    // razonar sobre las transacciones. Lo que se comparte se extrae a un
    // servicio de dominio o a un puerto.
    const violations: string[] = [];

    for (const file of files) {
      const normalized = file.replaceAll('\\', '/');
      if (!normalized.includes('/use-cases/')) continue;

      const content = readFileSync(file, 'utf8');
      const matches = content.matchAll(/import\s+\{[^}]*\}\s+from\s+'([^']*use-case[^']*)'/g);

      for (const match of matches) {
        const target = match[1] ?? '';
        // Se permite importar utilidades sueltas del mismo archivo hermano
        // (como `isUniqueViolation`), no la clase del caso de uso.
        if (/UseCase\b/.test(match[0])) {
          violations.push(`${relative(SRC, file)} → ${target}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
