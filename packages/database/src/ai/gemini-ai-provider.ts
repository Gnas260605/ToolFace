/* eslint-disable @typescript-eslint/no-explicit-any */
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  AiProvider,
  AiRequestContext,
  AiResult,
  FactSheet,
  GeneratedDraft,
  DraftVerificationResult,
  FactExtractionInput,
  DraftGenerationInput,
  DraftVerificationInput,
  FactSheetSchema,
  GeneratedDraftSchema,
  DraftVerificationResultSchema,
} from './ai-provider.interface';

export class GeminiAiProvider implements AiProvider {
  private readonly keys: string[];
  private currentKeyIndex = 0;
  private readonly fallbackModels = [
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-1.5-pro',
  ];

  constructor(apiKey: string | string[]) {
    const keyList = Array.isArray(apiKey)
      ? apiKey
      : String(apiKey)
          .split(/[\n,;]+/)
          .map((k) => k.trim())
          .filter(Boolean);

    if (keyList.length === 0) {
      throw new Error('Gemini API Key is required for GeminiAiProvider.');
    }
    this.keys = keyList;
  }

  private getGenAi(): { genAi: GoogleGenerativeAI; key: string } {
    const key = this.keys[this.currentKeyIndex % this.keys.length];
    return { genAi: new GoogleGenerativeAI(key), key };
  }

