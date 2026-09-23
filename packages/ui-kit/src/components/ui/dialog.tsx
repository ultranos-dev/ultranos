"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { X } from "../../icons.js"

import { cn } from "../../lib/utils.js"

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-foreground/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  hideClose = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { hideClose?: boolean }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-[50%] left-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-3xl bg-popover p-6 mx-4 shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      >
        {children}
        {/* Built-in floating close — suppressed when the dialog supplies its own
            header/close (e.g. a ModalHeader). */}
        {hideClose ? null : (
          <DialogPrimitive.Close className="absolute top-4 right-4 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("space-y-1.5", className)}
      {...props}
    />
  )
}

/**
 * ModalHeader — the shared title bar for modals across the ecosystem.
 *
 * Renders a sticky header with a tone-driven background and a close button.
 * `tone="primary"` (default) is the app-default green used for neutral / detail /
 * form modals. `tone="destructive"` keeps dangerous actions (delete, revoke,
 * dispose) red; `tone="plain"` is a bordered neutral header. Colored tones use
 * their `*-foreground` token for the title + a translucent hover on the close
 * button. Works with both radix Dialog modals and bespoke `fixed inset-0` modals.
 */
type ModalHeaderTone = "primary" | "destructive" | "plain"

const MODAL_HEADER_TONE: Record<ModalHeaderTone, string> = {
  primary: "bg-primary text-primary-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  plain: "border-b border-border bg-card text-foreground",
}

function ModalHeader({
  title,
  onClose,
  closeLabel = "Close",
  tone = "primary",
  titleId,
  inset = false,
  dialog = false,
  className,
  children,
}: {
  title: React.ReactNode
  onClose?: () => void
  closeLabel?: string
  tone?: ModalHeaderTone
  /** id for the <h2>, so the dialog can reference it via aria-labelledby. */
  titleId?: string
  /**
   * Set when the modal container has its OWN padding (e.g. `p-6`). Breaks the
   * header out to full-bleed with negative margins and inherits the container's
   * corner radius, so a padded modal gets the same full-width header bar without
   * restructuring its body. Assumes `p-6` padding.
   */
  inset?: boolean
  /**
   * Rendered INSIDE a ui-kit radix `Dialog`: the title becomes a `DialogTitle`
   * (satisfies radix's a11y requirement) and the close button a `DialogClose`
   * (closes with no handler). Pair with `hideClose` on `DialogContent`.
   */
  dialog?: boolean
  className?: string
  /** Optional extra controls rendered before the close button. */
  children?: React.ReactNode
}) {
  const colored = tone !== "plain"
  const closeClasses = cn(
    "rounded p-1 transition-colors focus:outline-none focus-visible:ring-2",
    colored
      ? "text-current hover:bg-white/20 focus-visible:ring-white/70"
      : "text-muted-foreground hover:bg-muted focus-visible:ring-ring",
  )
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-6 py-4",
        inset
          ? "-mx-6 -mt-6 mb-4 [border-top-left-radius:inherit] [border-top-right-radius:inherit]"
          : "sticky top-0 z-10",
        MODAL_HEADER_TONE[tone],
        className,
      )}
    >
      {dialog ? (
        <DialogPrimitive.Title id={titleId} className="text-lg font-semibold">
          {title}
        </DialogPrimitive.Title>
      ) : (
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
      )}
      <div className="flex items-center gap-2">
        {children}
        {dialog ? (
          <DialogPrimitive.Close data-slot="modal-header-close" aria-label={closeLabel} className={closeClasses}>
            <X className="h-5 w-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        ) : onClose ? (
          <button data-slot="modal-header-close" type="button" onClick={onClose} aria-label={closeLabel} className={closeClasses}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("mt-6 flex justify-end gap-3", className)}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  ModalHeader,
}
