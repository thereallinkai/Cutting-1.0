import { z } from "zod";
import { apiError, apiSuccess } from "@/src/lib/api-response";
import { getServerEnv, isDevelopmentDemo } from "@/src/lib/env";
import {
  ExternalFoodError,
  type NormalizedExternalFood,
} from "@/src/lib/external/food-data-types";
import {
  loadOpenFoodFactsProduct,
  loadUsdaFood,
  searchUsdaFoods,
} from "@/src/lib/external";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("search_usda"),
    query: z.string().trim().min(2).max(120),
  }),
  z.object({
    action: z.literal("lookup_barcode"),
    barcode: z.string().regex(/^\d{8,14}$/),
  }),
  z.object({
    action: z.literal("import"),
    provider: z.enum(["usda_fdc", "open_food_facts"]),
    externalId: z.string().trim().min(1).max(240),
  }),
]);

type RpcResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

function providerError(error: unknown) {
  if (!(error instanceof ExternalFoodError)) {
    return apiError(
      "FOOD_PROVIDER_UNAVAILABLE",
      "The external food provider could not be reached. Try again later or upload the package label.",
      503,
    );
  }
  const status =
    error.code === "not_found"
      ? 404
      : error.code === "incomplete_nutrition"
        ? 422
        : error.code === "rate_limited"
          ? 429
          : 503;
  return apiError(`EXTERNAL_${error.code.toUpperCase()}`, error.message, status);
}

async function cacheFood(food: NormalizedExternalFood) {
  const admin = createSupabaseAdminClient();
  const cache = admin.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<RpcResult>;
  const { data, error } = await cache("cache_external_food", {
    source_provider: food.provider,
    source_external_id: food.externalId,
    normalized_food: food.food,
    normalized_nutrition: food.nutrition,
    source_metadata: food.sourceMetadata,
    source_snapshot: food.snapshot,
  });
  if (error || typeof data !== "string") {
    console.error("cache_external_food failed", { code: error?.code });
    throw new Error("food_cache_failed");
  }
  const { data: cached, error: cachedError } = await admin
    .from("foods")
    .select("id,slug,english_name,catalog_status")
    .eq("id", data)
    .single();
  if (cachedError || !cached) throw new Error("food_cache_read_failed");
  return cached;
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      "INVALID_EXTERNAL_LOOKUP",
      "Choose a USDA search result or enter an 8- to 14-digit barcode.",
      422,
    );
  }
  if (isDevelopmentDemo()) {
    return apiError(
      "EXTERNAL_LOOKUP_REQUIRES_LOCAL_STACK",
      "Start the local Supabase stack to import shared food records.",
      503,
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return apiError(
        "SESSION_EXPIRED",
        "Log in before looking up external foods.",
        401,
      );
    }
    const env = getServerEnv();
    const admin = createSupabaseAdminClient();
    const requestedProvider =
      parsed.data.action === "lookup_barcode" ||
      (parsed.data.action === "import" &&
        parsed.data.provider === "open_food_facts")
        ? "open_food_facts"
        : "usda_fdc";
    const recordLookup = admin.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<RpcResult>;
    const { data: lookupAllowed, error: rateRecordError } =
      await recordLookup("record_external_food_lookup", {
        target_user_id: auth.user.id,
        lookup_provider: requestedProvider,
      });
    if (rateRecordError) {
      return apiError(
        "FOOD_LOOKUP_UNAVAILABLE",
        "The external lookup could not be started.",
        503,
      );
    }
    if (lookupAllowed !== true) {
      return apiError(
        "FOOD_LOOKUP_RATE_LIMITED",
        "Wait a few minutes before making another external food lookup.",
        429,
      );
    }
    const usdaApiKey =
      env.USDA_FDC_API_KEY ??
      (process.env.NODE_ENV === "production" ? null : "DEMO_KEY");
    const providerOptions = { userAgent: env.FOOD_LOOKUP_USER_AGENT };

    if (parsed.data.action === "search_usda") {
      if (!usdaApiKey) {
        return apiError(
          "USDA_LOOKUP_NOT_CONFIGURED",
          "USDA lookup is not configured. Use a barcode or upload the label.",
          503,
        );
      }
      const candidates = await searchUsdaFoods(parsed.data.query, {
        ...providerOptions,
        apiKey: usdaApiKey,
      });
      return apiSuccess({ kind: "candidates" as const, candidates });
    }

    const normalized =
      parsed.data.action === "lookup_barcode" ||
      parsed.data.provider === "open_food_facts"
        ? await loadOpenFoodFactsProduct(
            parsed.data.action === "lookup_barcode"
              ? parsed.data.barcode
              : parsed.data.externalId,
            providerOptions,
          )
        : await loadUsdaFood(parsed.data.externalId, {
            ...providerOptions,
            apiKey:
              usdaApiKey ??
              (() => {
                throw new ExternalFoodError(
                  "provider_unavailable",
                  "USDA lookup is not configured.",
                );
              })(),
          });
    const cachedFood = await cacheFood(normalized);
    return apiSuccess(
      {
        kind: "imported" as const,
        foodId: cachedFood.id,
        slug: cachedFood.slug,
        displayName: cachedFood.english_name,
        reviewStatus: cachedFood.catalog_status,
        planEligible: false,
      },
      201,
    );
  } catch (error) {
    if (error instanceof ExternalFoodError) return providerError(error);
    return apiError(
      "FOOD_IMPORT_FAILED",
      "The product could not be saved. Try again or upload its label.",
      500,
    );
  }
}
