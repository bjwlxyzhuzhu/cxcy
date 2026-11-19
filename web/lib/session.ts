// 会话 cookie 签名与校验（只用 Web Crypto，Node 与 Edge 中间件都能用；不访问数据库）
// cookie 值：base64url(JSON{u:用户id, v:会话版本, e:过期秒}) + "." + base64url(HMAC-SHA256)

export const SESSION_COOKIE = "sx_session";

export type SessionPayload = { u: string; v: number; e: number };

/** 会话有效期（天），默认 7 天，可用 SESSION_MAX_AGE_DAYS 调整 */
export function sessionMaxAge(): number {
  const d = Number(process.env.SESSION_MAX_AGE_DAYS || 7);
  return Math.round((Number.isFinite(d) && d > 0 ? d : 7) * 86400);
}

function secret(): string | null {
  const s = process.env.SESSION_SECRET || "";
  return s.length >= 32 ? s : null;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

let keyCache: { s: string; k: CryptoKey } | null = null;
async function hmacKey(s: string): Promise<CryptoKey> {
  if (keyCache?.s === s) return keyCache.k;
  const k = await crypto.subtle.importKey("raw", enc.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  keyCache = { s, k };
  return k;
}

/** 签发会话；未配置 SESSION_SECRET（≥32 字符）时抛错 */
export async function signSession(userId: string, version: number, maxAge = sessionMaxAge()): Promise<string> {
  const s = secret();
  if (!s) throw new Error("未配置 SESSION_SECRET（至少 32 个字符），请在 .env.local 中设置");
  const payload: SessionPayload = { u: userId, v: version, e: Math.floor(Date.now() / 1000) + maxAge };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(s), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** 校验签名与有效期，通过返回载荷，否则 null */
export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  const s = secret();
  if (!s || !token) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(s), fromB64url(token.slice(dot + 1)), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    if (!p || typeof p.u !== "string" || typeof p.v !== "number" || typeof p.e !== "number") return null;
    if (p.e <= Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

/** cookie 属性：httpOnly + SameSite=Lax；Secure 由 SESSION_COOKIE_SECURE 决定，未设置时按请求是否 https 自动判断 */
export function cookieOptions(isHttps: boolean, maxAge = sessionMaxAge()) {
  const env = process.env.SESSION_COOKIE_SECURE;
  const secure = env === "1" ? true : env === "0" ? false : isHttps;
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure, maxAge };
}

/** 判断请求是否经 https 到达（兼容反向代理的 x-forwarded-proto） */
export function requestIsHttps(req: { headers: Headers; url: string }): boolean {
  const xf = req.headers.get("x-forwarded-proto");
  if (xf) return xf.split(",")[0].trim() === "https";
  return req.url.startsWith("https:");
}
