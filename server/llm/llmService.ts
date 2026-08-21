import axios, { type AxiosInstance } from "axios";
import { z } from "zod";
import { severityForCode, type Severity } from "../obd/protocol";

/**
 * LLM service for interpreting OBD trouble codes.
 *
 * Supports OpenRouter and a local LM Studio instance. Both speak the OpenAI
 * chat-completions shape, so a single request path covers them; only the base
 * URL, auth header and default model differ.
 *
 * Model output is untrusted input: it is validated against {@link analysisSchema}
 * before any field is used, and every failure falls back to the static
 * catalogue rather than surfacing a partially-parsed analysis.
 */

export type LLMProvider = "openrouter" | "lmstudio";

export interface LLMConfig {
  provider: LLMProvider | "auto";
  openrouter?: {
    apiKey: string;
    model?: string;
  };
  lmstudio?: {
    baseUrl: string;
    model?: string;
  };
  /** Per-request timeout. Without one a stalled provider hangs the caller. */
  timeoutMs?: number;
}

export interface ErrorAnalysis {
  code: string;
  description: string;
  severity: Severity;
  rootCause: string;
  recommendations: string[];
  estimatedRepairCost: string;
  urgency: "low" | "medium" | "high" | "critical";
  /** Which provider produced this, or "fallback" for the static catalogue. */
  source: LLMProvider | "fallback";
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-3.5-sonnet";
const DEFAULT_LMSTUDIO_MODEL = "local-model";

/** Shape the model is asked to return. Anything else is rejected. */
const analysisSchema = z.object({
  rootCause: z.string().min(1).max(2000),
  recommendations: z.array(z.string().min(1).max(500)).min(1).max(10),
  estimatedRepairCost: z.string().min(1).max(100),
  urgency: z.enum(["low", "medium", "high", "critical"]),
});

const chatCompletionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }) }))
    .min(1),
});

const SYSTEM_PROMPT =
  "You are an expert automotive diagnostic assistant. Answer with a single JSON object and no other text.";

function buildPrompt(code: string, description: string): string {
  return `Analyse this OBD-II diagnostic trouble code.

Error code: ${code}
Reported description: ${description || "(none supplied by the adapter)"}

Reply with exactly this JSON object and nothing else:
{
  "rootCause": "one or two sentences on the most likely cause",
  "recommendations": ["concrete check or repair step", "..."],
  "estimatedRepairCost": "a range in EUR, e.g. 150-400 EUR",
  "urgency": "low" | "medium" | "high" | "critical"
}`;
}

/**
 * Pull the JSON object out of a model reply.
 *
 * Models wrap JSON in prose or markdown fences often enough that requiring a
 * bare object would fail on otherwise good answers.
 */
function extractJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : content;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Model reply contained no JSON object");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

export class LLMService {
  private config: LLMConfig;
  private clients: Partial<Record<LLMProvider, AxiosInstance>> = {};
  private models: Partial<Record<LLMProvider, string>> = {};
  private activeProvider: LLMProvider;

  constructor(config: LLMConfig) {
    this.config = config;
    const timeout = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (config.openrouter?.apiKey) {
      this.clients.openrouter = axios.create({
        baseURL: "https://openrouter.ai/api/v1",
        timeout,
        headers: {
          Authorization: `Bearer ${config.openrouter.apiKey}`,
          "HTTP-Referer": "https://auto-ki-assistent.local",
          "X-Title": "AutoKI Assistent",
        },
      });
      this.models.openrouter =
        config.openrouter.model || DEFAULT_OPENROUTER_MODEL;
    }

    if (config.lmstudio?.baseUrl) {
      this.clients.lmstudio = axios.create({
        baseURL: config.lmstudio.baseUrl.replace(/\/+$/, ""),
        timeout,
      });
      this.models.lmstudio = config.lmstudio.model || DEFAULT_LMSTUDIO_MODEL;
    }

    if (config.provider === "auto") {
      // Prefer the local model when one is configured: no per-request cost and
      // vehicle data never leaves the machine.
      this.activeProvider = this.clients.lmstudio ? "lmstudio" : "openrouter";
    } else {
      this.activeProvider = config.provider;
    }
  }

  getActiveProvider(): LLMProvider {
    return this.activeProvider;
  }

  isAvailable(): boolean {
    return Object.keys(this.clients).length > 0;
  }

  switchProvider(provider: LLMProvider): boolean {
    if (!this.clients[provider]) {
      console.warn("[LLM] Provider not configured:", provider);
      return false;
    }
    this.activeProvider = provider;
    console.log(`[LLM] Switched to ${provider}`);
    return true;
  }

