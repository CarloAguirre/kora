import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { TicketsModule } from '../tickets/tickets.module';
import { UsersModule } from '../users/users.module';
import { ClientPortalAccessController, ClientPortalController } from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';
import { ClientPortalPdfController } from './client-portal-pdf.controller';
import { ClientPortalPdfService } from './client-portal-pdf.service';

/**
 * Portal externo separado de la Vista Cliente interna.
 * Los permisos de consulta son propios del perfil cliente y el servicio
 * valida cada vínculo contacto/empresa/proyecto/contrato contra la BD.
 */
@Module({
  imports: [ProjectsModule, TicketsModule, UsersModule],
  controllers: [ClientPortalController, ClientPortalAccessController, ClientPortalPdfController],
  providers: [ClientPortalService, ClientPortalPdfService],
})
export class ClientPortalModule {}
