import { buildPage, type Page, type PageRequest, type SortRequest } from '@kora/core';
import type { HourEntry } from '../../modules/hours/domain/entities/hour-entry.entity';
import type {
  HourEntryFilters,
  HourEntryListItem,
  HourEntryRepository,
  HourEntrySortableField,
} from '../../modules/hours/domain/repositories/hour-entry.repository';

/**
 * Repositorio en memoria para los tests de casos de uso de `hours` que solo
 * necesitan `search()` — los reportes de Administración (Capacity,
 * disponibilidad) leen exclusivamente la proyección `HourEntryListItem`, no
 * el agregado `HourEntry`. El resto de métodos no se ejercita desde esos
 * casos de uso y no tiene sentido simularlos aquí.
 */
export class InMemoryHourEntryRepository implements HourEntryRepository {
  private items: HourEntryListItem[] = [];

  seed(...items: HourEntryListItem[]): this {
    this.items.push(...items);
    return this;
  }

  async findById(): Promise<HourEntry | null> {
    throw new Error('InMemoryHourEntryRepository.findById no está implementado.');
  }

  async findByLegacyId(): Promise<HourEntry | null> {
    throw new Error('InMemoryHourEntryRepository.findByLegacyId no está implementado.');
  }

  async search(
    filters: HourEntryFilters,
    page: PageRequest,
    sort: SortRequest<HourEntrySortableField>,
  ): Promise<Page<HourEntryListItem>> {
    const matches = this.items
      .filter((item) => (filters.projectId ? item.projectId === filters.projectId : true))
      .filter((item) => (filters.status ? item.status === filters.status : true))
      .filter((item) => (filters.dateFrom ? item.date >= filters.dateFrom : true))
      .filter((item) => (filters.dateTo ? item.date <= filters.dateTo : true))
      .filter((item) => (filters.visibleToUserIds ? filters.visibleToUserIds.includes(item.userId) : true))
      .filter((item) =>
        filters.search
          ? item.userFullName.toLowerCase().includes(filters.search.toLowerCase())
          : true,
      )
      .sort((a, b) => {
        const direction = sort.direction === 'asc' ? 1 : -1;
        const av = a[sort.field];
        const bv = b[sort.field];
        if (av instanceof Date && bv instanceof Date) return (av.getTime() - bv.getTime()) * direction;
        return String(av).localeCompare(String(bv)) * direction;
      });

    const start = (page.page - 1) * page.pageSize;
    return buildPage(matches.slice(start, start + page.pageSize), matches.length, page);
  }

  async save(): Promise<void> {
    throw new Error('InMemoryHourEntryRepository.save no está implementado.');
  }

  async delete(): Promise<void> {
    throw new Error('InMemoryHourEntryRepository.delete no está implementado.');
  }

  async sumApprovedHoursForProject(projectId: string): Promise<number> {
    return this.items
      .filter((item) => item.projectId === projectId && item.status === 'approved')
      .reduce((sum, item) => sum + item.hours, 0);
  }
}
