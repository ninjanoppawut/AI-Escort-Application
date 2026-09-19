// P14-01 device store (OBS-009, SYSTEM_ARCHITECTURE §15): IndexedDB keeps
// unsent images, typed drafts, and queued actions through refresh, offline
// use, and browser restart. Everything here is per device and never the
// authority; the server read models stay authoritative after sync.

export const LOCAL_DB_NAME = "ai-escort-field";
export const LOCAL_DB_VERSION = 1;

/** Object stores, each keyed by `key` with a `scope` index (e.g. observation). */
export const LOCAL_STORES = ["uploads", "drafts", "outbox"] as const;
export type LocalStoreName = (typeof LOCAL_STORES)[number];

export interface LocalRecord<T> {
  key: string;
  /** What the record belongs to, e.g. an observation or a session ID. */
  scope: string;
  /** Owner of the record on a shared device; records never cross users. */
  userId: string;
  updatedAt: number;
  value: T;
}

let opening: Promise<IDBDatabase> | null = null;

function request<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

export function localStoreAvailable() {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      for (const name of LOCAL_STORES) {
        if (!database.objectStoreNames.contains(name)) {
          const store = database.createObjectStore(name, { keyPath: "key" });
          store.createIndex("scope", ["userId", "scope"]);
          store.createIndex("user", "userId");
        }
      }
    };
    req.onsuccess = () => {
      const database = req.result;
      // Another tab upgrading closes this connection; reopen on next use.
      database.onversionchange = () => {
        database.close();
        opening = null;
      };
      resolve(database);
    };
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

/** Test hook: forget the cached connection. */
export function resetLocalStoreForTests() {
  opening = null;
}

export async function putLocal<T>(
  storeName: LocalStoreName,
  record: LocalRecord<T>,
) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(record);
  await transactionDone(transaction);
}

export async function getLocal<T>(
  storeName: LocalStoreName,
  key: string,
  userId: string,
): Promise<LocalRecord<T> | null> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const record = (await request(
    transaction.objectStore(storeName).get(key),
  )) as LocalRecord<T> | undefined;
  return record && record.userId === userId ? record : null;
}

export async function listLocal<T>(
  storeName: LocalStoreName,
  userId: string,
  scope?: string,
): Promise<LocalRecord<T>[]> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  const records =
    scope === undefined
      ? await request(store.index("user").getAll(userId))
      : await request(store.index("scope").getAll([userId, scope]));
  return (records as LocalRecord<T>[]).sort(
    (a, b) => a.updatedAt - b.updatedAt || a.key.localeCompare(b.key),
  );
}

export async function deleteLocal(storeName: LocalStoreName, key: string) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(key);
  await transactionDone(transaction);
}

/** Removes every record of one user, e.g. on sign-out from a shared device. */
export async function clearLocalForUser(userId: string) {
  const database = await openDatabase();
  const transaction = database.transaction([...LOCAL_STORES], "readwrite");
  for (const name of LOCAL_STORES) {
    const store = transaction.objectStore(name);
    const keys = await request(store.index("user").getAllKeys(userId));
    for (const key of keys) store.delete(key);
  }
  await transactionDone(transaction);
}
