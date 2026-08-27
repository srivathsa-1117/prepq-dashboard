export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          client_id: string | null
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          resource_id: string | null
          resource_type: string
          user_id: string | null
        }
        Insert: {
          action: string
          client_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          resource_id?: string | null
          resource_type: string
          user_id?: string | null
        }
        Update: {
          action?: string
          client_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_members: {
        Row: {
          client_id: string
          created_at: string
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          name: string
          organization_id: string
          slug: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          organization_id: string
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          organization_id?: string
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          client_id: string
          code: string
          created_at: string
          currency: string
          fee: number
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          code: string
          created_at?: string
          currency?: string
          fee?: number
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          code?: string
          created_at?: string
          currency?: string
          fee?: number
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
        ]
      }
      creative_ads: {
        Row: {
          client_id: string
          created_at: string
          creative_id: string
          google_ad_id: string | null
          id: string
          meta_ad_id: string | null
          platform: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          creative_id: string
          google_ad_id?: string | null
          id?: string
          meta_ad_id?: string | null
          platform: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          creative_id?: string
          google_ad_id?: string | null
          id?: string
          meta_ad_id?: string | null
          platform?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_ads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_ads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "creative_ads_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "creatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_ads_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "v_creative_performance"
            referencedColumns: ["creative_id"]
          },
          {
            foreignKeyName: "creative_ads_google_ad_id_fkey"
            columns: ["google_ad_id"]
            isOneToOne: true
            referencedRelation: "google_ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_ads_meta_ad_id_fkey"
            columns: ["meta_ad_id"]
            isOneToOne: true
            referencedRelation: "meta_ads"
            referencedColumns: ["id"]
          },
        ]
      }
      creatives: {
        Row: {
          angle: string | null
          asset_url: string | null
          carousel_images: Json | null
          client_id: string
          concept: string | null
          created_at: string
          created_by: string | null
          description: string | null
          format: string | null
          hook: string | null
          id: string
          internal_name: string | null
          name: string
          status: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          angle?: string | null
          asset_url?: string | null
          carousel_images?: Json | null
          client_id: string
          concept?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          format?: string | null
          hook?: string | null
          id?: string
          internal_name?: string | null
          name: string
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          angle?: string | null
          asset_url?: string | null
          carousel_images?: Json | null
          client_id?: string
          concept?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          format?: string | null
          hook?: string | null
          id?: string
          internal_name?: string | null
          name?: string
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creatives_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creatives_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
        ]
      }
      google_ad_daily_metrics: {
        Row: {
          clicks: number
          client_id: string
          conversion_value: number
          conversions: number
          cost: number
          created_at: string
          date: string
          google_ad_id: string
          id: string
          impressions: number
          updated_at: string
          video_views: number
        }
        Insert: {
          clicks?: number
          client_id: string
          conversion_value?: number
          conversions?: number
          cost?: number
          created_at?: string
          date: string
          google_ad_id: string
          id?: string
          impressions?: number
          updated_at?: string
          video_views?: number
        }
        Update: {
          clicks?: number
          client_id?: string
          conversion_value?: number
          conversions?: number
          cost?: number
          created_at?: string
          date?: string
          google_ad_id?: string
          id?: string
          impressions?: number
          updated_at?: string
          video_views?: number
        }
        Relationships: [
          {
            foreignKeyName: "google_ad_daily_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_ad_daily_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "google_ad_daily_metrics_google_ad_id_fkey"
            columns: ["google_ad_id"]
            isOneToOne: false
            referencedRelation: "google_ads"
            referencedColumns: ["id"]
          },
        ]
      }
      google_ad_groups: {
        Row: {
          campaign_id: string | null
          client_id: string
          cpc_bid_micros: number | null
          cpm_bid_micros: number | null
          created_at: string
          google_ad_group_id: string
          google_campaign_id: string
          id: string
          integration_account_id: string
          name: string | null
          raw_data: Json
          status: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          client_id: string
          cpc_bid_micros?: number | null
          cpm_bid_micros?: number | null
          created_at?: string
          google_ad_group_id: string
          google_campaign_id: string
          id?: string
          integration_account_id: string
          name?: string | null
          raw_data?: Json
          status?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          client_id?: string
          cpc_bid_micros?: number | null
          cpm_bid_micros?: number | null
          created_at?: string
          google_ad_group_id?: string
          google_campaign_id?: string
          id?: string
          integration_account_id?: string
          name?: string | null
          raw_data?: Json
          status?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_ad_groups_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "google_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_ad_groups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_ad_groups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "google_ad_groups_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      google_ads: {
        Row: {
          ad_group_id: string | null
          ad_type: string | null
          campaign_id: string | null
          client_id: string
          created_at: string
          creative_id: string | null
          final_url: string | null
          google_ad_group_id: string
          google_ad_id: string
          google_campaign_id: string
          id: string
          integration_account_id: string
          name: string | null
          raw_data: Json
          status: string | null
          updated_at: string
        }
        Insert: {
          ad_group_id?: string | null
          ad_type?: string | null
          campaign_id?: string | null
          client_id: string
          created_at?: string
          creative_id?: string | null
          final_url?: string | null
          google_ad_group_id: string
          google_ad_id: string
          google_campaign_id: string
          id?: string
          integration_account_id: string
          name?: string | null
          raw_data?: Json
          status?: string | null
          updated_at?: string
        }
        Update: {
          ad_group_id?: string | null
          ad_type?: string | null
          campaign_id?: string | null
          client_id?: string
          created_at?: string
          creative_id?: string | null
          final_url?: string | null
          google_ad_group_id?: string
          google_ad_id?: string
          google_campaign_id?: string
          id?: string
          integration_account_id?: string
          name?: string | null
          raw_data?: Json
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_ads_ad_group_id_fkey"
            columns: ["ad_group_id"]
            isOneToOne: false
            referencedRelation: "google_ad_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_ads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "google_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_ads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_ads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "google_ads_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      google_campaigns: {
        Row: {
          advertising_channel_type: string | null
          bidding_strategy: string | null
          budget: number | null
          client_id: string
          created_at: string
          end_date: string | null
          google_campaign_id: string
          id: string
          integration_account_id: string
          name: string | null
          raw_data: Json
          start_date: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          advertising_channel_type?: string | null
          bidding_strategy?: string | null
          budget?: number | null
          client_id: string
          created_at?: string
          end_date?: string | null
          google_campaign_id: string
          id?: string
          integration_account_id: string
          name?: string | null
          raw_data?: Json
          start_date?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          advertising_channel_type?: string | null
          bidding_strategy?: string | null
          budget?: number | null
          client_id?: string
          created_at?: string
          end_date?: string | null
          google_campaign_id?: string
          id?: string
          integration_account_id?: string
          name?: string | null
          raw_data?: Json
          start_date?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "google_campaigns_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_accounts: {
        Row: {
          account_name: string | null
          account_type: string | null
          created_at: string
          external_account_id: string
          id: string
          integration_id: string
          metadata: Json
          status: string
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          account_type?: string | null
          created_at?: string
          external_account_id: string
          id?: string
          integration_id: string
          metadata?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          account_type?: string | null
          created_at?: string
          external_account_id?: string
          id?: string
          integration_id?: string
          metadata?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_accounts_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_providers: {
        Row: {
          category: string
          code: string
          created_at: string
          metadata: Json
          name: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          metadata?: Json
          name: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          metadata?: Json
          name?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          client_id: string
          created_at: string
          id: string
          last_sync_at: string | null
          metadata: Json
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          metadata?: Json
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          metadata?: Json
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "integrations_provider_fkey"
            columns: ["provider"]
            isOneToOne: false
            referencedRelation: "integration_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_at: string
          activity_type: string
          client_id: string
          created_at: string
          duration: number | null
          id: string
          lead_id: string
          meritto_activity_id: string | null
          notes: string | null
          outcome: string | null
          owner_id: string | null
          raw_data: Json
        }
        Insert: {
          activity_at?: string
          activity_type: string
          client_id: string
          created_at?: string
          duration?: number | null
          id?: string
          lead_id: string
          meritto_activity_id?: string | null
          notes?: string | null
          outcome?: string | null
          owner_id?: string | null
          raw_data?: Json
        }
        Update: {
          activity_at?: string
          activity_type?: string
          client_id?: string
          created_at?: string
          duration?: number | null
          id?: string
          lead_id?: string
          meritto_activity_id?: string | null
          notes?: string | null
          outcome?: string | null
          owner_id?: string | null
          raw_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_sales_performance"
            referencedColumns: ["sales_rep_id"]
          },
        ]
      }
      lead_status_rules: {
        Row: {
          client_id: string
          created_at: string
          id: string
          requires_dq_reason: boolean
          source_disposition: string
          status_code: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          requires_dq_reason?: boolean
          source_disposition: string
          status_code: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          requires_dq_reason?: boolean
          source_disposition?: string
          status_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_status_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_status_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
        ]
      }
      lead_statuses: {
        Row: {
          category: string
          client_id: string
          code: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category: string
          client_id: string
          code: string
          created_at?: string
          id?: string
          is_default?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          client_id?: string
          code?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_statuses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_statuses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
        ]
      }
      leads: {
        Row: {
          attribution_platform: string | null
          call_attempts: number
          client_id: string
          connect_attempt: number | null
          connected: boolean
          course_id: string | null
          created_at: string
          creative_id: string | null
          demo_attended_at: string | null
          demo_booked_at: string | null
          dq_reason: string | null
          email: string | null
          enrolled_at: string | null
          fee_paid: number | null
          first_call_at: string | null
          google_ad_group_id: string | null
          google_ad_id: string | null
          google_campaign_id: string | null
          id: string
          meritto_lead_id: string | null
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          name: string | null
          owner_id: string | null
          phone: string | null
          raw_data: Json
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attribution_platform?: string | null
          call_attempts?: number
          client_id: string
          connect_attempt?: number | null
          connected?: boolean
          course_id?: string | null
          created_at?: string
          creative_id?: string | null
          demo_attended_at?: string | null
          demo_booked_at?: string | null
          dq_reason?: string | null
          email?: string | null
          enrolled_at?: string | null
          fee_paid?: number | null
          first_call_at?: string | null
          google_ad_group_id?: string | null
          google_ad_id?: string | null
          google_campaign_id?: string | null
          id?: string
          meritto_lead_id?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          name?: string | null
          owner_id?: string | null
          phone?: string | null
          raw_data?: Json
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attribution_platform?: string | null
          call_attempts?: number
          client_id?: string
          connect_attempt?: number | null
          connected?: boolean
          course_id?: string | null
          created_at?: string
          creative_id?: string | null
          demo_attended_at?: string | null
          demo_booked_at?: string | null
          dq_reason?: string | null
          email?: string | null
          enrolled_at?: string | null
          fee_paid?: number | null
          first_call_at?: string | null
          google_ad_group_id?: string | null
          google_ad_id?: string | null
          google_campaign_id?: string | null
          id?: string
          meritto_lead_id?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          name?: string | null
          owner_id?: string | null
          phone?: string | null
          raw_data?: Json
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "leads_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "creatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "v_creative_performance"
            referencedColumns: ["creative_id"]
          },
          {
            foreignKeyName: "leads_google_ad_group_id_fkey"
            columns: ["google_ad_group_id"]
            isOneToOne: false
            referencedRelation: "google_ad_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_google_ad_id_fkey"
            columns: ["google_ad_id"]
            isOneToOne: false
            referencedRelation: "google_ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_google_campaign_id_fkey"
            columns: ["google_campaign_id"]
            isOneToOne: false
            referencedRelation: "google_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_meta_ad_id_fkey"
            columns: ["meta_ad_id"]
            isOneToOne: false
            referencedRelation: "meta_ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_meta_adset_id_fkey"
            columns: ["meta_adset_id"]
            isOneToOne: false
            referencedRelation: "meta_adsets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_meta_campaign_id_fkey"
            columns: ["meta_campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_sales_performance"
            referencedColumns: ["sales_rep_id"]
          },
          {
            foreignKeyName: "leads_status_fk"
            columns: ["client_id", "status"]
            isOneToOne: false
            referencedRelation: "lead_statuses"
            referencedColumns: ["client_id", "code"]
          },
        ]
      }
      meritto_events: {
        Row: {
          client_id: string
          error_message: string | null
          event_type: string
          id: number
          meritto_lead_id: string | null
          payload: Json
          processed_at: string | null
          processing_status: string
          received_at: string
        }
        Insert: {
          client_id: string
          error_message?: string | null
          event_type: string
          id?: never
          meritto_lead_id?: string | null
          payload: Json
          processed_at?: string | null
          processing_status?: string
          received_at?: string
        }
        Update: {
          client_id?: string
          error_message?: string | null
          event_type?: string
          id?: never
          meritto_lead_id?: string | null
          payload?: Json
          processed_at?: string | null
          processing_status?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meritto_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meritto_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
        ]
      }
      meta_ad_daily_metrics: {
        Row: {
          clicks: number
          client_id: string
          created_at: string
          date: string
          id: string
          impressions: number
          link_clicks: number
          meta_ad_id: string
          reach: number
          spend: number
          updated_at: string
          video_100: number
          video_25: number
          video_50: number
          video_75: number
          video_views: number
        }
        Insert: {
          clicks?: number
          client_id: string
          created_at?: string
          date: string
          id?: string
          impressions?: number
          link_clicks?: number
          meta_ad_id: string
          reach?: number
          spend?: number
          updated_at?: string
          video_100?: number
          video_25?: number
          video_50?: number
          video_75?: number
          video_views?: number
        }
        Update: {
          clicks?: number
          client_id?: string
          created_at?: string
          date?: string
          id?: string
          impressions?: number
          link_clicks?: number
          meta_ad_id?: string
          reach?: number
          spend?: number
          updated_at?: string
          video_100?: number
          video_25?: number
          video_50?: number
          video_75?: number
          video_views?: number
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_daily_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_daily_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "meta_ad_daily_metrics_meta_ad_id_fkey"
            columns: ["meta_ad_id"]
            isOneToOne: false
            referencedRelation: "meta_ads"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads: {
        Row: {
          adset_id: string | null
          campaign_id: string | null
          client_id: string
          created_at: string
          created_time: string | null
          creative_id: string | null
          id: string
          integration_account_id: string
          meta_ad_id: string
          meta_adset_id: string
          meta_campaign_id: string
          name: string | null
          raw_data: Json
          status: string | null
          updated_at: string
          updated_time: string | null
        }
        Insert: {
          adset_id?: string | null
          campaign_id?: string | null
          client_id: string
          created_at?: string
          created_time?: string | null
          creative_id?: string | null
          id?: string
          integration_account_id: string
          meta_ad_id: string
          meta_adset_id: string
          meta_campaign_id: string
          name?: string | null
          raw_data?: Json
          status?: string | null
          updated_at?: string
          updated_time?: string | null
        }
        Update: {
          adset_id?: string | null
          campaign_id?: string | null
          client_id?: string
          created_at?: string
          created_time?: string | null
          creative_id?: string | null
          id?: string
          integration_account_id?: string
          meta_ad_id?: string
          meta_adset_id?: string
          meta_campaign_id?: string
          name?: string | null
          raw_data?: Json
          status?: string | null
          updated_at?: string
          updated_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ads_adset_id_fkey"
            columns: ["adset_id"]
            isOneToOne: false
            referencedRelation: "meta_adsets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "meta_ads_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_adsets: {
        Row: {
          bid_strategy: string | null
          billing_event: string | null
          campaign_id: string | null
          client_id: string
          created_at: string
          daily_budget: number | null
          end_time: string | null
          id: string
          integration_account_id: string
          lifetime_budget: number | null
          meta_adset_id: string
          meta_campaign_id: string
          name: string | null
          optimization_goal: string | null
          raw_data: Json
          start_time: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          bid_strategy?: string | null
          billing_event?: string | null
          campaign_id?: string | null
          client_id: string
          created_at?: string
          daily_budget?: number | null
          end_time?: string | null
          id?: string
          integration_account_id: string
          lifetime_budget?: number | null
          meta_adset_id: string
          meta_campaign_id: string
          name?: string | null
          optimization_goal?: string | null
          raw_data?: Json
          start_time?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          bid_strategy?: string | null
          billing_event?: string | null
          campaign_id?: string | null
          client_id?: string
          created_at?: string
          daily_budget?: number | null
          end_time?: string | null
          id?: string
          integration_account_id?: string
          lifetime_budget?: number | null
          meta_adset_id?: string
          meta_campaign_id?: string
          name?: string | null
          optimization_goal?: string | null
          raw_data?: Json
          start_time?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_adsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_adsets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_adsets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "meta_adsets_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campaigns: {
        Row: {
          buying_type: string | null
          client_id: string
          created_at: string
          created_time: string | null
          id: string
          integration_account_id: string
          meta_campaign_id: string
          name: string | null
          objective: string | null
          raw_data: Json
          special_ad_categories: Json
          start_time: string | null
          status: string | null
          stop_time: string | null
          updated_at: string
          updated_time: string | null
        }
        Insert: {
          buying_type?: string | null
          client_id: string
          created_at?: string
          created_time?: string | null
          id?: string
          integration_account_id: string
          meta_campaign_id: string
          name?: string | null
          objective?: string | null
          raw_data?: Json
          special_ad_categories?: Json
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string
          updated_time?: string | null
        }
        Update: {
          buying_type?: string | null
          client_id?: string
          created_at?: string
          created_time?: string | null
          id?: string
          integration_account_id?: string
          meta_campaign_id?: string
          name?: string | null
          objective?: string | null
          raw_data?: Json
          special_ad_categories?: Json
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string
          updated_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "meta_campaigns_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          currency: string
          id: string
          lead_id: string
          meritto_payment_id: string | null
          payment_date: string | null
          payment_method: string | null
          payment_status: string
          raw_data: Json
          updated_at: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          currency?: string
          id?: string
          lead_id: string
          meritto_payment_id?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string
          raw_data?: Json
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          currency?: string
          id?: string
          lead_id?: string
          meritto_payment_id?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string
          raw_data?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "payments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          metadata: Json
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          metadata?: Json
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          metadata?: Json
          updated_at?: string
        }
        Relationships: []
      }
      sales_reps: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          external_id: string | null
          id: string
          name: string
          raw_data: Json
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          name: string
          raw_data?: Json
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          name?: string
          raw_data?: Json
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_reps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_reps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
        ]
      }
      sync_cursors: {
        Row: {
          cursor: string | null
          id: string
          integration_id: string
          last_synced_at: string | null
          resource: string
          updated_at: string
        }
        Insert: {
          cursor?: string | null
          id?: string
          integration_id: string
          last_synced_at?: string | null
          resource: string
          updated_at?: string
        }
        Update: {
          cursor?: string | null
          id?: string
          integration_id?: string
          last_synced_at?: string | null
          resource?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_cursors_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_jobs: {
        Row: {
          client_id: string
          created_at: string
          enabled: boolean
          frequency: string
          id: string
          integration_id: string
          job_type: string
          last_run_at: string | null
          metadata: Json
          next_run_at: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          enabled?: boolean
          frequency?: string
          id?: string
          integration_id: string
          job_type: string
          last_run_at?: string | null
          metadata?: Json
          next_run_at?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          enabled?: boolean
          frequency?: string
          id?: string
          integration_id?: string
          job_type?: string
          last_run_at?: string | null
          metadata?: Json
          next_run_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "sync_jobs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          client_id: string
          completed_at: string | null
          error_message: string | null
          id: string
          metadata: Json
          records_created: number
          records_failed: number
          records_fetched: number
          records_updated: number
          started_at: string
          status: string
          sync_job_id: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          records_created?: number
          records_failed?: number
          records_fetched?: number
          records_updated?: number
          started_at?: string
          status?: string
          sync_job_id: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          records_created?: number
          records_failed?: number
          records_fetched?: number
          records_updated?: number
          started_at?: string
          status?: string
          sync_job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "sync_runs_sync_job_id_fkey"
            columns: ["sync_job_id"]
            isOneToOne: false
            referencedRelation: "sync_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_runs_sync_job_id_fkey"
            columns: ["sync_job_id"]
            isOneToOne: false
            referencedRelation: "v_sync_health"
            referencedColumns: ["sync_job_id"]
          },
        ]
      }
      targets: {
        Row: {
          client_id: string
          course_id: string
          created_at: string
          enrollment_target: number
          id: string
          lead_target: number
          month: string
          qualified_target: number
          revenue_target: number
          updated_at: string
        }
        Insert: {
          client_id: string
          course_id: string
          created_at?: string
          enrollment_target?: number
          id?: string
          lead_target?: number
          month: string
          qualified_target?: number
          revenue_target?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          course_id?: string
          created_at?: string
          enrollment_target?: number
          id?: string
          lead_target?: number
          month?: string
          qualified_target?: number
          revenue_target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "targets_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_ad_daily_unified: {
        Row: {
          ad_id: string | null
          clicks: number | null
          client_id: string | null
          date: string | null
          impressions: number | null
          platform: string | null
          spend: number | null
        }
        Relationships: []
      }
      v_ad_performance: {
        Row: {
          ad_id: string | null
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          clicks: number | null
          client_id: string | null
          cost_per_enrollment: number | null
          cost_per_qualified: number | null
          cpc: number | null
          cpl: number | null
          cpm: number | null
          ctr_pct: number | null
          enrolled: number | null
          impressions: number | null
          leads: number | null
          platform: string | null
          qualified: number | null
          qualified_rate_pct: number | null
          revenue: number | null
          roas: number | null
          spend: number | null
          status: string | null
        }
        Relationships: []
      }
      v_ads_unified: {
        Row: {
          ad_id: string | null
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          client_id: string | null
          platform: string | null
          status: string | null
        }
        Relationships: []
      }
      v_campaign_performance: {
        Row: {
          campaign_id: string | null
          campaign_name: string | null
          clicks: number | null
          client_id: string | null
          cost_per_enrollment: number | null
          cpl: number | null
          ctr_pct: number | null
          enrolled: number | null
          impressions: number | null
          leads: number | null
          platform: string | null
          qualified: number | null
          qualified_rate_pct: number | null
          revenue: number | null
          roas: number | null
          spend: number | null
        }
        Relationships: []
      }
      v_cohort_conversion: {
        Row: {
          avg_days_to_enroll: number | null
          client_id: string | null
          cohort_month: string | null
          conversion_rate_pct: number | null
          enrolled: number | null
          leads: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
        ]
      }
      v_creative_performance: {
        Row: {
          adset_or_adgroup: string | null
          asset_url: string | null
          campaign: string | null
          clicks: number | null
          client_id: string | null
          cost_per_enrollment: number | null
          cost_per_qualified: number | null
          cpl: number | null
          creative_id: string | null
          creative_name: string | null
          ctr_pct: number | null
          enrolled: number | null
          fatigue_change_pp: number | null
          fatigue_status: string | null
          impressions: number | null
          junk: number | null
          junk_rate_pct: number | null
          leads: number | null
          platform: string | null
          qualified: number | null
          qualified_rate_pct: number | null
          revenue: number | null
          roas: number | null
          spend: number | null
          thumbnail_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creatives_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creatives_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
        ]
      }
      v_daily_leads: {
        Row: {
          client_id: string | null
          connected: number | null
          day: string | null
          demo_attended: number | null
          demo_booked: number | null
          enrolled: number | null
          junk: number | null
          leads: number | null
          qualified: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
        ]
      }
      v_dashboard_summary: {
        Row: {
          avg_follow_up_depth: number | null
          avg_uncalled_hours: number | null
          client_id: string | null
          client_name: string | null
          cpl_30d: number | null
          enrolled_30d: number | null
          leads_30d: number | null
          leads_pop_pct: number | null
          leads_prev_30d: number | null
          median_speed_to_lead_hours: number | null
          qualified_30d: number | null
          qualified_rate_pct: number | null
          revenue_30d: number | null
          roas_30d: number | null
          spend_30d: number | null
        }
        Relationships: []
      }
      v_funnel: {
        Row: {
          client_id: string | null
          connect_rate_pct: number | null
          connected: number | null
          course_id: string | null
          course_name: string | null
          demo_attended: number | null
          demo_booked: number | null
          demo_show_rate_pct: number | null
          enrolled: number | null
          enrollment_rate_pct: number | null
          leads: number | null
          qualified: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "leads_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      v_revenue: {
        Row: {
          client_id: string | null
          month: string | null
          payment_count: number | null
          revenue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
        ]
      }
      v_sales_performance: {
        Row: {
          activities_logged: number | null
          client_id: string | null
          connected: number | null
          demo_attended: number | null
          demo_booked: number | null
          enrolled: number | null
          leads_owned: number | null
          qualified: number | null
          revenue: number | null
          sales_rep_id: string | null
          sales_rep_name: string | null
          total_call_attempts: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_reps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_reps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
        ]
      }
      v_source_performance: {
        Row: {
          client_id: string | null
          enrolled: number | null
          leads: number | null
          qualified: number | null
          qualified_rate_pct: number | null
          revenue: number | null
          source: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
        ]
      }
      v_sync_health: {
        Row: {
          client_id: string | null
          enabled: boolean | null
          error_message: string | null
          frequency: string | null
          is_stale: boolean | null
          job_type: string | null
          last_run_at: string | null
          last_run_completed_at: string | null
          last_run_status: string | null
          next_run_at: string | null
          records_created: number | null
          records_failed: number | null
          records_fetched: number | null
          records_updated: number | null
          sync_job_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
        ]
      }
      v_target_pacing: {
        Row: {
          actual_enrolled: number | null
          actual_leads: number | null
          actual_qualified: number | null
          actual_revenue: number | null
          client_id: string | null
          course_id: string | null
          course_name: string | null
          enrollment_pacing_pct: number | null
          enrollment_target: number | null
          lead_pacing_pct: number | null
          lead_target: number | null
          month: string | null
          qualified_pacing_pct: number | null
          qualified_target: number | null
          revenue_pacing_pct: number | null
          revenue_target: number | null
        }
        Relationships: [
          {
            foreignKeyName: "targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "targets_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      clear_integration_credentials: {
        Args: { p_integration_id: string }
        Returns: undefined
      }
      client_id_for_integration: {
        Args: { p_integration_id: string }
        Returns: string
      }
      create_organization_with_owner: {
        Args: { p_name: string; p_slug: string }
        Returns: string
      }
      fn_campaign_adgroups: {
        Args: {
          p_campaign_id: string
          p_client_id: string
          p_date_from: string
          p_date_to: string
          p_platform: string
        }
        Returns: {
          adset_id: string
          adset_name: string
          clicks: number
          impressions: number
          leads: number
          qualified: number
          spend: number
        }[]
      }
      fn_campaign_ads: {
        Args: {
          p_campaign_id: string
          p_client_id: string
          p_date_from: string
          p_date_to: string
          p_platform: string
        }
        Returns: {
          ad_id: string
          ad_name: string
          clicks: number
          impressions: number
          leads: number
          qualified: number
          spend: number
        }[]
      }
      fn_campaign_creatives: {
        Args: {
          p_campaign_id: string
          p_client_id: string
          p_date_from: string
          p_date_to: string
          p_platform: string
        }
        Returns: {
          asset_url: string
          clicks: number
          creative_id: string
          creative_name: string
          impressions: number
          leads: number
          qualified: number
          spend: number
          thumbnail_url: string
        }[]
      }
      fn_campaign_daily_trend: {
        Args: {
          p_campaign_id: string
          p_client_id: string
          p_date_from: string
          p_date_to: string
          p_platform: string
        }
        Returns: {
          clicks: number
          date: string
          enrolled: number
          impressions: number
          leads: number
          qualified: number
          spend: number
        }[]
      }
      fn_campaign_performance_range: {
        Args: {
          p_campaign_id?: string
          p_client_id: string
          p_course_id?: string
          p_date_from: string
          p_date_to: string
          p_platform?: string
        }
        Returns: {
          campaign_id: string
          campaign_name: string
          clicks: number
          course_code: string
          enrolled: number
          impressions: number
          leads: number
          platform: string
          qualified: number
          revenue: number
          spend: number
          status: string
        }[]
      }
      fn_creative_daily_trend: {
        Args: {
          p_client_id: string
          p_creative_id: string
          p_date_from: string
          p_date_to: string
        }
        Returns: {
          clicks: number
          date: string
          enrolled: number
          impressions: number
          junk: number
          leads: number
          qualified: number
          spend: number
        }[]
      }
      fn_creative_performance_range: {
        Args: {
          p_client_id: string
          p_course_id?: string
          p_date_from: string
          p_date_to: string
          p_platform?: string
        }
        Returns: {
          adset_or_adgroup: string
          asset_url: string
          campaign_name: string
          clicks: number
          course_code: string
          creative_id: string
          creative_name: string
          enrolled: number
          impressions: number
          junk: number
          leads: number
          platform: string
          qualified: number
          revenue: number
          spend: number
          status: string
          thumbnail_url: string
        }[]
      }
      fn_source_performance_range: {
        Args: {
          p_client_id: string
          p_course_id?: string
          p_date_from: string
          p_date_to: string
        }
        Returns: {
          clicks: number
          enrolled: number
          impressions: number
          leads: number
          qualified: number
          revenue: number
          source: string
          spend: number
        }[]
      }
      get_integration_credentials: {
        Args: { p_integration_id: string }
        Returns: {
          encrypted_access_token_b64: string
          encrypted_refresh_token_b64: string
          expires_at: string
          integration_id: string
          metadata: Json
          scopes: string[]
        }[]
      }
      has_client_access: { Args: { p_client_id: string }; Returns: boolean }
      has_client_write_access: {
        Args: { p_client_id: string }
        Returns: boolean
      }
      is_org_admin: { Args: { p_org_id: string }; Returns: boolean }
      is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      seed_default_lead_statuses: {
        Args: { p_client_id: string }
        Returns: undefined
      }
      upsert_integration_credentials: {
        Args: {
          p_encrypted_access_token_b64: string
          p_encrypted_refresh_token_b64?: string
          p_expires_at?: string
          p_integration_id: string
          p_metadata?: Json
          p_scopes?: string[]
        }
        Returns: undefined
      }
      upsert_lead_from_meritto_payload: {
        Args: { p_event_type?: string; p_payload: Json }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
