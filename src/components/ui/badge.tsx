import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border border-[#262423] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[#f4f9fc] text-[#262423]",
        secondary: "bg-[#7392b5] text-[#262423]",
        success: "bg-[#c9e0eb] text-[#262423]",
        accent: "bg-[#8350c4] text-white",
        outline: "bg-transparent text-[#262423]",
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
