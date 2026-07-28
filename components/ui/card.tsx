import * as React from "react";
import { cn } from "@/src/lib/utils";

export function Card({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[#d9d4c8] bg-[#fffdf7] p-5 shadow-[0_18px_54px_rgba(31,47,43,0.09)]",
        className,
      )}
      {...props}
    />
  );
}
