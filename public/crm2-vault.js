/* Nemi CRM2 — төхөөрөмжийн шифрлэсэн сангийн (vault) энгийн JS ихэр.
 *
 * lib/crm2/device/vault.ts-тэй ИЖИЛ IndexedDB түлхүүр, ИЖИЛ бичлэгийн формат:
 * - DB «nemi-crm2», хувилбар 1, store-ууд keys, drafts, blobs, sealed, queue, pending, outbox
 *   (out-of-line түлхүүр). Түлхүүр store «keys», нэр «device-v1»: AES-GCM 256,
 *   extractable:false CryptoKey. Байхгүй бол үүсгэнэ («байхгүй бол л бич»).
 * - Бичлэг v1: { v:1, iv: base64(12 байт), ct: base64(шифр+tag), profileId, expiresAt }.
 *   Нээлттэй текст = UTF-8(JSON). AAD = UTF-8("nemi-crm2-vault:v1:" + profileId + ":" + expiresAt).
 *   profileId "" = хэрэглэгчид холбогдоогүй (SW-ийн share).
 * Мөн хуваалцсан зүйлсийн хайрцаг (lib/crm2/device/share-inbox.ts): DB «nemi-share»,
 * хувилбар 1, store «items» (keyPath «id»).
 *
 * public/sw.js (importScripts) ба public/offline.html (<script>) ачаална.
 * Нэг формат хоёр талд: аль нэгийг өөрчилбөл нөгөөг зэрэг өөрчилнө
 * (lib/crm2/__tests__/vault-format.test.ts шалгана). Хувийн өгөгдлийг кэшлэхгүй.
 */
