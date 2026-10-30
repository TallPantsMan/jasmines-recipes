import { apiFetch } from './auth';
import { RecipeService } from './recipeService';
import type { Recipe } from '../types/recipe';
import type { ProfileName } from './profile';

/**
 * Keeps this device's recipes and the profile's cloud copy the same.
 * Whichever side saved a recipe most recently wins; deleted recipes are remembered so they stay deleted everywhere.
 */

const BATCH_CHARS = 2_500_000; // stays well under the 4.5 MB request limit
const GET_BATCH = 5;

const tombstoneKey = (profile: string) => `jasmines_recipes_deleted_${profile}`;

type Tombstones = Record<string, string>; // recipe id -> when it was deleted

function readTombstones(profile: string): Tombstones {
  try {
    return JSON.parse(localStorage.getItem(tombstoneKey(profile)) || '{}') || {};
  } catch {
    return {};
  }
}

function writeTombstones(profile: string, t: Tombstones) {
  try {
    localStorage.setItem(tombstoneKey(profile), JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

/** Called whenever a recipe is deleted on this device. */
export function rememberDeletion(profile: string | null, id: string) {
  if (!profile) return;
  const t = readTombstones(profile);
  t[id] = new Date().toISOString();
  writeTombstones(profile, t);
}

async function call(profile: ProfileName, payload: Record<string, unknown>): Promise<any> {
  const res = await apiFetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, ...payload }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Sync answered ${res.status}`);
  return data;
}

export interface SyncResult {
  /** True when recipes on this device changed because of the sync */
  changed: boolean;
}

let running: Promise<SyncResult> | null = null;

/** Runs one sync at a time; asking again while one is running just waits for it. */
export function syncProfile(profile: ProfileName): Promise<SyncResult> {
  if (!running) {
    running = doSync(profile).finally(() => {
      running = null;
    });
  }
  return running;
}

async function doSync(profile: ProfileName): Promise<SyncResult> {
  const { items } = (await call(profile, { action: 'index' })) as {
    items: Array<{ id: string; updatedAt: string; deleted: boolean }>;
  };
  const remote = new Map(items.map((i) => [i.id, i]));
  const local = await RecipeService.getAllRecipes();
  const localById = new Map(local.map((r) => [r.id, r]));
  const tombstones = readTombstones(profile);
  const time = (s?: string) => (s ? Date.parse(s) || 0 : 0);

  const toPull: string[] = [];
  const toDeleteLocally: string[] = [];
  const toPush: Recipe[] = [];
  const deletedToPush: Array<{ id: string; updatedAt: string }> = [];

  // What the cloud knows about
  for (const [id, r] of remote) {
    const mine = localById.get(id);
    if (r.deleted) {
      if (mine && time(mine.updatedAt) > time(r.updatedAt)) toPush.push(mine); // edited after the delete: bring it back
      else if (mine) toDeleteLocally.push(id);
      continue;
    }
    const gone = tombstones[id];
    if (gone && time(gone) >= time(r.updatedAt)) {
      deletedToPush.push({ id, updatedAt: gone });
      continue;
    }
    if (!mine) toPull.push(id);
    else if (time(r.updatedAt) > time(mine.updatedAt)) toPull.push(id);
    else if (time(mine.updatedAt) > time(r.updatedAt)) toPush.push(mine);
  }

  // What only this device knows about
  for (const mine of local) if (!remote.has(mine.id)) toPush.push(mine);
  for (const id of Object.keys(tombstones)) {
    if (!remote.has(id) && !localById.has(id)) deletedToPush.push({ id, updatedAt: tombstones[id] });
  }

  // Cloud to device
  const pulled: Recipe[] = [];
  for (let i = 0; i < toPull.length; i += GET_BATCH) {
    const data = await call(profile, { action: 'get', ids: toPull.slice(i, i + GET_BATCH) });
    pulled.push(...(data.recipes as Recipe[]));
  }
  if (pulled.length || toDeleteLocally.length) {
    await RecipeService.applyRemote(pulled, toDeleteLocally);
  }

  // Device to cloud, in batches that fit in one request
  let batch: Recipe[] = [];
  let size = 0;
  const flush = async (deleted: Array<{ id: string; updatedAt: string }> = []) => {
    if (!batch.length && !deleted.length) return;
    await call(profile, { action: 'put', recipes: batch, deleted });
    batch = [];
    size = 0;
  };
  for (const r of toPush) {
    const len = JSON.stringify(r).length;
    if (batch.length && size + len > BATCH_CHARS) await flush();
    batch.push(r);
    size += len;
  }
  await flush(deletedToPush);

  return { changed: pulled.length > 0 || toDeleteLocally.length > 0 };
}
