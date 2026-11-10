import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put,
} from '@nestjs/common';
import {
  clientPortalGrantInputSchema, type ClientPortalGrantInput,
} from '@kora/contracts';
import { CurrentUser, type RequestUser } from '../../shared/presentation/decorators/current-user.decorator';
import {
  RequireAnyPermission, RequirePermissions,
} from '../../shared/presentation/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../shared/presentation/pipes/zod-validation.pipe';
import { ClientPortalService } from './client-portal.service';

/** Endpoints EXCLUSIVOS del portal externo; no reutilizan las rutas PMO. */
@Controller('portal')
export class ClientPortalController {
  constructor(private readonly service: ClientPortalService) {}

  @Get('me')
  @RequireAnyPermission('projects:read_own_client', 'tickets:read_own_client')
  me(@CurrentUser() actor: RequestUser) {
    return this.service.me(actor);
  }

  @Get('projects')
  @RequirePermissions('projects:read_own_client')
  projects(@CurrentUser() actor: RequestUser) {
    return this.service.listProjects(actor);
  }

  @Get('projects/:project')
  @RequirePermissions('projects:read_own_client')
  project(@CurrentUser() actor: RequestUser, @Param('project') project: string) {
    return this.service.getProject(actor, project);
  }

  @Post('projects/:project/deliveries/:deliveryId/receive')
  @RequirePermissions('projects:read_own_client')
  @HttpCode(HttpStatus.OK)
  receive(@CurrentUser() actor: RequestUser, @Param('project') project: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string) {
    return this.service.receiveDelivery(actor, project, deliveryId);
  }

  @Get('support')
  @RequirePermissions('tickets:read_own_client')
  support(@CurrentUser() actor: RequestUser) {
    return this.service.listSupportPlans(actor);
  }

  @Get('support/:contract')
  @RequirePermissions('tickets:read_own_client')
  contract(@CurrentUser() actor: RequestUser, @Param('contract') contract: string) {
    return this.service.getSupportPlan(actor, contract);
  }
}

/** Gestión interna de accesos por CONTACTO. No afecta «Vista cliente» PMO. */
@Controller('clients/:clientId/portal-access')
export class ClientPortalAccessController {
  constructor(private readonly service: ClientPortalService) {}

  @Get()
  @RequirePermissions('clients:manage')
  list(@Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.service.listClientContactAccess(clientId);
  }

  @Put('contacts/:contactId')
  @RequirePermissions('clients:manage', 'users:create')
  setAccess(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body(new ZodValidationPipe(clientPortalGrantInputSchema)) body: ClientPortalGrantInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.service.setClientContactAccess(clientId, contactId, body, actor);
  }
}
