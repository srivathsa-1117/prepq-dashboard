/**
 * Meritto CRM (formerly NoPaperForms) API shapes.
 *
 * Confirmed against the real developer docs (developer.nopaperforms.com) and
 * live-tested against this account's actual API responses - not a guess.
 * Field availability (course/source/lead_stage/etc.) comes from this
 * account's real getMetaData response; custom fields are prefixed `cf_`.
 */

export interface MerittoPagination {
  next?: string;
  next_page_token?: string;
  previous_page_token?: string;
}

export interface MerittoEnvelope<T> {
  code: number;
  status: boolean;
  message: string;
  data: T;
}

/**
 * A lead row from POST /lead/v1/list. Shape is whatever subset of fields
 * was requested in the `fields` array (always includes lead_id) - see
 * MERITTO_LEAD_FIELDS in merittoClient.ts for exactly what we ask for.
 * No `created_at`/`created_date` field exists in this account's schema
 * (confirmed by requesting every plausible name and getting nothing back);
 * `lead_age` ("N d") is the closest usable proxy - see transformLead.
 */
export interface MerittoLead {
  lead_id: string;
  name?: string;
  email?: string;
  mobile?: string;
  course?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  lead_stage?: string;
  lead_status?: string;
  previous_lead_stage?: string;
  // Despite the documented type, this account's real API returns a one-element array of an
  // opaque internal user id (e.g. "66b1416d2019436f90a9268da320ee4c") here, never a plain name -
  // confirmed by inspecting raw_data across every lead that has one. See merittoTransform.ts's
  // extractOwnerRef.
  owner?: string | string[];
  lead_age?: string; // e.g. "0 d", "12 d"
  cf_ad_name?: string;
  cf_ad_set_name?: string;
  cf_campaign_name?: string;
  total_outbound?: number;
  outbound_success?: number;
  [key: string]: unknown;
}

/** One entry from the master Activity Codes list (POST/GET /activity/v1/getCodesList). */
export interface MerittoActivityCode {
  code: number;
  name: string;
  category: string;
}

/**
 * One row from POST /activity/v1/getByDateRange (all leads) or
 * .../getByLeadId (one lead) - same shape, the date-range variant just also
 * includes lead_id per row.
 */
export interface MerittoActivity {
  lead_id: string;
  activity_code: string;
  activity_performed: string;
  created_on: number; // Unix epoch seconds
}

/** Payment API needs a form_id + product_id (from separate Form/Product List APIs) we haven't wired up yet - see merittoClient.ts::streamPayments. Kept as a placeholder shape so upsertMerittoPayments/applyEnrollmentFromPayments (real, working code) has something to type against once it is. */
export interface MerittoPayment {
  payment_id: string;
  lead_id: string;
  amount: number;
  currency?: string;
  paid_at?: string;
  status?: string;
  [key: string]: unknown;
}

/** Our internal normalized shapes, produced by integrations/meritto/merittoTransform.ts. */
export interface NormalizedMerittoLead {
  merittoLeadId: string;
  createdAtSource: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  productCode: string | null;
  source: string | null;
  campaign: string | null;
  adSet: string | null;
  creative: string | null;
  attributionRaw: Record<string, unknown>;
  /** The raw Meritto owner id (see MerittoLead.owner) - resolved to a real name via meritto_owner_names in merittoSync.ts, since Meritto never sends the name itself. */
  ownerRef: string | null;
  sourceDisposition: string | null;
  dqReason: string | null;
  demoBookedAt: string | null;
  demoAttendedAt: string | null;
  raw: MerittoLead;
}

export interface NormalizedMerittoActivity {
  merittoActivityId: string | null;
  merittoLeadId: string;
  activityType: string | null;
  activityAt: string;
  disposition: string | null;
  notes: string | null;
  agent: string | null;
  raw: MerittoActivity;
}

export interface NormalizedMerittoPayment {
  merittoPaymentId: string;
  merittoLeadId: string;
  amount: number;
  currency: string;
  paidAt: string | null;
  paymentStatus: string | null;
  raw: MerittoPayment;
}
