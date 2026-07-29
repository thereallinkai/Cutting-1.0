import * as React from "react";
import { cn } from "@/src/lib/utils";

export function Card({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "ui-card rounded-2xl border border-[#bfd4c2] bg-[#fbfef9] p-5 shadow-[0_14px_38px_rgba(18,74,44,0.07)] transition-[border-color,box-shadow,transform] duration-200 ease-out",
        className,
      )}
      {...props}
    />
  );
}
