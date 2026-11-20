import { z } from "zod";
import { eligibilityFields, validEligibility } from "../events/eligibility.mjs";
export const pollInput = z.object({
  ...eligibilityFields,
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(10),
  closesAt: z.coerce.date(),
}).refine(validEligibility, { path: ["allowedSchoolDomains"], message: "Select at least one school domain." })
  .refine(value => new Set(value.options.map(option => option.toLowerCase())).size === value.options.length, { path: ["options"], message: "Options must be unique." })
  .refine(value => value.closesAt > new Date(), { path: ["closesAt"], message: "Closing time must be in the future." });
