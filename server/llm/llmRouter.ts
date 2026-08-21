import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ENV } from "../_core/env";
import { RateLimiter } from "../_core/rateLimit";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { getLLMService } from "./llmService";

/**
 * AI analysis of diagnostic trouble codes.
 *
 * Each analysis is a paid upstream call, so requests are rate limited per user.
 */

const HOUR_MS = 60 * 60 * 1000;
const analysisLimiter = new RateLimiter(ENV.llm.rateLimitPerHour, HOUR_MS);

// Keep the limiter's bookkeeping from growing without bound on a long-running
// process. Unref'd so it never holds the process open on shutdown.
setInterval(() => analysisLimiter.prune(), HOUR_MS).unref();

const dtcSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[PCBU][0-3][0-9A-F]{3}$/, "Not a valid OBD-II diagnostic trouble code");

function enforceRateLimit(userId: number): void {
  const { allowed, retryAfterSeconds } = analysisLimiter.check(`llm:${userId}`);
  if (!allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Analysis limit reached. Try again in ${retryAfterSeconds} seconds.`,
    });
  }
}

export const llmRouter = router({
  /** Which provider is configured, so the UI can explain a fallback result. */
  status: protectedProcedure.query(() => {
    const service = getLLMService();
    return {
      available: service.isAvailable(),
      provider: service.getActiveProvider(),
    };
  }),

  analyzeCode: protectedProcedure
    .input(
      z.object({
        code: dtcSchema,
        description: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      enforceRateLimit(ctx.user.id);
      return getLLMService().analyzeErrorCode(input.code, input.description ?? "");
    }),

  /**
   * Analyse every trouble code stored on a diagnostic.
   *
   * Ownership is checked before any upstream call, so a foreign diagnostic id
   * cannot be used to spend the account's quota.
   */
  analyzeDiagnostic: protectedProcedure
    .input(z.object({ diagnosticId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const diagnostic = await db.getOwnedDiagnostic(ctx.user.id, input.diagnosticId);
      if (!diagnostic) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Diagnostic not found" });
      }

      const codes = await db.getDiagnosticErrorCodes(input.diagnosticId);
      if (codes.length === 0) {
        return { analyses: [] };
      }

      // One rate-limit slot per code: a diagnostic with many codes costs many
      // upstream calls.
      const service = getLLMService();
      const analyses = [];
      for (const code of codes) {
        enforceRateLimit(ctx.user.id);
        analyses.push(await service.analyzeErrorCode(code.code, code.description ?? ""));
      }

      return { analyses };
    }),
});
