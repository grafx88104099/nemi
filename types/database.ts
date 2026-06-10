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
    };
    Views: Record<string, never>;
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
    };
    CompositeTypes: Record<string, never>;
  };
};
