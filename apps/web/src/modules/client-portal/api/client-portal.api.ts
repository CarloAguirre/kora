import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClientPortalGrantInput, ProjectModuleTaskScope } from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

/** DTO explícito, nunca reutiliza las respuestas internas /projects o /tickets. */
export interface PortalCompany {
  name: string;
  contactName: string;
  contactPosition: string;
  logoUrl: string | null;
}
export interface PortalProject {
  id: string; slug: string | null; name: string; status: string;
  salesStage: string | null; phase: string | null;
  startDate: string | null; endDate: string | null;
  leader: { fullName: string } | null;
  progress: { actual: number | null; expected: number | null };
}
export interface PortalDelivery {
  id: string; name: string | null; teamName: string | null;
  estimatedDate: string; status: 'planned' | 'approved';
}
export interface PortalProjectDetail extends PortalProject {
  client: { id: string; companyName: string } | null;
  primaryContact: { name: string; position: string | null } | null;
  commercialManager: { fullName: string } | null;
  soldHours: number; usedHours: number;
  usedHoursUpdatedAt: string | null;
  leaderLastActivityAt: string | null;
  contractCurrency: 'UF' | 'CLP' | 'USD';
  paymentMilestones: Array<{
    name: string; amount: number; percent: number | null; status: string;
    invoiceNumber: string | null; issuedAt: string | null; paidAt: string | null;
  }>;
  modules: Array<{
    id: string; name: string; currentStage: string;
    estimatedStartDate: string | null; estimatedEndDate: string | null;
    blockerCount: number;
    progress: { scopes: Record<string, number | null> };
    segments: Array<{
      id: string; teamName: string | null; name: string;
      startDate: string; endDate: string;
    }>;
    tasks: Array<{
      id: string; name: string; startDate: string | null; date: string;
      scope: ProjectModuleTaskScope; status: string;
    }>;
    deliveries: PortalDelivery[];
  }>;
  demoLink: string | null;
  testEnvironmentLink: string | null;
  figmaLink: string | null;
  documentationLink: string | null;
  impactBeforeHours: number | null;
  impactAfterHours: number | null;
  qaPlannedTests: number | null;
  qaExecutedTests: number | null;
  qaFailedTests: number | null;
  qaEvaluatedModule: string | null;
}
export interface PortalReceipt {
  deliveryId: string;
  receivedAt: string;
  receivedByName: string;
}
export interface PortalPlan {
  id: string; slug: string | null; name: string; status: string;
  planType: 'monthly' | 'bundle' | 'on_demand';
  scope: 'single' | 'consolidated';
  clientId: string; clientName: string;
  startDate: string | null; endDate: string | null;
  currency: 'UF' | 'CLP' | 'USD'; leaderName: string | null;
  contact: { name: string; position: string | null } | null;
  linkedProjects: Array<{ id: string; name: string }>;
  summary: {
    contractedHours: number; usedHours: number;
    planValueUf: number; extraHourValueUf: number;
  };
}
export interface PortalTicket {
  id: string; code: string; title: string; description: string;
  serviceType: string; status: string; priority: string;
  usedHours: number; estimatedHours: number;
  resolvedAt: string | null; resolution: string | null;
  createdAt: string; developmentProjectId: string | null;
}
export interface PortalContactGrant {
  userId: string; contactId: string; clientId: string; email: string;
  enabled: boolean; projectIds: string[]; supportPlanIds: string[];
}

export const clientPortalApi = {
  me: () => api.get<{ company: PortalCompany }>('/portal/me'),
  projects: () => api.get<PortalProject[]>('/portal/projects'),
  project: (id: string) =>
    api.get<{ project: PortalProjectDetail; receipts: PortalReceipt[] }>(
      `/portal/projects/${encodeURIComponent(id)}`),
  receive: (projectId: string, deliveryId: string) =>
    api.post<{ deliveryId: string; received: true }>(
      `/portal/projects/${encodeURIComponent(projectId)}/deliveries/${encodeURIComponent(deliveryId)}/receive`),
  support: () => api.get<PortalPlan[]>('/portal/support'),
  contract: (id: string) =>
    api.get<{ plan: PortalPlan; tickets: PortalTicket[] }>(
      `/portal/support/${encodeURIComponent(id)}`),
  grants: (clientId: string) =>
    api.get<PortalContactGrant[]>(`/clients/${encodeURIComponent(clientId)}/portal-access`),
  setGrant: (clientId: string, contactId: string, input: ClientPortalGrantInput) =>
    api.patch<{ userId: string; invitationSent: boolean; enabled: boolean }>(
      `/clients/${encodeURIComponent(clientId)}/portal-access/contacts/${encodeURIComponent(contactId)}`, input),
};

const keys = {
  all: ['client-external-portal'] as const,
  me: () => [...keys.all, 'me'] as const,
  projects: () => [...keys.all, 'projects'] as const,
  project: (id: string) => [...keys.all, 'project', id] as const,
  support: () => [...keys.all, 'support'] as const,
  contract: (id: string) => [...keys.all, 'contract', id] as const,
  grants: (id: string) => [...keys.all, 'grants', id] as const,
};

export function usePortalMe() {
  return useQuery({ queryKey: keys.me(), queryFn: clientPortalApi.me });
}
export function usePortalProjects() {
  return useQuery({ queryKey: keys.projects(), queryFn: clientPortalApi.projects });
}
export function usePortalProject(id: string | null) {
  return useQuery({
    queryKey: keys.project(id ?? ''), queryFn: () => clientPortalApi.project(id!),
    enabled: !!id,
  });
}
export function usePortalSupport() {
  return useQuery({ queryKey: keys.support(), queryFn: clientPortalApi.support });
}
export function usePortalContract(id: string | null) {
  return useQuery({
    queryKey: keys.contract(id ?? ''), queryFn: () => clientPortalApi.contract(id!),
    enabled: !!id,
  });
}
export function usePortalReceive(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) => clientPortalApi.receive(projectId, deliveryId),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.project(projectId) }),
        qc.invalidateQueries({ queryKey: keys.projects() }),
      ]);
    },
  });
}
export function usePortalAccess(clientId: string | null) {
  return useQuery({
    queryKey: keys.grants(clientId ?? ''),
    queryFn: () => clientPortalApi.grants(clientId!),
    enabled: !!clientId,
  });
}
export function useSetPortalAccess(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { contactId: string; grant: ClientPortalGrantInput }) =>
      clientPortalApi.setGrant(clientId, input.contactId, input.grant),
    onSuccess: async () => qc.invalidateQueries({ queryKey: keys.grants(clientId) }),
  });
}
