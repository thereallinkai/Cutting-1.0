import { createHash } from "node:crypto";

export interface ExistingIdempotentRequest<T = unknown> {
  userId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  result?: T;
}

export type IdempotencyDecision<T = unknown> =
  | {
      action: "create";
      userId: string;
      idempotencyKey: string;
      requestFingerprint: string;
    }
  | {
      action: "replay";
      requestFingerprint: string;
      result: T | undefined;
    }
  | {
      action: "conflict";
      requestFingerprint: string;
      reason: string;
    };

export type PlanGenerationRequestStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed";

export type PlanGenerationReplayDecision =
  | { action: "return_plan"; planId: string }
  | { action: "wait" }
  | { action: "retry_with_new_key" }
  | { action: "invalid_terminal_state" };

export function decidePlanGenerationReplay(input: {
  status: PlanGenerationRequestStatus;
  planId: string | null;
}): PlanGenerationReplayDecision {
  if (input.status === "pending" || input.status === "processing") {
    return { action: "wait" };
  }
  if (input.status === "failed") {
    return { action: "retry_with_new_key" };
  }
  if (input.planId) {
    return { action: "return_plan", planId: input.planId };
  }
  return { action: "invalid_terminal_state" };
}

export function normalizeIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
    throw new RangeError(
      "Idempotency key must contain 8 to 128 letters, numbers, periods, underscores, colons, or hyphens.",
    );
  }
  return key;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("Idempotency payload cannot contain non-finite numbers.");
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  const object = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => [key, canonicalize(object[key])]),
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function createRequestFingerprint(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export function decideIdempotentRequest<T>(input: {
  userId: string;
  idempotencyKey: string;
  payload: unknown;
  existing?: ExistingIdempotentRequest<T> | null;
}): IdempotencyDecision<T> {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const requestFingerprint = createRequestFingerprint(input.payload);
  if (!input.existing) {
    return {
      action: "create",
      userId: input.userId,
      idempotencyKey,
      requestFingerprint,
    };
  }
  if (
    input.existing.userId !== input.userId ||
    input.existing.idempotencyKey !== idempotencyKey
  ) {
    return {
      action: "conflict",
      requestFingerprint,
      reason: "The existing request belongs to a different idempotency scope.",
    };
  }
  if (input.existing.requestFingerprint !== requestFingerprint) {
    return {
      action: "conflict",
      requestFingerprint,
      reason: "The idempotency key was already used with a different payload.",
    };
  }
  return {
    action: "replay",
    requestFingerprint,
    result: input.existing.result,
  };
}
