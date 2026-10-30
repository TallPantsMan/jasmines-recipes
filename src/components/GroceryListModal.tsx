import React, { useState } from 'react';
import { X, Check, Copy } from 'lucide-react';
import { listGrocery, toggleGrocery, clearCheckedGrocery, clearAllGrocery } from '../services/groceryList';
import { notify } from '../services/dialog';

export const GroceryListModal: React.FC<{ profile: string; onClose: () => void; onChange: () => void }> = ({ profile, onClose, onChange }) => {
  const [items, setItems] = useState(() => listGrocery(profile));
  const update = (next: typeof items) => { setItems(next); onChange(); };

  const copy = async () => {
    const text = items.filter((i) => !i.checked).map((i) => `- ${i.text}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notify('Copied. Paste it into Notes or a message.');
    } catch {
      notify(text || 'Nothing to copy.');
    }
  };

  const groups = Array.from(new Set(items.map((i) => i.from)));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#FDFBF7] w-full max-w-md max-h-[85vh] rounded-3xl shadow-2xl border border-[#EFE7DE] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0E8DC]">
          <h3 className="font-serif text-lg font-bold text-[#221E1B]">Grocery list</h3>
          <button onClick={onClose} title="Close" className="p-1.5 rounded-full bg-white border border-gray-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-4">
          {items.length === 0 && <p className="text-sm text-[#82786D] text-center py-8">Your list is empty. Open a recipe and tap "Add to grocery list".</p>}
          {groups.map((from) => (
            <div key={from}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#A09587] mb-1.5">{from}</p>
              <div className="space-y-1">
                {items.filter((i) => i.from === from).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => update(toggleGrocery(profile, item.id))}
                    className={`flex items-start gap-3 p-2.5 rounded-2xl cursor-pointer select-none text-sm ${item.checked ? 'text-[#A69C8F] line-through bg-[#F7F2EB]' : 'text-[#2C2620] bg-white border border-[#EFE7DE]'}`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${item.checked ? 'bg-[#FF5B26] border-[#FF5B26] text-white' : 'border-[#CFC5B8]'}`}>
                      {item.checked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span className="leading-snug">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {items.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[#F0E8DC] text-xs font-bold">
            <button onClick={copy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FFEFEA] border border-[#FFD5C8] text-[#FF5B26] cursor-pointer">
              <Copy className="w-3.5 h-3.5" /> Copy list
            </button>
            <div className="flex gap-3 text-[#82786D]">
              <button onClick={() => update(clearCheckedGrocery(profile))} className="cursor-pointer hover:text-[#FF5B26]">Clear checked</button>
              <button onClick={() => update(clearAllGrocery(profile))} className="cursor-pointer hover:text-[#FF5B26]">Clear all</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
