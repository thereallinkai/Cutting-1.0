"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Circle, Undo2 } from "lucide-react";
import { addLocalDays, localDateInTimeZone } from "@/src/lib/domain";

type MealKey = "breakfast" | "lunch" | "dinner";

export type CalendarCheckin = {
  local_date: string;
  breakfast_completed: boolean;
  lunch_completed: boolean;
  dinner_completed: boolean;
  notes: string | null;
};

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    first,
    last: `${year}-${String(monthNumber).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
}

function fullDateLabel(localDate: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${localDate}T12:00:00Z`));
}

function toMealState(checkin?: CalendarCheckin) {
  return {
    breakfast: checkin?.breakfast_completed ?? false,
    lunch: checkin?.lunch_completed ?? false,
    dinner: checkin?.dinner_completed ?? false,
  };
}

export function CalendarView({
  initialMonth = "2026-07",
  initialSelectedDate = "2026-07-24",
  initialCheckins,
  timeZone = "America/New_York",
}: {
  initialMonth?: string;
  initialSelectedDate?: string;
  initialCheckins?: CalendarCheckin[];
  timeZone?: string;
}) {
  const demoCheckins = useMemo<CalendarCheckin[]>(
    () =>
      Array.from({ length: 24 }, (_, index) => {
        const day = index + 1;
        const completed = (day * 7) % 4;
        return {
          local_date: `2026-07-${String(day).padStart(2, "0")}`,
          breakfast_completed: completed > 0,
          lunch_completed: completed > 1,
          dinner_completed: completed > 2,
          notes: null,
        };
      }),
    [],
  );
  const [month, setMonth] = useState(initialMonth);
  const [checkins, setCheckins] = useState<CalendarCheckin[]>(
    initialCheckins ?? demoCheckins,
  );
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const selectedCheckin = checkins.find(
    (checkin) => checkin.local_date === selectedDate,
  );
  const [mealState, setMealState] = useState<Record<MealKey, boolean>>(
    toMealState(selectedCheckin),
  );
  const [notes, setNotes] = useState(selectedCheckin?.notes ?? "");
  const [announcement, setAnnouncement] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<{
    state: Record<MealKey, boolean>;
    notes: string;
  } | null>(null);
  const today = localDateInTimeZone(new Date(), timeZone);

  const calendarDays = useMemo(() => {
    const bounds = monthBounds(month);
    const firstWeekday = new Date(`${bounds.first}T12:00:00Z`).getUTCDay();
    const gridStart = addLocalDays(bounds.first, -firstWeekday);
    return Array.from({ length: 42 }, (_, index) => {
      const localDate = addLocalDays(gridStart, index);
      const checkin = checkins.find((item) => item.local_date === localDate);
      return {
        localDate,
        label: Number(localDate.slice(-2)),
        outside: !localDate.startsWith(month),
        completed: checkin
          ? Number(checkin.breakfast_completed) +
            Number(checkin.lunch_completed) +
            Number(checkin.dinner_completed)
          : 0,
      };
    });
  }, [checkins, month]);

  async function loadMonth(nextMonth: string, selectDate?: string) {
    const { first, last } = monthBounds(nextMonth);
    setAnnouncement(`Loading ${monthLabel(nextMonth)}…`);
    try {
      const response = await fetch(
        `/api/checkins?from=${encodeURIComponent(first)}&to=${encodeURIComponent(last)}`,
      );
      if (!response.ok) throw new Error("load_failed");
      const result = (await response.json()) as {
        data: CalendarCheckin[] | null;
      };
      const nextCheckins = result.data ?? [];
      setMonth(nextMonth);
      setCheckins(nextCheckins);
      const nextSelected = selectDate ?? first;
      setSelectedDate(nextSelected);
      const nextCheckin = nextCheckins.find(
        (checkin) => checkin.local_date === nextSelected,
      );
      setMealState(toMealState(nextCheckin));
      setNotes(nextCheckin?.notes ?? "");
      setLastSnapshot(null);
      setAnnouncement(`${monthLabel(nextMonth)} is ready.`);
    } catch {
      setAnnouncement(
        "The requested month could not be loaded. The current month remains visible.",
      );
    }
  }

  function selectDay(localDate: string) {
    const checkin = checkins.find((item) => item.local_date === localDate);
    setSelectedDate(localDate);
    setMealState(toMealState(checkin));
    setNotes(checkin?.notes ?? "");
    setLastSnapshot(null);
  }

  async function persist(
    desired: Record<MealKey, boolean>,
    desiredNotes: string,
  ) {
    const response = await fetch(`/api/checkins/${selectedDate}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        breakfastCompleted: desired.breakfast,
        lunchCompleted: desired.lunch,
        dinnerCompleted: desired.dinner,
        notes: desiredNotes || null,
      }),
    });
    if (!response.ok) throw new Error("save_failed");
    setCheckins((current) => [
      ...current.filter((item) => item.local_date !== selectedDate),
      {
        local_date: selectedDate,
        breakfast_completed: desired.breakfast,
        lunch_completed: desired.lunch,
        dinner_completed: desired.dinner,
        notes: desiredNotes || null,
      },
    ]);
  }

  async function setMeal(key: MealKey, value: boolean) {
    if (saving || selectedDate > today) return;
    const previous = mealState;
    const desired = { ...mealState, [key]: value };
    setMealState(desired);
    setLastSnapshot({ state: previous, notes });
    setSaving(true);
    try {
      await persist(desired, notes);
      setAnnouncement(`${key} is now ${value ? "completed" : "not marked"}.`);
    } catch {
      setMealState(previous);
      setLastSnapshot(null);
      setAnnouncement(
        "The update could not be saved. The previous status was restored.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveNotes() {
    if (saving || selectedDate > today) return;
    const previousNotes = selectedCheckin?.notes ?? "";
    setSaving(true);
    setLastSnapshot({ state: mealState, notes: previousNotes });
    try {
      await persist(mealState, notes);
      setAnnouncement("The note was saved.");
    } catch {
      setNotes(previousNotes);
      setLastSnapshot(null);
      setAnnouncement(
        "The note could not be saved. The previous note was restored.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function undo() {
    if (!lastSnapshot || saving) return;
    const current = { state: mealState, notes };
    setMealState(lastSnapshot.state);
    setNotes(lastSnapshot.notes);
    setSaving(true);
    try {
      await persist(lastSnapshot.state, lastSnapshot.notes);
      setLastSnapshot(current);
      setAnnouncement("The last saved change was undone.");
    } catch {
      setMealState(current.state);
      setNotes(current.notes);
      setAnnouncement("Undo could not be saved. The latest state remains.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-frame">
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <header className="page-header">
        <div>
          <span className="date-label">
            {initialCheckins === undefined
              ? "Mock data — development only"
              : timeZone.replaceAll("_", " ")}
          </span>
          <h1>Calendar</h1>
          <p>Review meal check-ins by local calendar date.</p>
        </div>
        <button className="button button-quiet" type="button" onClick={() => {
          const currentMonth = today.slice(0, 7);
          if (currentMonth === month) selectDay(today);
          else void loadMonth(currentMonth, today);
        }}>Today</button>
      </header>

      <div className="calendar-layout">
        <section className="card calendar-card" aria-label={`${monthLabel(month)} calendar`}>
          <div className="calendar-toolbar">
            <button className="icon-button" aria-label="Previous month" type="button" onClick={() => void loadMonth(shiftMonth(month, -1))}><ChevronLeft size={19} /></button>
            <h2>{monthLabel(month)}</h2>
            <button className="icon-button" aria-label="Next month" type="button" onClick={() => void loadMonth(shiftMonth(month, 1))}><ChevronRight size={19} /></button>
          </div>
          <div className="calendar-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div className="weekday" key={day}>{day}</div>
            ))}
            {calendarDays.map((item) => (
              <button
                className={`calendar-day ${item.outside ? "outside" : ""} ${selectedDate === item.localDate ? "selected" : ""}`}
                key={item.localDate}
                type="button"
                aria-label={`${fullDateLabel(item.localDate)}, ${item.completed} of 3 meals completed`}
                aria-pressed={selectedDate === item.localDate}
                disabled={item.outside}
                onClick={() => selectDay(item.localDate)}
              >
                <span className="day-number">{item.label}</span>
                <span className="meal-dots" aria-hidden="true">
                  {[0, 1, 2].map((dot) => <i className={dot < item.completed ? "complete" : ""} key={dot} />)}
                </span>
                {!item.outside ? <span className="completion-copy">{item.completed} of 3</span> : null}
              </button>
            ))}
          </div>
        </section>

        <aside className="card selected-day-panel">
          <span className="date-label">Selected day</span>
          <h2>{fullDateLabel(selectedDate)}</h2>
          <p>{Object.values(mealState).filter(Boolean).length} of 3 meals completed</p>
          <div className="day-meal-list">
            {([
              ["breakfast", "Breakfast"],
              ["lunch", "Lunch"],
              ["dinner", "Dinner"],
            ] as Array<[MealKey, string]>).map(([key, title]) => (
              <div className="day-meal" key={key}>
                <div>
                  <strong>{title}</strong>
                  <button
                    className={`check-button ${mealState[key] ? "complete" : ""}`}
                    type="button"
                    disabled={saving || selectedDate > today}
                    aria-pressed={mealState[key]}
                    onClick={() => setMeal(key, !mealState[key])}
                  >
                    {mealState[key] ? <Check size={15} /> : <Circle size={14} />}
                    {mealState[key] ? "Completed" : "Not marked"}
                  </button>
                </div>
                <span className="field-help">Plan details remain on My Plan.</span>
              </div>
            ))}
          </div>
          <label className="field" style={{ marginTop: "1rem" }}>
            <span className="field-label">Optional note</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add context for your future self…" />
          </label>
          <button className="button button-dark form-submit" disabled={saving || selectedDate > today} type="button" onClick={saveNotes}>
            Save note
          </button>
          <button className="button button-quiet form-submit" disabled={!lastSnapshot || saving} type="button" onClick={undo}>
            <Undo2 size={16} /> Undo last saved change
          </button>
          {selectedDate > today ? <p className="field-help">Future meal completion is disabled.</p> : null}
        </aside>
      </div>
    </div>
  );
}
