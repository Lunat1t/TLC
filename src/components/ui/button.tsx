import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-extrabold transition-[transform,box-shadow,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bs-text)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bs-bg)] active:translate-y-[3px] active:shadow-none disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--bs-action)] text-[var(--bs-on-action)] shadow-[0_4px_0_var(--bs-lip-action)] hover:brightness-105",
        cyan:
          "bg-[var(--bs-reward)] text-[var(--bs-on-reward)] shadow-[0_4px_0_var(--bs-lip-reward)] hover:brightness-105",
        destructive:
          "bg-[var(--bs-danger-bg)] text-[var(--bs-danger)] shadow-[0_4px_0_#f2c4b6] hover:brightness-[.98]",
        outline:
          "border-2 border-[var(--bs-line)] bg-[var(--bs-card)] text-[var(--bs-text)] shadow-[0_4px_0_var(--bs-lip)] hover:bg-[var(--bs-tint)]",
        secondary:
          "bg-[var(--bs-tint)] text-[var(--bs-muted)] shadow-none hover:bg-[var(--bs-line)]",
        ghost: "text-[var(--bs-text)] hover:bg-[var(--bs-tint)]",
        link: "rounded-md text-[var(--bs-deep)] underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-[48px] px-6 py-3",
        sm: "min-h-[42px] px-4 py-2 text-xs",
        lg: "min-h-[54px] px-8 py-3.5 text-base",
        icon: "h-11 w-11",
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
