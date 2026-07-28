import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/src/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-transparent px-5 py-3 text-sm font-bold transition-[transform,box-shadow,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6e7f29] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55 motion-safe:hover:-translate-y-px",
  {
    variants: {
      variant: {
        default: "bg-[#172523] text-white hover:shadow-lg",
        accent: "bg-[#d9f174] text-[#172523] hover:bg-[#e2f68e]",
        outline:
          "border-[#d9d4c8] bg-transparent text-[#172523] hover:bg-white/60",
        danger:
          "border-[#9b3d35]/35 bg-[#fff8f7] text-[#9b3d35]",
      },
      size: {
        default: "min-h-12",
        sm: "min-h-11 px-4 py-2 text-[0.92rem]",
        icon: "size-11 rounded-full p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  asChild = false,
  className,
  variant,
  size,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
