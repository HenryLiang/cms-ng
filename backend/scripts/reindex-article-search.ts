/**
 * 稿件 ES 全量回填脚本（MySQL -> Elasticsearch）。
 *
 * 用法（在 backend/ 下）：
 *   npx ts-node scripts/reindex-article-search.ts
 *   npx ts-node scripts/reindex-article-search.ts --dry-run
 *   npx ts-node scripts/reindex-article-search.ts --recreate --yes
 *   npx ts-node scripts/reindex-article-search.ts --batch=200 --sleep=100
 */
import { Article, PrismaClient } from '@prisma/client';
import { Client } from '@elastic/elasticsearch';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import * as dotenv from 'dotenv';
import {
  ARTICLE_INDEX_MAPPINGS,
  ARTICLE_INDEX_SETTINGS,
  buildArticleSearchBackfillAction,
  buildArticleSearchDoc,
} from '../src/search/article-index.mapping';
import { redactConnectionString } from '../src/common/redact.utils';

interface CliOptions {
  batch: number;
  sleepMs: number;
  dryRun: boolean;
  recreate: boolean;
  yes: boolean;
}

const prisma = new PrismaClient();

function parseArgs(argv: string[]): CliOptions {
  const raw: Record<string, string | boolean> = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const equalsAt = arg.indexOf('=');
    if (equalsAt === -1) raw[arg.slice(2)] = true;
    else raw[arg.slice(2, equalsAt)] = arg.slice(equalsAt + 1);
  }
  const positiveNumber = (
    value: string | boolean | undefined,
    fallback: number,
  ): number => {
    const parsed = typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    batch: positiveNumber(raw.batch, 200),
    sleepMs: positiveNumber(raw.sleep, 100),
    dryRun: raw['dry-run'] === true,
    recreate: raw.recreate === true,
    yes: raw.yes === true,
  };
}

function loadEnv(): Record<string, string> {
  const envPath = resolve(__dirname, '../.env');
  if (!existsSync(envPath)) return {};
  return dotenv.parse(readFileSync(envPath, 'utf8'));
}

const sleep = (ms: number) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const env = { ...process.env, ...loadEnv() };
  const node = env.ELASTICSEARCH_NODE || 'http://localhost:9200';
  const indexName = env.ELASTICSEARCH_INDEX_ARTICLES || 'articles';
  if (!/^https?:\/\//.test(node)) {
    throw new Error(
      `ELASTICSEARCH_NODE 必须是 http(s) URL（当前: ${redactConnectionString(node)}）`,
    );
  }
  if (options.recreate && !options.yes) {
    throw new Error('--recreate 会删除稿件索引，确认操作请追加 --yes');
  }

  const client = new Client({
    node,
    auth:
      env.ELASTICSEARCH_USERNAME && env.ELASTICSEARCH_PASSWORD
        ? {
            username: env.ELASTICSEARCH_USERNAME,
            password: env.ELASTICSEARCH_PASSWORD,
          }
        : undefined,
    requestTimeout: 30_000,
    maxRetries: 2,
  });

  console.log(
    `[article-reindex] node=${redactConnectionString(node)} index=${indexName} ` +
      `batch=${options.batch} sleep=${options.sleepMs}ms dryRun=${options.dryRun} recreate=${options.recreate}`,
  );

  if (!options.dryRun) {
    const exists = await client.indices.exists({ index: indexName });
    if (options.recreate) {
      if (exists) await client.indices.delete({ index: indexName });
      await client.indices.create({
        index: indexName,
        settings: { ...ARTICLE_INDEX_SETTINGS },
        mappings: ARTICLE_INDEX_MAPPINGS,
      });
      console.log(`[article-reindex] 已按最新 mapping 重建索引 ${indexName}`);
    } else if (!exists) {
      await client.indices.create({
        index: indexName,
        settings: { ...ARTICLE_INDEX_SETTINGS },
        mappings: ARTICLE_INDEX_MAPPINGS,
      });
      console.log(`[article-reindex] 索引不存在，已创建 ${indexName}`);
    } else {
      console.log(`[article-reindex] 复用已存在索引 ${indexName}`);
    }
  }

  const total = await prisma.article.count();
  console.log(`[article-reindex] 待处理稿件: ${total}`);

  let cursor: string | undefined;
  let scanned = 0;
  let indexed = 0;
  let failedBatches = 0;
  let skippedNewer = 0;
  const failedIds: string[] = [];

  for (;;) {
    const batch: Article[] = await prisma.article.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: 'asc' },
      take: options.batch,
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    scanned += batch.length;

    if (!options.dryRun) {
      try {
        const operations = batch.flatMap((article) => [
          buildArticleSearchBackfillAction(indexName, article),
          buildArticleSearchDoc(article),
        ]);
        const response = await client.bulk({ operations, refresh: false });
        const conflictedItems = response.errors
          ? response.items.filter(
              (item) =>
                item.index?.error?.type === 'version_conflict_engine_exception',
            )
          : [];
        const itemErrors = response.errors
          ? response.items.filter(
              (item) =>
                item.index?.error &&
                item.index.error.type !== 'version_conflict_engine_exception',
            )
          : [];
        skippedNewer += conflictedItems.length;
        for (const item of itemErrors) {
          if (item.index?._id) failedIds.push(item.index._id);
        }
        indexed += batch.length - itemErrors.length - conflictedItems.length;
        if (itemErrors.length) failedBatches++;
      } catch (error) {
        failedBatches++;
        failedIds.push(...batch.map((article) => article.id));
        console.warn(
          `[article-reindex] 批次失败（继续）: ${(error as Error)?.message ?? error}`,
        );
      }
    }

    console.log(
      `[article-reindex] 进度 ${scanned}/${total}` +
        (options.dryRun ? '（dry-run）' : `，已索引 ${indexed}`),
    );
    if (scanned < total) await sleep(options.sleepMs);
  }

  if (!options.dryRun) await client.indices.refresh({ index: indexName });
  console.log(
    `[article-reindex] 完成: scanned=${scanned} indexed=${indexed} ` +
      `skippedNewer=${skippedNewer} failedBatches=${failedBatches} failedIds=${failedIds.length}`,
  );
  if (failedIds.length) {
    console.warn(
      `[article-reindex] 失败样本 id（前 10）: ${failedIds.slice(0, 10).join(', ')}`,
    );
  }
  if (failedBatches > 0) {
    throw new Error(`回填存在 ${failedBatches} 个失败批次，请排查后重跑`);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exitCode = 0;
    })
    .catch((error) => {
      console.error(
        '[article-reindex] 失败:',
        (error as Error)?.message ?? error,
      );
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
