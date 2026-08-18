import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Get the text embedding using Gemini API (text-embedding-004)
 */
export async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  if (!apiKey) {
    throw new Error('AI_PROVIDER_NOT_CONFIGURED');
  }
  const genAi = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.AI_EMBEDDING_MODEL || 'text-embedding-004';
  const model = genAi.getGenerativeModel({ model: modelName });
  const result = await model.embedContent(text);
  
  if (!result.embedding?.values) {
    throw new Error('AI_EMBEDDING_FAILED');
  }
  return result.embedding.values;
}

/**
 * Calculate the cosine similarity between two vectors
 */
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) {
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