  private rotateKey() {
    if (this.keys.length > 1) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
      console.log(`[GeminiAiProvider] Rotating to API key #${this.currentKeyIndex + 1}/${this.keys.length}`);
    }
  }

  private async callGemini<T>(
    prompt: string,
    systemInstruction: string,
    requestedModel: string,
    schema: any,
    context: AiRequestContext
  ): Promise<{ data: T; inputTokens: number; outputTokens: number }> {
    const modelsToTry = [requestedModel, ...this.fallbackModels.filter((m) => m !== requestedModel)];
    let lastErr: any = null;

    for (const modelName of modelsToTry) {
      let keyAttempts = 0;
      const maxKeyAttempts = this.keys.length;

      while (keyAttempts < maxKeyAttempts) {
        keyAttempts++;
        const { genAi } = this.getGenAi();

        try {
          const model = genAi.getGenerativeModel({
            model: modelName,
            systemInstruction,
            generationConfig: {
              responseMimeType: 'application/json',
            },
          });

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
            if (Array.isArray(parsed)) {
              parsed = { sourceClaims: parsed };
            }
            if (parsed && typeof parsed === 'object') {
              if (parsed.draft && typeof parsed.draft === 'object') parsed = parsed.draft;
              if (parsed.data && typeof parsed.data === 'object') parsed = parsed.data;
              if (parsed.facts && typeof parsed.facts === 'object') parsed = parsed.facts;

              if (!parsed.headline && parsed.title) parsed.headline = String(parsed.title);
              if (!parsed.hook && (parsed.summary || parsed.intro || parsed.lead)) {
                parsed.hook = String(parsed.summary || parsed.intro || parsed.lead);
              }
              if (!parsed.body && (parsed.content || parsed.text || parsed.article)) {
                parsed.body = String(parsed.content || parsed.text || parsed.article);
              }
            }
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
          lastErr = err;
          const isRateLimit = err?.status === 429 || (err?.message && (String(err.message).includes('429') || String(err.message).includes('RESOURCE_EXHAUSTED') || String(err.message).includes('quota') || String(err.message).includes('limit')));
          if (isRateLimit) {
            this.rotateKey();
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }
          if (err.message === 'AI_REQUEST_TIMEOUT') {
            throw err;
          }
          if (err.name === 'ZodError') {
            console.error('Gemini ZodError:', JSON.stringify(err.issues, null, 2));
            throw new Error('AI_SCHEMA_VALIDATION_FAILED');
          }
          break;
        }
      }
    }

    if (lastErr?.status === 429 || (lastErr?.message && String(lastErr.message).includes('RESOURCE_EXHAUSTED'))) {
      throw new Error('AI_RATE_LIMITED');
    }
    throw new Error(`AI_PROVIDER_UNAVAILABLE: ${lastErr?.message || 'All models and keys exhausted'}`);
  }

  async extractFacts(
    input: FactExtractionInput,
    context: AiRequestContext
  ): Promise<AiResult<FactSheet>> {
    const startTime = Date.now();
    const systemPrompt = `You are a professional fact-checker AI. Extract all verifiable facts, claims, entities, dates, numbers, quotes, and scores from the provided articles.
Return ONLY valid JSON matching this exact structure:
{
  "articleIds": ["string"],
  "sourceClaims": [{"claimId": "string", "text": "string", "sourceArticleId": "string", "evidenceExcerpt": "string", "confidence": 0.9, "status": "CONFIRMED"}],
  "entities": [{"canonicalName": "string", "type": "PERSON", "aliases": []}],
  "dates": [{"value": "string", "context": "string", "sourceArticleIds": ["string"], "confidence": 0.9}],
  "numbers": [{"value": "string", "unit": "string", "context": "string", "sourceArticleIds": ["string"], "confidence": 0.9}],
  "scores": [],
  "quotes": [],
  "conflicts": [],
  "uncertaintyFlags": []
}`;

    const prompt = `Articles to analyze:\n${JSON.stringify(input.sources, null, 2)}`;
    const result = await this.callGemini<FactSheet>(
      prompt,
      systemPrompt,
      'gemini-2.5-flash',
      FactSheetSchema,
      context
    );

    return {
      data: result.data,
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostMinor: 0,
      currency: 'USD',
      durationMs: Date.now() - startTime,
    };
  }

  async generateDraft(
    input: DraftGenerationInput,
    context: AiRequestContext
  ): Promise<AiResult<GeneratedDraft>> {
    const startTime = Date.now();
    const systemPrompt = `You are an expert social media copywriter. Generate a high-engaging post in Vietnamese based strictly on the provided factsheet.
Return ONLY valid JSON matching this exact structure:
{
  "language": "vi",
  "headline": "Tiêu đề hấp dẫn",
  "hook": "Mở đầu lôi cuốn thu hút người đọc",
  "body": "Nội dung bài viết chi tiết dựa trên tin tức thực tế...",
  "whyItMatters": "Tại sao tin này quan trọng",
  "discussionQuestion": "Câu hỏi thảo luận cho độc giả?",
  "hashtags": ["TinTuc", "NoiBat"],
  "attributionLine": "Nguồn: Tổng hợp",
  "recommendedLink": "",
  "contentType": "SUMMARY",
  "sourceClaimIds": [],
  "riskFlags": [],
  "confidence": 0.95
}`;

    const prompt = `FactSheet:\n${JSON.stringify(input.factSheet, null, 2)}\n\nBrand Rules:\n${JSON.stringify(input.brandRules, null, 2)}`;
    const result = await this.callGemini<GeneratedDraft>(
      prompt,
      systemPrompt,
      'gemini-2.5-flash',
      GeneratedDraftSchema,
      context
    );

    return {
      data: result.data,
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostMinor: 0,
      currency: 'USD',
      durationMs: Date.now() - startTime,
    };
  }

  async verifyDraft(
    input: DraftVerificationInput,
    context: AiRequestContext
  ): Promise<AiResult<DraftVerificationResult>> {
    const startTime = Date.now();
    const systemPrompt = `You are a compliance AI validator. Verify if the generated social post strictly matches the fact sheet without hallucination.
Return ONLY valid JSON matching this exact structure:
{
  "passed": true,
  "blockingErrors": [],
  "warnings": [],
  "unsupportedClaims": [],
  "changedEntities": [],
  "changedDates": [],
  "changedNumbers": [],
  "changedScores": [],
  "quoteIssues": [],
  "similarityScore": 0.95,
  "riskFlags": []
}`;

    const prompt = `Draft:\n${JSON.stringify(input.generatedDraft, null, 2)}\n\nFactSheet:\n${JSON.stringify(input.factSheet, null, 2)}`;
    const result = await this.callGemini<DraftVerificationResult>(
      prompt,
      systemPrompt,
      'gemini-2.5-flash',
      DraftVerificationResultSchema,
      context
    );

    return {
      data: result.data,
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostMinor: 0,
      currency: 'USD',
      durationMs: Date.now() - startTime,
    };
  }
}
