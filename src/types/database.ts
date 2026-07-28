export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ai_generation_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          model: string
          plan_id: string | null
          prompt_version: string
          provider: string
          sanitized_error_code: string | null
          status: Database["public"]["Enums"]["ai_request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          model: string
          plan_id?: string | null
          prompt_version: string
          provider: string
          sanitized_error_code?: string | null
          status?: Database["public"]["Enums"]["ai_request_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          model?: string
          plan_id?: string | null
          prompt_version?: string
          provider?: string
          sanitized_error_code?: string | null
          status?: Database["public"]["Enums"]["ai_request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_generation_requests_plan_id_user_id_fkey"
            columns: ["plan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      allergens: {
        Row: {
          aliases: string[]
          english_label: string
          id: string
          slug: string
        }
        Insert: {
          aliases?: string[]
          english_label: string
          id?: string
          slug: string
        }
        Update: {
          aliases?: string[]
          english_label?: string
          id?: string
          slug?: string
        }
        Relationships: []
      }
      daily_checkins: {
        Row: {
          breakfast_completed: boolean
          created_at: string
          dinner_completed: boolean
          id: string
          local_date: string
          lunch_completed: boolean
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          breakfast_completed?: boolean
          created_at?: string
          dinner_completed?: boolean
          id?: string
          local_date: string
          lunch_completed?: boolean
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          breakfast_completed?: boolean
          created_at?: string
          dinner_completed?: boolean
          id?: string
          local_date?: string
          lunch_completed?: boolean
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dietary_restriction_types: {
        Row: {
          aliases: string[]
          english_label: string
          id: string
          slug: string
        }
        Insert: {
          aliases?: string[]
          english_label: string
          id?: string
          slug: string
        }
        Update: {
          aliases?: string[]
          english_label?: string
          id?: string
          slug?: string
        }
        Relationships: []
      }
      food_allergens: {
        Row: {
          allergen_id: string
          food_id: string
        }
        Insert: {
          allergen_id: string
          food_id: string
        }
        Update: {
          allergen_id?: string
          food_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_allergens_allergen_id_fkey"
            columns: ["allergen_id"]
            isOneToOne: false
            referencedRelation: "allergens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_allergens_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      food_categories: {
        Row: {
          english_label: string
          id: string
          slug: string
        }
        Insert: {
          english_label: string
          id?: string
          slug: string
        }
        Update: {
          english_label?: string
          id?: string
          slug?: string
        }
        Relationships: []
      }
      food_category_links: {
        Row: {
          category_id: string
          food_id: string
        }
        Insert: {
          category_id: string
          food_id: string
        }
        Update: {
          category_id?: string
          food_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_category_links_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "food_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_category_links_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      food_dietary_restrictions: {
        Row: {
          food_id: string
          restriction_id: string
        }
        Insert: {
          food_id: string
          restriction_id: string
        }
        Update: {
          food_id?: string
          restriction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_dietary_restrictions_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_dietary_restrictions_restriction_id_fkey"
            columns: ["restriction_id"]
            isOneToOne: false
            referencedRelation: "dietary_restriction_types"
            referencedColumns: ["id"]
          },
        ]
      }
      food_nutrition: {
        Row: {
          calories: number | null
          carbohydrate_g: number | null
          created_at: string
          fat_g: number | null
          fiber_g: number | null
          food_id: string
          id: string
          measurement_basis: Database["public"]["Enums"]["measurement_basis"]
          protein_g: number | null
          reference_quantity: number
          reference_unit: Database["public"]["Enums"]["nutrition_reference_unit"]
          serving_weight_grams: number | null
          sodium_mg: number | null
          source_name: string | null
          source_reference: string | null
          source_version: string | null
          updated_at: string
          verification_status: Database["public"]["Enums"]["verification_status"]
          verified_at: string | null
        }
        Insert: {
          calories?: number | null
          carbohydrate_g?: number | null
          created_at?: string
          fat_g?: number | null
          fiber_g?: number | null
          food_id: string
          id?: string
          measurement_basis: Database["public"]["Enums"]["measurement_basis"]
          protein_g?: number | null
          reference_quantity: number
          reference_unit: Database["public"]["Enums"]["nutrition_reference_unit"]
          serving_weight_grams?: number | null
          sodium_mg?: number | null
          source_name?: string | null
          source_reference?: string | null
          source_version?: string | null
          updated_at?: string
          verification_status: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
        }
        Update: {
          calories?: number | null
          carbohydrate_g?: number | null
          created_at?: string
          fat_g?: number | null
          fiber_g?: number | null
          food_id?: string
          id?: string
          measurement_basis?: Database["public"]["Enums"]["measurement_basis"]
          protein_g?: number | null
          reference_quantity?: number
          reference_unit?: Database["public"]["Enums"]["nutrition_reference_unit"]
          serving_weight_grams?: number | null
          sodium_mg?: number | null
          source_name?: string | null
          source_reference?: string | null
          source_version?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_nutrition_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          created_at: string
          english_name: string
          icon_ref: string | null
          id: string
          owner_user_id: string | null
          ownership_type: Database["public"]["Enums"]["food_ownership_type"]
          slug: string
          source: string
          updated_at: string
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          created_at?: string
          english_name: string
          icon_ref?: string | null
          id?: string
          owner_user_id?: string | null
          ownership_type: Database["public"]["Enums"]["food_ownership_type"]
          slug: string
          source: string
          updated_at?: string
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          created_at?: string
          english_name?: string
          icon_ref?: string | null
          id?: string
          owner_user_id?: string | null
          ownership_type?: Database["public"]["Enums"]["food_ownership_type"]
          slug?: string
          source?: string
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          goal_type: Database["public"]["Enums"]["goal_type"]
          id: string
          plan_start_date: string
          status: Database["public"]["Enums"]["goal_status"]
          target_date: string
          target_weight_kg: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal_type: Database["public"]["Enums"]["goal_type"]
          id?: string
          plan_start_date: string
          status?: Database["public"]["Enums"]["goal_status"]
          target_date: string
          target_weight_kg: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal_type?: Database["public"]["Enums"]["goal_type"]
          id?: string
          plan_start_date?: string
          status?: Database["public"]["Enums"]["goal_status"]
          target_date?: string
          target_weight_kg?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          document_type: Database["public"]["Enums"]["legal_document_type"]
          document_version: string
          id: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          document_type: Database["public"]["Enums"]["legal_document_type"]
          document_version: string
          id?: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          document_type?: Database["public"]["Enums"]["legal_document_type"]
          document_version?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      meal_preferences: {
        Row: {
          created_at: string
          food_id: string
          id: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          food_id: string
          id?: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          sort_order: number
          user_id: string
        }
        Update: {
          created_at?: string
          food_id?: string
          id?: string
          meal_type?: Database["public"]["Enums"]["meal_type"]
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_preferences_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_drafts: {
        Row: {
          current_step: number
          updated_at: string
          user_id: string
          validated_data: Json
        }
        Insert: {
          current_step?: number
          updated_at?: string
          user_id: string
          validated_data?: Json
        }
        Update: {
          current_step?: number
          updated_at?: string
          user_id?: string
          validated_data?: Json
        }
        Relationships: []
      }
      onboarding_warnings: {
        Row: {
          acknowledged_at: string
          context_type: Database["public"]["Enums"]["warning_context_type"]
          context_version: string
          id: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          user_id: string
          warning_code: string
        }
        Insert: {
          acknowledged_at?: string
          context_type: Database["public"]["Enums"]["warning_context_type"]
          context_version: string
          id?: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          user_id: string
          warning_code: string
        }
        Update: {
          acknowledged_at?: string
          context_type?: Database["public"]["Enums"]["warning_context_type"]
          context_version?: string
          id?: string
          meal_type?: Database["public"]["Enums"]["meal_type"]
          user_id?: string
          warning_code?: string
        }
        Relationships: []
      }
      plan_days: {
        Row: {
          day_index: number
          id: string
          plan_id: string
          title: string | null
        }
        Insert: {
          day_index: number
          id?: string
          plan_id: string
          title?: string | null
        }
        Update: {
          day_index?: number
          id?: string
          plan_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_days_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_items: {
        Row: {
          food_id: string
          id: string
          measurement_basis: Database["public"]["Enums"]["measurement_basis"]
          plan_meal_id: string
          preparation_note: string | null
          quantity: number
          sort_order: number
          substitution_group: string | null
          unit: Database["public"]["Enums"]["portion_unit"]
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          food_id: string
          id?: string
          measurement_basis: Database["public"]["Enums"]["measurement_basis"]
          plan_meal_id: string
          preparation_note?: string | null
          quantity: number
          sort_order: number
          substitution_group?: string | null
          unit: Database["public"]["Enums"]["portion_unit"]
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          food_id?: string
          id?: string
          measurement_basis?: Database["public"]["Enums"]["measurement_basis"]
          plan_meal_id?: string
          preparation_note?: string | null
          quantity?: number
          sort_order?: number
          substitution_group?: string | null
          unit?: Database["public"]["Enums"]["portion_unit"]
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_food_id_measurement_basis_fkey"
            columns: ["food_id", "measurement_basis"]
            isOneToOne: false
            referencedRelation: "food_nutrition"
            referencedColumns: ["food_id", "measurement_basis"]
          },
          {
            foreignKeyName: "plan_items_plan_meal_id_fkey"
            columns: ["plan_meal_id"]
            isOneToOne: false
            referencedRelation: "plan_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_meals: {
        Row: {
          id: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          plan_day_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          plan_day_id: string
          sort_order: number
        }
        Update: {
          id?: string
          meal_type?: Database["public"]["Enums"]["meal_type"]
          plan_day_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_meals_plan_day_id_fkey"
            columns: ["plan_day_id"]
            isOneToOne: false
            referencedRelation: "plan_days"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          accepted_at: string | null
          created_at: string
          goal_id: string
          id: string
          input_snapshot: Json
          model: string
          prompt_version: string
          provider: string
          status: Database["public"]["Enums"]["plan_status"]
          updated_at: string
          user_id: string
          validated_output_snapshot: Json
          version: number
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          goal_id: string
          id?: string
          input_snapshot: Json
          model: string
          prompt_version: string
          provider: string
          status?: Database["public"]["Enums"]["plan_status"]
          updated_at?: string
          user_id: string
          validated_output_snapshot: Json
          version: number
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          goal_id?: string
          id?: string
          input_snapshot?: Json
          model?: string
          prompt_version?: string
          provider?: string
          status?: Database["public"]["Enums"]["plan_status"]
          updated_at?: string
          user_id?: string
          validated_output_snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "plans_goal_id_user_id_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          activity_level: Database["public"]["Enums"]["activity_level"] | null
          age: number | null
          allergies: string[]
          created_at: string
          dietary_restrictions: string[]
          disliked_foods: string[]
          full_name: string
          gender: Database["public"]["Enums"]["profile_gender"] | null
          height_cm: number | null
          notes: string | null
          onboarding_completed_at: string | null
          onboarding_status: Database["public"]["Enums"]["onboarding_status"]
          preferred_weight_unit: Database["public"]["Enums"]["weight_unit"]
          safety_context: string | null
          time_zone: string
          training_days_per_week: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_level?: Database["public"]["Enums"]["activity_level"] | null
          age?: number | null
          allergies?: string[]
          created_at?: string
          dietary_restrictions?: string[]
          disliked_foods?: string[]
          full_name: string
          gender?: Database["public"]["Enums"]["profile_gender"] | null
          height_cm?: number | null
          notes?: string | null
          onboarding_completed_at?: string | null
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"]
          preferred_weight_unit?: Database["public"]["Enums"]["weight_unit"]
          safety_context?: string | null
          time_zone?: string
          training_days_per_week?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_level?: Database["public"]["Enums"]["activity_level"] | null
          age?: number | null
          allergies?: string[]
          created_at?: string
          dietary_restrictions?: string[]
          disliked_foods?: string[]
          full_name?: string
          gender?: Database["public"]["Enums"]["profile_gender"] | null
          height_cm?: number | null
          notes?: string | null
          onboarding_completed_at?: string | null
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"]
          preferred_weight_unit?: Database["public"]["Enums"]["weight_unit"]
          safety_context?: string | null
          time_zone?: string
          training_days_per_week?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weight_entries: {
        Row: {
          created_at: string
          id: string
          is_onboarding_baseline: boolean
          local_date: string
          source_display_unit: Database["public"]["Enums"]["weight_unit"]
          updated_at: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_onboarding_baseline?: boolean
          local_date: string
          source_display_unit: Database["public"]["Enums"]["weight_unit"]
          updated_at?: string
          user_id: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          id?: string
          is_onboarding_baseline?: boolean
          local_date?: string
          source_display_unit?: Database["public"]["Enums"]["weight_unit"]
          updated_at?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_plan: { Args: { target_plan_id: string }; Returns: string }
      application_health: {
        Args: { expected_migration: string }
        Returns: Json
      }
      complete_onboarding: {
        Args: {
          acknowledged_warnings?: Json
          current_weight_kg: number
          plan_start_date: string
          preferences: Json
          profile_activity_level: Database["public"]["Enums"]["activity_level"]
          profile_age: number
          profile_allergies: string[]
          profile_dietary_restrictions: string[]
          profile_disliked_foods: string[]
          profile_gender_value: Database["public"]["Enums"]["profile_gender"]
          profile_height_cm: number
          profile_notes: string
          profile_safety_context: string
          profile_time_zone: string
          profile_training_days: number
          profile_weight_unit: Database["public"]["Enums"]["weight_unit"]
          selected_goal_type: Database["public"]["Enums"]["goal_type"]
          target_date: string
          target_weight_kg: number
        }
        Returns: string
      }
      save_plan_version: {
        Args: {
          generation_request_id: string
          plan_input_snapshot: Json
          plan_model: string
          plan_output: Json
          plan_prompt_version: string
          plan_provider: string
          target_goal_id: string
          target_user_id: string
        }
        Returns: string
      }
      upsert_daily_checkin: {
        Args: {
          checkin_date: string
          checkin_notes?: string
          desired_breakfast_completed: boolean
          desired_dinner_completed: boolean
          desired_lunch_completed: boolean
        }
        Returns: {
          breakfast_completed: boolean
          created_at: string
          dinner_completed: boolean
          id: string
          local_date: string
          lunch_completed: boolean
          notes: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "daily_checkins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      activity_level:
        | "sedentary"
        | "lightly_active"
        | "moderately_active"
        | "very_active"
        | "extremely_active"
      ai_request_status: "pending" | "processing" | "succeeded" | "failed"
      food_ownership_type: "catalog" | "private"
      goal_status: "draft" | "active" | "completed" | "cancelled" | "archived"
      goal_type:
        | "fat_loss"
        | "muscle_gain"
        | "maintenance"
        | "body_recomposition"
      legal_document_type: "terms" | "privacy"
      meal_type: "breakfast" | "lunch" | "dinner"
      measurement_basis: "raw" | "dry" | "cooked" | "as_sold" | "label_serving"
      nutrition_reference_unit: "g" | "serving"
      onboarding_status: "not_started" | "in_progress" | "completed"
      plan_status: "generated" | "accepted" | "superseded" | "archived"
      portion_unit: "g" | "ml" | "serving" | "piece"
      profile_gender:
        | "male"
        | "female"
        | "another_identity"
        | "prefer_not_to_say"
      verification_status:
        | "verified"
        | "user_label"
        | "pending_verification"
        | "unavailable"
      warning_context_type: "onboarding" | "plan"
      weight_unit: "kg" | "lb"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_level: [
        "sedentary",
        "lightly_active",
        "moderately_active",
        "very_active",
        "extremely_active",
      ],
      ai_request_status: ["pending", "processing", "succeeded", "failed"],
      food_ownership_type: ["catalog", "private"],
      goal_status: ["draft", "active", "completed", "cancelled", "archived"],
      goal_type: [
        "fat_loss",
        "muscle_gain",
        "maintenance",
        "body_recomposition",
      ],
      legal_document_type: ["terms", "privacy"],
      meal_type: ["breakfast", "lunch", "dinner"],
      measurement_basis: ["raw", "dry", "cooked", "as_sold", "label_serving"],
      nutrition_reference_unit: ["g", "serving"],
      onboarding_status: ["not_started", "in_progress", "completed"],
      plan_status: ["generated", "accepted", "superseded", "archived"],
      portion_unit: ["g", "ml", "serving", "piece"],
      profile_gender: [
        "male",
        "female",
        "another_identity",
        "prefer_not_to_say",
      ],
      verification_status: [
        "verified",
        "user_label",
        "pending_verification",
        "unavailable",
      ],
      warning_context_type: ["onboarding", "plan"],
      weight_unit: ["kg", "lb"],
    },
  },
} as const
