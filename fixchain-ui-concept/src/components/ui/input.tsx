"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    left?: React.ReactNode;
    right?: React.ReactNode;
  }
>(({ className, type, left, right, ...props }, ref) => {
  return (
    <div className="relative flex w-full">
      {left && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center text-muted-foreground">
          {left}
        </div>
      )}
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          left && "pl-10",
          right && "pr-10",
          className,
        )}
        {...props}
        ref={ref}
      />
      {right && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-muted-foreground">
          {right}
        </div>
      )}
    </div>
  );
});
Input.displayName = "Input";

export { Input };
