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
        "flex min-h-12 w-full rounded-xl border border-[#bfd4c2] bg-white/75 px-3 py-2 text-base shadow-[0_1px_0_rgba(18,53,36,0.03)] outline-none transition-[border-color,box-shadow,background-color] duration-200 ease-out placeholder:text-[#65706d] hover:border-[#9fc1a6] focus-visible:border-[#2f7d4e] focus-visible:bg-white focus-visible:ring-3 focus-visible:ring-[#2f7d4e]/15 disabled:cursor-not-allowed disabled:bg-[#edf3ec] disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
