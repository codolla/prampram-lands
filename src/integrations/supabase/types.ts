export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      app_settings: {
        Row: {
          arkesel_api_key: string | null;
          created_at: string;
          hubtel_client_id: string | null;
          hubtel_client_secret: string | null;
          id: string;
          mnotify_api_key: string | null;
          payment_template: string;
          reminder_cooldown_days: number;
          reminder_template: string;
          sms_provider: string;
          sms_sender_id: string;
          updated_at: string;
        };
        Insert: {
          arkesel_api_key?: string | null;
          created_at?: string;
          hubtel_client_id?: string | null;
          hubtel_client_secret?: string | null;
          id?: string;
          mnotify_api_key?: string | null;
          payment_template?: string;
          reminder_cooldown_days?: number;
          reminder_template?: string;
          sms_provider?: string;
          sms_sender_id?: string;
          updated_at?: string;
        };
        Update: {
          arkesel_api_key?: string | null;
          created_at?: string;
          hubtel_client_id?: string | null;
          hubtel_client_secret?: string | null;
          id?: string;
          mnotify_api_key?: string | null;
          payment_template?: string;
          reminder_cooldown_days?: number;
          reminder_template?: string;
          sms_provider?: string;
          sms_sender_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      bills: {
        Row: {
          amount: number;
          billing_year: number;
          created_at: string;
          created_by: string | null;
          due_date: string;
          id: string;
          issued_at: string;
          land_id: string;
          notes: string | null;
          status: Database["public"]["Enums"]["bill_status"];
          updated_at: string;
        };
        Insert: {
          amount: number;
          billing_year: number;
          created_at?: string;
          created_by?: string | null;
          due_date: string;
          id?: string;
          issued_at?: string;
          land_id: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["bill_status"];
          updated_at?: string;
        };
        Update: {
          amount?: number;
          billing_year?: number;
          created_at?: string;
          created_by?: string | null;
          due_date?: string;
          id?: string;
          issued_at?: string;
          land_id?: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["bill_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bills_land_id_fkey";
            columns: ["land_id"];
            isOneToOne: false;
            referencedRelation: "lands";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          created_at: string;
          file_name: string;
          id: string;
          kind: Database["public"]["Enums"]["document_kind"];
          land_id: string | null;
          landowner_id: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          storage_path: string;
          uploaded_by: string | null;
        };
        Insert: {
          created_at?: string;
          file_name: string;
          id?: string;
          kind?: Database["public"]["Enums"]["document_kind"];
          land_id?: string | null;
          landowner_id?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          storage_path: string;
          uploaded_by?: string | null;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["document_kind"];
          land_id?: string | null;
          landowner_id?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          storage_path?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "documents_land_id_fkey";
            columns: ["land_id"];
            isOneToOne: false;
            referencedRelation: "lands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_landowner_id_fkey";
            columns: ["landowner_id"];
            isOneToOne: false;
            referencedRelation: "landowners";
            referencedColumns: ["id"];
          },
        ];
      };
      land_coordinates: {
        Row: {
          created_at: string;
          id: string;
          land_id: string;
          lat: number;
          lng: number;
          seq: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          land_id: string;
          lat: number;
          lng: number;
          seq: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          land_id?: string;
          lat?: number;
          lng?: number;
          seq?: number;
        };
        Relationships: [
          {
            foreignKeyName: "land_coordinates_land_id_fkey";
            columns: ["land_id"];
            isOneToOne: false;
            referencedRelation: "lands";
            referencedColumns: ["id"];
          },
        ];
      };
      land_staff_assignments: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          land_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          land_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          land_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      land_types: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          label: string;
          name: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          label: string;
          name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          label?: string;
          name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      landowners: {
        Row: {
          address: string | null;
          avatar_url: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          full_name: string;
          id: string;
          national_id: string | null;
          notes: string | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          full_name: string;
          id?: string;
          national_id?: string | null;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          full_name?: string;
          id?: string;
          national_id?: string | null;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      lands: {
        Row: {
          annual_rent_amount: number;
          area_sqm: number | null;
          boundary: unknown;
          boundary_type: string | null;
          created_at: string;
          created_by: string | null;
          current_owner_id: string | null;
          family: string | null;
          gps_lat: number | null;
          gps_lng: number | null;
          id: string;
          land_code: string;
          land_type_id: string;
          location_description: string | null;
          notes: string | null;
          plot_number: string | null;
          rent_package_id: string | null;
          size_unit: Database["public"]["Enums"]["size_unit"];
          size_value: number | null;
          status: Database["public"]["Enums"]["land_status"];
          updated_at: string;
        };
        Insert: {
          annual_rent_amount?: number;
          area_sqm?: number | null;
          boundary?: unknown;
          boundary_type?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_owner_id?: string | null;
          family?: string | null;
          gps_lat?: number | null;
          gps_lng?: number | null;
          id?: string;
          land_code?: string;
          land_type_id: string;
          location_description?: string | null;
          notes?: string | null;
          plot_number?: string | null;
          rent_package_id?: string | null;
          size_unit?: Database["public"]["Enums"]["size_unit"];
          size_value?: number | null;
          status?: Database["public"]["Enums"]["land_status"];
          updated_at?: string;
        };
        Update: {
          annual_rent_amount?: number;
          area_sqm?: number | null;
          boundary?: unknown;
          boundary_type?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_owner_id?: string | null;
          family?: string | null;
          gps_lat?: number | null;
          gps_lng?: number | null;
          id?: string;
          land_code?: string;
          land_type_id?: string;
          location_description?: string | null;
          notes?: string | null;
          plot_number?: string | null;
          rent_package_id?: string | null;
          size_unit?: Database["public"]["Enums"]["size_unit"];
          size_value?: number | null;
          status?: Database["public"]["Enums"]["land_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lands_current_owner_id_fkey";
            columns: ["current_owner_id"];
            isOneToOne: false;
            referencedRelation: "landowners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lands_land_type_id_fkey";
            columns: ["land_type_id"];
            isOneToOne: false;
            referencedRelation: "land_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lands_rent_package_id_fkey";
            columns: ["rent_package_id"];
            isOneToOne: false;
            referencedRelation: "rent_packages";
            referencedColumns: ["id"];
          },
        ];
      };
      ownership_history: {
        Row: {
          created_at: string;
          end_date: string | null;
          id: string;
          land_id: string;
          owner_id: string;
          recorded_by: string | null;
          start_date: string;
          transfer_note: string | null;
        };
        Insert: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          land_id: string;
          owner_id: string;
          recorded_by?: string | null;
          start_date?: string;
          transfer_note?: string | null;
        };
        Update: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          land_id?: string;
          owner_id?: string;
          recorded_by?: string | null;
          start_date?: string;
          transfer_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ownership_history_land_id_fkey";
            columns: ["land_id"];
            isOneToOne: false;
            referencedRelation: "lands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ownership_history_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "landowners";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          bill_id: string;
          created_at: string;
          id: string;
          method: Database["public"]["Enums"]["payment_method"];
          notes: string | null;
          paid_at: string;
          receipt_number: string;
          recorded_by: string | null;
          reference: string | null;
        };
        Insert: {
          amount: number;
          bill_id: string;
          created_at?: string;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          notes?: string | null;
          paid_at?: string;
          receipt_number?: string;
          recorded_by?: string | null;
          reference?: string | null;
        };
        Update: {
          amount?: number;
          bill_id?: string;
          created_at?: string;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          notes?: string | null;
          paid_at?: string;
          receipt_number?: string;
          recorded_by?: string | null;
          reference?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_bill_id_fkey";
            columns: ["bill_id"];
            isOneToOne: false;
            referencedRelation: "bills";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_components: {
        Row: {
          active: boolean;
          calc_type: Database["public"]["Enums"]["payroll_calc_type"];
          code: string | null;
          created_at: string;
          default_amount: number;
          description: string | null;
          id: string;
          is_statutory: boolean;
          name: string;
          type: Database["public"]["Enums"]["payroll_component_type"];
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          calc_type?: Database["public"]["Enums"]["payroll_calc_type"];
          code?: string | null;
          created_at?: string;
          default_amount?: number;
          description?: string | null;
          id?: string;
          is_statutory?: boolean;
          name: string;
          type: Database["public"]["Enums"]["payroll_component_type"];
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          calc_type?: Database["public"]["Enums"]["payroll_calc_type"];
          code?: string | null;
          created_at?: string;
          default_amount?: number;
          description?: string | null;
          id?: string;
          is_statutory?: boolean;
          name?: string;
          type?: Database["public"]["Enums"]["payroll_component_type"];
          updated_at?: string;
        };
        Relationships: [];
      };
      payroll_runs: {
        Row: {
          created_at: string;
          created_by: string | null;
          finalized_at: string | null;
          id: string;
          notes: string | null;
          paid_at: string | null;
          period_month: number;
          period_year: number;
          status: Database["public"]["Enums"]["payroll_run_status"];
          total_deductions: number;
          total_gross: number;
          total_net: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          finalized_at?: string | null;
          id?: string;
          notes?: string | null;
          paid_at?: string | null;
          period_month: number;
          period_year: number;
          status?: Database["public"]["Enums"]["payroll_run_status"];
          total_deductions?: number;
          total_gross?: number;
          total_net?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          finalized_at?: string | null;
          id?: string;
          notes?: string | null;
          paid_at?: string | null;
          period_month?: number;
          period_year?: number;
          status?: Database["public"]["Enums"]["payroll_run_status"];
          total_deductions?: number;
          total_gross?: number;
          total_net?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      payroll_staff: {
        Row: {
          active: boolean;
          bank_account: string | null;
          bank_name: string | null;
          base_salary: number;
          created_at: string;
          created_by: string | null;
          employee_number: string | null;
          full_name: string;
          hire_date: string | null;
          id: string;
          job_title: string | null;
          notes: string | null;
          ssnit_number: string | null;
          tin_number: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          active?: boolean;
          bank_account?: string | null;
          bank_name?: string | null;
          base_salary?: number;
          created_at?: string;
          created_by?: string | null;
          employee_number?: string | null;
          full_name: string;
          hire_date?: string | null;
          id?: string;
          job_title?: string | null;
          notes?: string | null;
          ssnit_number?: string | null;
          tin_number?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          active?: boolean;
          bank_account?: string | null;
          bank_name?: string | null;
          base_salary?: number;
          created_at?: string;
          created_by?: string | null;
          employee_number?: string | null;
          full_name?: string;
          hire_date?: string | null;
          id?: string;
          job_title?: string | null;
          notes?: string | null;
          ssnit_number?: string | null;
          tin_number?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      payroll_staff_components: {
        Row: {
          active: boolean;
          amount: number | null;
          component_id: string;
          created_at: string;
          id: string;
          staff_id: string;
        };
        Insert: {
          active?: boolean;
          amount?: number | null;
          component_id: string;
          created_at?: string;
          id?: string;
          staff_id: string;
        };
        Update: {
          active?: boolean;
          amount?: number | null;
          component_id?: string;
          created_at?: string;
          id?: string;
          staff_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_staff_components_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "payroll_components";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_staff_components_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "payroll_staff";
            referencedColumns: ["id"];
          },
        ];
      };
      payslips: {
        Row: {
          base_salary: number;
          breakdown: Json;
          created_at: string;
          gross_pay: number;
          id: string;
          net_pay: number;
          paid: boolean;
          paid_at: string | null;
          run_id: string;
          staff_id: string;
          total_deductions: number;
          total_earnings: number;
          user_id: string | null;
        };
        Insert: {
          base_salary?: number;
          breakdown?: Json;
          created_at?: string;
          gross_pay?: number;
          id?: string;
          net_pay?: number;
          paid?: boolean;
          paid_at?: string | null;
          run_id: string;
          staff_id: string;
          total_deductions?: number;
          total_earnings?: number;
          user_id?: string | null;
        };
        Update: {
          base_salary?: number;
          breakdown?: Json;
          created_at?: string;
          gross_pay?: number;
          id?: string;
          net_pay?: number;
          paid?: boolean;
          paid_at?: string | null;
          run_id?: string;
          staff_id?: string;
          total_deductions?: number;
          total_earnings?: number;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payslips_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "payroll_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payslips_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "payroll_staff";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      rent_packages: {
        Row: {
          active: boolean;
          annual_amount: number;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          land_type_id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          annual_amount: number;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          land_type_id: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          annual_amount?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          land_type_id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rent_packages_land_type_id_fkey";
            columns: ["land_type_id"];
            isOneToOne: false;
            referencedRelation: "land_types";
            referencedColumns: ["id"];
          },
        ];
      };
      sms_logs: {
        Row: {
          bill_id: string | null;
          created_at: string;
          id: string;
          landowner_id: string | null;
          message: string;
          phone: string;
          provider: string;
          provider_response: string | null;
          sent_by: string | null;
          status: string;
        };
        Insert: {
          bill_id?: string | null;
          created_at?: string;
          id?: string;
          landowner_id?: string | null;
          message: string;
          phone: string;
          provider: string;
          provider_response?: string | null;
          sent_by?: string | null;
          status: string;
        };
        Update: {
          bill_id?: string | null;
          created_at?: string;
          id?: string;
          landowner_id?: string | null;
          message?: string;
          phone?: string;
          provider?: string;
          provider_response?: string | null;
          sent_by?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      spatial_ref_sys: {
        Row: {
          auth_name: string | null;
          auth_srid: number | null;
          proj4text: string | null;
          srid: number;
          srtext: string | null;
        };
        Insert: {
          auth_name?: string | null;
          auth_srid?: number | null;
          proj4text?: string | null;
          srid: number;
          srtext?: string | null;
        };
        Update: {
          auth_name?: string | null;
          auth_srid?: number | null;
          proj4text?: string | null;
          srid?: number;
          srtext?: string | null;
        };
        Relationships: [];
      };
      staff_zone_assignments: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          user_id: string;
          zone_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          user_id: string;
          zone_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          user_id?: string;
          zone_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_zone_assignments_zone_id_fkey";
            columns: ["zone_id"];
            isOneToOne: false;
            referencedRelation: "staff_zones";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_zones: {
        Row: {
          active: boolean;
          boundary: unknown;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          name: string;
          ring: Json | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          boundary: unknown;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          ring?: Json | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          boundary?: unknown;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          ring?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null;
          f_geography_column: unknown;
          f_table_catalog: unknown;
          f_table_name: unknown;
          f_table_schema: unknown;
          srid: number | null;
          type: string | null;
        };
        Relationships: [];
      };
      geometry_columns: {
        Row: {
          coord_dimension: number | null;
          f_geometry_column: unknown;
          f_table_catalog: string | null;
          f_table_name: unknown;
          f_table_schema: unknown;
          srid: number | null;
          type: string | null;
        };
        Insert: {
          coord_dimension?: number | null;
          f_geometry_column?: unknown;
          f_table_catalog?: string | null;
          f_table_name?: unknown;
          f_table_schema?: unknown;
          srid?: number | null;
          type?: string | null;
        };
        Update: {
          coord_dimension?: number | null;
          f_geometry_column?: unknown;
          f_table_catalog?: string | null;
          f_table_name?: unknown;
          f_table_schema?: unknown;
          srid?: number | null;
          type?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string };
        Returns: undefined;
      };
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown };
        Returns: unknown;
      };
      _postgis_pgsql_version: { Args: never; Returns: string };
      _postgis_scripts_pgsql_version: { Args: never; Returns: string };
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown };
        Returns: number;
      };
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown };
        Returns: string;
      };
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_dwithin: {
        Args: {
          geog1: unknown;
          geog2: unknown;
          tolerance: number;
          use_spheroid?: boolean;
        };
        Returns: boolean;
      };
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown };
        Returns: number;
      };
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_sortablehash: { Args: { geom: unknown }; Returns: number };
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_voronoi: {
        Args: {
          clip?: unknown;
          g1: unknown;
          return_polygons?: boolean;
          tolerance?: number;
        };
        Returns: unknown;
      };
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      addauth: { Args: { "": string }; Returns: boolean };
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string;
              column_name: string;
              new_dim: number;
              new_srid_in: number;
              new_type: string;
              schema_name: string;
              table_name: string;
              use_typmod?: boolean;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: string;
              new_dim: number;
              new_srid: number;
              new_type: string;
              schema_name: string;
              table_name: string;
              use_typmod?: boolean;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: string;
              new_dim: number;
              new_srid: number;
              new_type: string;
              table_name: string;
              use_typmod?: boolean;
            };
            Returns: string;
          };
      disablelongtransactions: { Args: never; Returns: string };
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string;
              column_name: string;
              schema_name: string;
              table_name: string;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: string;
              schema_name: string;
              table_name: string;
            };
            Returns: string;
          }
        | { Args: { column_name: string; table_name: string }; Returns: string };
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string;
              schema_name: string;
              table_name: string;
            };
            Returns: string;
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string };
      enablelongtransactions: { Args: never; Returns: string };
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      find_overlapping_lands: {
        Args: { _exclude_land_id?: string; _geojson: Json };
        Returns: {
          land_code: string;
          land_id: string;
          overlap_sqm: number;
        }[];
      };
      geometry: { Args: { "": string }; Returns: unknown };
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geomfromewkt: { Args: { "": string }; Returns: unknown };
      gettransactionid: { Args: never; Returns: unknown };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_authenticated: { Args: never; Returns: boolean };
      is_staff_assigned_to_land: {
        Args: { _land_id: string; _user_id: string };
        Returns: boolean;
      };
      is_staff_assigned_to_owner: {
        Args: { _owner_id: string; _user_id: string };
        Returns: boolean;
      };
      longtransactionsenabled: { Args: never; Returns: boolean };
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string };
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string };
        Returns: number;
      };
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string };
        Returns: number;
      };
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string };
        Returns: string;
      };
      postgis_extensions_upgrade: { Args: never; Returns: string };
      postgis_full_version: { Args: never; Returns: string };
      postgis_geos_version: { Args: never; Returns: string };
      postgis_lib_build_date: { Args: never; Returns: string };
      postgis_lib_revision: { Args: never; Returns: string };
      postgis_lib_version: { Args: never; Returns: string };
      postgis_libjson_version: { Args: never; Returns: string };
      postgis_liblwgeom_version: { Args: never; Returns: string };
      postgis_libprotobuf_version: { Args: never; Returns: string };
      postgis_libxml_version: { Args: never; Returns: string };
      postgis_proj_version: { Args: never; Returns: string };
      postgis_scripts_build_date: { Args: never; Returns: string };
      postgis_scripts_installed: { Args: never; Returns: string };
      postgis_scripts_released: { Args: never; Returns: string };
      postgis_svn_version: { Args: never; Returns: string };
      postgis_type_name: {
        Args: {
          coord_dimension: number;
          geomname: string;
          use_new_name?: boolean;
        };
        Returns: string;
      };
      postgis_version: { Args: never; Returns: string };
      postgis_wagyu_version: { Args: never; Returns: string };
      rebuild_land_boundary_from_coords: {
        Args: { _land_id: string };
        Returns: undefined;
      };
      set_land_boundary_from_geojson: {
        Args: { _boundary_type: string; _geojson: Json; _land_id: string };
        Returns: Json;
      };
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown };
            Returns: number;
          };
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number };
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number };
        Returns: string;
      };
      st_asewkt: { Args: { "": string }; Returns: string };
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number };
            Returns: string;
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number };
            Returns: string;
          }
        | {
            Args: {
              geom_column?: string;
              maxdecimaldigits?: number;
              pretty_bool?: boolean;
              r: Record<string, unknown>;
            };
            Returns: string;
          }
        | { Args: { "": string }; Returns: string };
      st_asgml:
        | {
            Args: {
              geog: unknown;
              id?: string;
              maxdecimaldigits?: number;
              nprefix?: string;
              options?: number;
            };
            Returns: string;
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number };
            Returns: string;
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown;
              id?: string;
              maxdecimaldigits?: number;
              nprefix?: string;
              options?: number;
              version: number;
            };
            Returns: string;
          }
        | {
            Args: {
              geom: unknown;
              id?: string;
              maxdecimaldigits?: number;
              nprefix?: string;
              options?: number;
              version: number;
            };
            Returns: string;
          };
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string };
            Returns: string;
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string };
            Returns: string;
          }
        | { Args: { "": string }; Returns: string };
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string };
        Returns: string;
      };
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string };
      st_asmvtgeom: {
        Args: {
          bounds: unknown;
          buffer?: number;
          clip_geom?: boolean;
          extent?: number;
          geom: unknown;
        };
        Returns: unknown;
      };
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number };
            Returns: string;
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number };
            Returns: string;
          }
        | { Args: { "": string }; Returns: string };
      st_astext: { Args: { "": string }; Returns: string };
      st_astwkb:
        | {
            Args: {
              geom: unknown;
              prec?: number;
              prec_m?: number;
              prec_z?: number;
              with_boxes?: boolean;
              with_sizes?: boolean;
            };
            Returns: string;
          }
        | {
            Args: {
              geom: unknown[];
              ids: number[];
              prec?: number;
              prec_m?: number;
              prec_z?: number;
              with_boxes?: boolean;
              with_sizes?: boolean;
            };
            Returns: string;
          };
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number };
        Returns: string;
      };
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown };
        Returns: unknown;
      };
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number };
            Returns: unknown;
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number };
            Returns: unknown;
          };
      st_centroid: { Args: { "": string }; Returns: unknown };
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown };
        Returns: unknown;
      };
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean;
          param_geom: unknown;
          param_pctconvex: number;
        };
        Returns: unknown;
      };
      st_contains: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_coorddim: { Args: { geometry: unknown }; Returns: number };
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number };
        Returns: unknown;
      };
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number };
        Returns: unknown;
      };
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean };
            Returns: number;
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number };
            Returns: number;
          };
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_dwithin: {
        Args: {
          geog1: unknown;
          geog2: unknown;
          tolerance: number;
          use_spheroid?: boolean;
        };
        Returns: boolean;
      };
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number };
            Returns: unknown;
          }
        | {
            Args: {
              dm?: number;
              dx: number;
              dy: number;
              dz?: number;
              geom: unknown;
            };
            Returns: unknown;
          };
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown };
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number };
        Returns: unknown;
      };
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number };
        Returns: unknown;
      };
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number };
        Returns: unknown;
      };
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number };
            Returns: unknown;
          };
      st_geogfromtext: { Args: { "": string }; Returns: unknown };
      st_geographyfromtext: { Args: { "": string }; Returns: unknown };
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string };
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown };
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean;
          g: unknown;
          max_iter?: number;
          tolerance?: number;
        };
        Returns: unknown;
      };
      st_geometryfromtext: { Args: { "": string }; Returns: unknown };
      st_geomfromewkt: { Args: { "": string }; Returns: unknown };
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown };
      st_geomfromgml: { Args: { "": string }; Returns: unknown };
      st_geomfromkml: { Args: { "": string }; Returns: unknown };
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown };
      st_geomfromtext: { Args: { "": string }; Returns: unknown };
      st_gmltosql: { Args: { "": string }; Returns: unknown };
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean };
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number };
        Returns: unknown;
      };
      st_hexagongrid: {
        Args: { bounds: unknown; size: number };
        Returns: Record<string, unknown>[];
      };
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown };
        Returns: number;
      };
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number };
        Returns: unknown;
      };
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown };
        Returns: Database["public"]["CompositeTypes"]["valid_detail"];
        SetofOptions: {
          from: "*";
          to: "valid_detail";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number };
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown };
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown };
        Returns: number;
      };
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string };
        Returns: unknown;
      };
      st_linefromtext: { Args: { "": string }; Returns: unknown };
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown };
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number };
        Returns: unknown;
      };
      st_locatebetween: {
        Args: {
          frommeasure: number;
          geometry: unknown;
          leftrightoffset?: number;
          tomeasure: number;
        };
        Returns: unknown;
      };
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number };
        Returns: unknown;
      };
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_makevalid: {
        Args: { geom: unknown; params: string };
        Returns: unknown;
      };
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number };
        Returns: unknown;
      };
      st_mlinefromtext: { Args: { "": string }; Returns: unknown };
      st_mpointfromtext: { Args: { "": string }; Returns: unknown };
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown };
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown };
      st_multipointfromtext: { Args: { "": string }; Returns: unknown };
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown };
      st_node: { Args: { g: unknown }; Returns: unknown };
      st_normalize: { Args: { geom: unknown }; Returns: unknown };
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string };
        Returns: unknown;
      };
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean };
        Returns: number;
      };
      st_pointfromtext: { Args: { "": string }; Returns: unknown };
      st_pointm: {
        Args: {
          mcoordinate: number;
          srid?: number;
          xcoordinate: number;
          ycoordinate: number;
        };
        Returns: unknown;
      };
      st_pointz: {
        Args: {
          srid?: number;
          xcoordinate: number;
          ycoordinate: number;
          zcoordinate: number;
        };
        Returns: unknown;
      };
      st_pointzm: {
        Args: {
          mcoordinate: number;
          srid?: number;
          xcoordinate: number;
          ycoordinate: number;
          zcoordinate: number;
        };
        Returns: unknown;
      };
      st_polyfromtext: { Args: { "": string }; Returns: unknown };
      st_polygonfromtext: { Args: { "": string }; Returns: unknown };
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown };
        Returns: unknown;
      };
      st_quantizecoordinates: {
        Args: {
          g: unknown;
          prec_m?: number;
          prec_x: number;
          prec_y?: number;
          prec_z?: number;
        };
        Returns: unknown;
      };
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number };
        Returns: unknown;
      };
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string };
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number };
        Returns: unknown;
      };
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown };
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number };
        Returns: unknown;
      };
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number };
        Returns: unknown;
      };
      st_squaregrid: {
        Args: { bounds: unknown; size: number };
        Returns: Record<string, unknown>[];
      };
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number };
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number };
        Returns: unknown[];
      };
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown };
        Returns: unknown;
      };
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number };
        Returns: unknown;
      };
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_tileenvelope: {
        Args: {
          bounds?: unknown;
          margin?: number;
          x: number;
          y: number;
          zoom: number;
        };
        Returns: unknown;
      };
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string };
            Returns: unknown;
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number };
            Returns: unknown;
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown };
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown };
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number };
            Returns: unknown;
          };
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown };
      st_wkttosql: { Args: { "": string }; Returns: unknown };
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number };
        Returns: unknown;
      };
      unlockrows: { Args: { "": string }; Returns: number };
      updategeometrysrid: {
        Args: {
          catalogn_name: string;
          column_name: string;
          new_srid_in: number;
          schema_name: string;
          table_name: string;
        };
        Returns: string;
      };
      upsert_staff_zone: {
        Args: {
          _active: boolean;
          _description: string;
          _id: string;
          _name: string;
          _ring: Json;
        };
        Returns: string;
      };
    };
    Enums: {
      app_role: "admin" | "staff" | "finance" | "manager" | "frontdesk";
      bill_status: "pending" | "partial" | "paid" | "overdue";
      document_kind: "indenture" | "agreement" | "receipt" | "other";
      land_status: "active" | "disputed" | "leased";
      payment_method: "cash" | "momo" | "bank";
      payroll_calc_type: "fixed" | "percent_of_base";
      payroll_component_type: "earning" | "deduction";
      payroll_run_status: "draft" | "finalized" | "paid";
      size_unit: "acres" | "hectares";
    };
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null;
        geom: unknown;
      };
      valid_detail: {
        valid: boolean | null;
        reason: string | null;
        location: unknown;
      };
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff", "finance", "manager", "frontdesk"],
      bill_status: ["pending", "partial", "paid", "overdue"],
      document_kind: ["indenture", "agreement", "receipt", "other"],
      land_status: ["active", "disputed", "leased"],
      payment_method: ["cash", "momo", "bank"],
      payroll_calc_type: ["fixed", "percent_of_base"],
      payroll_component_type: ["earning", "deduction"],
      payroll_run_status: ["draft", "finalized", "paid"],
      size_unit: ["acres", "hectares"],
    },
  },
} as const;
