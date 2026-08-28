import { Controller, Get, Query } from '@nestjs/common';
import { listHolidaysQuerySchema, type Holiday, type ListHolidaysQuery } from '@kora/contracts';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { DrizzleHolidayReader } from '../infrastructure/persistence/drizzle-holiday-reader';

/**
 * Sin `@RequirePermissions`: cualquier usuario autenticado necesita saber qué
 * días son feriados antes de registrar horas (alerta de fin de
 * semana/feriado en el modal de "Registrar horas").
 */
@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidays: DrizzleHolidayReader) {}

  @Get()
  async list(@Query(new ZodValidationPipe(listHolidaysQuerySchema)) query: ListHolidaysQuery): Promise<Holiday[]> {
    return this.holidays.list(query.dateFrom, query.dateTo);
  }
}
