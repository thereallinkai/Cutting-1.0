import { apiError, apiSuccess } from "@/src/lib/api-response";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { isDevelopmentDemo } from "@/src/lib/env";
import { DEMO_CATALOG } from "@/src/lib/demo-catalog";

const demoFoods = DEMO_CATALOG.map((food) => ({
  id: food.slug,
  slug: food.slug,
  english_name: food.englishName,
  categories: food.categories,
  verification_status: food.verificationStatus,
  ownership_type: "catalog" as const,
  plan_eligible: true,
}));

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (isDevelopmentDemo()) {
    return apiSuccess(demoFoods.filter((food) => food.english_name.toLowerCase().includes(search)));
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return apiError("SESSION_EXPIRED", "Log in to view the food catalog.", 401);
    }
    let query = supabase
      .from("foods")
      .select(`
        id,
        slug,
        english_name,
        icon_ref,
        verification_status,
        ownership_type,
        food_category_links (
          category:food_categories (
            english_label
          )
        )
      `)
      .order("english_name")
      .limit(50);
    if (search) query = query.ilike("english_name", `%${search.replace(/[%_]/g, "")}%`);
    const { data, error } = await query;
    if (error) return apiError("FOODS_LOAD_FAILED", "The food catalog could not be loaded.", 500);
    return apiSuccess(
      (data ?? []).map((food) => ({
        ...food,
        plan_eligible: food.ownership_type === "catalog",
        categories: food.food_category_links.flatMap(({ category }) =>
          category ? [category.english_label] : [],
        ),
        food_category_links: undefined,
      })),
    );
  } catch {
    return apiError("SERVICE_UNAVAILABLE", "Food catalog services are temporarily unavailable.", 503);
  }
}
