const encoder = new TextEncoder();
export function base64(bytes: Uint8Array): string {
  let value = ''; for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}
const url64 = (bytes: Uint8Array) => base64(bytes).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
function decode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid_token');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
async function key(secret: string): Promise<CryptoKey> {
  if (encoder.encode(secret).length < 32) throw new Error('missing_signing_key');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function sign(value: unknown, secret: string, purpose: 'ticket' | 'session'): Promise<string> {
  const payload = url64(encoder.encode(JSON.stringify(value)));
  const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(`${purpose}.${payload}`));
  return `${payload}.${url64(new Uint8Array(signature))}`;
}
export async function verify(token: string, secret: string, purpose: 'ticket' | 'session'): Promise<unknown> {
  if (token.length > 4096) throw new Error('invalid_token');
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('invalid_token');
  if (!await crypto.subtle.verify('HMAC', await key(secret), Uint8Array.from(decode(parts[1])), encoder.encode(`${purpose}.${parts[0]}`))) throw new Error('invalid_token');
  return JSON.parse(new TextDecoder().decode(decode(parts[0]))) as unknown;
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes))), n => n.toString(16).padStart(2, '0')).join('');
}
/** Network keys must receive an authenticated gateway address, never public X-Forwarded-For. */
export async function networkKey(address: string, epoch: string, secret: string): Promise<string> {
  return url64(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(`network:${epoch}:${address}`))));
}
