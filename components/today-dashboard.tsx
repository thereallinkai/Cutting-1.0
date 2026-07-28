"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  Circle,
  Coffee,
  Dumbbell,
  MoonStar,
  Scale,
  Sparkles,
  Sun,
  Utensils,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { localDateInTimeZone } from "@/src/lib/domain";

type MealKey = "breakfast" | "lunch" | "dinner";

const demoMeals: Array<{
  key: MealKey;
  label: string;
  detail: string;
  Icon: typeof Coffee;
}> = [
  { key: "breakfast", label: "Breakfast", detail: "Oats, yogurt & blueberries", Icon: Coffee },
  { key: "lunch", label: "Lunch", detail: "Rice bowl with chicken & greens", Icon: Sun },
  { key: "dinner", label: "Dinner", detail: "Salmon, potato & broccoli", Icon: MoonStar },
];

const demoWeightData = [
  { day: "Fri", weight: 81.4 },
  { day: "Sat", weight: 81.2 },
  { day: "Sun", weight: 81.3 },
  { day: "Mon", weight: 81.0 },
  { day: "Tue", weight: 80.9 },
  { day: "Wed", weight: 80.8 },
  { day: "Thu", weight: 80.7 },
];

export type TodayWeightPoint = { day: string; weight: number };

export function TodayDashboard({
  name = "Jamie",
  timeZone = "America/New_York",
  initialCompleted = {
    breakfast: true,
    lunch: true,
    dinner: false,
  },
  mealDetails,
  weightPoints = demoWeightData,
  providerLabel = "Mock AI plan — development only",
  weeklyMarked = 10,
  weeklyPossible = 12,
  energyRange,
  proteinRange,
  goalContext,
  demoMode = true,
}: {
  name?: string;
  timeZone?: string;
  initialCompleted?: Record<MealKey, boolean>;
  mealDetails?: Partial<Record<MealKey, string>>;
  weightPoints?: TodayWeightPoint[];
  providerLabel?: string;
  weeklyMarked?: number;
  weeklyPossible?: number;
  energyRange?: { minimum: number; maximum: number } | null;
  proteinRange?: { minimum: number; maximum: number } | null;
  goalContext?: {
    type: string;
    targetDate: string;
    currentKg: number | null;
    targetKg: number;
    startKg: number | null;
    remainingDays: number;
  } | null;
  demoMode?: boolean;
}) {
  const [completed, setCompleted] =
    useState<Record<MealKey, boolean>>(initialCompleted);
  const [announcement, setAnnouncement] = useState("");
  const [saving, setSaving] = useState<MealKey | null>(null);
  const count = Object.values(completed).filter(Boolean).length;
  const localDate = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(new Date()),
    [timeZone],
  );
  const meals = demoMeals.map((meal) => ({
    ...meal,
    detail:
      mealDetails?.[meal.key] ??
      (demoMode
        ? meal.detail
        : "No accepted plan meal is available for this day."),
  }));

  async function updateMeal(meal: MealKey) {
    if (saving) return;
    const previous = completed;
    const desired = { ...completed, [meal]: !completed[meal] };
    setCompleted(desired);
    setSaving(meal);
    const label = meals.find((item) => item.key === meal)?.label ?? meal;
    try {
      const localDay = localDateInTimeZone(new Date(), timeZone);
      const response = await fetch(`/api/checkins/${localDay}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          breakfastCompleted: desired.breakfast,
          lunchCompleted: desired.lunch,
          dinnerCompleted: desired.dinner,
        }),
      });
      if (!response.ok) throw new Error("save_failed");
      setAnnouncement(`${label} is now ${desired[meal] ? "completed" : "not marked"}.`);
    } catch {
      setCompleted(previous);
      setAnnouncement(`We could not save ${label}. Your previous status was restored.`);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="page-frame">
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <header className="page-header">
        <div>
          <span className="date-label">
            {demoMode ? "Mock data — development only · " : ""}
            {localDate}
          </span>
          <h1>Good morning, {name}.</h1>
          <p>Here&apos;s the plan for today—use what&apos;s helpful.</p>
        </div>
        <Link className="button button-quiet" href="/progress">
          <Scale size={17} aria-hidden="true" /> Add today&apos;s weight
        </Link>
      </header>

      <div className="today-grid">
        <section className="today-primary" aria-label="Today's meals and status">
          <article className="day-status-card">
            <div>
              <span className="source-label ai">
                <Sparkles size={14} aria-hidden="true" /> {providerLabel}
              </span>
              <h2>{count === 3 ? "Today is fully marked." : "You’re building today’s rhythm."}</h2>
              <p>
                {count} of 3 meals marked. A meal can always be returned to not marked.
              </p>
            </div>
            <div className="status-ring" aria-label={`${count} of 3 meals completed`}>
              <span>{count}/3</span>
            </div>
          </article>

          <article className="card">
            <div className="card-title">
              <div>
                <h2>Today&apos;s meals</h2>
                <p>Tap once to mark; tap again to undo.</p>
              </div>
              <span className="source-label"><Utensils size={14} /> Provided by you</span>
            </div>
            <div className="meal-list">
              {meals.map(({ key, label, detail, Icon }) => (
                <div className="meal-row" key={key}>
                  <span className="meal-icon" aria-hidden="true"><Icon size={20} /></span>
                  <div>
                    <span>{label}</span>
                    <strong>{detail}</strong>
                  </div>
                  <button
                    className={`check-button ${completed[key] ? "complete" : ""}`}
                    type="button"
                    aria-pressed={completed[key]}
                    disabled={saving !== null}
                    onClick={() => updateMeal(key)}
                  >
                    {completed[key] ? <Check size={16} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}
                    {saving === key ? "Saving…" : completed[key] ? "Completed" : "Not marked"}
                  </button>
                </div>
              ))}
            </div>
          </article>

          <article className="card">
            <div className="card-title">
              <div>
                <h2>Seven-day weight trend</h2>
                <p>Daily readings and a simple direction—not a judgment.</p>
              </div>
              <span className="source-label">
                <Dumbbell size={14} aria-hidden="true" /> Calculated by the app
              </span>
            </div>
            <div
              className="chart-wrap"
              role="img"
              aria-label={`${weightPoints.length} recent weight readings are shown with missing dates left as gaps.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightPoints} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#e3dfd5" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={11} />
                  <YAxis domain={["dataMin - 1", "dataMax + 1"]} axisLine={false} tickLine={false} fontSize={11} />
                  <Tooltip
                    formatter={(value) => [`${Number(value).toFixed(1)} kg`, "Weight"]}
                    contentStyle={{ borderRadius: 10, borderColor: "#d9d4c8", fontSize: 12 }}
                  />
                  {weightPoints.length ? <ReferenceLine y={weightPoints.at(-1)?.weight} stroke="#aeb7ad" strokeDasharray="4 4" /> : null}
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="#647632"
                    strokeWidth={2.5}
                    dot={{ fill: "#647632", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="chart-alt">
              {weightPoints.length
                ? `${weightPoints.length} recent readings are available. Day-to-day changes can reflect many factors.`
                : "No weight readings are available yet. Missing days remain empty."}
            </p>
          </article>
        </section>

        <aside className="today-side" aria-label="Today summary">
          {energyRange || proteinRange ? <article className="card">
            <div className="card-title">
              <div>
                <h2>Plan range</h2>
                <p>Transparent daily estimates</p>
              </div>
            </div>
            <div className="metric-grid">
              <div className="metric"><span>Energy</span><strong>{energyRange ? `${energyRange.minimum.toLocaleString()}–${energyRange.maximum.toLocaleString()}` : "Insufficient data"}</strong><small>kcal</small></div>
              <div className="metric"><span>Protein</span><strong>{proteinRange ? `${proteinRange.minimum}–${proteinRange.maximum}` : "Insufficient data"}</strong><small>grams</small></div>
            </div>
            <p className="chart-alt">Calculated by the app · Estimator v1 · Individual needs vary.</p>
          </article> : null}

          <article className="card">
            <div className="card-title">
              <div>
                <h2>This week</h2>
                <p>Monday through today</p>
              </div>
            </div>
            <div className="metric-grid">
              <div className="metric"><span>Meals marked</span><strong>{weeklyMarked} / {weeklyPossible}</strong></div>
              <div className="metric"><span>Completion</span><strong>{weeklyPossible ? Math.round((weeklyMarked / weeklyPossible) * 100) : 0}%</strong></div>
            </div>
            <p className="chart-alt">Calculated by the app from your check-ins.</p>
          </article>

          {goalContext ? <article className="card">
            <div className="card-title">
              <div>
                <h2>Goal context</h2>
                <p>{goalContext.type.replaceAll("_", " ")} goal · target {goalContext.targetDate}</p>
              </div>
            </div>
            <div className="metric-grid">
              <div className="metric"><span>Current</span><strong>{goalContext.currentKg === null ? "Unavailable" : `${goalContext.currentKg.toFixed(1)} kg`}</strong></div>
              <div className="metric"><span>Target</span><strong>{goalContext.targetKg.toFixed(1)} kg</strong></div>
              <div className="metric"><span>Change so far</span><strong>{goalContext.currentKg === null || goalContext.startKg === null ? "Insufficient data" : `${Math.abs(goalContext.currentKg - goalContext.startKg).toFixed(1)} kg`}</strong></div>
              <div className="metric"><span>Time remaining</span><strong>{goalContext.remainingDays} days</strong></div>
            </div>
            <Link className="button button-quiet form-submit" href="/progress">
              View progress <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </article>
          : null}
        </aside>
      </div>
    </div>
  );
}
