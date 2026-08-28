import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { LOGGER, type Logger } from '@kora/core';

import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { AllExceptionsFilter } from './shared/presentation/filters/all-exceptions.filter';
import { JwtAuthGuard } from './shared/presentation/guards/jwt-auth.guard';
import { PermissionsGuard } from './shared/presentation/guards/permissions.guard';
import { ACCESS_TOKEN_SERVICE } from './shared/application/ports/token.port';

/**
 * Arranque del servidor.
 *
 * Se usa Fastify en lugar de Express por rendimiento y porque su validación de
 * esquemas y su manejo de cookies encajan mejor con el resto del diseño. Nest
 * abstrae el adaptador, así que la elección no se filtra a los controladores.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // Identificador de petición propagado a logs y auditoría: permite
      // reconstruir todo lo que provocó una llamada concreta.
      genReqId: () => crypto.randomUUID(),
      trustProxy: true,
    }),
    { bufferLogs: true },
  );

  const config = app.get(AppConfigService);
  const logger = app.get<Logger>(LOGGER);

  await app.register(fastifyCookie);
  await app.register(fastifyHelmet, {
    // La API no sirve HTML: la CSP la aplica el front en su propio despliegue.
    contentSecurityPolicy: false,
  });
  // Solo lo usa el importador de datos legacy por archivo (`admin/legacy-import`)
  // — el dump de hoy pesa ~8 MB, el límite deja margen holgado para que crezca.
  await app.register(fastifyMultipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  app.setGlobalPrefix(config.http.prefix);
  app.enableVersioning();

  app.enableCors({
    origin: config.http.corsOrigins.length > 0 ? [...config.http.corsOrigins] : true,
    // Imprescindible para que el navegador envíe la cookie del refresh token.
    credentials: true,
  });

  app.useGlobalFilters(new AllExceptionsFilter(logger));

  // Guards globales: toda ruta nace autenticada y con sus permisos exigidos.
  // Abrirla requiere `@Public()` explícito — el descuido protege de más, nunca
  // de menos.
  const reflector = app.get(Reflector);
  app.useGlobalGuards(
    new JwtAuthGuard(reflector, app.get(ACCESS_TOKEN_SERVICE)),
    new PermissionsGuard(reflector),
  );

  app.enableShutdownHooks();

  await app.listen({ port: config.http.port, host: '0.0.0.0' });

  logger.info('API de Kora escuchando', {
    port: config.http.port,
    prefix: config.http.prefix,
    env: config.isProduction ? 'production' : 'development',
  });
}

bootstrap().catch((error: unknown) => {
  console.error('No se pudo iniciar la API:', error);
  process.exit(1);
});
