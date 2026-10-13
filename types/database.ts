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
          created_at: string;
        };
        Insert: {
          id?: string;
          office_id: string;
          branch_id: string;
          name: string;
          lead_profile_id?: string | null;
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
          unprotected: boolean;
          inactivity_days: number;
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
      // === U9: crm-reports-uat — view-үүдээ Views хэсэгт нэм ===
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
      crm_gate_code: "g0" | "g1" | "g2" | "g3" | "g4" | "g5" | "g6";
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
    };
    CompositeTypes: Record<string, never>;
  };
};
