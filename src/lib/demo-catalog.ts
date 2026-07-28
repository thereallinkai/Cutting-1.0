export type DemoCatalogFood = {
  slug: string;
  englishName: string;
  categories: string[];
  verificationStatus: "verified" | "pending_verification";
};

export const DEMO_CATALOG: DemoCatalogFood[] = [
  { slug: "rolled-oats", englishName: "Rolled oats", categories: ["Carbohydrate", "Protein"], verificationStatus: "verified" },
  { slug: "white-rice", englishName: "White rice", categories: ["Carbohydrate"], verificationStatus: "verified" },
  { slug: "brown-rice", englishName: "Brown rice", categories: ["Carbohydrate"], verificationStatus: "verified" },
  { slug: "potatoes", englishName: "Potatoes", categories: ["Carbohydrate", "Vegetable"], verificationStatus: "verified" },
  { slug: "sweet-potatoes", englishName: "Sweet potatoes", categories: ["Carbohydrate", "Vegetable"], verificationStatus: "verified" },
  { slug: "whole-grain-bread", englishName: "Whole-grain bread", categories: ["Carbohydrate"], verificationStatus: "pending_verification" },
  { slug: "eggs", englishName: "Eggs", categories: ["Protein", "Fat"], verificationStatus: "verified" },
  { slug: "milk", englishName: "Milk", categories: ["Protein", "Carbohydrate", "Dairy"], verificationStatus: "pending_verification" },
  { slug: "yogurt", englishName: "Yogurt", categories: ["Protein", "Carbohydrate", "Dairy"], verificationStatus: "pending_verification" },
  { slug: "lean-beef", englishName: "Lean beef", categories: ["Protein", "Fat"], verificationStatus: "pending_verification" },
  { slug: "pork", englishName: "Pork", categories: ["Protein", "Fat"], verificationStatus: "pending_verification" },
  { slug: "chicken-breast", englishName: "Chicken breast", categories: ["Protein"], verificationStatus: "verified" },
  { slug: "fish", englishName: "Fish", categories: ["Protein", "Fat"], verificationStatus: "pending_verification" },
  { slug: "shrimp", englishName: "Shrimp", categories: ["Protein"], verificationStatus: "pending_verification" },
  { slug: "tofu", englishName: "Tofu", categories: ["Protein", "Fat"], verificationStatus: "verified" },
  { slug: "broccoli", englishName: "Broccoli", categories: ["Vegetable"], verificationStatus: "verified" },
  { slug: "spinach", englishName: "Spinach", categories: ["Vegetable"], verificationStatus: "verified" },
  { slug: "water-spinach", englishName: "Water spinach", categories: ["Vegetable"], verificationStatus: "pending_verification" },
  { slug: "lettuce", englishName: "Lettuce", categories: ["Vegetable"], verificationStatus: "verified" },
  { slug: "carrots", englishName: "Carrots", categories: ["Vegetable", "Carbohydrate"], verificationStatus: "verified" },
  { slug: "tomatoes", englishName: "Tomatoes", categories: ["Vegetable", "Fruit"], verificationStatus: "verified" },
  { slug: "strawberries", englishName: "Strawberries", categories: ["Fruit", "Carbohydrate"], verificationStatus: "verified" },
  { slug: "blueberries", englishName: "Blueberries", categories: ["Fruit", "Carbohydrate"], verificationStatus: "verified" },
  { slug: "bananas", englishName: "Bananas", categories: ["Fruit", "Carbohydrate"], verificationStatus: "verified" },
  { slug: "apples", englishName: "Apples", categories: ["Fruit", "Carbohydrate"], verificationStatus: "verified" },
  { slug: "olive-oil", englishName: "Olive oil", categories: ["Fat"], verificationStatus: "verified" },
  { slug: "whey-protein-isolate", englishName: "Whey protein isolate", categories: ["Protein", "Supplement"], verificationStatus: "pending_verification" },
  { slug: "vegetable-vitamin-powder", englishName: "Vegetable or vitamin powder", categories: ["Supplement"], verificationStatus: "pending_verification" },
];
