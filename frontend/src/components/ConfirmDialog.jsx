import { Loader2 } from 'lucide-react'
import Modal from './Modal'
import ErrorMessage from './ErrorMessage'

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Keep it',
  danger = false,
  busy = false,
  error = '',
  onConfirm,
  onCancel,
}) {
  return (
    <Modal title={title} onClose={busy ? () => {} : onCancel}>
      <p className="text-sm leading-relaxed text-stone-600">{message}</p>
      {error && (
        <div className="mt-4">
          <ErrorMessage message={error} />
        </div>
      )}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={danger ? 'btn-danger' : 'btn-primary'}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
