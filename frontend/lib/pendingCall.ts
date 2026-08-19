/**
 * sw.js が保存した「通知タップ時の行き先URL」を読み取るヘルパー
 * iOSでは通知タップ時にPWAがstart_url（/staff）から起動してしまうことがあるため、
 * 起動後にここで保存済みのURLを確認し、/call への遷移を補完する
 */

const PENDING_CALL_DB = "reception-app";
const PENDING_CALL_STORE = "pending-call";
// この時間より古い保存分は無視する（別の日の通知を誤って開かないようにするため）
const PENDING_CALL_MAX_AGE_MS = 15 * 60 * 1000;

function openPendingCallDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PENDING_CALL_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(PENDING_CALL_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function consumePendingCallUrl(): Promise<string | null> {
  if (!("indexedDB" in window)) return null;

  try {
    const db = await openPendingCallDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(PENDING_CALL_STORE, "readwrite");
      const store = tx.objectStore(PENDING_CALL_STORE);
      const getReq = store.get("latest");

      getReq.onsuccess = () => {
        const record = getReq.result as { url: string; savedAt: number } | undefined;
        store.delete("latest");
        if (record && Date.now() - record.savedAt < PENDING_CALL_MAX_AGE_MS) {
          resolve(record.url);
        } else {
          resolve(null);
        }
      };
      getReq.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
