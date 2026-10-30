/**
 * Mirrors backend/src/services/reportingService.ts and friends exactly -
 * field names and shapes here must match what the Fastify API actually
 * returns. If you change a backend response shape, update this file in the
 * same commit.
 */

export interface DateRange {
  from: string;
  to: string;
}

export type DateRangePreset = '7d' | '30d' | 'mtd' | 'qtd';

export type OrgRole = 'owner' | 'admin' | 'manager' | 'analyst' | 'viewer';
export type IntegrationProvider = 'meta' | 'google_ads' | 'meritto';
export type IntegrationStatus = 'disconnected' | 'connected' | 'error' | 'paused';
export type IntegrationPhase = IntegrationStatus | 'pending_account_selection';

// ---------------------------------------------------------------------------
// Org / client
// ---------------------------------------------------------------------------

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMembership {
  role: OrgRole;
  organization: Organization;
}

export interface Client {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: 'active' | 'paused' | 'archived';
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Integrations & sync
// ---------------------------------------------------------------------------

export interface PublicIntegration {
  id: string;
  clientId: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  lastSyncAt: string | null;
  externalAccountId: string | null;
  externalAccountName: string | null;
  accountStatus: string | null;
}

export interface IntegrationStatusResponse {
  integration: PublicIntegration | null;
  phase: IntegrationPhase;
  syncStatus: {
    lastSuccessful: SyncRun | null;
    lastFailed: SyncRun | null;
    lastRun: SyncRun | null;
  };
}

export interface SyncRun {
  id: string;
  clientId: string;
  syncJobId: string;
  provider: IntegrationProvider;
  status: 'running' | 'success' | 'failed' | 'partial';
  startedAt: string;
  completedAt: string | null;
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
}

export interface SyncSchedule {
  id: string;
  clientId: string;
  integrationId: string;
  jobType: string;
  frequency: 'hourly' | 'daily' | 'weekly' | 'manual';
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  metadata: { cronExpression?: string; timezone?: string; triggerDevScheduleId?: string };
}

export interface SyncStatusForProvider {
  provider: IntegrationProvider;
  lastSuccessful: SyncRun | null;
  lastFailed: SyncRun | null;
  lastRun: SyncRun | null;
  recentRuns?: SyncRun[];
  schedule: SyncSchedule | null;
}

export interface AllSyncStatus {
  providers: SyncStatusForProvider[];
}

// ---------------------------------------------------------------------------
// Dashboard filters (shared query contract)
// ---------------------------------------------------------------------------

export interface DashboardFilters {
  range?: DateRangePreset;
  date_from?: string;
  date_to?: string;
  course?: string;
  source?: string;
  campaign?: string;
  creative?: string;
}

export interface FilterOptionsResponse {
  courses: Array<{ id: string; code: string; name: string }>;
  sources: string[];
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export interface OverviewResponse {
  range: DateRange;
  leads: number;
  qualified: number;
  qualifiedRate: number;
  junkRate: number;
  enrolled: number;
  impressions: number;
  clicks: number;
  spend: number;
  revenue: number;
  cpl: number | null;
  costPerQualified: number | null;
  costPerEnrollment: number | null;
  roas: number | null;
  periodOverPeriod: { current: number; previous: number; deltaAbs: number; deltaPct: number | null };
  speedToLeadMedianHours: number | null;
  targetPacing: {
    target: number;
    actual: number;
    expectedByNow: number;
    aheadBehind: number;
    requiredDailyRunRate: number;
  } | null;
  monthlyTargets: {
    leads: { target: number; actual: number };
    qualified: { target: number; actual: number };
    enrolled: { target: number; actual: number };
    revenue: { target: number; actual: number };
  } | null;
  targetsByCourse: Array<{
    courseId: string;
    courseName: string;
    leads: { target: number; actual: number };
    qualified: { target: number; actual: number };
    enrolled: { target: number; actual: number };
    revenue: { target: number; actual: number };
  }>;
}

// ---------------------------------------------------------------------------
// Targets (edit)
// ---------------------------------------------------------------------------

export interface TargetEntry {
  courseId: string;
  month: string;
  leadTarget: number;
  qualifiedTarget: number;
  enrollmentTarget: number;
  revenueTarget: number;
}

export interface TargetsResponse {
  targets: TargetEntry[];
}

export interface SaveTargetsRequest {
  client_id: string;
  month: string;
  targets: Array<{
    course_id: string;
    lead_target: number;
    qualified_target: number;
    enrollment_target: number;
    revenue_target: number;
  }>;
}

// ---------------------------------------------------------------------------
// Enrolled leads (manual revenue entry)
// ---------------------------------------------------------------------------

export interface EnrolledLead {
  id: string;
  name: string | null;
  courseId: string | null;
  enrolledAt: string;
  feePaid: number | null;
}

export interface EnrolledLeadsResponse {
  leads: EnrolledLead[];
}

// ---------------------------------------------------------------------------
// Lead detail / timeline
// ---------------------------------------------------------------------------

export interface LeadDetail {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  dqReason: string | null;
  source: string | null;
  courseId: string | null;
  owner: string | null;
  createdAt: string;
  firstCallAt: string | null;
  callAttempts: number;
  connectAttempt: number | null;
  connected: boolean;
  demoBookedAt: string | null;
  demoAttendedAt: string | null;
  enrolledAt: string | null;
  feePaid: number | null;
}

export interface LeadActivity {
  id: string;
  activityType: string;
  activityAt: string;
  outcome: string | null;
  notes: string | null;
  duration: number | null;
  owner: string | null;
}

export interface LeadTimelineResponse {
  lead: LeadDetail;
  activities: LeadActivity[];
}

export interface TrendsResponse {
  range: DateRange;
  series: Array<{
    date: string;
    leads: number;
    qualified: number;
    enrolled: number;
    spend: number;
    impressions: number;
    clicks: number;
    cpl: number | null;
  }>;
}

export type FunnelStageName = 'leads' | 'connected' | 'qualified' | 'demo_booked' | 'demo_attended' | 'enrolled';

export interface FunnelResponse {
  range: DateRange;
  stages: Array<{ stage: FunnelStageName; count: number; pctOfTotal: number; pctOfPrevious: number | null }>;
}

export type SpeedBucket = '<1h' | '1-4h' | '4-24h' | '>24h';
export type AgingBucket = '<24h' | '24-48h' | '>48h';
export type CohortMaturity = 'matured' | 'mostly_matured' | 'still_maturing';
export type LeadStatus = 'qualified' | 'not_qualified' | 'not_reachable' | 'junk' | 'uncalled';

export interface SalesResponse {
  range: DateRange;
  speedToLead: {
    medianHours: number | null;
    buckets: Array<{ bucket: SpeedBucket; leads: number; connected: number; connectRate: number }>;
    neverCalled: number;
    notTimeable: number;
  };
  uncalledAging: {
    buckets: Array<{ bucket: AgingBucket; leads: number }>;
    byOwner: Array<{ owner: string; leads: number }>;
  };
  followUpDepth: { byAttempt: Record<string, number>; neverConnected: number; noActivity: number };
  cohortConversion: Array<{ month: string; leads: number; enrolled: number; enrolledRate: number; maturity: CohortMaturity }>;
  arrivalHeatmap: Array<{ dayOfWeek: number; blockStartHour: number; leads: number; connected: number; connectRate: number }>;
  leadQuality: Array<{ status: LeadStatus; count: number; pctOfTotal: number }>;
  disqualificationReasons: Array<{ reason: string; count: number; pctOfDisqualified: number }>;
  salesTeam: Array<{
    owner: string;
    leadsAssigned: number;
    medianResponseHours: number | null;
    uncalledOver24h: number;
    connected: number;
    qualified: number;
    enrolled: number;
    leadToEnrolmentRate: number;
  }>;
}

export interface SourcePerformanceResponse {
  range: DateRange;
  sources: Array<{
    source: string;
    leads: number;
    qualified: number;
    qualifiedRate: number;
    enrolled: number;
    impressions: number;
    clicks: number;
    spend: number;
    revenue: number;
    cpl: number | null;
    costPerQualified: number | null;
    costPerEnrollment: number | null;
    roas: number | null;
  }>;
}

export interface RevenueResponse {
  range: DateRange;
  totalRevenue: number;
  totalSpend: number;
  blendedRoas: number | null;
  byCourse: Array<{
    courseId: string;
    courseCode: string | null;
    courseName: string | null;
    enrolled: number;
    revenue: number;
    costPerEnrollment: number | null;
  }>;
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export interface CampaignRow {
  provider: 'meta' | 'google';
  campaignId: string;
  campaignName: string | null;
  status: string | null;
  courseCode: string | null;
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  leads: number;
  qualified: number;
  qualifiedRate: number;
  enrolled: number;
  revenue: number;
  cpl: number | null;
  costPerQualified: number | null;
  costPerEnrollment: number | null;
  roas: number | null;
}

export interface CampaignPerformanceResponse {
  range: DateRange;
  campaigns: CampaignRow[];
}

export interface CampaignDetailResponse {
  range: DateRange;
  campaign: CampaignRow & { ctr: number };
  trend: Array<{ date: string; spend: number; impressions: number; clicks: number; leads: number; qualified: number; enrolled: number }>;
  adGroups: Array<{
    adsetId: string;
    adsetName: string | null;
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    qualified: number;
    qualifiedRate: number;
  }>;
  topAds: Array<{ adId: string; adName: string | null; spend: number; leads: number; qualified: number; qualifiedRate: number; enrolled: number }>;
  worstAds: Array<{ adId: string; adName: string | null; spend: number; leads: number; qualified: number; qualifiedRate: number; enrolled: number }>;
  creatives: Array<{
    creativeId: string;
    creativeName: string;
    creativePreviewUrl: string | null;
    spend: number;
    leads: number;
    qualifiedRate: number;
    fatigue: FatigueResult | null;
  }>;
}

// ---------------------------------------------------------------------------
// Creatives
// ---------------------------------------------------------------------------

export type FatigueTrend = 'steady' | 'improving' | 'declining' | 'insufficient_data';

export interface FatigueResult {
  trend: FatigueTrend;
  currentWindowRate: number | null;
  previousWindowRate: number | null;
  deltaPp: number | null;
}

export interface FatigueDetail extends FatigueResult {
  currentWindow: { from: string; to: string; leads: number; qualified: number };
  previousWindow: { from: string; to: string; leads: number; qualified: number };
}

export interface CreativeRow {
  /** Null for a draft creative that has never been mapped to a live ad on either platform (spec: creatives can exist before launch). */
  provider: 'meta' | 'google' | null;
  creativeId: string;
  creativeName: string;
  creativePreviewUrl: string | null;
  status: string | null;
  courseCode: string | null;
  campaignName: string | null;
  adGroupName: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
  cpl: number | null;
  qualified: number;
  qualifiedRate: number;
  junk: number;
  junkRate: number;
  enrolled: number;
  costPerQualified: number | null;
  costPerEnrollment: number | null;
  revenue: number;
  roas: number | null;
  fatigue: FatigueResult | null;
}

export interface CreativePerformanceResponse {
  range: DateRange;
  creatives: CreativeRow[];
}

export interface CreativeMapping {
  platform: 'meta' | 'google';
  adId: string | null;
  adName: string | null;
  campaignName: string | null;
  adsetOrAdgroupName: string | null;
}

export interface CreativeDetailResponse {
  range: DateRange;
  creative: {
    id: string;
    name: string;
    internalName: string | null;
    concept: string | null;
    hook: string | null;
    angle: string | null;
    format: string | null;
    status: string;
    assetUrl: string | null;
    thumbnailUrl: string | null;
    carouselImages: string[] | null;
    createdAt: string;
    mappings: CreativeMapping[];
    platform: 'meta' | 'google' | null;
    campaignName: string | null;
    adGroupName: string | null;
    courseCode: string | null;
  };
  performance: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    leads: number;
    cpl: number | null;
    qualified: number;
    qualifiedRate: number;
    junk: number;
    junkRate: number;
    enrolled: number;
    costPerQualified: number | null;
    costPerEnrollment: number | null;
    revenue: number;
    roas: number | null;
  };
  trend: Array<{ date: string; spend: number; impressions: number; clicks: number; leads: number; qualified: number; junk: number; enrolled: number }>;
  fatigue: FatigueDetail;
}
