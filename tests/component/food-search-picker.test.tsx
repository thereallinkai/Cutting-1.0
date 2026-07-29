import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  FoodSearchPicker,
  type FoodPickerItem,
} from "../../components/food-search-picker";

const localFood: FoodPickerItem = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Local Whey Protein",
  categories: ["protein", "supplement"],
  planEligible: true,
  brandName: "Local Brand",
  variantName: "Chocolate",
  gtin: null,
  catalogStatus: "active",
  nutrition: null,
  source: null,
};

const candidate = {
  provider: "open_food_facts" as const,
  externalId: "748927022650",
  displayName:
    "Optimum Nutrition — Gold Standard 100% Whey Double Rich Chocolate",
  brandName: "Optimum Nutrition",
  productName: "Gold Standard 100% Whey Double Rich Chocolate",
  variantName: null,
  gtin: "748927022650",
  dataType: "Open Food Facts product",
  nutritionPreview: {
    calories: 375,
    proteinGrams: 75,
    carbohydrateGrams: 9.4,
    fatGrams: 3.1,
  },
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, error: null }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("FoodSearchPicker online name search", () => {
  it("keeps explicit branded-product name search visible alongside local matches", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ kind: "candidates", candidates: [candidate] }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            kind: "imported",
            foodId: "22222222-2222-4222-8222-222222222222",
            slug: "gold-standard-whey-off-748927022650",
            displayName: candidate.displayName,
            reviewStatus: "pending_review",
            planEligible: false,
          },
          201,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const onSearchChange = vi.fn();
    const onCatalogChanged = vi.fn(async () => undefined);

    function Harness() {
      const [search, setSearch] = useState("");
      return (
        <FoodSearchPicker
          foods={[localFood]}
          search={search}
          onSearchChange={(value) => {
            onSearchChange(value);
            setSearch(value);
          }}
          onAdd={vi.fn()}
          onCatalogChanged={onCatalogChanged}
        />
      );
    }

    render(<Harness />);
    await user.type(
      screen.getByRole("textbox", { name: "Search foods" }),
      "Whey",
    );

    expect(screen.getByText("Local Whey Protein")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Search online by food or product name",
      }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Search online by name" }),
    );

    await screen.findByText(candidate.displayName);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      action: "search_open_food_facts",
      query: "Whey",
    });
    expect(screen.getByText("Local Whey Protein")).toBeInTheDocument();
    expect(
      screen.getByText(/nothing is saved until you import one/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Import current record" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      action: "import",
      provider: "open_food_facts",
      externalId: "748927022650",
    });
    expect(
      await screen.findByText(/pending catalog review/i),
    ).toBeInTheDocument();
  });

  it("keeps USDA name search available when Open Food Facts is unavailable", async () => {
    const user = userEvent.setup();
    const usdaCandidate = {
      ...candidate,
      provider: "usda_fdc" as const,
      externalId: "2464134",
      dataType: "Branded",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: null,
            error: {
              message:
                "The external food source is temporarily unavailable.",
            },
          }),
          {
            status: 503,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({ kind: "candidates", candidates: [usdaCandidate] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <FoodSearchPicker
        foods={[]}
        search="chocolate whey"
        onSearchChange={vi.fn()}
        onAdd={vi.fn()}
        onCatalogChanged={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Search online by name" }),
    );
    expect(
      await screen.findByText(/select USDA above and search the same name/i),
    ).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Online food source" }),
      "usda_fdc",
    );
    await user.click(
      screen.getByRole("button", { name: "Search online by name" }),
    );

    await screen.findByText(usdaCandidate.displayName);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      action: "search_usda",
      query: "chocolate whey",
    });
  });
});
