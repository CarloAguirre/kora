import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { requestPasswordResetSchema, type RequestPasswordResetInput } from '@kora/contracts';
import styles from './LoginPage.module.css';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { CheckIcon } from '@/shared/components/icons/Icons';
import { api } from '@/shared/lib/api-client';

/**
 * Solicitud de recuperación de contraseña.
 *
 * Muestra el mismo mensaje exista o no la cuenta, en coherencia con lo que hace
 * el servidor: si aquí se dijera "ese correo no está registrado", la protección
 * del backend contra el sondeo de correos no serviría de nada.
 */
export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestPasswordResetInput>({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api.post('/auth/forgot-password', values);
    } catch {
      // Incluso ante un fallo se muestra el mismo mensaje: distinguirlos
      // permitiría deducir qué correos existen.
    } finally {
      setSent(true);
    }
  });

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.logo}>KORA</span>
          <span className={styles.tagline}>Recuperar acceso</span>
        </div>

        {sent ? (
          <>
            <div
              className={styles.alert}
              style={{ background: 'var(--kora-success-surface)', color: 'var(--kora-success-text)' }}
              role="status"
            >
              <CheckIcon size={18} className={styles.alertIcon} />
              <span>
                Si el correo corresponde a una cuenta activa, recibirás un enlace para definir una
                contraseña nueva. Caduca en 2 horas.
              </span>
            </div>
            <Link to="/login" className={styles.link}>
              Volver al inicio de sesión
            </Link>
          </>
        ) : (
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <TextField
              label="Correo electrónico"
              type="email"
              autoComplete="username"
              placeholder="nombre@kabeli.cl"
              errorText={errors.email?.message}
              {...register('email')}
            />

            <div className={styles.actions}>
              <Button type="submit" loading={isSubmitting} loadingText="Enviando…">
                Enviar enlace
              </Button>
              <Link to="/login" className={styles.link}>
                Volver al inicio de sesión
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
