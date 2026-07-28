import type { PropsWithChildren } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TodayDashboard } from "../../components/today-dashboard";

vi.mock("recharts", () => {
  const Container = ({ children }: PropsWithChildren) => <div>{children}</div>;
  const Empty = () => null;
  return {
    ResponsiveContainer: Container,
    LineChart: Container,
    CartesianGrid: Empty,
    Line: Empty,
    ReferenceLine: Empty,
    Tooltip: Empty,
    XAxis: Empty,
    YAxis: Empty,
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function mealButton(label: "Breakfast" | "Lunch" | "Dinner") {
  const row = screen.getByText(label).closest(".meal-row");
  if (!row) throw new Error(`Could not find ${label} row.`);
  return within(row as HTMLElement).getByRole("button");
}

describe("TodayDashboard meal completion", () => {
  it("optimistically applies the desired final state and confirms a successful save", async () => {
    const request = deferred<{ ok: boolean }>();
    const fetchMock = vi.fn((..._arguments: Parameters<typeof fetch>) => {
      void _arguments;
      return request.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<TodayDashboard />);

    const dinner = mealButton("Dinner");
    expect(dinner).toHaveAttribute("aria-pressed", "false");
    await user.click(dinner);

    expect(dinner).toHaveAttribute("aria-pressed", "true");
    expect(dinner).toHaveTextContent("Saving…");
    expect(mealButton("Breakfast")).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      breakfastCompleted: true,
      lunchCompleted: true,
      dinnerCompleted: true,
    });

    request.resolve({ ok: true });
    await waitFor(() => expect(dinner).toHaveTextContent("Completed"));
    expect(
      screen.getByText("Dinner is now completed.", { selector: "[aria-live]" }),
    ).toBeInTheDocument();
  });

  it("rolls optimistic state back and announces a persistence failure", async () => {
    const request = deferred<{ ok: boolean }>();
    vi.stubGlobal("fetch", vi.fn(() => request.promise));
    const user = userEvent.setup();
    render(<TodayDashboard />);

    const dinner = mealButton("Dinner");
    await user.click(dinner);
    expect(dinner).toHaveAttribute("aria-pressed", "true");

    request.resolve({ ok: false });
    await waitFor(() => {
      expect(dinner).toHaveAttribute("aria-pressed", "false");
      expect(dinner).toHaveTextContent("Not marked");
    });
    expect(
      screen.getByText(
        "We could not save Dinner. Your previous status was restored.",
        { selector: "[aria-live]" },
      ),
    ).toBeInTheDocument();
  });

  it("sends an explicit false state when a completed meal is undone", async () => {
    const fetchMock = vi.fn(async (..._arguments: Parameters<typeof fetch>) => {
      void _arguments;
      return { ok: true };
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<TodayDashboard />);

    await user.click(mealButton("Breakfast"));
    await waitFor(() =>
      expect(
        screen.getByText("Breakfast is now not marked.", {
          selector: "[aria-live]",
        }),
      ).toBeInTheDocument(),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      breakfastCompleted: false,
      lunchCompleted: true,
      dinnerCompleted: false,
    });
  });
});
