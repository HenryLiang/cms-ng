/**
 * 媒体库 ES 全量重建脚本(MySQL -> Elasticsearch)。
 *
 * 用途:
 *   - 首次上线 ES 后回填存量媒体资产;
 *   - mapping 演进(--recreate 删索引重建,PRD §4.2 无 alias 蓝绿的演进路径);
 *   - ES 数据损坏/漂移后的权威修复(MySQL 是唯一事实源)。
 *
 * 与 SearchService 共用 media-index.mapping.ts(mapping + 序列化契约单一事实源)。
 * 全量读走 keyset 分页(id 游标),批量 bulk 写入 + 可配 sleep 限速,避免打挂 ES/MySQL。
 * 单批失败 fail-open(记数继续),末尾汇总;有失败则 exit 1 供运维/CI 感知。
 *
 * 用法(在 backend/ 下):
 *   npx ts-node scripts/reindex-media-search.ts                      # 全量回填
 *   npx ts-node scripts/reindex-media-search.ts --dry-run            # 只统计+抽样,不写
 *   npx ts-node scripts/reindex-media-search.ts --recreate --yes     # 删索引重建(破坏性,需 --yes)
 *   npx ts-node scripts/reindex-media-search.ts --batch=100 --sleep=200
 *   npx ts-node scripts/reindex-media-search.ts --from=2026-07-01 --to=2026-08-01
 *   npx ts-node scripts/reindex-media-search.ts --owner=<userId>
 *
 * 读取 backend/.env:ELASTICSEARCH_NODE / USERNAME / PASSWORD / INDEX_MEDIA。
 * 安全:日志严禁打印含凭证的连接串(P0:公开仓库 CI 日志),userinfo 一律脱敏。
 */
import { PrismaClient, MediaAsset } from '@prisma/client';
import { Client } from '@elastic/elasticsearch';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import * as dotenv from 'dotenv';
import {
  MEDIA_INDEX_MAPPINGS,
  MEDIA_INDEX_SETTINGS,
  buildMediaSearchDoc,
} from '../src/search/media-index.mapping';
import { redactConnectionString } from '../src/common/redact.utils';

interface CliOptions {
  batch: number;
  sleepMs: number;
  from?: string;
  to?: string;
  owner?: string;
  dryRun: boolean;
  recreate: boolean;
  yes: boolean;
}

const prisma = new PrismaClient();

