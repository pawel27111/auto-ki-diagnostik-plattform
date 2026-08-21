import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { llmRouter } from "./llm/llmRouter";
import { obdRouter } from "./obdRouter";

export const appRouter = router({
  // Socket.io is registered in server/_core/index.ts and served under
  // /api/socket.io so the gateway routes it like the rest of the API.
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // OBD Diagnostic Router
  obd: obdRouter,

  // AI analysis of diagnostic trouble codes
  llm: llmRouter,
});

export type AppRouter = typeof appRouter;
