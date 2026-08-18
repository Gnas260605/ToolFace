import { OpenAiProvider } from './openai-ai-provider';
import {
  AiRequestContext,
  AiResult,
  FactSheet,
  GeneratedDraft,
  DraftVerificationResult,
  FactExtractionInput,
  DraftGenerationInput,
  DraftVerificationInput,
} from './ai-provider.interface';

export class OpenRouterAiProvider extends OpenAiProvider {
  constructor(apiKey: string) {
    // OpenRouter uses the OpenAI-compatible SDK but with its own base URL
    super(apiKey, 'https://openrouter.ai/api/v1');
  }

  async extractFacts(
    input: FactExtractionInput,
    context: AiRequestContext
  ): Promise<AiResult<FactSheet>> {
    const res = await super.extractFacts(input, context);
    return {
      ...res,
      provider: 'openrouter',
      model: process.env.AI_FACT_EXTRACTION_MODEL || 'meta-llama/llama-3-8b-instruct:free',
    };
  }

  async generateDraft(
    input: DraftGenerationInput,
    context: AiRequestContext
  ): Promise<AiResult<GeneratedDraft>> {
    const res = await super.generateDraft(input, context);
    return {
      ...res,
      provider: 'openrouter',
      model: process.env.AI_DRAFT_GENERATION_MODEL || 'meta-llama/llama-3-8b-instruct:free',
    };
  }

  async verifyDraft(
    input: DraftVerificationInput,
    context: AiRequestContext
  ): Promise<AiResult<DraftVerificationResult>> {
    const res = await super.verifyDraft(input, context);
    return {
      ...res,
      provider: 'openrouter',
      model: process.env.AI_DRAFT_VERIFICATION_MODEL || 'meta-llama/llama-3-8b-instruct:free',
    };
  }
}
