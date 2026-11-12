/**
 * Нэми DB төрлүүд — supabase/migrations-тэй гараар тааруулсан.
 *
 * Docker эсвэл personal access token гармагц автоматаар дахин үүсгэнэ:
 *   supabase gen types typescript --project-id nvwacpfnhgbbvnfqyptd > types/database.ts
 *   # эсвэл (Docker-тэй): --db-url "<pooler-url>"
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          phone: string | null;
          email: string | null;
          role: Database["public"]["Enums"]["user_role"];
          office_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          email?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          office_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          email?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          office_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      offices: {
        Row: {
          id: string;
          legacy_id: string | null;
          name: string;
          logo: string | null;
          color: string | null;
          verified: boolean;
          agents_count: number;
          listings_count: number;
          description: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
          about: string | null;
          website: string | null;
          founded_year: number | null;
          logo_url: string | null;
          cover_url: string | null;
          license_no: string | null;
          facebook: string | null;
          instagram: string | null;
          specialties: string[];
          service_areas: string[];
          watermark_enabled: boolean;
          watermark_logo_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          legacy_id?: string | null;
          name: string;
          logo?: string | null;
          color?: string | null;
          verified?: boolean;
          agents_count?: number;
          listings_count?: number;
          description?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          about?: string | null;
          website?: string | null;
          founded_year?: number | null;
          logo_url?: string | null;
          cover_url?: string | null;
          license_no?: string | null;
          facebook?: string | null;
          instagram?: string | null;
          specialties?: string[];
          service_areas?: string[];
          watermark_enabled?: boolean;
          watermark_logo_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          legacy_id?: string | null;
          name?: string;
          logo?: string | null;
          color?: string | null;
          verified?: boolean;
          agents_count?: number;
          listings_count?: number;
          description?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          about?: string | null;
          website?: string | null;
          founded_year?: number | null;
          logo_url?: string | null;
          cover_url?: string | null;
          license_no?: string | null;
          facebook?: string | null;
          instagram?: string | null;
          specialties?: string[];
          service_areas?: string[];
          watermark_enabled?: boolean;
          watermark_logo_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      agents: {
        Row: {
          id: string;
          legacy_id: string | null;
          profile_id: string | null;
          office_id: string | null;
          display_name: string;
          phone: string | null;
          avatar: string | null;
          avatar_url: string | null;
          rating: number | null;
          reviews_count: number;
          years: number | null;
          sold: number;
          listings_count: number;
          verified: boolean;
          premier: boolean;
          response_time: string | null;
          languages: string[];
          areas: string[];
          specialty: string | null;
          bio: string | null;
          sub_ratings: Json | null;
          status: Database["public"]["Enums"]["agent_status"];
          created_at: string;
        };
        Insert: {
          id?: string;
          legacy_id?: string | null;
          profile_id?: string | null;
          office_id?: string | null;
          status?: Database["public"]["Enums"]["agent_status"];
          display_name: string;
          phone?: string | null;
          avatar?: string | null;
          avatar_url?: string | null;
          rating?: number | null;
          reviews_count?: number;
          years?: number | null;
          sold?: number;
          listings_count?: number;
          verified?: boolean;
          premier?: boolean;
          response_time?: string | null;
          languages?: string[];
          areas?: string[];
          specialty?: string | null;
          bio?: string | null;
          sub_ratings?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["agents"]["Insert"]>;
        Relationships: [];
      };
      listings: {
        Row: {
          id: string;
          legacy_id: string | null;
          agent_id: string | null;
          title: string;
          district: string | null;
          type: string | null;
          rooms: number;
          area: number | null;
          floor: string | null;
          price: number;
          price_per_m2: number | null;
          year: number | null;
          parking: number;
          status: Database["public"]["Enums"]["listing_status"];
          verified: boolean;
          hot: boolean;
          featured: boolean;
          shared: boolean;
          description: string | null;
          amenities: string[];
          ai_score: number | null;
          ai_note: string | null;
          location: unknown | null;
          photo: string | null;
          deal_type: Database["public"]["Enums"]["deal_type"];
          rent_advance_months: number | null;
          rent_deposit_months: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          legacy_id?: string | null;
          agent_id?: string | null;
          title: string;
          district?: string | null;
          type?: string | null;
          rooms?: number;
          area?: number | null;
          floor?: string | null;
          price: number;
          price_per_m2?: number | null;
          year?: number | null;
          parking?: number;
          status?: Database["public"]["Enums"]["listing_status"];
          verified?: boolean;
          hot?: boolean;
          featured?: boolean;
          shared?: boolean;
          description?: string | null;
          amenities?: string[];
          ai_score?: number | null;
          ai_note?: string | null;
          location?: unknown | null;
          photo?: string | null;
          deal_type?: Database["public"]["Enums"]["deal_type"];
          rent_advance_months?: number | null;
          rent_deposit_months?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listings"]["Insert"]>;
        Relationships: [];
      };
      listing_photos: {
        Row: {
          id: string;
          listing_id: string;
          url: string;
          sort_order: number;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          url: string;
          sort_order?: number;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listing_photos"]["Insert"]>;
        Relationships: [];
      };
      listing_shares: {
        Row: {
          id: string;
          listing_id: string;
          agent_id: string;
          shared_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          agent_id: string;
          shared_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listing_shares"]["Insert"]>;
        Relationships: [];
      };
      ai_valuations: {
        Row: {
          id: string;
          listing_id: string;
          score: number | null;
          note: string | null;
          model: string | null;
          raw: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          score?: number | null;
          note?: string | null;
          model?: string | null;
          raw?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_valuations"]["Insert"]>;
        Relationships: [];
      };
      favorites: {
        Row: { user_id: string; listing_id: string; created_at: string };
        Insert: { user_id: string; listing_id: string; created_at?: string };
        Update: { user_id?: string; listing_id?: string; created_at?: string };
        Relationships: [];
      };
      saved_searches: {
        Row: {
          id: string;
          user_id: string;
          name: string | null;
          filters: Json;
          alert_enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name?: string | null;
          filters: Json;
          alert_enabled?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["saved_searches"]["Insert"]>;
        Relationships: [];
      };
      recently_viewed: {
        Row: { user_id: string; listing_id: string; viewed_at: string };
        Insert: { user_id: string; listing_id: string; viewed_at?: string };
        Update: { user_id?: string; listing_id?: string; viewed_at?: string };
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          legacy_id: string | null;
          agent_id: string;
          listing_id: string | null;
          name: string;
          phone: string | null;
          source: Database["public"]["Enums"]["lead_source"];
          stage: Database["public"]["Enums"]["lead_stage"];
          score: number | null;
          note: string | null;
          last_touch: string | null;
          last_activity_at: string | null;
          project_id: string | null;
          created_at: string;
          migrated_crm_lead_id: string | null;
          migrated_at: string | null;
        };
        Insert: {
          id?: string;
          legacy_id?: string | null;
          agent_id: string;
          listing_id?: string | null;
          name: string;
          phone?: string | null;
          source?: Database["public"]["Enums"]["lead_source"];
          stage?: Database["public"]["Enums"]["lead_stage"];
          score?: number | null;
          note?: string | null;
          last_touch?: string | null;
          last_activity_at?: string | null;
          project_id?: string | null;
          created_at?: string;
          migrated_crm_lead_id?: string | null;
          migrated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
      lead_activities: {
        Row: {
          id: string;
          agent_id: string;
          lead_id: string | null;
          project_id: string | null;
          kind: Database["public"]["Enums"]["activity_kind"];
          summary: string;
          outcome: string | null;
          duration_min: number | null;
          occurred_at: string;
          created_at: string;
          migrated_crm_activity_id: string | null;
        };
        Insert: {
          id?: string;
          agent_id: string;
          lead_id?: string | null;
          project_id?: string | null;
          kind?: Database["public"]["Enums"]["activity_kind"];
          summary: string;
          outcome?: string | null;
          duration_min?: number | null;
          occurred_at?: string;
          created_at?: string;
          migrated_crm_activity_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["lead_activities"]["Insert"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          agent_id: string;
          title: string;
          client_name: string | null;
          client_phone: string | null;
          type: Database["public"]["Enums"]["project_type"];
          status: Database["public"]["Enums"]["project_status"];
          budget_min: number | null;
          budget_max: number | null;
          target_area: string | null;
          deadline: string | null;
          note: string | null;
          last_activity_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          title: string;
          client_name?: string | null;
          client_phone?: string | null;
          type?: Database["public"]["Enums"]["project_type"];
          status?: Database["public"]["Enums"]["project_status"];
          budget_min?: number | null;
          budget_max?: number | null;
          target_area?: string | null;
          deadline?: string | null;
          note?: string | null;
          last_activity_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          office_id: string;
          created_by: string;
          responsible_id: string;
          title: string;
          description: string | null;
          status: Database["public"]["Enums"]["task_status"];
          priority: Database["public"]["Enums"]["task_priority"];
          deadline: string | null;
          project_id: string | null;
          tags: string[];
          completed_at: string | null;
          last_activity_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          created_by: string;
          responsible_id: string;
          title: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          priority?: Database["public"]["Enums"]["task_priority"];
          deadline?: string | null;
          project_id?: string | null;
          tags?: string[];
          completed_at?: string | null;
          last_activity_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
        Relationships: [];
      };
      task_members: {
        Row: {
          task_id: string;
          profile_id: string;
          role: Database["public"]["Enums"]["task_member_role"];
          created_at: string;
        };
        Insert: {
          task_id: string;
          profile_id: string;
          role?: Database["public"]["Enums"]["task_member_role"];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["task_members"]["Insert"]>;
        Relationships: [];
      };
      task_comments: {
        Row: {
          id: string;
          task_id: string;
          author_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          author_id: string;
          body: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["task_comments"]["Insert"]>;
        Relationships: [];
      };
      task_checklist_items: {
        Row: {
          id: string;
          task_id: string;
          label: string;
          done: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          label: string;
          done?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["task_checklist_items"]["Insert"]>;
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          legacy_id: string | null;
          listing_id: string | null;
          buyer_id: string | null;
          agent_id: string | null;
          last_message_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          legacy_id?: string | null;
          listing_id?: string | null;
          buyer_id?: string | null;
          agent_id?: string | null;
          last_message_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["conversations"]["Insert"]>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string | null;
          sender_role: string | null;
          body: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id?: string | null;
          sender_role?: string | null;
          body: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [];
      };
      viewings: {
        Row: {
          id: string;
          legacy_id: string | null;
          listing_id: string;
          agent_id: string | null;
          buyer_id: string | null;
          scheduled_at: string | null;
          status: Database["public"]["Enums"]["viewing_status"];
          created_at: string;
        };
        Insert: {
          id?: string;
          legacy_id?: string | null;
          listing_id: string;
          agent_id?: string | null;
          buyer_id?: string | null;
          scheduled_at?: string | null;
          status?: Database["public"]["Enums"]["viewing_status"];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["viewings"]["Insert"]>;
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          agent_id: string;
          author_id: string | null;
          author_name: string | null;
          listing_id: string | null;
          area: string | null;
          deal_type: string | null;
          rating: number | null;
          sub_ratings: Json | null;
          text: string | null;
          verified: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          author_id?: string | null;
          author_name?: string | null;
          listing_id?: string | null;
          area?: string | null;
          deal_type?: string | null;
          rating?: number | null;
          sub_ratings?: Json | null;
          text?: string | null;
          verified?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reviews"]["Insert"]>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          agent_id: string;
          plan: string;
          status: Database["public"]["Enums"]["subscription_status"];
          current_period_end: string | null;
          qpay_invoice_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          plan: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          current_period_end?: string | null;
          qpay_invoice_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          subscription_id: string | null;
          agent_id: string | null;
          amount: number;
          currency: string;
          qpay_payment_id: string | null;
          status: string | null;
          paid_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          subscription_id?: string | null;
          agent_id?: string | null;
          amount: number;
          currency?: string;
          qpay_payment_id?: string | null;
          status?: string | null;
          paid_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [];
      };
      office_invites: {
        Row: {
          id: string;
          token: string;
          office_id: string;
          email: string | null;
          created_by: string | null;
          expires_at: string | null;
          used_by: string | null;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          token: string;
          office_id: string;
          email?: string | null;
          created_by?: string | null;
          expires_at?: string | null;
          used_by?: string | null;
          used_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["office_invites"]["Insert"]>;
        Relationships: [];
      };
      office_requests: {
        Row: {
          id: string;
          requester_id: string;
          name: string;
          phone: string | null;
          note: string | null;
          status: Database["public"]["Enums"]["office_request_status"];
          office_id: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          name: string;
          phone?: string | null;
          note?: string | null;
          status?: Database["public"]["Enums"]["office_request_status"];
          office_id?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["office_requests"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string | null;
          title: string | null;
          body: string | null;
          link: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type?: string | null;
          title?: string | null;
          body?: string | null;
          link?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [];
      };
      // ═══════════════════════════════════════════════════════
      // PMC CRM — нэгж бүр ӨӨРИЙН бүсдээ хүснэгтийн entry-гээ нэмнэ
      // (append-only; өөр нэгжийн бүсэд гар бүү хүр — DESIGN §2 төгсгөл).
      // ═══════════════════════════════════════════════════════
      // === U1: crm-foundation ===
      crm_branches: {
        Row: {
          id: string;
          office_id: string;
          code: string;
          name: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          code: string;
          name: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_branches"]["Insert"]>;
        Relationships: [];
      };
      crm_teams: {
        Row: {
          id: string;
          office_id: string;
          branch_id: string;
          name: string;
          lead_profile_id: string | null;
          // 20261110000100: ахлагчийн санал (оффисын админ батална). profiles руу FK-гүй — embed хийхгүй.
          pending_lead_profile_id: string | null;
          lead_proposed_by: string | null;
          lead_proposed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          branch_id: string;
          name: string;
          lead_profile_id?: string | null;
          pending_lead_profile_id?: string | null;
          lead_proposed_by?: string | null;
          lead_proposed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_teams"]["Insert"]>;
        Relationships: [];
      };
      crm_staff: {
        Row: {
          id: string;
          office_id: string;
          profile_id: string;
          branch_id: string | null;
          team_id: string | null;
          roles: Database["public"]["Enums"]["crm_role"][];
          is_active: boolean;
          offboarding: boolean;
          panel_admin: boolean;
          // U4 (20261107001300): чөлөө, орлон ажиллагч
          on_leave_from: string | null;
          on_leave_to: string | null;
          leave_substitute_id: string | null;
          leave_note: string | null;
          // U6 (20261107001700): ажилд орсон, гарсан огноо
          hired_on: string | null;
          left_on: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          profile_id: string;
          branch_id?: string | null;
          team_id?: string | null;
          roles?: Database["public"]["Enums"]["crm_role"][];
          is_active?: boolean;
          offboarding?: boolean;
          panel_admin?: boolean;
          on_leave_from?: string | null;
          on_leave_to?: string | null;
          leave_substitute_id?: string | null;
          leave_note?: string | null;
          hired_on?: string | null;
          left_on?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_staff"]["Insert"]>;
        Relationships: [];
      };
      crm_lookups: {
        Row: {
          id: string;
          office_id: string;
          kind: string;
          code: string;
          label: string;
          requires_note: boolean;
          sort_order: number;
          is_active: boolean;
          tag_group: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          kind: string;
          code: string;
          label: string;
          requires_note?: boolean;
          sort_order?: number;
          is_active?: boolean;
          tag_group?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_lookups"]["Insert"]>;
        Relationships: [];
      };
      crm_settings: {
        Row: {
          id: string;
          office_id: string;
          key: string;
          value: Json;
          valid_from: string;
          valid_to: string | null;
          created_by: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          key: string;
          value: Json;
          valid_from?: string;
          valid_to?: string | null;
          created_by: string;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_settings"]["Insert"]>;
        Relationships: [];
      };
      crm_calendar_days: {
        Row: {
          office_id: string;
          day: string;
          is_workday: boolean;
          note: string | null;
        };
        Insert: {
          office_id: string;
          day: string;
          is_workday: boolean;
          note?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_calendar_days"]["Insert"]>;
        Relationships: [];
      };
      crm_sequences: {
        Row: {
          office_id: string;
          kind: string;
          prefix: string;
          next_no: number;
          pad: number;
        };
        Insert: {
          office_id: string;
          kind: string;
          prefix: string;
          next_no?: number;
          pad?: number;
        };
        Update: Partial<Database["public"]["Tables"]["crm_sequences"]["Insert"]>;
        Relationships: [];
      };
      crm_zone_directory: {
        Row: {
          id: string;
          office_id: string;
          district: string;
          khoroo: string | null;
          complex: string | null;
          branch_id: string;
          decided_by: string | null;
          decided_at: string | null;
          rationale: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          district: string;
          khoroo?: string | null;
          complex?: string | null;
          branch_id: string;
          decided_by?: string | null;
          decided_at?: string | null;
          rationale?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_zone_directory"]["Insert"]>;
        Relationships: [];
      };
      crm_pipelines: {
        Row: {
          id: string;
          office_id: string;
          code: string;
          name: string;
          restricted: boolean;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          code: string;
          name: string;
          restricted?: boolean;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_pipelines"]["Insert"]>;
        Relationships: [];
      };
      crm_stages: {
        Row: {
          id: string;
          office_id: string;
          pipeline_id: string;
          code: string;
          name: string;
          sort_order: number;
          probability: number;
          gate_code: Database["public"]["Enums"]["crm_gate_code"] | null;
          is_terminal: boolean;
          terminal_state: Database["public"]["Enums"]["crm_opp_state"] | null;
          is_closing_direction: boolean;
          created_at: string;
          guidance: string | null;
        };
        Insert: {
          id?: string;
          office_id: string;
          pipeline_id: string;
          code: string;
          name: string;
          sort_order: number;
          probability?: number;
          gate_code?: Database["public"]["Enums"]["crm_gate_code"] | null;
          is_terminal?: boolean;
          terminal_state?: Database["public"]["Enums"]["crm_opp_state"] | null;
          is_closing_direction?: boolean;
          created_at?: string;
          guidance?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_stages"]["Insert"]>;
        Relationships: [];
      };
      crm_stage_transitions: {
        Row: {
          id: string;
          office_id: string;
          pipeline_id: string;
          from_stage_id: string;
          to_stage_id: string;
          kind: string;
          allowed_roles: Database["public"]["Enums"]["crm_role"][];
          requires_reason: boolean;
        };
        Insert: {
          id?: string;
          office_id: string;
          pipeline_id: string;
          from_stage_id: string;
          to_stage_id: string;
          kind?: string;
          allowed_roles?: Database["public"]["Enums"]["crm_role"][];
          requires_reason?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["crm_stage_transitions"]["Insert"]>;
        Relationships: [];
      };
      crm_gate_requirements: {
        Row: {
          id: string;
          office_id: string;
          gate_code: Database["public"]["Enums"]["crm_gate_code"];
          pipeline_id: string | null;
          checker_kind: string;
          params: Json;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          office_id: string;
          gate_code: Database["public"]["Enums"]["crm_gate_code"];
          pipeline_id?: string | null;
          checker_kind: string;
          params?: Json;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["crm_gate_requirements"]["Insert"]>;
        Relationships: [];
      };
      crm_audit_log: {
        Row: {
          id: number;
          office_id: string;
          actor_id: string | null;
          entity: string;
          entity_id: string;
          action: string;
          field: string | null;
          old_value: Json | null;
          new_value: Json | null;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          office_id: string;
          actor_id?: string | null;
          entity: string;
          entity_id: string;
          action: string;
          field?: string | null;
          old_value?: Json | null;
          new_value?: Json | null;
          reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_audit_log"]["Insert"]>;
        Relationships: [];
      };
      crm_duty_shifts: {
        Row: {
          id: string;
          office_id: string;
          branch_id: string | null;
          profile_id: string;
          starts_at: string;
          ends_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          branch_id?: string | null;
          profile_id: string;
          starts_at: string;
          ends_at: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_duty_shifts"]["Insert"]>;
        Relationships: [];
      };
      crm_assignment_state: {
        Row: {
          office_id: string;
          scope: string;
          last_assigned_profile_id: string | null;
          queue: Json;
          updated_at: string;
        };
        Insert: {
          office_id: string;
          scope?: string;
          last_assigned_profile_id?: string | null;
          queue?: Json;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_assignment_state"]["Insert"]>;
        Relationships: [];
      };
      crm_automation_rules: {
        Row: {
          id: string;
          office_id: string;
          code: string;
          name: string;
          trigger_kind: string;
          condition: Json;
          actions: Json;
          is_active: boolean;
          dry_run: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          code: string;
          name: string;
          trigger_kind: string;
          condition?: Json;
          actions: Json;
          is_active?: boolean;
          dry_run?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_automation_rules"]["Insert"]>;
        Relationships: [];
      };
      crm_rule_runs: {
        Row: {
          id: number;
          office_id: string;
          rule_code: string;
          entity: string | null;
          entity_id: string | null;
          status: string;
          result: Json | null;
          error: string | null;
          ran_at: string;
        };
        Insert: {
          office_id: string;
          rule_code: string;
          entity?: string | null;
          entity_id?: string | null;
          status?: string;
          result?: Json | null;
          error?: string | null;
          ran_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_rule_runs"]["Insert"]>;
        Relationships: [];
      };
      crm_notification_matrix: {
        Row: {
          id: string;
          office_id: string;
          event_code: string;
          recipient_roles: Database["public"]["Enums"]["crm_role"][];
          channels: string[];
          mandatory: boolean;
          quiet_hours_exempt: boolean;
          escalation: Json | null;
        };
        Insert: {
          id?: string;
          office_id: string;
          event_code: string;
          recipient_roles: Database["public"]["Enums"]["crm_role"][];
          channels?: string[];
          mandatory?: boolean;
          quiet_hours_exempt?: boolean;
          escalation?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_notification_matrix"]["Insert"]>;
        Relationships: [];
      };
      crm_notification_prefs: {
        Row: {
          profile_id: string;
          office_id: string;
          event_code: string;
          channels: string[];
        };
        Insert: {
          profile_id: string;
          office_id: string;
          event_code: string;
          channels: string[];
        };
        Update: Partial<Database["public"]["Tables"]["crm_notification_prefs"]["Insert"]>;
        Relationships: [];
      };
      // === U2: crm-contacts-leads — өөрийн хүснэгтүүдээ ЭНД нэм ===
      crm_contacts: {
        Row: {
          id: string;
          office_id: string;
          number: string;
          kind: Database["public"]["Enums"]["crm_contact_kind"];
          last_name: string | null;
          first_name: string | null;
          org_name: string | null;
          display_name: string;
          contact_types: Database["public"]["Enums"]["crm_contact_type"][];
          source_id: string | null;
          source_detail: string | null;
          branch_id: string | null;
          lifecycle: Database["public"]["Enums"]["crm_lifecycle"];
          consent: Database["public"]["Enums"]["crm_consent_status"];
          consent_at: string | null;
          consent_channel: string | null;
          kyc_public_status: Database["public"]["Enums"]["crm_kyc_status"];
          is_repeat: boolean;
          merged_into_id: string | null;
          privacy_level: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          number: string;
          kind?: Database["public"]["Enums"]["crm_contact_kind"];
          last_name?: string | null;
          first_name?: string | null;
          org_name?: string | null;
          display_name: string;
          contact_types?: Database["public"]["Enums"]["crm_contact_type"][];
          source_id?: string | null;
          source_detail?: string | null;
          branch_id?: string | null;
          lifecycle?: Database["public"]["Enums"]["crm_lifecycle"];
          consent?: Database["public"]["Enums"]["crm_consent_status"];
          consent_at?: string | null;
          consent_channel?: string | null;
          kyc_public_status?: Database["public"]["Enums"]["crm_kyc_status"];
          is_repeat?: boolean;
          merged_into_id?: string | null;
          privacy_level?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_contacts"]["Insert"]>;
        Relationships: [];
      };
      crm_contact_phones: {
        Row: {
          id: string;
          office_id: string;
          contact_id: string;
          raw: string;
          normalized: string;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          contact_id: string;
          raw: string;
          normalized?: string;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_contact_phones"]["Insert"]>;
        Relationships: [];
      };
      crm_contact_emails: {
        Row: {
          id: string;
          office_id: string;
          contact_id: string;
          email: string;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          contact_id: string;
          email: string;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_contact_emails"]["Insert"]>;
        Relationships: [];
      };
      crm_contact_tags: {
        Row: {
          contact_id: string;
          lookup_id: string;
          office_id: string;
          created_at: string;
        };
        Insert: {
          contact_id: string;
          lookup_id: string;
          office_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_contact_tags"]["Insert"]>;
        Relationships: [];
      };
      crm_contact_aml: {
        Row: {
          contact_id: string;
          office_id: string;
          kyc_status: Database["public"]["Enums"]["crm_kyc_status"];
          risk: Database["public"]["Enums"]["crm_aml_risk"] | null;
          risk_score: number | null;
          pep_status: string | null;
          sanctions_checked_at: string | null;
          sanctions_result: string | null;
          ubo_verified: string | null;
          funds_source: string | null;
          funds_evidence_doc_id: string | null;
          payment_method: string | null;
          third_party_payer: boolean | null;
          third_party_note: string | null;
          red_flags: string[] | null;
          officer_decision: string | null;
          reporting_status: string | null;
          next_review_at: string | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          contact_id: string;
          office_id: string;
          kyc_status?: Database["public"]["Enums"]["crm_kyc_status"];
          risk?: Database["public"]["Enums"]["crm_aml_risk"] | null;
          risk_score?: number | null;
          pep_status?: string | null;
          sanctions_checked_at?: string | null;
          sanctions_result?: string | null;
          ubo_verified?: string | null;
          funds_source?: string | null;
          funds_evidence_doc_id?: string | null;
          payment_method?: string | null;
          third_party_payer?: boolean | null;
          third_party_note?: string | null;
          red_flags?: string[] | null;
          officer_decision?: string | null;
          reporting_status?: string | null;
          next_review_at?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_contact_aml"]["Insert"]>;
        Relationships: [];
      };
      crm_contact_merges: {
        Row: {
          id: string;
          office_id: string;
          primary_id: string;
          merged_id: string;
          secondary_source: Json | null;
          field_choices: Json;
          decided_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          primary_id: string;
          merged_id: string;
          secondary_source?: Json | null;
          field_choices: Json;
          decided_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_contact_merges"]["Insert"]>;
        Relationships: [];
      };
      crm_leads: {
        Row: {
          id: string;
          office_id: string;
          contact_id: string;
          branch_id: string | null;
          owner_id: string | null;
          source_id: string | null;
          source_detail: string | null;
          received_at: string | null;
          campaign_code: string | null;
          channel_ref: string | null;
          status: Database["public"]["Enums"]["crm_lifecycle"];
          grade: Database["public"]["Enums"]["crm_lead_grade"] | null;
          grade_override_reason: string | null;
          score: number | null;
          score_breakdown: Json | null;
          last_contact_at: string | null;
          next_step: string | null;
          next_step_task_id: string | null;
          next_step_date: string | null;
          first_contact_due_at: string | null;
          first_contact_at: string | null;
          unprotected: boolean;
          inactivity_days: number;
          // U4 (20261107001300): эзэмшлийн хугацаа, хүлээн авах, эргэлт
          owner_assigned_at: string | null;
          accept_due_at: string | null;
          accepted_at: string | null;
          recycled_at: string | null;
          recycled_by: string | null;
          recycle_reason: string | null;
          // U6 (20261107001600): ангилал шинэчлэгдсэн огноо
          grade_reviewed_at: string | null;
          // 20261109000100: сэжмийн зар (хэлбэр: lib/crm/lead-listing.ts)
          listing_id: string | null;
          listing_snapshot: Json | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          contact_id: string;
          branch_id?: string | null;
          owner_id?: string | null;
          source_id?: string | null;
          source_detail?: string | null;
          received_at?: string | null;
          owner_assigned_at?: string | null;
          accept_due_at?: string | null;
          accepted_at?: string | null;
          recycled_at?: string | null;
          recycled_by?: string | null;
          recycle_reason?: string | null;
          grade_reviewed_at?: string | null;
          listing_id?: string | null;
          listing_snapshot?: Json | null;
          campaign_code?: string | null;
          channel_ref?: string | null;
          status?: Database["public"]["Enums"]["crm_lifecycle"];
          grade?: Database["public"]["Enums"]["crm_lead_grade"] | null;
          grade_override_reason?: string | null;
          score?: number | null;
          score_breakdown?: Json | null;
          last_contact_at?: string | null;
          next_step?: string | null;
          next_step_task_id?: string | null;
          next_step_date?: string | null;
          first_contact_due_at?: string | null;
          first_contact_at?: string | null;
          unprotected?: boolean;
          inactivity_days?: number;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_leads"]["Insert"]>;
        Relationships: [];
      };
      crm_ownership_history: {
        Row: {
          id: string;
          office_id: string;
          entity: string;
          entity_id: string;
          old_owner_id: string | null;
          new_owner_id: string | null;
          reason_code: string;
          note: string | null;
          decided_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          entity: string;
          entity_id: string;
          old_owner_id?: string | null;
          new_owner_id?: string | null;
          reason_code: string;
          note?: string | null;
          decided_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_ownership_history"]["Insert"]>;
        Relationships: [];
      };
      crm_saved_views: {
        Row: {
          id: string;
          office_id: string;
          profile_id: string;
          page: string;
          name: string;
          params: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          profile_id: string;
          page: string;
          name: string;
          params: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_saved_views"]["Insert"]>;
        Relationships: [];
      };
      // ⚠️ crm_need_profiles / crm_owner_profiles хүснэгтүүд 20260901000250_crm_profiles.sql
      // (U4-ийн үүсгэсэн, 000300-ийн crm_matches FK-ээс ӨМНӨ)-д үүсдэг — U2-ийн
      // crm-profiles action/query-ууд ашигладаг тул төрлийг ЭНД нэмэв. ДАВХАРДУУЛЖ БҮҮ нэм.
      crm_need_profiles: {
        Row: {
          id: string;
          office_id: string;
          contact_id: string;
          profile_type: string;
          goal_id: string | null;
          locations: Json;
          property_types: string[];
          budget_min: number | null;
          budget_target: number | null;
          budget_max: number;
          financing: string;
          rooms_min: number | null;
          area_min: number | null;
          conditions: string[] | null;
          timeline: string;
          move_in_date: string | null;
          must_haves: Json;
          nice_to_haves: Json;
          deal_breakers: Json;
          decision_maker: string | null;
          blocker: string | null;
          rooms_target: number | null;
          area_target: number | null;
          decision_maker_id: string | null;
          decision_maker_involved: boolean | null;
          blocker_id: string | null;
          blocker_note: string | null;
          budget_overrun_approved: boolean;
          budget_overrun_max: number | null;
          occupant_kind: string | null;
          occupant_note: string | null;
          status: Database["public"]["Enums"]["crm_profile_status"];
          paused_until: string | null;
          lost_reason_id: string | null;
          fulfilled_txn_id: string | null;
          completeness_pct: number | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          contact_id: string;
          profile_type: string;
          goal_id?: string | null;
          locations: Json;
          property_types: string[];
          budget_min?: number | null;
          budget_target?: number | null;
          budget_max: number;
          financing: string;
          rooms_min?: number | null;
          area_min?: number | null;
          conditions?: string[] | null;
          timeline: string;
          move_in_date?: string | null;
          must_haves?: Json;
          nice_to_haves?: Json;
          deal_breakers?: Json;
          decision_maker?: string | null;
          blocker?: string | null;
          rooms_target?: number | null;
          area_target?: number | null;
          decision_maker_id?: string | null;
          decision_maker_involved?: boolean | null;
          blocker_id?: string | null;
          blocker_note?: string | null;
          budget_overrun_approved?: boolean;
          budget_overrun_max?: number | null;
          occupant_kind?: string | null;
          occupant_note?: string | null;
          status?: Database["public"]["Enums"]["crm_profile_status"];
          paused_until?: string | null;
          lost_reason_id?: string | null;
          fulfilled_txn_id?: string | null;
          completeness_pct?: number | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_need_profiles"]["Insert"]>;
        Relationships: [];
      };
      crm_owner_profiles: {
        Row: {
          id: string;
          office_id: string;
          contact_id: string;
          property_id: string | null;
          goal: string;
          asking_price: number;
          terms: string | null;
          urgency: string | null;
          urgency_note: string | null;
          decision_authority: string;
          listing_state: string;
          status: Database["public"]["Enums"]["crm_profile_status"];
          paused_until: string | null;
          lost_reason_id: string | null;
          fulfilled_txn_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          contact_id: string;
          property_id?: string | null;
          goal: string;
          asking_price: number;
          terms?: string | null;
          urgency?: string | null;
          urgency_note?: string | null;
          decision_authority: string;
          listing_state?: string;
          status?: Database["public"]["Enums"]["crm_profile_status"];
          paused_until?: string | null;
          lost_reason_id?: string | null;
          fulfilled_txn_id?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_owner_profiles"]["Insert"]>;
        Relationships: [];
      };
      // === U3: crm-properties-matching — өөрийн хүснэгтүүдээ ЭНД нэм ===
      crm_properties: {
        Row: {
          id: string;
          office_id: string;
          number: string;
          name: string;
          address: Json;
          branch_id: string | null;
          branch_override_reason: string | null;
          service_kind: Database["public"]["Enums"]["crm_service_kind"];
          property_type: string;
          zone_id: string | null;
          price: number | null;
          rent_price: number | null;
          area_m2: number | null;
          rooms: number | null;
          status: Database["public"]["Enums"]["crm_property_status"];
          occupancy: Database["public"]["Enums"]["crm_occupancy_status"] | null;
          vacancy_started_on: string | null;
          owner_contact_id: string;
          active_lease_id: string | null;
          management_agreement_id: string | null;
          payment_day: number | null;
          features: string[];
          match_tags: Json | null;
          key_location: string | null;
          key_holder_id: string | null;
          listing_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          activated_at: string | null;
        };
        Insert: {
          id?: string;
          office_id: string;
          number: string;
          name: string;
          address: Json;
          branch_id?: string | null;
          branch_override_reason?: string | null;
          service_kind: Database["public"]["Enums"]["crm_service_kind"];
          property_type: string;
          zone_id?: string | null;
          price?: number | null;
          rent_price?: number | null;
          area_m2?: number | null;
          rooms?: number | null;
          status?: Database["public"]["Enums"]["crm_property_status"];
          occupancy?: Database["public"]["Enums"]["crm_occupancy_status"] | null;
          vacancy_started_on?: string | null;
          owner_contact_id: string;
          active_lease_id?: string | null;
          management_agreement_id?: string | null;
          payment_day?: number | null;
          features?: string[];
          match_tags?: Json | null;
          key_location?: string | null;
          key_holder_id?: string | null;
          listing_id?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_properties"]["Insert"]>;
        Relationships: [];
      };
      crm_property_price_history: {
        Row: {
          id: string;
          office_id: string;
          property_id: string;
          field: string;
          old_value: number | null;
          new_value: number | null;
          reason: string | null;
          changed_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          property_id: string;
          field: string;
          old_value?: number | null;
          new_value?: number | null;
          reason?: string | null;
          changed_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_property_price_history"]["Insert"]>;
        Relationships: [];
      };
      crm_property_roles: {
        Row: {
          id: string;
          office_id: string;
          property_id: string;
          role: Database["public"]["Enums"]["crm_property_role"];
          agent_profile_id: string;
          assigned_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          property_id: string;
          role: Database["public"]["Enums"]["crm_property_role"];
          agent_profile_id: string;
          assigned_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_property_roles"]["Insert"]>;
        Relationships: [];
      };
      crm_listing_agreements: {
        Row: {
          id: string;
          office_id: string;
          property_id: string;
          number: string;
          signed_on: string;
          expires_on: string;
          special_terms: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          property_id: string;
          number: string;
          signed_on: string;
          expires_on: string;
          special_terms?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_listing_agreements"]["Insert"]>;
        Relationships: [];
      };
      crm_vacancy_periods: {
        Row: {
          id: string;
          office_id: string;
          property_id: string;
          started_on: string;
          ended_on: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          property_id: string;
          started_on: string;
          ended_on?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_vacancy_periods"]["Insert"]>;
        Relationships: [];
      };
      crm_meters: {
        Row: {
          id: string;
          office_id: string;
          property_id: string;
          meter_type: string;
          serial: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          property_id: string;
          meter_type: string;
          serial?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_meters"]["Insert"]>;
        Relationships: [];
      };
      crm_meter_readings: {
        Row: {
          id: string;
          office_id: string;
          meter_id: string;
          reading: number;
          read_on: string;
          photo_doc_id: string | null;
          inspection_id: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          meter_id: string;
          reading: number;
          read_on: string;
          photo_doc_id?: string | null;
          inspection_id?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_meter_readings"]["Insert"]>;
        Relationships: [];
      };
      crm_matches: {
        Row: {
          id: string;
          office_id: string;
          need_profile_id: string;
          property_id: string;
          direction: string;
          score: number;
          breakdown: Json;
          strength: string;
          deal_breaker_hit: boolean;
          deal_breaker_reasons: string[];
          manual_override_reason: string | null;
          weights_setting_id: string | null;
          suggested_at: string | null;
          suggested_by: string | null;
          response: Database["public"]["Enums"]["crm_match_response"] | null;
          response_reason: string | null;
          responded_at: string | null;
          computed_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          need_profile_id: string;
          property_id: string;
          direction?: string;
          score: number;
          breakdown: Json;
          strength: string;
          deal_breaker_hit?: boolean;
          deal_breaker_reasons?: string[];
          manual_override_reason?: string | null;
          weights_setting_id?: string | null;
          suggested_at?: string | null;
          suggested_by?: string | null;
          response?: Database["public"]["Enums"]["crm_match_response"] | null;
          response_reason?: string | null;
          responded_at?: string | null;
          computed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_matches"]["Insert"]>;
        Relationships: [];
      };
      // === U4: crm-pipeline-activities — өөрийн хүснэгтүүдээ ЭНД нэм ===
      crm_opportunities: {
        Row: {
          id: string;
          office_id: string;
          pipeline_id: string;
          stage_id: string;
          contact_id: string;
          property_id: string | null;
          need_profile_id: string | null;
          lead_id: string | null;
          owner_id: string;
          branch_id: string | null;
          amount: number | null;
          currency: string;
          expected_close_on: string | null;
          state: Database["public"]["Enums"]["crm_opp_state"];
          lost_reason_id: string | null;
          lost_note: string | null;
          aml_hold: boolean;
          stage_entered_at: string;
          created_by: string;
          created_at: string;
          updated_at: string;
          next_step: string | null;
          next_step_date: string | null;
          meeting_at: string | null;
          meeting_place: string | null;
          expected_fee_mnt: number | null;
        };
        Insert: {
          id?: string;
          office_id: string;
          pipeline_id: string;
          stage_id: string;
          contact_id: string;
          property_id?: string | null;
          need_profile_id?: string | null;
          lead_id?: string | null;
          owner_id: string;
          branch_id?: string | null;
          amount?: number | null;
          currency?: string;
          expected_close_on?: string | null;
          state?: Database["public"]["Enums"]["crm_opp_state"];
          lost_reason_id?: string | null;
          lost_note?: string | null;
          aml_hold?: boolean;
          stage_entered_at?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          next_step?: string | null;
          next_step_date?: string | null;
          meeting_at?: string | null;
          meeting_place?: string | null;
          expected_fee_mnt?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_opportunities"]["Insert"]>;
        Relationships: [];
      };
      crm_stage_history: {
        Row: {
          id: string;
          office_id: string;
          opportunity_id: string;
          from_stage_id: string | null;
          to_stage_id: string;
          reason: string | null;
          moved_by: string | null;
          entered_at: string;
          left_at: string | null;
        };
        Insert: {
          id?: string;
          office_id: string;
          opportunity_id: string;
          from_stage_id?: string | null;
          to_stage_id: string;
          reason?: string | null;
          moved_by?: string | null;
          entered_at?: string;
          left_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_stage_history"]["Insert"]>;
        Relationships: [];
      };
      crm_activities: {
        Row: {
          id: string;
          office_id: string;
          contact_id: string;
          property_id: string | null;
          opportunity_id: string | null;
          lead_id: string | null;
          channel: Database["public"]["Enums"]["crm_activity_channel"];
          purpose: string;
          summary: string;
          attitude: string | null;
          new_info: string | null;
          objection_id: string | null;
          outcome: Database["public"]["Enums"]["crm_activity_outcome"];
          next_step: string | null;
          next_step_date: string | null;
          occurred_at: string;
          backdated: boolean;
          feedback_category: string | null;
          reached: boolean | null;
          next_step_code: string | null;
          next_step_at: string | null;
          meeting_party: string | null;
          showing_interest: string | null;
          feedback_at: string | null;
          quick_log: boolean;
          is_meaningful: boolean;
          owner_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          contact_id: string;
          property_id?: string | null;
          opportunity_id?: string | null;
          lead_id?: string | null;
          channel: Database["public"]["Enums"]["crm_activity_channel"];
          purpose: string;
          summary: string;
          attitude?: string | null;
          new_info?: string | null;
          objection_id?: string | null;
          outcome?: Database["public"]["Enums"]["crm_activity_outcome"];
          next_step?: string | null;
          next_step_date?: string | null;
          occurred_at: string;
          backdated?: boolean;
          feedback_category?: string | null;
          reached?: boolean | null;
          next_step_code?: string | null;
          next_step_at?: string | null;
          meeting_party?: string | null;
          showing_interest?: string | null;
          feedback_at?: string | null;
          quick_log?: boolean;
          owner_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_activities"]["Insert"]>;
        Relationships: [];
      };
      crm_offers: {
        Row: {
          id: string;
          office_id: string;
          opportunity_id: string;
          direction: string;
          amount: number;
          terms: Json | null;
          valid_until: string | null;
          relayed_at: string | null;
          position: string | null;
          obstacle: string | null;
          next_step: string | null;
          created_by: string;
          created_at: string;
          parent_offer_id: string | null;
          side: string | null;
          status: string;
          received_at: string | null;
          payment_terms: string | null;
          financing: string | null;
          handover_on: string | null;
          inclusions: string | null;
          exclusions: string | null;
          next_step_date: string | null;
          doc_id: string | null;
          asking_amount: number | null;
          concession_pct: number | null;
          approval_status: string;
          approval_requested_by: string | null;
          approval_requested_at: string | null;
          approval_note: string | null;
          approved_by: string | null;
          approved_at: string | null;
          accepted_at: string | null;
          accepted_by: string | null;
          acceptance_channel: string | null;
          acceptance_note: string | null;
          acceptance_doc_id: string | null;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
        };
        Insert: {
          id?: string;
          office_id: string;
          opportunity_id: string;
          direction: string;
          amount: number;
          terms?: Json | null;
          valid_until?: string | null;
          relayed_at?: string | null;
          position?: string | null;
          obstacle?: string | null;
          next_step?: string | null;
          created_by: string;
          created_at?: string;
          parent_offer_id?: string | null;
          side?: string | null;
          status?: string;
          received_at?: string | null;
          payment_terms?: string | null;
          financing?: string | null;
          handover_on?: string | null;
          inclusions?: string | null;
          exclusions?: string | null;
          next_step_date?: string | null;
          doc_id?: string | null;
          asking_amount?: number | null;
          concession_pct?: number | null;
          approval_status?: string;
          approval_requested_by?: string | null;
          approval_requested_at?: string | null;
          approval_note?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          accepted_at?: string | null;
          accepted_by?: string | null;
          acceptance_channel?: string | null;
          acceptance_note?: string | null;
          acceptance_doc_id?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_offers"]["Insert"]>;
        Relationships: [];
      };
      crm_task_links: {
        Row: {
          task_id: string;
          entity: string;
          entity_id: string;
          rule_code: string | null;
        };
        Insert: {
          task_id: string;
          entity: string;
          entity_id: string;
          rule_code?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_task_links"]["Insert"]>;
        Relationships: [];
      };
      // === U5: crm-transactions-aml — өөрийн хүснэгтүүдээ ЭНД нэм ===
      crm_transactions: {
        Row: {
          id: string;
          office_id: string;
          number: string;
          type: Database["public"]["Enums"]["crm_txn_type"];
          status: Database["public"]["Enums"]["crm_txn_status"];
          opportunity_id: string;
          property_id: string;
          amount: number;
          currency: string;
          fx_rate: number;
          fx_rate_source: string;
          amount_mnt: number;
          opened_on: string;
          contracted_on: string | null;
          closed_on: string | null;
          lease_id: string | null;
          aml_case_id: string | null;
          original_transaction_id: string | null;
          file_completeness_pct: number;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          zero_fee_note: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          number?: string; // null/хоосон → BEFORE INSERT trigger crm_next_number-ээр
          type: Database["public"]["Enums"]["crm_txn_type"];
          status?: Database["public"]["Enums"]["crm_txn_status"];
          opportunity_id: string;
          property_id: string;
          amount: number;
          currency?: string;
          fx_rate?: number;
          fx_rate_source?: string;
          opened_on?: string;
          contracted_on?: string | null;
          closed_on?: string | null;
          lease_id?: string | null;
          aml_case_id?: string | null;
          original_transaction_id?: string | null;
          file_completeness_pct?: number;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          zero_fee_note?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_transactions"]["Insert"]>;
        Relationships: [];
      };
      crm_transaction_parties: {
        Row: {
          id: string;
          office_id: string;
          transaction_id: string;
          contact_id: string;
          role: Database["public"]["Enums"]["crm_party_role"];
        };
        Insert: {
          id?: string;
          office_id: string;
          transaction_id: string;
          contact_id: string;
          role: Database["public"]["Enums"]["crm_party_role"];
        };
        Update: Partial<Database["public"]["Tables"]["crm_transaction_parties"]["Insert"]>;
        Relationships: [];
      };
      crm_transaction_agent_roles: {
        Row: {
          id: string;
          office_id: string;
          transaction_id: string;
          agent_profile_id: string;
          role: Database["public"]["Enums"]["crm_commission_role"];
          split_pct: number | null;
        };
        Insert: {
          id?: string;
          office_id: string;
          transaction_id: string;
          agent_profile_id: string;
          role: Database["public"]["Enums"]["crm_commission_role"];
          split_pct?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_transaction_agent_roles"]["Insert"]>;
        Relationships: [];
      };
      crm_transaction_contracts: {
        Row: {
          id: string;
          office_id: string;
          transaction_id: string;
          contract_type: string;
          number: string;
          signed_on: string | null;
          valid_from: string | null;
          valid_to: string | null;
          doc_id: string | null;
          created_at: string;
          template_code: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          review_note: string | null;
        };
        Insert: {
          id?: string;
          office_id: string;
          transaction_id: string;
          contract_type: string;
          number: string;
          signed_on?: string | null;
          valid_from?: string | null;
          valid_to?: string | null;
          doc_id?: string | null;
          created_at?: string;
          template_code?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          review_note?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_transaction_contracts"]["Insert"]>;
        Relationships: [];
      };
      crm_payment_schedule_lines: {
        Row: {
          id: string;
          office_id: string;
          transaction_id: string;
          due_on: string;
          amount: number;
          kind: string;
          note: string | null;
          paid_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          transaction_id: string;
          due_on: string;
          amount: number;
          kind: string;
          note?: string | null;
          paid_amount?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_payment_schedule_lines"]["Insert"]>;
        Relationships: [];
      };
      crm_handover_items: {
        Row: {
          id: string;
          office_id: string;
          transaction_id: string;
          label: string;
          done: boolean;
          done_on: string | null;
          responsible_id: string | null;
          sort_order: number;
          due_on: string | null;
        };
        Insert: {
          id?: string;
          office_id: string;
          transaction_id: string;
          label: string;
          done?: boolean;
          done_on?: string | null;
          responsible_id?: string | null;
          sort_order?: number;
          due_on?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_handover_items"]["Insert"]>;
        Relationships: [];
      };
      crm_transaction_approvals: {
        Row: {
          id: string;
          office_id: string;
          transaction_id: string;
          requested_by: string;
          rationale: string;
          fee_change: string;
          approved_amount: number | null;
          approved_by: string | null;
          approved_at: string | null;
          doc_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          transaction_id: string;
          requested_by: string;
          rationale: string;
          fee_change: string;
          approved_amount?: number | null;
          approved_by?: string | null;
          approved_at?: string | null;
          doc_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_transaction_approvals"]["Insert"]>;
        Relationships: [];
      };
      crm_checklist_templates: {
        Row: {
          id: string;
          office_id: string;
          scope: string;
          items: Json;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          scope: string;
          items: Json;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_checklist_templates"]["Insert"]>;
        Relationships: [];
      };
      crm_aml_cases: {
        Row: {
          id: string;
          office_id: string;
          contact_id: string;
          transaction_id: string | null;
          status: Database["public"]["Enums"]["crm_aml_case_status"];
          gate_checks: Json;
          str_due_at: string | null;
          threshold_due_on: string | null;
          decision: string | null;
          decision_rationale: string | null;
          officer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          contact_id: string;
          transaction_id?: string | null;
          status?: Database["public"]["Enums"]["crm_aml_case_status"];
          gate_checks?: Json;
          str_due_at?: string | null;
          threshold_due_on?: string | null;
          decision?: string | null;
          decision_rationale?: string | null;
          officer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_aml_cases"]["Insert"]>;
        Relationships: [];
      };
      crm_aml_holds: {
        Row: {
          id: string;
          office_id: string;
          transaction_id: string;
          placed_by: string;
          placed_at: string;
          rationale: string;
          released_by: string | null;
          released_at: string | null;
          release_rationale: string | null;
        };
        Insert: {
          id?: string;
          office_id: string;
          transaction_id: string;
          placed_by: string;
          placed_at?: string;
          rationale: string;
          released_by?: string | null;
          released_at?: string | null;
          release_rationale?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_aml_holds"]["Insert"]>;
        Relationships: [];
      };
      crm_aml_alerts: {
        Row: {
          id: string;
          office_id: string;
          contact_id: string | null;
          transaction_id: string | null;
          payment_id: string | null;
          alert_kind: string;
          detected_at: string;
          reported_by: string;
          category: string | null;
          observed: string | null;
          amount_mnt: number | null;
          payment_method: string | null;
          parties: Json | null;
          urgent: boolean;
          case_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          contact_id?: string | null;
          transaction_id?: string | null;
          payment_id?: string | null;
          alert_kind: string;
          detected_at?: string;
          reported_by: string;
          category?: string | null;
          observed?: string | null;
          amount_mnt?: number | null;
          payment_method?: string | null;
          parties?: Json | null;
          urgent?: boolean;
          case_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_aml_alerts"]["Insert"]>;
        Relationships: [];
      };
      crm_documents: {
        Row: {
          id: string;
          office_id: string;
          category: Database["public"]["Enums"]["crm_doc_category"];
          title: string;
          storage_path: string;
          mime: string | null;
          size_bytes: number | null;
          version: number;
          parent_document_id: string | null;
          retention_until: string | null;
          uploaded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          category: Database["public"]["Enums"]["crm_doc_category"];
          title: string;
          storage_path: string;
          mime?: string | null;
          size_bytes?: number | null;
          version?: number;
          parent_document_id?: string | null;
          retention_until?: string | null;
          uploaded_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_documents"]["Insert"]>;
        Relationships: [];
      };
      crm_document_links: {
        Row: {
          document_id: string;
          entity: string;
          entity_id: string;
          is_cover: boolean;
          sort_order: number;
        };
        Insert: {
          document_id: string;
          entity: string;
          entity_id: string;
          is_cover?: boolean;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["crm_document_links"]["Insert"]>;
        Relationships: [];
      };
      // === U6: crm-rentals — өөрийн хүснэгтүүдээ ЭНД нэм ===
      crm_management_agreements: {
        Row: {
          id: string;
          office_id: string;
          number: string;
          owner_contact_id: string;
          start_on: string;
          end_on: string | null;
          fee_pct: number;
          reporting_frequency: string;
          inspection_rights: string | null;
          inspection_frequency: string | null;
          notice_days: number;
          repair_approval_limit: number;
          status: string;
          renewal_reminder_days: number | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          number?: string; // хоосон → trigger crm_next_number('mgmt_agreement')
          owner_contact_id: string;
          start_on: string;
          end_on?: string | null;
          fee_pct: number;
          reporting_frequency?: string;
          inspection_rights?: string | null;
          inspection_frequency?: string | null;
          notice_days?: number;
          repair_approval_limit: number;
          status?: string;
          renewal_reminder_days?: number | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_management_agreements"]["Insert"]>;
        Relationships: [];
      };
      crm_management_agreement_properties: {
        Row: {
          agreement_id: string;
          property_id: string;
          terms: Json | null;
        };
        Insert: {
          agreement_id: string;
          property_id: string;
          terms?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_management_agreement_properties"]["Insert"]>;
        Relationships: [];
      };
      crm_leases: {
        Row: {
          id: string;
          office_id: string;
          number: string;
          property_id: string;
          tenant_contact_id: string;
          landlord_contact_id: string;
          transaction_id: string | null;
          start_on: string;
          end_on: string;
          monthly_rent: number;
          payment_day: number;
          grace_days: number;
          deposit_amount: number;
          deposit_holder: Database["public"]["Enums"]["crm_expense_bearer"] | null;
          deposit_received_on: string | null;
          deposit_returned_on: string | null;
          deposit_returned_amount: number | null;
          is_managed: boolean;
          management_agreement_id: string | null;
          duration_tier: string | null;
          indexation: Json | null;
          status: Database["public"]["Enums"]["crm_lease_status"];
          previous_lease_id: string | null;
          termination_reason: string | null;
          termination_docs: Json | null;
          signed_doc_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          number?: string; // хоосон → trigger crm_next_number('lease')
          property_id: string;
          tenant_contact_id: string;
          landlord_contact_id: string;
          transaction_id?: string | null;
          start_on: string;
          end_on: string;
          monthly_rent: number;
          payment_day: number;
          grace_days?: number;
          deposit_amount: number;
          deposit_holder?: Database["public"]["Enums"]["crm_expense_bearer"] | null;
          deposit_received_on?: string | null;
          deposit_returned_on?: string | null;
          deposit_returned_amount?: number | null;
          is_managed?: boolean;
          management_agreement_id?: string | null;
          duration_tier?: string | null;
          indexation?: Json | null;
          status?: Database["public"]["Enums"]["crm_lease_status"];
          previous_lease_id?: string | null;
          termination_reason?: string | null;
          termination_docs?: Json | null;
          signed_doc_id?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_leases"]["Insert"]>;
        Relationships: [];
      };
      crm_lease_expense_lines: {
        Row: {
          lease_id: string;
          expense_type: string;
          bearer: Database["public"]["Enums"]["crm_expense_bearer"];
        };
        Insert: {
          lease_id: string;
          expense_type: string;
          bearer: Database["public"]["Enums"]["crm_expense_bearer"];
        };
        Update: Partial<Database["public"]["Tables"]["crm_lease_expense_lines"]["Insert"]>;
        Relationships: [];
      };
      crm_invoices: {
        Row: {
          id: string;
          office_id: string;
          number: string;
          type: Database["public"]["Enums"]["crm_invoice_type"];
          lease_id: string | null;
          transaction_id: string | null;
          recipient_contact_id: string;
          period_month: string | null;
          issued_on: string;
          due_on: string;
          amount: number;
          status: Database["public"]["Enums"]["crm_invoice_status"];
          approval_doc_id: string | null;
          corrected_invoice_id: string | null;
          cancel_reason: string | null;
          cancelled_by: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          number?: string; // хоосон → trigger crm_next_number('invoice')
          type: Database["public"]["Enums"]["crm_invoice_type"];
          lease_id?: string | null;
          transaction_id?: string | null;
          recipient_contact_id: string;
          period_month?: string | null;
          issued_on?: string;
          due_on: string;
          amount: number;
          status?: Database["public"]["Enums"]["crm_invoice_status"];
          approval_doc_id?: string | null;
          corrected_invoice_id?: string | null;
          cancel_reason?: string | null;
          cancelled_by?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_invoices"]["Insert"]>;
        Relationships: [];
      };
      crm_payments: {
        Row: {
          id: string;
          office_id: string;
          kind: Database["public"]["Enums"]["crm_payment_kind"];
          invoice_id: string | null;
          schedule_line_id: string | null;
          transaction_id: string | null;
          lease_id: string | null;
          paid_on: string;
          amount: number;
          currency: string;
          fx_rate: number;
          amount_mnt: number;
          method: string;
          doc_id: string | null;
          finance_verified_by: string | null;
          finance_verified_at: string | null;
          correction_of_id: string | null;
          refund_note: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          kind: Database["public"]["Enums"]["crm_payment_kind"];
          invoice_id?: string | null;
          schedule_line_id?: string | null;
          transaction_id?: string | null;
          lease_id?: string | null;
          paid_on: string;
          amount: number;
          currency?: string;
          fx_rate?: number;
          method: string;
          doc_id?: string | null;
          finance_verified_by?: string | null;
          finance_verified_at?: string | null;
          correction_of_id?: string | null;
          refund_note?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_payments"]["Insert"]>;
        Relationships: [];
      };
      crm_vendors: {
        Row: {
          id: string;
          office_id: string;
          name: string;
          phone: string | null;
          specialty: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          name: string;
          phone?: string | null;
          specialty?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_vendors"]["Insert"]>;
        Relationships: [];
      };
      crm_maintenance_requests: {
        Row: {
          id: string;
          office_id: string;
          property_id: string;
          lease_id: string | null;
          source: string;
          category_id: string | null;
          urgency: Database["public"]["Enums"]["crm_urgency"];
          description: string;
          status: Database["public"]["Enums"]["crm_maintenance_status"];
          owner_approval_needed: boolean;
          owner_approved_at: string | null;
          owner_approval_doc_id: string | null;
          emergency_bypass: boolean;
          vendor_id: string | null;
          assigned_to: string | null;
          estimate_amount: number | null;
          actual_amount: number | null;
          cost_bearer: Database["public"]["Enums"]["crm_expense_bearer"] | null;
          sla_respond_by: string | null;
          sla_resolve_by: string | null;
          completed_on: string | null;
          completion_doc_id: string | null;
          reject_reason: string | null;
          complaint_id: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          property_id: string;
          lease_id?: string | null;
          source: string;
          category_id?: string | null;
          urgency?: Database["public"]["Enums"]["crm_urgency"];
          description: string;
          status?: Database["public"]["Enums"]["crm_maintenance_status"];
          owner_approval_needed?: boolean;
          owner_approved_at?: string | null;
          owner_approval_doc_id?: string | null;
          emergency_bypass?: boolean;
          vendor_id?: string | null;
          assigned_to?: string | null;
          estimate_amount?: number | null;
          actual_amount?: number | null;
          cost_bearer?: Database["public"]["Enums"]["crm_expense_bearer"] | null;
          sla_respond_by?: string | null;
          sla_resolve_by?: string | null;
          completed_on?: string | null;
          completion_doc_id?: string | null;
          reject_reason?: string | null;
          complaint_id?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_maintenance_requests"]["Insert"]>;
        Relationships: [];
      };
      crm_monthly_records: {
        Row: {
          id: string;
          office_id: string;
          agreement_id: string;
          property_id: string;
          lease_id: string | null;
          month: string;
          data: Json;
          completeness_pct: number;
          net_income: number | null;
          commission_hold: boolean;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          agreement_id: string;
          property_id: string;
          lease_id?: string | null;
          month: string;
          data?: Json;
          completeness_pct?: number;
          net_income?: number | null;
          commission_hold?: boolean;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_monthly_records"]["Insert"]>;
        Relationships: [];
      };
      crm_owner_statements: {
        Row: {
          id: string;
          office_id: string;
          agreement_id: string;
          owner_contact_id: string;
          period_start: string;
          period_end: string;
          income: number;
          expenses: number;
          mgmt_fee: number;
          net_payout: number;
          detail: Json;
          sent_at: string | null;
          acknowledged_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          agreement_id: string;
          owner_contact_id: string;
          period_start: string;
          period_end: string;
          income?: number;
          expenses?: number;
          mgmt_fee?: number;
          detail?: Json;
          sent_at?: string | null;
          acknowledged_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_owner_statements"]["Insert"]>;
        Relationships: [];
      };
      crm_inspections: {
        Row: {
          id: string;
          office_id: string;
          property_id: string;
          lease_id: string | null;
          kind: Database["public"]["Enums"]["crm_inspection_kind"];
          inspected_on: string;
          confirmed_by_tenant: boolean;
          confirmed_by_staff: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          property_id: string;
          lease_id?: string | null;
          kind: Database["public"]["Enums"]["crm_inspection_kind"];
          inspected_on: string;
          confirmed_by_tenant?: boolean;
          confirmed_by_staff?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_inspections"]["Insert"]>;
        Relationships: [];
      };
      crm_inspection_items: {
        Row: {
          id: string;
          office_id: string;
          inspection_id: string;
          room: string | null;
          item: string;
          condition: string;
          note: string | null;
          photo_doc_id: string | null;
          matched_item_id: string | null;
          discrepancy: boolean;
        };
        Insert: {
          id?: string;
          office_id: string;
          inspection_id: string;
          room?: string | null;
          item: string;
          condition: string;
          note?: string | null;
          photo_doc_id?: string | null;
          matched_item_id?: string | null;
          discrepancy?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["crm_inspection_items"]["Insert"]>;
        Relationships: [];
      };
      crm_deposit_deductions: {
        Row: {
          id: string;
          office_id: string;
          lease_id: string;
          category: string;
          amount: number;
          rationale: string;
          evidence_inspection_item_id: string;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          lease_id: string;
          category: string;
          amount: number;
          rationale: string;
          evidence_inspection_item_id: string;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_deposit_deductions"]["Insert"]>;
        Relationships: [];
      };
      crm_arrears_escalations: {
        Row: {
          id: string;
          office_id: string;
          invoice_id: string;
          lease_id: string;
          step: number;
          assigned_role: Database["public"]["Enums"]["crm_role"];
          task_id: string | null;
          escalated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          invoice_id: string;
          lease_id: string;
          step: number;
          assigned_role: Database["public"]["Enums"]["crm_role"];
          task_id?: string | null;
          escalated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_arrears_escalations"]["Insert"]>;
        Relationships: [];
      };
      // === U7: crm-commissions (20260901000700) ===
      crm_commission_config_versions: {
        Row: {
          id: string;
          office_id: string;
          policy_code: string;
          payload: Json;
          valid_from: string;
          valid_to: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          policy_code: string;
          payload: Json;
          valid_from?: string;
          valid_to?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_commission_config_versions"]["Insert"]>;
        Relationships: [];
      };
      crm_commission_records: {
        Row: {
          id: string;
          office_id: string;
          source_type: string;
          transaction_id: string | null;
          lease_id: string | null;
          monthly_record_id: string | null;
          recipient_type: string;
          recipient_profile_id: string | null;
          role: Database["public"]["Enums"]["crm_commission_role"];
          applied_rate_pct: number;
          base_amount: number;
          amount: number;
          paid_amount: number;
          status: Database["public"]["Enums"]["crm_commission_status"];
          hold_reason: string | null;
          config_version_id: string;
          evidence: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          source_type: string;
          transaction_id?: string | null;
          lease_id?: string | null;
          monthly_record_id?: string | null;
          recipient_type?: string;
          recipient_profile_id?: string | null;
          role: Database["public"]["Enums"]["crm_commission_role"];
          applied_rate_pct: number;
          base_amount: number;
          amount: number;
          paid_amount?: number;
          status?: Database["public"]["Enums"]["crm_commission_status"];
          hold_reason?: string | null;
          config_version_id: string;
          evidence?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_commission_records"]["Insert"]>;
        Relationships: [];
      };
      crm_commission_status_history: {
        Row: {
          id: string;
          office_id: string;
          record_id: string;
          from_status: Database["public"]["Enums"]["crm_commission_status"] | null;
          to_status: Database["public"]["Enums"]["crm_commission_status"];
          decided_by: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          record_id: string;
          from_status?: Database["public"]["Enums"]["crm_commission_status"] | null;
          to_status: Database["public"]["Enums"]["crm_commission_status"];
          decided_by?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_commission_status_history"]["Insert"]>;
        Relationships: [];
      };
      crm_commission_clawbacks: {
        Row: {
          id: string;
          office_id: string;
          record_id: string;
          amount: number;
          reason_category: string;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          record_id: string;
          amount: number;
          reason_category: string;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_commission_clawbacks"]["Insert"]>;
        Relationships: [];
      };
      crm_commission_disputes: {
        Row: {
          id: string;
          office_id: string;
          transaction_id: string;
          content: string;
          evidence: Json | null;
          decision: string | null;
          rationale: string | null;
          decided_by: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          transaction_id: string;
          content: string;
          evidence?: Json | null;
          decision?: string | null;
          rationale?: string | null;
          decided_by?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_commission_disputes"]["Insert"]>;
        Relationships: [];
      };
      // === U8: crm-automation-notify (20260901000800) ===
      crm_nps_surveys: {
        Row: {
          id: string;
          office_id: string;
          transaction_id: string;
          contact_id: string;
          sent_at: string | null;
          score: number | null;
          comment: string | null;
          answered_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          transaction_id: string;
          contact_id: string;
          sent_at?: string | null;
          score?: number | null;
          comment?: string | null;
          answered_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_nps_surveys"]["Insert"]>;
        Relationships: [];
      };
      crm_referrals: {
        Row: {
          id: string;
          office_id: string;
          referrer_contact_id: string;
          lead_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          referrer_contact_id: string;
          lead_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_referrals"]["Insert"]>;
        Relationships: [];
      };
      crm_complaints: {
        Row: {
          id: string;
          office_id: string;
          contact_id: string;
          transaction_id: string | null;
          source: string;
          severity: string;
          description: string;
          status: string;
          resolved_at: string | null;
          resolution: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          contact_id: string;
          transaction_id?: string | null;
          source: string;
          severity?: string;
          description: string;
          status?: string;
          resolved_at?: string | null;
          resolution?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_complaints"]["Insert"]>;
        Relationships: [];
      };
      crm_handover_acts: {
        Row: {
          id: string;
          office_id: string;
          staff_id: string;
          items: Json;
          approved_by: string | null;
          approved_at: string | null;
          clients_notified: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          staff_id: string;
          items: Json;
          approved_by?: string | null;
          approved_at?: string | null;
          clients_notified?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_handover_acts"]["Insert"]>;
        Relationships: [];
      };
      crm_txn_corrections: {
        Row: {
          id: string;
          office_id: string;
          transaction_id: string;
          changes: Json;
          rationale: string;
          approved_by: string;
          applied_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          transaction_id: string;
          changes: Json;
          rationale: string;
          approved_by: string;
          applied_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_txn_corrections"]["Insert"]>;
        Relationships: [];
      };
      // === U3 (PRO-001 v2.1): crm-deal-flow (20261107000900) ===
      crm_showings: {
        Row: {
          id: string;
          office_id: string;
          opportunity_id: string | null;
          contact_id: string;
          property_id: string;
          agent_id: string;
          scheduled_at: string;
          duration_min: number | null;
          meeting_point: string | null;
          participants: string | null;
          status: string;
          done_at: string | null;
          cancel_reason: string | null;
          match_strength: string | null;
          match_score: number | null;
          weak_match_reason: string | null;
          feedback_category: string | null;
          feedback_note: string | null;
          feedback_at: string | null;
          interest: string | null;
          next_action: string | null;
          next_step_date: string | null;
          activity_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          opportunity_id?: string | null;
          contact_id: string;
          property_id: string;
          agent_id: string;
          scheduled_at: string;
          duration_min?: number | null;
          meeting_point?: string | null;
          participants?: string | null;
          status?: string;
          done_at?: string | null;
          cancel_reason?: string | null;
          match_strength?: string | null;
          match_score?: number | null;
          weak_match_reason?: string | null;
          feedback_category?: string | null;
          feedback_note?: string | null;
          feedback_at?: string | null;
          interest?: string | null;
          next_action?: string | null;
          next_step_date?: string | null;
          activity_id?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_showings"]["Insert"]>;
        Relationships: [];
      };
      crm_price_analyses: {
        Row: {
          id: string;
          office_id: string;
          opportunity_id: string;
          property_id: string | null;
          comparables: Json;
          price_min: number | null;
          price_max: number | null;
          recommended_price: number;
          note: string | null;
          doc_id: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          opportunity_id: string;
          property_id?: string | null;
          comparables?: Json;
          price_min?: number | null;
          price_max?: number | null;
          recommended_price: number;
          note?: string | null;
          doc_id?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_price_analyses"]["Insert"]>;
        Relationships: [];
      };
      // === U2 (PRO-001 v2.1): crm-sla-automation (20261107000700) ===
      crm_push_subscriptions: {
        Row: {
          id: string;
          profile_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          failed_count: number;
          disabled_at: string | null;
          last_success_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          failed_count?: number;
          disabled_at?: string | null;
          last_success_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_push_subscriptions"]["Insert"]>;
        Relationships: [];
      };
      // === U5 (PRO-001 v2.1): crm-agent-core (20261107001400) ===
      crm_activity_properties: {
        Row: {
          activity_id: string;
          property_id: string;
          office_id: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          activity_id: string;
          property_id: string;
          office_id: string;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_activity_properties"]["Insert"]>;
        Relationships: [];
      };
      // === U4 (PRO-001 v2.1): crm-ownership-governance (20261107001200–001350) ===
      crm_lead_disputes: {
        Row: {
          id: string;
          office_id: string;
          lead_id: string;
          contact_id: string;
          kind: string;
          claimant_id: string;
          respondent_id: string | null;
          status: string;
          claim: string;
          claimant_evidence: Json;
          respondent_note: string | null;
          respondent_evidence: Json;
          responded_at: string | null;
          review_note: string | null;
          review_recommendation: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          escalation_reason: string | null;
          escalated_by: string | null;
          escalated_at: string | null;
          decision: string | null;
          decision_rationale: string | null;
          decided_by: string | null;
          decided_at: string | null;
          decided_owner_id: string | null;
          appeal_text: string | null;
          appealed_by: string | null;
          appealed_at: string | null;
          appeal_decision: string | null;
          appeal_rationale: string | null;
          appeal_decided_by: string | null;
          appeal_decided_at: string | null;
          withdrawn_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          lead_id: string;
          contact_id: string;
          kind?: string;
          claimant_id: string;
          respondent_id?: string | null;
          status?: string;
          claim: string;
          claimant_evidence?: Json;
          respondent_note?: string | null;
          respondent_evidence?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_lead_disputes"]["Insert"]>;
        Relationships: [];
      };
      crm_coi_declarations: {
        Row: {
          id: string;
          office_id: string;
          profile_id: string;
          contact_id: string | null;
          related_profile_id: string | null;
          relation: string;
          note: string | null;
          declared_at: string;
          revoked_at: string | null;
          revoke_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          profile_id: string;
          contact_id?: string | null;
          related_profile_id?: string | null;
          relation: string;
          note?: string | null;
          declared_at?: string;
          revoked_at?: string | null;
          revoke_note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_coi_declarations"]["Insert"]>;
        Relationships: [];
      };
      crm_pool_claims: {
        Row: {
          id: string;
          office_id: string;
          lead_id: string;
          requester_id: string;
          note: string;
          status: string;
          decided_by: string | null;
          decided_at: string | null;
          decision_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          lead_id: string;
          requester_id: string;
          note: string;
          status?: string;
          decided_by?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_pool_claims"]["Insert"]>;
        Relationships: [];
      };
      crm_export_requests: {
        Row: {
          id: string;
          office_id: string;
          requested_by: string;
          scope: string;
          filters: Json;
          reason: string;
          row_estimate: number | null;
          status: string;
          max_rows: number | null;
          decided_by: string | null;
          decided_at: string | null;
          decision_note: string | null;
          expires_at: string | null;
          completed_at: string | null;
          row_count: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          requested_by: string;
          scope: string;
          filters?: Json;
          reason: string;
          row_estimate?: number | null;
          status?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_export_requests"]["Insert"]>;
        Relationships: [];
      };
      crm_data_requests: {
        Row: {
          id: string;
          office_id: string;
          contact_id: string;
          kind: string;
          channel: string | null;
          note: string | null;
          status: string;
          received_at: string;
          decided_by: string | null;
          decided_at: string | null;
          decision_note: string | null;
          completed_at: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          contact_id: string;
          kind: string;
          channel?: string | null;
          note?: string | null;
          status?: string;
          received_at?: string;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_data_requests"]["Insert"]>;
        Relationships: [];
      };
      // === U6 (PRO-001 v2.1): crm-quality-kpi (20261107001600–001750) ===
      crm_quality_audits: {
        Row: {
          id: string;
          office_id: string;
          period_start: string;
          period_end: string;
          scope: string;
          branch_id: string | null;
          agent_id: string | null;
          status: string;
          sample_per_criterion: number;
          population: Json;
          score: number | null;
          checked_count: number | null;
          passed_count: number | null;
          summary: string | null;
          cancel_reason: string | null;
          auditor_id: string;
          created_at: string;
          completed_at: string | null;
        };
        Insert: { office_id: string; period_start: string; period_end: string; sample_per_criterion: number; auditor_id: string };
        Update: { summary?: string | null };
        Relationships: [];
      };
      crm_quality_audit_items: {
        Row: {
          id: string;
          office_id: string;
          audit_id: string;
          criterion: string;
          entity: string;
          entity_id: string;
          agent_id: string | null;
          label: string | null;
          auto_result: string;
          auto_reason: string | null;
          result: string | null;
          note: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          fix_task_id: string | null;
          created_at: string;
        };
        Insert: { office_id: string; audit_id: string; criterion: string; entity: string; entity_id: string; auto_result: string };
        Update: { fix_task_id?: string | null };
        Relationships: [];
      };
      crm_budgets: {
        Row: {
          id: string;
          office_id: string;
          month: string;
          branch_id: string | null;
          metric: string;
          amount: number;
          note: string | null;
          created_by: string;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          month: string;
          branch_id?: string | null;
          metric?: string;
          amount: number;
          note?: string | null;
          created_by: string;
          updated_by?: string | null;
        };
        Update: { amount?: number; note?: string | null; updated_by?: string | null };
        Relationships: [];
      };
      crm_forecast_snapshots: {
        Row: {
          id: string;
          office_id: string;
          month: string;
          kind: string;
          taken_at: string;
          open_count: number;
          total_amount_mnt: number;
          weighted_amount_mnt: number;
          expected_fee_mnt: number;
          weighted_fee_mnt: number;
          month_weighted_fee_mnt: number;
          month_weighted_amount_mnt: number;
          unconverted_count: number;
          by_stage: Json;
          by_agent: Json;
          status: string;
          approved_by: string | null;
          approved_at: string | null;
          approval_note: string | null;
          created_by: string | null;
        };
        Insert: { office_id: string; month: string };
        Update: { approval_note?: string | null };
        Relationships: [];
      };
      crm_mgmt_reviews: {
        Row: {
          id: string;
          office_id: string;
          period_kind: string;
          period_start: string;
          kpi_snapshot: Json;
          findings: string;
          decisions: string | null;
          reviewed_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          period_kind: string;
          period_start: string;
          kpi_snapshot?: Json;
          findings: string;
          decisions?: string | null;
          reviewed_by: string;
        };
        Update: { decisions?: string | null };
        Relationships: [];
      };
      crm_commission_dispute_evidence: {
        Row: {
          id: string;
          office_id: string;
          dispute_id: string;
          content: string;
          doc_id: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          dispute_id: string;
          content: string;
          doc_id?: string | null;
          created_by: string;
        };
        Update: { content?: string };
        Relationships: [];
      };
      // === U7 (PRO-001 v2.1): crm-weekly-cycle (20261107001800–002000) ===
      crm_weekly_plans: {
        Row: {
          id: string;
          office_id: string;
          agent_id: string;
          branch_id: string | null;
          team_id: string | null;
          week_start: string;
          status: string;
          last_week_summary: string | null;
          support_needed: string | null;
          commitment: string | null;
          prefilled_from: string | null;
          submitted_at: string | null;
          approved_by: string | null;
          approved_at: string | null;
          returned_by: string | null;
          returned_at: string | null;
          return_note: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          agent_id: string;
          week_start: string;
          status?: string;
          last_week_summary?: string | null;
          support_needed?: string | null;
          commitment?: string | null;
          prefilled_from?: string | null;
          created_by: string;
        };
        Update: {
          status?: string;
          last_week_summary?: string | null;
          support_needed?: string | null;
          commitment?: string | null;
          return_note?: string | null;
        };
        Relationships: [];
      };
      crm_weekly_plan_targets: {
        Row: {
          plan_id: string;
          office_id: string;
          metric_code: string;
          target: number | null;
          review_note: string | null;
          next_action: string | null;
          updated_at: string;
        };
        Insert: {
          plan_id: string;
          office_id: string;
          metric_code: string;
          target?: number | null;
          review_note?: string | null;
          next_action?: string | null;
        };
        Update: { target?: number | null; review_note?: string | null; next_action?: string | null };
        Relationships: [];
      };
      crm_weekly_plan_items: {
        Row: {
          id: string;
          office_id: string;
          plan_id: string;
          kind: string;
          position: number;
          opportunity_id: string | null;
          obstacle_id: string | null;
          text: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          plan_id: string;
          kind: string;
          position: number;
          opportunity_id?: string | null;
          obstacle_id?: string | null;
          text?: string | null;
        };
        Update: { opportunity_id?: string | null; obstacle_id?: string | null; text?: string | null };
        Relationships: [];
      };
      crm_weekly_commitment_log: {
        Row: {
          id: number;
          office_id: string;
          plan_id: string;
          source: string;
          old_text: string | null;
          new_text: string | null;
          changed_by: string | null;
          changed_at: string;
        };
        Insert: {
          office_id: string;
          plan_id: string;
          source?: string;
          old_text?: string | null;
          new_text?: string | null;
          changed_by?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      crm_weekly_reviews: {
        Row: {
          id: string;
          office_id: string;
          plan_id: string;
          agent_id: string;
          week_start: string;
          status: string;
          achieved_note: string | null;
          missed_note: string | null;
          conversion_note: string | null;
          movement_note: string | null;
          overdue_reason: string | null;
          recovery_action: string | null;
          lost_note: string | null;
          revenue_note: string | null;
          lessons: string | null;
          coaching_need: string | null;
          coaching_at: string | null;
          coaching_task_id: string | null;
          submitted_at: string | null;
          approved_by: string | null;
          approved_at: string | null;
          returned_by: string | null;
          returned_at: string | null;
          return_note: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          plan_id: string;
          agent_id: string;
          week_start: string;
          status?: string;
          achieved_note?: string | null;
          missed_note?: string | null;
          conversion_note?: string | null;
          movement_note?: string | null;
          overdue_reason?: string | null;
          recovery_action?: string | null;
          lost_note?: string | null;
          revenue_note?: string | null;
          lessons?: string | null;
          created_by: string;
        };
        Update: {
          status?: string;
          achieved_note?: string | null;
          missed_note?: string | null;
          conversion_note?: string | null;
          movement_note?: string | null;
          overdue_reason?: string | null;
          recovery_action?: string | null;
          lost_note?: string | null;
          revenue_note?: string | null;
          lessons?: string | null;
          coaching_need?: string | null;
          coaching_at?: string | null;
          coaching_task_id?: string | null;
          return_note?: string | null;
        };
        Relationships: [];
      };
      crm_weekly_actuals: {
        Row: {
          id: string;
          office_id: string;
          agent_id: string;
          week_start: string;
          kind: string;
          metrics: Json;
          moves: Json;
          computed_at: string;
        };
        Insert: { office_id: string; agent_id: string; week_start: string; kind: string; metrics?: Json; moves?: Json };
        Update: { metrics?: Json; moves?: Json };
        Relationships: [];
      };
      crm_weekly_scores: {
        Row: {
          id: string;
          office_id: string;
          agent_id: string;
          week_start: string;
          kind: string;
          plan_id: string | null;
          profile: string;
          weights: Json;
          targets: Json;
          components: Json;
          total: number;
          computed_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          agent_id: string;
          week_start: string;
          kind: string;
          plan_id?: string | null;
          profile?: string;
          weights: Json;
          targets?: Json;
          components?: Json;
          total: number;
          computed_at?: string;
        };
        Update: {
          plan_id?: string | null;
          profile?: string;
          weights?: Json;
          targets?: Json;
          components?: Json;
          total?: number;
          computed_at?: string;
        };
        Relationships: [];
      };
      crm_agent_daily_stats: {
        Row: {
          office_id: string;
          agent_id: string;
          day: string;
          overdue_followups: number;
          hot_contacts: number;
          expected_net_fee: number;
          completeness_pct: number | null;
          computed_at: string;
        };
        Insert: { office_id: string; agent_id: string; day: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      crm_next_step_log: {
        Row: {
          id: number;
          office_id: string;
          entity: string;
          entity_id: string;
          owner_id: string | null;
          due_on: string;
          set_at: string;
          resolved_at: string | null;
          resolution: string | null;
        };
        Insert: { office_id: string; entity: string; entity_id: string; due_on: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      crm_sales_meetings: {
        Row: {
          id: string;
          office_id: string;
          kind: string;
          week_start: string;
          branch_id: string | null;
          team_id: string | null;
          facilitator_id: string;
          status: string;
          started_at: string;
          ended_at: string | null;
          sections: Json;
          notes: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          kind: string;
          week_start: string;
          branch_id?: string | null;
          team_id?: string | null;
          facilitator_id: string;
          status?: string;
          sections?: Json;
          notes?: string | null;
          created_by: string;
        };
        Update: { status?: string; ended_at?: string | null; sections?: Json; notes?: string | null };
        Relationships: [];
      };
      crm_meeting_decisions: {
        Row: {
          id: string;
          office_id: string;
          meeting_id: string;
          plan_id: string | null;
          agent_id: string | null;
          kind: string;
          text: string;
          owner_id: string | null;
          due_on: string | null;
          status: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          meeting_id: string;
          plan_id?: string | null;
          agent_id?: string | null;
          kind: string;
          text: string;
          owner_id?: string | null;
          due_on?: string | null;
          status?: string;
          created_by: string;
        };
        Update: { status?: string; text?: string; owner_id?: string | null; due_on?: string | null };
        Relationships: [];
      };
      // === U8 (PRO-001 v2.1): crm-mobile-growth (20261107002100–002200) ===
      crm_today_snoozes: {
        Row: { id: string; office_id: string; profile_id: string; item_kind: string; item_id: string; until: string; reason: string | null; created_at: string };
        Insert: { id?: string; office_id: string; profile_id: string; item_kind: string; item_id: string; until: string; reason?: string | null };
        Update: { until?: string; reason?: string | null };
        Relationships: [];
      };
      crm_track_templates: {
        Row: { id: string; office_id: string; code: string; name: string; description: string | null; target: string; steps: Json; stop_on: string[]; is_active: boolean; sort_order: number; created_by: string | null; created_at: string };
        Insert: { id?: string; office_id: string; code: string; name: string; description?: string | null; target?: string; steps: Json; stop_on?: string[]; is_active?: boolean; sort_order?: number; created_by?: string | null };
        Update: { name?: string; description?: string | null; target?: string; steps?: Json; stop_on?: string[]; is_active?: boolean; sort_order?: number };
        Relationships: [];
      };
      crm_track_enrollments: {
        Row: { id: string; office_id: string; template_id: string; lead_id: string | null; opportunity_id: string | null; contact_id: string; owner_id: string; status: string; started_at: string; stopped_at: string | null; stop_reason: string | null; created_by: string };
        Insert: { id?: string; office_id: string; template_id: string; lead_id?: string | null; opportunity_id?: string | null; contact_id: string; owner_id: string; status?: string; created_by: string };
        Update: { status?: string; stopped_at?: string | null; stop_reason?: string | null };
        Relationships: [];
      };
      crm_track_tasks: {
        Row: { enrollment_id: string; task_id: string; step_index: number };
        Insert: { enrollment_id: string; task_id: string; step_index: number };
        Update: { step_index?: number };
        Relationships: [];
      };
      crm_public_links: {
        Row: { id: string; office_id: string; kind: string; token_hash: string; contact_id: string | null; lead_id: string | null; property_id: string | null; title: string | null; note: string | null; expires_at: string; revoked_at: string | null; revoked_by: string | null; open_count: number; last_opened_at: string | null; created_by: string; created_at: string };
        Insert: { id?: string; office_id: string; kind: string; token_hash: string; contact_id?: string | null; lead_id?: string | null; property_id?: string | null; title?: string | null; note?: string | null; expires_at: string; created_by: string };
        Update: { title?: string | null; note?: string | null; revoked_at?: string | null; open_count?: number; last_opened_at?: string | null };
        Relationships: [];
      };
      crm_public_link_items: {
        Row: { link_id: string; property_id: string; match_id: string | null; sort_order: number; response: Database["public"]["Enums"]["crm_match_response"] | null; comment: string | null; responded_at: string | null };
        Insert: { link_id: string; property_id: string; match_id?: string | null; sort_order?: number };
        Update: { response?: Database["public"]["Enums"]["crm_match_response"] | null; comment?: string | null; responded_at?: string | null };
        Relationships: [];
      };
      crm_open_houses: {
        Row: { id: string; office_id: string; property_id: string; kind: string; code_hash: string; title: string | null; host_id: string; owner_agent_id: string; starts_at: string | null; ends_at: string | null; revoked_at: string | null; visit_count: number; created_by: string; created_at: string };
        Insert: { id?: string; office_id: string; property_id: string; kind?: string; code_hash: string; title?: string | null; host_id: string; owner_agent_id: string; starts_at?: string | null; ends_at?: string | null; created_by: string };
        Update: { title?: string | null; revoked_at?: string | null; visit_count?: number };
        Relationships: [];
      };
      crm_open_house_visits: {
        Row: { id: string; office_id: string; open_house_id: string; lead_id: string | null; existing_lead: boolean; client_hash: string | null; created_at: string };
        Insert: { id?: string; office_id: string; open_house_id: string; lead_id?: string | null; existing_lead?: boolean; client_hash?: string | null };
        Update: { lead_id?: string | null };
        Relationships: [];
      };
      // === U9: crm-reports-uat — view-үүдээ Views хэсэгт нэм ===
      // === Оффисын дотоод чат (20261109000200) ===
      // Зөвхөн гишүүд уншина; клиент зөвхөн мессеж нэмнэ, бусад нь staff_chat_* RPC-ээр.
      staff_chats: {
        Row: {
          id: string;
          office_id: string;
          kind: Database["public"]["Enums"]["staff_chat_kind"];
          name: string | null;
          team_id: string | null;
          direct_key: string | null;
          created_by: string | null;
          last_message_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          kind: Database["public"]["Enums"]["staff_chat_kind"];
          name?: string | null;
          team_id?: string | null;
          direct_key?: string | null;
          created_by?: string | null;
          last_message_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["staff_chats"]["Insert"]>;
        Relationships: [];
      };
      staff_chat_members: {
        Row: {
          chat_id: string;
          profile_id: string;
          joined_at: string;
          last_read_at: string | null;
        };
        Insert: {
          chat_id: string;
          profile_id: string;
          joined_at?: string;
          last_read_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["staff_chat_members"]["Insert"]>;
        Relationships: [];
      };
      staff_chat_messages: {
        Row: {
          id: string;
          chat_id: string;
          sender_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          chat_id: string;
          sender_id?: string | null;
          body: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["staff_chat_messages"]["Insert"]>;
        Relationships: [];
      };
      // === CRM календарь (20261111000100) ===
      // owner_id ба created_by хоёул profiles руу FK — profiles-ийг embed хийхгүй, нэрийг тусад нь уншина.
      // Харах, нуух (is_private → «Завгүй») нь crm_calendar_events() RPC-ээр.
      crm_events: {
        Row: {
          id: string;
          office_id: string;
          owner_id: string;
          title: string;
          description: string | null;
          location: string | null;
          kind: "meeting" | "call" | "showing" | "personal" | "other";
          starts_at: string;
          ends_at: string;
          all_day: boolean;
          is_private: boolean;
          attendee_ids: string[];
          lead_id: string | null;
          contact_id: string | null;
          opportunity_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          owner_id: string;
          title: string;
          description?: string | null;
          location?: string | null;
          kind?: "meeting" | "call" | "showing" | "personal" | "other";
          starts_at: string;
          ends_at: string;
          all_day?: boolean;
          is_private?: boolean;
          attendee_ids?: string[];
          lead_id?: string | null;
          contact_id?: string | null;
          opportunity_id?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_events"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      // === U8: crm-automation-notify (000800) ===
      crm_v_golden_rule_violations: {
        Row: {
          id: string;
          office_id: string;
          contact_id: string;
          owner_id: string | null;
          grade: Database["public"]["Enums"]["crm_lead_grade"] | null;
          last_contact_at: string | null;
          next_step: string | null;
          next_step_date: string | null;
          missing: string[];
        };
        Relationships: [];
      };
      crm_v_lead_hygiene: {
        Row: {
          id: string;
          office_id: string;
          owner_id: string | null;
          grade: Database["public"]["Enums"]["crm_lead_grade"] | null;
          status: Database["public"]["Enums"]["crm_lifecycle"];
          unprotected: boolean;
          inactivity_days: number;
          next_step_date: string | null;
          next_step_overdue: boolean;
        };
        Relationships: [];
      };
      // === U9: crm-reports-uat (000900) ===
      crm_v_agent_today: {
        Row: {
          office_id: string;
          owner_id: string;
          new_leads: number;
          steps_today: number;
          steps_overdue: number;
          hot_leads: number;
          active_leads: number;
          tasks_today: number;
          tasks_overdue: number;
          showings_today: number;
          pending_feedback: number;
          open_opps: number;
          weighted_amount: number;
          offer_opps: number;
          closing_opps: number;
        };
        Relationships: [];
      };
      crm_v_lead_funnel: {
        Row: {
          office_id: string;
          month: string;
          source_code: string;
          source_label: string;
          leads_total: number;
          leads_new: number;
          leads_active: number;
          leads_recycled: number;
          leads_qualified: number;
          leads_won: number;
          won_amount: number;
          sla_met: number;
          sla_total: number;
          first_contact_avg_min: number | null;
        };
        Relationships: [];
      };
      crm_v_pipeline_forecast: {
        Row: {
          office_id: string;
          pipeline_id: string;
          pipeline_code: string;
          pipeline_name: string;
          owner_id: string;
          branch_id: string | null;
          open_count: number;
          total_amount: number;
          weighted_amount: number;
          weighted_30: number;
          weighted_60: number;
          weighted_90: number;
          aml_held_count: number;
        };
        Relationships: [];
      };
      crm_v_arrears_aging: {
        Row: {
          office_id: string;
          invoice_id: string;
          number: string;
          type: Database["public"]["Enums"]["crm_invoice_type"];
          lease_id: string | null;
          lease_number: string | null;
          property_id: string | null;
          tenant_contact_id: string | null;
          grace_days: number | null;
          recipient_contact_id: string;
          due_on: string;
          amount: number;
          paid_amount: number;
          balance: number;
          overdue_days: number;
          bucket: string;
          last_step: number | null;
          last_escalated_at: string | null;
          status: Database["public"]["Enums"]["crm_invoice_status"];
        };
        Relationships: [];
      };
      crm_v_occupancy: {
        Row: {
          office_id: string;
          branch_id: string | null;
          managed_count: number;
          occupied_count: number;
          vacant_count: number;
          make_ready_count: number;
          notice_given_count: number;
          occupancy_pct: number | null;
          vacant_days_total: number;
          avg_days_to_rent: number | null;
        };
        Relationships: [];
      };
      crm_v_monthly_compliance: {
        Row: {
          office_id: string;
          month: string;
          records_total: number;
          records_complete: number;
          completion_pct: number | null;
          avg_completeness: number;
          hold_count: number;
          statements_total: number;
          statements_sent: number;
          statements_on_time: number;
          statements_acknowledged: number;
          on_time_pct: number | null;
        };
        Relationships: [];
      };
      crm_v_commission_summary: {
        Row: {
          office_id: string;
          month: string;
          status: Database["public"]["Enums"]["crm_commission_status"];
          cnt: number;
          total_amount: number;
          total_paid: number;
          with_hold_reason: number;
        };
        Relationships: [];
      };
      crm_v_kpi_monthly: {
        Row: {
          office_id: string;
          month: string;
          closed_txn_count: number;
          closed_amount_mnt: number;
          repeat_txn_count: number;
          verified_income_mnt: number;
          new_leads: number;
          leads_with_source: number;
          sla_met: number;
          sla_total: number;
          material_activities: number;
          same_day_logged: number;
          showings: number;
          showings_with_feedback: number;
          nps_avg: number | null;
          nps_count: number;
          nps_score: number | null;
          referral_count: number;
          lost_opps: number;
          lost_with_reason: number;
          escalation_count: number;
          recurring_revenue: number;
        };
        Relationships: [];
      };
      // === U6 (PRO-001 v2.1): crm-quality-kpi (20261107001600, 001750) ===
      crm_v_quality_checks: {
        Row: {
          office_id: string;
          criterion: string;
          entity: string;
          entity_id: string;
          agent_id: string | null;
          branch_id: string | null;
          occurred_on: string | null;
          result: string;
          reason: string | null;
          label: string | null;
        };
        Relationships: [];
      };
      crm_v_quality_summary: {
        Row: {
          office_id: string;
          branch_id: string | null;
          criterion: string;
          total: number;
          passed: number;
        };
        Relationships: [];
      };
      crm_v_agent_data_quality: {
        Row: {
          office_id: string;
          agent_id: string;
          checked: number;
          passed: number;
          quality_pct: number | null;
          by_criterion: Json;
        };
        Relationships: [];
      };
      crm_v_cross_branch_deals: {
        Row: {
          office_id: string;
          transaction_id: string;
          number: string;
          status: Database["public"]["Enums"]["crm_txn_status"];
          amount_mnt: number | null;
          closed_on: string | null;
          opportunity_id: string | null;
          owner_id: string | null;
          opp_branch_id: string | null;
          property_branch_id: string | null;
          branch_ids: string[];
          agent_count: number;
          open_disputes: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      jwt_role: { Args: Record<string, never>; Returns: Database["public"]["Enums"]["user_role"] };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      my_office_id: { Args: Record<string, never>; Returns: string };
      owns_agent: { Args: { a: string }; Returns: boolean };
      can_manage_agent: { Args: { a: string }; Returns: boolean };
      can_manage_listing: { Args: { l: string }; Returns: boolean };
      in_conversation: { Args: { c: string }; Returns: boolean };
      invite_lookup: { Args: { p_token: string }; Returns: { office_id: string; office_name: string }[] };
      listings_map: {
        Args: Record<string, never>;
        Returns: { id: string; title: string; price: number; district: string | null; ai_score: number | null; lng: number; lat: number }[];
      };
      listings_within: {
        Args: { p_lng: number; p_lat: number; p_m: number };
        Returns: { id: string; title: string; price: number; district: string | null; ai_score: number | null; lng: number; lat: number; dist_m: number }[];
      };
      listing_point: {
        Args: { p_id: string };
        Returns: { lng: number; lat: number }[];
      };
      replace_listing_photos: {
        Args: { p_listing_id: string; p_urls: string[] };
        Returns: undefined;
      };
      // === U1: crm-foundation ===
      crm_office_id: { Args: Record<string, never>; Returns: string };
      crm_my_staff_id: { Args: Record<string, never>; Returns: string };
      crm_my_roles: { Args: Record<string, never>; Returns: Database["public"]["Enums"]["crm_role"][] };
      has_crm_role: { Args: { r: Database["public"]["Enums"]["crm_role"][] }; Returns: boolean };
      crm_is_manager: { Args: Record<string, never>; Returns: boolean };
      crm_my_team: { Args: Record<string, never>; Returns: string };
      crm_same_office: { Args: { o: string }; Returns: boolean };
      crm_is_team_of: { Args: { p_profile: string }; Returns: boolean };
      crm_can_view_pl6: { Args: { p_pipeline: string }; Returns: boolean };
      crm_office_has_staff: { Args: { o: string }; Returns: boolean };
      crm_is_panel_admin: { Args: Record<string, never>; Returns: boolean };
      crm_setting_at: { Args: { p_office: string; p_key: string; p_at?: string }; Returns: Json };
      crm_add_business_days: { Args: { p_office: string; p_from: string; p_days: number }; Returns: string };
      crm_next_number: { Args: { p_office: string; p_kind: string }; Returns: string };
      crm_write_audit: {
        Args: {
          p_office: string;
          p_entity: string;
          p_entity_id: string;
          p_action: string;
          p_field?: string | null;
          p_old?: Json | null;
          p_new?: Json | null;
          p_reason?: string | null;
        };
        Returns: undefined;
      };
      // === U2–U9: өөрийн RPC-үүдээ ЭНД нэм (append-only) ===
      // === U2: crm-contacts-leads ===
      crm_normalize_phone: { Args: { raw: string }; Returns: string };
      crm_can_view_contact: { Args: { c: string }; Returns: boolean };
      crm_can_edit_contact: { Args: { c: string }; Returns: boolean };
      crm_reassign_lead: {
        Args: { p_lead: string; p_new_owner: string; p_reason: string; p_note?: string | null };
        Returns: undefined;
      };
      crm_merge_contacts: {
        Args: { p_primary: string; p_merged: string; p_choices: Json; p_aml_approval_note?: string | null };
        Returns: undefined;
      };
      // === U4 (PRO-001 v2.1): crm-ownership-governance (20261107001100–001350) ===
      crm_find_duplicates: {
        Args: { p_phone?: string | null; p_email?: string | null; p_name?: string | null; p_exclude?: string | null };
        Returns: {
          contact_id: string;
          match_kind: string;
          can_view: boolean;
          display_name: string;
          masked_phone: string | null;
          created_at: string;
          branch_name: string | null;
          open_lead_id: string | null;
          open_lead_status: string | null;
          owner_id: string | null;
          owner_name: string | null;
          owner_is_me: boolean;
        }[];
      };
      crm_open_lead_dispute: {
        Args: { p_contact: string; p_claim: string; p_evidence?: Json; p_kind?: string };
        Returns: string;
      };
      crm_add_dispute_evidence: {
        Args: { p_dispute: string; p_note?: string | null; p_evidence?: Json };
        Returns: undefined;
      };
      crm_review_lead_dispute: {
        Args: { p_dispute: string; p_note: string; p_recommendation?: string | null };
        Returns: undefined;
      };
      crm_escalate_lead_dispute: { Args: { p_dispute: string; p_reason: string }; Returns: undefined };
      crm_decide_lead_dispute: {
        Args: { p_dispute: string; p_decision: string; p_rationale: string };
        Returns: undefined;
      };
      crm_appeal_lead_dispute: { Args: { p_dispute: string; p_text: string }; Returns: undefined };
      crm_decide_lead_appeal: {
        Args: { p_dispute: string; p_outcome: string; p_rationale: string };
        Returns: undefined;
      };
      crm_withdraw_lead_dispute: { Args: { p_dispute: string }; Returns: undefined };
      crm_lead_dispute_facts: { Args: { p_dispute: string }; Returns: Json };
      crm_lead_dispute_conflict: { Args: { p_dispute: string; p_profile: string }; Returns: string | null };
      crm_recycle_lead: {
        Args: { p_lead: string; p_reason: string; p_note: string; p_release?: boolean };
        Returns: undefined;
      };
      crm_request_pool_claim: { Args: { p_lead: string; p_note: string }; Returns: string };
      crm_decide_pool_claim: {
        Args: { p_claim: string; p_approve: boolean; p_note?: string | null };
        Returns: undefined;
      };
      crm_cancel_pool_claim: { Args: { p_claim: string }; Returns: undefined };
      crm_accept_lead: { Args: { p_lead: string }; Returns: undefined };
      crm_pool_leads: {
        Args: Record<string, never>;
        Returns: {
          lead_id: string;
          grade: string | null;
          recycled_at: string | null;
          recycle_reason: string | null;
          source_label: string | null;
          branch_name: string | null;
          masked_name: string;
          contact_types: string[];
          last_contact_at: string | null;
          created_at: string;
          pending_claims: number;
          my_claim_id: string | null;
        }[];
      };
      crm_offboarding_blockers: { Args: { p_profile: string }; Returns: Json };
      crm_decide_export_request: {
        Args: { p_request: string; p_approve: boolean; p_note?: string | null; p_max_rows?: number | null };
        Returns: undefined;
      };
      crm_consume_export_request: { Args: { p_request: string; p_rows: number }; Returns: undefined };
      crm_anonymize_blockers: { Args: { p_contact: string }; Returns: string[] };
      crm_decide_data_request: {
        Args: { p_request: string; p_approve: boolean; p_note: string };
        Returns: undefined;
      };
      crm_complete_data_request: { Args: { p_request: string }; Returns: undefined };
      crm_anonymize_contact: { Args: { p_request: string }; Returns: undefined };
      // === U3: crm-properties-matching ===
      crm_can_edit_property: { Args: { p: string }; Returns: boolean };
      crm_can_view_match: { Args: { p_profile: string; p_property: string }; Returns: boolean };
      crm_property_activation_check: { Args: { p_property: string }; Returns: string[] };
      crm_set_property_status: {
        Args: {
          p_property: string;
          p_status: Database["public"]["Enums"]["crm_property_status"];
          p_reason?: string | null;
        };
        Returns: undefined;
      };
      crm_update_property_price: {
        Args: { p_property: string; p_price?: number | null; p_rent_price?: number | null; p_reason?: string | null };
        Returns: undefined;
      };
      crm_reassign_property_role: {
        Args: {
          p_property: string;
          p_role: Database["public"]["Enums"]["crm_property_role"];
          p_new_agent: string;
          p_reason: string;
        };
        Returns: undefined;
      };
      // === U4: crm-pipeline-activities ===
      crm_can_view_opportunity: { Args: { o: string }; Returns: boolean };
      crm_can_edit_opportunity: { Args: { o: string }; Returns: boolean };
      crm_check_gate: {
        Args: { p_opportunity: string; p_gate: Database["public"]["Enums"]["crm_gate_code"] };
        Returns: string[];
      };
      crm_move_opportunity_stage: {
        Args: {
          p_opp: string;
          p_to_stage: string;
          p_reason?: string | null;
          p_lost_reason_id?: string | null;
          p_lost_note?: string | null;
        };
        Returns: undefined;
      };
      crm_transfer_opportunity_pipeline: {
        Args: { p_opp: string; p_to_pipeline_code: string; p_reason: string };
        Returns: undefined;
      };
      crm_reassign_opportunity: {
        Args: { p_opp: string; p_new_owner: string; p_reason: string; p_note?: string | null };
        Returns: undefined;
      };
      // === U5: crm-transactions-aml ===
      crm_txn_on_hold: { Args: { t: string }; Returns: boolean };
      crm_can_view_txn: { Args: { t: string }; Returns: boolean };
      crm_can_edit_txn: { Args: { t: string }; Returns: boolean };
      crm_can_view_document: { Args: { d: string }; Returns: boolean };
      crm_recompute_txn_completeness: { Args: { p_txn: string }; Returns: number };
      crm_get_aml_cases: { Args: { p_status?: string | null }; Returns: Json[] };
      crm_get_aml_case: { Args: { p_id: string }; Returns: Json };
      crm_log_doc_view: { Args: { p_doc: string }; Returns: undefined };
      crm_apply_txn_correction: {
        Args: { p_txn: string; p_changes: Json; p_rationale: string };
        Returns: undefined;
      };
      // === U6: crm-rentals ===
      crm_can_view_lease: { Args: { l: string }; Returns: boolean };
      crm_can_edit_lease: { Args: { l: string }; Returns: boolean };
      crm_can_view_mgmt_agreement: { Args: { a: string }; Returns: boolean };
      crm_lease_duration_tier: {
        Args: { p_office: string; p_start: string; p_end: string };
        Returns: string;
      };
      crm_monthly_completeness: { Args: { p_data: Json }; Returns: number };
      // === U7: crm-commissions ===
      crm_commission_set_status: {
        Args: {
          p_id: string;
          p_to: Database["public"]["Enums"]["crm_commission_status"];
          p_note?: string | null;
        };
        Returns: undefined;
      };
      crm_commission_release_hold: {
        Args: { p_id: string; p_note?: string | null };
        Returns: Database["public"]["Enums"]["crm_commission_status"];
      };
      crm_commission_record_payout: {
        Args: { p_id: string; p_amount: number; p_note?: string | null };
        Returns: Database["public"]["Enums"]["crm_commission_status"];
      };
      // === U3 (PRO-001 v2.1): crm-deal-flow ===
      crm_get_opp_offers: { Args: { p_opp: string }; Returns: Record<string, unknown>[] };
      crm_can_act_on_offer: { Args: { p_offer: string }; Returns: boolean };
      crm_decide_offer: {
        Args: { p_offer: string; p_action: string; p_channel?: string | null; p_note?: string | null; p_doc?: string | null };
        Returns: string;
      };
      crm_request_offer_approval: { Args: { p_offer: string; p_note: string }; Returns: undefined };
      crm_decide_offer_approval: { Args: { p_offer: string; p_approve: boolean; p_note?: string | null }; Returns: undefined };
      crm_review_contract: { Args: { p_contract: string; p_note?: string | null }; Returns: undefined };
      crm_txn_closing_checks: { Args: { p_txn: string }; Returns: Json };
      // === U6 (PRO-001 v2.1): crm-quality-kpi ===
      crm_kpi_pipeline_in: { Args: { p_office: string; p_code: string; p_list?: string }; Returns: boolean };
      crm_quality_audit_start: {
        Args: {
          p_period_start: string;
          p_period_end: string;
          p_scope?: string;
          p_branch?: string | null;
          p_agent?: string | null;
          p_sample?: number | null;
        };
        Returns: string;
      };
      crm_quality_audit_review: { Args: { p_item: string; p_result: string; p_note?: string | null }; Returns: undefined };
      crm_quality_audit_complete: {
        Args: { p_audit: string; p_summary: string; p_accept_rest?: boolean };
        Returns: number | null;
      };
      crm_quality_audit_cancel: { Args: { p_audit: string; p_reason: string }; Returns: undefined };
      crm_fx_rate: { Args: { p_office: string; p_currency: string; p_on?: string | null }; Returns: number | null };
      crm_take_forecast_snapshot: { Args: { p_office: string; p_month: string; p_kind?: string }; Returns: string };
      crm_approve_forecast_snapshot: { Args: { p_id: string; p_note?: string | null }; Returns: undefined };
      crm_commission_dispute_conflict: { Args: { p_dispute: string; p_profile: string }; Returns: string | null };
      crm_commission_txn_party: { Args: { p_txn: string }; Returns: boolean };
      crm_commission_dispute_can_add: { Args: { p_dispute: string }; Returns: boolean };
      crm_kpi_followup: {
        Args: { p_from: string; p_to: string };
        Returns: {
          office_id: string;
          agent_id: string;
          active_leads: number;
          leads_with_next_step: number;
          steps_total: number;
          steps_overdue: number;
          showings_total: number;
          showings_feedback_ok: number;
          offers_open: number;
          offers_followed: number;
          hot_leads: number;
          hot_leads_on_freq: number;
          material_total: number;
          material_same_day: number;
        }[];
      };
      crm_kpi_funnel: {
        Args: { p_from: string; p_to: string };
        Returns: {
          office_id: string;
          owner_id: string | null;
          branch_id: string | null;
          source_id: string | null;
          campaign_code: string | null;
          s1: number;
          s2: number;
          s3: number;
          s4: number;
          s5: number;
          s6: number;
          s7: number;
          s8: number;
          s9: number;
          s10: number;
        }[];
      };
      crm_kpi_pipeline_stages: {
        Args: Record<string, never>;
        Returns: {
          office_id: string;
          pipeline_code: string;
          pipeline_name: string;
          stage_code: string;
          stage_name: string;
          sort_order: number;
          probability: number;
          owner_id: string | null;
          branch_id: string | null;
          open_count: number;
          amount_mnt: number;
          weighted_mnt: number;
          fee_mnt: number;
          weighted_fee_mnt: number;
          unconverted_count: number;
          close_week_count: number;
          close_week_weighted_fee: number;
          close_month_count: number;
          close_month_weighted_fee: number;
          overdue_close_count: number;
        }[];
      };
      crm_kpi_period_metrics: {
        Args: { p_from: string; p_to: string };
        Returns: {
          office_id: string;
          metric: string;
          period_month: string;
          owner_id: string | null;
          branch_id: string | null;
          source_id: string | null;
          campaign_code: string | null;
          pipeline_code: string | null;
          dim_code: string | null;
          dim_label: string | null;
          cnt: number;
          value: number;
        }[];
      };
      crm_kpi_response_time: {
        Args: { p_from: string; p_to: string };
        Returns: {
          office_id: string;
          owner_id: string | null;
          source_id: string | null;
          week_start: string;
          contacted: number;
          avg_min: number | null;
          median_min: number | null;
          within_sla: number;
          sla_total: number;
        }[];
      };
      // === U7 (PRO-001 v2.1): crm-weekly-cycle ===
      crm_agent_week_metrics: {
        Args: { p_week: string; p_office?: string | null; p_agent?: string | null };
        Returns: { office_id: string; agent_id: string; metric_code: string; actual: number | null }[];
      };
      crm_agent_week_moves: {
        Args: { p_week: string; p_office?: string | null; p_agent?: string | null };
        Returns: {
          office_id: string;
          agent_id: string;
          opportunity_id: string;
          from_sort: number | null;
          to_sort: number | null;
          to_terminal: string | null;
          moves: number;
        }[];
      };
      crm_weekly_freeze: { Args: { p_office: string; p_week: string; p_kind: string }; Returns: number };
      crm_take_agent_daily_stats: { Args: Record<string, never>; Returns: number };
      crm_weekly_scope_agents: {
        Args: { p_office?: string | null; p_agent?: string | null };
        Returns: { office_id: string; agent_id: string; cfg: Json }[];
      };
      crm_weekly_can_view: { Args: { p_agent: string }; Returns: boolean };
      crm_weekly_can_approve: { Args: { p_agent: string }; Returns: boolean };
      crm_weekly_final_lock_at: { Args: { p_office: string; p_week: string }; Returns: string };
      // === U8 (PRO-001 v2.1): crm-mobile-growth ===
      crm_track_enroll: { Args: { p_template: string; p_lead?: string | null; p_opportunity?: string | null }; Returns: string };
      crm_track_stop: { Args: { p_enrollment: string }; Returns: undefined };
      crm_leaderboard: {
        Args: { p_from: string; p_to: string };
        Returns: { agent_id: string; agent_name: string; team_id: string | null; branch_id: string | null; meaningful_contacts: number; showings_done: number; offers: number; contracts: number; closed_won: number }[];
      };
      // === Баг, оффисын дотоод чат (20261109000200, 000300) ===
      crm_can_manage_teams: { Args: Record<string, never>; Returns: boolean };
      crm_team_roster: {
        Args: Record<string, never>;
        Returns: {
          profile_id: string;
          name: string;
          /** agents.avatar (үсгэн товчлол) ч байж болно — lib/crm/avatar.ts-ээр ялгана. */
          avatar_url: string | null;
          phone: string | null;
          user_role: Database["public"]["Enums"]["user_role"];
          staff_id: string | null;
          team_id: string | null;
          is_active: boolean | null;
          roles: Database["public"]["Enums"]["crm_role"][] | null;
        }[];
      };
      crm_team_save: { Args: { p_id: string | null; p_name: string; p_branch: string }; Returns: string };
      /** p_team = null бол багаас гаргана. CRM-д шинээр бүртгэгдсэн бол true. */
      crm_team_assign_member: { Args: { p_team: string | null; p_profile: string }; Returns: boolean };
      /** p_profile = null бол ахлагчийг чөлөөлнө (баг удирдах эрхтэй хэн ч); томилох нь зөвхөн оффисын админ. */
      crm_team_set_lead: { Args: { p_team: string; p_profile: string | null }; Returns: undefined };
      // === Ахлагчийг оффисын админ батална (20261110000100) ===
      crm_can_approve_team_lead: { Args: Record<string, never>; Returns: boolean };
      /** Оффисын админ бол шууд томилно ('applied'), бусад үед санал болгоно ('pending'). */
      crm_team_propose_lead: { Args: { p_team: string; p_profile: string }; Returns: string };
      /** Зөвхөн оффисын админ. Батлагдсан ахлагчийн profile_id. */
      crm_team_approve_lead: { Args: { p_team: string }; Returns: string };
      /** Оффисын админ татгалзана эсвэл санал болгогч өөрийн саналаа цуцлана. */
      crm_team_reject_lead: { Args: { p_team: string }; Returns: undefined };
      staff_chat_directory: {
        Args: Record<string, never>;
        Returns: {
          profile_id: string;
          name: string;
          avatar_url: string | null;
          role: Database["public"]["Enums"]["user_role"];
          team_name: string | null;
        }[];
      };
      staff_chat_open_direct: { Args: { p_other: string }; Returns: string };
      staff_chat_create_group: { Args: { p_name: string; p_members: string[] }; Returns: string };
      staff_chat_add_members: { Args: { p_chat: string; p_members: string[] }; Returns: undefined };
      staff_chat_leave: { Args: { p_chat: string }; Returns: undefined };
      staff_chat_mark_read: { Args: { p_chat: string }; Returns: undefined };
      staff_chat_list: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          kind: Database["public"]["Enums"]["staff_chat_kind"];
          name: string | null;
          team_id: string | null;
          last_message_at: string | null;
          created_at: string;
          last_body: string | null;
          last_sender_id: string | null;
          unread_count: number;
          member_count: number;
          other_profile_id: string | null;
          other_name: string | null;
          other_avatar_url: string | null;
        }[];
      };
      staff_chat_people: {
        Args: { p_chat: string };
        Returns: { profile_id: string; name: string; avatar_url: string | null; last_read_at: string | null }[];
      };
      // === CRM календарь (20261111000100) ===
      /** Өөрийн, менежер бүгдийн, багийн ахлагч гишүүдийнхээ календарийг харна. */
      crm_calendar_can_view: { Args: { p_profile: string }; Returns: boolean };
      /** Муж 62 хоногоос ихгүй. Хувийн үйл явдлыг эзэн/урилгатай хүнээс бусдад masked=true, гарчиг «Завгүй». */
      crm_calendar_events: {
        Args: { p_from: string; p_to: string; p_people: string[] };
        Returns: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          location: string | null;
          kind: "meeting" | "call" | "showing" | "personal" | "other";
          starts_at: string;
          ends_at: string;
          all_day: boolean;
          is_private: boolean;
          attendee_ids: string[];
          lead_id: string | null;
          contact_id: string | null;
          opportunity_id: string | null;
          masked: boolean;
          can_edit: boolean;
        }[];
      };
    };
    Enums: {
      user_role: "buyer" | "agent" | "office_admin" | "admin";
      listing_status: "active" | "draft" | "review" | "sold";
      lead_stage: "new" | "contacted" | "viewing" | "offer" | "closed" | "lost";
      lead_source: "website" | "facebook" | "instagram" | "google" | "referral" | "other";
      activity_kind: "call" | "meeting" | "message" | "note" | "viewing" | "email";
      project_type: "buy" | "sell" | "rent_out" | "rent_in";
      project_status: "active" | "on_hold" | "won" | "lost";
      viewing_status: "pending" | "confirmed" | "done" | "cancelled";
      subscription_status: "trialing" | "active" | "past_due" | "canceled";
      deal_type: "sale" | "rent";
      agent_status: "pending" | "active" | "rejected";
      office_request_status: "pending" | "approved" | "rejected";
      task_status: "pending" | "in_progress" | "completed" | "deferred";
      task_priority: "low" | "normal" | "high" | "urgent";
      task_member_role: "observer" | "participant";
      // === U1: crm-foundation (PMC CRM enum-ууд — 20260901000100) ===
      crm_role:
        | "agent"
        | "team_lead"
        | "sales_director"
        | "ops_qc"
        | "marketing"
        | "property_manager"
        | "finance"
        | "aml_officer"
        | "ceo"
        | "sysadmin";
      crm_contact_kind: "person" | "company";
      crm_contact_type: "buyer" | "seller" | "tenant" | "landlord" | "investor" | "applicant";
      crm_lifecycle: "new" | "active" | "recycled" | "inactive" | "archived";
      crm_lead_grade: "a" | "b" | "c" | "d";
      crm_consent_status: "granted" | "not_asked" | "declined";
      crm_profile_status: "active" | "paused" | "fulfilled" | "lost";
      crm_service_kind: "sale" | "standard_rental" | "managed_rental";
      crm_property_status: "draft" | "active" | "reserved" | "sold" | "rented" | "withdrawn";
      crm_occupancy_status: "vacant" | "occupied" | "make_ready" | "notice_given";
      crm_property_role: "sourcing" | "photo" | "contract";
      crm_activity_channel: "call" | "chat" | "email" | "meeting" | "showing" | "task";
      crm_activity_outcome: "open" | "advanced" | "lost" | "won";
      crm_match_response: "interested" | "maybe" | "not_fit" | "no_response";
      crm_opp_state: "open" | "won" | "lost";
      crm_txn_type: "sale" | "standard_rental" | "managed_rental" | "international_sale" | "replacement";
      crm_txn_status: "draft" | "contract" | "payment" | "closed" | "cancelled";
      crm_kyc_status: "pending" | "verified" | "edd" | "suspended";
      crm_aml_risk: "low" | "medium" | "high" | "prohibited";
      crm_aml_case_status: "open" | "investigating" | "str_sent" | "closed";
      crm_gate_code:
        | "g0"
        | "g1"
        | "g2"
        | "g3"
        | "g4"
        | "g5"
        | "g6"
        | "g_contact"
        | "g_match"
        | "g_showing"
        | "g_interest"
        | "g_counter"
        | "g_meeting"
        | "g_valuation"
        | "g_listing_live"
        | "g_buyer_activity";
      crm_lease_status: "draft" | "active" | "renewed" | "terminated" | "expired";
      crm_invoice_type: "mgmt_fee" | "brokerage_fee" | "extra_service";
      crm_invoice_status: "planned" | "sent" | "partially_paid" | "paid" | "cancelled";
      crm_payment_kind: "income" | "control";
      crm_maintenance_status: "new" | "pending_approval" | "assigned" | "in_progress" | "closed" | "rejected";
      crm_urgency: "urgent" | "normal" | "planned";
      crm_commission_status: "calculated" | "reviewed" | "approved" | "paid" | "partially_paid" | "hold" | "cancelled";
      crm_commission_role:
        | "sourcing"
        | "listing"
        | "photo"
        | "contract"
        | "selling"
        | "seller_side"
        | "buyer_side"
        | "intl_lead_gen"
        | "deal_manager"
        | "pm_team";
      crm_party_role: "seller" | "buyer" | "lessor" | "lessee";
      crm_expense_bearer: "tenant" | "landlord" | "pmc";
      crm_inspection_kind: "move_in" | "move_out" | "periodic";
      crm_doc_category: "contract" | "payment_proof" | "ownership" | "identity" | "photo" | "act" | "aml" | "other";
      staff_chat_kind: "direct" | "group" | "team";
    };
    CompositeTypes: Record<string, never>;
  };
};
