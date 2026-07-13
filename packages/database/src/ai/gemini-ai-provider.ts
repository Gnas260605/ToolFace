/* eslint-disable @typescript-eslint/no-explicit-any */
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  AiProvider,
  AiRequestContext,
  AiResult,
  FactSheet,
  GeneratedDraft,
  DraftVerificationResult,
  FactSheetSchema,
  GeneratedDraftSchema,
  DraftVerificationResultSchema,
  FactExtractionInput,
  DraftGenerationInput,
  DraftVerificationInput,
} from './ai-provider.interface';

export class GeminiAiProvider implements AiProvider {
  private genAi: GoogleGenerativeAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('AI_PROVIDER_NOT_CONFIGURED');
    }
    this.genAi = new GoogleGenerativeAI(apiKey);
  }

  private async callGemini<T>(
    prompt: string,
    systemInstruction: string,
    modelName: string,
    schema: any,
    context: AiRequestContext
  ): Promise<{ data: T; inputTokens: number; outputTokens: number }> {
    try {
      const model = this.genAi.getGenerativeModel({
        model: modelName || 'gemini-1.5-flash',
        systemInstruction,
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      // Implement timeout/cancellation using Promise.race
      const apiCall = model.generateContent(prompt);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('AI_REQUEST_TIMEOUT')), context.timeoutMs);
      });

      const response = await Promise.race([apiCall, timeoutPromise]);
      const text = response.response.text();
      const usage = response.response.usageMetadata;

      if (!text) {
        throw new Error('AI_INVALID_RESPONSE');
      }

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('AI_INVALID_RESPONSE');
      }

      const validated = schema.parse(parsed);

      return {
        data: validated as T,
        inputTokens: usage?.promptTokenCount || 0,
        outputTokens: usage?.candidatesTokenCount || 0,
      };
    } catch (err: any) {
      if (err.message === 'AI_REQUEST_TIMEOUT') {
        throw err;
      }
      if (err.status === 429) {
        throw new Error('AI_RATE_LIMITED');
      }
      if (err.name === 'ZodError') {
        throw new Error('AI_SCHEMA_VALIDATION_FAILED');
      }
      throw new Error(`AI_PROVIDER_UNAVAILABLE: ${err.message}`);
    }
  }

  async extractFacts(
    input: FactExtractionInput,
    context: AiRequestContext
  ): Promise<AiResult<FactSheet>> {
    const start = Date.now();
    const systemInstruction = `You are a fact extraction bot. Extract all concrete facts from the provided source articles. Do not add outside information. Return a structured JSON matching the requested schema.`;
    const prompt = `Sources to extract:\n${JSON.stringify(input.sources)}`;

    const modelName = process.env.AI_FACT_EXTRACTION_MODEL || 'gemini-1.5-flash';
    const { data, inputTokens, outputTokens } = await this.callGemini<FactSheet>(
      prompt,
      systemInstruction,
      modelName,
      FactSheetSchema,
      context
    );

    // Approximate cost: 0.075$ per 1M input tokens, 0.3$ per 1M output tokens (minor is 1/10000 of dollar)
    const cost = Math.ceil((inputTokens * 0.075 + outputTokens * 0.3) / 100);

    return {
      data,
      provider: 'gemini',
      model: modelName,
      inputTokens,
      outputTokens,
      estimatedCostMinor: cost,
      currency: 'USD',
      durationMs: Date.now() - start,
    };
  }

  async generateDraft(
    input: DraftGenerationInput,
    context: AiRequestContext
  ): Promise<AiResult<GeneratedDraft>> {
    const start = Date.now();
    const systemInstruction = `You are an editorial assistant writing a Facebook post draft.
Use ONLY the supplied fact sheet. Respect tone, audience and writing rules from brand settings.
Forbidden phrases MUST NOT appear in the draft. Return valid structured JSON matching the draft schema.`;

    const prompt = `Fact Sheet:\n${JSON.stringify(input.factSheet)}\n\nBrand Rules:\n${JSON.stringify(input.brandRules)}\nContent Type: ${input.contentType}\nLanguage: ${input.language}`;

    const modelName = process.env.AI_DRAFT_GENERATION_MODEL || 'gemini-1.5-flash';
    const { data, inputTokens, outputTokens } = await this.callGemini<GeneratedDraft>(
      prompt,
      systemInstruction,
      modelName,
      GeneratedDraftSchema,
      context
    );

    const cost = Math.ceil((inputTokens * 0.075 + outputTokens * 0.3) / 100);

    return {
      data,
      provider: 'gemini',
      model: modelName,
      inputTokens,
      outputTokens,
      estimatedCostMinor: cost,
      currency: 'USD',
      durationMs: Date.now() - start,
    };
  }

  async verifyDraft(
    input: DraftVerificationInput,
    context: AiRequestContext
  ): Promise<AiResult<DraftVerificationResult>> {
    const start = Date.now();
    const systemInstruction = `You are an independent editorial verifier. Compare the generated draft against the fact sheet. Detect score mismatches, date mismatches, fabricated quotes, or unsupported claims. Return structured JSON matching the verification schema.`;
    const prompt = `Fact Sheet:\n${JSON.stringify(input.factSheet)}\n\nGenerated Draft:\n${JSON.stringify(input.generatedDraft)}`;

    const modelName = process.env.AI_DRAFT_VERIFICATION_MODEL || 'gemini-1.5-flash';
    const { data, inputTokens, outputTokens } = await this.callGemini<DraftVerificationResult>(
      prompt,
      systemInstruction,
      modelName,
      DraftVerificationResultSchema,
      context
    );

    const cost = Math.ceil((inputTokens * 0.075 + outputTokens * 0.3) / 100);

    return {
      data,
      provider: 'gemini',
      model: modelName,
      inputTokens,
      outputTokens,
      estimatedCostMinor: cost,
      currency: 'USD',
      durationMs: Date.now() - start,
    };
  }
}
