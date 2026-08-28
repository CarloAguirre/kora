import { ValueObject, err, ok, type Result } from '@kora/core';
import { InvalidPersonNameError } from '../errors/user.errors';

interface PersonNameProps {
  readonly firstName: string;
  readonly lastName: string;
}

/**
 * Nombre y apellido como una sola unidad.
 *
 * Van juntos porque juntos forman el nombre para mostrar, y porque la regla de
 * "no puede estar vacío" aplica a ambos por igual. Tenerlos como dos strings
 * sueltos obliga a repetir esa validación en cada punto de entrada.
 */
export class PersonName extends ValueObject<PersonNameProps> {
  private static readonly MAX_LENGTH = 100;

  private constructor(props: PersonNameProps) {
    super(props);
  }

  static create(firstName: string, lastName: string): Result<PersonName, InvalidPersonNameError> {
    const normalizedFirst = PersonName.normalize(firstName);
    const normalizedLast = PersonName.normalize(lastName);

    if (normalizedFirst.length === 0) {
      return err(new InvalidPersonNameError('El nombre es obligatorio.'));
    }
    if (normalizedLast.length === 0) {
      return err(new InvalidPersonNameError('El apellido es obligatorio.'));
    }
    if (normalizedFirst.length > PersonName.MAX_LENGTH || normalizedLast.length > PersonName.MAX_LENGTH) {
      return err(
        new InvalidPersonNameError(
          `El nombre y el apellido no pueden superar ${PersonName.MAX_LENGTH} caracteres.`,
        ),
      );
    }

    return ok(new PersonName({ firstName: normalizedFirst, lastName: normalizedLast }));
  }

  /** Colapsa espacios repetidos: "Juan   Carlos" queda "Juan Carlos". */
  private static normalize(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  get firstName(): string {
    return this.props.firstName;
  }

  get lastName(): string {
    return this.props.lastName;
  }

  get fullName(): string {
    return `${this.props.firstName} ${this.props.lastName}`;
  }

  get initials(): string {
    return `${this.props.firstName.charAt(0)}${this.props.lastName.charAt(0)}`.toUpperCase();
  }
}
