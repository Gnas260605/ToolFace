/* eslint-disable @typescript-eslint/no-explicit-any */
import OpenAI from 'openai';
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

export class OpenAiProvider implements AiProvider {
  protected openai: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    if (!apiKey) {
      throw new Error('AI_PROVIDER_NOT_CONFIGURED');
    }
    this.openai = new OpenAI({ apiKey, baseURL });
  }

  protected async callOpenAi<T>(
    prompt: string,
    systemInstruction: string,
    modelName: string,
    schema: any,
    context: AiRequestContext
  ): Promise<{ data: T; inputTokens: number; outputTokens: number }> {
    try {
      const apiCall = this.openai.chat.completions.create({
        model: modelName || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('AI_REQUEST_TIMEOUT')), context.timeoutMs);
      });

      const response = await Promise.race([apiCall, timeoutPromise]);
      const text = response.choices[0]?.message?.content;
      const usage = response.usage;

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
        inputTokens: usage?.prompt_tokens || 0,
        outputTokens: usage?.completion_tokens || 0,
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

    const modelName = process.env.AI_FACT_EXTRACTION_MODEL || 'gpt-4o-mini';
    const { data, inputTokens, outputTokens } = await this.callOpenAi<FactSheet>(
      prompt,
      systemInstruction,
      modelName,
      FactSheetSchema,
      context
    );

    const cost = Math.ceil((inputTokens * 0.15 + outputTokens * 0.6) / 100);

    return {
      data,
      provider: 'openai',
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

    const modelName = process.env.AI_DRAFT_GENERATION_MODEL || 'gpt-4o-mini';
    const { data, inputTokens, outputTokens } = await this.callOpenAi<GeneratedDraft>(
      prompt,
      systemInstruction,
      modelName,
      GeneratedDraftSchema,
      context
    );

    const cost = Math.ceil((inputTokens * 0.15 + outputTokens * 0.6) / 100);

    return {
      data,
      provider: 'openai',
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

    const modelName = process.env.AI_DRAFT_VERIFICATION_MODEL || 'gpt-4o-mini';
    const { data, inputTokens, outputTokens } = await this.callOpenAi<DraftVerificationResult>(
      prompt,
      systemInstruction,
      modelName,
      DraftVerificationResultSchema,
      context
    );

    const cost = Math.ceil((inputTokens * 0.15 + outputTokens * 0.6) / 100);

    return {
      data,
      provider: 'openai',
      model: modelName,
      inputTokens,
      outputTokens,
      estimatedCostMinor: cost,
      currency: 'USD',
      durationMs: Date.now() - start,
    };
  }
}
