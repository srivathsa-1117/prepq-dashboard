import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireClientAccess, requireRole } from '../../auth/middleware.js';
import { dashboardFiltersSchema, uuidSchema, clientIdQuerySchema, isoDateSchema } from '../../validators/common.schemas.js';
import {
  resolveRequest,
  getOverview,
  getTrends,
  getFunnel,
  getSales,
  getSourcePerformance,
  getCampaignPerformance,
  getCreativePerformance,
  getRevenue,
  getCampaignDetail,
  getCreativeDetail,
  getFilterOptions,
  getTargets,
  saveTargets,
  listEnrolledLeads,
  setLeadRevenue,
  setLeadCourse,
} from '../../services/reportingService.js';

const monthQuerySchema = z.object({
  client_id: uuidSchema,
  // targets.month is always the 1st of the month (DB check constraint) - accept a plain
  // YYYY-MM-DD and let the route normalize it rather than making the frontend construct it.
  month: isoDateSchema,
});

const targetInputSchema = z.object({
  course_id: uuidSchema,
  lead_target: z.number().int().min(0),
  qualified_target: z.number().int().min(0),
  enrollment_target: z.number().int().min(0),
  revenue_target: z.number().min(0),
});

const saveTargetsSchema = z.object({
  client_id: uuidSchema,
  month: isoDateSchema,
  targets: z.array(targetInputSchema).min(1),
});

const setRevenueSchema = z.object({
  client_id: uuidSchema,
  fee_paid: z.number().min(0),
});

const setCourseSchema = z.object({
  client_id: uuidSchema,
  course_id: uuidSchema,
});

/**
 * All eight read-only reporting endpoints from spec §13 share the same
 * filter contract (client_id, range|date_from/date_to, course, source,
 * campaign, creative) - resolveRequest() parses that once per request and
 * every handler below is a thin call into services/reportingService.ts.
 */
