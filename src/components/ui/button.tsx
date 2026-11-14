import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-extrabold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        default:
          "bg-[#092c37] text-white border-2 border-[#092c37] shadow-sm hover:bg-[#144352] hover:-translate-y-0.5",
        cyan:
          "bg-[#02c7ea] text-[#042b36] shadow-[0_8px_20px_rgba(2,199,234,0.25)] hover:bg-[#00b4d6] hover:-translate-y-0.5",
        destructive:
          "bg-white text-[#b43d33] border border-[#f0c1bb] hover:bg-[#fff2ef]",
        outline:
          "border border-[#c7d8df] bg-white text-[#25434d] hover:bg-[#f1f8fa]",
        secondary:
          "bg-[#f1f6f8] text-[#6b838e] border-[1.5px] border-dashed border-[#bfd2da]",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-[#007e9d] underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-[50px] px-6 py-3",
        sm: "min-h-[42px] px-4 py-2 text-xs",
        lg: "min-h-[54px] px-8 py-3.5 text-base",
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
