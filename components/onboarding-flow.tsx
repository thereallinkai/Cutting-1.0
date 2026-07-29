"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ShieldCheck,
  X,
} from "lucide-react";
import { DEMO_CATALOG } from "@/src/lib/demo-catalog";
import {
  normalizeMealFoodSlugs,
  parseOptionalHeight,
} from "@/src/lib/onboarding-input";
import { BrandLink } from "@/components/brand-link";
import { BRAND } from "@/src/lib/brand";
import {
  FoodSearchPicker,
  type FoodPickerItem,
} from "@/components/food-search-picker";
import type {
  FoodNutritionFacts,
  FoodSourceSummary,
} from "@/src/lib/domain/food-catalog";

type Meal = "breakfast" | "lunch" | "dinner";
type Unit = "kg" | "lb";
type AcknowledgedWarning = {
  mealType: Meal;
  warningCode: string;
  contextVersion: "meal-composition-v1";
};

type PageError = {
  field: string;
  message: string;
};

type Food = FoodPickerItem;

const ONBOARDING_DRAFT_KEY = "lets-go-green-onboarding-draft";
const LEGACY_ONBOARDING_DRAFT_KEY = "cutting-plan-onboarding-draft";
const REGISTRATION_DRAFT_KEY = "lets-go-green-registration-draft";
const LEGACY_REGISTRATION_DRAFT_KEY = "cutting-plan-registration-draft";

type Draft = {
  meals: Record<Meal, string[]>;
  currentWeight: string;
  targetWeight: string;
  unit: Unit;
  goalType: string;
  targetDate: string;
  height: string;
  activity: string;
  trainingDays: string;
  restrictions: string;
  allergies: string;
  timeZone: string;
  safety: string[];
  notes: string;
  acknowledgedWarnings: AcknowledgedWarning[];
};

const fallbackFoods: Food[] = DEMO_CATALOG.map((food) => ({
  id: food.slug,
  name: food.englishName,
  categories: food.categories,
  planEligible: true,
}));

const initialDraft: Draft = {
  meals: { breakfast: [], lunch: [], dinner: [] },
  currentWeight: "",
  targetWeight: "",
  unit: "kg",
  goalType: "fat_loss",
  targetDate: "",
  height: "",
  activity: "moderate",
  trainingDays: "3",
  restrictions: "",
  allergies: "",
  timeZone: "UTC",
  safety: [],
  notes: "",
  acknowledgedWarnings: [],
};

type ApiFailure = {
  error?: {
    code?: string;
    message?: string;
  } | null;
};

type PlanGenerationResult = ApiFailure & {
  data?: {
    planId?: string | null;
    status?: string;
  } | null;
};

function normalizeRestoredDraft(value: unknown): Partial<Draft> {
  if (!value || typeof value !== "object") return {};
  const restored = value as Partial<Draft>;
  if (!restored.meals || typeof restored.meals !== "object") return restored;
  const meals = restored.meals as unknown as Record<string, unknown>;
  const normalizedMeals = (["breakfast", "lunch", "dinner"] as const).reduce(
    (result, meal) => {
      const slugs = Array.isArray(meals[meal])
        ? meals[meal].filter((slug): slug is string => typeof slug === "string")
        : [];
      result[meal] = normalizeMealFoodSlugs(slugs);
      return result;
    },
    {} as Draft["meals"],
  );
  return { ...restored, meals: normalizedMeals };
}

function completionFailure(
  result: ApiFailure | null,
): { field: string; heading: string; message: string } {
  const code = result?.error?.code;
  const serverMessage = result?.error?.message;
  if (code === "SESSION_EXPIRED") {
    return {
      field: "session",
      heading: "Your session expired.",
      message:
        "Log in again to finish onboarding. Your information is still saved in this browser.",
    };
  }
  if (
    code === "FOOD_SELECTION_CHANGED" ||
    code === "FOOD_NOT_PLAN_ELIGIBLE" ||
    code === "DUPLICATE_MEAL_FOOD"
  ) {
    return {
      field: "mealPreferences",
      heading: "Review your meal selections.",
      message: `${serverMessage ?? "One or more meal selections need attention."} Choose Edit under Meals, review the foods, and try again.`,
    };
  }
  if (code === "INVALID_HEIGHT") {
    return {
      field: "height",
      heading: "Review your height.",
      message:
        serverMessage
        ?? "Enter a height such as 175 cm or 5 ft 9 in, or leave it blank.",
    };
  }
  if (
    code === "INVALID_CURRENT_WEIGHT" ||
    code === "INVALID_TARGET_WEIGHT"
  ) {
    return {
      field:
        code === "INVALID_CURRENT_WEIGHT"
          ? "currentWeight"
          : "targetWeight",
      heading: "Review your weights.",
      message:
        serverMessage
        ?? "Enter weights from 20 to 500 kg, or the equivalent in pounds.",
    };
  }
  return {
    field: "profile",
    heading: "We could not complete onboarding.",
    message:
      serverMessage
      ?? "We could not save the final step. Your information is still here; please try again.",
  };
}

const stepLabels = [
  "Account and profile",
  "Verify email",
  "Food preferences",
  "Goal and timeline",
  "Lifestyle and safety",
  "Review and complete",
];

const LB_PER_KG = 2.2046226218;

