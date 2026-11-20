import { isAllowedStudentDomain } from "./dkim-verify.mjs";
import { STUDENT_ELIGIBILITY_BLUEPRINT_ID } from "../contracts/registration-authorization.mjs";
export function domainMatchesSchool(domain, allowed) {
  const value = domain.toLowerCase();
  return allowed.some(school => value === school.toLowerCase() || value.endsWith(`.${school.toLowerCase()}`));
}
export function checkEligibility(policy, allowedSchoolDomains, record, now = new Date()) {
  if (policy === "OPEN") return { eligible: true, reason: "OPEN" };
  if (!record || record.revokedAt || record.expiresAt <= now || record.chainId !== 43113 || !isAllowedStudentDomain(record.senderDomain) || !record.emailNullifier || !(["dkim-v1", "privy-email-v1", STUDENT_ELIGIBILITY_BLUEPRINT_ID].includes(record.blueprintId) || (record.policyVersion === "zkemail-v3" && record.verificationMode === "zkemail" && Boolean(process.env.ZKEMAIL_BLUEPRINT_SLUG)))) return { eligible: false, reason: "VERIFY_STUDENT" };
  if (policy === "SCHOOLS" && !domainMatchesSchool(record.senderDomain, allowedSchoolDomains)) return { eligible: false, reason: "SCHOOL_NOT_ALLOWED" };
  return { eligible: true, reason: "VERIFIED" };
}
