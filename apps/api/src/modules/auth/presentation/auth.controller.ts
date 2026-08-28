import { randomBytes } from 'node:crypto';
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  AUTH_ERROR_CODES,
  changePasswordSchema,
  confirmPasswordResetSchema,
  loginSchema,
  requestPasswordResetSchema,
  type AuthenticatedUser,
  type ChangePasswordInput,
  type ConfirmPasswordResetInput,
  type LoginInput,
  type LoginResponse,
  type RefreshResponse,
  type RequestPasswordResetInput,
} from '@kora/contracts';
import { UnauthorizedError } from '@kora/core';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { Public } from '../../../shared/presentation/decorators/public.decorator';
import {
  CurrentUser,
  type RequestUser,
} from '../../../shared/presentation/decorators/current-user.decorator';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { GoogleLoginUseCase } from '../application/use-cases/google-login.use-case';
import { RefreshSessionUseCase } from '../application/use-cases/refresh-session.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { ChangePasswordUseCase } from '../application/use-cases/change-password.use-case';
import { SetPasswordUseCase } from '../application/use-cases/set-password.use-case';
import { RequestPasswordResetUseCase } from '../application/use-cases/request-password-reset.use-case';
import { GetCurrentUserUseCase } from '../application/use-cases/get-current-user.use-case';
import { AppConfigService } from '../../../config/app-config.service';
import {
  GOOGLE_OAUTH_CLIENT,
  type GoogleOAuthClient,
} from '../../../shared/application/ports/google-oauth-client.port';

const REFRESH_COOKIE = 'kora_refresh';
const GOOGLE_STATE_COOKIE = 'kora_google_state';

