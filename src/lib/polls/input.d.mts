import type { z } from "zod";
export const pollInput: z.ZodType<{ eligibility: "OPEN" | "STUDENT" | "SCHOOLS"; allowedSchoolDomains: string[]; title: string; description: string; options: string[]; closesAt: Date }, unknown>;
