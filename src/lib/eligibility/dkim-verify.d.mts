export const STUDENT_EMAIL_DOMAINS: readonly string[];
export const STUDENT_EMAIL_SUFFIXES: readonly string[];
export function isAllowedStudentDomain(domain: string): boolean;
export type VerifyResult = { ok: true; domain: string; senderDomain: string; normalizedSender: string } | { ok: false; code: string; message: string };
export function verifyStudentEmail(eml: string | Buffer, options?: { allowedDomains?: readonly string[]; expectedChallenge?: string; resolver?: (name: string, rr: string) => Promise<unknown> }): Promise<VerifyResult>;