  /**
   * Analyse a trouble code, falling back through the configured providers and
   * finally to the static catalogue. Never throws.
   */
  async analyzeErrorCode(
    code: string,
    description = ""
  ): Promise<ErrorAnalysis> {
    // Try the active provider first, then any other configured one. The old
    // implementation only fell back in the OpenRouter -> LM Studio direction.
    const order: LLMProvider[] = [
      this.activeProvider,
      ...(["openrouter", "lmstudio"] as LLMProvider[]).filter(
        p => p !== this.activeProvider
      ),
    ];

    for (const provider of order) {
      if (!this.clients[provider]) continue;
      try {
        return await this.analyzeWith(provider, code, description);
      } catch (error) {
        console.error(
          `[LLM] ${provider} analysis failed:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    return this.getDefaultAnalysis(code, description);
  }

  /**
   * One request path for both providers. They differ only in base URL, auth and
   * model name, all of which are resolved in the constructor.
   */
  private async analyzeWith(
    provider: LLMProvider,
    code: string,
    description: string
  ): Promise<ErrorAnalysis> {
    const client = this.clients[provider];
    if (!client) throw new Error(`${provider} client not initialised`);

    const response = await client.post("/chat/completions", {
      model: this.models[provider],
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(code, description) },
      ],
      temperature: 0.2, // diagnostics should be reproducible, not creative
      max_tokens: 1000,
      response_format: { type: "json_object" },
    });

    const payload = chatCompletionSchema.parse(response.data);
    const content = payload.choices[0].message.content;
    if (!content) throw new Error(`Empty response from ${provider}`);

    const analysis = analysisSchema.parse(extractJson(content));

    return {
      code,
      description,
      // The rule-based severity is the floor: a model must not downgrade a
      // misfire to "info".
      severity: this.combineSeverity(code, analysis.urgency),
      rootCause: analysis.rootCause,
      recommendations: analysis.recommendations,
      estimatedRepairCost: analysis.estimatedRepairCost,
      urgency: analysis.urgency,
      source: provider,
    };
  }

  /**
   * Merge the rule-based severity for a code with the model's urgency, keeping
   * whichever is more serious.
   */
  private combineSeverity(
    code: string,
    urgency: ErrorAnalysis["urgency"]
  ): Severity {
    const ranking: Severity[] = ["info", "warning", "error", "critical"];
    const fromUrgency: Severity =
      urgency === "critical"
        ? "critical"
        : urgency === "high"
          ? "error"
          : urgency === "medium"
            ? "warning"
            : "info";
    const fromCode = severityForCode(code);
    return ranking.indexOf(fromUrgency) > ranking.indexOf(fromCode)
      ? fromUrgency
      : fromCode;
  }

  /**
   * Static catalogue used when no provider answers. Deliberately generic for
   * unknown codes — a wrong specific repair suggestion is worse than none.
   */
  getDefaultAnalysis(code: string, description = ""): ErrorAnalysis {
    const normalized = code.toUpperCase();
    const known = COMMON_CODES[normalized];
    if (known) return { ...known, source: "fallback" };

    return {
      code: normalized,
      description,
      severity: severityForCode(normalized),
      rootCause:
        "No stored interpretation for this code and no analysis provider available.",
      recommendations: [
        "Have the vehicle scanned by a professional",
        "Consult the vehicle manual for this code",
        "Visit an authorised service centre",
      ],
      estimatedRepairCost: "Unknown",
      urgency: "medium",
      source: "fallback",
    };
  }

  private async checkAvailability(
    provider: LLMProvider,
    path: string
  ): Promise<boolean> {
    const client = this.clients[provider];
    if (!client) return false;
    try {
      const response = await client.get(path);
      return response.status === 200;
    } catch (error) {
      console.error(
        `[LLM] ${provider} unavailable:`,
        error instanceof Error ? error.message : error
      );
      return false;
    }
  }

  checkOpenRouterAvailability(): Promise<boolean> {
    return this.checkAvailability("openrouter", "/models");
  }

  checkLMStudioAvailability(): Promise<boolean> {
    return this.checkAvailability("lmstudio", "/models");
  }
}

const COMMON_CODES: Record<string, Omit<ErrorAnalysis, "source">> = {
  P0101: {
    code: "P0101",
    description: "Mass or Volume Air Flow Circuit Range/Performance",
    severity: "warning",
    rootCause: "MAF sensor malfunction or an unmetered air leak",
    recommendations: [
      "Clean or replace the MAF sensor",
      "Check for air leaks",
      "Inspect the air filter",
    ],
    estimatedRepairCost: "100-300 EUR",
    urgency: "medium",
  },
  P0171: {
    code: "P0171",
    description: "System Too Lean (Bank 1)",
    severity: "error",
    rootCause: "Vacuum leak, low fuel pressure or a drifting oxygen sensor",
    recommendations: [
      "Check fuel pressure",
      "Inspect the oxygen sensor",
      "Check for vacuum leaks",
    ],
    estimatedRepairCost: "150-400 EUR",
    urgency: "medium",
  },
  P0300: {
    code: "P0300",
    description: "Random/Multiple Cylinder Misfire Detected",
    severity: "critical",
    rootCause:
      "Ignition or fuel delivery fault affecting more than one cylinder",
    recommendations: [
      "Check spark plugs",
      "Inspect fuel injectors",
      "Check ignition coils",
    ],
    estimatedRepairCost: "200-500 EUR",
    urgency: "high",
  },
  P0420: {
    code: "P0420",
    description: "Catalyst System Efficiency Below Threshold",
    severity: "error",
    rootCause:
      "Degraded catalytic converter, or a downstream oxygen sensor reading incorrectly",
    recommendations: [
      "Verify the downstream oxygen sensor before replacing the catalyst",
      "Inspect the exhaust system for leaks",
      "Replace the catalytic converter if the sensor checks out",
    ],
    estimatedRepairCost: "500-1500 EUR",
    urgency: "high",
  },
};

let llmService: LLMService | null = null;

export function initializeLLMService(config: LLMConfig): LLMService {
  llmService = new LLMService(config);
  console.log(
    `[LLM] Initialised (active provider: ${llmService.getActiveProvider()}, configured: ${llmService.isAvailable()})`
  );
  return llmService;
}

export function getLLMService(): LLMService {
  if (!llmService) {
    throw new Error("LLM Service not initialized");
  }
  return llmService;
}
