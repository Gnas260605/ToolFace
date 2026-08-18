/* eslint-disable @typescript-eslint/no-explicit-any */
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
  ViralScoringInput,
  ViralScoreItem,
} from './ai-provider.interface';
import { GeminiAiProvider } from './gemini-ai-provider';
import { OpenAiProvider } from './openai-ai-provider';
import { OpenRouterAiProvider } from './openrouter-ai-provider';

export class FallbackAiProvider implements AiProvider {
  constructor(
    private readonly providers: { type: string; provider: AiProvider }[],
    private readonly db?: any
  ) {
    if (providers.length === 0) {
      throw new Error('FallbackAiProvider requires at least one provider.');
    }
  }

  private async getOrderedProviders(context: AiRequestContext): Promise<{ type: string; provider: AiProvider }[]> {
    const list = [...this.providers];
    if (!this.db || !context.workspaceId) {
      return list;
    }

    try {
      const prefSetting = await this.db.workspaceSetting.findFirst({
        where: { workspaceId: context.workspaceId, key: 'ai.default_provider' },
      });
      const preferredType = prefSetting?.valueJson ? String(prefSetting.valueJson).trim() : null;

      if (preferredType) {
        list.sort((a, b) => {
          if (a.type === preferredType) return -1;
          if (b.type === preferredType) return 1;
          return 0;
        });
      }
    } catch (_e) {
      // Ignore DB errors
    }

    return list;
  }

  private async getProviderForType(type: string, context: AiRequestContext, defaultProvider: AiProvider): Promise<AiProvider> {
    if (!this.db || !context.workspaceId) {
      return defaultProvider;
    }

    try {
      const setting = await this.db.workspaceSetting.findFirst({
        where: {
          workspaceId: context.workspaceId,
          key: `ai.${type}_api_key`,
        },
      });

      if (setting?.valueJson) {
        const rawKey = typeof setting.valueJson === 'string' ? setting.valueJson : String(setting.valueJson);
        const key = rawKey.trim();
        if (key !== '') {
          if (type === 'gemini') {
            return new GeminiAiProvider(key);
          } else if (type === 'openai') {
            return new OpenAiProvider(key);
          } else if (type === 'openrouter') {
            return new OpenRouterAiProvider(key);
          }
        }
      }
    } catch (_err) {
      // Fallback safely to default static provider
    }

    return defaultProvider;
  }

  async extractFacts(input: FactExtractionInput, context: AiRequestContext): Promise<AiResult<FactSheet>> {
    let lastError: unknown = null;
    const ordered = await this.getOrderedProviders(context);
    for (const { type, provider: defaultProvider } of ordered) {
      try {
        const provider = await this.getProviderForType(type, context, defaultProvider);
        const result = await provider.extractFacts(input, context);
        return {
          ...result,
          provider: type,
        };
      } catch (err) {
        console.error(`[FallbackAiProvider] extractFacts error in ${type}:`, err);
        lastError = err;
      }
    }
    throw new Error(`All AI providers failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }

  async generateDraft(input: DraftGenerationInput, context: AiRequestContext): Promise<AiResult<GeneratedDraft>> {
    let lastError: unknown = null;
    const ordered = await this.getOrderedProviders(context);
    for (const { type, provider: defaultProvider } of ordered) {
      try {
        const provider = await this.getProviderForType(type, context, defaultProvider);
        const result = await provider.generateDraft(input, context);
        return {
          ...result,
          provider: type,
        };
      } catch (err) {
        console.error(`[FallbackAiProvider] generateDraft error in ${type}:`, err);
        lastError = err;
      }
    }
    throw new Error(`All AI providers failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }

  async verifyDraft(input: DraftVerificationInput, context: AiRequestContext): Promise<AiResult<DraftVerificationResult>> {
    let lastError: unknown = null;
    const ordered = await this.getOrderedProviders(context);
    for (const { type, provider: defaultProvider } of ordered) {
      try {
        const provider = await this.getProviderForType(type, context, defaultProvider);
        const result = await provider.verifyDraft(input, context);
        return {
          ...result,
          provider: type,
        };
      } catch (err) {
        console.error(`[FallbackAiProvider] verifyDraft error in ${type}:`, err);
        lastError = err;
      }
    }
    throw new Error(`All AI providers failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }

  async scoreViralPotential(input: ViralScoringInput, context: AiRequestContext): Promise<AiResult<ViralScoreItem[]>> {
    let lastError: unknown = null;
    const ordered = await this.getOrderedProviders(context);
    for (const { type, provider: defaultProvider } of ordered) {
      try {
        const provider = await this.getProviderForType(type, context, defaultProvider);
        if (provider.scoreViralPotential) {
          const result = await provider.scoreViralPotential(input, context);
          return {
            ...result,
            provider: type,
          };
        }
      } catch (err) {
        console.error(`[FallbackAiProvider] scoreViralPotential error in ${type}:`, err);
        lastError = err;
      }
    }
    throw new Error(`All AI providers failed to score viral potential. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }
}
