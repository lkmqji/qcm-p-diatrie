// ============================================================================
// Utilitaires UI Non-Bloquants (Toasts, Modales de Confirmation, Icônes, Confetti)
// ============================================================================

export function refreshLucide(container = null) {
  if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
    if (container && (container instanceof Element || container instanceof DocumentFragment)) {
      window.lucide.createIcons({ root: container });
    } else {
      window.lucide.createIcons();
    }
  }
}

export function triggerMasteryConfetti() {
  if (typeof window !== 'undefined' && typeof window.confetti === 'function') {
    window.confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
  }
}

export function showAppToast(message, optionsOrUndo = null, undoLabel = 'Annuler', durationMs = 4500) {
  if (typeof document === 'undefined' || !document.body) return;

  const existing = document.getElementById('pedia-toast-alert');
  if (existing) existing.remove();

  let onUndo = null;
  let effectiveUndoLabel = undoLabel;
  let effectiveDuration = durationMs;
  let toastType = 'info';

  if (typeof optionsOrUndo === 'function') {
    onUndo = optionsOrUndo;
  } else if (optionsOrUndo && typeof optionsOrUndo === 'object') {
    toastType = optionsOrUndo.type || 'info';
    if (typeof optionsOrUndo.onUndo === 'function') onUndo = optionsOrUndo.onUndo;
    if (optionsOrUndo.undoLabel) effectiveUndoLabel = optionsOrUndo.undoLabel;
    if (typeof optionsOrUndo.durationMs === 'number') effectiveDuration = optionsOrUndo.durationMs;
  }

  const toast = document.createElement('div');
  toast.id = 'pedia-toast-alert';
  toast.className = 'pedia-toast-alert';
  if (toastType && toastType !== 'info') {
    toast.classList.add(`is-${toastType}`);
  }

  let dismissTimer = null;

  if (onUndo) {
    const wrap = document.createElement('div');
    wrap.className = 'toast-content';

    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    wrap.appendChild(textSpan);

    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'toast-undo-btn';
    undoBtn.textContent = effectiveUndoLabel;
    undoBtn.onclick = () => {
      if (dismissTimer) clearTimeout(dismissTimer);
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 250);
      onUndo();
    };
    wrap.appendChild(undoBtn);
    toast.appendChild(wrap);
  } else {
    toast.textContent = message;
  }

  document.body.appendChild(toast);

  const scheduleFrame = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => setTimeout(cb, 16);

  scheduleFrame(() => {
    toast.classList.add('show');
  });

  dismissTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, effectiveDuration);
}

let activeConfirmResolver = null;

export function resolvePendingConfirmModal(accepted = false) {
  const modal = typeof document !== 'undefined' ? document.getElementById('modal-app-confirm') : null;
  if (modal) modal.style.display = 'none';
  if (typeof activeConfirmResolver === 'function') {
    const resolve = activeConfirmResolver;
    activeConfirmResolver = null;
    resolve(!!accepted);
  }
}

export function showConfirmModal({
  title = 'Confirmation',
  message = '',
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  isDanger = false
} = {}) {
  if (typeof document === 'undefined') return Promise.resolve(false);

  const modal = document.getElementById('modal-app-confirm');
  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-message');
  const okBtn = document.getElementById('btn-confirm-modal-ok');
  const cancelBtn = document.getElementById('btn-confirm-modal-cancel');
  const closeBtn = document.getElementById('btn-close-confirm-modal');

  if (!modal || !okBtn || !cancelBtn) {
    return Promise.resolve(false);
  }

  // Cancel any prior pending confirmation cleanly
  if (activeConfirmResolver) {
    resolvePendingConfirmModal(false);
  }

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  okBtn.textContent = confirmLabel;
  cancelBtn.textContent = cancelLabel;
  okBtn.classList.toggle('is-danger', !!isDanger);

  modal.style.display = 'flex';
  refreshLucide(modal);

  return new Promise((resolve) => {
    activeConfirmResolver = resolve;

    okBtn.onclick = () => resolvePendingConfirmModal(true);
    cancelBtn.onclick = () => resolvePendingConfirmModal(false);
    if (closeBtn) closeBtn.onclick = () => resolvePendingConfirmModal(false);
    modal.onclick = (e) => {
      if (e.target === modal) resolvePendingConfirmModal(false);
    };
  });
}
