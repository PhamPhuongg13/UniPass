import { dkimVerify } from "mailauth/lib/dkim/verify";
import { simpleParser } from "mailparser";
import { normalizeStudentEmail } from "./nullifier.mjs";

export const STUDENT_EMAIL_SUFFIXES = Object.freeze((process.env.STUDENT_EMAIL_SUFFIXES || ".edu.vn").split(",").map(value => value.trim().toLowerCase().replace(/^\*/, "")).filter(value => /^\.[a-z0-9.-]+$/.test(value)));
export const STUDENT_EMAIL_DOMAINS = Object.freeze((process.env.STUDENT_EMAIL_DOMAINS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean));
export function isAllowedStudentDomain(domain) {
  if (typeof domain !== "string") return false;
  const value = domain.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value) || value.includes("..")) return false;
  return STUDENT_EMAIL_DOMAINS.includes(value) || STUDENT_EMAIL_SUFFIXES.some(suffix => value.endsWith(suffix) && value.length > suffix.length);
}
const fail = (code, message) => ({ ok: false, code, message });

export async function verifyStudentEmail(eml, { allowedDomains, expectedChallenge, resolver } = {}) {
  try {
    if (typeof eml !== "string" && !Buffer.isBuffer(eml)) return fail("INVALID_EMAIL", "Invalid email.");
    let source = Buffer.isBuffer(eml) ? eml : Buffer.from(eml, "utf8");
    if (source.length > 2_000_000) return fail("TOO_LARGE", "Email exceeds 2 MB.");
    // Some browsers/OSes save .eml with bare LF line endings; DKIM canonicalization expects CRLF.
    if (!source.includes("\r\n") && source.includes("\n")) source = Buffer.from(source.toString("latin1").replace(/\n/g, "\r\n"), "latin1");
    if (!/^[A-Za-z0-9_-]{43}$/.test(expectedChallenge ?? "")) return fail("INVALID_CHALLENGE", "Invalid challenge.");
    const headerEnd = source.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd < 0) return fail("INVALID_EMAIL", "Invalid email.");
    const headerBlock = source.subarray(0, headerEnd).toString("latin1");
    const headers = headerBlock.replace(/\r\n[ \t]+/g, " ").split("\r\n");
    const fromHeaders = headers.filter(line => /^from:/i.test(line));
    if (fromHeaders.length !== 1) return fail("FROM_COUNT", "Email needs exactly one From header.");
    const verified = await dkimVerify(source, { resolver, strict: true });
    const passes = verified.results.filter(result => result.status?.result === "pass");
    if (!passes.length) {
      if (verified.results.some(result => result.status?.comment === "From field not signed")) return fail("FROM_UNSIGNED", "DKIM did not sign the From header.");
      return fail("DKIM_FAILED", "Invalid DKIM signature.");
    }
    const permitted = passes.filter(result => isAllowedStudentDomain(result.signingDomain) && (!allowedDomains || allowedDomains.some(domain => result.signingDomain?.toLowerCase() === domain.toLowerCase())));
    if (!permitted.length) return fail("SIGNING_DOMAIN", "DKIM signing domain is not accepted.");
    const signedFrom = permitted.filter(result => result.signingHeaders?.keys?.toLowerCase().split(/:\s*/).includes("from"));
    if (!signedFrom.length) return fail("FROM_UNSIGNED", "DKIM did not sign the From header.");
    const unrestricted = signedFrom.filter(result => !result.canonBodyLengthLimited && result.canonBodyLengthLimit === undefined);
    if (!unrestricted.length) return fail("BODY_LENGTH_LIMIT", "DKIM signature limits email body coverage.");
    const parsed = await simpleParser(source);
    if (!parsed.from || parsed.from.value.length !== 1 || !parsed.from.value[0].address) return fail("FROM_ADDRESS", "Invalid From address.");
    let normalizedSender;
    try { normalizedSender = normalizeStudentEmail(parsed.from.value[0].address); }
    catch { return fail("FROM_ADDRESS", "Invalid From address."); }
    const senderDomain = normalizedSender.split("@")[1];
    const domain = unrestricted.find(result => senderDomain === result.signingDomain.toLowerCase() || senderDomain.endsWith(`.${result.signingDomain.toLowerCase()}`))?.signingDomain.toLowerCase();
    if (!domain) return fail("FROM_ALIGNMENT", "From domain does not match DKIM signature.");
    const lines = (parsed.text || "").split(/\r?\n/).map(line => line.trim());
    if (lines.includes(`UNIPASS-CHALLENGE:${expectedChallenge}`)) return { ok: true, domain, senderDomain, normalizedSender };
    if (lines.some(line => line.startsWith("UNIPASS-CHALLENGE:"))) return fail("CHALLENGE_MISMATCH", "Challenge in email does not match.");
    return fail("CHALLENGE_MISSING", "Email is missing the challenge.");
  } catch {
    return fail("INVALID_EMAIL", "Could not read or verify email.");
  }
}