function SortableFood({
  food,
  index,
  total,
  onRemove,
  onMove,
}: {
  food: Food;
  index: number;
  total: number;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: food.id });
  return (
    <div
      className="selected-food"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
      }}
    >
      <button
        className="icon-button"
        type="button"
        aria-label={`Drag to reorder ${food.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <span style={{ flex: 1 }}>{food.name}</span>
      <button className="icon-button" type="button" aria-label={`Move ${food.name} up`} disabled={index === 0} onClick={() => onMove(-1)}>
        <ChevronUp size={15} />
      </button>
      <button className="icon-button" type="button" aria-label={`Move ${food.name} down`} disabled={index === total - 1} onClick={() => onMove(1)}>
        <ChevronDown size={15} />
      </button>
      <button className="icon-button" type="button" aria-label={`Remove ${food.name}`} onClick={onRemove}>
        <X size={15} />
      </button>
    </div>
  );
}

function MealDestination({
  meal,
  ids,
  foods,
  missingCategories,
  onChange,
  announce,
}: {
  meal: Meal;
  ids: string[];
  foods: Food[];
  missingCategories: string[];
  onChange: (ids: string[]) => void;
  announce: (message: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function dragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    const next = arrayMove(ids, oldIndex, newIndex);
    onChange(next);
    announce(`${foods.find((food) => food.id === active.id)?.name ?? "Food"} moved to position ${newIndex + 1} in ${meal}.`);
  }

  return (
    <section className="meal-dropzone" aria-labelledby={`${meal}-heading`}>
      <h3 id={`${meal}-heading`}>{meal[0].toUpperCase() + meal.slice(1)}</h3>
      {missingCategories.length > 0 ? (
        <p className="field-help" role="status">
          Consider adding: {missingCategories.join(", ").toLowerCase()}.
        </p>
      ) : null}
      {ids.length === 0 ? <p className="field-help">No foods added yet.</p> : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id, index) => {
            const food =
              foods.find((item) => item.id === id) ??
              fallbackFoods.find((item) => item.id === id);
            if (!food) return null;
            return (
              <SortableFood
                food={food}
                index={index}
                total={ids.length}
                key={id}
                onRemove={() => {
                  onChange(ids.filter((item) => item !== id));
                  announce(`${food.name} removed from ${meal}.`);
                }}
                onMove={(direction) => {
                  const nextIndex = index + direction;
                  if (nextIndex < 0 || nextIndex >= ids.length) return;
                  onChange(arrayMove(ids, index, nextIndex));
                  announce(`${food.name} moved to position ${nextIndex + 1} in ${meal}.`);
                }}
              />
            );
          })}
        </SortableContext>
      </DndContext>
    </section>
  );
}

export function OnboardingFlow({
  initialStep = 2,
  email = "",
}: {
  initialStep?: number;
  email?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(6, Math.max(2, initialStep)));
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [catalogFoods, setCatalogFoods] = useState<Food[]>(fallbackFoods);
  const [verificationEmail, setVerificationEmail] = useState(email);
  const [search, setSearch] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [announcement, setAnnouncement] = useState("");
  const [warningOpen, setWarningOpen] = useState(false);
  const [warningMeals, setWarningMeals] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [completionPhase, setCompletionPhase] = useState<
    "saving" | "generating" | null
  >(null);
  const [exitPending, setExitPending] = useState(false);
  const [pageErrors, setPageErrors] = useState<PageError[]>([]);
  const [errorHeading, setErrorHeading] = useState("Please review this step.");
  const [resendPending, setResendPending] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(email ? 60 : 0);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const errorSummaryRef = useRef<HTMLDivElement | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);
  const draftSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const generationKeyRef = useRef<string | null>(null);

  const loadCatalogFoods = useCallback(async (query = "") => {
    try {
      const response = await fetch(
        query
          ? `/api/foods?limit=100&q=${encodeURIComponent(query)}`
          : "/api/foods",
      );
      if (!response.ok) return false;
      const result = (await response.json()) as {
        data?: Array<{
          slug: string;
          english_name: string;
          categories?: string[];
          plan_eligible: boolean;
          brand_name?: string | null;
          variant_name?: string | null;
          gtin?: string | null;
          catalog_status?: FoodPickerItem["catalogStatus"];
          nutrition?: FoodNutritionFacts | null;
          source?: FoodSourceSummary | null;
        }>;
      };
      if (!result.data?.length) return false;
      const nextFoods = result.data.map((food) => ({
          id: food.slug,
          name: food.english_name,
          categories: food.categories ?? [],
          planEligible: food.plan_eligible,
          brandName: food.brand_name,
          variantName: food.variant_name,
          gtin: food.gtin,
          catalogStatus: food.catalog_status,
          nutrition: food.nutrition,
          source: food.source,
        }));
      setCatalogFoods((current) => {
        if (!query) return nextFoods;
        const merged = new Map(current.map((food) => [food.id, food]));
        nextFoods.forEach((food) => merged.set(food.id, food));
        return [...merged.values()];
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const queueDraftPersistence = useCallback(
    (currentStep: number, draftSnapshot: Draft) => {
      const save = draftSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const response = await fetch("/api/onboarding", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              currentStep,
              draft: draftSnapshot,
            }),
          });
          if (!response.ok) throw new Error("draft_save_failed");
        });
      draftSaveQueueRef.current = save;
      return save;
    },
    [],
  );

  useEffect(() => {
    const detectedTimeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    window.setTimeout(() => {
      setDraft((current) =>
        current.timeZone === "UTC"
          ? { ...current, timeZone: detectedTimeZone }
          : current,
      );
    }, 0);
    const currentSaved = window.localStorage.getItem(ONBOARDING_DRAFT_KEY);
    const legacySaved = window.localStorage.getItem(
      LEGACY_ONBOARDING_DRAFT_KEY,
    );
    const saved = currentSaved ?? legacySaved;
    if (saved) {
      try {
        const restored = normalizeRestoredDraft(JSON.parse(saved));
        if (!currentSaved && legacySaved) {
          window.localStorage.setItem(ONBOARDING_DRAFT_KEY, legacySaved);
          window.localStorage.removeItem(LEGACY_ONBOARDING_DRAFT_KEY);
        }
        window.setTimeout(() => {
          setDraft((current) => ({ ...current, ...restored }));
        }, 0);
      } catch {
        window.localStorage.removeItem(ONBOARDING_DRAFT_KEY);
        window.localStorage.removeItem(LEGACY_ONBOARDING_DRAFT_KEY);
      }
    }
    fetch("/api/onboarding")
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { data?: { currentStep?: number; draft?: Partial<Draft> } } | null) => {
        if (result?.data?.draft) {
          const restored = normalizeRestoredDraft(result.data.draft);
          setDraft((current) => ({ ...current, ...restored }));
        }
        if (result?.data?.currentStep && result.data.currentStep >= 3) {
          goToStep(result.data.currentStep);
        }
      })
      .catch(() => undefined)
      .finally(() => setDraftHydrated(true));
    if (initialStep >= 3) {
      window.setTimeout(() => {
        void loadCatalogFoods();
      }, 0);
    }
  }, [initialStep, loadCatalogFoods]);

  useEffect(() => {
    window.localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    if (step < 3 || !draftHydrated) return;
    draftSaveTimerRef.current = window.setTimeout(() => {
      draftSaveTimerRef.current = null;
      void queueDraftPersistence(step, draft).catch(() => undefined);
    }, 450);
    return () => {
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [draft, draftHydrated, queueDraftPersistence, step]);

  useEffect(() => {
    if (step !== 2 || resendSeconds <= 0) return;
    const timer = window.setTimeout(
      () => setResendSeconds((seconds) => Math.max(0, seconds - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [resendSeconds, step]);

  const currentKg = useMemo(() => {
    const value = Number(draft.currentWeight);
    if (!Number.isFinite(value)) return null;
    return draft.unit === "kg" ? value : value / LB_PER_KG;
  }, [draft.currentWeight, draft.unit]);
  const targetKg = useMemo(() => {
    const value = Number(draft.targetWeight);
    if (!Number.isFinite(value)) return null;
    return draft.unit === "kg" ? value : value / LB_PER_KG;
  }, [draft.targetWeight, draft.unit]);

  function showPageErrors(
    errors: PageError[],
    heading = "Please review this step.",
  ) {
    setErrorHeading(heading);
    setPageErrors(errors);
    setAnnouncement(errors.map((error) => error.message).join(" "));
    window.requestAnimationFrame(() => errorSummaryRef.current?.focus());
  }

  function hasPageError(field: string) {
    return pageErrors.some((error) => error.field === field);
  }

  function goToStep(nextStep: number) {
    setPageErrors([]);
    setStep(nextStep);
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setPageErrors([]);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function validateGoalStep(): PageError[] {
    const errors: PageError[] = [];
    const currentWeight = Number(draft.currentWeight);
    const targetWeight = Number(draft.targetWeight);
    if (!draft.currentWeight.trim()) {
      errors.push({
        field: "currentWeight",
        message: "Enter your current weight.",
      });
    } else if (!Number.isFinite(currentWeight) || currentWeight <= 0) {
      errors.push({
        field: "currentWeight",
        message: "Current weight must be greater than zero.",
      });
    }
    if (!draft.targetWeight.trim()) {
      errors.push({
        field: "targetWeight",
        message: "Enter your target weight.",
      });
    } else if (!Number.isFinite(targetWeight) || targetWeight <= 0) {
      errors.push({
        field: "targetWeight",
        message: "Target weight must be greater than zero.",
      });
    }
    if (!draft.goalType) {
      errors.push({
        field: "goalType",
        message: "Choose a goal type.",
      });
    }
    if (!draft.targetDate) {
      errors.push({
        field: "targetDate",
        message: "Choose a target date.",
      });
    }
    return errors;
  }

  function validateLifestyleStep(): PageError[] {
    const errors: PageError[] = [];
    const trainingDays = Number(draft.trainingDays);
    if (!parseOptionalHeight(draft.height).ok) {
      errors.push({
        field: "height",
        message:
          "Enter a height from 50 to 300 cm, such as 175 cm or 5 ft 9 in, or leave it blank.",
      });
    }
    if (!draft.activity) {
      errors.push({
        field: "activity",
        message: "Choose an activity level.",
      });
    }
    if (
      !draft.trainingDays.trim() ||
      !Number.isInteger(trainingDays) ||
      trainingDays < 0 ||
      trainingDays > 7
    ) {
      errors.push({
        field: "trainingDays",
        message: "Strength training days must be a whole number from 0 to 7.",
      });
    }
    if (!draft.timeZone) {
      errors.push({
        field: "timeZone",
        message: "Choose a time zone.",
      });
    }
    return errors;
  }

  function continueFromGoal() {
    const errors = validateGoalStep();
    if (errors.length > 0) {
      showPageErrors(errors);
      return;
    }
    goToStep(5);
  }

  function continueFromLifestyle() {
    const errors = validateLifestyleStep();
    if (errors.length > 0) {
      showPageErrors(errors);
      return;
    }
    goToStep(6);
  }

  function addFood(meal: Meal, food: Food) {
    if (!food.planEligible) {
      setAnnouncement(
        `${food.name} is saved for reference but is not yet eligible for generated plans.`,
      );
      return;
    }
    setDraft((current) => ({
      ...current,
      meals: {
        ...current.meals,
        [meal]: normalizeMealFoodSlugs([...current.meals[meal], food.id]),
      },
    }));
    setAnnouncement(
      draft.meals[meal].includes(food.id)
        ? `${food.name} is already in ${meal}.`
        : `${food.name} added to ${meal}.`,
    );
  }

  function setMeal(meal: Meal, ids: string[]) {
    setDraft((current) => ({
      ...current,
      meals: { ...current.meals, [meal]: normalizeMealFoodSlugs(ids) },
      acknowledgedWarnings: [],
    }));
  }

  function missingCategories(meal: Meal) {
    const required: Record<Meal, string[]> = {
      breakfast: ["Carbohydrate", "Protein"],
      lunch: ["Carbohydrate", "Protein", "Vegetable"],
      dinner: ["Carbohydrate", "Protein", "Vegetable"],
    };
    const categories = new Set(
      draft.meals[meal].flatMap(
        (id) =>
          catalogFoods.find((food) => food.id === id)?.categories ?? [],
      ),
    );
    return required[meal].filter((category) => !categories.has(category));
  }

  function mealWarnings(): AcknowledgedWarning[] {
    return (Object.keys(draft.meals) as Meal[]).flatMap((meal) =>
      missingCategories(meal).map((category) => ({
        mealType: meal,
        warningCode: `missing_${category.toLowerCase()}`,
        contextVersion: "meal-composition-v1" as const,
      })),
    );
  }

  function mealEligibilityErrors(): PageError[] {
    const selectedIds = [
      ...new Set((Object.values(draft.meals) as string[][]).flat()),
    ];
    const ineligibleNames = selectedIds.flatMap((id) => {
      const food = catalogFoods.find((item) => item.id === id);
      if (food?.planEligible) return [];
      return [food?.name ?? id];
    });
    return ineligibleNames.length
      ? [
          {
            field: "mealPreferences",
            message: `${ineligibleNames.join(", ")} cannot be used for generated plans yet. Remove ${ineligibleNames.length === 1 ? "it" : "them"} from meal preferences.`,
          },
        ]
      : [];
  }

  function warningMessages(warnings: AcknowledgedWarning[]) {
    return (Object.keys(draft.meals) as Meal[]).flatMap((meal) => {
      const categories = warnings
        .filter((warning) => warning.mealType === meal)
        .map((warning) => warning.warningCode.replace("missing_", ""));
      if (!categories.length) return [];
      const formatted =
        categories.length === 1
          ? categories[0]
          : `${categories.slice(0, -1).join(", ")} and ${categories.at(-1)}`;
      return [
        `${meal[0].toUpperCase() + meal.slice(1)} is missing ${formatted}`,
      ];
    });
  }

  async function verifyOtp() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verificationEmail.trim())) {
      showPageErrors([
        {
          field: "verificationEmail",
          message: "Enter the email address awaiting verification.",
        },
      ]);
      return;
    }
    if (otp.join("").length !== 6) {
      showPageErrors([
        {
          field: "verificationCode",
          message: "Enter all six verification digits.",
        },
      ]);
      return;
    }
    setPageErrors([]);
    setPending(true);
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: verificationEmail.trim(),
          token: otp.join(""),
        }),
      });
      if (!response.ok) throw new Error();
      await loadCatalogFoods();
      window.localStorage.removeItem(REGISTRATION_DRAFT_KEY);
      window.localStorage.removeItem(LEGACY_REGISTRATION_DRAFT_KEY);
      goToStep(3);
      setAnnouncement("Email verified. Food preferences are next.");
    } catch {
      showPageErrors(
        [
          {
            field: "verificationCode",
            message:
              "That code is invalid or expired. Request a new code and try again.",
          },
        ],
        "We could not verify your email.",
      );
    } finally {
      setPending(false);
    }
  }

  async function resendOtp() {
    const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      verificationEmail.trim(),
    );
    if (!emailIsValid || resendSeconds > 0 || resendPending) {
      if (!emailIsValid) {
        showPageErrors([
          {
            field: "verificationEmail",
            message: "Enter the email address awaiting verification.",
          },
        ]);
      }
      return;
    }
    setResendPending(true);
    try {
      const response = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: verificationEmail.trim() }),
      });
      if (!response.ok) throw new Error("resend_failed");
      setResendSeconds(60);
      setAnnouncement(
        "A new verification code was requested. Check the latest email.",
      );
    } catch {
      setAnnouncement(
        "A new code could not be requested yet. Wait a moment and try again.",
      );
    } finally {
      setResendPending(false);
    }
  }

  function continueFromMeals() {
    const eligibilityErrors = mealEligibilityErrors();
    if (eligibilityErrors.length) {
      showPageErrors(
        eligibilityErrors,
        "Remove foods that are not plan eligible.",
      );
      return;
    }
    const warnings = mealWarnings();
    if (warnings.length) {
      setWarningMeals(warningMessages(warnings));
      setWarningOpen(true);
      return;
    }
    goToStep(4);
  }

  function switchUnit(next: Unit) {
    if (next === draft.unit) return;
    setPageErrors([]);
    const convert = (raw: string) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return raw;
      return (next === "lb" ? value * LB_PER_KG : value / LB_PER_KG).toFixed(1);
    };
    setDraft((current) => ({
      ...current,
      unit: next,
      currentWeight: convert(current.currentWeight),
      targetWeight: convert(current.targetWeight),
    }));
  }

  async function saveAndExit() {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    setExitPending(true);
    setPageErrors([]);
    try {
      await queueDraftPersistence(step, draft);
      router.push("/today");
    } catch {
      showPageErrors(
        [
          {
            field: "draft",
            message:
              "Your draft could not be saved to your account. Your local copy is still here; please try again.",
          },
        ],
        "We could not save and exit.",
      );
    } finally {
      setExitPending(false);
    }
  }

  async function finish(generate: boolean) {
    const requiredErrors = [
      ...mealEligibilityErrors(),
      ...validateGoalStep(),
      ...validateLifestyleStep(),
    ];
    if (requiredErrors.length > 0) {
      showPageErrors(
        requiredErrors,
        "Complete the required information before finishing.",
      );
      return;
    }
    if (!confirmed) {
      showPageErrors([
        {
          field: "confirmation",
          message:
            "Confirm that the information is ready before completing onboarding.",
        },
      ]);
      return;
    }
    setPageErrors([]);
    setPending(true);
    setCompletionPhase("saving");
    try {
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      await draftSaveQueueRef.current.catch(() => undefined);
      const response = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draft,
          completed: true,
        }),
      });
      const result =
        typeof response.json === "function"
          ? ((await response.json().catch(() => null)) as ApiFailure | null)
          : null;
      if (!response.ok) {
        const failure = completionFailure(result);
        showPageErrors(
          [{ field: failure.field, message: failure.message }],
          failure.heading,
        );
        setPending(false);
        setCompletionPhase(null);
        return;
      }
      window.localStorage.removeItem(ONBOARDING_DRAFT_KEY);
      window.localStorage.removeItem(LEGACY_ONBOARDING_DRAFT_KEY);
      if (!generate) {
        router.push("/today");
        return;
      }
    } catch {
      showPageErrors(
        [
          {
            field: "profile",
            message:
              "We could not save the final step. Your information is still here; please try again.",
          },
        ],
        "We could not complete onboarding.",
      );
      setPending(false);
      setCompletionPhase(null);
      return;
    }

    setCompletionPhase("generating");
    try {
      const idempotencyKey =
        generationKeyRef.current ?? crypto.randomUUID();
      generationKeyRef.current = idempotencyKey;
      const generationResponse = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey }),
      });
      const generationResult =
        typeof generationResponse.json === "function"
          ? ((await generationResponse.json().catch(() => null)) as
              | PlanGenerationResult
              | null)
          : null;
      if (!generationResponse.ok) {
        generationKeyRef.current = null;
        showPageErrors(
          [
            {
              field: "generation",
              message:
                generationResult?.error?.message
                ?? "Your profile is saved, but a new plan could not be generated. Try again with a new request, or go to Today.",
            },
          ],
          "Your profile is complete.",
        );
        return;
      }
      if (
        generationResponse.status === 202 ||
        generationResult?.data?.status === "pending" ||
        generationResult?.data?.status === "processing"
      ) {
        showPageErrors(
          [
            {
              field: "generation",
              message:
                "Your profile is saved and plan generation is still processing. Wait a moment, then choose Generate my plan again to check the same request.",
            },
          ],
          "Your plan is still being generated.",
        );
        return;
      }
      const planId = generationResult?.data?.planId;
      if (typeof planId !== "string" || !planId.trim()) {
        generationKeyRef.current = null;
        showPageErrors(
          [
            {
              field: "generation",
              message:
                "Your profile is saved, but the completed request did not include a plan. Try again with a new request, or go to Today.",
            },
          ],
          "Your profile is complete.",
        );
        return;
      }
      generationKeyRef.current = null;
      router.push("/plan");
    } catch {
      showPageErrors(
        [
          {
            field: "generation",
            message:
              "Your profile is saved, but plan generation could not start. Try Generate my plan again, or go to Today.",
          },
        ],
        "Your profile is complete.",
      );
    } finally {
      setPending(false);
      setCompletionPhase(null);
    }
  }

  const safetyFlag = draft.safety.length > 0;

  return (
    <div className="onboarding-shell">
      <aside className="onboarding-rail">
        <BrandLink />
        <ol className="step-list">
          {stepLabels.map((label, index) => {
            const number = index + 1;
            return (
              <li className={`step-item ${number === step ? "active" : ""} ${number < step ? "complete" : ""}`} key={label} aria-current={number === step ? "step" : undefined}>
                <span className="step-number">{number < step ? <Check size={15} /> : number}</span>
                <span>{label}</span>
              </li>
            );
          })}
        </ol>
      </aside>

      <main id="main-content" className="onboarding-main">
        <div className="onboarding-header">
          <span className="mobile-progress">Step {step} of 6 · {stepLabels[step - 1]}</span>
          <span className="date-label">Your progress is saved after verification</span>
          {step > 2 ? <button className="text-link" disabled={exitPending || pending} type="button" onClick={saveAndExit}>{exitPending ? "Saving draft…" : "Save and exit"}</button> : <span />}
        </div>
        <p className="sr-only" aria-live="assertive">{announcement}</p>
        {pageErrors.length > 0 ? (
          <div
            className="message-box error"
            ref={errorSummaryRef}
            role="alert"
            tabIndex={-1}
            style={{ marginBottom: "1rem" }}
          >
            <div>
              <strong>{errorHeading}</strong>
              <ul style={{ margin: ".35rem 0 0", paddingLeft: "1.2rem" }}>
                {pageErrors.map((error) => (
                  <li key={`${error.field}:${error.message}`}>{error.message}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="onboarding-content">
          {step === 2 ? (
            <>
              <p className="eyebrow">Step 2 of 6</p>
              <h1>Check your email.</h1>
              <p>
                Enter the six-digit code for the account below. Returning later is
                safe: request a new code without creating another account. In local
                development, retrieve it from the captured-email service.
              </p>
              <label className="field" style={{ marginBottom: "1rem" }}>
                <span>Account email</span>
                <input
                  aria-invalid={hasPageError("verificationEmail") || undefined}
                  autoComplete="email"
                  inputMode="email"
                  onChange={(event) => {
                    setPageErrors([]);
                    setVerificationEmail(event.target.value);
                    setResendSeconds(0);
                  }}
                  type="email"
                  value={verificationEmail}
                />
              </label>
              <div className="otp-grid" role="group" aria-label="Six-digit verification code" aria-invalid={hasPageError("verificationCode") || undefined}>
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => { otpRefs.current[index] = element; }}
                    aria-label={`Digit ${index + 1}`}
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    maxLength={1}
                    value={digit}
                    onChange={(event) => {
                      const value = event.target.value.replace(/\D/g, "").slice(-1);
                      const next = [...otp];
                      next[index] = value;
                      setPageErrors([]);
                      setOtp(next);
                      if (value && index < 5) otpRefs.current[index + 1]?.focus();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Backspace" && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
                    }}
                    onPaste={(event) => {
                      const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                      if (pasted.length === 6) {
                        event.preventDefault();
                        setOtp(pasted.split(""));
                        otpRefs.current[5]?.focus();
                      }
                    }}
                  />
                ))}
              </div>
              <div className="form-row" style={{ marginTop: "1rem" }}>
                <span className="field-help">
                  Code requests use a generic response to protect account privacy.
                </span>
                <button
                  className="text-link"
                  type="button"
                  disabled={
                    !verificationEmail.trim() ||
                    resendSeconds > 0 ||
                    resendPending
                  }
                  onClick={resendOtp}
                >
                  {resendPending
                    ? "Requesting new code…"
                    : resendSeconds > 0
                      ? `Resend code in 00:${String(resendSeconds).padStart(2, "0")}`
                      : "Resend code"}
                </button>
              </div>
              <div className="onboarding-actions">
                <button className="button button-quiet" type="button" onClick={() => router.push("/register")}><ArrowLeft size={17} /> Back</button>
                <div><button className="button button-dark" disabled={pending} type="button" onClick={verifyOtp}>{pending ? "Verifying…" : "Verify and continue"} <ArrowRight size={17} /></button></div>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <p className="eyebrow">Step 3 of 6</p>
              <h1>What works on your plate?</h1>
              <p>Add foods to each meal. Search, buttons, keyboard reordering, and drag-and-drop all lead to the same result.</p>
              <div className="food-picker">
                <FoodSearchPicker
                  foods={catalogFoods}
                  search={search}
                  onSearchChange={setSearch}
                  onAdd={addFood}
                  onCatalogChanged={loadCatalogFoods}
                />
                <div className="meal-destinations">
                  {(["breakfast", "lunch", "dinner"] as Meal[]).map((meal) => (
                    <MealDestination key={meal} meal={meal} ids={draft.meals[meal]} foods={catalogFoods} missingCategories={missingCategories(meal)} onChange={(ids) => setMeal(meal, ids)} announce={setAnnouncement} />
                  ))}
                </div>
              </div>
              <div className="onboarding-actions">
                <button className="button button-quiet" type="button" onClick={() => goToStep(2)}><ArrowLeft size={17} /> Back</button>
                <div><button className="button button-dark" type="button" onClick={continueFromMeals}>Continue <ArrowRight size={17} /></button></div>
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <p className="eyebrow">Step 4 of 6</p>
              <h1>Set a direction, not a promise.</h1>
              <p>We&apos;ll show the implied pace and flag conflicts without forcing restriction to meet a date.</p>
              <div className="option-grid" style={{ marginBottom: "1rem" }}>
                {[
                  ["fat_loss", "Fat loss"], ["muscle_gain", "Muscle gain"], ["maintenance", "Maintenance"], ["recomposition", "Recomposition"],
                ].map(([value, label]) => (
                  <label className="option-card" key={value}><input type="radio" name="goal" checked={draft.goalType === value} onChange={() => update("goalType", value)} />{label}</label>
                ))}
              </div>
              <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <label className="field"><span>Current weight</span><input inputMode="decimal" aria-invalid={hasPageError("currentWeight") || undefined} value={draft.currentWeight} onChange={(event) => update("currentWeight", event.target.value)} /></label>
                <label className="field"><span>Target weight</span><input inputMode="decimal" aria-invalid={hasPageError("targetWeight") || undefined} value={draft.targetWeight} onChange={(event) => update("targetWeight", event.target.value)} /></label>
                <label className="field"><span>Display unit</span><select value={draft.unit} onChange={(event) => switchUnit(event.target.value as Unit)}><option value="kg">kg</option><option value="lb">lb</option></select></label>
                <label className="field"><span>Target date</span><input type="date" aria-invalid={hasPageError("targetDate") || undefined} value={draft.targetDate} onChange={(event) => update("targetDate", event.target.value)} /></label>
              </div>
              {currentKg && targetKg ? (
                <div className="message-box" style={{ marginTop: "1rem" }}>
                  <span>
                    Desired change: {Math.abs(currentKg - targetKg).toFixed(1)} kg.{" "}
                    {draft.goalType === "fat_loss" && targetKg > currentKg ? "The target direction conflicts with a fat-loss goal. Review either the goal type or target weight." : "The app will calculate the remaining days and implied weekly change from the selected date."}
                  </span>
                </div>
              ) : null}
              <div className="onboarding-actions">
                <button className="button button-quiet" type="button" onClick={() => goToStep(3)}><ArrowLeft size={17} /> Back</button>
                <div><button className="button button-dark" type="button" onClick={continueFromGoal}>Continue <ArrowRight size={17} /></button></div>
              </div>
            </>
          ) : null}

          {step === 5 ? (
            <>
              <p className="eyebrow">Step 5 of 6</p>
              <h1>Add context if it helps.</h1>
              <p>These questions are optional. They help the app avoid unsuitable suggestions and communicate uncertainty.</p>
              <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <label className="field">
                  <span>Height (optional)</span>
                  <input
                    aria-invalid={hasPageError("height") || undefined}
                    value={draft.height}
                    onChange={(event) => update("height", event.target.value)}
                    placeholder="e.g. 175 cm or 5 ft 9 in"
                  />
                  <span className="field-help">Use centimeters or feet and inches.</span>
                </label>
                <label className="field"><span>Activity level</span><select aria-invalid={hasPageError("activity") || undefined} value={draft.activity} onChange={(event) => update("activity", event.target.value)}><option value="low">Mostly seated</option><option value="light">Lightly active</option><option value="moderate">Moderately active</option><option value="high">Highly active</option></select></label>
                <label className="field"><span>Strength training days / week</span><input type="number" min="0" max="7" aria-invalid={hasPageError("trainingDays") || undefined} value={draft.trainingDays} onChange={(event) => update("trainingDays", event.target.value)} /></label>
                <label className="field">
                  <span>IANA time zone</span>
                  <input
                    aria-invalid={hasPageError("timeZone") || undefined}
                    list="onboarding-time-zones"
                    value={draft.timeZone}
                    onChange={(event) => update("timeZone", event.target.value)}
                    placeholder="America/New_York"
                  />
                  <datalist id="onboarding-time-zones">
                    {["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Asia/Shanghai"].map((zone) => <option value={zone} key={zone} />)}
                  </datalist>
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => {
                      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
                      update("timeZone", detected);
                      setAnnouncement(`Device time zone set to ${detected}.`);
                    }}
                  >
                    Use device time zone
                  </button>
                  <span className="field-help">
                    Detected automatically when possible. You can enter any valid IANA zone.
                  </span>
                </label>
                <label className="field"><span>Allergies</span><input value={draft.allergies} onChange={(event) => update("allergies", event.target.value)} placeholder="Hard exclusions" /></label>
                <label className="field"><span>Dietary restrictions</span><input value={draft.restrictions} onChange={(event) => update("restrictions", event.target.value)} /></label>
              </div>
              <fieldset style={{ border: 0, margin: "1.5rem 0 0", padding: 0 }}>
                <legend className="field-label">Optional safety context</legend>
                <p className="field-help">Choose any that apply so we can keep guidance non-restrictive and suggest professional support when appropriate.</p>
                <div className="option-grid" style={{ marginTop: ".7rem" }}>
                  {["Under 18", "Pregnant or nursing", "Eating-disorder history", "Relevant medical concern", "Dizziness, fainting, palpitations, or severe weakness"].map((label) => (
                    <label className="option-card" key={label}>
                      <input
                        type="checkbox"
                        checked={draft.safety.includes(label)}
                        onChange={(event) => update("safety", event.target.checked ? [...draft.safety, label] : draft.safety.filter((item) => item !== label))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="field" style={{ marginTop: "1rem" }}><span>Optional notes</span><textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} /></label>
              {safetyFlag ? (
                <div className="message-box" style={{ marginTop: "1rem" }}>
                  <ShieldCheck size={19} />
                  <span>Thank you for sharing. {BRAND.name} will not generate an aggressive calorie-restriction plan. Safe, non-restrictive tracking remains available, and a qualified healthcare professional or registered dietitian can help with individual guidance. Concerning symptoms such as fainting or heart palpitations warrant prompt medical attention.</span>
                </div>
              ) : null}
              <div className="onboarding-actions">
                <button className="button button-quiet" type="button" onClick={() => goToStep(4)}><ArrowLeft size={17} /> Back</button>
                <div><button className="button button-dark" type="button" onClick={continueFromLifestyle}>Review <ArrowRight size={17} /></button></div>
              </div>
            </>
          ) : null}

          {step === 6 ? (
            <>
              <p className="eyebrow">Step 6 of 6</p>
              <h1>Congratulations — your account and profile are ready. Let’s build your plan.</h1>
              <p>Review what you provided, what the app calculates, and exactly what may be sent to the selected AI provider.</p>
              <div className="settings-content">
                <section className="card">
                  <div className="card-title"><div><h2>Meals</h2><p>Provided by you</p></div><button className="text-link" onClick={() => goToStep(3)} type="button">Edit</button></div>
                  <p className="field-help">{(["breakfast", "lunch", "dinner"] as Meal[]).map((meal) => `${meal}: ${draft.meals[meal].length} foods`).join(" · ")}</p>
                </section>
                <section className="card">
                  <div className="card-title"><div><h2>Goal and timeline</h2><p>Provided by you + calculated by the app</p></div><button className="text-link" onClick={() => goToStep(4)} type="button">Edit</button></div>
                  <p className="field-help">{draft.goalType.replace("_", " ")} · {draft.currentWeight || "Missing"} {draft.unit} → {draft.targetWeight || "Missing"} {draft.unit} · {draft.targetDate || "No target date"}</p>
                </section>
                <section className="card">
                  <div className="card-title"><div><h2>Lifestyle, restrictions, and warnings</h2><p>Provided by you</p></div><button className="text-link" onClick={() => goToStep(5)} type="button">Edit</button></div>
                  <p className="field-help">Activity: {draft.activity} · Allergies: {draft.allergies || "none provided"} · Restrictions: {draft.restrictions || "none provided"} · Safety flags: {draft.safety.length}</p>
                </section>
                <section className="card">
                  <div className="card-title"><div><h2>Sent for plan generation</h2><p>Only after you choose Generate my plan</p></div></div>
                  <ul style={{ color: "var(--ink-soft)", fontSize: ".82rem", paddingLeft: "1.2rem" }}>
                    <li>Age, optional gender and height, preferred unit, and time zone.</li>
                    <li>Start/latest/target weights, goal, target date, activity, and training.</li>
                    <li>Exact verified food names and catalog IDs, including brand, product, and flavor names when selected; plus allergies, restrictions, and acknowledged warnings.</li>
                    <li>App-calculated ranges and safety flags. Passwords and raw OTP codes are never included.</li>
                  </ul>
                </section>
              </div>
              <label className="checkbox-row" style={{ marginTop: "1.2rem" }}>
                <input type="checkbox" aria-invalid={hasPageError("confirmation") || undefined} checked={confirmed} onChange={(event) => { setPageErrors([]); setConfirmed(event.target.checked); }} />
                <span>I have reviewed this information and want to complete onboarding.</span>
              </label>
              <div className="disclaimer">
                <strong>This plan provides general wellness information and is not medical advice.</strong>{" "}
                Individual needs can vary. Consult a qualified healthcare professional or registered dietitian when appropriate.
              </div>
              <div className="onboarding-actions">
                <button className="button button-quiet" type="button" onClick={() => goToStep(5)}><ArrowLeft size={17} /> Back</button>
                <div>
                  <button className="button button-quiet" disabled={pending || exitPending} type="button" onClick={() => finish(false)}>Go to Today</button>
                  <button className="button button-dark" disabled={pending || exitPending} type="button" onClick={() => finish(true)}>{completionPhase === "saving" ? "Saving profile…" : completionPhase === "generating" ? "Generating plan…" : "Generate my plan"} <ArrowRight size={17} /></button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </main>

      <Dialog.Root open={warningOpen} onOpenChange={setWarningOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content" aria-describedby="meal-warning-description">
            <Dialog.Title>Review meal balance?</Dialog.Title>
            <Dialog.Description id="meal-warning-description">
              These are gentle composition checks, not medical judgments.
            </Dialog.Description>
            <ul>{warningMeals.map((warning) => <li key={warning}>{warning}.</li>)}</ul>
            <div className="header-actions" style={{ justifyContent: "flex-end", marginTop: "1rem" }}>
              <Dialog.Close asChild><button className="button button-quiet" type="button">Review meals</button></Dialog.Close>
              <button className="button button-dark" type="button" onClick={() => {
                const warnings = mealWarnings();
                update("acknowledgedWarnings", warnings);
                setWarningOpen(false);
                goToStep(4);
                setAnnouncement("Meal composition warning acknowledged.");
              }}>Continue anyway</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
