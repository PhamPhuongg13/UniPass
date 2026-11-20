import type { z } from "zod";
export const schoolDomainSchema: z.ZodType<string>;
export const eligibilityFields: { eligibility: z.ZodType<"OPEN" | "STUDENT" | "SCHOOLS">; allowedSchoolDomains: z.ZodType<string[]> };
export function validEligibility(value: { eligibility: string; allowedSchoolDomains: string[] }): boolean;
