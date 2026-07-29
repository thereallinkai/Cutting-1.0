import { createPlanProvider } from "../src/lib/ai/provider";

async function main() {
  if (
    process.env.ENABLE_REAL_AI !== "true" ||
    process.env.AI_PROVIDER !== "openai"
  ) {
    console.log("SKIPPED: real OpenAI smoke test requires explicit ENABLE_REAL_AI=true and AI_PROVIDER=openai.");
    return;
  }
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
    throw new Error("FAILED: explicit real AI mode is enabled, but credentials or model are missing.");
  }

  const provider = createPlanProvider("openai");
  const plan = await provider.generate({
    safetyIdentifier: "lets-go-green-protected-smoke-test",
    profile: {
      age: 30,
      currentWeightKg: 80,
      startWeightKg: 81,
      targetWeightKg: 78,
      goalType: "recomposition",
      targetDate: "2026-10-01",
      activityLevel: "moderate",
      trainingDaysPerWeek: 3,
      preferredUnit: "kg",
      timeZone: "UTC",
      allergies: [],
      dietaryRestrictions: [],
      safetyRequiresNonRestrictivePlan: false,
    },
    deterministicRanges: {
      energyKcal: { minimum: 2_000, maximum: 2_300 },
      proteinGrams: { minimum: 120, maximum: 155 },
    },
    allowedFoods: [
      { id: "rolled-oats", name: "Rolled oats", allowedMeasurementBases: ["dry"] },
      { id: "eggs", name: "Eggs", allowedMeasurementBases: ["as_sold"] },
      { id: "blueberries", name: "Blueberries", allowedMeasurementBases: ["raw"] },
      { id: "brown-rice", name: "Brown rice", allowedMeasurementBases: ["cooked"] },
      { id: "chicken-breast", name: "Chicken breast", allowedMeasurementBases: ["cooked"] },
      { id: "broccoli", name: "Broccoli", allowedMeasurementBases: ["cooked"] },
      { id: "salmon", name: "Salmon", allowedMeasurementBases: ["cooked"] },
      { id: "potatoes", name: "Potatoes", allowedMeasurementBases: ["cooked"] },
      { id: "spinach", name: "Spinach", allowedMeasurementBases: ["cooked"] },
    ],
    acknowledgedWarnings: [],
  });

  if (plan.days.length !== 7) throw new Error("FAILED: provider did not return seven validated days.");
  console.log(`PASSED: one validated ${provider.model} Responses API plan was returned.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown smoke-test failure.";
  console.error(message);
  process.exitCode = 1;
});
