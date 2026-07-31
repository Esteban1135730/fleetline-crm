import { z } from "zod";

export const AskAiSchema = z.object({
  question: z.string().min(3).max(2000),
});

export type AskAiDto = z.infer<typeof AskAiSchema>;
