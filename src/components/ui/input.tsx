import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[50px] w-full rounded-md border-2 border-[#1a1813] bg-[#fffdf8] px-4 py-2 text-[15px] text-[#1d1b17] transition-colors placeholder:text-[#979083] focus-visible:border-[#b79cf5] focus-visible:bg-white focus-visible:outline-none focus-visible:shadow-[3px_3px_0_#b79cf5] disabled:cursor-not-allowed disabled:opacity-50",
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
