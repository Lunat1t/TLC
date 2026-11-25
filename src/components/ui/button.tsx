import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border-2 border-[#1a1813] text-sm font-bold transition-[transform,box-shadow,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1813] focus-visible:ring-offset-2 focus-visible:ring-offset-[#ece5d2] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        default:
          "bg-[#1a1813] text-[#fbf8ef] shadow-[3px_3px_0_#d62718] hover:bg-[#33302a]",
        cyan:
          "bg-[#d62718] text-white shadow-[3px_3px_0_#1a1813] hover:bg-[#bf2114]",
        destructive:
          "bg-[#fbf8ef] text-[#a81d12] shadow-[3px_3px_0_#1a1813] hover:bg-[#f6e3dc]",
        outline:
          "bg-[#fbf8ef] text-[#1a1813] shadow-[3px_3px_0_#1a1813] hover:bg-[#f3eddc]",
        secondary:
          "bg-[#ece5d2] text-[#6b6455] border-dashed border-[#8a8372] shadow-none",
        ghost: "border-transparent hover:bg-secondary hover:border-[#1a1813]/30",
        link: "border-transparent text-[#a81d12] underline-offset-4 hover:underline",
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
