import { z } from 'zod';
import { DATE_RANGE_PRESETS } from '../config/constants.js';

export const uuidSchema = z.string().uuid();

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const dashboardFiltersSchema = z
  .object({
    client_id: uuidSchema,
    range: z.enum(DATE_RANGE_PRESETS).optional(),
    date_from: isoDateSchema.optional(),
    date_to: isoDateSchema.optional(),
    course: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
    campaign: z.string().min(1).optional(),
    creative: z.string().min(1).optional(),
  })
  .refine((v) => v.range || (v.date_from && v.date_to), {
    message: 'Provide either `range` (7d|30d|mtd|qtd) or both date_from and date_to',
  });

export type DashboardFiltersInput = z.infer<typeof dashboardFiltersSchema>;

export const clientIdQuerySchema = z.object({ client_id: uuidSchema });