/**
 * Endpoints de autenticación.
 *
 * El refresh token viaja en una cookie `httpOnly`, nunca en el cuerpo de la
 * respuesta ni en `localStorage`: así un XSS no puede leerlo. El access token,
 * en cambio, sí va en el cuerpo y vive en memoria del cliente — dura quince
 * minutos y no se persiste en ningún sitio. Es el reparto que da un XSS
 * limitado en vez de un robo de sesión permanente, que era el riesgo de la v1
 * al guardar la sesión de Supabase en `localStorage`.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly googleLogin: GoogleLoginUseCase,
    private readonly refresh: RefreshSessionUseCase,
    private readonly logout: LogoutUseCase,
    private readonly changePassword: ChangePasswordUseCase,
    private readonly setPassword: SetPasswordUseCase,
    private readonly requestReset: RequestPasswordResetUseCase,
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly config: AppConfigService,
    @Inject(GOOGLE_OAUTH_CLIENT) private readonly googleClient: GoogleOAuthClient,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async signIn(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    const outcome = unwrapOrThrow(
      await this.login.execute({
        credentials: body,
        ipAddress: clientIp(request),
        userAgent: request.headers['user-agent'] ?? null,
        requestId: request.id ?? null,
      }),
    );

    this.setRefreshCookie(reply, outcome.refreshToken, outcome.refreshExpiresAt);

    return {
      user: outcome.user,
      tokens: { accessToken: outcome.accessToken, expiresIn: outcome.expiresIn, tokenType: 'Bearer' },
    };
  }

  /**
   * Arranca el flujo OAuth: redirige a Google con un `state` aleatorio que se
   * guarda también en una cookie de corta vida. `google/callback` compara
   * ambos — es la protección CSRF estándar de un flujo de redirección donde no
   * hay forma de usar un token en el cuerpo de la petición.
   */
  @Public()
  @Get('google')
  async googleStart(@Res({ passthrough: false }) reply: FastifyReply): Promise<void> {
    if (!this.config.google.enabled) {
      void reply.redirect(`/login?google_error=${AUTH_ERROR_CODES.GOOGLE_NOT_CONFIGURED}`);
      return;
    }

    const state = randomBytes(16).toString('hex');
    void reply.setCookie(GOOGLE_STATE_COOKIE, state, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 300,
    });

    void reply.redirect(this.googleClient.buildAuthorizationUrl(state));
  }

  @Public()
  @Get('google/callback')
  async googleCallback(
    @Req() request: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const query = request.query as Record<string, string | undefined>;
    const stateCookie = readCookie(request, GOOGLE_STATE_COOKIE);
    void reply.clearCookie(GOOGLE_STATE_COOKIE, { path: '/' });

    if (!stateCookie || !query.state || stateCookie !== query.state || !query.code) {
      void reply.redirect(`/login?google_error=${AUTH_ERROR_CODES.GOOGLE_STATE_MISMATCH}`);
      return;
    }

    const result = await this.googleLogin.execute({
      code: query.code,
      ipAddress: clientIp(request),
      userAgent: request.headers['user-agent'] ?? null,
      requestId: request.id ?? null,
    });

    if (result.isErr()) {
      void reply.redirect(`/login?google_error=${result.error.code}`);
      return;
    }

    this.setRefreshCookie(reply, result.value.refreshToken, result.value.refreshExpiresAt);
    void reply.redirect('/');
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async renew(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<RefreshResponse> {
    const token = readCookie(request, REFRESH_COOKIE);
    if (!token) {
      throw new UnauthorizedError('No hay sesión activa.', 'AUTH_INVALID_REFRESH_TOKEN');
    }

    const outcome = unwrapOrThrow(
      await this.refresh.execute({
        refreshToken: token,
        ipAddress: clientIp(request),
        userAgent: request.headers['user-agent'] ?? null,
      }),
    );

    this.setRefreshCookie(reply, outcome.refreshToken, outcome.refreshExpiresAt);

    return {
      tokens: { accessToken: outcome.accessToken, expiresIn: outcome.expiresIn, tokenType: 'Bearer' },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(
    @CurrentUser() user: RequestUser,
    @Body() body: { allDevices?: boolean } | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.logout.execute({
      userId: user.id,
      sessionId: user.sessionId,
      email: user.email,
      allDevices: body?.allDevices === true,
    });

    void reply.clearCookie(REFRESH_COOKIE, { path: '/' });
  }

  @Get('me')
  async me(@CurrentUser() user: RequestUser): Promise<AuthenticatedUser> {
    return unwrapOrThrow(await this.currentUser.execute({ userId: user.id }));
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updatePassword(
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    unwrapOrThrow(
      await this.changePassword.execute({
        userId: user.id,
        currentSessionId: user.sessionId,
        data: body,
        ipAddress: clientIp(request),
        userAgent: request.headers['user-agent'] ?? null,
      }),
    );

    void reply.clearCookie(REFRESH_COOKIE, { path: '/' });
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body(new ZodValidationPipe(requestPasswordResetSchema)) body: RequestPasswordResetInput,
    @Req() request: FastifyRequest,
  ): Promise<{ ok: true }> {
    await this.requestReset.execute({ data: body, ipAddress: clientIp(request) });
    // Respuesta idéntica exista o no la cuenta: ver el caso de uso.
    return { ok: true };
  }

  @Public()
  @Post('set-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async definePassword(
    @Body(new ZodValidationPipe(confirmPasswordResetSchema)) body: ConfirmPasswordResetInput,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    unwrapOrThrow(
      await this.setPassword.execute({
        data: body,
        ipAddress: clientIp(request),
        userAgent: request.headers['user-agent'] ?? null,
      }),
    );
  }

  private setRefreshCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
    void reply.setCookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.isProduction,
      // `strict` rompería la vuelta desde un enlace externo; `lax` protege
      // igual frente a CSRF en peticiones POST de terceros.
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
  }
}

function readCookie(request: FastifyRequest, name: string): string | null {
  const cookies = (request as FastifyRequest & { cookies?: Record<string, string | undefined> })
    .cookies;
  return cookies?.[name] ?? null;
}

function clientIp(request: FastifyRequest): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }
  return request.ip ?? null;
}
