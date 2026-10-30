// In-app replacements for alert() and confirm(), shown by <DialogHost /> so messages look like the rest of the app.
// If nothing is showing dialogs (the host isn't mounted), they fall back to the browser's own pop-ups.

export interface DialogRequest {
  message: string;
  confirmLabel?: string;
  /** true shows Cancel + a confirm button; false shows a single OK */
  isQuestion: boolean;
  resolve: (ok: boolean) => void;
}

let show: ((request: DialogRequest) => void) | null = null;

export const setDialogHost = (fn: ((request: DialogRequest) => void) | null) => {
  show = fn;
};

function open(message: string, isQuestion: boolean, confirmLabel?: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) {
      if (isQuestion) resolve(window.confirm(message));
      else {
        window.alert(message);
        resolve(true);
      }
      return;
    }
    show({ message, isQuestion, confirmLabel, resolve });
  });
}

/** Tells the person something; they tap OK. */
export const notify = (message: string): void => {
  void open(message, false);
};

/** Asks a yes/no question; resolves true only when they confirm. */
export const askConfirm = (message: string, confirmLabel = 'OK'): Promise<boolean> => open(message, true, confirmLabel);
