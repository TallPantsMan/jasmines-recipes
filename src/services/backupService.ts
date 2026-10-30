import type { Recipe } from '../types/recipe';
import { apiFetch } from './auth';

/**
 * Keeps a text copy of every saved recipe in the family Google Sheet, labelled with the device it came from.
 * A copy that can't be sent right now (no signal, sheet not set up yet) waits in a small queue and is retried.
 */

const DEVICE_KEY = 'jasmines_recipes_device_id';
const QUEUE_KEY = 'jasmines_recipes_backup_queue';
const BATCH = 10;
const QUEUE_LIMIT = 200;

const read = (key: string): string => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked: the backup just isn't queued */
  }
};

function deviceName(): string {
  const ua = navigator.userAgent;
  const kind = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser';
  return `${kind} (${browser})`;
}

/** A short random code that stays the same on this device, so each phone or computer is told apart in the sheet. */
export function getDevice(): { id: string; name: string } {
  let id = read(DEVICE_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);
    write(DEVICE_KEY, id);
  }
  return { id, name: `${deviceName()} ${id.slice(0, 4)}` };
}

/** Photos are far too large for a spreadsheet cell, so only the text goes. */
function lightweight(r: Recipe): Recipe {
  return {
    ...r,
    userPhotos: [],
    coverImage: r.coverImage && r.coverImage.startsWith('data:') ? undefined : r.coverImage,
  };
}

function loadQueue(): Recipe[] {
  try {
    const q = JSON.parse(read(QUEUE_KEY) || '[]');
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

const saveQueue = (q: Recipe[]) => write(QUEUE_KEY, JSON.stringify(q.slice(-QUEUE_LIMIT)));

let flushing: Promise<boolean> | null = null;

async function send(recipes: Recipe[]): Promise<'ok' | 'not_configured' | 'failed'> {
  try {
    const res = await apiFetch('/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: getDevice(), recipes }),
    });
    if (res.ok) return 'ok';
    const body = await res.json().catch(() => ({}));
    return body?.code === 'not_configured' ? 'not_configured' : 'failed';
  } catch {
    return 'failed';
  }
}

/** Sends whatever is waiting in the queue. Returns true when nothing is left waiting. */
export function flushBackupQueue(): Promise<boolean> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      let queue = loadQueue();
      while (queue.length > 0) {
        const batch = queue.slice(0, BATCH);
        const outcome = await send(batch);
        if (outcome === 'not_configured') {
          saveQueue([]); // nowhere to send them; "Back up now" in the footer covers the gap once it is set up
          return false;
        }
        if (outcome === 'failed') return false;
        queue = queue.slice(batch.length);
        saveQueue(queue);
      }
      return true;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** Call after a recipe is saved or edited. Never throws and never slows the save down. */
export function backupRecipe(recipe: Recipe): void {
  const queue = loadQueue().filter((r) => r.id !== recipe.id);
  queue.push(lightweight(recipe));
  saveQueue(queue);
  void flushBackupQueue();
}

/** Sends every recipe in the box, for the "Back up now" button. Returns how many were sent. */
export async function backupAll(recipes: Recipe[]): Promise<{ sent: number; ok: boolean; reason?: string }> {
  let sent = 0;
  for (let i = 0; i < recipes.length; i += BATCH) {
    const batch = recipes.slice(i, i + BATCH).map(lightweight);
    const outcome = await send(batch);
    if (outcome !== 'ok') {
      return { sent, ok: false, reason: outcome === 'not_configured' ? 'Backup is not set up on the server yet.' : 'Could not reach the sheet. Try again in a moment.' };
    }
    sent += batch.length;
  }
  return { sent, ok: true };
}
