import React, { useEffect, useState } from 'react';
import { setDialogHost, type DialogRequest } from '../services/dialog';

/** Shows the messages and questions from services/dialog, one at a time. Render it once, near the top of the app. */
export const DialogHost: React.FC = () => {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const current = queue[0];

  useEffect(() => {
    setDialogHost((request) => setQueue((prev) => [...prev, request]));
    return () => setDialogHost(null);
  }, []);

  const answer = (ok: boolean) => {
    current?.resolve(ok);
    setQueue((prev) => prev.slice(1));
  };

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-xs flex items-center justify-center p-6"
      onClick={() => answer(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-[#EFE7DE] p-5 sm:p-6 space-y-5"
      >
        <p className="text-sm text-[#2C2620] leading-relaxed whitespace-pre-line">{current.message}</p>
        <div className="flex justify-end gap-2">
          {current.isQuestion && (
            <button
              onClick={() => answer(false)}
              className="px-4 py-2.5 rounded-2xl border border-[#DFD5C7] bg-white text-xs font-bold text-[#544C42] hover:bg-[#FDFBF7] transition-all cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            autoFocus
            onClick={() => answer(true)}
            className="px-5 py-2.5 rounded-2xl bg-[#FF5B26] hover:bg-[#E84D1B] text-white text-xs font-bold shadow-md shadow-[#FF5B26]/25 transition-all cursor-pointer"
          >
            {current.isQuestion ? current.confirmLabel || 'OK' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};
