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
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { AlertIcon, CheckIcon } from '@/shared/components/icons/Icons';
import { api, ApiRequestError } from '@/shared/lib/api-client';

/**
 * Define la contraseña desde el enlace de invitación o de recuperación.
 *
 * Reutiliza los estilos de la pantalla de acceso: son la misma familia de
 * pantallas y deben verse igual. Compartir el CSS Module entre dos páginas
 * hermanas es legítimo; el aislamiento que aportan los módulos sigue
 * garantizando que nadie más las pise.
 */
export function SetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConfirmPasswordResetInput>({
    resolver: zodResolver(confirmPasswordResetSchema),
    defaultValues: { token, newPassword: '', confirmPassword: '' },
  });

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
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.brand}>
            <span className={styles.logo}>KORA</span>
          </div>
          <div className={styles.alert} role="alert">
            <AlertIcon size={18} className={styles.alertIcon} />
            <span>El enlace no es válido. Solicita uno nuevo a un administrador.</span>
          </div>
          <Link to="/login" className={styles.link}>
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.logo}>KORA</span>
          <span className={styles.tagline}>Define tu contraseña</span>
        </div>

        {done ? (
          <div className={styles.alert} style={{ background: 'var(--kora-success-surface)', color: 'var(--kora-success-text)' }} role="status">
            <CheckIcon size={18} className={styles.alertIcon} />
            <span>Contraseña definida. Te llevamos al inicio de sesión…</span>
          </div>
        ) : (
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            {serverError && (
              <div className={styles.alert} role="alert">
                <AlertIcon size={18} className={styles.alertIcon} />
                <span>{serverError}</span>
              </div>
            )}

            <input type="hidden" {...register('token')} />

            <TextField
              label="Nueva contraseña"
              type="password"
              autoComplete="new-password"
              helperText={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres, con mayúscula, minúscula y número.`}
              errorText={errors.newPassword?.message}
              {...register('newPassword')}
            />

            <TextField
              label="Repite la contraseña"
              type="password"
              autoComplete="new-password"
              errorText={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <div className={styles.actions}>
              <Button type="submit" loading={isSubmitting} loadingText="Guardando…">
                Guardar contraseña
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
