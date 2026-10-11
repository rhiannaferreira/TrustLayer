/** Short, sortable-ish identifiers for demo records. */
function randomSuffix(length = 6): string {
  const alphabet = '0123456789abcdefghjkmnpqrstvwxyz';
  let out = '';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function newId(prefix: string): string {
  const time = Date.now().toString(36).slice(-5);
  return `${prefix}-${time}${randomSuffix(4)}`;
}
