const session = require("express-session");
const { db } = require("./db");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid         TEXT PRIMARY KEY,
    data        TEXT NOT NULL,
    expires_at  INTEGER NOT NULL
  );
`);

const getStmt = db.prepare("SELECT data, expires_at FROM sessions WHERE sid = ?");
const setStmt = db.prepare(
  "INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at"
);
const destroyStmt = db.prepare("DELETE FROM sessions WHERE sid = ?");
const pruneStmt = db.prepare("DELETE FROM sessions WHERE expires_at < ?");

/** A minimal express-session store backed by the same SQLite file as everything else. */
class SqliteSessionStore extends session.Store {
  constructor() {
    super();
    // Sweep expired sessions periodically so the table doesn't grow forever.
    this._pruneInterval = setInterval(() => pruneStmt.run(Math.floor(Date.now() / 1000)), 1000 * 60 * 60);
    this._pruneInterval.unref?.();
  }

  get(sid, callback) {
    try {
      const row = getStmt.get(sid);
      if (!row || row.expires_at < Math.floor(Date.now() / 1000)) return callback(null, null);
      callback(null, JSON.parse(row.data));
    } catch (err) {
      callback(err);
    }
  }

  set(sid, sessionData, callback) {
    try {
      const maxAgeMs = sessionData.cookie?.maxAge ?? 1000 * 60 * 60 * 24 * 7;
      const expiresAt = Math.floor((Date.now() + maxAgeMs) / 1000);
      setStmt.run(sid, JSON.stringify(sessionData), expiresAt);
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  destroy(sid, callback) {
    try {
      destroyStmt.run(sid);
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  touch(sid, sessionData, callback) {
    this.set(sid, sessionData, callback);
  }
}

module.exports = SqliteSessionStore;
