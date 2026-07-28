import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/onboarding-flow";

export const metadata: Metadata = { title: "Set up your plan" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; email?: string }>;
}) {
  const params = await searchParams;
  return (
    <OnboardingFlow
      initialStep={Number(params.step ?? 2)}
      email={params.email ?? ""}
    />
  );
}
