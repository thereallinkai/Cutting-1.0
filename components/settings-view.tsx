"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  LogOut,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";

export type SettingsGoalType =
  | "fat_loss"
  | "muscle_gain"
  | "maintenance"
  | "body_recomposition";

export type SettingsInitialData = {
  mode: "authenticated" | "demo";
  account: {
    email: string;
    createdAt: string | null;
  };
  profile: {
    fullName: string;
    preferredWeightUnit: "kg" | "lb";
    timeZone: string;
    allergies: string[];
    dietaryRestrictions: string[];
    dislikedFoods: string[];
    trainingDaysPerWeek: number | null;
    safetyContext: string;
  };
  goal: {
    id: string;
    goalType: SettingsGoalType;
    targetWeightKg: number;
    targetDate: string;
  } | null;
  mealPreferences: Array<{
    mealType: "breakfast" | "lunch" | "dinner";
    foodId: string;
    foodName: string;
    sortOrder: number;
  }>;
  privateLabelFoods: PrivateLabelFood[];
  aiProviderMode: "mock" | "openai" | "unavailable";
  loadError: string | null;
};

type PrivateLabelFood = {
  id: string;
  name: string;
  verificationStatus:
    | "verified"
    | "user_label"
    | "pending_verification"
    | "unavailable";
  createdAt: string;
  nutrition: {
    servingWeightGrams: number;
    calories: number;
    proteinGrams: number;
    carbohydrateGrams: number;
    fatGrams: number;
    fiberGrams: number | null;
    sodiumMilligrams: number | null;
    sourceNote: string;
  } | null;
};

type PendingAction =
  | "profile"
  | "goal"
  | "preferences"
  | "labelFood"
  | "export"
  | "logout"
  | null;

type StatusMessage = {
  kind: "success" | "error";
  text: string;
} | null;

type SaveResult = {
  saved: boolean;
  persisted: boolean;
  section: "profile" | "goal" | "preferences" | "labelFood";
  displayMetadataUpdated?: boolean;
  food?: {
    id: string;
    english_name: string;
    verification_status: PrivateLabelFood["verificationStatus"];
    created_at: string;
    nutrition: {
      serving_weight_grams: number;
      calories: number;
      protein_g: number;
      carbohydrate_g: number;
      fat_g: number;
      fiber_g: number | null;
      sodium_mg: number | null;
      source_reference: string;
    };
  };
};

const sections = [
  ["profile", "Profile"],
  ["preferences", "Preferences"],
  ["foods", "Label foods"],
  ["ai", "AI plan"],
  ["security", "Security"],
  ["data", "Your data"],
];

const goalLabels: Record<SettingsGoalType, string> = {
  fat_loss: "Fat loss",
  muscle_gain: "Muscle gain",
  maintenance: "Maintenance",
  body_recomposition: "Body recomposition",
};

const mealLabels = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
} as const;

function splitList(value: string) {
  const seen = new Set<string>();
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) return false;
      const key = item.toLocaleLowerCase("en-US");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

async function updateSettings(body: unknown) {
  const response = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as {
    data: SaveResult | null;
    error: { message: string } | null;
  } | null;
  if (!response.ok || !payload?.data) {
    throw new Error(
      payload?.error?.message ?? "Settings could not be saved.",
    );
  }
  return payload.data;
}

