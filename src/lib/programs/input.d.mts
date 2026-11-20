export type ProgramInput = { kind: "GIVEAWAY" | "SCHOLARSHIP" | "DISCOUNT" | "ECOSYSTEM"; title: string; description: string; sponsor: string; eligibility: "OPEN" | "STUDENT" | "SCHOOLS"; allowedSchoolDomains: string[]; cap: number; closesAt: Date; amountPerClaim: string; extra: Record<string, string | string[]> };
export const programInput: import("zod").ZodType<ProgramInput>;
