const TMDB_KEY = "1c29a5198ee1854bd5eb45dbe8d17d92";
const TMDB = "https://api.themoviedb.org/3";

const CONFIG_URL = "https://cloud-day.online/v1.3/CloudDay/uploads/config_v1.3.json";
const FALLBACK_API_BASE = "https://1654865.xyz";
const API = "/v1.3/api";
const EXTRACTOR_URL = "https://cloud-day.online/cimacloud/extractor.php?url=";

const UA_OKHTTP = "okhttp/4.10.0";
const UA_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.77 Safari/537.36";
const UA_MOBILE = "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36";

const ATTEST_APP_ID = "21406135";
const ATTEST_CERT_PATH =
  "021bb8f6029e4e63e4b5b0ff922788b4fe24739e261e637dddf70bf95e0aacd7" +
  "|/data/app/com.app.cimacloud-1/base.apk";

const RSA_N_HEX =
  "c033d8129a446f7c72b3f47df7ece6656e78be171021c57eebe06d1c8fd099be" +
  "08d0cda1c347d0f5fccb63f46128cdf7cae38e64d02e969ab807227b6f9e7a7e" +
  "492995a3cc237bdb1129a826a0a4dd00a1eb935b8b898a445149c8390955ea41" +
  "5f6043af7fb3102cdd4b2d285529fe9c5ab0e5825c4be774e8b832cabe686526" +
  "9949e1a1f45b60264bb3d7b9f6eb9acb07aaee514ac74157840e5f29877b7fc7" +
  "f3729f0b70403039557f9afc056679d81bd8964240baf2f196bf96fb2ae0b86e" +
  "b6172db3a82d56adee3c4c5229d2c1a5ba9bc1036f851801dc8118578ecec9d7" +
  "46df6a9bae225bc5dbd6fa7e4ece8c22610aec0bc846eb918f0460ae8f7cceef";
const RSA_E = 65537;

const MPD_SUFFIX = "=mm,dash-vm-vf,dr.sdr,sdrCodec.vp9.h264?alr=true&mpd_version=5&pacing=0";
const CF_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const HEX_CHARS = "0123456789abcdef";

const EXTRACTOR_DOMAINS = [
  "vidtube", "fasel", "ukrcdn", "upns", "uns.bio", "videoland",
  "rpmhub", "lalalala", "web51018x", "web71512x", "uqload", "streamwish", "dwapp",
];

const log = (...a) => console.log("[CimaCloud]", ...a);

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const b64Encode = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    s += B64_CHARS[b0 >> 2];
    s += B64_CHARS[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    s += b1 === undefined ? "=" : B64_CHARS[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    s += b2 === undefined ? "=" : B64_CHARS[b2 & 63];
  }
  return s;
};

const b64Decode = (str) => {
  const clean = String(str).replace(/[^A-Za-z0-9+/=]/g, "");
  const out = [];
  let acc = 0, bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c === "=") break;
    const v = B64_CHARS.indexOf(c);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
      acc &= (1 << bits) - 1;
    }
  }
  return new Uint8Array(out);
};

const utf8Encode = (text) => {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c >= 0xd800 && c <= 0xdbff) {
      const cp = 0x10000 + ((c & 0x3ff) << 10) + (text.charCodeAt(++i) & 0x3ff);
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    } else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(bytes);
};

const utf8Decode = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    if (b < 0x80) { s += String.fromCharCode(b); i += 1; }
    else if (b < 0xe0) { s += String.fromCharCode(((b & 31) << 6) | (bytes[i + 1] & 63)); i += 2; }
    else if (b < 0xf0) { s += String.fromCharCode(((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63)); i += 3; }
    else {
      const cp = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63);
      const v = cp - 0x10000;
      s += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 1023));
      i += 4;
    }
  }
  return s;
};

const toHex = (bytes) => Array.from(bytes, (b) => ((b & 0xff) < 16 ? "0" : "") + (b & 0xff).toString(16)).join("");

const randomBytes = (n) => {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
  return a;
};

const MD5_T = [];
for (let i = 0; i < 64; i++) MD5_T[i] = (Math.abs(Math.sin(i + 1)) * 0x100000000) | 0;
const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

