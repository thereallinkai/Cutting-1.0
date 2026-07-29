import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiError, apiSuccess } from "@/src/lib/api-response";
import { sanitizeFoodLabelImage } from "@/src/lib/food-label-image";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

const paramsSchema = z.string().uuid();
const kindSchema = z.enum(["front", "nutrition", "ingredients", "barcode"]);

type UploadReservation = {
  allowed: boolean;
  rate_limited: boolean;
  existing_image_id: string | null;
  existing_object_path: string | null;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!paramsSchema.safeParse(id).success) {
    return apiError("INVALID_LABEL_ID", "The label draft ID is invalid.", 422);
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
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("multipart/form-data")
    ) {
      return apiError(
        "INVALID_LABEL_IMAGE",
        "Send the label image as multipart form data.",
        415,
      );
    }
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 9 * 1024 * 1024) {
      return apiError(
        "LABEL_IMAGE_TOO_LARGE",
        "Use a JPEG or PNG under 8 MB.",
        413,
      );
    }
    const { data: submission } = await supabase
      .from("food_label_submissions")
      .select("id,status")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .in("status", ["draft", "needs_changes"])
      .maybeSingle();
    if (!submission) {
      return apiError(
        "LABEL_NOT_EDITABLE",
        "That label draft is no longer available for upload.",
        409,
      );
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError(
        "INVALID_LABEL_IMAGE",
        "The image upload was incomplete or exceeded the supported request size.",
        413,
      );
    }
    const file = form.get("file");
    const kind = kindSchema.safeParse(form.get("imageKind"));
    if (
      !(file instanceof File) ||
      file.size < 1 ||
      file.size > 8 * 1024 * 1024 ||
      !kind.success
    ) {
      return apiError(
        "INVALID_LABEL_IMAGE",
        "Choose a JPEG or PNG nutrition-label image.",
        422,
      );
    }

    const admin = createSupabaseAdminClient();
    const reserveUpload = admin.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: UploadReservation[] | null;
      error: { code?: string } | null;
    }>;
    const { data: reservationRows, error: reservationError } =
      await reserveUpload("reserve_food_label_upload", {
        target_user_id: auth.user.id,
        target_submission_id: id,
        target_image_kind: kind.data,
      });
    const reservation = reservationRows?.[0];
    if (reservationError || !reservation) {
      return apiError(
        "LABEL_UPLOAD_RESERVATION_FAILED",
        "The label-image allowance could not be checked.",
        503,
      );
    }
    if (!reservation.allowed || reservation.rate_limited) {
      return apiError(
        "LABEL_IMAGE_RATE_LIMITED",
        "You reached the private label-image limit. Wait before uploading another image.",
        429,
      );
    }

    let image;
    try {
      image = await sanitizeFoodLabelImage(
        Buffer.from(await file.arrayBuffer()),
        file.type,
      );
    } catch {
      return apiError(
        "INVALID_LABEL_IMAGE",
        "Use a valid JPEG or PNG under 8 MB and 20 megapixels.",
        422,
      );
    }
    const objectPath = `${auth.user.id}/${id}/${randomUUID()}.${image.extension}`;
    const { error: storageError } = await admin.storage
      .from("food-labels")
      .upload(objectPath, image.bytes, {
        contentType: image.mimeType,
        cacheControl: "3600",
        upsert: false,
      });
    if (storageError) {
      return apiError(
        "LABEL_IMAGE_UPLOAD_FAILED",
        "The label image could not be uploaded.",
        500,
      );
    }
    const { data, error } = await admin
      .from("food_label_images")
      .upsert(
        {
          submission_id: id,
          user_id: auth.user.id,
          object_path: objectPath,
          image_kind: kind.data,
          mime_type: image.mimeType,
          byte_size: image.bytes.length,
          pixel_width: image.width,
          pixel_height: image.height,
          sha256: image.sha256,
        },
        {
          onConflict: "submission_id,image_kind",
        },
      )
      .select("id,image_kind,byte_size,pixel_width,pixel_height")
      .single();
    if (error || !data) {
      await admin.storage.from("food-labels").remove([objectPath]);
      return apiError(
        "LABEL_IMAGE_SAVE_FAILED",
        "The image uploaded but its label record could not be saved.",
        500,
      );
    }
    if (
      reservation.existing_object_path &&
      reservation.existing_object_path !== objectPath
    ) {
      const { error: cleanupError } = await admin.storage
        .from("food-labels")
        .remove([reservation.existing_object_path]);
      if (cleanupError) {
        console.error("replaced food label image cleanup failed", {
          submissionId: id,
          imageKind: kind.data,
        });
      }
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
