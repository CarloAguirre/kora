import { ValueObject, err, ok, type Result } from '@kora/core';
import { InvalidTaxIdError } from '../errors/client.errors';

interface TaxIdProps {
  readonly value: string;
}

/**
 * RUT o identificador tributario del cliente.
 *
 * La v1 lo guardaba como texto libre sin normalizar (`rut_empresa`), y aun así
 * nunca tuvo un duplicado real en 49 clientes — pero confiar en que siga siendo
 * así sin un value object es cuestión de tiempo. Se normaliza quitando espacios
 * y guiones, y la comparación de unicidad usa esa forma normalizada.
 */
export class TaxId extends ValueObject<TaxIdProps> {
  private static readonly MAX_LENGTH = 50;

  private constructor(props: TaxIdProps) {
    super(props);
  }

  static create(raw: string): Result<TaxId, InvalidTaxIdError> {
    const normalized = raw.trim();

    if (normalized.length === 0) {
      return err(new InvalidTaxIdError('El RUT o identificador tributario es obligatorio.'));
    }
    if (normalized.length > TaxId.MAX_LENGTH) {
      return err(new InvalidTaxIdError(`El RUT no puede superar ${TaxId.MAX_LENGTH} caracteres.`));
    }

    return ok(new TaxId({ value: normalized }));
  }

  get value(): string {
    return this.props.value;
  }

  /** Forma usada solo para comparar igualdad, no para mostrar ni persistir. */
  get comparableValue(): string {
    return this.props.value.toUpperCase().replace(/[.\s-]/g, '');
  }

  override toString(): string {
    return this.props.value;
  }
}
