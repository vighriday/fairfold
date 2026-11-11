import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { config } from 'dotenv';
import { z } from 'zod';
import * as ai from '@fairfold/ai';
import { AppError, decodeEncryptionKey } from '@fairfold/contracts';
import { createDatabase } from '@fairfold/db';
import { createSandboxShopperCheckout } from '@fairfold/paypal';
import { connectMcpShopperTools, sanitizeTranscript } from '@fairfold/shopper';
import { runShopperSession } from './session.js';

config({ path: new URL('../../../.env', import.meta.url), quiet: true });
const Request = z
  .object({
    query: z.string().trim().min(1).max(200),
    maxPrice: z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/),
  })
  .strict();
const policy = JSON.parse(
  await readFile(new URL('../policy.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;
if (
  policy.sandbox !== true ||
  policy.confirmNonVerified !== true ||
  policy.confirmPayPalApproval !== true ||
  !Array.isArray(policy.neverPayBands) ||
  !policy.neverPayBands.includes('caution')
)
  throw new AppError(
    'SHOPPER_POLICY_INVALID',
    'The documented human approval policy is required',
    409,
  );

if (process.argv.includes('--check')) {
  console.log(
    JSON.stringify({
      mode: 'READ_ONLY_READINESS',
      modelBoundary: ai.hasModelConfig('text')
        ? 'CONFIGURED_NOT_VERIFIED'
        : 'MODEL_CONFIG_REQUIRED',
      database: !!process.env.DATABASE_URL,
      mcpEndpoint: !!process.env.APP_BASE_URL,
      agentToken: !!process.env.SHOPPER_AGENT_TOKEN,
      paypal: 'DATABASE_SANDBOX_CREDENTIALS_REQUIRED',
      paypalRequests: 0,
    }),
  );
} else {
  let close = async () => {};
  const terminal = createInterface({ input: stdin, output: stdout });
  let database: ReturnType<typeof createDatabase> | undefined;
  try {
    if (!ai.hasModelConfig('text'))
      throw new AppError(
        'AI_MODEL_CONFIG_REQUIRED',
        'Configure the text model through packages/ai before running the shopper',
        503,
      );
    if (
      !process.env.DATABASE_URL ||
      !process.env.APP_BASE_URL ||
      !process.env.SHOPPER_AGENT_TOKEN ||
      !process.env.APP_ENCRYPTION_KEY
    )
      throw new AppError(
        'SHOPPER_CONFIG_REQUIRED',
        'Configure database, app URL, encryption key and a private agent token in .env',
        409,
      );
    const prompt =
      process.argv
        .slice(2)
        .filter((arg) => arg !== '--')
        .join(' ') || 'navy hoodie under $45';
    const request = Request.parse(
      (
        await ai.generateStructured({
          schema: Request,
          system:
            'Extract only the requested catalogue search and maximum USD price. Do not authorize payment or invent a budget. The code enforces store policy and human approval.',
          user: prompt,
          component: 'shopper_request',
          fallback: () => {
            throw new AppError(
              'SHOPPER_REQUEST_REVIEW_REQUIRED',
              'Could not extract the shopping request',
              409,
            );
          },
        })
      ).value,
    );
    database = createDatabase(process.env.DATABASE_URL);
    const mcp = await connectMcpShopperTools(
      new URL('/mcp', process.env.APP_BASE_URL).href,
      process.env.SHOPPER_AGENT_TOKEN,
    );
    close = mcp.close;
    const checkout = createSandboxShopperCheckout({
      database: database.db,
      encryptionKey: decodeEncryptionKey(process.env.APP_ENCRYPTION_KEY),
      appBaseUrl: process.env.APP_BASE_URL,
    });
    const run = await runShopperSession({
      tools: mcp.tools,
      checkout,
      request,
      onApprovalLink: (url) => console.log('Approve this sandbox order: ' + url),
      confirm: async (stage, message) => {
        const answer = await terminal.question(
          message + (stage === 'store' ? ' Type yes: ' : ' Press Enter, or type cancel: '),
        );
        return stage === 'store' ? answer.trim().toLowerCase() === 'yes' : answer.trim() === '';
      },
    });
    const transcript = {
      status: run.status,
      synthetic: false,
      paypalEnvironment: 'sandbox',
      events: sanitizeTranscript(run.transcript),
    };
    await writeFile(
      new URL('../../../docs/agent-run.txt', import.meta.url),
      JSON.stringify(transcript, null, 2) + '\n',
      { flag: 'wx' },
    );
    console.log(
      JSON.stringify({
        status: run.status,
        transcript: 'docs/agent-run.txt',
        note: 'Only a completed account-backed run can close A13',
      }),
    );
  } catch (error) {
    console.error(error instanceof AppError ? error.code : 'SHOPPER_RUN_FAILED');
    process.exitCode = 1;
  } finally {
    terminal.close();
    await close();
    await database?.close();
  }
}
