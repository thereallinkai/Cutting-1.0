import { NextResponse } from "next/server";

export type ApiError = { code: string; message: string };
export type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: ApiError };

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json<ApiResult<T>>({ data, error: null }, { status });
}

export function apiError(code: string, message: string, status = 400) {
  return NextResponse.json<ApiResult<never>>(
    { data: null, error: { code, message } },
    { status },
  );
}
