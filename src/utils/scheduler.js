/**
 * Scheduling primitives for the email queue and lifecycle automations.
 *
 * The email queue uses sortable keys `q:{epochMs}:{rand}` so a single
 * `kv.list({ prefix: "q:" })` walks items in dispatch order.
 */

import { pad, newId, listAllKeys } from "./helpers.js";

const QUEUE_PREFIX = "q:";

export function buildQueueKey(dueAtMs) {
  return `${QUEUE_PREFIX}${pad(dueAtMs)}:${newId()}`;
}

export function parseQueueKey(key) {
  const m = key.match(/^q:(\d+):/);
  return m ? Number(m[1]) : null;
}

/**
 * Enqueue a job to fire at (or after) `dueAtMs`.
 * Payload shape: { type, data }
 */
export async function enqueue(kv, dueAtMs, payload) {
  const key = buildQueueKey(dueAtMs);
  await kv.put(key, JSON.stringify(payload));
  return key;
}

/**
 * Pull all jobs whose dueAt <= now. Workers KV doesn't support range queries,
 * but lexicographic ordering on padded epoch ms works because we list+filter.
 *
 * Cap defaults to 100/cycle to stay well within Worker CPU budgets.
 */
export async function drainDueJobs(kv, { now = Date.now(), max = 100 } = {}) {
  const all = await listAllKeys(kv, QUEUE_PREFIX);
  const due = [];
  for (const k of all) {
    const t = parseQueueKey(k.name);
    if (t === null) continue;
    if (t <= now) due.push(k.name);
    if (due.length >= max) break;
  }

  const jobs = [];
  for (const key of due) {
    const value = await kv.get(key, "json");
    if (value) jobs.push({ key, payload: value });
  }
  return jobs;
}

export async function ackJob(kv, key) {
  await kv.delete(key);
}