function md5Hex(text) {
  const bytes = utf8Encode(text);
  const total = (((bytes.length + 8) >> 6) + 1) << 6;
  const msg = new Uint8Array(total);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  const bitLen = bytes.length * 8;
  const lo = bitLen >>> 0, hi = Math.floor(bitLen / 0x100000000);
  msg[total - 8] = lo & 0xff; msg[total - 7] = (lo >>> 8) & 0xff;
  msg[total - 6] = (lo >>> 16) & 0xff; msg[total - 5] = (lo >>> 24) & 0xff;
  msg[total - 4] = hi & 0xff; msg[total - 3] = (hi >>> 8) & 0xff;
  msg[total - 2] = (hi >>> 16) & 0xff; msg[total - 1] = (hi >>> 24) & 0xff;

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const x = new Int32Array(16);
  const rotl = (v, c) => (v << c) | (v >>> (32 - c));

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++)
      x[i] = msg[off + 4 * i] | (msg[off + 4 * i + 1] << 8) | (msg[off + 4 * i + 2] << 16) | (msg[off + 4 * i + 3] << 24);
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) & 15; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) & 15; }
      else { f = c ^ (b | ~d); g = (7 * i) & 15; }
      const t = d; d = c; c = b;
      b = (b + rotl((a + f + MD5_T[i] + x[g]) | 0, MD5_S[i])) | 0;
      a = t;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }

  const out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((v, w) => {
    out[4 * w] = v & 0xff; out[4 * w + 1] = (v >>> 8) & 0xff;
    out[4 * w + 2] = (v >>> 16) & 0xff; out[4 * w + 3] = (v >>> 24) & 0xff;
  });
  return toHex(out);
}

const SBOX = (() => {
  const hex =
    "637c777bf26b6fc53001672bfed7ab76" +
    "ca82c97dfa5947f0add4a2af9ca472c0" +
    "b7fd9326363ff7cc34a5e5f171d83115" +
    "04c723c31896059a071280e2eb27b275" +
    "09832c1a1b6e5aa0523bd6b329e32f84" +
    "53d100ed20fcb15b6acbbe394a4c58cf" +
    "d0efaafb434d338545f9027f503c9fa8" +
    "51a3408f929d38f5bcb6da2110fff3d2" +
    "cd0c13ec5f974417c4a77e3d645d1973" +
    "60814fdc222a908846eeb814de5e0bdb" +
    "e0323a0a4906245cc2d3ac629195e479" +
    "e7c8376d8dd54ea96c56f4ea657aae08" +
    "ba78252e1ca6b4c6e8dd741f4bbd8b8a" +
    "703eb5664803f60e613557b986c11d9e" +
    "e1f8981169d98e949b1e87e9ce5528df" +
    "8ca1890dbfe6426841992d0fb054bb16";
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) t[i] = parseInt(hex.substr(2 * i, 2), 16);
  return t;
})();
const INV_SBOX = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) t[SBOX[i]] = i;
  return t;
})();
const RC = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40];

function aesKeySchedule(key) {
  const w = new Uint32Array(60);
  for (let i = 0; i < 8; i++)
    w[i] = (key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3];
  const sub = (v) => (SBOX[(v >>> 24) & 0xff] << 24) | (SBOX[(v >>> 16) & 0xff] << 16) | (SBOX[(v >>> 8) & 0xff] << 8) | SBOX[v & 0xff];
  const rot = (v) => ((v << 8) | (v >>> 24)) >>> 0;
  for (let i = 8; i < 60; i++) {
    let t = w[i - 1];
    if (i % 8 === 0) t = sub(rot(t)) ^ (RC[i / 8 - 1] << 24);
    else if (i % 8 === 4) t = sub(t);
    w[i] = (w[i - 8] ^ t) >>> 0;
  }
  return w;
}

const gmul = (a, b) => {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
};

