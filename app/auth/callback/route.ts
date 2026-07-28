import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

const allowedOtpTypes = new Set<EmailOtpType>([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
  "signup",
]);

function safeNext(value: string | null, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const requestedType = requestUrl.searchParams.get("type");
  const fallback = requestedType === "recovery" ? "/reset-password" : "/today";
  const next = safeNext(requestUrl.searchParams.get("next"), fallback);

  try {
    const supabase = await createSupabaseServerClient();
    let error: { message: string } | null = null;

    if (code) {
      ({ error } = await supabase.auth.exchangeCodeForSession(code));
    } else if (
      tokenHash &&
      requestedType &&
      allowedOtpTypes.has(requestedType as EmailOtpType)
    ) {
      ({ error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: requestedType as EmailOtpType,
      }));
    } else {
      error = { message: "Missing authentication callback parameters." };
    }

    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  } catch {
    // The redirect below intentionally does not expose provider details.
  }

  const destination = new URL("/login", requestUrl.origin);
  destination.searchParams.set(
    "message",
    "That authentication link is invalid or expired. Request a new one.",
  );
  return NextResponse.redirect(destination);
}
