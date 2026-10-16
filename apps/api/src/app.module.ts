import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CLOCK, ID_GENERATOR, LOGGER, UNIT_OF_WORK, type Logger } from '@kora/core';
import { Resend } from 'resend';

import { validateEnv } from './config/env.schema';
import { AppConfigService } from './config/app-config.service';

import { DatabaseModule } from './shared/infrastructure/database/database.module';
import { DrizzleUnitOfWork } from './shared/infrastructure/database/unit-of-work';
import { SystemClock } from './shared/infrastructure/time/system-clock';
import { UuidGenerator } from './shared/infrastructure/crypto/uuid-generator';
import { PinoLogger } from './shared/infrastructure/logging/pino-logger';
import { Argon2PasswordHasher } from './shared/infrastructure/crypto/argon2-password-hasher';
import { JwtAccessTokenService } from './shared/infrastructure/crypto/jwt-access-token.service';
import { RandomOpaqueTokenGenerator } from './shared/infrastructure/crypto/random-opaque-token.generator';
import { DrizzleAuditRecorder } from './shared/infrastructure/audit/drizzle-audit-recorder';
import { GoogleOAuthClientService } from './shared/infrastructure/auth/google-oauth-client.service';
import { DrizzleAuditReader } from './shared/infrastructure/audit/drizzle-audit-reader';
import { LogNotificationSender } from './shared/infrastructure/notifications/log-notification.sender';
import { ResendNotificationSender } from './shared/infrastructure/notifications/resend-notification.sender';
import { DatabaseHealthProbe } from './shared/infrastructure/database/database-health.probe';

import { PASSWORD_HASHER } from './shared/application/ports/password-hasher.port';
import {
  ACCESS_TOKEN_SERVICE,
  OPAQUE_TOKEN_GENERATOR,
} from './shared/application/ports/token.port';
import { AUDIT_RECORDER } from './shared/application/ports/audit-recorder.port';
import { GOOGLE_OAUTH_CLIENT } from './shared/application/ports/google-oauth-client.port';
import { AUDIT_READER } from './shared/application/ports/audit-reader.port';
import { NOTIFICATION_SENDER } from './shared/application/ports/notification.port';
import { HEALTH_PROBES } from './shared/application/ports/health-probe.port';

import { UsersModule } from './modules/users/users.module';
import { ClientsModule } from './modules/clients/clients.module';
import { TeamsModule } from './modules/teams/teams.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { HoursModule } from './modules/hours/hours.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { ForecastModule } from './modules/forecast/forecast.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { HealthController } from './shared/presentation/health.controller';
import { JwtModule } from '@nestjs/jwt';

/**
 * Adaptadores transversales.
 *
 * Global porque literalmente todo módulo necesita reloj, log y transacciones.
 * Todo lo que aquí se registra es un ADAPTADOR: una implementación concreta
 * atada a la abstracción que declara `@kora/core` o la capa compartida. Los
 * módulos de negocio no registran ninguno de éstos, solo los consumen.
 */
@Global()
@Module({
  imports: [DatabaseModule, JwtModule.register({})],
  providers: [
    AppConfigService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidGenerator },
    { provide: LOGGER, useClass: PinoLogger },
    { provide: UNIT_OF_WORK, useClass: DrizzleUnitOfWork },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: ACCESS_TOKEN_SERVICE, useClass: JwtAccessTokenService },
    { provide: OPAQUE_TOKEN_GENERATOR, useClass: RandomOpaqueTokenGenerator },
    { provide: AUDIT_RECORDER, useClass: DrizzleAuditRecorder },
    { provide: AUDIT_READER, useClass: DrizzleAuditReader },
    {
      // Con RESEND_API_KEY se envía de verdad; sin ella, al log (solo fuera de
      // producción: env.schema exige la clave allí).
      provide: NOTIFICATION_SENDER,
      inject: [AppConfigService, LOGGER],
      useFactory: (config: AppConfigService, logger: Logger) => {
        const mail = config.mail;
        return mail.enabled
          ? new ResendNotificationSender(new Resend(mail.resendApiKey).emails, mail, logger)
          : new LogNotificationSender(logger, mail.webAppUrl);
      },
    },
    { provide: GOOGLE_OAUTH_CLIENT, useClass: GoogleOAuthClientService },

    // Las sondas de salud se registran como una lista: añadir una dependencia
    // que vigilar es añadir una clase aquí, sin tocar el controlador.
    DatabaseHealthProbe,
    {
      provide: HEALTH_PROBES,
      inject: [DatabaseHealthProbe],
      useFactory: (database: DatabaseHealthProbe) => [database],
    },
  ],
  exports: [
    AppConfigService,
    CLOCK,
    ID_GENERATOR,
    LOGGER,
    UNIT_OF_WORK,
    PASSWORD_HASHER,
    ACCESS_TOKEN_SERVICE,
    OPAQUE_TOKEN_GENERATOR,
    AUDIT_RECORDER,
    AUDIT_READER,
    NOTIFICATION_SENDER,
    GOOGLE_OAUTH_CLIENT,
    HEALTH_PROBES,
  ],
})
export class SharedModule {}

/**
 * Raíz de la aplicación.
 *
 * Lo único que hace es componer módulos. Cada módulo de negocio que se añada en
 * el futuro —proyectos, tickets, horas, forecast— entra con una línea aquí y no
 * obliga a tocar nada más: el sistema está abierto a la extensión y cerrado a
 * la modificación en su punto más visible.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),
    SharedModule,
    SessionsModule,
    UsersModule,
    AuthModule,
    TeamsModule,
    ProjectsModule,
    ClientsModule,
    HoursModule,
    TicketsModule,
    ForecastModule,
    DashboardModule,
    AdminModule,
    RemindersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
