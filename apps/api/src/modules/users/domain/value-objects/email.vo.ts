import { ValueObject, err, ok, type Result } from '@kora/core';
import { InvalidEmailError } from '../errors/user.errors';

interface EmailProps {
  readonly value: string;
}

/**
 * Correo electrónico normalizado.
 *
 * Un `Email` solo existe si es válido: no hay forma de construir uno inválido,
 * así que ninguna capa posterior necesita volver a comprobarlo. Además
 * normaliza (minúsculas, sin espacios) en el constructor, que es la causa raíz
 * de los duplicados que la v1 tuvo que resolver a posteriori con un índice
 * único sobre `lower(btrim(correo_usuario))`.
 */
export class Email extends ValueObject<EmailProps> {
  private static readonly PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  private static readonly MAX_LENGTH = 255;

  private constructor(props: EmailProps) {
    super(props);
  }

  static create(raw: string): Result<Email, InvalidEmailError> {
    const normalized = raw.trim().toLowerCase();

    if (normalized.length === 0) {
      return err(new InvalidEmailError('El correo es obligatorio.'));
    }
    if (normalized.length > Email.MAX_LENGTH) {
      return err(new InvalidEmailError(`El correo no puede superar ${Email.MAX_LENGTH} caracteres.`));
    }
    if (!Email.PATTERN.test(normalized)) {
      return err(new InvalidEmailError('El formato del correo no es válido.'));
    }

    return ok(new Email({ value: normalized }));
  }

  get value(): string {
    return this.props.value;
  }

  get domain(): string {
    return this.props.value.slice(this.props.value.lastIndexOf('@') + 1);
  }

  /** Comprueba si el correo pertenece a alguno de los dominios autorizados.
   *  Una lista vacía significa "sin restricción". */
  belongsToAnyDomain(domains: readonly string[]): boolean {
    if (domains.length === 0) return true;
    return domains.some((domain) => this.domain === domain.trim().toLowerCase());
  }

  override toString(): string {
    return this.props.value;
  }
}
