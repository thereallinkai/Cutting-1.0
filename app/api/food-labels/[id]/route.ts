import { z } from "zod";
import { apiError, apiSuccess } from "@/src/lib/api-response";
import { confirmedFoodLabelDataSchema } from "@/src/lib/domain/food-label";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

const requestSchema = z
  .object({
    action: z.literal("confirm"),
    labelData: confirmedFoodLabelDataSchema,
  })
  .strict();

type RpcResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("INVALID_LABEL_ID", "The label draft ID is invalid.", 422);
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      "INVALID_LABEL_CONFIRMATION",
      "Review every required label field and confirm the transcription.",
      422,
    );
  }
  if (isDevelopmentDemo()) {
    return apiError(
      "LABEL_UPLOAD_REQUIRES_LOCAL_STACK",
      "Start the local Supabase stack before confirming a label.",
      503,
    );
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return apiError("SESSION_EXPIRED", "Log in before confirming a label.", 401);
    }
    const call = supabase.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<RpcResult>;
    const { data, error } = await call("create_confirmed_label_food", {
      label_data: {
        ...parsed.data.labelData,
        sourceNote: "",
      },
      label_submission_id: id,
    });
    if (error || typeof data !== "string") {
      console.error("create_confirmed_label_food failed", { code: error?.code });
      const conflict = error?.code === "23514" || error?.code === "42501";
      return apiError(
        conflict ? "LABEL_NOT_READY" : "LABEL_CONFIRM_FAILED",
        conflict
          ? "Upload a readable nutrition-label photo, then review and confirm the transcription."
          : "The confirmed product could not be saved.",
        conflict ? 409 : 500,
      );
    }
    return apiSuccess(
      {
        foodId: data,
        planEligible: true,
        verificationStatus: "user_label" as const,
      },
      201,
    );
  } catch {
    return apiError(
      "SERVICE_UNAVAILABLE",
      "Label-confirmation services are temporarily unavailable.",
      503,
    );
  }
}
