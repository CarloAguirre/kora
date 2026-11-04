import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import type { ProjectDetail } from '@kora/contracts';
import { projectsApi } from './projects.api';
import { useChangeProjectStatus, useProjectDetail, useUpdateProject } from './projects.queries';

afterEach(() => vi.restoreAllMocks());

describe('Actualización automática del Roadmap al iniciar el proyecto', () => {
  it('actualiza el detalle con bloques materializados tras guardar fecha e iniciar, sin recarga', async () => {
    const projectId = '11111111-1111-4111-8111-111111111121';
    let startDate: string | null = null;
    let status: 'draft' | 'active' = 'draft';

    const readDetail = vi.spyOn(projectsApi, 'detail').mockImplementation(async () => ({
      id: projectId, slug: 'pruebas-carlo', status, startDate,
      modules: [{
        id: 'module-1', name: 'S1 · Diseño', estimatedHours: 160,
        segments: status === 'active'
          ? [{
              id: 'segment-generated', teamId: 'team-1', name: 'Diseño · UX',
              startDate: '2026-11-04', endDate: '2026-12-01', estimatedHours: 120,
            }]
          : [],
      }],
    } as unknown as ProjectDetail));
    const saveProject = vi.spyOn(projectsApi, 'update').mockImplementation(async (_id, input) => {
      startDate = input.startDate ?? null;
    });
    const startProject = vi.spyOn(projectsApi, 'changeStatus').mockImplementation(async () => {
      status = 'active';
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => ({
      detail: useProjectDetail('pruebas-carlo'),
      update: useUpdateProject(),
      activation: useChangeProjectStatus(),
    }), { wrapper });

    await waitFor(() => expect(result.current.detail.data?.status).toBe('draft'));
    expect(result.current.detail.data?.modules[0]?.segments).toHaveLength(0);

    await act(async () => {
      // El diálogo edita primero la fecha y después el estado del proyecto.
      await result.current.update.mutateAsync({
        projectId, input: { startDate: '2026-11-04' },
      });
      await result.current.activation.mutateAsync({
        projectId, input: { status: 'active', reason: 'Contrato firmado' },
      });
    });

    // mutateAsync no termina hasta que React Query refresca la ficha activa.
    expect(saveProject).toHaveBeenCalledOnce();
    expect(startProject).toHaveBeenCalledOnce();
    expect(readDetail).toHaveBeenCalledTimes(3);
    expect(result.current.detail.data?.startDate).toBe('2026-11-04');
    expect(result.current.detail.data?.status).toBe('active');
    expect(result.current.detail.data?.modules[0]?.segments).toMatchObject([{
      id: 'segment-generated', estimatedHours: 120,
    }]);
  });
});
