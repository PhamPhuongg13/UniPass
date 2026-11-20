import { createHash, createPublicKey } from "node:crypto";

export function dkimPublicKeyHash(spkiBase64) {
  const der = createPublicKey({ key: Buffer.from(spkiBase64, "base64"), format: "der", type: "spki" }).export({ type: "pkcs1", format: "der" });
  return `0x${createHash("sha256").update(der).digest("hex")}`;
}

export function dkimPFromTxt(record) {
  const tag = record.split(";").map(part => part.trim()).find(part => /^p\s*=/.test(part));
  const p = tag?.slice(tag.indexOf("=") + 1).replace(/\s/g, "");
  if (!p) throw new Error("DKIM TXT record has no public key.");
  return p;
}
