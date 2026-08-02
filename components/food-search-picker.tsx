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
  provider: "usda_fdc" | "open_food_facts";
  externalId: string;
  displayName: string;
  brandName: string | null;
  productName: string;
  variantName: string | null;
  gtin: string | null;
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

type LookupRequest =
  | {
      action: "search_usda" | "search_open_food_facts";
      query: string;
    }
  | {
      action: "lookup_barcode";
      barcode: string | undefined;
    }
  | {
      action: "import";
      provider: Candidate["provider"];
      externalId: string;
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
  const [onlineProvider, setOnlineProvider] =
    useState<Candidate["provider"]>("open_food_facts");
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

  async function externalLookup(body: LookupRequest) {
    setExternalPending(true);
    setExternalMessage(null);
    if (
      body.action === "search_open_food_facts" ||
      body.action === "search_usda"
    ) {
      setCandidates([]);
    }
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
        const providerName =
          body.action === "search_open_food_facts"
            ? "Open Food Facts"
            : "USDA FoodData Central";
        setExternalMessage(
          result.data.candidates.length
            ? `${providerName} found ${result.data.candidates.length} possible ${result.data.candidates.length === 1 ? "match" : "matches"}. Review the brand and nutrition preview, then import the exact record you want.`
            : `${providerName} returned no matches. Try a brand plus product name, another source, a barcode, or a label photo.`,
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
      const alternateSource =
        body.action === "search_open_food_facts"
          ? " You can select USDA above and search the same name without a barcode."
          : body.action === "search_usda"
            ? " You can select Open Food Facts above and search the same product name without a barcode."
            : "";
      setExternalMessage(
        `${
          error instanceof Error
            ? error.message
            : "The lookup did not finish."
        }${alternateSource}`,
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
          maxLength={120}
          disabled={externalPending}
          onChange={(event) => {
            onSearchChange(event.target.value);
            setCandidates([]);
            setExternalMessage(null);
          }}
          placeholder="Food, brand, flavor, or barcode…"
        />
      </label>
      <section
        className="message-box"
        aria-labelledby="online-food-name-search-heading"
        aria-busy={externalPending}
        style={{ marginTop: ".8rem" }}
      >
        <h3 id="online-food-name-search-heading">
          Search online by food or product name
        </h3>
        <p className="field-help">
          Type a food, brand, product, or flavor above—such as “Optimum
          Nutrition double rich chocolate”—then search. No barcode scan is
          required.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void externalLookup({
              action:
                onlineProvider === "open_food_facts"
                  ? "search_open_food_facts"
                  : "search_usda",
              query: search.trim(),
            });
          }}
        >
          <div className="form-row">
            <label className="field">
              <span>Online food source</span>
              <select
                value={onlineProvider}
                disabled={externalPending}
                onChange={(event) => {
                  setOnlineProvider(
                    event.target.value as Candidate["provider"],
                  );
                  setCandidates([]);
                  setExternalMessage(null);
                }}
              >
                <option value="open_food_facts">
                  Packaged products and brands — Open Food Facts
                </option>
                <option value="usda_fdc">
                  Generic and branded foods — USDA
                </option>
              </select>
            </label>
            <button
              className="button button-quiet"
              type="submit"
              disabled={externalPending || search.trim().length < 2}
            >
              {externalPending ? "Searching…" : "Search online by name"}
            </button>
          </div>
        </form>
        <p className="field-help">
          Your words are sent to the selected source only after you press the
          button. Results are source-reported and nothing is saved until you
          import one.
        </p>
        {externalMessage ? (
          <div className="message-box" role="status" aria-live="polite">
            {externalMessage}
          </div>
        ) : null}
        {candidates.map((candidate) => (
          <article
            className="food-result"
            key={`${candidate.provider}:${candidate.externalId}`}
          >
            <div>
              <strong>{candidate.displayName}</strong>
              <p className="field-help">
                {candidate.provider === "open_food_facts"
                  ? "Open Food Facts"
                  : "USDA FoodData Central"}
                {candidate.dataType ? ` · ${candidate.dataType}` : ""}
                {candidate.gtin ? ` · barcode ${candidate.gtin}` : ""}
              </p>
              <p className="field-help">
                Source-reported per 100 g:{" "}
                {candidate.nutritionPreview.calories ?? "—"} kcal ·{" "}
                {candidate.nutritionPreview.proteinGrams ?? "—"} g protein ·{" "}
                {candidate.nutritionPreview.carbohydrateGrams ?? "—"} g carbs ·{" "}
                {candidate.nutritionPreview.fatGrams ?? "—"} g fat
              </p>
            </div>
            <button
              className="button button-quiet"
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
              Import current record
            </button>
          </article>
        ))}
        {candidates.length ? (
          <p className="field-help">
            Import refetches the selected provider record on the server. Saved
            records remain pending review and unavailable to generated plans
            until approved.
          </p>
        ) : null}
      </section>

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
          <strong>Look up an exact barcode instead</strong>
        </summary>
        <p className="field-help">
          Barcode lookup is optional. It uses Open Food Facts when you already
          have the 8- to 14-digit number from a package.
        </p>
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
                disabled={externalPending}
                placeholder="8–14 digits"
              />
              <button className="button button-quiet" disabled={externalPending}>
                Look up barcode
              </button>
            </div>
          </label>
        </form>
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
