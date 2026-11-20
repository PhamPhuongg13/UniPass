import { createHash, randomBytes } from "node:crypto";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newDiscountCode() { const bytes = randomBytes(8); const part = n => Array.from(bytes.subarray(n, n + 4), byte => ALPHABET[byte % ALPHABET.length]).join(""); return `UNI-${part(0)}-${part(4)}`; }
export function hashDiscountCode(code) { if (typeof code !== "string" || !/^UNI-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)) throw new TypeError("Invalid discount code."); return createHash("sha256").update(code).digest("hex"); }
