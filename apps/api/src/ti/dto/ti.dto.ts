import { z } from "zod";

export const SystemLogsQuerySchema = z.object({
  level: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).optional(),
  source: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});
export type SystemLogsQuery = z.infer<typeof SystemLogsQuerySchema>;

export const DlqReplaySchema = z.object({
  messageIds: z.array(z.string().min(1)).min(1).max(50),
  force: z.boolean().optional(),
});
export type DlqReplayDto = z.infer<typeof DlqReplaySchema>;

export const TranscribeSchema = z.object({
  audioBase64: z.string().min(8).optional(),
  audioRef: z.string().min(1).optional(),
  mimeType: z.string().optional(),
  language: z.string().optional(),
  speakerRole: z.enum(["DRIVER", "DISPATCHER", "MONITOR", "OTHER"]).optional(),
  hint: z.string().optional(),
}).refine((v) => Boolean(v.audioBase64 || v.audioRef), {
  message: "audioBase64 o audioRef requerido",
});
export type TranscribeDto = z.infer<typeof TranscribeSchema>;

export const SynthesizeSchema = z.object({
  text: z.string().min(2).max(2000),
  voice: z.enum(["FLEET_ES_M", "FLEET_ES_F", "NOC_ALERT"]).optional(),
  format: z.enum(["mp3", "wav", "ogg"]).optional(),
});
export type SynthesizeDto = z.infer<typeof SynthesizeSchema>;
