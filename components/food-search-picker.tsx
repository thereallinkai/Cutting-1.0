"use client";

import { useEffect, useState } from "react";
import { FoodLabelUpload } from "@/components/food-label-upload";
import { NutritionFactsCard } from "@/components/nutrition-facts-card";
import type {
  FoodNutritionFacts,
  FoodSourceSummary,
} from "@/src/lib/domain/food-catalog";

export type FoodPickerItem = {
  id: string;
  name: string;
  categories: string[];
  planEligible: boolean;
  brandName?: string | null;
  variantName?: string | null;
  gtin?: string | null;
  catalogStatus?: "active" | "pending_review" | "rejected" | "retired";
  nutrition?: FoodNutritionFacts | null;
  source?: FoodSourceSummary | null;
};

type Candidate = {
  provider: "usda_fdc";
  externalId: string;
  displayName: string;
  brandName: string | null;
  dataType: string | null;
  nutritionPreview: {
    calories: number | null;
    proteinGrams: number | null;
    carbohydrateGrams: number | null;
    fatGrams: number | null;
  };
};

type Envelope<T> = {
  data: T | null;
  error: { message?: string } | null;
};

export function FoodSearchPicker({
  foods,
  search,
  onSearchChange,
  onAdd,
  onCatalogChanged,
}: {
  foods: FoodPickerItem[];
  search: string;
  onSearchChange: (value: string) => void;
  onAdd: (meal: "breakfast" | "lunch" | "dinner", food: FoodPickerItem) => void;
  onCatalogChanged: (query?: string) => unknown | Promise<unknown>;
}) {
  const [externalPending, setExternalPending] = useState(false);
  const [externalMessage, setExternalMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const visibleFoods = foods.filter((food) =>
    `${food.name} ${food.brandName ?? ""} ${food.variantName ?? ""} ${food.gtin ?? ""} ${food.categories.join(" ")}`
      .toLocaleLowerCase("en-US")
      .includes(search.toLocaleLowerCase("en-US")),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void onCatalogChanged(search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [onCatalogChanged, search]);

  async function externalLookup(body: unknown) {
    setExternalPending(true);
    setExternalMessage(null);
    try {
      const response = await fetch("/api/foods/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as Envelope<
        | { kind: "candidates"; candidates: Candidate[] }
        | {
            kind: "imported";
            displayName: string;
            reviewStatus: string;
          }
      >;
      if (!response.ok || !result.data) {
        throw new Error(result.error?.message ?? "The lookup did not finish.");
      }
      if (result.data.kind === "candidates") {
        setCandidates(result.data.candidates);
        setExternalMessage(
          result.data.candidates.length
            ? "Choose the exact USDA result. Nothing is imported until you click Import."
            : "USDA returned no matches. Try a more exact name, barcode, or label photo.",
        );
      } else {
        setCandidates([]);
        setExternalMessage(
          `${result.data.displayName} is saved as an external-source record pending catalog review. You can log it now, but it will not enter generated plans until reviewed.`,
        );
        onSearchChange(result.data.displayName);
        await onCatalogChanged(result.data.displayName);
      }
    } catch (error) {
      setExternalMessage(
        error instanceof Error ? error.message : "The lookup did not finish.",
      );
    } finally {
      setExternalPending(false);
    }
  }

  return (
    <section>
      <label className="field">
        <span>Search foods</span>
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Food, brand, flavor, or barcode…"
        />
      </label>
      <div
        className="food-results"
        aria-label="Food search results"
        style={{ marginTop: ".8rem" }}
      >
        {visibleFoods.map((food) => (
          <article className="food-result" key={food.id}>
            <div style={{ minWidth: 0 }}>
              <h3>{food.name}</h3>
              {food.brandName || food.variantName || food.gtin ? (
                <p className="field-help">
                  {[food.brandName, food.variantName].filter(Boolean).join(" · ")}
                  {food.gtin ? ` · barcode ${food.gtin}` : ""}
                </p>
              ) : null}
              <div className="category-list">
                {food.categories.map((category) => (
                  <span className="category-badge" key={category}>
                    {category}
                  </span>
                ))}
              </div>
              <NutritionFactsCard
                compact
                nutrition={food.nutrition ?? null}
                source={food.source}
              />
              {!food.planEligible ? (
                <p className="field-help">
                  Reference food — not yet eligible for generated plans.
                </p>
              ) : null}
            </div>
            <div className="food-actions">
              {(["breakfast", "lunch", "dinner"] as const).map((meal) => (
                <button
                  disabled={!food.planEligible}
                  type="button"
                  onClick={() => onAdd(meal, food)}
                  key={meal}
                  aria-label={`Add ${food.name} to ${meal}`}
                >
                  Add to {meal[0].toUpperCase() + meal.slice(1)}
                </button>
              ))}
            </div>
          </article>
        ))}
        {!visibleFoods.length ? (
          <p className="field-help">
            No local match. External lookup is always explicit so typing does not
            send your query to another provider.
          </p>
        ) : null}
      </div>

      <details className="message-box" style={{ marginTop: "1rem" }}>
        <summary>
          <strong>Look up a larger external catalog</strong>
        </summary>
        <p className="field-help">
          USDA searches FoodData Central; exact barcodes use Open Food Facts.
          External results show their source and stay pending review.
        </p>
        <div className="form-row">
          <button
            className="button button-quiet"
            type="button"
            disabled={externalPending || search.trim().length < 2}
            onClick={() =>
              externalLookup({ action: "search_usda", query: search.trim() })
            }
          >
            Search USDA for “{search.trim() || "…"}”
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const barcode = new FormData(event.currentTarget)
                .get("barcode")
                ?.toString()
                .replace(/\D/g, "");
              void externalLookup({ action: "lookup_barcode", barcode });
            }}
          >
            <label className="field">
              <span>Exact product barcode</span>
              <div className="form-row">
                <input
                  name="barcode"
                  inputMode="numeric"
                  pattern="[0-9]{8,14}"
                  required
                  placeholder="8–14 digits"
                />
                <button className="button button-quiet" disabled={externalPending}>
                  Look up
                </button>
              </div>
            </label>
          </form>
        </div>
        {externalMessage ? (
          <div className="message-box" role="status">{externalMessage}</div>
        ) : null}
        {candidates.map((candidate) => (
          <article className="food-result" key={candidate.externalId}>
            <div>
              <strong>{candidate.displayName}</strong>
              <p className="field-help">
                {candidate.dataType ?? "USDA record"} ·{" "}
                {candidate.nutritionPreview.calories ?? "—"} kcal ·{" "}
                {candidate.nutritionPreview.proteinGrams ?? "—"} g protein per
                reported 100 g
              </p>
            </div>
            <button
              type="button"
              disabled={externalPending}
              onClick={() =>
                externalLookup({
                  action: "import",
                  provider: candidate.provider,
                  externalId: candidate.externalId,
                })
              }
            >
              Import exact record
            </button>
          </article>
        ))}
      </details>

      <details className="message-box" style={{ marginTop: "1rem" }}>
        <summary>
          <strong>Product not found? Photograph its label</strong>
        </summary>
        <p className="field-help">
          The photo stays private. Your confirmed transcription creates an
          owner-scoped plan food; a barcode also creates a shared normalized copy
          that remains pending review.
        </p>
        <FoodLabelUpload
          onCreated={async (_foodId, displayName) => {
            onSearchChange(displayName);
            await onCatalogChanged(displayName);
          }}
        />
      </details>
    </section>
  );
}
