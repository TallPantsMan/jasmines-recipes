import React from 'react';
import { X, RotateCcw } from 'lucide-react';
import type { BinItem } from '../services/recycleBin';

interface Props {
  items: BinItem[];
  onRestore: (item: BinItem) => void;
  onClose: () => void;
}

const daysLeft = (deletedAt: string) => Math.max(1, 30 - Math.floor((Date.now() - Date.parse(deletedAt)) / 86400000));

export const RecentlyDeletedModal: React.FC<Props> = ({ items, onRestore, onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-[#FDFBF7] w-full max-w-md max-h-[85vh] rounded-3xl shadow-2xl border border-[#EFE7DE] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0E8DC]">
        <div>
          <h3 className="font-serif text-lg font-bold text-[#221E1B]">Recently deleted</h3>
          <p className="text-[11px] text-[#82786D]">Kept on this device for 30 days</p>
        </div>
        <button onClick={onClose} title="Close" className="p-1.5 rounded-full bg-white border border-gray-200 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="overflow-y-auto p-4 space-y-2.5">
        {items.length === 0 && <p className="text-sm text-[#82786D] text-center py-8">Nothing deleted lately.</p>}
        {items.map((item) => (
          <div key={item.recipe.id} className="flex items-center gap-3 bg-white border border-[#EFE7DE] rounded-2xl p-3">
            {item.recipe.coverImage ? (
              <img src={item.recipe.coverImage} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-[#F7F2EC] shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#221E1B] truncate">{item.recipe.title}</p>
              <p className="text-[11px] text-[#A09587]">{daysLeft(item.deletedAt)} days left</p>
            </div>
            <button
              onClick={() => onRestore(item)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFEFEA] border border-[#FFD5C8] text-[#FF5B26] text-xs font-bold cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restore
            </button>
          </div>
        ))}
      </div>
    </div>
  </div>
);
