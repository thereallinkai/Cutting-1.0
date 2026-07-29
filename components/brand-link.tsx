import Link from "next/link";
import { Leaf } from "lucide-react";
import { BRAND } from "@/src/lib/brand";

export function BrandLink({
  href = "/",
  className = "brand",
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link className={className} href={href} aria-label={`${BRAND.name} home`}>
      <span className="brand-mark" aria-hidden="true">
        <Leaf size={19} strokeWidth={2.25} />
      </span>
      <span>{BRAND.name}</span>
    </Link>
  );
}
