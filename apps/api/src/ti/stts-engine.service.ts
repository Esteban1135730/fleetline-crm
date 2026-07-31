import { Injectable, Logger } from "@nestjs/common";
import { SttsJobStatus, SttsMode } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import type { SynthesizeDto, TranscribeDto } from "./dto/ti.dto";
import { mockSynthesizeSpeech, mockTranscribeAudio } from "./noc.calc";

/**
 * Motor Speech-to-Text / Text-to-Speech — integración Gemini STTS (mock).
 */
@Injectable()
export class SttsEngineService {
  private readonly logger = new Logger(SttsEngineService.name);
  private readonly provider = "GEMINI_STTS_MOCK";

  constructor(private prisma: PrismaService) {}

  async transcribe(organizationId: string, dto: TranscribeDto) {
    const result = mockTranscribeAudio({
      audioBase64: dto.audioBase64,
      audioRef: dto.audioRef,
      speakerRole: dto.speakerRole,
      hint: dto.hint,
    });

    const job = await this.prisma.sttsJob.create({
      data: {
        organizationId,
        mode: SttsMode.TRANSCRIBE,
        status: SttsJobStatus.DONE,
        provider: this.provider,
        inputRef: dto.audioRef,
        mimeType: dto.mimeType || "audio/webm",
        outputText: result.text,
        durationMs: result.durationMs,
        confidence: result.confidence,
        meta: {
          structured: result.structured,
          language: dto.language || "es-CO",
          speakerRole: dto.speakerRole || "DRIVER",
        },
      },
    });

    this.logger.log(
      `[STTS] transcribe job=${job.id} intent=${result.structured.intent}`,
    );

    return {
      jobId: job.id,
      provider: this.provider,
      text: result.text,
      structured: result.structured,
      confidence: result.confidence,
      durationMs: result.durationMs,
      status: job.status,
    };
  }

  async synthesize(organizationId: string, dto: SynthesizeDto) {
    const result = mockSynthesizeSpeech({
      text: dto.text,
      voice: dto.voice,
      format: dto.format,
    });

    const job = await this.prisma.sttsJob.create({
      data: {
        organizationId,
        mode: SttsMode.SYNTHESIZE,
        status: SttsJobStatus.DONE,
        provider: this.provider,
        inputText: dto.text,
        audioRef: result.audioRef,
        mimeType: result.mimeType,
        durationMs: result.durationMs,
        meta: {
          voice: dto.voice || "NOC_ALERT",
          format: dto.format || "mp3",
        },
      },
    });

    this.logger.log(
      `[STTS] synthesize job=${job.id} audioRef=${result.audioRef}`,
    );

    return {
      jobId: job.id,
      provider: this.provider,
      text: dto.text,
      audioRef: result.audioRef,
      mimeType: result.mimeType,
      durationMs: result.durationMs,
      audioBase64: result.sampleBase64,
      status: job.status,
    };
  }
}
