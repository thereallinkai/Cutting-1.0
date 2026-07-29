"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Leaf,
  Sparkles,
  X,
} from "lucide-react";
import {
  CURRENT_PRODUCT_TOUR_VERSION,
  PRODUCT_TOUR_OPEN_EVENT,
  PRODUCT_TOUR_REPLAY_HASH,
  PRODUCT_TOUR_REPLAY_REQUEST_KEY,
  PRODUCT_TOUR_SESSION_SKIP_KEY,
  PRODUCT_TOUR_STEPS,
} from "@/src/lib/product-tour";

type SaveResponse = {
  data?: { saved?: boolean } | null;
  error?: { message?: string } | null;
};

export function ProductTour({ initialOpen = false }: { initialOpen?: boolean }) {
  const controllerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const step = PRODUCT_TOUR_STEPS[stepIndex];
  const finalStep = stepIndex === PRODUCT_TOUR_STEPS.length - 1;

  useEffect(() => {
    controllerRef.current?.setAttribute("data-hydrated", "true");
  }, []);

  useEffect(() => {
    let skipped: boolean;
    try {
      skipped =
        window.sessionStorage.getItem(PRODUCT_TOUR_SESSION_SKIP_KEY) === "true";
    } catch {
      skipped = false;
    }
    if (!initialOpen || skipped) return;
    const timer = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [initialOpen]);

  useEffect(() => {
    function replay() {
      try {
        window.sessionStorage.removeItem(PRODUCT_TOUR_REPLAY_REQUEST_KEY);
        window.sessionStorage.removeItem(PRODUCT_TOUR_SESSION_SKIP_KEY);
      } catch {
        // The tour can still be replayed when browser storage is unavailable.
      }
      if (window.location.hash === PRODUCT_TOUR_REPLAY_HASH) {
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
      }
      setMessage("");
      setStepIndex(0);
      setOpen(true);
    }
    function replayFromHash() {
      if (window.location.hash === PRODUCT_TOUR_REPLAY_HASH) replay();
    }
    window.addEventListener(PRODUCT_TOUR_OPEN_EVENT, replay);
    window.addEventListener("hashchange", replayFromHash);
    let replayTimer: number | undefined;
    try {
      if (
        window.sessionStorage.getItem(PRODUCT_TOUR_REPLAY_REQUEST_KEY) ===
          "true" ||
        window.location.hash === PRODUCT_TOUR_REPLAY_HASH
      ) {
        replayTimer = window.setTimeout(replay, 0);
      }
    } catch {
      // Event-based replay remains available without browser storage.
    }
    return () => {
      window.removeEventListener(PRODUCT_TOUR_OPEN_EVENT, replay);
      window.removeEventListener("hashchange", replayFromHash);
      if (replayTimer !== undefined) window.clearTimeout(replayTimer);
    };
  }, []);

  function skipForSession() {
    try {
      window.sessionStorage.setItem(PRODUCT_TOUR_SESSION_SKIP_KEY, "true");
    } catch {
      // Closing the dialog remains available without browser storage.
    }
    setMessage("");
    setOpen(false);
  }

  async function completeTour() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile/tutorial", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: CURRENT_PRODUCT_TOUR_VERSION }),
      });
      const result = (await response.json().catch(() => null)) as
        | SaveResponse
        | null;
      if (!response.ok || !result?.data?.saved) {
        throw new Error(
          result?.error?.message ?? "Tutorial progress could not be saved.",
        );
      }
      try {
        window.sessionStorage.removeItem(PRODUCT_TOUR_SESSION_SKIP_KEY);
      } catch {
        // Account persistence is sufficient when session storage is unavailable.
      }
      setOpen(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `${error.message} You can skip for now and keep using the app.`
          : "Tutorial progress could not be saved. You can skip for now and keep using the app.",
      );
    } finally {
      setPending(false);
    }
  }

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setOpen(true);
      return;
    }
    skipForSession();
  }

  return (
    <>
      <span
        data-hydrated="false"
        data-product-tour-controller
        hidden
        ref={controllerRef}
      />
      <Dialog.Root open={open} onOpenChange={changeOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay tour-overlay" />
          <Dialog.Content
            className="dialog-content tour-dialog"
            aria-describedby="product-tour-description"
          >
          <div className="tour-topline">
            <span className="tour-mark" aria-hidden="true">
              <Leaf size={22} />
            </span>
            <span>
              Step {stepIndex + 1} of {PRODUCT_TOUR_STEPS.length}
            </span>
            <Dialog.Close asChild>
              <button
                className="icon-button"
                type="button"
                aria-label="Skip tutorial for now"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <div className="tour-step" key={step.title} aria-live="polite">
            <p className="eyebrow">{step.eyebrow}</p>
            <Dialog.Title>{step.title}</Dialog.Title>
            <Dialog.Description id="product-tour-description">
              {step.description}
            </Dialog.Description>
            <div className="tour-detail">
              <Sparkles size={18} aria-hidden="true" />
              <p>{step.detail}</p>
            </div>
          </div>

          <div
            className="tour-progress"
            role="progressbar"
            aria-label={`Tutorial step ${stepIndex + 1} of ${PRODUCT_TOUR_STEPS.length}`}
            aria-valuemin={1}
            aria-valuemax={PRODUCT_TOUR_STEPS.length}
            aria-valuenow={stepIndex + 1}
          >
            {PRODUCT_TOUR_STEPS.map((item, index) => (
              <span
                className={index <= stepIndex ? "complete" : ""}
                key={item.title}
                aria-hidden="true"
              />
            ))}
          </div>

          {message ? (
            <p className="field-error tour-error" role="alert">
              {message}
            </p>
          ) : null}

          <div className="tour-actions">
            <button
              className="button button-quiet"
              disabled={pending || stepIndex === 0}
              onClick={() => {
                setMessage("");
                setStepIndex((current) => Math.max(0, current - 1));
              }}
              type="button"
            >
              <ArrowLeft size={17} aria-hidden="true" /> Back
            </button>
            <div>
              <button
                className="text-link"
                disabled={pending}
                onClick={() => void completeTour()}
                type="button"
              >
                Don&apos;t show again
              </button>
              {finalStep ? (
                <button
                  className="button button-dark"
                  disabled={pending}
                  onClick={() => void completeTour()}
                  type="button"
                >
                  {pending ? "Saving…" : "Finish tutorial"}{" "}
                  <Check size={17} aria-hidden="true" />
                </button>
              ) : (
                <button
                  className="button button-dark"
                  disabled={pending}
                  onClick={() => {
                    setMessage("");
                    setStepIndex((current) =>
                      Math.min(PRODUCT_TOUR_STEPS.length - 1, current + 1),
                    );
                  }}
                  type="button"
                >
                  Next <ArrowRight size={17} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
