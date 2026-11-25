import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border border-[#1a1813] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[#fbf8ef] text-[#1a1813]",
        secondary: "bg-[#ece5d2] text-[#4a463c]",
        outline: "bg-transparent text-[#1a1813]",
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
