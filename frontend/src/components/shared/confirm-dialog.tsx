"use client";

import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  confirmDisabled = false,
  cancelDisabled = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmButton = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  const disabledState = useRef({ confirmDisabled, cancelDisabled });

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);
  useEffect(() => {
    disabledState.current = { confirmDisabled, cancelDisabled };
  }, [cancelDisabled, confirmDisabled]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    confirmButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape"
        && !disabledState.current.confirmDisabled
        && !disabledState.current.cancelDisabled
      ) {
        onCancelRef.current();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !cancelDisabled) onCancel();
      }}
    >
      <section
        aria-describedby="confirm-description"
        aria-labelledby="confirm-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
        role="alertdialog"
      >
        <h2 className="text-lg font-semibold" id="confirm-title">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground" id="confirm-description">
          {description}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button disabled={cancelDisabled} onClick={onCancel} variant="outline">Cancel</Button>
          <Button
            disabled={confirmDisabled}
            onClick={onConfirm}
            ref={confirmButton}
            variant="destructive"
          >
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
