import * as React from "react";
import { cn } from "@/src/lib/utils";

export function Input({
  className,
  type,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex min-h-12 w-full rounded-xl border border-[#bfc3ba] bg-white/70 px-3 py-2 text-base outline-none transition-colors placeholder:text-[#65706d] focus-visible:border-[#657532] focus-visible:ring-2 focus-visible:ring-[#657532]/20 disabled:cursor-not-allowed disabled:opacity-55",
        className,
      )}
      {...props}
    />
  );
}
