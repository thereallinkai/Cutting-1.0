import { z } from "zod";
import { convertWeight } from "@/src/lib/domain";
import { apiError, apiSuccess } from "@/src/lib/api-response";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

const updateSchema = z.object({
  weight: z.number().positive(),
  unit: z.enum(["kg", "lb"]),
});

async function userClient() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsedId = z.string().uuid().safeParse(id);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsedId.success || !parsed.success) return apiError("INVALID_WEIGHT", "The weight update was not valid.", 422);
  const weightKg = convertWeight(parsed.data.weight, parsed.data.unit, "kg");
  if (weightKg < 20 || weightKg > 500) return apiError("WEIGHT_OUT_OF_RANGE", "The weight is outside the supported range.", 422);
  if (isDevelopmentDemo()) return apiSuccess({ id, weightKg });
  try {
    const { supabase, user } = await userClient();
    if (!user) return apiError("SESSION_EXPIRED", "Log in to edit weight entries.", 401);
    const { data, error } = await supabase
      .from("weight_entries")
      .update({ weight_kg: weightKg, source_display_unit: parsed.data.unit })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();
    if (error) return apiError("WEIGHT_UPDATE_FAILED", "The weight entry could not be updated.", 500);
    if (!data) return apiError("WEIGHT_NOT_FOUND", "That weight entry was not found.", 404);
    return apiSuccess(data);
  } catch {
    return apiError("SERVICE_UNAVAILABLE", "Weight services are temporarily unavailable.", 503);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiError("INVALID_WEIGHT_ID", "The weight entry identifier is invalid.", 422);
  if (isDevelopmentDemo()) return apiSuccess({ deleted: true });
  try {
    const { supabase, user } = await userClient();
    if (!user) return apiError("SESSION_EXPIRED", "Log in to delete weight entries.", 401);
    const { error, count } = await supabase
      .from("weight_entries")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return apiError("WEIGHT_DELETE_FAILED", "The weight entry could not be deleted.", 500);
    if (!count) return apiError("WEIGHT_NOT_FOUND", "That weight entry was not found.", 404);
    return apiSuccess({ deleted: true });
  } catch {
    return apiError("SERVICE_UNAVAILABLE", "Weight services are temporarily unavailable.", 503);
  }
}
