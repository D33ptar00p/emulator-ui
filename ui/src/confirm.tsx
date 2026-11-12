import { ReactNode, useEffect, useRef, useSyncExternalStore } from "react";

/** Promise-based confirmation modal: `if (await confirmDialog({...})) doIt()`. Replaces window.confirm. */
export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  /** Optional monospace block, e.g. the operation input about to be sent. */
  details?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  pending?.resolve(false); // only one dialog at a time; a new one cancels the old
  return new Promise((resolve) => {
    pending = { ...options, resolve };
    emit();
  });
}

function settle(ok: boolean): void {
  const current = pending;
  pending = null;
  emit();
  current?.resolve(ok);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Mount once (in App). Renders the active dialog over a dimmed backdrop. */
export function ConfirmHost() {
  const dialog = useSyncExternalStore(subscribe, () => pending, () => null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!dialog) return;
    // Destructive dialogs focus Cancel so a stray Enter doesn't delete anything.
    (dialog.danger ? cancelRef : confirmRef).current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // lock page scroll behind the modal
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
      if (e.key === "Tab") {
        // keep focus inside the dialog
        const order = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
        const i = order.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        order[(i + (e.shiftKey ? -1 : 1) + order.length) % order.length]?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [dialog]);

  if (!dialog) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && settle(false)}>
      <div className={`modal ${dialog.danger ? "danger" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="modal-head">
          {dialog.danger && (
            <span className="modal-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2 1 21h22L12 2Zm1 15h-2v-2h2v2Zm0-4h-2V9h2v4Z" /></svg>
            </span>
          )}
          <h2 id="confirm-title">{dialog.title}</h2>
        </div>
        {dialog.message && <div className="modal-body">{dialog.message}</div>}
        {dialog.details && <pre className="json modal-details">{dialog.details}</pre>}
        <div className="modal-actions">
          <button ref={cancelRef} className="btn secondary" onClick={() => settle(false)}>
            {dialog.cancelLabel ?? "Cancel"}
          </button>
          <button ref={confirmRef} className={`btn ${dialog.danger ? "danger-solid" : ""}`} onClick={() => settle(true)}>
            {dialog.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
