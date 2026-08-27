import { apiFetch } from './client';
import type {
  CampaignDetailResponse,
  CampaignPerformanceResponse,
  CreativeDetailResponse,
  CreativePerformanceResponse,
  DashboardFilters,
  EnrolledLeadsResponse,
  FilterOptionsResponse,
  FunnelResponse,
  OverviewResponse,
  RevenueResponse,
  SalesResponse,
  SaveTargetsRequest,
  SourcePerformanceResponse,
  TargetsResponse,
  TrendsResponse,
} from '../types/api';

export function getFilterOptions(clientId: string) {
  return apiFetch<FilterOptionsResponse>('/api/dashboard/filter-options', { params: { client_id: clientId } });
}

function toParams(clientId: string, filters: DashboardFilters): Record<string, string | undefined> {
  return {
    client_id: clientId,
    range: filters.range,
    date_from: filters.date_from,
    date_to: filters.date_to,
    course: filters.course,
    source: filters.source,
    campaign: filters.campaign,
    creative: filters.creative,
  };
}

export function getOverview(clientId: string, filters: DashboardFilters) {
  return apiFetch<OverviewResponse>('/api/dashboard/overview', { params: toParams(clientId, filters) });
}

export function getTrends(clientId: string, filters: DashboardFilters) {
  return apiFetch<TrendsResponse>('/api/dashboard/trends', { params: toParams(clientId, filters) });
}

export function getFunnel(clientId: string, filters: DashboardFilters) {
  return apiFetch<FunnelResponse>('/api/dashboard/funnel', { params: toParams(clientId, filters) });
}

export function getSales(clientId: string, filters: DashboardFilters) {
  return apiFetch<SalesResponse>('/api/dashboard/sales', { params: toParams(clientId, filters) });
}

export function getSourcePerformance(clientId: string, filters: DashboardFilters) {
  return apiFetch<SourcePerformanceResponse>('/api/dashboard/source-performance', { params: toParams(clientId, filters) });
}

export function getCampaignPerformance(clientId: string, filters: DashboardFilters) {
  return apiFetch<CampaignPerformanceResponse>('/api/dashboard/campaign-performance', { params: toParams(clientId, filters) });
}

export function getCreativePerformance(clientId: string, filters: DashboardFilters) {
  return apiFetch<CreativePerformanceResponse>('/api/dashboard/creative-performance', { params: toParams(clientId, filters) });
}

export function getRevenue(clientId: string, filters: DashboardFilters) {
  return apiFetch<RevenueResponse>('/api/dashboard/revenue', { params: toParams(clientId, filters) });
}

export function getCampaignDetail(clientId: string, campaignId: string, filters: Pick<DashboardFilters, 'range' | 'date_from' | 'date_to'>) {
  return apiFetch<CampaignDetailResponse>(`/api/dashboard/campaigns/${campaignId}`, { params: toParams(clientId, filters) });
}

export function getCreativeDetail(clientId: string, creativeId: string, filters: Pick<DashboardFilters, 'range' | 'date_from' | 'date_to'>) {
  return apiFetch<CreativeDetailResponse>(`/api/dashboard/creatives/${creativeId}`, { params: toParams(clientId, filters) });
}

export function getTargets(clientId: string, month: string) {
  return apiFetch<TargetsResponse>('/api/dashboard/targets', { params: { client_id: clientId, month } });
}

export function saveTargets(body: SaveTargetsRequest) {
  return apiFetch<void>('/api/dashboard/targets', { method: 'POST', body });
}

export function getEnrolledLeads(clientId: string) {
  return apiFetch<EnrolledLeadsResponse>('/api/dashboard/leads/enrolled', { params: { client_id: clientId } });
}

export function setLeadRevenue(clientId: string, leadId: string, feePaid: number) {
  return apiFetch<void>(`/api/dashboard/leads/${leadId}/revenue`, { method: 'PATCH', body: { client_id: clientId, fee_paid: feePaid } });
}
