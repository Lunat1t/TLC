import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-extrabold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[var(--bs-tint)] text-[var(--bs-text)]",
        secondary: "bg-[var(--bs-reward)] text-[var(--bs-on-reward)]",
        success: "bg-[#dcf1d2] text-[#21421a]",
        accent: "bg-[var(--bs-action)] text-[var(--bs-on-action)]",
        outline: "border-2 border-[var(--bs-line)] bg-transparent text-[var(--bs-text)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
