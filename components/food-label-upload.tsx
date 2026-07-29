"use client";

import { useState, type FormEvent } from "react";
import type { FoodLabelData } from "@/src/lib/domain/food-label";

type ApiEnvelope<T> = {
  data: T | null;
  error: { message?: string } | null;
};

const optionalNumber = (value: string) =>
  value.trim() === "" ? null : Number(value);

export function FoodLabelUpload({
  onCreated,
}: {
  onCreated?: (
    foodId: string,
    displayName: string,
  ) => void | Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("nutritionImage");
    if (!(file instanceof File) || !file.size || !confirmed) {
      setMessage(
        "Add a clear nutrition-label photo and confirm that the transcription matches it.",
      );
      return;
    }
    const number = (name: string) => Number(form.get(name));
    const optional = (name: string) =>
      optionalNumber(String(form.get(name) ?? ""));
    const labelData: FoodLabelData = {
      brandName: String(form.get("brandName") ?? "").trim(),
      productName: String(form.get("productName") ?? "").trim(),
      variantName: String(form.get("variantName") ?? "").trim(),
      gtin: String(form.get("gtin") ?? "").replace(/\D/g, ""),
      packageDescription: String(form.get("packageDescription") ?? "").trim(),
      servingWeightGrams: number("servingWeightGrams"),
      servingDescription:
        String(form.get("servingDescription") ?? "").trim() || "1 serving",
      calories: number("calories"),
      energyKilojoules: optional("energyKilojoules"),
      proteinGrams: number("proteinGrams"),
      carbohydrateGrams: number("carbohydrateGrams"),
      fatGrams: number("fatGrams"),
      fiberGrams: optional("fiberGrams"),
      sodiumMilligrams: optional("sodiumMilligrams"),
      saturatedFatGrams: optional("saturatedFatGrams"),
      transFatGrams: optional("transFatGrams"),
      totalSugarsGrams: optional("totalSugarsGrams"),
      addedSugarsGrams: optional("addedSugarsGrams"),
      cholesterolMilligrams: optional("cholesterolMilligrams"),
      potassiumMilligrams: optional("potassiumMilligrams"),
      calciumMilligrams: optional("calciumMilligrams"),
      ironMilligrams: optional("ironMilligrams"),
      vitaminDMicrograms: optional("vitaminDMicrograms"),
      ingredientsText: String(form.get("ingredientsText") ?? "").trim(),
      allergenStatement: String(form.get("allergenStatement") ?? "").trim(),
      categorySlugs: form.getAll("categorySlugs").map(String),
      allergenSlugs: form.getAll("allergenSlugs").map(String),
      restrictionSlugs: form.getAll("restrictionSlugs").map(String),
      sourceNote: String(form.get("sourceNote") ?? "").trim(),
      allergensReviewed: form.get("allergensReviewed") === "on",
      restrictionsReviewed: form.get("restrictionsReviewed") === "on",
      confirmedAccurate: false,
    };

    setPending(true);
    setMessage("Creating a private label draft…");
    try {
      const draftResponse = await fetch("/api/food-labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(labelData),
      });
      const draft = (await draftResponse.json()) as ApiEnvelope<{ id: string }>;
      if (!draftResponse.ok || !draft.data) {
        throw new Error(draft.error?.message ?? "The label draft was not saved.");
      }

      setMessage("Sanitizing and uploading the private label photo…");
      const imageForm = new FormData();
      imageForm.set("imageKind", "nutrition");
      imageForm.set("file", file);
      const uploadResponse = await fetch(
        `/api/food-labels/${draft.data.id}/images`,
        { method: "POST", body: imageForm },
      );
      const upload = (await uploadResponse.json()) as ApiEnvelope<unknown>;
      if (!uploadResponse.ok) {
        throw new Error(upload.error?.message ?? "The label photo was not saved.");
      }

      setMessage("Confirming the photographed nutrition record…");
      const confirmResponse = await fetch(`/api/food-labels/${draft.data.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          labelData: { ...labelData, confirmedAccurate: true },
        }),
      });
      const result = (await confirmResponse.json()) as ApiEnvelope<{
        foodId: string;
      }>;
      if (!confirmResponse.ok || !result.data) {
        throw new Error(
          result.error?.message ?? "The confirmed product was not saved.",
        );
      }
      setMessage(
        labelData.gtin
          ? "Saved for your plans. A photo-free normalized copy is now searchable for other people under pending review."
          : "Saved for your plans. Add a barcode next time to make a normalized pending copy reusable by other people.",
      );
      formElement.reset();
      setConfirmed(false);
      await onCreated?.(
        result.data.foodId,
        [labelData.brandName, labelData.productName, labelData.variantName]
          .filter(Boolean)
          .join(" "),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The label could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field-grid">
        <label className="field">
          <span>Brand</span>
          <input name="brandName" required maxLength={160} placeholder="Optimum Nutrition" />
        </label>
        <label className="field">
          <span>Product</span>
          <input name="productName" required maxLength={240} placeholder="Gold Standard 100% Whey" />
        </label>
        <label className="field">
          <span>Flavor or variant</span>
          <input name="variantName" maxLength={160} placeholder="Double Rich Chocolate" />
        </label>
        <label className="field">
          <span>Barcode (recommended)</span>
          <input
            name="gtin"
            inputMode="numeric"
            pattern="[0-9]{8,14}"
            placeholder="8–14 digits"
          />
          <small className="field-help">
            A barcode lets other people reuse the normalized product without
            seeing your private photo.
          </small>
        </label>
        <label className="field">
          <span>Package size</span>
          <input name="packageDescription" maxLength={240} placeholder="2 lb tub" />
        </label>
        <label className="field">
          <span>Serving description</span>
          <input name="servingDescription" defaultValue="1 scoop" maxLength={160} />
        </label>
        <label className="field">
          <span>Serving weight (g)</span>
          <input name="servingWeightGrams" type="number" min=".001" max="10000" step="any" required />
        </label>
        <label className="field">
          <span>Calories</span>
          <input name="calories" type="number" min="0" max="10000" step="any" required />
        </label>
        <label className="field">
          <span>Protein (g)</span>
          <input name="proteinGrams" type="number" min="0" max="10000" step="any" required />
        </label>
        <label className="field">
          <span>Carbohydrate (g)</span>
          <input name="carbohydrateGrams" type="number" min="0" max="10000" step="any" required />
        </label>
        <label className="field">
          <span>Total fat (g)</span>
          <input name="fatGrams" type="number" min="0" max="10000" step="any" required />
        </label>
        <label className="field">
          <span>Fiber (g)</span>
          <input name="fiberGrams" type="number" min="0" max="10000" step="any" />
        </label>
        <label className="field">
          <span>Sodium (mg)</span>
          <input name="sodiumMilligrams" type="number" min="0" max="1000000" step="any" />
        </label>
        <label className="field">
          <span>Total sugars (g)</span>
          <input name="totalSugarsGrams" type="number" min="0" max="10000" step="any" />
        </label>
      </div>
      <details style={{ marginTop: "1rem" }}>
        <summary>More label nutrients</summary>
        <div className="field-grid" style={{ marginTop: ".75rem" }}>
          {[
            ["energyKilojoules", "Energy (kJ)", "100000"],
            ["saturatedFatGrams", "Saturated fat (g)", "10000"],
            ["transFatGrams", "Trans fat (g)", "10000"],
            ["addedSugarsGrams", "Added sugars (g)", "10000"],
            ["cholesterolMilligrams", "Cholesterol (mg)", "1000000"],
            ["potassiumMilligrams", "Potassium (mg)", "1000000"],
            ["calciumMilligrams", "Calcium (mg)", "1000000"],
            ["ironMilligrams", "Iron (mg)", "1000000"],
            ["vitaminDMicrograms", "Vitamin D (mcg)", "1000000"],
          ].map(([name, label, maximum]) => (
            <label className="field" key={name}>
              <span>{label}</span>
              <input name={name} type="number" min="0" max={maximum} step="any" />
            </label>
          ))}
        </div>
      </details>
      <label className="field" style={{ marginTop: "1rem" }}>
        <span>Ingredients exactly as printed</span>
        <textarea name="ingredientsText" required maxLength={10000} />
      </label>
      <label className="field" style={{ marginTop: "1rem" }}>
        <span>Package allergen statement</span>
        <textarea
          name="allergenStatement"
          required
          maxLength={4000}
          placeholder='For example: "Contains milk and soy." Enter "None stated on package" when applicable.'
        />
      </label>
      <fieldset style={{ border: 0, padding: 0, marginTop: "1rem" }}>
        <legend>Food categories (choose at least one)</legend>
        <p className="field-help">
          These categories drive meal-balance checks. For whey, choose Protein
          and Supplement; for vegetable powder, choose Vegetable and Supplement.
        </p>
        <div className="category-list" style={{ marginTop: ".5rem" }}>
          {[
            ["carbohydrate", "Carbohydrate"],
            ["protein", "Protein"],
            ["vegetable", "Vegetable"],
            ["fruit", "Fruit"],
            ["fat", "Fat"],
            ["dairy", "Dairy"],
            ["supplement", "Supplement"],
          ].map(([slug, label]) => (
            <label className="category-badge" key={slug}>
              <input
                type="checkbox"
                name="categorySlugs"
                value={slug}
                required={slug === "carbohydrate"}
                onInvalid={(event) =>
                  event.currentTarget.setCustomValidity(
                    "Choose at least one food category.",
                  )
                }
                onChange={(event) => {
                  const group = event.currentTarget.form?.elements.namedItem(
                    "categorySlugs",
                  );
                  const inputs =
                    group instanceof RadioNodeList
                      ? Array.from(group).filter(
                          (node): node is HTMLInputElement =>
                            node instanceof HTMLInputElement,
                        )
                      : event.currentTarget.form
                          ? Array.from(
                              event.currentTarget.form.querySelectorAll<HTMLInputElement>(
                                'input[name="categorySlugs"]',
                              ),
                            )
                          : [];
                  const hasSelection = inputs.some((input) => input.checked);
                  inputs.forEach((input, index) => {
                    input.required = index === 0 && !hasSelection;
                    input.setCustomValidity("");
                  });
                }}
              />{" "}
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, marginTop: "1rem" }}>
        <legend>Allergens stated on package</legend>
        <div className="category-list" style={{ marginTop: ".5rem" }}>
          {[
            ["milk", "Milk"],
            ["egg", "Egg"],
            ["fish", "Fish"],
            ["shellfish", "Shellfish"],
            ["tree-nuts", "Tree nuts"],
            ["peanuts", "Peanuts"],
            ["wheat", "Wheat"],
            ["soy", "Soy"],
            ["sesame", "Sesame"],
          ].map(([slug, label]) => (
            <label className="category-badge" key={slug}>
              <input type="checkbox" name="allergenSlugs" value={slug} /> {label}
            </label>
          ))}
        </div>
        <label className="option-card" style={{ marginTop: ".75rem" }}>
          <input type="checkbox" name="allergensReviewed" required />
          I reviewed the complete package allergen statement and selected every
          allergen it names, including “may contain” warnings. If none are
          named, I confirm that the statement says so.
        </label>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, marginTop: "1rem" }}>
        <legend>This exact product is not suitable for</legend>
        <p className="field-help">
          Review the ingredients and package claims. Check every diet this
          product conflicts with; leaving a box empty means you confirmed no
          conflict for that diet from the label.
        </p>
        <div className="category-list" style={{ marginTop: ".5rem" }}>
          {[
            ["vegetarian", "Vegetarian"],
            ["vegan", "Vegan"],
            ["pescatarian", "Pescatarian"],
            ["gluten-free", "Gluten-free"],
            ["dairy-free", "Dairy-free"],
          ].map(([slug, label]) => (
            <label className="category-badge" key={slug}>
              <input type="checkbox" name="restrictionSlugs" value={slug} />{" "}
              {label}
            </label>
          ))}
        </div>
        <label className="option-card" style={{ marginTop: ".75rem" }}>
          <input type="checkbox" name="restrictionsReviewed" required />
          I reviewed the ingredients and package claims against every diet
          listed above and selected each known conflict.
        </label>
      </fieldset>
      <label className="field" style={{ marginTop: "1rem" }}>
        <span>Nutrition-label photo</span>
        <input
          type="file"
          name="nutritionImage"
          accept="image/jpeg,image/png"
          capture="environment"
          required
        />
        <small className="field-help">
          JPEG or PNG, up to 8 MB and 20 megapixels. The server re-encodes the
          image to remove embedded metadata; the raw evidence remains private.
        </small>
      </label>
      <label className="option-card" style={{ marginTop: "1rem" }}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        I transcribed the serving nutrition, ingredients, and allergen statement
        from this exact product label.
      </label>
      {message ? <div className="message-box" role="status">{message}</div> : null}
      <div className="section-actions">
        <button className="button button-dark" type="submit" disabled={pending || !confirmed}>
          {pending ? "Saving label…" : "Upload and save product"}
        </button>
      </div>
    </form>
  );
}
