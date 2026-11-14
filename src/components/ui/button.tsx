import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-extrabold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border-2 border-primary shadow-sm hover:bg-primary/90 hover:-translate-y-0.5",
        cyan:
          "bg-[#008ef8] text-[#212121] shadow-[0_8px_20px_rgba(0,142,248,0.25)] hover:bg-[#38a7fa] hover:-translate-y-0.5",
        destructive:
          "bg-white text-[#931919] border border-[#f8a9a9] hover:bg-[#fdeaea]",
        outline:
          "border border-[#dedede] bg-white text-[#212121] hover:bg-[#f3f3f3]",
        secondary:
          "bg-[#f3f3f3] text-[#626262] border-[1.5px] border-dashed border-[#dedede]",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-[#00589a] underline-offset-4 hover:underline",
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
