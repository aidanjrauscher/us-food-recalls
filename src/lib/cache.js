// Persistent client-side cache for the merged recall payload so repeat visits
// don't re-download and re-normalize both APIs every time.
//
// IndexedDB (not localStorage): structured clone round-trips the Date objects on
// every record and on sources[].oldest/newest with no manual reserialization,
// and the ~21k normalized records are far larger than the localStorage quota.

const DB_NAME = 'us-food-recalls'
const STORE = 'kv'
const KEY = 'recalls'

// Bump when the normalized record shape changes so stale caches are ignored.
export const CACHE_VERSION = 1

export const TTL_MS = 60 * 60 * 1000 // 1h — under this, serve cache, no network
export const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000 // over this, block on a fresh fetch

function openDb() {
  return new Promise((resolve, reject) => {
    let req
    try {
      req = indexedDB.open(DB_NAME, 1)
    } catch (err) {
      reject(err)
      return
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('indexeddb blocked'))
  })
}

/**
 * @returns {Promise<{records: object[], sources: object[], fetchedAt: number} | null>}
 * null on a miss, a version mismatch, an empty/corrupt entry, or any failure
 * (private mode, storage disabled, …) — callers then just fetch fresh.
 */
export async function readCache() {
  try {
    const db = await openDb()
    const entry = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()

    if (
      !entry ||
      entry.version !== CACHE_VERSION ||
      !Array.isArray(entry.records) ||
      !entry.records.length ||
      !Array.isArray(entry.sources) ||
      typeof entry.fetchedAt !== 'number'
    ) {
      return null
    }
    return { records: entry.records, sources: entry.sources, fetchedAt: entry.fetchedAt }
  } catch {
    return null
  }
}

/** Store a payload with a fresh timestamp. Silently no-ops on any failure. */
export async function writeCache({ records, sources }) {
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(
        { version: CACHE_VERSION, fetchedAt: Date.now(), records, sources },
        KEY,
      )
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    db.close()
  } catch {
    /* private mode / quota / unsupported — fine, we just fetch next time */
  }
}
