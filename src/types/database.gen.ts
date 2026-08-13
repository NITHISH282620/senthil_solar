export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          check_in_at: string | null
          check_in_lat: number | null
          check_in_lng: number | null
          check_in_photo_url: string | null
          check_out_at: string | null
          check_out_lat: number | null
          check_out_lng: number | null
          company_id: string | null
          contract_id: string | null
          correction_reason: string | null
          created_at: string
          date: string
          day_fraction: number
          deleted_at: string | null
          distance_from_site_m: number | null
          employee_id: string
          id: string
          is_approved: boolean
          is_corrected: boolean
          is_locked: boolean
          marked_by: string | null
          notes: string | null
          overtime_hours: number
          site_id: string
          source: string
          status: string
          updated_at: string
          within_geofence: boolean | null
          worked_hours: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_photo_url?: string | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          company_id?: string | null
          contract_id?: string | null
          correction_reason?: string | null
          created_at?: string
          date: string
          day_fraction?: number
          deleted_at?: string | null
          distance_from_site_m?: number | null
          employee_id: string
          id?: string
          is_approved?: boolean
          is_corrected?: boolean
          is_locked?: boolean
          marked_by?: string | null
          notes?: string | null
          overtime_hours?: number
          site_id: string
          source?: string
          status?: string
          updated_at?: string
          within_geofence?: boolean | null
          worked_hours?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_photo_url?: string | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          company_id?: string | null
          contract_id?: string | null
          correction_reason?: string | null
          created_at?: string
          date?: string
          day_fraction?: number
          deleted_at?: string | null
          distance_from_site_m?: number | null
          employee_id?: string
          id?: string
          is_approved?: boolean
          is_corrected?: boolean
          is_locked?: boolean
          marked_by?: string | null
          notes?: string | null
          overtime_hours?: number
          site_id?: string
          source?: string
          status?: string
          updated_at?: string
          within_geofence?: boolean | null
          worked_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "attendance_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changed_fields: string[] | null
          created_at: string
          id: number
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          changed_fields?: string[] | null
          created_at?: string
          id?: number
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          changed_fields?: string[] | null
          created_at?: string
          id?: number
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          account_type: string
          bank_name: string
          branch: string | null
          created_at: string
          deleted_at: string | null
          id: string
          ifsc: string
          is_active: boolean
          is_primary: boolean
          opening_balance: number
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          account_type?: string
          bank_name: string
          branch?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          ifsc: string
          is_active?: boolean
          is_primary?: boolean
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          account_type?: string
          bank_name?: string
          branch?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          ifsc?: string
          is_active?: boolean
          is_primary?: boolean
          opening_balance?: number
          updated_at?: string
        }
        Relationships: []
      }
      cash_book: {
        Row: {
          amount: number
          bank_account_id: string | null
          category: string | null
          company_id: string | null
          contract_id: string | null
          counterparty: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          direction: string
          entry_date: string
          handled_by: string | null
          id: string
          is_office: boolean
          notes: string | null
          payment_mode: string
          reference_id: string | null
          reference_table: string | null
          site_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          category?: string | null
          company_id?: string | null
          contract_id?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          direction: string
          entry_date?: string
          handled_by?: string | null
          id?: string
          is_office?: boolean
          notes?: string | null
          payment_mode?: string
          reference_id?: string | null
          reference_table?: string | null
          site_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          category?: string | null
          company_id?: string | null
          contract_id?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          direction?: string
          entry_date?: string
          handled_by?: string | null
          id?: string
          is_office?: boolean
          notes?: string | null
          payment_mode?: string
          reference_id?: string | null
          reference_table?: string | null
          site_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_book_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_book_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "cash_book_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_book_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "cash_book_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_book_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "cash_book_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_book_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_book_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_book_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_book_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_book_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
        ]
      }
      companies: {
        Row: {
          billing_address: string | null
          city: string | null
          company_code: string
          company_type: string
          created_at: string
          created_by: string | null
          credit_limit: number | null
          deleted_at: string | null
          gst_number: string | null
          id: string
          legal_name: string | null
          name: string
          notes: string | null
          pan_number: string | null
          payment_terms_days: number
          pincode: string | null
          retention_percent: number
          shipping_address: string | null
          state: string | null
          state_code: string | null
          status: string
          tds_applicable: boolean
          tds_percent: number
          updated_at: string
        }
        Insert: {
          billing_address?: string | null
          city?: string | null
          company_code: string
          company_type?: string
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          deleted_at?: string | null
          gst_number?: string | null
          id?: string
          legal_name?: string | null
          name: string
          notes?: string | null
          pan_number?: string | null
          payment_terms_days?: number
          pincode?: string | null
          retention_percent?: number
          shipping_address?: string | null
          state?: string | null
          state_code?: string | null
          status?: string
          tds_applicable?: boolean
          tds_percent?: number
          updated_at?: string
        }
        Update: {
          billing_address?: string | null
          city?: string | null
          company_code?: string
          company_type?: string
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          deleted_at?: string | null
          gst_number?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          notes?: string | null
          pan_number?: string | null
          payment_terms_days?: number
          pincode?: string | null
          retention_percent?: number
          shipping_address?: string | null
          state?: string | null
          state_code?: string | null
          status?: string
          tds_applicable?: boolean
          tds_percent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      company_contacts: {
        Row: {
          company_id: string
          contact_type: string | null
          created_at: string
          deleted_at: string | null
          designation: string | null
          email: string | null
          id: string
          is_primary: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          contact_type?: string | null
          created_at?: string
          deleted_at?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_type?: string | null
          created_at?: string
          deleted_at?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          cin_number: string | null
          city: string | null
          company_name: string
          contract_prefix: string
          default_geofence_radius_m: number
          default_gst_percent: number
          email: string | null
          employee_prefix: string
          expense_prefix: string
          financial_year_start_month: number
          gst_number: string | null
          id: string
          invoice_prefix: string
          legal_name: string | null
          logo_url: string | null
          ot_after_hours: number
          pan_number: string | null
          phone: string | null
          pincode: string | null
          po_prefix: string
          quotation_prefix: string
          shift_end_time: string
          shift_start_time: string
          site_prefix: string
          standard_hours_per_day: number
          state: string | null
          state_code: string | null
          updated_at: string
          website: string | null
          working_days_per_month: number
        }
        Insert: {
          address?: string | null
          cin_number?: string | null
          city?: string | null
          company_name?: string
          contract_prefix?: string
          default_geofence_radius_m?: number
          default_gst_percent?: number
          email?: string | null
          employee_prefix?: string
          expense_prefix?: string
          financial_year_start_month?: number
          gst_number?: string | null
          id?: string
          invoice_prefix?: string
          legal_name?: string | null
          logo_url?: string | null
          ot_after_hours?: number
          pan_number?: string | null
          phone?: string | null
          pincode?: string | null
          po_prefix?: string
          quotation_prefix?: string
          shift_end_time?: string
          shift_start_time?: string
          site_prefix?: string
          standard_hours_per_day?: number
          state?: string | null
          state_code?: string | null
          updated_at?: string
          website?: string | null
          working_days_per_month?: number
        }
        Update: {
          address?: string | null
          cin_number?: string | null
          city?: string | null
          company_name?: string
          contract_prefix?: string
          default_geofence_radius_m?: number
          default_gst_percent?: number
          email?: string | null
          employee_prefix?: string
          expense_prefix?: string
          financial_year_start_month?: number
          gst_number?: string | null
          id?: string
          invoice_prefix?: string
          legal_name?: string | null
          logo_url?: string | null
          ot_after_hours?: number
          pan_number?: string | null
          phone?: string | null
          pincode?: string | null
          po_prefix?: string
          quotation_prefix?: string
          shift_end_time?: string
          shift_start_time?: string
          site_prefix?: string
          standard_hours_per_day?: number
          state?: string | null
          state_code?: string | null
          updated_at?: string
          website?: string | null
          working_days_per_month?: number
        }
        Relationships: []
      }
      contract_milestones: {
        Row: {
          achieved_date: string | null
          amount: number
          contract_id: string
          created_at: string
          deleted_at: string | null
          due_date: string | null
          id: string
          notes: string | null
          sequence_no: number
          status: string
          title: string
          trigger_type: string
          trigger_value: number | null
          updated_at: string
        }
        Insert: {
          achieved_date?: string | null
          amount: number
          contract_id: string
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          sequence_no: number
          status?: string
          title: string
          trigger_type?: string
          trigger_value?: number | null
          updated_at?: string
        }
        Update: {
          achieved_date?: string | null
          amount?: number
          contract_id?: string
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          sequence_no?: number
          status?: string
          title?: string
          trigger_type?: string
          trigger_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_milestones_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_milestones_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
        ]
      }
      contracts: {
        Row: {
          actual_end_date: string | null
          company_id: string
          contract_number: string
          contract_value: number
          created_at: string
          created_by: string | null
          deadline_date: string | null
          deleted_at: string | null
          id: string
          notes: string | null
          payment_terms_days: number
          penalty_cap_percent: number
          penalty_per_day: number
          quotation_id: string | null
          retention_percent: number
          scope_description: string | null
          start_date: string | null
          status: string
          title: string
          total_capacity_kw: number | null
          updated_at: string
        }
        Insert: {
          actual_end_date?: string | null
          company_id: string
          contract_number: string
          contract_value?: number
          created_at?: string
          created_by?: string | null
          deadline_date?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          payment_terms_days?: number
          penalty_cap_percent?: number
          penalty_per_day?: number
          quotation_id?: string | null
          retention_percent?: number
          scope_description?: string | null
          start_date?: string | null
          status?: string
          title: string
          total_capacity_kw?: number | null
          updated_at?: string
        }
        Update: {
          actual_end_date?: string | null
          company_id?: string
          contract_number?: string
          contract_value?: number
          created_at?: string
          created_by?: string | null
          deadline_date?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          payment_terms_days?: number
          penalty_cap_percent?: number
          penalty_per_day?: number
          quotation_id?: string | null
          retention_percent?: number
          scope_description?: string | null
          start_date?: string | null
          status?: string
          title?: string
          total_capacity_kw?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_sequences: {
        Row: {
          current_value: number
          doc_type: string
          fiscal_year: number
        }
        Insert: {
          current_value?: number
          doc_type: string
          fiscal_year: number
        }
        Update: {
          current_value?: number
          doc_type?: string
          fiscal_year?: number
        }
        Relationships: []
      }
      documents: {
        Row: {
          category: string
          created_at: string
          deleted_at: string | null
          entity_id: string | null
          entity_type: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          is_confidential: boolean
          name: string
          notes: string | null
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          deleted_at?: string | null
          entity_id?: string | null
          entity_type: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_confidential?: boolean
          name: string
          notes?: string | null
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          deleted_at?: string | null
          entity_id?: string | null
          entity_type?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_confidential?: boolean
          name?: string
          notes?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          code: string
          icon: string | null
          is_active: boolean
          is_system: boolean
          label: string
          requires_head_count: boolean
          sort_order: number
        }
        Insert: {
          code: string
          icon?: string | null
          is_active?: boolean
          is_system?: boolean
          label: string
          requires_head_count?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          icon?: string | null
          is_active?: boolean
          is_system?: boolean
          label?: string
          requires_head_count?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          category: string
          company_id: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          expense_date: string
          expense_number: string
          head_count: number | null
          id: string
          meal_type: string | null
          paid_by: string | null
          payment_mode: string
          receipt_url: string | null
          rejection_reason: string | null
          site_id: string | null
          status: string
          title: string
          updated_at: string
          vendor_name: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          category: string
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          expense_date?: string
          expense_number: string
          head_count?: number | null
          id?: string
          meal_type?: string | null
          paid_by?: string | null
          payment_mode?: string
          receipt_url?: string | null
          rejection_reason?: string | null
          site_id?: string | null
          status?: string
          title: string
          updated_at?: string
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          expense_date?: string
          expense_number?: string
          head_count?: number | null
          id?: string
          meal_type?: string | null
          paid_by?: string | null
          payment_mode?: string
          receipt_url?: string | null
          rejection_reason?: string | null
          site_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "expenses_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
        ]
      }
      goods_receipt_items: {
        Row: {
          goods_receipt_id: string
          id: string
          material_id: string
          notes: string | null
          purchase_order_item_id: string
          quantity_received: number
          quantity_rejected: number
          unit_cost: number | null
        }
        Insert: {
          goods_receipt_id: string
          id?: string
          material_id: string
          notes?: string | null
          purchase_order_item_id: string
          quantity_received: number
          quantity_rejected?: number
          unit_cost?: number | null
        }
        Update: {
          goods_receipt_id?: string
          id?: string
          material_id?: string
          notes?: string | null
          purchase_order_item_id?: string
          quantity_received?: number
          quantity_rejected?: number
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_items_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          created_at: string
          deleted_at: string | null
          grn_number: string
          id: string
          invoice_number: string | null
          location_id: string
          notes: string | null
          purchase_order_id: string
          qc_notes: string | null
          qc_status: string
          received_by: string | null
          received_date: string
          updated_at: string
          vehicle_number: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          grn_number: string
          id?: string
          invoice_number?: string | null
          location_id: string
          notes?: string | null
          purchase_order_id: string
          qc_notes?: string | null
          qc_status?: string
          received_by?: string | null
          received_date?: string
          updated_at?: string
          vehicle_number?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          grn_number?: string
          id?: string
          invoice_number?: string | null
          location_id?: string
          notes?: string | null
          purchase_order_id?: string
          qc_notes?: string | null
          qc_status?: string
          received_by?: string | null
          received_date?: string
          updated_at?: string
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          certificate_url: string | null
          corrective_actions: string | null
          created_at: string
          deleted_at: string | null
          findings: string | null
          id: string
          inspected_at: string | null
          inspection_type: string
          inspector_id: string | null
          inspector_name: string | null
          result: string | null
          scheduled_date: string | null
          site_id: string
          stage: string | null
          updated_at: string
        }
        Insert: {
          certificate_url?: string | null
          corrective_actions?: string | null
          created_at?: string
          deleted_at?: string | null
          findings?: string | null
          id?: string
          inspected_at?: string | null
          inspection_type?: string
          inspector_id?: string | null
          inspector_name?: string | null
          result?: string | null
          scheduled_date?: string | null
          site_id: string
          stage?: string | null
          updated_at?: string
        }
        Update: {
          certificate_url?: string | null
          corrective_actions?: string | null
          created_at?: string
          deleted_at?: string | null
          findings?: string | null
          id?: string
          inspected_at?: string | null
          inspection_type?: string
          inspector_id?: string | null
          inspector_name?: string | null
          result?: string | null
          scheduled_date?: string | null
          site_id?: string
          stage?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "inspections_stage_fkey"
            columns: ["stage"]
            isOneToOne: false
            referencedRelation: "site_stages"
            referencedColumns: ["code"]
          },
        ]
      }
      invoice_items: {
        Row: {
          description: string
          gst_percent: number
          hsn_sac_code: string | null
          id: string
          invoice_id: string
          line_total: number | null
          quantity: number
          sort_order: number
          unit: string
          unit_price: number
        }
        Insert: {
          description: string
          gst_percent?: number
          hsn_sac_code?: string | null
          id?: string
          invoice_id: string
          line_total?: number | null
          quantity?: number
          sort_order?: number
          unit?: string
          unit_price?: number
        }
        Update: {
          description?: string
          gst_percent?: number
          hsn_sac_code?: string | null
          id?: string
          invoice_id?: string
          line_total?: number | null
          quantity?: number
          sort_order?: number
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_receivables_ageing"
            referencedColumns: ["invoice_id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_received: number
          balance_due: number | null
          billing_period_end: string | null
          billing_period_start: string | null
          cgst_amount: number
          company_id: string
          contract_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          discount_amount: number
          due_date: string | null
          eway_bill_no: string | null
          id: string
          igst_amount: number
          invoice_date: string
          invoice_number: string
          irn: string | null
          is_interstate: boolean
          milestone_id: string | null
          net_receivable: number | null
          notes: string | null
          place_of_supply_state_code: string | null
          retention_held: number
          sgst_amount: number
          site_id: string | null
          status: string
          subtotal: number
          taxable_amount: number | null
          tds_deducted: number
          terms: string | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          amount_received?: number
          balance_due?: number | null
          billing_period_end?: string | null
          billing_period_start?: string | null
          cgst_amount?: number
          company_id: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount_amount?: number
          due_date?: string | null
          eway_bill_no?: string | null
          id?: string
          igst_amount?: number
          invoice_date?: string
          invoice_number: string
          irn?: string | null
          is_interstate?: boolean
          milestone_id?: string | null
          net_receivable?: number | null
          notes?: string | null
          place_of_supply_state_code?: string | null
          retention_held?: number
          sgst_amount?: number
          site_id?: string | null
          status?: string
          subtotal?: number
          taxable_amount?: number | null
          tds_deducted?: number
          terms?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          amount_received?: number
          balance_due?: number | null
          billing_period_end?: string | null
          billing_period_start?: string | null
          cgst_amount?: number
          company_id?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount_amount?: number
          due_date?: string | null
          eway_bill_no?: string | null
          id?: string
          igst_amount?: number
          invoice_date?: string
          invoice_number?: string
          irn?: string | null
          is_interstate?: boolean
          milestone_id?: string | null
          net_receivable?: number | null
          notes?: string | null
          place_of_supply_state_code?: string | null
          retention_held?: number
          sgst_amount?: number
          site_id?: string | null
          status?: string
          subtotal?: number
          taxable_amount?: number | null
          tds_deducted?: number
          terms?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "contract_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          deleted_at: string | null
          employee_id: string
          from_date: string
          id: string
          is_paid: boolean
          leave_type: string
          reason: string
          rejection_reason: string | null
          status: string
          to_date: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          deleted_at?: string | null
          employee_id: string
          from_date: string
          id?: string
          is_paid?: boolean
          leave_type: string
          reason: string
          rejection_reason?: string | null
          status?: string
          to_date: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          deleted_at?: string | null
          employee_id?: string
          from_date?: string
          id?: string
          is_paid?: boolean
          leave_type?: string
          reason?: string
          rejection_reason?: string | null
          status?: string
          to_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          brand: string | null
          capacity_kw: number | null
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          gst_percent: number
          hsn_code: string | null
          id: string
          is_active: boolean
          model: string | null
          name: string
          reorder_level: number | null
          sku: string
          specification: string | null
          standard_cost: number | null
          unit: string
          updated_at: string
          wattage_w: number | null
        }
        Insert: {
          brand?: string | null
          capacity_kw?: number | null
          category: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          gst_percent?: number
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          model?: string | null
          name: string
          reorder_level?: number | null
          sku: string
          specification?: string | null
          standard_cost?: number | null
          unit?: string
          updated_at?: string
          wattage_w?: number | null
        }
        Update: {
          brand?: string | null
          capacity_kw?: number | null
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          gst_percent?: number
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          model?: string | null
          name?: string
          reorder_level?: number | null
          sku?: string
          specification?: string | null
          standard_cost?: number | null
          unit?: string
          updated_at?: string
          wattage_w?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          read_at: string | null
          recipient_id: string
          severity: string
          title: string
          type: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          recipient_id: string
          severity?: string
          title: string
          type: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          recipient_id?: string
          severity?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          company_id: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          direction: string
          id: string
          invoice_id: string | null
          notes: string | null
          payment_date: string
          payment_method: string
          received_by: string | null
          reference_number: string | null
          tds_deducted: number
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          direction?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_method: string
          received_by?: string | null
          reference_number?: string | null
          tds_deducted?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          direction?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_method?: string
          received_by?: string | null
          reference_number?: string | null
          tds_deducted?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_receivables_ageing"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_lines: {
        Row: {
          advance_deduction: number
          basic_amount: number
          bonus: number
          created_at: string
          employee_id: string
          gross_amount: number | null
          id: string
          is_paid: boolean
          net_amount: number | null
          notes: string | null
          ot_rate_used: number | null
          other_deduction: number
          overtime_amount: number
          overtime_hours: number
          paid_date: string | null
          paid_leave_days: number
          paid_method: string | null
          paid_reference: string | null
          payroll_run_id: string
          penalty_deduction: number
          piece_rate_used: number | null
          piece_units: number | null
          present_days: number
          rate_used: number | null
          updated_at: string
          wage_mode: string
        }
        Insert: {
          advance_deduction?: number
          basic_amount?: number
          bonus?: number
          created_at?: string
          employee_id: string
          gross_amount?: number | null
          id?: string
          is_paid?: boolean
          net_amount?: number | null
          notes?: string | null
          ot_rate_used?: number | null
          other_deduction?: number
          overtime_amount?: number
          overtime_hours?: number
          paid_date?: string | null
          paid_leave_days?: number
          paid_method?: string | null
          paid_reference?: string | null
          payroll_run_id: string
          penalty_deduction?: number
          piece_rate_used?: number | null
          piece_units?: number | null
          present_days?: number
          rate_used?: number | null
          updated_at?: string
          wage_mode: string
        }
        Update: {
          advance_deduction?: number
          basic_amount?: number
          bonus?: number
          created_at?: string
          employee_id?: string
          gross_amount?: number | null
          id?: string
          is_paid?: boolean
          net_amount?: number | null
          notes?: string | null
          ot_rate_used?: number | null
          other_deduction?: number
          overtime_amount?: number
          overtime_hours?: number
          paid_date?: string | null
          paid_leave_days?: number
          paid_method?: string | null
          paid_reference?: string | null
          payroll_run_id?: string
          penalty_deduction?: number
          piece_rate_used?: number | null
          piece_units?: number | null
          present_days?: number
          rate_used?: number | null
          updated_at?: string
          wage_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_lines_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          employee_count: number
          finalised_at: string | null
          finalised_by: string | null
          id: string
          notes: string | null
          period_month: number
          period_year: number
          status: string
          total_deductions: number
          total_gross: number
          total_net: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          employee_count?: number
          finalised_at?: string | null
          finalised_by?: string | null
          id?: string
          notes?: string | null
          period_month: number
          period_year: number
          status?: string
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          employee_count?: number
          finalised_at?: string | null
          finalised_by?: string | null
          id?: string
          notes?: string | null
          period_month?: number
          period_year?: number
          status?: string
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_finalised_by_fkey"
            columns: ["finalised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_finalised_by_fkey"
            columns: ["finalised_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_site_allocations: {
        Row: {
          allocated_amount: number
          company_id: string | null
          contract_id: string | null
          created_at: string
          days_worked: number
          id: string
          overtime_hours: number
          payroll_line_id: string
          site_id: string
        }
        Insert: {
          allocated_amount: number
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          days_worked: number
          id?: string
          overtime_hours?: number
          payroll_line_id: string
          site_id: string
        }
        Update: {
          allocated_amount?: number
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          days_worked?: number
          id?: string
          overtime_hours?: number
          payroll_line_id?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_site_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_site_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "payroll_site_allocations_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_site_allocations_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "payroll_site_allocations_payroll_line_id_fkey"
            columns: ["payroll_line_id"]
            isOneToOne: false
            referencedRelation: "payroll_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_site_allocations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_site_allocations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
        ]
      }
      profiles: {
        Row: {
          aadhaar_number: string | null
          address: string | null
          avatar_url: string | null
          bank_account_no: string | null
          bank_ifsc: string | null
          bank_name: string | null
          created_at: string
          created_by: string | null
          daily_rate: number | null
          date_of_joining: string | null
          date_of_leaving: string | null
          deleted_at: string | null
          department: string | null
          designation: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employee_code: string
          esi_number: string | null
          full_name: string
          id: string
          is_active: boolean
          monthly_salary: number | null
          notes: string | null
          ot_rate_per_hour: number | null
          pan_number: string | null
          pf_number: string | null
          phone: string | null
          piece_rate: number | null
          reports_to: string | null
          role: string
          trade: string | null
          updated_at: string
          upi_id: string | null
          wage_mode: string
        }
        Insert: {
          aadhaar_number?: string | null
          address?: string | null
          avatar_url?: string | null
          bank_account_no?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          daily_rate?: number | null
          date_of_joining?: string | null
          date_of_leaving?: string | null
          deleted_at?: string | null
          department?: string | null
          designation?: string | null
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_code: string
          esi_number?: string | null
          full_name: string
          id: string
          is_active?: boolean
          monthly_salary?: number | null
          notes?: string | null
          ot_rate_per_hour?: number | null
          pan_number?: string | null
          pf_number?: string | null
          phone?: string | null
          piece_rate?: number | null
          reports_to?: string | null
          role?: string
          trade?: string | null
          updated_at?: string
          upi_id?: string | null
          wage_mode?: string
        }
        Update: {
          aadhaar_number?: string | null
          address?: string | null
          avatar_url?: string | null
          bank_account_no?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          daily_rate?: number | null
          date_of_joining?: string | null
          date_of_leaving?: string | null
          deleted_at?: string | null
          department?: string | null
          designation?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_code?: string
          esi_number?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          monthly_salary?: number | null
          notes?: string | null
          ot_rate_per_hour?: number | null
          pan_number?: string | null
          pf_number?: string | null
          phone?: string | null
          piece_rate?: number | null
          reports_to?: string | null
          role?: string
          trade?: string | null
          updated_at?: string
          upi_id?: string | null
          wage_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
      projects: {
        Row: {
          contract_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          sequence_no: number
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          sequence_no?: number
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          sequence_no?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          gst_percent: number
          id: string
          line_total: number | null
          material_id: string
          purchase_order_id: string
          quantity: number
          quantity_received: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          gst_percent?: number
          id?: string
          line_total?: number | null
          material_id: string
          purchase_order_id: string
          quantity: number
          quantity_received?: number
          sort_order?: number
          unit_price: number
        }
        Update: {
          gst_percent?: number
          id?: string
          line_total?: number | null
          material_id?: string
          purchase_order_id?: string
          quantity?: number
          quantity_received?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          amount_paid: number
          company_id: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          delivery_address: string | null
          expected_delivery_date: string | null
          gst_amount: number
          id: string
          notes: string | null
          po_date: string
          po_number: string
          purchase_request_id: string | null
          site_id: string | null
          status: string
          subtotal: number
          terms: string | null
          total_amount: number | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          amount_paid?: number
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_address?: string | null
          expected_delivery_date?: string | null
          gst_amount?: number
          id?: string
          notes?: string | null
          po_date?: string
          po_number: string
          purchase_request_id?: string | null
          site_id?: string | null
          status?: string
          subtotal?: number
          terms?: string | null
          total_amount?: number | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          amount_paid?: number
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_address?: string | null
          expected_delivery_date?: string | null
          gst_amount?: number
          id?: string
          notes?: string | null
          po_date?: string
          po_number?: string
          purchase_request_id?: string | null
          site_id?: string | null
          status?: string
          subtotal?: number
          terms?: string | null
          total_amount?: number | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "purchase_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_purchase_request_id_fkey"
            columns: ["purchase_request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_request_items: {
        Row: {
          id: string
          material_id: string
          notes: string | null
          purchase_request_id: string
          quantity: number
          sort_order: number
        }
        Insert: {
          id?: string
          material_id: string
          notes?: string | null
          purchase_request_id: string
          quantity: number
          sort_order?: number
        }
        Update: {
          id?: string
          material_id?: string
          notes?: string | null
          purchase_request_id?: string
          quantity?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_request_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_request_items_purchase_request_id_fkey"
            columns: ["purchase_request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string | null
          contract_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          justification: string | null
          needed_by: string | null
          rejection_reason: string | null
          request_number: string
          requested_by: string | null
          site_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          justification?: string | null
          needed_by?: string | null
          rejection_reason?: string | null
          request_number: string
          requested_by?: string | null
          site_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          justification?: string | null
          needed_by?: string | null
          rejection_reason?: string | null
          request_number?: string
          requested_by?: string | null
          site_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "purchase_requests_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "purchase_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          description: string
          hsn_sac_code: string | null
          id: string
          line_total: number | null
          quantity: number
          quotation_id: string
          section: string
          sort_order: number
          unit: string
          unit_price: number
        }
        Insert: {
          description: string
          hsn_sac_code?: string | null
          id?: string
          line_total?: number | null
          quantity: number
          quotation_id: string
          section?: string
          sort_order?: number
          unit?: string
          unit_price: number
        }
        Update: {
          description?: string
          hsn_sac_code?: string | null
          id?: string
          line_total?: number | null
          quantity?: number
          quotation_id?: string
          section?: string
          sort_order?: number
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          approved_by: string | null
          capacity_kw: number | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          discount_amount: number
          gst_amount: number
          gst_percent: number
          id: string
          inverter_type: string | null
          notes: string | null
          panel_type: string | null
          payment_terms: string | null
          quotation_number: string
          status: string
          subtotal: number
          supersedes_id: string | null
          terms: string | null
          title: string
          total_amount: number | null
          updated_at: string
          valid_until: string | null
          version: number
          warranty_terms: string | null
        }
        Insert: {
          approved_by?: string | null
          capacity_kw?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          discount_amount?: number
          gst_amount?: number
          gst_percent?: number
          id?: string
          inverter_type?: string | null
          notes?: string | null
          panel_type?: string | null
          payment_terms?: string | null
          quotation_number: string
          status?: string
          subtotal?: number
          supersedes_id?: string | null
          terms?: string | null
          title: string
          total_amount?: number | null
          updated_at?: string
          valid_until?: string | null
          version?: number
          warranty_terms?: string | null
        }
        Update: {
          approved_by?: string | null
          capacity_kw?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          discount_amount?: number
          gst_amount?: number
          gst_percent?: number
          id?: string
          inverter_type?: string | null
          notes?: string | null
          panel_type?: string | null
          payment_terms?: string | null
          quotation_number?: string
          status?: string
          subtotal?: number
          supersedes_id?: string | null
          terms?: string | null
          title?: string
          total_amount?: number | null
          updated_at?: string
          valid_until?: string | null
          version?: number
          warranty_terms?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "quotations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_approve: boolean
          can_create: boolean
          can_delete: boolean
          can_read: boolean
          can_update: boolean
          resource: string
          role_code: string
          scope: string
        }
        Insert: {
          can_approve?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_read?: boolean
          can_update?: boolean
          resource: string
          role_code: string
          scope?: string
        }
        Update: {
          can_approve?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_read?: boolean
          can_update?: boolean
          resource?: string
          role_code?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          is_field: boolean
          label: string
          rank: number
        }
        Insert: {
          code: string
          created_at?: string
          is_field?: boolean
          label: string
          rank: number
        }
        Update: {
          code?: string
          created_at?: string
          is_field?: boolean
          label?: string
          rank?: number
        }
        Relationships: []
      }
      salary_advances: {
        Row: {
          advance_date: string
          amount: number
          amount_recovered: number
          balance: number | null
          company_id: string | null
          contract_id: string | null
          created_at: string
          deleted_at: string | null
          employee_id: string
          given_by: string | null
          id: string
          instalment_amount: number | null
          notes: string | null
          payment_mode: string | null
          reason: string | null
          recovery_mode: string
          site_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          advance_date?: string
          amount: number
          amount_recovered?: number
          balance?: number | null
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          deleted_at?: string | null
          employee_id: string
          given_by?: string | null
          id?: string
          instalment_amount?: number | null
          notes?: string | null
          payment_mode?: string | null
          reason?: string | null
          recovery_mode?: string
          site_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          advance_date?: string
          amount?: number
          amount_recovered?: number
          balance?: number | null
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          deleted_at?: string | null
          employee_id?: string
          given_by?: string | null
          id?: string
          instalment_amount?: number | null
          notes?: string | null
          payment_mode?: string | null
          reason?: string | null
          recovery_mode?: string
          site_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_advances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_advances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "salary_advances_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_advances_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "salary_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_advances_given_by_fkey"
            columns: ["given_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_advances_given_by_fkey"
            columns: ["given_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_advances_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_advances_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
        ]
      }
      site_assignments: {
        Row: {
          assigned_date: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          employee_id: string
          id: string
          is_active: boolean
          removed_date: string | null
          role_on_site: string
          site_id: string
          updated_at: string
        }
        Insert: {
          assigned_date?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          employee_id: string
          id?: string
          is_active?: boolean
          removed_date?: string | null
          role_on_site?: string
          site_id: string
          updated_at?: string
        }
        Update: {
          assigned_date?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          employee_id?: string
          id?: string
          is_active?: boolean
          removed_date?: string | null
          role_on_site?: string
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_assignments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_assignments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
        ]
      }
      site_events: {
        Row: {
          actor_id: string | null
          created_at: string
          description: string | null
          event_type: string
          id: string
          metadata: Json | null
          occurred_at: string
          reference_id: string | null
          reference_table: string | null
          site_id: string
          title: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          reference_id?: string | null
          reference_table?: string | null
          site_id: string
          title: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          reference_id?: string | null
          reference_table?: string | null
          site_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
        ]
      }
      site_photos: {
        Row: {
          caption: string | null
          created_at: string
          deleted_at: string | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          phase: string
          photo_url: string
          site_id: string
          stage: string | null
          taken_at: string
          thumbnail_url: string | null
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          deleted_at?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          phase: string
          photo_url: string
          site_id: string
          stage?: string | null
          taken_at?: string
          thumbnail_url?: string | null
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          deleted_at?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          phase?: string
          photo_url?: string
          site_id?: string
          stage?: string | null
          taken_at?: string
          thumbnail_url?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_photos_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_photos_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "site_photos_stage_fkey"
            columns: ["stage"]
            isOneToOne: false
            referencedRelation: "site_stages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "site_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      site_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_stage: string | null
          id: string
          notes: string | null
          site_id: string
          to_stage: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: string
          notes?: string | null
          site_id: string
          to_stage: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: string
          notes?: string | null
          site_id?: string
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_stage_history_from_stage_fkey"
            columns: ["from_stage"]
            isOneToOne: false
            referencedRelation: "site_stages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "site_stage_history_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_stage_history_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "site_stage_history_to_stage_fkey"
            columns: ["to_stage"]
            isOneToOne: false
            referencedRelation: "site_stages"
            referencedColumns: ["code"]
          },
        ]
      }
      site_stages: {
        Row: {
          code: string
          color: string | null
          is_terminal: boolean
          label: string
          sequence_no: number
        }
        Insert: {
          code: string
          color?: string | null
          is_terminal?: boolean
          label: string
          sequence_no: number
        }
        Update: {
          code?: string
          color?: string | null
          is_terminal?: boolean
          label?: string
          sequence_no?: number
        }
        Relationships: []
      }
      sites: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          address: string | null
          allocated_value: number
          capacity_kw: number | null
          client_contact_id: string | null
          company_id: string
          contract_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          district: string | null
          geofence_radius_m: number
          gps_lat: number | null
          gps_lng: number | null
          id: string
          inverter_type: string | null
          name: string
          notes: string | null
          panel_count: number | null
          panel_type: string | null
          pincode: string | null
          planned_end_date: string | null
          planned_start_date: string | null
          progress_percent: number
          project_id: string | null
          site_code: string
          site_engineer_id: string | null
          stage: string
          state: string | null
          status: string
          supervisor_id: string | null
          updated_at: string
          workers_required: number | null
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          address?: string | null
          allocated_value?: number
          capacity_kw?: number | null
          client_contact_id?: string | null
          company_id: string
          contract_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          district?: string | null
          geofence_radius_m?: number
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          inverter_type?: string | null
          name: string
          notes?: string | null
          panel_count?: number | null
          panel_type?: string | null
          pincode?: string | null
          planned_end_date?: string | null
          planned_start_date?: string | null
          progress_percent?: number
          project_id?: string | null
          site_code: string
          site_engineer_id?: string | null
          stage?: string
          state?: string | null
          status?: string
          supervisor_id?: string | null
          updated_at?: string
          workers_required?: number | null
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          address?: string | null
          allocated_value?: number
          capacity_kw?: number | null
          client_contact_id?: string | null
          company_id?: string
          contract_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          district?: string | null
          geofence_radius_m?: number
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          inverter_type?: string | null
          name?: string
          notes?: string | null
          panel_count?: number | null
          panel_type?: string | null
          pincode?: string | null
          planned_end_date?: string | null
          planned_start_date?: string | null
          progress_percent?: number
          project_id?: string | null
          site_code?: string
          site_engineer_id?: string | null
          stage?: string
          state?: string | null
          status?: string
          supervisor_id?: string | null
          updated_at?: string
          workers_required?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_client_contact_id_fkey"
            columns: ["client_contact_id"]
            isOneToOne: false
            referencedRelation: "company_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "sites_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "sites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_site_engineer_id_fkey"
            columns: ["site_engineer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_site_engineer_id_fkey"
            columns: ["site_engineer_id"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_stage_fkey"
            columns: ["stage"]
            isOneToOne: false
            referencedRelation: "site_stages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sites_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_ledger: {
        Row: {
          company_id: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          material_id: string
          notes: string | null
          quantity_delta: number
          reference_id: string | null
          reference_table: string | null
          site_id: string | null
          total_value: number | null
          transfer_group_id: string | null
          txn_date: string
          txn_type: string
          unit_cost: number | null
        }
        Insert: {
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          material_id: string
          notes?: string | null
          quantity_delta: number
          reference_id?: string | null
          reference_table?: string | null
          site_id?: string | null
          total_value?: number | null
          transfer_group_id?: string | null
          txn_date?: string
          txn_type: string
          unit_cost?: number | null
        }
        Update: {
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          material_id?: string
          notes?: string | null
          quantity_delta?: number
          reference_id?: string | null
          reference_table?: string | null
          site_id?: string | null
          total_value?: number | null
          transfer_group_id?: string | null
          txn_date?: string
          txn_type?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "stock_ledger_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "stock_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          address: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          location_type: string
          name: string
          site_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          location_type: string
          name: string
          site_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          location_type?: string
          name?: string
          site_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_locations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_locations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          bank_account_no: string | null
          bank_ifsc: string | null
          bank_name: string | null
          city: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          gst_number: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          pan_number: string | null
          payment_terms_days: number
          phone: string | null
          pincode: string | null
          rating: number | null
          state: string | null
          state_code: string | null
          updated_at: string
          vendor_code: string
        }
        Insert: {
          address?: string | null
          bank_account_no?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          pan_number?: string | null
          payment_terms_days?: number
          phone?: string | null
          pincode?: string | null
          rating?: number | null
          state?: string | null
          state_code?: string | null
          updated_at?: string
          vendor_code: string
        }
        Update: {
          address?: string | null
          bank_account_no?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          pan_number?: string | null
          payment_terms_days?: number
          phone?: string | null
          pincode?: string | null
          rating?: number | null
          state?: string | null
          state_code?: string | null
          updated_at?: string
          vendor_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      work_logs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string | null
          contract_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          log_date: string
          materials_used: string | null
          problems: string | null
          remarks: string | null
          site_id: string
          status: string
          submitted_by: string
          updated_at: string
          weather: string | null
          work_category: string
          work_description: string
          workers_present_count: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          log_date: string
          materials_used?: string | null
          problems?: string | null
          remarks?: string | null
          site_id: string
          status?: string
          submitted_by: string
          updated_at?: string
          weather?: string | null
          work_category?: string
          work_description: string
          workers_present_count?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          log_date?: string
          materials_used?: string | null
          problems?: string | null
          remarks?: string | null
          site_id?: string
          status?: string
          submitted_by?: string
          updated_at?: string
          weather?: string | null
          work_category?: string
          work_description?: string
          workers_present_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "work_logs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_logs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "work_logs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_logs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "work_logs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_logs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "work_logs_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_logs_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_attendance_monthly: {
        Row: {
          absent_days: number | null
          contract_id: string | null
          employee_id: string | null
          leave_days: number | null
          out_of_geofence_count: number | null
          overtime_hours: number | null
          period_month: number | null
          period_year: number | null
          present_days: number | null
          site_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
        ]
      }
      v_cash_position: {
        Row: {
          cash_in: number | null
          cash_out: number | null
          entry_date: string | null
          net_movement: number | null
          running_balance: number | null
        }
        Relationships: []
      }
      v_company_financials: {
        Row: {
          company_code: string | null
          company_id: string | null
          contract_count: number | null
          gross_profit: number | null
          name: string | null
          status: string | null
          total_contract_value: number | null
          total_cost: number | null
          total_invoiced: number | null
          total_outstanding: number | null
          total_received: number | null
        }
        Relationships: []
      }
      v_contract_financials: {
        Row: {
          company_id: string | null
          company_name: string | null
          completed_sites: number | null
          contract_id: string | null
          contract_number: string | null
          contract_value: number | null
          deadline_date: string | null
          gross_profit: number | null
          invoiced: number | null
          is_overdue: boolean | null
          outstanding: number | null
          received: number | null
          site_count: number | null
          start_date: string | null
          status: string | null
          title: string | null
          total_cost: number | null
          unbilled: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
        ]
      }
      v_dashboard_today: {
        Row: {
          active_sites: number | null
          cash_in_today: number | null
          cash_out_today: number | null
          contracts_due_this_week: number | null
          delayed_sites: number | null
          fuel_cost_today: number | null
          overdue_invoices: number | null
          pending_expense_approvals: number | null
          sites_missing_attendance: number | null
          total_outstanding: number | null
          workers_present_today: number | null
        }
        Relationships: []
      }
      v_directory: {
        Row: {
          avatar_url: string | null
          department: string | null
          designation: string | null
          employee_code: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          phone: string | null
          role: string | null
          trade: string | null
        }
        Insert: {
          avatar_url?: string | null
          department?: string | null
          designation?: string | null
          employee_code?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          phone?: string | null
          role?: string | null
          trade?: string | null
        }
        Update: {
          avatar_url?: string | null
          department?: string | null
          designation?: string | null
          employee_code?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          phone?: string | null
          role?: string | null
          trade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
      v_receivables_ageing: {
        Row: {
          ageing_bucket: string | null
          amount_received: number | null
          balance_due: number | null
          company_id: string | null
          company_name: string | null
          contract_id: string | null
          days_overdue: number | null
          due_date: string | null
          invoice_date: string | null
          invoice_id: string | null
          invoice_number: string | null
          status: string | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
        ]
      }
      v_site_financials: {
        Row: {
          assigned_workers: number | null
          capacity_kw: number | null
          company_id: string | null
          contract_id: string | null
          expense_cost: number | null
          gross_profit: number | null
          labour_cost: number | null
          margin_percent: number | null
          material_cost: number | null
          progress_percent: number | null
          revenue_allocated: number | null
          site_code: string | null
          site_id: string | null
          site_name: string | null
          stage: string | null
          status: string | null
          total_cost: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_financials"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "sites_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_financials"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "sites_stage_fkey"
            columns: ["stage"]
            isOneToOne: false
            referencedRelation: "site_stages"
            referencedColumns: ["code"]
          },
        ]
      }
      v_stock_on_hand: {
        Row: {
          category: string | null
          is_below_reorder: boolean | null
          location_id: string | null
          location_name: string | null
          location_type: string | null
          material_id: string | null
          material_name: string | null
          qty_on_hand: number | null
          reorder_level: number | null
          site_id: string | null
          sku: string | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_locations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_locations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_financials"
            referencedColumns: ["site_id"]
          },
        ]
      }
    }
    Functions: {
      auth_can_access_site: { Args: { p_site_id: string }; Returns: boolean }
      auth_can_see_money: { Args: never; Returns: boolean }
      auth_has_role: { Args: { p_roles: string[] }; Returns: boolean }
      auth_is_back_office: { Args: never; Returns: boolean }
      auth_is_owner: { Args: never; Returns: boolean }
      auth_role: { Args: never; Returns: string }
      haversine_metres: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      next_document_number: {
        Args: { p_doc_type: string; p_prefix: string }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

