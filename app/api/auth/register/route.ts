import { z } from "zod";
import { apiError, apiSuccess } from "@/src/lib/api-response";
import {
  isValidIanaTimeZone,
  localDateInTimeZone,
  validateRegistrationDateOfBirth,
} from "@/src/lib/domain";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

const registrationSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    gender: z.enum(["male", "female", "another_identity", "prefer_not_to_say"]),
    dateOfBirth: z.string().max(10),
    timeZone: z.string().trim().min(1).max(100).refine(isValidIanaTimeZone),
    email: z.string().trim().email().max(320),
    password: z.string().min(10).max(128),
    termsAccepted: z.literal(true),
    privacyAccepted: z.literal(true),
  })
  .strict();

export async function POST(request: Request) {
  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("INVALID_REGISTRATION", "Review the highlighted account details and try again.", 422);
  }
  const dateOfBirth = validateRegistrationDateOfBirth(
    parsed.data.dateOfBirth,
    localDateInTimeZone(new Date(), parsed.data.timeZone),
  );
  if (!dateOfBirth.valid) {
    return apiError(
      "INVALID_DATE_OF_BIRTH",
      "Enter a valid date of birth for an age from 13 to 120.",
      422,
    );
  }
  if (isDevelopmentDemo()) {
    return apiSuccess({ email: parsed.data.email, verificationRequired: true }, 201);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          full_name: parsed.data.fullName,
          gender: parsed.data.gender,
          date_of_birth: dateOfBirth.dateOfBirth,
          registration_time_zone: parsed.data.timeZone,
          terms_version: "1.1",
          privacy_version: "1.2",
        },
      },
    });
    if (error) {
      return apiError(
        "REGISTRATION_UNAVAILABLE",
        "We could not complete registration. Check the form and try again.",
        400,
      );
    }
    return apiSuccess({ email: parsed.data.email, verificationRequired: true }, 201);
  } catch {
    return apiError("AUTH_UNAVAILABLE", "Account services are temporarily unavailable.", 503);
  }
}
