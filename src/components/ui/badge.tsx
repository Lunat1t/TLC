import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border border-[#1d1b1a] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[#f8eedb] text-[#1d1b1a]",
        secondary: "bg-[#f4b04c] text-[#1d1b1a]",
        success: "bg-[#f6e3b8] text-[#1d1b1a]",
        accent: "bg-[#d12f20] text-white",
        outline: "bg-transparent text-[#1d1b1a]",
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
