import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { SearchService } from './../src/search/search.service';

/**
 * e2e:Elasticsearch 全文检索 fail-open 降级(PRD §7.4)。
 *
 * CI e2e job 注入 ELASTICSEARCH_ENABLED=true 并起 bare elasticsearch:8.11.0
 * (无 IK 中文分词插件)。断言核心契约:
 *  - 应用在 ES 可达但缺 IK 时仍能正常 boot(SearchService 不 crash 主流程);
 *  - SearchService 建索引失败(ik_max_word 缺失)-> 降级 isEnabled()=false;
 *  - 媒体列表检索自动回退 LIKE,GET /media?search=... 仍 200(不 500)。
 *
 * 仅在 ELASTICSEARCH_ENABLED=true(CI)时运行;本地未起 ES/未注入则整体跳过,
 * 避免本地无 ES 环境下产生误导性失败。
 */
const esOn = (process.env.ELASTICSEARCH_ENABLED || '').toLowerCase() === 'true';
const describeOrSkip = esOn ? describe : describe.skip;

describeOrSkip('Media search degrade (e2e, bare ES no IK)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('应用以 ES 启用但缺 IK 启动 -> SearchService 降级 isEnabled()=false(不 crash)', () => {
    const search = app.get(SearchService);
    // bare elasticsearch:8.11.0 无 IK 插件,ensureIndex 建索引被 ES 拒绝 -> fail-open
    expect(search.isEnabled()).toBe(false);
  });

  it('GET /media?search=... 降级 LIKE 仍返回 200 分页结构(不 500)', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `media-search-${Date.now()}@example.com`,
        name: 'Media Search',
        password: '123456',
        role: 'REPORTER',
      });
    const token: string = registerRes.body.accessToken;
    const userId: string = registerRes.body.user.id;

    try {
      const res = await request(app.getHttpServer())
        .get('/media')
        .query({ search: '花海' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      // LIKE 兜底返回标准分页结构
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(typeof res.body.meta.total).toBe('number');
    } finally {
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
    }
  });
});
