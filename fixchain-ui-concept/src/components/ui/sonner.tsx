"use client";

import { Toaster as Sonner } from "sonner";

export const Toaster = (props: React.ComponentProps<typeof Sonner>) => {
  return <Sonner {...props} />;
};

export { Sonner as toast };