export default async function dashboardRoutes(app: FastifyInstance) {
  const commonPreHandler = [authenticate, requireClientAccess({ paramName: 'client_id' })];

  // Populates CourseFilter/SourceFilter option lists - client-scoped, not range-scoped (spec §6/§7 filters).
  app.get('/api/dashboard/filter-options', { preHandler: commonPreHandler }, async (request) => {
    const q = clientIdQuerySchema.parse(request.query);
    return getFilterOptions(q.client_id);
  });

  app.get('/api/dashboard/overview', { preHandler: commonPreHandler }, async (request) => {
    const q = dashboardFiltersSchema.parse(request.query);
    const req = await resolveRequest({ clientId: q.client_id, range: q.range, dateFrom: q.date_from, dateTo: q.date_to, course: q.course, source: q.source, campaign: q.campaign, creative: q.creative });
    return getOverview(req);
  });

  app.get('/api/dashboard/trends', { preHandler: commonPreHandler }, async (request) => {
    const q = dashboardFiltersSchema.parse(request.query);
    const req = await resolveRequest({ clientId: q.client_id, range: q.range, dateFrom: q.date_from, dateTo: q.date_to, course: q.course, source: q.source, campaign: q.campaign, creative: q.creative });
    return getTrends(req);
  });

  app.get('/api/dashboard/funnel', { preHandler: commonPreHandler }, async (request) => {
    const q = dashboardFiltersSchema.parse(request.query);
    const req = await resolveRequest({ clientId: q.client_id, range: q.range, dateFrom: q.date_from, dateTo: q.date_to, course: q.course, source: q.source, campaign: q.campaign, creative: q.creative });
    return getFunnel(req);
  });

  app.get('/api/dashboard/sales', { preHandler: commonPreHandler }, async (request) => {
    const q = dashboardFiltersSchema.parse(request.query);
    const req = await resolveRequest({ clientId: q.client_id, range: q.range, dateFrom: q.date_from, dateTo: q.date_to, course: q.course, source: q.source, campaign: q.campaign, creative: q.creative });
    return getSales(req);
  });

  app.get('/api/dashboard/source-performance', { preHandler: commonPreHandler }, async (request) => {
    const q = dashboardFiltersSchema.parse(request.query);
    const req = await resolveRequest({ clientId: q.client_id, range: q.range, dateFrom: q.date_from, dateTo: q.date_to, course: q.course, source: q.source, campaign: q.campaign, creative: q.creative });
    return getSourcePerformance(req);
  });

  app.get('/api/dashboard/campaign-performance', { preHandler: commonPreHandler }, async (request) => {
    const q = dashboardFiltersSchema.parse(request.query);
    const req = await resolveRequest({ clientId: q.client_id, range: q.range, dateFrom: q.date_from, dateTo: q.date_to, course: q.course, source: q.source, campaign: q.campaign, creative: q.creative });
    return getCampaignPerformance(req);
  });

  app.get('/api/dashboard/creative-performance', { preHandler: commonPreHandler }, async (request) => {
    const q = dashboardFiltersSchema.parse(request.query);
    const req = await resolveRequest({ clientId: q.client_id, range: q.range, dateFrom: q.date_from, dateTo: q.date_to, course: q.course, source: q.source, campaign: q.campaign, creative: q.creative });
    return getCreativePerformance(req);
  });

  app.get('/api/dashboard/revenue', { preHandler: commonPreHandler }, async (request) => {
    const q = dashboardFiltersSchema.parse(request.query);
    const req = await resolveRequest({ clientId: q.client_id, range: q.range, dateFrom: q.date_from, dateTo: q.date_to, course: q.course, source: q.source, campaign: q.campaign, creative: q.creative });
    return getRevenue(req);
  });

  // Drilldowns: client_id/range still come from the query string (same
  // filter contract as every list endpoint above); the entity id is a route
  // param. course/source/campaign/creative filters don't apply to a single
  // entity's own detail view, so they're intentionally not read here.
  app.get('/api/dashboard/campaigns/:campaignId', { preHandler: commonPreHandler }, async (request) => {
    const q = dashboardFiltersSchema.parse(request.query);
    const { campaignId } = request.params as { campaignId: string };
    const req = await resolveRequest({ clientId: q.client_id, range: q.range, dateFrom: q.date_from, dateTo: q.date_to });
    return getCampaignDetail(req, uuidSchema.parse(campaignId));
  });

  app.get('/api/dashboard/creatives/:creativeId', { preHandler: commonPreHandler }, async (request) => {
    const q = dashboardFiltersSchema.parse(request.query);
    const { creativeId } = request.params as { creativeId: string };
    const req = await resolveRequest({ clientId: q.client_id, range: q.range, dateFrom: q.date_from, dateTo: q.date_to });
    return getCreativeDetail(req, uuidSchema.parse(creativeId));
  });

  // Targets: per-course monthly goals (lead/qualified/enrollment/revenue), compared against
  // actuals in getOverview's monthlyTargets field. Editing them (unlike every read-only route
  // above) is a real business-data write, so it's gated to manager+ rather than every viewer.
  app.get('/api/dashboard/targets', { preHandler: commonPreHandler }, async (request) => {
    const q = monthQuerySchema.parse(request.query);
    return { targets: await getTargets(q.client_id, `${q.month.slice(0, 7)}-01`) };
  });

  app.post('/api/dashboard/targets', { preHandler: [...commonPreHandler, requireRole('manager')] }, async (request, reply) => {
    const body = saveTargetsSchema.parse(request.body);
    await saveTargets(
      body.client_id,
      `${body.month.slice(0, 7)}-01`,
      body.targets.map((t) => ({
        courseId: t.course_id,
        leadTarget: t.lead_target,
        qualifiedTarget: t.qualified_target,
        enrollmentTarget: t.enrollment_target,
        revenueTarget: t.revenue_target,
      })),
    );
    reply.status(204).send();
  });

  // Manual revenue entry: this account doesn't use Meritto's Payments API (see
  // merittoSync.ts), so fee_paid never populates automatically - a manager+ enters it directly
  // against the leads Meritto's own disposition already confirmed as enrolled.
  app.get('/api/dashboard/leads/enrolled', { preHandler: commonPreHandler }, async (request) => {
    const q = clientIdQuerySchema.parse(request.query);
    return { leads: await listEnrolledLeads(q.client_id) };
  });

  app.patch(
    '/api/dashboard/leads/:leadId/revenue',
    { preHandler: [...commonPreHandler, requireRole('manager')] },
    async (request, reply) => {
      const body = setRevenueSchema.parse(request.body);
      const { leadId } = request.params as { leadId: string };
      await setLeadRevenue(body.client_id, uuidSchema.parse(leadId), body.fee_paid);
      reply.status(204).send();
    },
  );

  // Manual course assignment: most leads in this account have no course value in Meritto at all
  // (see updateLeadCourse's comment in reportingRepo.ts) - a manager+ tags one directly, which
  // then feeds Revenue by course, course-fee-fallback revenue/ROAS, and CourseFilter immediately.
  app.patch(
    '/api/dashboard/leads/:leadId/course',
    { preHandler: [...commonPreHandler, requireRole('manager')] },
    async (request, reply) => {
      const body = setCourseSchema.parse(request.body);
      const { leadId } = request.params as { leadId: string };
      await setLeadCourse(body.client_id, uuidSchema.parse(leadId), body.course_id);
      reply.status(204).send();
    },
  );
}
