export const CURRENT_PRODUCT_TOUR_VERSION = 2;
export const PRODUCT_TOUR_OPEN_EVENT = "lets-go-green:open-product-tour";
export const PRODUCT_TOUR_REPLAY_REQUEST_KEY =
  "lets-go-green-product-tour-replay-requested-v2";
export const PRODUCT_TOUR_REPLAY_HASH = "#tutorial";
export const PRODUCT_TOUR_SESSION_SKIP_KEY =
  "lets-go-green-product-tour-skipped-v2";

export type ProductTourStep = {
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
};

export const PRODUCT_TOUR_STEPS: readonly ProductTourStep[] = [
  {
    eyebrow: "Welcome",
    title: "A greener, calmer way to plan",
    description:
      "Let's Go Green! keeps what you provide, what the app calculates, and what AI suggests clearly separated.",
    detail:
      "Nothing is silently accepted for you. You stay in control of your meals, profile, and plan versions.",
  },
  {
    eyebrow: "Foods and products",
    title: "Choose the exact food you mean",
    description:
      "Search the saved catalog first, then look up a USDA food or an exact packaged product by barcode. Open its nutrition facts before choosing it.",
    detail:
      "If a packaged product is missing, photograph its Nutrition Facts label and enter what the label says. The photo stays private; a reusable product record is shared only when a barcode identifies it.",
  },
  {
    eyebrow: "Today",
    title: "Record all six eating windows",
    description:
      "Today separates breakfast, morning snack, lunch, afternoon snack, dinner, and evening snack so extra foods have a clear place.",
    detail:
      "You can add or remove foods, mark a main meal eaten, or skip it. A skip reason is optional, and snack windows never force you to record anything.",
  },
  {
    eyebrow: "My Plan",
    title: "Review before you accept",
    description:
      "Generated plans remain drafts until you explicitly accept one. Your current accepted plan stays in place during review.",
    detail:
      "Nutrition totals come from stored, eligible food records rather than invented values.",
  },
  {
    eyebrow: "Calendar and progress",
    title: "Notice patterns without judgment",
    description:
      "Calendar shows daily history, while Progress keeps weight changes and missing data in context.",
    detail:
      "A blank day stays blank. The app does not turn incomplete data into a failure or a zero.",
  },
  {
    eyebrow: "Profile",
    title: "Your preferences, privacy, and controls",
    description:
      "Open your avatar for profile details, device-time-zone controls, tutorial replay, settings, and shopping shortcuts.",
    detail:
      "Nearby-shopping buttons open clearly labeled external map searches. They do not claim that a product is in stock.",
  },
] as const;
