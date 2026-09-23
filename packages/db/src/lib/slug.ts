const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Normaliza un nombre (en español, con acentos/ñ) a un slug de URL: minúsculas, sin diacríticos, separado por guiones. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Agrega `-2`, `-3`, ... al slug base hasta encontrar uno libre según `isTaken`. */
export async function withUniqueSuffix(base: string, isTaken: (slug: string) => Promise<boolean>): Promise<string> {
  let candidate = base || 'sin-nombre';
  let attempt = 2;
  while (await isTaken(candidate)) {
    candidate = `${base}-${attempt}`;
    attempt += 1;
  }
  return candidate;
}
