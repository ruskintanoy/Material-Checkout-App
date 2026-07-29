import { useEffect, useRef, type ReactNode } from 'react';
import { Check } from 'lucide-react';

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  actions: ReactNode;
  onClose?: () => void;
  tone?: 'default' | 'success';
}

export function Dialog({
  open,
  title,
  description,
  children,
  actions,
  onClose,
  tone = 'default',
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog dialog--${tone}`}
      onCancel={(event) => {
        if (!onClose) event.preventDefault();
        else onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current && onClose) onClose();
      }}
    >
      <div className="dialog__surface">
        {tone === 'success' && (
          <div className="success-mark" aria-hidden="true">
            <Check />
          </div>
        )}
        <h2>{title}</h2>
        {description && <p className="dialog__description">{description}</p>}
        {children}
        <div className="dialog__actions">{actions}</div>
      </div>
    </dialog>
  );
}
