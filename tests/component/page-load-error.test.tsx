import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageLoadError } from "../../components/page-load-error";

describe("PageLoadError", () => {
  it("clearly identifies unavailable stored data and offers a retry", () => {
    render(
      <PageLoadError
        title="Today could not be loaded."
        message="Stored check-ins are temporarily unavailable."
        retryHref="/today"
        retryLabel="Reload Today"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Stored check-ins are temporarily unavailable.",
    );
    expect(
      screen.getByText(
        "We are not showing empty values as if they were current.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reload Today" })).toHaveAttribute(
      "href",
      "/today",
    );
  });
});
