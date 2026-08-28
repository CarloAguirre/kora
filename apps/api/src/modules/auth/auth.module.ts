import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './presentation/auth.controller';

import { LoginUseCase } from './application/use-cases/login.use-case';
import { GoogleLoginUseCase } from './application/use-cases/google-login.use-case';
import { SessionIssuerService } from './application/services/session-issuer.service';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { SetPasswordUseCase } from './application/use-cases/set-password.use-case';
import { RequestPasswordResetUseCase } from './application/use-cases/request-password-reset.use-case';
import { GetCurrentUserUseCase } from './application/use-cases/get-current-user.use-case';

import { LEADER_PROFILE_RESOLVER } from '../users/application/ports/leader-profile-resolver.port';
import { AssignmentLeaderProfileResolver } from '../users/infrastructure/services/assignment-leader-profile.resolver';

/**
 * Composición del módulo de autenticación.
 *
 * Reúne los casos de uso del ciclo de vida de la sesión. El repositorio de
 * sesiones lo aporta `SessionsModule` (global), y los datos de usuario los
 * aporta `UsersModule` a través de sus puertos exportados: este módulo no toca
 * la base directamente en ningún punto.
 */
@Module({
  imports: [
    UsersModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    SessionIssuerService,
    LoginUseCase,
    GoogleLoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    ChangePasswordUseCase,
    SetPasswordUseCase,
    RequestPasswordResetUseCase,
    GetCurrentUserUseCase,

    { provide: LEADER_PROFILE_RESOLVER, useClass: AssignmentLeaderProfileResolver },
  ],
})
export class AuthModule {}