function addRoundKey(s, w, r) {
  for (let i = 0; i < 16; i++) s[i] ^= (w[4 * r + (i >> 2)] >>> (24 - 8 * (i & 3))) & 0xff;
}
function subBytes(s) { for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]]; }
function invSubBytes(s) { for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]]; }
function shiftRows(s) {
  const t = s.slice();
  for (let r = 1; r < 4; r++) for (let c = 0; c < 4; c++) s[4 * c + r] = t[4 * ((c + r) & 3) + r];
}
function invShiftRows(s) {
  const t = s.slice();
  for (let r = 1; r < 4; r++) for (let c = 0; c < 4; c++) s[4 * c + r] = t[4 * ((c - r + 4) & 3) + r];
}
function mixColumns(s) {
  for (let c = 0; c < 4; c++) {
    const i = 4 * c, a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
    const t = a0 ^ a1 ^ a2 ^ a3;
    s[i] = a0 ^ t ^ gmul(a0 ^ a1, 2);
    s[i + 1] = a1 ^ t ^ gmul(a1 ^ a2, 2);
    s[i + 2] = a2 ^ t ^ gmul(a2 ^ a3, 2);
    s[i + 3] = a3 ^ t ^ gmul(a3 ^ a0, 2);
  }
}
function invMixColumns(s) {
  for (let c = 0; c < 4; c++) {
    const i = 4 * c, a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
    s[i] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
    s[i + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
    s[i + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
    s[i + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
  }
}

function aesEncryptBlock(s, w) {
  addRoundKey(s, w, 0);
  for (let r = 1; r <= 13; r++) { subBytes(s); shiftRows(s); mixColumns(s); addRoundKey(s, w, r); }
  subBytes(s); shiftRows(s); addRoundKey(s, w, 14);
  return s;
}
function aesDecryptBlock(s, w) {
  addRoundKey(s, w, 14);
  for (let r = 13; r >= 1; r--) { invShiftRows(s); invSubBytes(s); addRoundKey(s, w, r); invMixColumns(s); }
  invShiftRows(s); invSubBytes(s); addRoundKey(s, w, 0);
  return s;
}

function aesCbcDecrypt(key, iv, data) {
  if (!data.length || data.length % 16) return null;
  const w = aesKeySchedule(key);
  const out = new Uint8Array(data.length);
  let prev = iv;
  for (let off = 0; off < data.length; off += 16) {
    const dec = aesDecryptBlock(data.slice(off, off + 16), w);
    for (let i = 0; i < 16; i++) out[off + i] = dec[i] ^ prev[i];
    prev = data.slice(off, off + 16);
  }
  const p = out[out.length - 1];
  if (p < 1 || p > 16 || p > out.length) return null;
  for (let i = out.length - p; i < out.length; i++) if (out[i] !== p) return null;
  return out.slice(0, out.length - p);
}

const xorInto = (dst, src) => { for (let i = 0; i < 16; i++) dst[i] ^= src[i]; };

function ghashMul(x, h) {
  const z = new Uint8Array(16);
  const v = h.slice();
  for (let i = 0; i < 128; i++) {
    if ((x[i >> 3] >> (7 - (i & 7))) & 1) xorInto(z, v);
    const lsb = v[15] & 1;
    for (let j = 15; j > 0; j--) v[j] = ((v[j] >>> 1) | ((v[j - 1] & 1) << 7)) & 0xff;
    v[0] = v[0] >>> 1;
    if (lsb) v[0] ^= 0xe1;
  }
  return z;
}

function aesGcmEncrypt(key, iv, plain) {
  const w = aesKeySchedule(key);
  const h = aesEncryptBlock(new Uint8Array(16), w);
  const j0 = new Uint8Array(16);
  j0.set(iv); j0[15] = 1;

  const ct = new Uint8Array(plain.length);
  const ctr = j0.slice();
  for (let off = 0; off < plain.length; off += 16) {
    for (let i = 15; i >= 12; i--) { ctr[i] = (ctr[i] + 1) & 0xff; if (ctr[i]) break; }
    const ks = aesEncryptBlock(ctr.slice(), w);
    const n = Math.min(16, plain.length - off);
    for (let i = 0; i < n; i++) ct[off + i] = plain[off + i] ^ ks[i];
  }

  let y = new Uint8Array(16);
  for (let off = 0; off < ct.length; off += 16) {
    const pad = new Uint8Array(16);
    pad.set(ct.slice(off, off + 16));
    xorInto(y, pad);
    y = ghashMul(y, h);
  }
  const lenBlock = new Uint8Array(16);
  const bits = ct.length * 8;
  lenBlock[12] = (bits >>> 24) & 0xff; lenBlock[13] = (bits >>> 16) & 0xff;
  lenBlock[14] = (bits >>> 8) & 0xff; lenBlock[15] = bits & 0xff;
  xorInto(y, lenBlock);
  y = ghashMul(y, h);

  const ej0 = aesEncryptBlock(j0.slice(), w);
  const out = new Uint8Array(ct.length + 16);
  out.set(ct);
  for (let i = 0; i < 16; i++) out[ct.length + i] = y[i] ^ ej0[i];
  return out;
}

function rsaEncryptPkcs1(msg, modulusHex, exponent) {
  const k = modulusHex.length / 2;
  if (msg.length > k - 11) return null;
  const em = new Uint8Array(k);
  em[0] = 0; em[1] = 2;
  const psLen = k - 3 - msg.length;
  for (let i = 0; i < psLen; i++) em[2 + i] = 1 + Math.floor(Math.random() * 255);
  em[2 + psLen] = 0;
  em.set(msg, 3 + psLen);

  const n = BigInt("0x" + modulusHex);
  const e = BigInt(exponent);
  const one = BigInt(1);
  const zero = BigInt(0);
  let r = one;
  let b = BigInt("0x" + toHex(em)) % n;
  let ex = e;
  while (ex > zero) {
    if (ex & one) r = (r * b) % n;
    b = (b * b) % n;
    ex = ex >> one;
  }
  let hex = r.toString(16);
  while (hex.length < k * 2) hex = "0" + hex;
  const out = new Uint8Array(k);
  for (let i = 0; i < k; i++) out[i] = parseInt(hex.substr(2 * i, 2), 16);
  return out;
}

const DEVICE_ID = Array.from({ length: 16 }, () => HEX_CHARS[Math.floor(Math.random() * 16)]).join("");

const KEY_BASE = (() => {
  const h = [0x1d, 0x51, 0x45, 0x47, 0x04, 0x5d, 0x08, 0x23, 0x6a, 0x7b, 0x1d, 0x1d, 0x46, 0x5e, 0x20, 0x7e];
  const i = [0x5a, 0x3c, 0x71, 0x2e, 0x68, 0x1d, 0x4f, 0x13];
  return h.map((b, k) => String.fromCharCode(b ^ i[k % i.length])).join("");
})();

function makeFirebaseId() {
  const payload =
    `{"a":"${ATTEST_APP_ID}","b":"${ATTEST_CERT_PATH}","c":"false","d":"empty","e":"empty",` +
    `"f":"false","g":"false","h":"false","t":${Math.floor(Date.now() / 1000)},` +
    `"n":"${toHex(randomBytes(8))}"}`;
  const aesKey = randomBytes(32);
  const iv = randomBytes(12);
  const sealed = aesGcmEncrypt(aesKey, iv, utf8Encode(payload));
  return b64Encode(rsaEncryptPkcs1(aesKey, RSA_N_HEX, RSA_E)) + "." + b64Encode(iv) + "." + b64Encode(sealed);
}

const makeCloudflareId = () =>
  Array.from({ length: 15 }, () => CF_ALPHABET[Math.floor(Math.random() * 62)]).join("") + DEVICE_ID;

function decryptServers(b64Body) {
  try {
    const key = utf8Encode(md5Hex(KEY_BASE + DEVICE_ID));
    const iv = utf8Encode(md5Hex(DEVICE_ID + KEY_BASE).slice(0, 16));
    const plain = aesCbcDecrypt(key, iv, b64Decode(b64Body));
    if (!plain) return null;
    const json = JSON.parse(utf8Decode(plain));
    if (json.status !== true || !Array.isArray(json.servers)) return null;
    return json.servers.map((s) => s && s.link).filter((u) => typeof u === "string" && /^http/.test(u));
  } catch (e) {
    return null;
  }
}

let apiBaseCache = null;

async function apiBase() {
  if (apiBaseCache) return apiBaseCache;
  try {
    const res = await fetch(CONFIG_URL, { headers: { "User-Agent": UA_OKHTTP } });
    const cfg = await res.json();
    const base = String((((cfg || {}).data || [])[0] || {}).cloudday || "").trim().replace(/\/+$/, "");
    apiBaseCache = /^http/.test(base) ? base : FALLBACK_API_BASE;
  } catch (e) {
    apiBaseCache = FALLBACK_API_BASE;
  }
  return apiBaseCache;
}

async function apiGetRaw(path, headers) {
  const res = await fetch(`${await apiBase()}${API}/${path}`, {
    headers: Object.assign({ "User-Agent": UA_OKHTTP }, headers || {}),
  });
  return await res.text();
}

async function apiGet(path, headers) {
  try { return JSON.parse(await apiGetRaw(path, headers)); } catch (e) { return null; }
}

async function apiPostForm(path, form) {
  const body = Object.keys(form)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(form[k])}`)
    .join("&");
  const res = await fetch(`${await apiBase()}${API}/${path}`, {
    method: "POST",
    headers: { "User-Agent": UA_OKHTTP, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  try { return await res.json(); } catch (e) { return null; }
}

async function tmdbTitles(tmdbId, mediaType) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const res = await fetch(`${TMDB}/${type}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=alternative_titles,translations`);
  const d = await res.json();
  const main = d.name || d.title || "";
  const alt = ((d.alternative_titles || {}).results || []).map((t) => t.title);
  const tr = ((d.translations || {}).translations || []).map((t) => (t.data || {}).title || (t.data || {}).name || "");
  return {
    titles: [...new Set([main, ...alt, ...tr].map((s) => (s || "").trim()).filter(Boolean))],
    year: (d.first_air_date || d.release_date || "").split("-")[0] || null,
  };
}

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, "");
const num = (s) => parseInt((s || "").match(/\d+/)?.[0] || "0", 10);
const pad2 = (n) => (n < 10 ? "0" : "") + n;

const itemYear = (it) => {
  const y = parseInt(it.year, 10);
  if (y) return y;
  return parseInt(String(it.release_date || "").slice(0, 4), 10) || null;
};

function yearOk(it, year) {
  const y = itemYear(it);
  return !year || !y || y <= 1900 || Math.abs(y - year) <= 1;
}

const typeOk = (it, isMovie) =>
  !!it && (isMovie ? ["movie"] : ["serie", "series"]).includes(String(it.type || "").toLowerCase());

async function findItem(titles, year, isMovie) {
  const pool = [];
  const seen = new Set();
  for (const t of titles.slice(0, 8)) {
    const res = await apiPostForm("search", { title: String(t), type: "0", sort: "1", page: "1" });
    for (const r of res && Array.isArray(res.results) ? res.results : []) {
      const id = r && String(r.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (typeOk(r, isMovie)) pool.push(r);
    }
    const q = norm(t);
    if (q.length >= 3) {
      const strong = pool.find((r) => norm(r.name || "") === q && yearOk(r, year));
      if (strong) return strong;
    }
  }

  const cand = pool.filter((r) => yearOk(r, year));
  const name = (r) => norm(r.name || "");
  const qs = titles.map(norm).filter((q) => q.length >= 3);
  for (const q of qs) {
    const hit = cand.find((r) => name(r) === q);
    if (hit) return hit;
  }
  for (const q of qs) {
    if (q.length < 4) continue;
    const hit = cand.find((r) => name(r).length >= 4 && (name(r).includes(q) || q.includes(name(r))));
    if (hit) return hit;
  }
  return null;
}

const hostOf = (url) => {
  const m = String(url).match(/^https?:\/\/([^/:?#]+)/i);
  return m ? m[1].toLowerCase() : null;
};

function serverLabel(url) {
  const host = hostOf(url);
  if (!host) return "سيرفر";
  return "سيرفر " + host.replace(/^www\./, "").replace(/^s1\./, "").split(".")[0];
}

function mkStream(label, url, streamTitle, headers, quality) {
  return {
    name: `CimaCloud - ${label}`,
    title: streamTitle,
    url,
    quality: quality || "Auto",
    size: "Unknown",
    headers,
    provider: "cimacloud",
  };
}

const isDirect = (url) => /\.(mp4|m3u8|mpd)$/.test(String(url).split("?")[0].toLowerCase());

async function resolveServer(link, streamTitle, out) {
  const host = hostOf(link) || "";
  const label = serverLabel(link);

  if (isDirect(link)) {
    out.push(mkStream(label, link, streamTitle, { "User-Agent": UA_CHROME }));
    return;
  }

  const photos = gphotosUrl(link);
  if (photos) {
    await resolveGooglePhotos(photos, streamTitle, out);
    return;
  }

  if (host.endsWith("developer-pro.workers.dev")) {
    await resolveWorkers(link, streamTitle, out);
    return;
  }

  if (EXTRACTOR_DOMAINS.some((d) => host.includes(d))) {
    if (await resolveViaExtractorPhp(link, streamTitle, out)) return;
  }

  await resolveJwEmbed(link, label, streamTitle, out);
}

function gphotosUrl(link) {
  const host = hostOf(link);
  if (!host) return null;
  if (host.includes("photos.google.com")) return link;
  if (link.includes("googlefinal.php")) {
    const m = link.match(/[?&]url=(https?[^&]+)/);
    if (!m) return null;
    try {
      const inner = decodeURIComponent(m[1]);
      return hostOf(inner)?.includes("photos.google.com") ? inner : null;
    } catch (e) {
      return null;
    }
  }
  return null;
}

async function resolveGooglePhotos(shareUrl, streamTitle, out) {
  let page;
  try {
    const res = await fetch(shareUrl, {
      headers: {
        "User-Agent": UA_MOBILE,
        "Accept-Language": "ar,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    page = await res.text();
  } catch (e) {
    return false;
  }
  const headers = { Origin: "https://photos.google.com", Referer: "https://photos.google.com", "User-Agent": UA_CHROME };
  let found = false;
  const dl = page.match(/(https?:\/\/video-downloads[^"\\\s]+)/);
  if (dl) {
    out.push(mkStream("سيرفر Google (تنزيل)", dl[1], streamTitle, headers));
    found = true;
  }
  const mpd = page.match(/data-url=\\?"([^"\\]+)/);
  if (mpd) {
    out.push(mkStream("سيرفر Google Photos", mpd[1] + MPD_SUFFIX, streamTitle, headers));
    found = true;
  }
  return found;
}

async function resolveWorkers(url, streamTitle, out) {
  let text;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA_CHROME } });
    text = await res.text();
  } catch (e) {
    return false;
  }
  const urls = new Set();
  try {
    const walk = (v) => {
      if (typeof v === "string") { if (/^http/.test(v)) urls.add(v); }
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.keys(v).forEach((k) => walk(v[k]));
    };
    walk(JSON.parse(text));
  } catch (e) {}
  const re = /https?:\/\/[^\s"'\\]+/g;
  let m;
  while ((m = re.exec(text))) urls.add(m[0].trim());

  let found = false;
  for (const u of urls) {
    const clean = u.split("?")[0].toLowerCase();
    const host = hostOf(u) || "";
    if (host.includes("photos.google.com")) {
      if (await resolveGooglePhotos(u, streamTitle, out)) found = true;
    } else if (clean.endsWith(".mp4") || clean.endsWith(".m3u8")) {
      out.push(mkStream("سيرفر Worker", u, streamTitle, { "User-Agent": UA_CHROME }));
      found = true;
    }
  }
  return found;
}

async function resolveViaExtractorPhp(link, streamTitle, out) {
  let res;
  try {
    const r = await fetch(EXTRACTOR_URL + encodeURIComponent(link), { headers: { "User-Agent": UA_OKHTTP } });
    res = await r.json();
  } catch (e) {
    return false;
  }
  const servers = res && Array.isArray(res.servers) ? res.servers : null;
  if (!servers) return false;

  let found = false;
  for (const s of servers) {
    if (!s || typeof s.url !== "string" || !/^http/.test(s.url)) continue;
    const label = String(s.name || "").trim() || "سيرفر";
    const headers = { "User-Agent": UA_CHROME };
    if (s.origin) headers.Origin = s.origin;
    if (s.referer) headers.Referer = s.referer;
    const q = label.match(/(\d{3,4})p/);
    out.push(mkStream(label, s.url, streamTitle, headers, q ? q[0] : "Auto"));
    found = true;
  }
  return found;
}

const SOURCES_REGEX = /sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/;
const FILE_REGEX = /["']?file["']?\s*:\s*["']([^"']+)["']/;

async function resolveJwEmbed(embedUrl, label, streamTitle, out) {
  const headers = { "User-Agent": UA_CHROME, Referer: embedUrl };
  const host = hostOf(embedUrl);
  if (host) headers.Origin = "https://" + host;
  let page;
  try {
    const res = await fetch(embedUrl, { headers });
    page = await res.text();
  } catch (e) {
    return false;
  }

  let stream = (page.match(SOURCES_REGEX) || [])[1];
  if (!stream) {
    const unpacked = unpackPackedJs(page);
    if (unpacked) stream = (unpacked.match(FILE_REGEX) || [])[1];
    if (!stream) stream = (page.match(FILE_REGEX) || [])[1];
  }
  const url = stream ? stream.replace(/\\\//g, "/") : null;
  if (!url || !/^http/.test(url)) return false;
  if (!isDirect(url)) return false;

  out.push(mkStream(label, url, streamTitle, { "User-Agent": UA_CHROME, Referer: embedUrl }));
  return true;
}

function unpackPackedJs(page) {
  const evalMatch = page.match(/eval\s*\(\s*function\s*\([\s\S]*?\)\s*\{[\s\S]*?\}\s*\(([\s\S]*)\)\s*\)/);
  if (!evalMatch) return null;
  const paramMatch = evalMatch[1].match(
    /['"]([\s\S]*?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([\s\S]*?)['"]\.split\s*\(['"]\|['"]\)/
  );
  if (!paramMatch) return null;
  return deobfuscate(paramMatch[1], parseInt(paramMatch[2], 10), parseInt(paramMatch[3], 10), paramMatch[4].split("|"));
}

function deobfuscate(p, a, c, k) {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const toBase = (num) => {
    if (num === 0) return "0";
    let s = "";
    while (num > 0) { s = chars[num % a] + s; num = Math.floor(num / a); }
    return s;
  };
  const map = {};
  for (let i = 0; i < c; i++) if (k[i]) map[toBase(i)] = k[i];
  return p.replace(/\b\w+\b/g, (m) => (map[m] !== undefined ? map[m] : m));
}

async function fetchServerLinks(path) {
  const raw = (await apiGetRaw(path, { firebase_id: makeFirebaseId(), "cloudflare-id": makeCloudflareId() })).trim();
  const decrypted = decryptServers(raw);
  if (decrypted) return decrypted;
  try {
    const json = JSON.parse(raw);
    if (json.status === true && Array.isArray(json.servers))
      return json.servers.map((s) => s && s.link).filter((u) => typeof u === "string" && /^http/.test(u));
  } catch (e) {}
  return null;
}

async function getStreams(tmdbId, mediaType = "movie", seasonNum = null, episodeNum = null) {
  const isMovie = mediaType === "movie";
  const s = seasonNum || 1;
  const e = episodeNum || 1;
  log(`tmdb=${tmdbId} type=${mediaType}${isMovie ? "" : ` S${s}E${e}`}`);

  try {
    const { titles, year } = await tmdbTitles(tmdbId, mediaType);
    if (!titles.length) return [];
    const title = titles[0];
    log(`tmdb: "${title}" (${year})`);

    const item = await findItem(titles, parseInt(year || "0", 10) || null, isMovie);
    if (!item) { log("not found on CimaCloud"); return []; }
    log(`matched: "${item.name}" (id=${item.id})`);

    let serversPath;
    if (isMovie) {
      serversPath = `movie/${item.id}/servers`;
    } else {
      const eps = await apiGet(`series/${item.id}/episodes`);
      const seasons = (eps && eps.seasons) || [];
      let season = seasons.find((x) => String(x.season_number) === String(s));
      if (!season && seasons.length === 1) season = seasons[0];
      const list = season && Array.isArray(season.episodes) ? season.episodes : [];
      const ep = list.find((x) => num(x.title) === e) || list[e - 1];
      if (!ep || !ep.id) { log(`S${s}E${e} not found`); return []; }
      serversPath = `episode/${ep.id}/servers`;
    }

    const links = await fetchServerLinks(serversPath);
    if (!links || !links.length) { log("no servers"); return []; }
    log(`servers: ${links.length}`);

    const streamTitle = isMovie
      ? `${title}${year ? ` (${year})` : ""}`
      : `${title} S${pad2(s)}E${pad2(e)}`;

    const out = [];
    await Promise.all(links.map((link) => resolveServer(link, streamTitle, out).catch(() => false)));

    const seen = new Set();
    const streams = [];
    for (const x of out) {
      if (x.url && !seen.has(x.url)) { seen.add(x.url); streams.push(x); }
    }
    log(`streams: ${streams.length}`);
    return streams;
  } catch (err) {
    log(`error: ${err && err.message}`);
    return [];
  }
}

module.exports = { getStreams };
