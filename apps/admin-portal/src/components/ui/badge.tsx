import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:     "border-transparent bg-primary/10 text-primary",
        secondary:   "border-transparent bg-card text-muted-foreground",
        destructive: "border-transparent bg-destructive/10 text-destructive",
        outline:     "border-border text-foreground",
        success:     "border-transparent bg-success/10 text-success",
        warning:     "border-transparent bg-warning/10 text-warning",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        lg:      "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant,
  size,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
