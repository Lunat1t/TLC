import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[50px] w-full rounded-md border-2 border-[#262423] bg-[#f4f9fc] px-4 py-2 text-[15px] text-[#1f1d1c] transition-colors placeholder:text-[#8d8496] focus-visible:border-[#8350c4] focus-visible:bg-white focus-visible:outline-none focus-visible:shadow-[3px_3px_0_#8350c4] disabled:cursor-not-allowed disabled:opacity-50",
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
