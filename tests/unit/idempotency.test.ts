import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  createRequestFingerprint,
  decideIdempotentRequest,
  decidePlanGenerationReplay,
  normalizeIdempotencyKey,
} from "../../src/lib/domain/idempotency";

describe("idempotency helpers", () => {
  it("canonicalizes object keys recursively", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } })).toBe(
      '{"a":{"x":3,"y":2},"z":1}',
    );
    expect(createRequestFingerprint({ a: 1, b: 2 })).toBe(
      createRequestFingerprint({ b: 2, a: 1 }),
    );
  });

  it("creates a new request decision for a fresh key", () => {
    expect(
      decideIdempotentRequest({
        userId: "user-a",
        idempotencyKey: "request-123",
        payload: { goalId: "goal-a" },
      }),
    ).toMatchObject({
      action: "create",
      userId: "user-a",
      idempotencyKey: "request-123",
    });
  });

  it("replays the result for the same key and canonical payload", () => {
    const fingerprint = createRequestFingerprint({ a: 1, b: 2 });
    const result = decideIdempotentRequest({
      userId: "user-a",
      idempotencyKey: "request-123",
      payload: { b: 2, a: 1 },
      existing: {
        userId: "user-a",
        idempotencyKey: "request-123",
        requestFingerprint: fingerprint,
        result: { planId: "plan-1" },
      },
    });
    expect(result).toEqual({
      action: "replay",
      requestFingerprint: fingerprint,
      result: { planId: "plan-1" },
    });
  });

  it("returns a conflict when a key is reused for different input", () => {
    const result = decideIdempotentRequest({
      userId: "user-a",
      idempotencyKey: "request-123",
      payload: { goalId: "goal-b" },
      existing: {
        userId: "user-a",
        idempotencyKey: "request-123",
        requestFingerprint: createRequestFingerprint({ goalId: "goal-a" }),
      },
    });
    expect(result.action).toBe("conflict");
    if (result.action === "conflict") {
      expect(result.reason).toMatch(/different payload/);
    }
  });

  it("keeps idempotency scoped to the user", () => {
    const result = decideIdempotentRequest({
      userId: "user-b",
      idempotencyKey: "request-123",
      payload: {},
      existing: {
        userId: "user-a",
        idempotencyKey: "request-123",
        requestFingerprint: createRequestFingerprint({}),
      },
    });
    expect(result.action).toBe("conflict");
  });

  it("validates keys and rejects non-finite payload numbers", () => {
    expect(normalizeIdempotencyKey("  request-123  ")).toBe("request-123");
    expect(() => normalizeIdempotencyKey("short")).toThrow(/8 to 128/);
    expect(() => createRequestFingerprint({ value: Number.NaN })).toThrow(
      /non-finite/,
    );
  });

  it("distinguishes successful, active, and failed generation replays", () => {
    expect(
      decidePlanGenerationReplay({
        status: "succeeded",
        planId: "plan-1",
      }),
    ).toEqual({ action: "return_plan", planId: "plan-1" });
    expect(
      decidePlanGenerationReplay({
        status: "processing",
        planId: null,
      }),
    ).toEqual({ action: "wait" });
    expect(
      decidePlanGenerationReplay({
        status: "failed",
        planId: null,
      }),
    ).toEqual({ action: "retry_with_new_key" });
    expect(
      decidePlanGenerationReplay({
        status: "succeeded",
        planId: null,
      }),
    ).toEqual({ action: "invalid_terminal_state" });
  });
});
