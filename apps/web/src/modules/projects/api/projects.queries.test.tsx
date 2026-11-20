import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import type { ProjectDetail } from '@kora/contracts';
import { projectKeys, projectsApi } from './projects.api';
import { useChangeProjectStatus, useCreateProjectModuleSegment, useProjectDetail, useUpdateProject } from './projects.queries';

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
    expect(readDetail.mock.calls.length).toBeGreaterThanOrEqual(3);
    await waitFor(() => {
      expect(result.current.detail.data?.startDate).toBe('2026-11-04');
      expect(result.current.detail.data?.status).toBe('active');
      expect(result.current.detail.data?.modules[0]?.segments).toMatchObject([{
        id: 'segment-generated', estimatedHours: 120,
      }]);
    });
  });
});


describe('Crear bloque → formulario de tarea sin refrescar', () => {
  it('no resuelve la mutación hasta que el nuevo bloque esté en el detalle activo', async () => {
    const projectId = '11111111-1111-4111-8111-111111111121';
    let created = false;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });

    const read = vi.spyOn(projectsApi, 'detail').mockImplementation(async () => {
      if (created) await refreshGate;
      return {
        id: projectId, modules: [{
          id: 'module-1', segments: created ? [{
            id: 'segment-1', teamId: 'team-1',
            startDate: '2026-11-04', endDate: '2026-11-20', estimatedHours: 20,
          }] : [],
        }],
      } as unknown as ProjectDetail;
    });
    vi.spyOn(projectsApi, 'createModuleSegment').mockImplementation(async () => {
      created = true;
      return { id: 'segment-1' };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => ({
      detail: useProjectDetail(projectId),
      create: useCreateProjectModuleSegment(),
    }), { wrapper });
    await waitFor(() => expect(result.current.detail.data?.modules[0]?.segments).toHaveLength(0));

    let settled = false;
    let inFlight!: Promise<unknown>;
    await act(async () => {
      inFlight = result.current.create.mutateAsync({
        projectId, moduleId: 'module-1',
        input: {
          name: 'Bloque nuevo', teamId: 'team-1',
          startDate: '2026-11-04', endDate: '2026-11-20', estimatedHours: 20,
        },
      }).then(() => { settled = true; });
      // Aún no se libera el GET, por lo que la promesa NO debería resolver.
      await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(1));
      expect(settled).toBe(false);
    });
    await act(async () => {
      releaseRefresh();
      await inFlight;
    });
    expect(settled).toBe(true);
    // La promesa de la mutación garantiza el refetch y la caché activa;
    // el commit del render de React puede llegar un tick después.
    expect(client.getQueryData<ProjectDetail>(projectKeys.detail(projectId))?.modules[0]?.segments)
      .toMatchObject([{ id: 'segment-1', estimatedHours: 20 }]);
    await waitFor(() => expect(result.current.detail.data?.modules[0]?.segments).toMatchObject([{
      id: 'segment-1', estimatedHours: 20,
    }]));
  });
});
