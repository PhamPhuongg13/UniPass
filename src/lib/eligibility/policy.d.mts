export type EligibilityRecord = { chainId: number; senderDomain: string; emailNullifier: string | null; blueprintId: string; policyVersion?: string; verificationMode?: string; expiresAt: Date; revokedAt: Date | null };
export function domainMatchesSchool(domain: string, allowed: readonly string[]): boolean;
export function checkEligibility(policy: string, allowedSchoolDomains: readonly string[], record: EligibilityRecord | null, now?: Date): { eligible: boolean; reason: "OPEN" | "VERIFY_STUDENT" | "SCHOOL_NOT_ALLOWED" | "VERIFIED" };
