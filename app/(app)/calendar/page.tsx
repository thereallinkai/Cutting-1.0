import type { Metadata } from "next";
import {
  CalendarView,
  type CalendarCheckin,
} from "@/components/calendar-view";
import {
  localDateInTimeZone,
} from "@/src/lib/domain";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const metadata: Metadata = { title: "Calendar" };

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    first: `${month}-01`,
    last: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export default async function CalendarPage() {
  if (isDevelopmentDemo()) return <CalendarView />;

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return <CalendarView initialCheckins={[]} />;
  const { data: profile } = await supabase
    .from("profiles")
    .select("time_zone")
    .eq("user_id", auth.user.id)
    .single();
  const timeZone = profile?.time_zone ?? "UTC";
  const today = localDateInTimeZone(new Date(), timeZone);
  const month = today.slice(0, 7);
  const bounds = monthBounds(month);
  const { data } = await supabase
    .from("daily_checkins")
    .select(
      "local_date,breakfast_completed,lunch_completed,dinner_completed,notes",
    )
    .eq("user_id", auth.user.id)
    .gte("local_date", bounds.first)
    .lte("local_date", bounds.last)
    .order("local_date");

  return (
    <CalendarView
      initialMonth={month}
      initialSelectedDate={today}
      initialCheckins={(data ?? []) as CalendarCheckin[]}
      timeZone={timeZone}
    />
  );
}
