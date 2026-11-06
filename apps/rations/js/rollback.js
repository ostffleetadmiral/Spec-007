/**
 * Rations Git-Backed Rollback System
 *
 * Provides version control for the agent's self-modifications.
 * Uses a compact in-browser git-like object store backed by IndexedDB.
 * Each snapshot captures the full state of customware (L0/L1/L2 layers).
 */

const Rollback = (function () {
  const DB_NAME = "rations-rollback";
  const DB_VERSION = 1;
  const STORE_OBJECTS = "objects";
  const STORE_REFS = "refs";
  const STORE_LOG = "log";

  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        db = req.result;
        resolve(db);
      };
      req.onupgradeneeded = (event) => {
        const d = event.target.result;
        if (!d.objectStoreNames.contains(STORE_OBJECTS)) {
          d.createObjectStore(STORE_OBJECTS, { keyPath: "hash" });
        }
        if (!d.objectStoreNames.contains(STORE_REFS)) {
          d.createObjectStore(STORE_REFS, { keyPath: "name" });
        }
        if (!d.objectStoreNames.contains(STORE_LOG)) {
          d.createObjectStore(STORE_LOG, { keyPath: "id", autoIncrement: true });
        }
      };
    });
  }

  async function hash(data) {
    const buf = new TextEncoder().encode(JSON.stringify(data));
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const bytes = new Uint8Array(digest);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function storeObject(obj) {
    const h = await hash(obj);
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_OBJECTS], "readwrite");
      const store = tx.objectStore(STORE_OBJECTS);
      const req = store.put({ hash: h, data: obj });
      req.onsuccess = () => resolve(h);
      req.onerror = () => reject(req.error);
    });
  }

  async function getObject(h) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_OBJECTS], "readonly");
      const store = tx.objectStore(STORE_OBJECTS);
      const req = store.get(h);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => reject(req.error);
    });
  }

  async function setRef(name, commitHash) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_REFS], "readwrite");
      const store = tx.objectStore(STORE_REFS);
      const req = store.put({ name, commit: commitHash });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function getRef(name) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_REFS], "readonly");
      const store = tx.objectStore(STORE_REFS);
      const req = store.get(name);
      req.onsuccess = () => resolve(req.result ? req.result.commit : null);
      req.onerror = () => reject(req.error);
    });
  }

  async function addLogEntry(message, commitHash) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_LOG], "readwrite");
      const store = tx.objectStore(STORE_LOG);
      const entry = {
        timestamp: Date.now(),
        message,
        commit: commitHash,
      };
      const req = store.add(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Create a snapshot of the current state.
   * @param {Object} state - The current customware state (L0/L1/L2)
   * @param {string} message - Commit message
   * @returns {Promise<string>} Commit hash
   */
  async function commit(state, message) {
    if (!db) await openDB();

    const parentHash = await getRef("HEAD");

    const treeHash = await storeObject(state);

    const commitObj = {
      tree: treeHash,
      parent: parentHash,
      message,
      timestamp: Date.now(),
    };

    const commitHash = await storeObject(commitObj);
    await setRef("HEAD", commitHash);
    await addLogEntry(message, commitHash);

    return commitHash;
  }

  /**
   * Rollback to a specific commit.
   * @param {string} commitHash - The commit to restore
   * @returns {Promise<Object>} The restored state
   */
  async function checkout(commitHash) {
    if (!db) await openDB();

    const commitObj = await getObject(commitHash);
    if (!commitObj) throw new Error("Commit not found: " + commitHash);

    const state = await getObject(commitObj.tree);
    if (!state) throw new Error("Tree not found for commit: " + commitHash);

    await setRef("HEAD", commitHash);
    await addLogEntry("Rollback to " + commitHash.substring(0, 8), commitHash);

    return state;
  }

  /**
   * Rollback to the previous commit (HEAD~1).
   * @returns {Promise<Object|null>} The restored state, or null if no parent
   */
  async function rollback() {
    if (!db) await openDB();

    const headHash = await getRef("HEAD");
    if (!headHash) return null;

    const commitObj = await getObject(headHash);
    if (!commitObj || !commitObj.parent) return null;

    return checkout(commitObj.parent);
  }

  /**
   * Get the commit log.
   * @param {number} limit - Max entries to return
   * @returns {Promise<Array>} Array of log entries
   */
  async function log(limit = 50) {
    if (!db) await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_LOG], "readonly");
      const store = tx.objectStore(STORE_LOG);
      const req = store.getAll();
      req.onsuccess = () => {
        const entries = req.result || [];
        entries.sort((a, b) => b.timestamp - a.timestamp);
        resolve(entries.slice(0, limit));
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Get the current HEAD commit hash.
   * @returns {Promise<string|null>}
   */
  async function getHead() {
    if (!db) await openDB();
    return getRef("HEAD");
  }

  /**
   * Get the state at HEAD.
   * @returns {Promise<Object|null>}
   */
  async function getCurrentState() {
    if (!db) await openDB();
    const headHash = await getRef("HEAD");
    if (!headHash) return null;
    const commitObj = await getObject(headHash);
    if (!commitObj) return null;
    return getObject(commitObj.tree);
  }

  /**
   * List all commits in reverse chronological order.
   * @param {number} limit - Max commits
   * @returns {Promise<Array>} Array of {hash, message, timestamp, parent}
   */
  async function history(limit = 100) {
    if (!db) await openDB();

    const commits = [];
    let currentHash = await getRef("HEAD");

    while (currentHash && commits.length < limit) {
      const commitObj = await getObject(currentHash);
      if (!commitObj) break;
      commits.push({
        hash: currentHash,
        message: commitObj.message,
        timestamp: commitObj.timestamp,
        parent: commitObj.parent,
      });
      currentHash = commitObj.parent;
    }

    return commits;
  }

  return {
    commit,
    checkout,
    rollback,
    log,
    getHead,
    getCurrentState,
    history,
    openDB,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Rollback;
}
