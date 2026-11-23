
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "app_config": {
                  Row: {
                    "id": number,"min_app_version": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: number,"min_app_version": string,"updated_at"?: string
                  }
                  Update: {
                    "id"?: number,"min_app_version"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"checkins": {
                  Row: {
                    "average_intake_kcal": number | null,"calorie_floor_kcal": number,"client_updated_at": string,"complete_days_in_week": number,"complete_days_in_window": number | null,"date": string,"deleted_at": string | null,"floor_applied": boolean,"goal_rate_applied_kg_per_week": number,"goal_rate_requested_kg_per_week": number,"id": string,"kcal_target": number,"maintenance_kcal": number,"method": string | null,"previous_maintenance_kcal": number | null,"protein_g_per_kg": number,"protein_target_g": number,"rate_capped": boolean,"raw_maintenance_kcal": number | null,"schema_version": number,"skip_reason": string | null,"status": string,"trend_change_kg": number | null,"trend_weight_kg": number,"updated_at": string,"user_id": string,"window_days": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "average_intake_kcal"?: number | null,"calorie_floor_kcal": number,"client_updated_at": string,"complete_days_in_week": number,"complete_days_in_window"?: number | null,"date": string,"deleted_at"?: string | null,"floor_applied": boolean,"goal_rate_applied_kg_per_week": number,"goal_rate_requested_kg_per_week": number,"id": string,"kcal_target": number,"maintenance_kcal": number,"method"?: string | null,"previous_maintenance_kcal"?: number | null,"protein_g_per_kg": number,"protein_target_g": number,"rate_capped": boolean,"raw_maintenance_kcal"?: number | null,"schema_version": number,"skip_reason"?: string | null,"status": string,"trend_change_kg"?: number | null,"trend_weight_kg": number,"updated_at"?: string,"user_id"?: string,"window_days"?: number | null
                  }
                  Update: {
                    "average_intake_kcal"?: number | null,"calorie_floor_kcal"?: number,"client_updated_at"?: string,"complete_days_in_week"?: number,"complete_days_in_window"?: number | null,"date"?: string,"deleted_at"?: string | null,"floor_applied"?: boolean,"goal_rate_applied_kg_per_week"?: number,"goal_rate_requested_kg_per_week"?: number,"id"?: string,"kcal_target"?: number,"maintenance_kcal"?: number,"method"?: string | null,"previous_maintenance_kcal"?: number | null,"protein_g_per_kg"?: number,"protein_target_g"?: number,"rate_capped"?: boolean,"raw_maintenance_kcal"?: number | null,"schema_version"?: number,"skip_reason"?: string | null,"status"?: string,"trend_change_kg"?: number | null,"trend_weight_kg"?: number,"updated_at"?: string,"user_id"?: string,"window_days"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"days": {
                  Row: {
                    "client_updated_at": string,"complete": boolean,"date": string,"deleted_at": string | null,"id": string,"schema_version": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_updated_at": string,"complete"?: boolean,"date": string,"deleted_at"?: string | null,"id": string,"schema_version": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "client_updated_at"?: string,"complete"?: boolean,"date"?: string,"deleted_at"?: string | null,"id"?: string,"schema_version"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"foods": {
                  Row: {
                    "archived_at": string | null,"barcode": string | null,"carbs_g": number | null,"catalog_id": string | null,"client_updated_at": string,"deleted_at": string | null,"fat_g": number | null,"id": string,"kcal": number,"name": string,"protein_g": number,"schema_version": number,"serving_size": number,"serving_unit": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"barcode"?: string | null,"carbs_g"?: number | null,"catalog_id"?: string | null,"client_updated_at": string,"deleted_at"?: string | null,"fat_g"?: number | null,"id": string,"kcal": number,"name": string,"protein_g": number,"schema_version": number,"serving_size": number,"serving_unit": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"barcode"?: string | null,"carbs_g"?: number | null,"catalog_id"?: string | null,"client_updated_at"?: string,"deleted_at"?: string | null,"fat_g"?: number | null,"id"?: string,"kcal"?: number,"name"?: string,"protein_g"?: number,"schema_version"?: number,"serving_size"?: number,"serving_unit"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"log_entries": {
                  Row: {
                    "carbs_g": number | null,"carbs_g_per_serving": number | null,"client_updated_at": string,"date": string,"deleted_at": string | null,"fat_g": number | null,"fat_g_per_serving": number | null,"food_id": string | null,"id": string,"kcal": number,"kcal_per_serving": number,"logged_at": string,"meal": string,"name": string,"protein_g": number,"protein_g_per_serving": number,"recipe_id": string | null,"schema_version": number,"serving_size": number | null,"serving_unit": string | null,"servings": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "carbs_g"?: number | null,"carbs_g_per_serving"?: number | null,"client_updated_at": string,"date": string,"deleted_at"?: string | null,"fat_g"?: number | null,"fat_g_per_serving"?: number | null,"food_id"?: string | null,"id": string,"kcal": number,"kcal_per_serving": number,"logged_at": string,"meal": string,"name": string,"protein_g": number,"protein_g_per_serving": number,"recipe_id"?: string | null,"schema_version": number,"serving_size"?: number | null,"serving_unit"?: string | null,"servings": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "carbs_g"?: number | null,"carbs_g_per_serving"?: number | null,"client_updated_at"?: string,"date"?: string,"deleted_at"?: string | null,"fat_g"?: number | null,"fat_g_per_serving"?: number | null,"food_id"?: string | null,"id"?: string,"kcal"?: number,"kcal_per_serving"?: number,"logged_at"?: string,"meal"?: string,"name"?: string,"protein_g"?: number,"protein_g_per_serving"?: number,"recipe_id"?: string | null,"schema_version"?: number,"serving_size"?: number | null,"serving_unit"?: string | null,"servings"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "log_entries_food_fkey"
      columns: ["food_id","user_id"]
isOneToOne: false
      referencedRelation: "foods"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "log_entries_recipe_fkey"
      columns: ["recipe_id","user_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"profile": {
                  Row: {
                    "activity_level": string | null,"birth_date": string | null,"calorie_floor_kcal": number,"client_updated_at": string,"deleted_at": string | null,"goal_rate_kg_per_week": number,"height_cm": number | null,"higher_kcal_days": number | null,"higher_kcal_extra": number | null,"id": string,"protein_g_per_kg": number,"schema_version": number,"sex": string | null,"units": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_level"?: string | null,"birth_date"?: string | null,"calorie_floor_kcal"?: number,"client_updated_at": string,"deleted_at"?: string | null,"goal_rate_kg_per_week"?: number,"height_cm"?: number | null,"higher_kcal_days"?: number | null,"higher_kcal_extra"?: number | null,"id": string,"protein_g_per_kg"?: number,"schema_version": number,"sex"?: string | null,"units"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "activity_level"?: string | null,"birth_date"?: string | null,"calorie_floor_kcal"?: number,"client_updated_at"?: string,"deleted_at"?: string | null,"goal_rate_kg_per_week"?: number,"height_cm"?: number | null,"higher_kcal_days"?: number | null,"higher_kcal_extra"?: number | null,"id"?: string,"protein_g_per_kg"?: number,"schema_version"?: number,"sex"?: string | null,"units"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recipe_items": {
                  Row: {
                    "client_updated_at": string,"deleted_at": string | null,"food_id": string,"id": string,"recipe_id": string,"schema_version": number,"servings": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_updated_at": string,"deleted_at"?: string | null,"food_id": string,"id": string,"recipe_id": string,"schema_version": number,"servings": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "client_updated_at"?: string,"deleted_at"?: string | null,"food_id"?: string,"id"?: string,"recipe_id"?: string,"schema_version"?: number,"servings"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_items_food_fkey"
      columns: ["food_id","user_id"]
isOneToOne: false
      referencedRelation: "foods"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "recipe_items_recipe_fkey"
      columns: ["recipe_id","user_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"recipes": {
                  Row: {
                    "archived_at": string | null,"client_updated_at": string,"deleted_at": string | null,"id": string,"name": string,"schema_version": number,"servings": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"client_updated_at": string,"deleted_at"?: string | null,"id": string,"name": string,"schema_version": number,"servings": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"client_updated_at"?: string,"deleted_at"?: string | null,"id"?: string,"name"?: string,"schema_version"?: number,"servings"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"weights": {
                  Row: {
                    "client_updated_at": string,"date": string,"deleted_at": string | null,"id": string,"schema_version": number,"updated_at": string,"user_id": string,"weight_kg": number
                  }
                  ComputedFields: never
                  Insert: {
                    "client_updated_at": string,"date": string,"deleted_at"?: string | null,"id": string,"schema_version": number,"updated_at"?: string,"user_id"?: string,"weight_kg": number
                  }
                  Update: {
                    "client_updated_at"?: string,"date"?: string,"deleted_at"?: string | null,"id"?: string,"schema_version"?: number,"updated_at"?: string,"user_id"?: string,"weight_kg"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "delete_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
