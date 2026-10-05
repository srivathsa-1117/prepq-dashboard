'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as dashboardApi from '../api/dashboard';
import type { DashboardFilters, SaveTargetsRequest } from '../types/api';
import type { DashboardFilterState } from './useDashboardFilters';

function toApiFilters(f: DashboardFilterState): DashboardFilters {
  return {
    range: f.dateFrom && f.dateTo ? undefined : f.range,
    date_from: f.dateFrom,
    date_to: f.dateTo,
    course: f.course,
    source: f.source,
    campaign: f.campaign,
    creative: f.creative,
  };
}

/** clientId is nullable while org/client resolution is still in flight - every hook disables its query until it's known. */
function enabled(clientId: string | null): boolean {
  return !!clientId;
}

export function useFilterOptions(clientId: string | null) {
  return useQuery({
    queryKey: ['filterOptions', clientId],
    queryFn: () => dashboardApi.getFilterOptions(clientId!),
    enabled: enabled(clientId),
    staleTime: 5 * 60_000,
  });
}

export function useOverview(clientId: string | null, filters: DashboardFilterState) {
  return useQuery({
    queryKey: ['overview', clientId, filters],
    queryFn: () => dashboardApi.getOverview(clientId!, toApiFilters(filters)),
    enabled: enabled(clientId),
  });
}

export function useTrends(clientId: string | null, filters: DashboardFilterState) {
  return useQuery({
    queryKey: ['trends', clientId, filters],
    queryFn: () => dashboardApi.getTrends(clientId!, toApiFilters(filters)),
    enabled: enabled(clientId),
  });
}

export function useFunnel(clientId: string | null, filters: DashboardFilterState) {
  return useQuery({
    queryKey: ['funnel', clientId, filters],
    queryFn: () => dashboardApi.getFunnel(clientId!, toApiFilters(filters)),
    enabled: enabled(clientId),
  });
}

export function useSales(clientId: string | null, filters: DashboardFilterState) {
  return useQuery({
    queryKey: ['sales', clientId, filters],
    queryFn: () => dashboardApi.getSales(clientId!, toApiFilters(filters)),
    enabled: enabled(clientId),
  });
}

export function useSourcePerformance(clientId: string | null, filters: DashboardFilterState) {
  return useQuery({
    queryKey: ['sourcePerformance', clientId, filters],
    queryFn: () => dashboardApi.getSourcePerformance(clientId!, toApiFilters(filters)),
    enabled: enabled(clientId),
  });
}

export function useCampaignPerformance(clientId: string | null, filters: DashboardFilterState) {
  return useQuery({
    queryKey: ['campaignPerformance', clientId, filters],
    queryFn: () => dashboardApi.getCampaignPerformance(clientId!, toApiFilters(filters)),
    enabled: enabled(clientId),
  });
}

export function useCreativePerformance(clientId: string | null, filters: DashboardFilterState) {
  return useQuery({
    queryKey: ['creativePerformance', clientId, filters],
    queryFn: () => dashboardApi.getCreativePerformance(clientId!, toApiFilters(filters)),
    enabled: enabled(clientId),
  });
}

export function useRevenue(clientId: string | null, filters: DashboardFilterState) {
  return useQuery({
    queryKey: ['revenue', clientId, filters],
    queryFn: () => dashboardApi.getRevenue(clientId!, toApiFilters(filters)),
    enabled: enabled(clientId),
  });
}

export function useCampaignDetail(clientId: string | null, campaignId: string | null, filters: DashboardFilterState) {
  return useQuery({
    queryKey: ['campaignDetail', clientId, campaignId, filters.range, filters.dateFrom, filters.dateTo],
    queryFn: () => dashboardApi.getCampaignDetail(clientId!, campaignId!, toApiFilters(filters)),
    enabled: !!clientId && !!campaignId,
  });
}

export function useCreativeDetail(clientId: string | null, creativeId: string | null, filters: DashboardFilterState) {
  return useQuery({
    queryKey: ['creativeDetail', clientId, creativeId, filters.range, filters.dateFrom, filters.dateTo],
    queryFn: () => dashboardApi.getCreativeDetail(clientId!, creativeId!, toApiFilters(filters)),
    enabled: !!clientId && !!creativeId,
  });
}

export function useTargets(clientId: string | null, month: string) {
  return useQuery({
    queryKey: ['targets', clientId, month],
    queryFn: () => dashboardApi.getTargets(clientId!, month),
    enabled: enabled(clientId),
  });
}

export function useSaveTargets(clientId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveTargetsRequest) => dashboardApi.saveTargets(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['targets', clientId] });
      queryClient.invalidateQueries({ queryKey: ['overview', clientId] });
    },
  });
}

export function useEnrolledLeads(clientId: string | null) {
  return useQuery({
    queryKey: ['enrolledLeads', clientId],
    queryFn: () => dashboardApi.getEnrolledLeads(clientId!),
    enabled: enabled(clientId),
  });
}

export function useLeadTimeline(clientId: string | null, leadId: string | null) {
  return useQuery({
    queryKey: ['leadTimeline', clientId, leadId],
    queryFn: () => dashboardApi.getLeadTimeline(clientId!, leadId!),
    enabled: enabled(clientId) && !!leadId,
  });
}

export function useSetLeadRevenue(clientId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, feePaid }: { leadId: string; feePaid: number }) => dashboardApi.setLeadRevenue(clientId!, leadId, feePaid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrolledLeads', clientId] });
      queryClient.invalidateQueries({ queryKey: ['overview', clientId] });
      queryClient.invalidateQueries({ queryKey: ['revenue', clientId] });
      queryClient.invalidateQueries({ queryKey: ['campaignPerformance', clientId] });
      queryClient.invalidateQueries({ queryKey: ['creativePerformance', clientId] });
    },
  });
}

export function useSetLeadCourse(clientId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, courseId }: { leadId: string; courseId: string }) => dashboardApi.setLeadCourse(clientId!, leadId, courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrolledLeads', clientId] });
      queryClient.invalidateQueries({ queryKey: ['overview', clientId] });
      queryClient.invalidateQueries({ queryKey: ['revenue', clientId] });
      queryClient.invalidateQueries({ queryKey: ['sourcePerformance', clientId] });
      queryClient.invalidateQueries({ queryKey: ['campaignPerformance', clientId] });
      queryClient.invalidateQueries({ queryKey: ['creativePerformance', clientId] });
      queryClient.invalidateQueries({ queryKey: ['filterOptions', clientId] });
    },
  });
}
