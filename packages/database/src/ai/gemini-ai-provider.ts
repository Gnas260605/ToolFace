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
  ViralScoreItem,
  ViralScoringInput,
  ViralScoreResultSchema,
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
      // eslint-disable-next-line no-console
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
          const timeoutMs = context.timeoutMs || 60000;
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('AI_REQUEST_TIMEOUT')), timeoutMs);
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
              if (parsed.length > 0 && parsed[0]?.score !== undefined) {
                // Keep as array for viral scoring
              } else if (parsed.length > 0 && parsed[0]?.claimId !== undefined) {
                parsed = { sourceClaims: parsed };
              }
            } else if (parsed && typeof parsed === 'object') {
              if (Array.isArray(parsed.articles)) parsed = parsed.articles;
              else if (Array.isArray(parsed.data)) parsed = parsed.data;
              else if (Array.isArray(parsed.results)) parsed = parsed.results;
              else {
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
            // eslint-disable-next-line no-console
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
    const systemPrompt = `You are a professional fact-checking journalist assistant. Extract atomic, verified facts and named entities from the provided news source articles into structured JSON.
Strictly ensure that all extracted claims and facts are directly supported by evidence excerpts from the sources.
Return ONLY valid JSON matching this structure:
{
  "sourceClaims": [
    {
      "claimId": "claim-1",
      "text": "statement",
      "sourceArticleId": "article-id",
      "evidenceExcerpt": "exact quote or paraphrased sentence",
      "confidence": 0.95,
      "status": "CONFIRMED"
    }
  ],
  "entities": [
    {
      "type": "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "GROUP" | "OTHER",
      "canonicalName": "Name",
      "aliases": []
    }
  ],
  "dates": [],
  "numbers": [],
  "scores": [],
  "quotes": [],
  "conflicts": [],
  "uncertaintyFlags": []
}`;

    const prompt = `Source Articles:\n${JSON.stringify(input.sources, null, 2)}`;
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
    const systemPrompt = `You are an elite Facebook content writer and social media journalist. Rewrite the given fact sheet into an engaging, viral, high-converting Facebook post following the brand rules and persona.
Tone: ${input.brandRules.tone}. Audience: ${input.brandRules.audience}.
Writing rules: ${input.brandRules.writingRules.join('; ')}.
Forbidden words: ${input.brandRules.forbiddenPhrases.join(', ')}.
Default hashtags: ${input.brandRules.defaultHashtags.join(' ')}.
Headline style: ${input.brandRules.headlineStyle}. Emoji policy: ${input.brandRules.emojiPolicy}.
Return ONLY valid JSON matching this structure:
{
  "headline": "Catchy post title",
  "hook": "Strong engaging opening hook line",
  "body": "Clear, informative, engaging body text",
  "whyItMatters": "Why reader should care",
  "discussionQuestion": "Question to provoke comments",
  "hashtags": ["#Tag1", "#Tag2"],
  "attributionLine": "Nguồn: ...",
  "recommendedLink": "...",
  "contentType": "BREAKING" | "SUMMARY" | "ANALYSIS" | "DISCUSSION",
  "riskFlags": [],
  "sourceClaimIds": []
}`;

    const prompt = `FactSheet:\n${JSON.stringify(input.factSheet, null, 2)}`;
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

  async scoreViralPotential(
    input: ViralScoringInput,
    context: AiRequestContext
  ): Promise<AiResult<ViralScoreItem[]>> {
    const startTime = Date.now();
    const systemPrompt = `Bạn là chuyên gia social media growth tại Việt Nam, chuyên chọn tin để đăng Facebook đạt tương tác cao nhất.

Dưới đây là danh sách bài viết (tiêu đề + tóm tắt + nguồn + thời gian đăng). 
Hãy chấm điểm TỪNG bài theo thang 0-100 dựa trên khả năng viral trên Facebook Việt Nam, dựa vào các tiêu chí sau (trọng số):

1. Tính thời sự / độ mới (25%): bài càng gần với sự kiện đang diễn ra càng cao điểm
2. Kích hoạt cảm xúc mạnh (25%): sốc, bất ngờ, cảm động, tức giận, tò mò — cảm xúc càng mạnh càng dễ share
3. Mức độ liên quan đến xu hướng hiện tại (20%): trùng với chủ đề đang hot trên mạng xã hội VN
4. Tính đại chúng / dễ hiểu (15%): không cần kiến thức chuyên sâu để hiểu và bình luận
5. Khả năng gây tranh luận/bình luận (15%): có góc nhìn trái chiều, chủ đề dễ tranh cãi nhưng không nhạy cảm chính trị/tôn giáo

Với mỗi bài, trả về CHÍNH XÁC định dạng mảng JSON sau, KHÔNG thêm text nào khác ngoài JSON:

[
  {
    "id": "<id bài viết>",
    "score": <số nguyên 0-100>,
    "reason": "<lý do ngắn gọn 1 câu>",
    "category": "<xã hội|giải trí|đời sống|công nghệ|thể thao|khác>"
  }
]`;

    const articlesPayload = input.articles.map((a) => ({
      id: a.id,
      title: a.title,
      summary: a.summary || '',
      source: a.sourceName || '',
      publishedAt: a.publishedAt ? new Date(a.publishedAt).toISOString() : '',
    }));

    const prompt = `Danh sách bài viết:\n${JSON.stringify(articlesPayload, null, 2)}`;

    const result = await this.callGemini<ViralScoreItem[]>(
      prompt,
      systemPrompt,
      'gemini-2.5-flash',
      ViralScoreResultSchema,
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
