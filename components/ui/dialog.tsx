"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type DialogContextValue = { open: boolean; onOpenChange: (open: boolean) => void; };
const DialogContext = React.createContext<DialogContextValue | null>(null);

export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode; }) {
  return <DialogContext.Provider value={{ open, onOpenChange }}>{children}</DialogContext.Provider>;
}

export function DialogContent({ className, children }: { className?: string; children: React.ReactNode; }) {
  const context = React.useContext(DialogContext);
  React.useEffect(() => {
    if (!context?.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") context.onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [context]);

  if (!context?.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => context.onOpenChange(false)}>
      <div className={cn("max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-border bg-zinc-950 p-6 shadow-2xl", className)} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("mb-4 space-y-2", className)} {...props} />; }
export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) { return <h2 className={cn("text-xl font-semibold", className)} {...props} />; }
export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) { return <p className={cn("text-sm text-muted", className)} {...props} />; }
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("mt-6 flex flex-wrap justify-end gap-2", className)} {...props} />; }
