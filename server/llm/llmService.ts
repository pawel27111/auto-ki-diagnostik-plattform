import axios, { AxiosInstance } from "axios";

/**
 * LLM Service
 * Supports both OpenRouter API and local LM Studio for intelligent error code analysis
 */

export interface LLMConfig {
  provider: "openrouter" | "lmstudio" | "auto";
  openrouter?: {
    apiKey: string;
    model?: string;
  };
  lmstudio?: {
    baseUrl: string;
    model?: string;
  };
}

export interface ErrorAnalysis {
  code: string;
  description: string;
  severity: "info" | "warning" | "error" | "critical";
  rootCause: string;
  recommendations: string[];
  estimatedRepairCost: string;
  urgency: "low" | "medium" | "high" | "critical";
}

export class LLMService {
  private config: LLMConfig;
  private openrouterClient?: AxiosInstance;
  private lmstudioClient?: AxiosInstance;
  private activeProvider: "openrouter" | "lmstudio" = "openrouter";

  constructor(config: LLMConfig) {
    this.config = config;
    this.initialize();
  }

  /**
   * Initialize LLM clients
   */
  private initialize(): void {
    // Initialize OpenRouter client
    if (this.config.openrouter?.apiKey) {
      this.openrouterClient = axios.create({
        baseURL: "https://openrouter.ai/api/v1",
        headers: {
          Authorization: `Bearer ${this.config.openrouter.apiKey}`,
          "HTTP-Referer": "https://auto-ki-assistent.local",
          "X-Title": "AutoKI Assistent",
        },
      });
    }

    // Initialize LM Studio client
    if (this.config.lmstudio?.baseUrl) {
      this.lmstudioClient = axios.create({
        baseURL: this.config.lmstudio.baseUrl,
      });
    }

    // Determine active provider
    if (this.config.provider === "auto") {
      this.activeProvider = this.lmstudioClient ? "lmstudio" : "openrouter";
    } else {
      this.activeProvider = this.config.provider;
    }
  }

  /**
   * Analyze error code using LLM
   */
  async analyzeErrorCode(code: string, description: string): Promise<ErrorAnalysis> {
    const prompt = `You are an expert automotive diagnostic AI. Analyze the following OBD error code and provide detailed information.

Error Code: ${code}
Description: ${description}

Provide your response in JSON format with: rootCause, recommendations (array), estimatedRepairCost, urgency.
Be concise and practical.`;

    try {
      if (this.activeProvider === "openrouter" && this.openrouterClient) {
        return await this.analyzeWithOpenRouter(code, description, prompt);
      } else if (this.activeProvider === "lmstudio" && this.lmstudioClient) {
        return await this.analyzeWithLMStudio(code, description, prompt);
      } else {
        // Fallback to default analysis
        return this.getDefaultAnalysis(code, description);
      }
    } catch (error) {
      console.error("[LLM] Error analyzing error code:", error);

      // Fallback to alternative provider
      if (this.activeProvider === "openrouter" && this.lmstudioClient) {
        try {
          return await this.analyzeWithLMStudio(code, description, prompt);
        } catch (fallbackError) {
          console.error("[LLM] Fallback also failed:", fallbackError);
        }
      }

      return this.getDefaultAnalysis(code, description);
    }
  }

