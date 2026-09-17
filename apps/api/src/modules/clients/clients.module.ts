import { Module } from '@nestjs/common';
import { ClientsController } from './presentation/clients.controller';

import { CreateClientUseCase } from './application/use-cases/create-client.use-case';
import { UpdateClientUseCase } from './application/use-cases/update-client.use-case';
import { ListClientsUseCase } from './application/use-cases/list-clients.use-case';
import { GetClientUseCase } from './application/use-cases/get-client.use-case';
import { ChangeClientStatusUseCase } from './application/use-cases/change-client-status.use-case';
import { DeleteClientUseCase } from './application/use-cases/delete-client.use-case';
import { ListClientFormOptionsUseCase } from './application/use-cases/list-form-options.use-case';
import { GetClientsStatsUseCase } from './application/use-cases/get-clients-stats.use-case';

import { CLIENT_REPOSITORY } from './domain/repositories/client.repository';
import { CLIENT_CONTACT_REPOSITORY } from './domain/repositories/client-contact.repository';
import { CATALOG_READER } from './application/ports/catalog-reader.port';
import { COMMERCIAL_MANAGER_READER } from './application/ports/commercial-manager-reader.port';
import { CLIENT_CATALOG_LISTER } from './application/ports/client-catalog-lister.port';
import { PROJECT_ACTIVITY_READER } from './application/ports/project-activity-reader.port';

import { DrizzleClientRepository } from './infrastructure/persistence/drizzle-client.repository';
import { DrizzleClientContactRepository } from './infrastructure/persistence/drizzle-client-contact.repository';
import { DrizzleCatalogReader } from './infrastructure/persistence/drizzle-catalog-reader';
import { DrizzleCommercialManagerReader } from './infrastructure/persistence/drizzle-commercial-manager-reader';
import { DrizzleClientCatalogLister } from './infrastructure/persistence/drizzle-client-catalog-lister';
import { ProjectsModuleActivityReader } from './infrastructure/services/projects-module-activity-reader';
import { ProjectsModule } from '../projects/projects.module';

/**
 * Composición del módulo de clientes.
 *
 * `PROJECT_ACTIVITY_READER` ya apunta al `ProjectsModule` real (M3): desactivar
 * un cliente con proyectos activos exige confirmación explícita, como estaba
 * previsto desde que este caso de uso se escribió en M1. Se exportan
 * `CATALOG_READER` y `COMMERCIAL_MANAGER_READER` por si otro módulo futuro
 * (tickets, forecast) necesita resolver un cliente o sus catálogos.
 */
@Module({
  imports: [ProjectsModule],
  controllers: [ClientsController],
  providers: [
    CreateClientUseCase,
    UpdateClientUseCase,
    ListClientsUseCase,
    GetClientUseCase,
    ChangeClientStatusUseCase,
    DeleteClientUseCase,
    ListClientFormOptionsUseCase,
    GetClientsStatsUseCase,

    { provide: CLIENT_REPOSITORY, useClass: DrizzleClientRepository },
    { provide: CLIENT_CONTACT_REPOSITORY, useClass: DrizzleClientContactRepository },
    { provide: CATALOG_READER, useClass: DrizzleCatalogReader },
    { provide: COMMERCIAL_MANAGER_READER, useClass: DrizzleCommercialManagerReader },
    { provide: CLIENT_CATALOG_LISTER, useClass: DrizzleClientCatalogLister },
    { provide: PROJECT_ACTIVITY_READER, useClass: ProjectsModuleActivityReader },
  ],
  exports: [CLIENT_REPOSITORY, CLIENT_CONTACT_REPOSITORY, CATALOG_READER, COMMERCIAL_MANAGER_READER],
})
export class ClientsModule {}