function parseArgs(argv: string[]): CliOptions {
  const raw: Record<string, string | boolean> = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) raw[arg.slice(2)] = true;
    else raw[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  const num = (v: string | boolean | undefined, d: number): number => {
    const n = typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    batch: num(raw.batch, 200),
    sleepMs: num(raw.sleep, 100),
    from: typeof raw.from === 'string' ? raw.from : undefined,
    to: typeof raw.to === 'string' ? raw.to : undefined,
    owner: typeof raw.owner === 'string' ? raw.owner : undefined,
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 建 keyset 分页 where(status 仅 ACTIVE;from/to 过滤 createdAt;owner 可选) */
function buildWhere(opts: CliOptions) {
  const where: Record<string, unknown> = { status: 'ACTIVE' };
  if (opts.owner) where.ownerId = opts.owner;
  const createdAt: Record<string, Date> = {};
  if (opts.from) {
    const d = new Date(opts.from);
    if (Number.isNaN(d.getTime()))
      throw new Error(`--from 非法日期: ${opts.from}`);
    createdAt.gte = d;
  }
  if (opts.to) {
    const d = new Date(opts.to);
    if (Number.isNaN(d.getTime())) throw new Error(`--to 非法日期: ${opts.to}`);
    createdAt.lte = d;
  }
  if (Object.keys(createdAt).length) where.createdAt = createdAt;
  return where;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const node = env.ELASTICSEARCH_NODE || 'http://localhost:9200';
  const indexName = env.ELASTICSEARCH_INDEX_MEDIA || 'media_assets';
  if (!/^https?:\/\//.test(node)) {
    throw new Error(
      `ELASTICSEARCH_NODE 必须是 http(s) URL(当前: ${redactConnectionString(node)})`,
    );
  }
  // 破坏性操作二次确认:--recreate 删索引重建,必须显式 --yes(防手滑/脚本误传)
  if (opts.recreate && !opts.yes) {
    throw new Error(
      '--recreate 将删除整个索引并重建(回填完成前检索为空),确认操作请追加 --yes',
    );
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
    requestTimeout: 30_000, // bulk 批量写,放宽超时
    maxRetries: 2,
    // ES 8.x 默认 HTTPS + 自签证书,与 search.service.ts 保持一致
    tls: { rejectUnauthorized: false },
  });

  const where = buildWhere(opts);
  console.log(
    `[reindex] node=${redactConnectionString(node)} index=${indexName} ` +
      `batch=${opts.batch} sleep=${opts.sleepMs}ms dryRun=${opts.dryRun} recreate=${opts.recreate}`,
  );
  console.log(
    `[reindex] 过滤: status=ACTIVE${opts.owner ? ` owner=${opts.owner}` : ''}` +
      `${opts.from ? ` from=${opts.from}` : ''}${opts.to ? ` to=${opts.to}` : ''}`,
  );

  // 1. 索引准备:dry-run 跳过任何写;recreate 删旧建新;否则确保存在
  if (!opts.dryRun) {
    const exists = await client.indices.exists({ index: indexName });
    if (opts.recreate) {
      if (exists) {
        await client.indices.delete({ index: indexName });
        console.log(`[reindex] 已删除旧索引 ${indexName}(--recreate)`);
      }
      await client.indices.create({
        index: indexName,
        settings: { ...MEDIA_INDEX_SETTINGS },
        mappings: MEDIA_INDEX_MAPPINGS,
      });
      console.log(`[reindex] 已按最新 mapping 重建索引 ${indexName}`);
    } else if (!exists) {
      await client.indices.create({
        index: indexName,
        settings: { ...MEDIA_INDEX_SETTINGS },
        mappings: MEDIA_INDEX_MAPPINGS,
      });
      console.log(`[reindex] 索引不存在,已创建 ${indexName}`);
    } else {
      console.log(
        `[reindex] 复用已存在索引 ${indexName}(mapping 演进请用 --recreate)`,
      );
    }
  }

  // 2. 全量扫描(keyset 分页)+ 批量 bulk 写入 + 限速
  const total = await prisma.mediaAsset.count({ where });
  console.log(`[reindex] 待处理 ACTIVE 资产: ${total}`);

  let cursor: string | undefined;
  let scanned = 0;
  let indexed = 0;
  let failedBatches = 0;
  const failedIds: string[] = [];
  const startedAt = Date.now();

  for (;;) {
    const batch: MediaAsset[] = await prisma.mediaAsset.findMany({
      where: cursor ? { ...where, id: { gt: cursor } } : where,
      orderBy: { id: 'asc' },
      take: opts.batch,
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    scanned += batch.length;

    if (opts.dryRun) {
      // 抽样打印首批验证序列化契约(tags/aiTags 应为数组)。仅 id/status/标签,
      // 不 dump prompt/description/title 等自由文本——防用户内容泄进公开 CI 日志(P0)。
      if (scanned === batch.length) {
        console.log('[reindex][dry-run] 首批样本(序列化契约):');
        for (const a of batch.slice(0, 3)) {
          const doc = buildMediaSearchDoc(a);
          console.log(
            `   id=${doc.id} status=${doc.status} ` +
              `tags=${JSON.stringify(doc.tags)} aiTags=${JSON.stringify(doc.aiTags)}`,
          );
        }
      }
    } else {
      try {
        const operations = batch.flatMap((a) => [
          { index: { _index: indexName, _id: a.id } },
          buildMediaSearchDoc(a),
        ]);
        const resp = await client.bulk({ operations, refresh: false });
        if (resp.errors) {
          const itemErrors = resp.items.filter((i) => i.index?.error);
          for (const i of itemErrors) {
            if (i.index?._id) failedIds.push(i.index._id);
          }
          indexed += batch.length - itemErrors.length; // 批内成功条数仍计入
          failedBatches++;
          console.warn(
            `[reindex] 批内 ${itemErrors.length}/${batch.length} 条失败(已计入,继续)`,
          );
        } else {
          indexed += batch.length;
        }
      } catch (err) {
        failedBatches++;
        failedIds.push(...batch.map((a) => a.id));
        console.warn(
          `[reindex] 批次写入失败(已计入,继续): ${(err as Error)?.message ?? err}`,
        );
      }
    }

    console.log(
      `[reindex] 进度 ${scanned}/${total}${opts.dryRun ? ' (dry-run 不写)' : `,已索引 ${indexed}`}`,
    );
    if (scanned < total) await sleep(opts.sleepMs); // 限速
  }

  const ms = Date.now() - startedAt;
  console.log(
    `[reindex] 完成: scanned=${scanned} indexed=${indexed} ` +
      `failedBatches=${failedBatches} failedIds=${failedIds.length} 耗时=${ms}ms`,
  );
  if (failedIds.length) {
    console.warn(
      `[reindex] 失败样本 id(前 10): ${failedIds.slice(0, 10).join(', ')}`,
    );
  }
  if (opts.dryRun) {
    console.log('[reindex] dry-run 结束,未写入任何数据。');
  } else if (failedBatches > 0) {
    throw new Error(`reindex 存在 ${failedBatches} 个失败批次,请排查后重跑`);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error('[reindex] 失败:', (err as Error)?.message ?? err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
