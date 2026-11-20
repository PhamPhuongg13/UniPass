import { isAllowedStudentDomain } from "./dkim-verify.mjs";
import { normalizeStudentEmail } from "./nullifier.mjs";

export function selectSchoolEmail(accounts) {
  if (!Array.isArray(accounts)) return null;
  for (const account of accounts) {
    if (!account || !["email", "google_oauth"].includes(account.type)) continue;
    if (typeof account.verified_at !== "number" || account.verified_at <= 0) continue;
    try {
      const email = normalizeStudentEmail(account.type === "email" ? account.address : account.email);
      const domain = email.split("@")[1];
      if (isAllowedStudentDomain(domain)) return { email, domain };
    } catch { /* Ignore malformed linked account. */ }
  }
  return null;
}
