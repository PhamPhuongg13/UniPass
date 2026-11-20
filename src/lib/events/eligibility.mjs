import { z } from "zod";
export const schoolDomainSchema = z.string().trim().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+edu\.vn$/, "Enter a school domain ending in .edu.vn.");
export const eligibilityFields = {
  eligibility: z.enum(["OPEN", "STUDENT", "SCHOOLS"]).default("OPEN"),
  allowedSchoolDomains: z.array(schoolDomainSchema).max(30).default([]),
};
export function validEligibility(value) { return value.eligibility !== "SCHOOLS" || value.allowedSchoolDomains.length > 0; }
