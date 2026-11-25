import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border-2 border-[#1d1b1a] text-sm font-bold transition-[transform,box-shadow,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1b1a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#ecdcc1] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        default:
          "bg-[#1d1b1a] text-[#f8eedb] shadow-[3px_3px_0_#d12f20] hover:bg-[#363231]",
        cyan:
          "bg-[#d12f20] text-white shadow-[3px_3px_0_#1d1b1a] hover:bg-[#a8211a]",
        destructive:
          "bg-[#f8eedb] text-[#b3261e] shadow-[3px_3px_0_#1d1b1a] hover:bg-[#fbe4e0]",
        outline:
          "bg-[#f8eedb] text-[#1d1b1a] shadow-[3px_3px_0_#1d1b1a] hover:bg-[#f4ebdb]",
        secondary:
          "bg-[#ecdcc1] text-[#686158] border-dashed border-[#888074] shadow-none",
        ghost: "border-transparent hover:bg-secondary hover:border-[#1d1b1a]/30",
        link: "border-transparent text-[#a8211a] underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-[48px] px-5 py-3",
        sm: "min-h-[42px] px-4 py-2 text-xs",
        lg: "min-h-[54px] px-7 py-3.5 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
