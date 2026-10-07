import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { loginSchema, type LoginInput } from '@kora/contracts';
import styles from './LoginPage.module.css';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { AlertIcon, EyeIcon, EyeOffIcon, GoogleIcon } from '@/shared/components/icons/Icons';
import { useAuth } from '../hooks/useAuth';
import { ApiRequestError } from '@/shared/lib/api-client';

/**
 * Mensajes para `?google_error=<código>`, el único canal por el que el
 * callback de `GET /api/auth/google/callback` puede avisar de un fallo: es
 * una redirección de navegador completa, no una respuesta JSON con `message`.
 */
const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  AUTH_GOOGLE_NOT_CONFIGURED: 'El acceso con Google no está disponible todavía.',
  AUTH_GOOGLE_STATE_MISMATCH: 'La solicitud de Google expiró o no es válida. Intenta de nuevo.',
  AUTH_GOOGLE_LOGIN_FAILED: 'No se pudo completar el inicio de sesión con Google. Intenta de nuevo.',
  AUTH_GOOGLE_EMAIL_NOT_VERIFIED: 'Tu cuenta de Google no tiene el correo verificado.',
  AUTH_GOOGLE_ACCOUNT_NOT_FOUND:
    'No existe una cuenta de Kora asociada a ese correo. Contacta a un administrador.',
  AUTH_EMAIL_DOMAIN_NOT_ALLOWED: 'Este correo no pertenece a un dominio autorizado.',
  AUTH_ACCOUNT_BLOCKED: 'Tu cuenta está bloqueada. Contacta a un administrador.',
  AUTH_ACCOUNT_DISABLED: 'Tu cuenta está deshabilitada. Contacta a un administrador.',
};

const DEFAULT_GOOGLE_ERROR = 'No se pudo iniciar sesión con Google. Intenta de nuevo.';

/**
 * Pantalla de acceso.
 *
 * Valida con el MISMO esquema que usa el servidor (`loginSchema` de
 * `@kora/contracts`), así que el formulario no puede aceptar algo que la API
 * vaya a rechazar por formato. Los errores de credenciales, en cambio, solo los
 * conoce el servidor y se muestran tal cual llegan.
 */
export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(
    () => {
      const code = searchParams.get('google_error');
      return code ? (GOOGLE_ERROR_MESSAGES[code] ?? DEFAULT_GOOGLE_ERROR) : null;
    },
  );
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    try {
      await signIn(values);
      // Si llegó aquí por un enlace protegido, se le devuelve a donde iba.
      const target = (location.state as { from?: string } | null)?.from ?? '/dashboard';
      void navigate(target, { replace: true });
    } catch (error) {
      setServerError(
        error instanceof ApiRequestError
          ? error.message
          : 'No se pudo conectar con el servidor. Revisa tu conexión.',
      );
    }
  });

  return (
    <AuthLayout title="¡Bienvenidos!" tagline="Gestión de horas y proyectos">
      {serverError && (
        <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>{serverError}</span>
        </div>
      )}

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <TextField
          label="Correo electrónico"
          type="email"
          autoComplete="username"
          placeholder="nombre@kabeli.cl"
          errorText={errors.email?.message}
          {...register('email')}
        />

        <TextField
          label="Contraseña"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="Tu contraseña"
          errorText={errors.password?.message}
          iconRight={
            <button
              type="button"
              className={styles.eyeToggle}
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
            </button>
          }
          {...register('password')}
        />

        <div className={styles.actions}>
          <Button type="submit" loading={isSubmitting} loadingText="Entrando…">
            Iniciar sesión
          </Button>

          <a href="/api/auth/google" className={styles.googleButton}>
            <GoogleIcon size={18} />
            Continuar con Google
          </a>

          <Link to="/recuperar" className={styles.link}>
            Olvidé mi contraseña
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
