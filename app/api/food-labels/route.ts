import { apiError, apiSuccess } from "@/src/lib/api-response";
import { foodLabelDataSchema } from "@/src/lib/domain/food-label";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export async function GET() {
  if (isDevelopmentDemo()) return apiSuccess([]);
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return apiError("SESSION_EXPIRED", "Log in to view label uploads.", 401);
    }
    const { data, error } = await supabase
      .from("food_label_submissions")
      .select(
        "id,status,brand_name,product_name,variant_name,gtin,private_food_id,review_note,submitted_at,created_at",
      )
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      return apiError(
        "LABELS_LOAD_FAILED",
        "Your label uploads could not be loaded.",
        500,
      );
    }
    return apiSuccess(data ?? []);
  } catch {
    return apiError(
      "SERVICE_UNAVAILABLE",
      "Label-upload services are temporarily unavailable.",
      503,
    );
  }
}

export async function POST(request: Request) {
  const parsed = foodLabelDataSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return apiError(
      "INVALID_LABEL",
      "Enter the brand, product, serving nutrition, ingredients, and allergen statement exactly as printed.",
      422,
    );
  }
  if (isDevelopmentDemo()) {
    return apiError(
      "LABEL_UPLOAD_REQUIRES_LOCAL_STACK",
      "Start the local Supabase stack before uploading a label.",
      503,
    );
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return apiError("SESSION_EXPIRED", "Log in before uploading a label.", 401);
    }
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
    const [activeDrafts, recentDrafts] = await Promise.all([
      supabase
        .from("food_label_submissions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", auth.user.id)
        .in("status", ["draft", "needs_changes"]),
      supabase
        .from("food_label_submissions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", auth.user.id)
        .gte("created_at", dayAgo),
    ]);
    if (activeDrafts.error || recentDrafts.error) {
      return apiError(
        "LABEL_QUOTA_CHECK_FAILED",
        "The label-upload allowance could not be checked.",
        503,
      );
    }
    if ((activeDrafts.count ?? 0) >= 8 || (recentDrafts.count ?? 0) >= 20) {
      return apiError(
        "LABEL_UPLOAD_RATE_LIMITED",
        "Finish an existing draft or wait before creating another label upload.",
        429,
      );
    }
    const labelData = {
      ...parsed.data,
      // Owner-entered free text must never flow into the reusable shared
      // catalog record. Provenance is generated from fixed server text.
      sourceNote: "",
      confirmedAccurate: false,
    };
    const { data, error } = await supabase
      .from("food_label_submissions")
      .insert({
        user_id: auth.user.id,
        status: "draft",
        brand_name: labelData.brandName,
        product_name: labelData.productName,
        variant_name: labelData.variantName || null,
        gtin: labelData.gtin || null,
        package_description: labelData.packageDescription || null,
        label_data: labelData,
      })
      .select("id,status")
      .single();
    if (error || !data) {
      console.error("food label draft insert failed", { code: error?.code });
      return apiError(
        "LABEL_CREATE_FAILED",
        "The label draft could not be created.",
        500,
      );
    }
    return apiSuccess(data, 201);
  } catch {
    return apiError(
      "SERVICE_UNAVAILABLE",
      "Label-upload services are temporarily unavailable.",
      503,
    );
  }
}