(function (root) {
  "use strict";

  var DB_NAME = "nemi-crm2";
  var DB_VERSION = 1;
  var DB_STORES = ["keys", "drafts", "blobs", "sealed", "queue", "pending", "outbox"];
  var KEY_ID = "device-v1";
  var AAD_PREFIX = "nemi-crm2-vault:v1:";

  var SHARE_DB_NAME = "nemi-share";
  var SHARE_DB_VERSION = 1;
  var SHARE_STORE = "items";
  var SHARE_TTL_MS = 60 * 60 * 1000;
  var OFFLINE_TTL_MS = 24 * 60 * 60 * 1000;

  // ── base64 / AAD ───────────────────────────────────────────

  function bytesToBase64(bytes) {
    var s = "";
    var CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes.subarray(i, i + CHUNK)));
    }
    return btoa(s);
  }

  function base64ToBytes(b64) {
    var s = atob(b64);
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function aad(profileId, expiresAt) {
    return new TextEncoder().encode(AAD_PREFIX + profileId + ":" + expiresAt);
  }

  function subtle() {
    var c = root.crypto;
    if (!c || !c.subtle) throw new Error("no_webcrypto");
    return c.subtle;
  }

  function canOpenRecord(record, opts) {
    opts = opts || {};
    if (!record || record.v !== 1) return false;
    if (typeof record.expiresAt !== "number" || typeof record.profileId !== "string") return false;
    var now = typeof opts.now === "number" ? opts.now : Date.now();
    if (record.expiresAt <= now) return false;
    if (opts.profileId != null && record.profileId !== "" && record.profileId !== opts.profileId) return false;
    return true;
  }

  // ── Түлхүүр өгөгдсөн цэвэр битүүмжлэл ─────────────────────

  function sealWithKey(key, obj, opts) {
    var profileId = String((opts && opts.profileId) || "");
    var now = opts && typeof opts.now === "number" ? opts.now : Date.now();
    var expiresAt = Math.round(now + Math.max(0, (opts && opts.ttlMs) || 0));
    var iv = root.crypto.getRandomValues(new Uint8Array(12));
    var plain = new TextEncoder().encode(JSON.stringify(obj === undefined ? null : obj));
    return subtle()
      .encrypt({ name: "AES-GCM", iv: iv, additionalData: aad(profileId, expiresAt) }, key, plain)
      .then(function (ct) {
        return { v: 1, iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)), profileId: profileId, expiresAt: expiresAt };
      });
  }

  function openWithKey(key, record, opts) {
    if (!record || !canOpenRecord(record, opts) || typeof record.ct !== "string") return Promise.resolve(null);
    var p;
    try {
      p = subtle().decrypt(
        { name: "AES-GCM", iv: base64ToBytes(record.iv), additionalData: aad(record.profileId, record.expiresAt) },
        key,
        base64ToBytes(record.ct)
      );
    } catch {
      return Promise.resolve(null);
    }
    return p.then(
      function (plain) {
        try {
          return JSON.parse(new TextDecoder().decode(plain));
        } catch {
          return null;
        }
      },
      function () {
        return null;
      }
    );
  }

  function generateDeviceKey() {
    return subtle().generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  // ── IndexedDB ──────────────────────────────────────────────

  function reqDone(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error || new Error("idb_error"));
      };
    });
  }

  function openDb(name, version, upgrade) {
    return new Promise(function (resolve, reject) {
      if (typeof root.indexedDB === "undefined") {
        reject(new Error("no_indexeddb"));
        return;
      }
      var req = version ? root.indexedDB.open(name, version) : root.indexedDB.open(name);
      req.onupgradeneeded = function () {
        upgrade(req.result);
      };
      req.onsuccess = function () {
        var db = req.result;
        db.onversionchange = function () {
          db.close();
        };
        resolve(db);
      };
      req.onerror = function () {
        reject(req.error || new Error("idb_open_failed"));
      };
      req.onblocked = function () {
        reject(new Error("idb_blocked"));
      };
    });
  }

  function openCrm2Db() {
    var upgrade = function (db) {
      for (var i = 0; i < DB_STORES.length; i++) {
        if (!db.objectStoreNames.contains(DB_STORES[i])) db.createObjectStore(DB_STORES[i]);
      }
    };
    return openDb(DB_NAME, DB_VERSION, upgrade).catch(function (e) {
      // Апп DB-г шинэ хувилбар руу ахиулсан бол одоогийн хувилбараар нээнэ.
      if (e && e.name === "VersionError") return openDb(DB_NAME, 0, upgrade);
      throw e;
    });
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () {
        resolve();
      };
      tx.onerror = function () {
        reject(tx.error || new Error("tx_error"));
      };
      tx.onabort = function () {
        reject(tx.error || new Error("tx_abort"));
      };
    });
  }

  /** Төхөөрөмжийн түлхүүр: байвал уншина, байхгүй бол үүсгэж «байхгүй бол л» бичнэ. */
  function deviceKey() {
    return openCrm2Db().then(function (db) {
      var close = function (v) {
        db.close();
        return v;
      };
      var fail = function (e) {
        db.close();
        throw e;
      };
      return reqDone(db.transaction("keys", "readonly").objectStore("keys").get(KEY_ID))
        .then(function (existing) {
          if (existing) return existing;
          return generateDeviceKey().then(function (fresh) {
            // Шифрлэлтийн await-ын дараа шинэ гүйлгээ: get → байхгүй бол put (атомаар).
            var tx = db.transaction("keys", "readwrite");
            var store = tx.objectStore("keys");
            var chosen = fresh;
            var g = store.get(KEY_ID);
            g.onsuccess = function () {
              if (g.result) chosen = g.result;
              else store.put(fresh, KEY_ID);
            };
            return txDone(tx).then(function () {
              return chosen;
            });
          });
        })
        .then(close, fail);
    });
  }

  function seal(obj, opts) {
    return deviceKey().then(function (key) {
      return sealWithKey(key, obj, opts);
    });
  }

  function open(record, opts) {
    if (!record || !canOpenRecord(record, opts)) return Promise.resolve(null);
    return deviceKey().then(
      function (key) {
        return openWithKey(key, record, opts);
      },
      function () {
        return null;
      }
    );
  }

  // ── Хуваалцсан зүйлсийн хайрцаг («nemi-share») ─────────────

  function openShareDb() {
    return openDb(SHARE_DB_NAME, SHARE_DB_VERSION, function (db) {
      if (!db.objectStoreNames.contains(SHARE_STORE)) db.createObjectStore(SHARE_STORE, { keyPath: "id" });
    });
  }

  function newId() {
    var c = root.crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
    var b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = "";
    for (var i = 0; i < 16; i++) h += (b[i] + 0x100).toString(16).slice(1);
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  /** Бичлэг { id, at, kind, profileId, sealedText, files:[{name,type,blob}] } хадгална. */
  function putShareItem(record) {
    return openShareDb().then(function (db) {
      var tx = db.transaction(SHARE_STORE, "readwrite");
      tx.objectStore(SHARE_STORE).put(record);
      return txDone(tx).then(
        function () {
          db.close();
          return record.id;
        },
        function (e) {
          db.close();
          throw e;
        }
      );
    });
  }

  /**
   * Хайрцагт нэг зүйл нэмнэ: бичвэрийг битүүмжилж (share: холбогдоогүй, 1 цаг;
   * offline: профайлд холбогдсон, 24 цаг), файлуудыг тэр чигээр нь хадгална.
   */
  function storeInboxItem(input) {
    var kind = input.kind === "offline" ? "offline" : "share";
    var profileId = kind === "offline" ? String(input.profileId || "") : null;
    if (kind === "offline" && !profileId) return Promise.reject(new Error("no_profile"));
    var text = typeof input.text === "string" ? input.text : "";
    var ttl = kind === "offline" ? OFFLINE_TTL_MS : SHARE_TTL_MS;
    var sealing = text ? seal(text, { profileId: profileId || "", ttlMs: ttl }) : Promise.resolve(null);
    return sealing.then(function (sealedText) {
      return putShareItem({
        id: newId(),
        at: Date.now(),
        kind: kind,
        profileId: profileId,
        sealedText: sealedText,
        files: input.files || [],
      });
    });
  }

  var api = {
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    DB_STORES: DB_STORES.slice(),
    KEY_ID: KEY_ID,
    AAD_PREFIX: AAD_PREFIX,
    SHARE_DB_NAME: SHARE_DB_NAME,
    SHARE_STORE: SHARE_STORE,
    SHARE_TTL_MS: SHARE_TTL_MS,
    OFFLINE_TTL_MS: OFFLINE_TTL_MS,
    bytesToBase64: bytesToBase64,
    base64ToBytes: base64ToBytes,
    canOpenRecord: canOpenRecord,
    sealWithKey: sealWithKey,
    openWithKey: openWithKey,
    generateDeviceKey: generateDeviceKey,
    deviceKey: deviceKey,
    seal: seal,
    open: open,
    newId: newId,
    putShareItem: putShareItem,
    storeInboxItem: storeInboxItem,
  };
  root.Crm2Vault = api;
})(typeof self !== "undefined" ? self : this);
