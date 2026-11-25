import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border-2 border-[#262423] text-sm font-bold transition-[transform,box-shadow,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#262423] focus-visible:ring-offset-2 focus-visible:ring-offset-[#e4eff5] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        default:
          "bg-[#262423] text-[#f4f9fc] shadow-[3px_3px_0_#8350c4] hover:bg-[#363231]",
        cyan:
          "bg-[#8350c4] text-white shadow-[3px_3px_0_#262423] hover:bg-[#6f3fb0]",
        destructive:
          "bg-[#f4f9fc] text-[#b3261e] shadow-[3px_3px_0_#262423] hover:bg-[#fbe4e0]",
        outline:
          "bg-[#f4f9fc] text-[#262423] shadow-[3px_3px_0_#262423] hover:bg-[#deebf1]",
        secondary:
          "bg-[#e4eff5] text-[#605868] border-dashed border-[#7e7488] shadow-none",
        ghost: "border-transparent hover:bg-secondary hover:border-[#262423]/30",
        link: "border-transparent text-[#6f3fb0] underline-offset-4 hover:underline",
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
