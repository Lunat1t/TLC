import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[50px] w-full rounded-2xl border-2 border-[var(--bs-line)] bg-[var(--bs-card)] px-4 py-2 text-[15px] font-semibold text-[var(--bs-text)] transition-colors placeholder:font-medium placeholder:text-[#a08a6e] focus-visible:border-[var(--bs-action)] focus-visible:outline-none focus-visible:shadow-[0_3px_0_var(--bs-lip-action)] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
