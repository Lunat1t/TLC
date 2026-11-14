import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[50px] w-full rounded-[14px] border-[1.5px] border-[#dedede] bg-[#e6f4fe] px-4 py-2 text-[15px] text-[#212121] shadow-sm transition-colors placeholder:text-[#929292] focus-visible:border-[#008ef8] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#008ef8]/15 disabled:cursor-not-allowed disabled:opacity-50",
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