  /**
   * Analyze with OpenRouter API
   */
  private async analyzeWithOpenRouter(
    code: string,
    description: string,
    prompt: string
  ): Promise<ErrorAnalysis> {
    if (!this.openrouterClient) {
      throw new Error("OpenRouter client not initialized");
    }

    try {
      const response = await this.openrouterClient.post("/chat/completions", {
        model: this.config.openrouter?.model || "meta-llama/llama-2-70b-chat",
        messages: [
          {
            role: "system",
            content: "You are an expert automotive diagnostic AI assistant. Provide accurate, practical diagnostic information.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenRouter");
      }

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Could not parse JSON response");
      }

      const analysis = JSON.parse(jsonMatch[0]);

      return {
        code,
        description,
        severity: this.determineSeverity(code, analysis.urgency),
        rootCause: analysis.rootCause || "Unknown cause",
        recommendations: analysis.recommendations || [],
        estimatedRepairCost: analysis.estimatedRepairCost || "Unknown",
        urgency: analysis.urgency || "medium",
      };
    } catch (error) {
      console.error("[LLM] OpenRouter analysis failed:", error);
      throw error;
    }
  }

  /**
   * Analyze with local LM Studio
   */
  private async analyzeWithLMStudio(
    code: string,
    description: string,
    prompt: string
  ): Promise<ErrorAnalysis> {
    if (!this.lmstudioClient) {
      throw new Error("LM Studio client not initialized");
    }

    try {
      const response = await this.lmstudioClient.post("/v1/chat/completions", {
        model: this.config.lmstudio?.model || "local-model",
        messages: [
          {
            role: "system",
            content: "You are an expert automotive diagnostic AI assistant. Provide accurate, practical diagnostic information.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from LM Studio");
      }

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Could not parse JSON response");
      }

      const analysis = JSON.parse(jsonMatch[0]);

      return {
        code,
        description,
        severity: this.determineSeverity(code, analysis.urgency),
        rootCause: analysis.rootCause || "Unknown cause",
        recommendations: analysis.recommendations || [],
        estimatedRepairCost: analysis.estimatedRepairCost || "Unknown",
        urgency: analysis.urgency || "medium",
      };
    } catch (error) {
      console.error("[LLM] LM Studio analysis failed:", error);
      throw error;
    }
  }

  /**
   * Determine severity based on error code and urgency
   */
  private determineSeverity(
    code: string,
    urgency: string
  ): "info" | "warning" | "error" | "critical" {
    // Critical error codes
    if (
      code.startsWith("P0") &&
      ["0300", "0420", "0505", "0606"].some((c) => code.includes(c))
    ) {
      return "critical";
    }

    // Map urgency to severity
    switch (urgency?.toLowerCase()) {
      case "critical":
        return "critical";
      case "high":
        return "error";
      case "medium":
        return "warning";
      default:
        return "info";
    }
  }

  /**
   * Get default analysis (fallback)
   */
  private getDefaultAnalysis(
    code: string,
    description: string
  ): ErrorAnalysis {
    // Common error code mappings
    const commonCodes: { [key: string]: ErrorAnalysis } = {
      P0101: {
        code: "P0101",
        description: "Mass or Volume Air Flow Circuit Range/Performance",
        severity: "warning",
        rootCause: "MAF sensor malfunction or air leak",
        recommendations: [
          "Clean or replace MAF sensor",
          "Check for air leaks",
          "Inspect air filter",
        ],
        estimatedRepairCost: "100-300 EUR",
        urgency: "medium",
      },
      P0300: {
        code: "P0300",
        description: "Random/Multiple Cylinder Misfire Detected",
        severity: "error",
        rootCause: "Ignition or fuel system issue",
        recommendations: [
          "Check spark plugs",
          "Inspect fuel injectors",
          "Check ignition coils",
        ],
        estimatedRepairCost: "200-500 EUR",
        urgency: "high",
      },
      P0171: {
        code: "P0171",
        description: "System Too Lean (Bank 1)",
        severity: "warning",
        rootCause: "Fuel system pressure or oxygen sensor issue",
        recommendations: [
          "Check fuel pressure",
          "Inspect oxygen sensor",
          "Check for vacuum leaks",
        ],
        estimatedRepairCost: "150-400 EUR",
        urgency: "medium",
      },
      P0420: {
        code: "P0420",
        description: "Catalyst System Efficiency Below Threshold",
        severity: "error",
        rootCause: "Catalytic converter failure",
        recommendations: [
          "Replace catalytic converter",
          "Check oxygen sensors",
          "Inspect exhaust system",
        ],
        estimatedRepairCost: "500-1500 EUR",
        urgency: "high",
      },
    };

    return (
      commonCodes[code] || {
        code,
        description,
        severity: "warning",
        rootCause: "Please consult a professional mechanic",
        recommendations: [
          "Have the vehicle scanned by a professional",
          "Consult the vehicle manual",
          "Visit an authorized service center",
        ],
        estimatedRepairCost: "Unknown",
        urgency: "medium",
      }
    );
  }

  /**
   * Check OpenRouter availability
   */
  async checkOpenRouterAvailability(): Promise<boolean> {
    if (!this.openrouterClient) return false;

    try {
      const response = await this.openrouterClient.get("/models");
      return response.status === 200;
    } catch (error) {
      console.error("[LLM] OpenRouter unavailable:", error);
      return false;
    }
  }

  /**
   * Check LM Studio availability
   */
  async checkLMStudioAvailability(): Promise<boolean> {
    if (!this.lmstudioClient) return false;

    try {
      const response = await this.lmstudioClient.get("/v1/models");
      return response.status === 200;
    } catch (error) {
      console.error("[LLM] LM Studio unavailable:", error);
      return false;
    }
  }

  /**
   * Get active provider
   */
  getActiveProvider(): string {
    return this.activeProvider;
  }

  /**
   * Switch provider
   */
  switchProvider(provider: "openrouter" | "lmstudio"): void {
    if (provider === "openrouter" && this.openrouterClient) {
      this.activeProvider = "openrouter";
      console.log("[LLM] Switched to OpenRouter");
    } else if (provider === "lmstudio" && this.lmstudioClient) {
      this.activeProvider = "lmstudio";
      console.log("[LLM] Switched to LM Studio");
    } else {
      console.warn("[LLM] Provider not available:", provider);
    }
  }
}

// Export singleton instance
let llmService: LLMService;

export function initializeLLMService(config: LLMConfig): LLMService {
  llmService = new LLMService(config);
  return llmService;
}

export function getLLMService(): LLMService {
  if (!llmService) {
    throw new Error("LLM Service not initialized");
  }
  return llmService;
}
