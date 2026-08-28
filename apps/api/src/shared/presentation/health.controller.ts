import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from './decorators/public.decorator';
import { HEALTH_PROBES, type HealthProbe } from '../application/ports/health-probe.port';

/**
 * Sondas de salud para el orquestador y el balanceador.
 *
 * `/health` responde si el proceso está vivo; `/health/ready` además comprueba
 * sus dependencias. Separarlas importa: un contenedor que no puede hablar con
 * Postgres no debe recibir tráfico, pero tampoco debe reiniciarse en bucle.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(HEALTH_PROBES) private readonly probes: readonly HealthProbe[]) {}

  @Public()
  @Get()
  live(): { status: 'ok'; uptime: number } {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ok' | 'degraded'; dependencies: Record<string, boolean> }> {
    // Todas las sondas a la vez: el informe tarda lo que la más lenta.
    const results = await Promise.all(
      this.probes.map(async (probe) => [probe.name, await probe.check()] as const),
    );

    const dependencies = Object.fromEntries(results);
    const healthy = results.every(([, ok]) => ok);

    return { status: healthy ? 'ok' : 'degraded', dependencies };
  }
}
