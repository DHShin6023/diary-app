/* IndexedDB wrapper */
const DB = {
  _db: null,

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('DiaryApp', 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('entries')) {
          const store = db.createObjectStore('entries', { keyPath: 'id' });
          store.createIndex('date', 'date');
          store.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = e => { this._db = e.target.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  },

  async save(entry) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('entries', 'readwrite');
      const req = tx.objectStore('entries').put(entry);
      req.onsuccess = () => resolve(entry);
      req.onerror = () => reject(req.error);
    });
  },

  async getAll() {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('entries', 'readonly');
      const req = tx.objectStore('entries').index('createdAt').getAll();
      req.onsuccess = () => resolve([...req.result].reverse());
      req.onerror = () => reject(req.error);
    });
  },

  async getByDate(date) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('entries', 'readonly');
      const req = tx.objectStore('entries').index('date').getAll(date);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getById(id) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('entries', 'readonly');
      const req = tx.objectStore('entries').get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async delete(id) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('entries', 'readwrite');
      const req = tx.objectStore('entries').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async getMonthEntries(year, month) {
    /* Returns { 'YYYY-MM-DD': mood, ... } for the given month */
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('entries', 'readonly');
      const idx = tx.objectStore('entries').index('date');
      const mm = String(month).padStart(2, '0');
      const range = IDBKeyRange.bound(`${year}-${mm}-01`, `${year}-${mm}-31`);
      const cur = idx.openCursor(range);
      const result = {};
      cur.onsuccess = e => {
        const c = e.target.result;
        if (c) {
          result[c.value.date] = c.value.mood || '📓';
          c.continue();
        } else {
          resolve(result);
        }
      };
      cur.onerror = () => reject(cur.error);
    });
  }
};
