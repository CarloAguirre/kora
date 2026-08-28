import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { createDatabaseConnection, type Database, type DatabaseConnection } from '@kora/db';
import { AppConfigService } from '../../../config/app-config.service';
import { ConfigModule } from '@nestjs/config';

/** Token de inyección de la conexión Drizzle. */
export const DATABASE = Symbol('Database');
export const DATABASE_CONNECTION = Symbol('DatabaseConnection');

/**
 * Único punto del sistema que abre conexiones a Postgres.
 *
 * Es global porque todos los repositorios lo necesitan, pero solo los
 * repositorios lo inyectan: ningún caso de uso ni controlador puede pedir
 * `DATABASE`, porque ninguno lo importa. La regla se sostiene por revisión, no
 * por el compilador — pero mantener la conexión detrás de un único token hace
 * trivial detectar una violación con un grep.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    AppConfigService,
    {
      provide: DATABASE_CONNECTION,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): DatabaseConnection =>
        createDatabaseConnection({
          url: config.database.url,
          maxConnections: config.database.poolSize,
          ssl: config.database.ssl,
          debug: !config.isProduction && config.logLevel === 'trace',
        }),
    },
    {
      provide: DATABASE,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): Database => connection.db,
    },
  ],
  exports: [DATABASE, DATABASE_CONNECTION],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection) {}

  /** Cierra el pool al apagar, para que los despliegues no dejen conexiones colgadas. */
  async onApplicationShutdown(): Promise<void> {
    await this.connection.close();
  }
}
