import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  PASSWORD_MIN_LENGTH,
  confirmPasswordResetSchema,
  type ConfirmPasswordResetInput,
} from '@kora/contracts';
import styles from './LoginPage.module.css';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import {
  AlertIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
} from '@/shared/components/icons/Icons';
import { api, ApiRequestError } from '@/shared/lib/api-client';

/**
 * Requisitos de `passwordSchema` mostrados como lista que se va marcando
 * mientras se escribe. La validación real sigue siendo la del esquema; esto
 * solo adelanta al usuario qué le falta antes de enviar.
 */
const PASSWORD_RULES = [
  {
    label: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`,
    test: (value: string) => value.length >= PASSWORD_MIN_LENGTH,
  },
  { label: 'Una mayúscula', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'Una minúscula', test: (value: string) => /[a-z]/.test(value) },
  { label: 'Un número', test: (value: string) => /\d/.test(value) },
];

/**
 * Define la contraseña desde el enlace de invitación o de recuperación.
 * Usa el mismo marco que el login: son la misma familia de pantallas.
 */
export function SetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ConfirmPasswordResetInput>({
    resolver: zodResolver(confirmPasswordResetSchema),
    defaultValues: { token, newPassword: '', confirmPassword: '' },
  });

  const newPassword = watch('newPassword');

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    try {
      await api.post('/auth/set-password', values);
      setDone(true);
      // Un momento para leer la confirmación antes de mandar al login.
      setTimeout(() => void navigate('/login', { replace: true }), 2000);
    } catch (error) {
      setServerError(
        error instanceof ApiRequestError
          ? error.message
          : 'No se pudo definir la contraseña. Inténtalo de nuevo.',
      );
    }
  });

  if (!token) {
    return (
      <AuthLayout title="Enlace no válido">
        <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>El enlace no es válido o está incompleto. Solicita uno nuevo a un administrador.</span>
        </div>
        <Link to="/login" className={styles.link}>
          Volver al inicio de sesión
        </Link>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="¡Listo!">
        <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
          <CheckIcon size={18} className={styles.alertIcon} />
          <span>Contraseña definida. Te llevamos al inicio de sesión…</span>
        </div>
      </AuthLayout>
    );
  }

  const eyeToggle = (
    <button
      type="button"
      className={styles.eyeToggle}
      onClick={() => setShowPassword((value) => !value)}
      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
    >
      {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
    </button>
  );

  return (
    <AuthLayout title="Define tu contraseña" tagline="Crea una contraseña segura para entrar a Kora">
      {serverError && (
        <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>{serverError}</span>
        </div>
      )}

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <input type="hidden" {...register('token')} />

        <TextField
          label="Nueva contraseña"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="Tu nueva contraseña"
          errorText={errors.newPassword?.message}
          iconRight={eyeToggle}
          {...register('newPassword')}
        />

        <ul className={styles.rules} aria-label="Requisitos de la contraseña">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(newPassword);
            return (
              <li key={rule.label} className={met ? styles.ruleMet : styles.rule}>
                <CheckIcon size={14} className={styles.ruleIcon} />
                <span>{rule.label}</span>
              </li>
            );
          })}
        </ul>

        <TextField
          label="Repite la contraseña"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="Repite tu nueva contraseña"
          errorText={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <div className={styles.actions}>
          <Button type="submit" loading={isSubmitting} loadingText="Guardando…">
            Guardar contraseña
          </Button>
          <Link to="/login" className={styles.link}>
            Volver al inicio de sesión
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
