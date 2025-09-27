import { PreviewType } from '../report/schema';
import { DailyDigest, DailyDigestSchema, DailyDigestJsonSchemaForLLM } from '../report/digest_schema';
import { SYSTEM_PROMPT, INSIGHTS_SYSTEM_PROMPT, buildDigestUserPrompt, buildInsightsUserPrompt } from './shared';
import { renderDigest } from '../report/digest_render';
import { createOpenRouterClient } from './openrouter';

type GenerateArgs = {
  date: string;
  preview: PreviewType;
};

// moved to shared

// trimming logic moved to shared

// user prompt builder moved to shared

export async function generateReportFromPreview(args: GenerateArgs, timeoutMs = 120_000): Promise<{ json: DailyDigest; markdown: string }>{
  const MAX_OUTPUT_TOKENS = Number.isFinite(Number.parseInt(process.env.REPORT_MAX_OUTPUT_TOKENS || '', 10))
    ? Number.parseInt(process.env.REPORT_MAX_OUTPUT_TOKENS as string, 10)
    : undefined;
  const EFFECTIVE_TIMEOUT = (typeof timeoutMs === 'number' && timeoutMs > 0)
    ? timeoutMs
    : (Number.parseInt(process.env.REPORT_TIMEOUT_MS || '', 10) || 120_000);

  async function runResponses(): Promise<{ parsed: any; requestId?: string }> {
    const client = createOpenRouterClient();
    
    const sdkRes = await client.createStructuredResponse({
      model: process.env.OPENROUTER_MODEL!,
      instructions: SYSTEM_PROMPT,
      input: buildDigestUserPrompt(args.preview, args.date),
      text: {
        format: {
          type: 'json_schema',
          name: 'DailyLiveDigest',
          schema: DailyDigestJsonSchemaForLLM,
          strict: true,
        },
      },
      max_output_tokens: MAX_OUTPUT_TOKENS,
    });

    const requestId = sdkRes._request_id;
    const content = (typeof sdkRes?.output_text === 'string' ? sdkRes.output_text : '')?.trim();
    if (!content) {
      const err = new Error('openrouter_empty_content');
      (err as any).requestId = requestId;
      throw err;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (e: any) {
      const snippet = content.slice(0, 400);
      const msg = `invalid_json_from_model: ${e?.message || 'parse_error'} | snippet: ${snippet}`;
      const error = new Error(msg);
      (error as any).statusCode = 422;
      (error as any).requestId = requestId;
      throw error;
    }
    return { parsed, requestId };
  }

  try {
    const { parsed, requestId } = await runResponses();
    const validated = DailyDigestSchema.safeParse(parsed);
    if (!validated.success) {
      const msg = validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      const error = new Error(`json_schema_validation_failed: ${msg}`);
      (error as any).statusCode = 422;
      (error as any).requestId = requestId;
      throw error;
    }
    const md = renderDigest(validated.data as DailyDigest);
    return { json: validated.data as DailyDigest, markdown: md };
  } finally {
    // no-op
  }
}

export async function generateInsightsFromMessages(args: { date: string; preview: PreviewType }, timeoutMs = 90_000): Promise<{ markdown: string }>{
  const client = createOpenRouterClient();
  
  const res = await client.createStreamingResponse({
    model: process.env.OPENROUTER_MODEL!,
    instructions: INSIGHTS_SYSTEM_PROMPT,
    input: buildInsightsUserPrompt(args.preview, args.date),
    max_output_tokens: Number.parseInt(process.env.REPORT_MAX_OUTPUT_TOKENS || '800', 10),
  });

  let text = (typeof res?.output_text === 'string' ? res.output_text : '').trim();
  
  if (!text) {
    const err = new Error('openrouter_empty_content');
    (err as any).statusCode = 502;
    throw err;
  }
  return { markdown: text };
}