export function SettingsView({
  initialData,
}: {
  initialData: SettingsInitialData;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction>(null);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [fullName, setFullName] = useState(initialData.profile.fullName);
  const [preferredWeightUnit, setPreferredWeightUnit] = useState(
    initialData.profile.preferredWeightUnit,
  );
  const [timeZone, setTimeZone] = useState(initialData.profile.timeZone);
  const [goalType, setGoalType] = useState<SettingsGoalType | "">(
    initialData.goal?.goalType ?? "",
  );
  const [allergies, setAllergies] = useState(
    initialData.profile.allergies.join(", "),
  );
  const [dietaryRestrictions, setDietaryRestrictions] = useState(
    initialData.profile.dietaryRestrictions.join(", "),
  );
  const [dislikedFoods, setDislikedFoods] = useState(
    initialData.profile.dislikedFoods.join(", "),
  );
  const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState(
    initialData.profile.trainingDaysPerWeek,
  );
  const [safetyContext, setSafetyContext] = useState(
    initialData.profile.safetyContext,
  );
  const [privateLabelFoods, setPrivateLabelFoods] = useState(
    initialData.privateLabelFoods,
  );
  const [productName, setProductName] = useState("");
  const [servingWeightGrams, setServingWeightGrams] = useState("");
  const [calories, setCalories] = useState("");
  const [proteinGrams, setProteinGrams] = useState("");
  const [carbohydrateGrams, setCarbohydrateGrams] = useState("");
  const [fatGrams, setFatGrams] = useState("");
  const [fiberGrams, setFiberGrams] = useState("");
  const [sodiumMilligrams, setSodiumMilligrams] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const isDemo = initialData.mode === "demo";
  const savingBlocked = Boolean(initialData.loadError);

  function successMessage(persisted: boolean, authenticatedText: string) {
    return persisted
      ? authenticatedText
      : "Demo preview updated for this page only. Supabase is not configured, so no account data was saved.";
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingBlocked) return;
    setPending("profile");
    setStatus(null);
    try {
      const result = await updateSettings({
        section: "profile",
        fullName,
        preferredWeightUnit,
        timeZone,
      });
      setFullName(fullName.trim());
      setTimeZone(timeZone.trim());
      setStatus({
        kind: "success",
        text: successMessage(
          result.persisted,
          result.displayMetadataUpdated === false
            ? "Profile saved. The navigation name may update after your next sign-in."
            : "Profile settings saved.",
        ),
      });
      if (result.persisted) router.refresh();
    } catch (error) {
      setStatus({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Profile settings could not be saved.",
      });
    } finally {
      setPending(null);
    }
  }

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goalType || savingBlocked) return;
    setPending("goal");
    setStatus(null);
    try {
      const result = await updateSettings({
        section: "goal",
        goalType,
      });
      setStatus({
        kind: "success",
        text: successMessage(
          result.persisted,
          "Goal type saved. Any accepted plan remains unchanged.",
        ),
      });
      if (result.persisted) router.refresh();
    } catch (error) {
      setStatus({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "The active goal could not be saved.",
      });
    } finally {
      setPending(null);
    }
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingBlocked) return;
    setPending("preferences");
    setStatus(null);
    try {
      const result = await updateSettings({
        section: "preferences",
        allergies: splitList(allergies),
        dietaryRestrictions: splitList(dietaryRestrictions),
        dislikedFoods: splitList(dislikedFoods),
        trainingDaysPerWeek,
        safetyContext,
      });
      setStatus({
        kind: "success",
        text: successMessage(
          result.persisted,
          "Preferences saved. Any accepted plan remains unchanged.",
        ),
      });
      if (result.persisted) router.refresh();
    } catch (error) {
      setStatus({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Preferences could not be saved.",
      });
    } finally {
      setPending(null);
    }
  }

  async function addLabelFood(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingBlocked) return;
    const parsedServing = optionalNumber(servingWeightGrams);
    const parsedCalories = optionalNumber(calories);
    const parsedProtein = optionalNumber(proteinGrams);
    const parsedCarbohydrate = optionalNumber(carbohydrateGrams);
    const parsedFat = optionalNumber(fatGrams);
    const parsedFiber = optionalNumber(fiberGrams);
    const parsedSodium = optionalNumber(sodiumMilligrams);
    if (
      parsedServing === null ||
      parsedCalories === null ||
      parsedProtein === null ||
      parsedCarbohydrate === null ||
      parsedFat === null
    ) {
      setStatus({
        kind: "error",
        text:
          "Enter serving grams, calories, protein, carbohydrate, and fat from the label.",
      });
      return;
    }

    setPending("labelFood");
    setStatus(null);
    try {
      const result = await updateSettings({
        section: "labelFood",
        productName,
        servingWeightGrams: parsedServing,
        calories: parsedCalories,
        proteinGrams: parsedProtein,
        carbohydrateGrams: parsedCarbohydrate,
        fatGrams: parsedFat,
        fiberGrams: parsedFiber,
        sodiumMilligrams: parsedSodium,
        sourceNote,
      });
      const newFood: PrivateLabelFood = result.food
        ? {
            id: result.food.id,
            name: result.food.english_name,
            verificationStatus: result.food.verification_status,
            createdAt: result.food.created_at,
            nutrition: {
              servingWeightGrams:
                result.food.nutrition.serving_weight_grams,
              calories: result.food.nutrition.calories,
              proteinGrams: result.food.nutrition.protein_g,
              carbohydrateGrams:
                result.food.nutrition.carbohydrate_g,
              fatGrams: result.food.nutrition.fat_g,
              fiberGrams: result.food.nutrition.fiber_g,
              sodiumMilligrams: result.food.nutrition.sodium_mg,
              sourceNote: result.food.nutrition.source_reference,
            },
          }
        : {
            id: `demo-${Date.now()}`,
            name: productName.trim(),
            verificationStatus: "user_label",
            createdAt: new Date().toISOString(),
            nutrition: {
              servingWeightGrams: parsedServing,
              calories: parsedCalories,
              proteinGrams: parsedProtein,
              carbohydrateGrams: parsedCarbohydrate,
              fatGrams: parsedFat,
              fiberGrams: parsedFiber,
              sodiumMilligrams: parsedSodium,
              sourceNote:
                sourceNote.trim() ||
                "Nutrition facts entered in the demo preview.",
            },
          };
      setPrivateLabelFoods((foods) => [...foods, newFood]);
      setProductName("");
      setServingWeightGrams("");
      setCalories("");
      setProteinGrams("");
      setCarbohydrateGrams("");
      setFatGrams("");
      setFiberGrams("");
      setSodiumMilligrams("");
      setSourceNote("");
      setStatus({
        kind: "success",
        text: successMessage(
          result.persisted,
          "Private label food and its serving nutrition were saved.",
        ),
      });
      if (result.persisted) router.refresh();
    } catch (error) {
      setStatus({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "The private label food could not be saved.",
      });
    } finally {
      setPending(null);
    }
  }

  async function downloadExport() {
    setPending("export");
    setStatus(null);
    try {
      const response = await fetch("/api/settings/export", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          payload?.error?.message ?? "Account data could not be exported.",
        );
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename =
        /filename="?([^";]+)"?/i.exec(disposition)?.[1] ??
        "cutting-plan-data.json";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatus({
        kind: "success",
        text: isDemo
          ? "Sample demo data downloaded. This was not an account export."
          : "Your account data export was downloaded.",
      });
    } catch (error) {
      setStatus({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Account data could not be exported.",
      });
    } finally {
      setPending(null);
    }
  }

  async function logout() {
    setPending("logout");
    setStatus(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout could not be completed.");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setStatus({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Logout could not be completed.",
      });
      setPending(null);
    }
  }

  return (
    <div className="page-frame">
      <header className="page-header">
        <div>
          <span className="date-label">Account and plan controls</span>
          <h1>Settings</h1>
          <p>Update stored inputs without silently changing an accepted plan.</p>
        </div>
        <button
          className="button button-quiet"
          disabled={pending !== null}
          onClick={logout}
          type="button"
        >
          <LogOut size={17} /> {pending === "logout" ? "Logging out…" : "Log out"}
        </button>
      </header>

      {isDemo ? (
        <div className="message-box" role="status" style={{ marginBottom: "1rem" }}>
          <ShieldAlert size={18} />
          <span>
            Demo preview: Supabase is not configured. Saves affect this page only,
            and exports contain sample data rather than account data.
          </span>
        </div>
      ) : null}
      {initialData.loadError ? (
        <div
          className="message-box error"
          role="alert"
          style={{ marginBottom: "1rem" }}
        >
          <ShieldAlert size={18} />
          <span>{initialData.loadError}</span>
        </div>
      ) : null}
      {status ? (
        <div
          className={`message-box${status.kind === "error" ? " error" : ""}`}
          role={status.kind === "error" ? "alert" : "status"}
          style={{ marginBottom: "1rem" }}
        >
          <span>{status.text}</span>
        </div>
      ) : null}

      <div className="settings-layout">
        <nav className="settings-index" aria-label="Settings sections">
          {sections.map(([id, label]) => (
            <a href={`#${id}`} key={id}>
              {label}
            </a>
          ))}
        </nav>

        <div className="settings-content">
          <section className="card settings-section" id="profile">
            <div className="card-title">
              <div>
                <h2>Profile and display</h2>
                <p>
                  {isDemo
                    ? "Sample values for the local demo"
                    : `Signed in as ${initialData.account.email}`}
                </p>
              </div>
            </div>
            <form onSubmit={saveProfile}>
              <div className="field-grid">
                <label className="field">
                  <span>Full name</span>
                  <input
                    autoComplete="name"
                    disabled={pending !== null}
                    maxLength={120}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    value={fullName}
                  />
                </label>
                <label className="field">
                  <span>Preferred unit</span>
                  <select
                    disabled={pending !== null}
                    onChange={(event) =>
                      setPreferredWeightUnit(
                        event.target.value as "kg" | "lb",
                      )
                    }
                    value={preferredWeightUnit}
                  >
                    <option value="kg">Kilograms</option>
                    <option value="lb">Pounds</option>
                  </select>
                </label>
                <label className="field">
                  <span>Time zone</span>
                  <input
                    disabled={pending !== null}
                    list="time-zone-options"
                    maxLength={100}
                    onChange={(event) => setTimeZone(event.target.value)}
                    required
                    value={timeZone}
                  />
                  <small className="field-help">
                    Use an IANA name such as America/New_York or Europe/London.
                  </small>
                </label>
                <datalist id="time-zone-options">
                  <option value="UTC" />
                  <option value="America/New_York" />
                  <option value="America/Chicago" />
                  <option value="America/Denver" />
                  <option value="America/Los_Angeles" />
                  <option value="Europe/London" />
                  <option value="Europe/Paris" />
                  <option value="Asia/Tokyo" />
                  <option value="Australia/Sydney" />
                </datalist>
              </div>
              <div className="section-actions">
                <button
                  className="button button-dark"
                  disabled={savingBlocked || pending !== null}
                  type="submit"
                >
                  {pending === "profile" ? "Saving…" : "Save profile"}
                </button>
              </div>
            </form>

            <form
              onSubmit={saveGoal}
              style={{
                borderTop: "1px solid var(--line)",
                marginTop: "1.2rem",
                paddingTop: "1.2rem",
              }}
            >
              <div className="field-grid">
                <label className="field">
                  <span>Active goal type</span>
                  <select
                    disabled={!initialData.goal || pending !== null}
                    onChange={(event) =>
                      setGoalType(event.target.value as SettingsGoalType)
                    }
                    value={goalType}
                  >
                    {!initialData.goal ? (
                      <option value="">No active goal</option>
                    ) : null}
                    {Object.entries(goalLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field">
                  <span>Stored target</span>
                  <strong style={{ fontSize: ".9rem", paddingTop: ".7rem" }}>
                    {initialData.goal
                      ? `${initialData.goal.targetWeightKg} kg by ${initialData.goal.targetDate}`
                      : "No active target"}
                  </strong>
                  <small className="field-help">
                    Target weight and date are shown but are not edited by this
                    control.
                  </small>
                </div>
              </div>
              <div className="message-box" style={{ marginTop: "1rem" }}>
                <ShieldAlert size={18} />
                <span>
                  Saving a goal type does not alter an accepted plan. Generate a
                  new version explicitly from My Plan if you want changed inputs
                  reflected.
                </span>
              </div>
              <div className="section-actions">
                <button
                  className="button button-dark"
                  disabled={
                    savingBlocked || !initialData.goal || pending !== null
                  }
                  type="submit"
                >
                  {pending === "goal" ? "Saving…" : "Save goal type"}
                </button>
              </div>
            </form>
          </section>

          <section className="card settings-section" id="preferences">
            <div className="card-title">
              <div>
                <h2>Preferences and safety context</h2>
                <p>Stored account inputs used to filter future suggestions.</p>
              </div>
            </div>

            <div className="message-box" style={{ marginBottom: "1rem" }}>
              <div>
                <strong>Stored meal preferences</strong>
                {initialData.mealPreferences.length ? (
                  <ul style={{ margin: ".45rem 0 0", paddingLeft: "1.1rem" }}>
                    {(["breakfast", "lunch", "dinner"] as const).map(
                      (mealType) => (
                        <li key={mealType}>
                          {mealLabels[mealType]}:{" "}
                          {initialData.mealPreferences
                            .filter(
                              (preference) =>
                                preference.mealType === mealType,
                            )
                            .map((preference) => preference.foodName)
                            .join(", ") || "None selected"}
                        </li>
                      ),
                    )}
                  </ul>
                ) : (
                  <p style={{ margin: ".35rem 0 0" }}>
                    No meal preferences are stored.
                  </p>
                )}
                <p style={{ margin: ".45rem 0 0" }}>
                  Meal-selection editing is not available in Settings yet; this is
                  a read-only view of the saved choices.
                </p>
              </div>
            </div>

            <form onSubmit={savePreferences}>
              <div className="field-grid">
                <label className="field">
                  <span>Allergies</span>
                  <input
                    disabled={pending !== null}
                    maxLength={1000}
                    onChange={(event) => setAllergies(event.target.value)}
                    placeholder="Peanuts, milk"
                    value={allergies}
                  />
                  <small className="field-help">
                    Comma-separated and used as hard exclusions for future plans.
                  </small>
                </label>
                <label className="field">
                  <span>Dietary restrictions</span>
                  <input
                    disabled={pending !== null}
                    maxLength={1000}
                    onChange={(event) =>
                      setDietaryRestrictions(event.target.value)
                    }
                    placeholder="Vegetarian, gluten-free"
                    value={dietaryRestrictions}
                  />
                </label>
                <label className="field">
                  <span>Foods you dislike</span>
                  <input
                    disabled={pending !== null}
                    maxLength={2000}
                    onChange={(event) => setDislikedFoods(event.target.value)}
                    placeholder="Mushrooms, olives"
                    value={dislikedFoods}
                  />
                </label>
                <label className="field">
                  <span>Strength training</span>
                  <select
                    disabled={pending !== null}
                    onChange={(event) =>
                      setTrainingDaysPerWeek(
                        event.target.value
                          ? Number(event.target.value)
                          : null,
                      )
                    }
                    value={
                      trainingDaysPerWeek === null
                        ? ""
                        : String(trainingDaysPerWeek)
                    }
                  >
                    <option value="">Not specified</option>
                    {Array.from({ length: 8 }, (_, days) => (
                      <option key={days} value={days}>
                        {days === 0
                          ? "None"
                          : `${days} ${days === 1 ? "day" : "days"} / week`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field" style={{ marginTop: "1rem" }}>
                <span>Optional safety context</span>
                <textarea
                  disabled={pending !== null}
                  maxLength={4000}
                  onChange={(event) => setSafetyContext(event.target.value)}
                  placeholder="Share only what is useful for safer, non-restrictive guidance."
                  value={safetyContext}
                />
                <small className="field-help">
                  Optional context is stored with your profile and used to avoid
                  unsuitable restrictive guidance.
                </small>
              </label>
              <div className="section-actions">
                <button
                  className="button button-dark"
                  disabled={savingBlocked || pending !== null}
                  type="submit"
                >
                  {pending === "preferences"
                    ? "Saving…"
                    : "Save preferences"}
                </button>
              </div>
            </form>
          </section>

          <section className="card settings-section" id="foods">
            <div className="card-title">
              <div>
                <h2>Private label foods</h2>
                <p>
                  Enter serving facts from a branded or variable product instead
                  of guessing its nutrition. Saved label foods are not yet
                  eligible for generated plans.
                </p>
              </div>
            </div>

            {privateLabelFoods.length ? (
              <div className="message-box" style={{ marginBottom: "1rem" }}>
                <div>
                  <strong>
                    {privateLabelFoods.length} saved private label{" "}
                    {privateLabelFoods.length === 1 ? "food" : "foods"}
                  </strong>
                  <ul style={{ margin: ".45rem 0 0", paddingLeft: "1.1rem" }}>
                    {privateLabelFoods.map((food) => (
                      <li key={food.id}>
                        <strong>{food.name}</strong>
                        {food.nutrition
                          ? ` — ${food.nutrition.calories} kcal, ${food.nutrition.servingWeightGrams} g per serving`
                          : " — serving nutrition is unavailable"}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="message-box" style={{ marginBottom: "1rem" }}>
                No private label foods are stored yet.
              </div>
            )}

            <form onSubmit={addLabelFood}>
              <div className="field-grid">
                <label className="field">
                  <span>Product name</span>
                  <input
                    disabled={pending !== null}
                    maxLength={160}
                    onChange={(event) => setProductName(event.target.value)}
                    placeholder="Brand and product"
                    required
                    value={productName}
                  />
                </label>
                <label className="field">
                  <span>Serving weight (g)</span>
                  <input
                    disabled={pending !== null}
                    inputMode="decimal"
                    min="0.001"
                    onChange={(event) =>
                      setServingWeightGrams(event.target.value)
                    }
                    required
                    step="any"
                    type="number"
                    value={servingWeightGrams}
                  />
                </label>
                <label className="field">
                  <span>Calories per serving</span>
                  <input
                    disabled={pending !== null}
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => setCalories(event.target.value)}
                    required
                    step="any"
                    type="number"
                    value={calories}
                  />
                </label>
                <label className="field">
                  <span>Protein (g)</span>
                  <input
                    disabled={pending !== null}
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => setProteinGrams(event.target.value)}
                    required
                    step="any"
                    type="number"
                    value={proteinGrams}
                  />
                </label>
                <label className="field">
                  <span>Carbohydrate (g)</span>
                  <input
                    disabled={pending !== null}
                    inputMode="decimal"
                    min="0"
                    onChange={(event) =>
                      setCarbohydrateGrams(event.target.value)
                    }
                    required
                    step="any"
                    type="number"
                    value={carbohydrateGrams}
                  />
                </label>
                <label className="field">
                  <span>Fat (g)</span>
                  <input
                    disabled={pending !== null}
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => setFatGrams(event.target.value)}
                    required
                    step="any"
                    type="number"
                    value={fatGrams}
                  />
                </label>
                <label className="field">
                  <span>Fiber (g, optional)</span>
                  <input
                    disabled={pending !== null}
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => setFiberGrams(event.target.value)}
                    step="any"
                    type="number"
                    value={fiberGrams}
                  />
                </label>
                <label className="field">
                  <span>Sodium (mg, optional)</span>
                  <input
                    disabled={pending !== null}
                    inputMode="decimal"
                    min="0"
                    onChange={(event) =>
                      setSodiumMilligrams(event.target.value)
                    }
                    step="any"
                    type="number"
                    value={sodiumMilligrams}
                  />
                </label>
              </div>
              <label className="field" style={{ marginTop: "1rem" }}>
                <span>Source note (optional)</span>
                <textarea
                  disabled={pending !== null}
                  maxLength={1000}
                  onChange={(event) => setSourceNote(event.target.value)}
                  placeholder="For example: package label checked July 2026."
                  value={sourceNote}
                />
              </label>
              <p className="field-help">
                These values are stored as user-entered label data, not
                independently verified nutrition. They remain unavailable to
                generated plans until serving-unit conversion and explicit safety
                metadata are supported.
              </p>
              <div className="section-actions">
                <button
                  className="button button-dark"
                  disabled={savingBlocked || pending !== null}
                  type="submit"
                >
                  {pending === "labelFood"
                    ? "Adding…"
                    : "Add private label food"}
                </button>
              </div>
            </form>
          </section>

          <section className="card settings-section" id="ai">
            <div className="card-title">
              <div>
                <h2>AI plan settings</h2>
                <p>AI calls are explicit and run on the server.</p>
              </div>
              <Sparkles size={20} />
            </div>
            <div className="message-box">
              <div>
                <strong>
                  Configured provider:{" "}
                  {initialData.aiProviderMode === "openai"
                    ? "OpenAI"
                    : initialData.aiProviderMode === "mock"
                      ? "Deterministic mock"
                      : "Unavailable"}
                </strong>
                <p style={{ margin: ".35rem 0 0" }}>
                  Provider selection is deployment configuration, not a saved
                  account preference. Generating a plan still requires an explicit
                  action.
                </p>
              </div>
            </div>
          </section>

          <section className="card settings-section" id="security">
            <div className="card-title">
              <div>
                <h2>Security</h2>
                <p>Manage sign-in through the verified recovery flow.</p>
              </div>
            </div>
            <div className="form-row">
              <div>
                <strong style={{ fontSize: ".86rem" }}>Password</strong>
                <p className="field-help">
                  Request a recovery email for {initialData.account.email}.
                </p>
              </div>
              <Link className="button button-quiet" href="/forgot-password">
                Change password
              </Link>
            </div>
          </section>

          <section className="card settings-section" id="data">
            <div className="card-title">
              <div>
                <h2>Your data</h2>
                <p>
                  {isDemo
                    ? "Download the sample data currently represented by this demo."
                    : "Download a JSON copy of data associated with your authenticated account."}
                </p>
              </div>
            </div>
            <div className="form-row">
              <div>
                <strong style={{ fontSize: ".86rem" }}>
                  {isDemo ? "Sample download" : "Account export"}
                </strong>
                <p className="field-help">
                  {isDemo
                    ? "This is explicitly marked as demo data."
                    : "Includes profile, goals, preferences, private foods, plans, entries, and check-ins."}
                </p>
              </div>
              <button
                className="button button-quiet"
                disabled={pending !== null}
                onClick={downloadExport}
                type="button"
              >
                <Download size={16} />{" "}
                {pending === "export" ? "Preparing…" : "Download JSON"}
              </button>
            </div>
          </section>

          <section className="card settings-section danger-zone">
            <div className="card-title">
              <div>
                <h2>Delete account</h2>
                <p>No account-deletion endpoint is implemented in this build.</p>
              </div>
              <Trash2 size={19} />
            </div>
            <div className="message-box error" id="deletion-unavailable">
              <ShieldAlert size={18} />
              <span>
                Account deletion is currently unavailable. This control does not
                send a deletion request or claim that stored data was removed.
              </span>
            </div>
            <div className="section-actions">
              <button
                aria-describedby="deletion-unavailable"
                className="button button-danger"
                disabled
                type="button"
              >
                Account deletion unavailable
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
