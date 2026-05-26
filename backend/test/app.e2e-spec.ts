import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authToken: string;
  let testUserId: string;
  let testStoryId: string;
  let testArticleId: string;

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

  // Cleanup test data after each test
  afterEach(async () => {
    if (testArticleId) {
      await prisma.article
        .deleteMany({ where: { id: testArticleId } })
        .catch(() => {});
      testArticleId = '';
    }
    if (testStoryId) {
      await prisma.story
        .deleteMany({ where: { id: testStoryId } })
        .catch(() => {});
      testStoryId = '';
    }
    if (testUserId) {
      await prisma.user
        .deleteMany({ where: { id: testUserId } })
        .catch(() => {});
      testUserId = '';
    }
  });

  describe('Health', () => {
    it('/ (GET) should require authentication', () => {
      return request(app.getHttpServer()).get('/').expect(401);
    });
  });

  describe('Auth', () => {
    const uniqueEmail = `e2e-test-${Date.now()}@example.com`;

    it('POST /auth/register should create a new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: uniqueEmail,
          name: 'E2E Test User',
          password: '123456',
          role: 'REPORTER',
        })
        .expect(201);

      expect(res.body.user).toBeDefined();
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe(uniqueEmail);
      testUserId = res.body.user.id;
      authToken = res.body.accessToken;
    });

    it('POST /auth/login should authenticate existing user', async () => {
      // First register
      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `login-test-${Date.now()}@example.com`,
          name: 'Login Test',
          password: '123456',
          role: 'REPORTER',
        });
      testUserId = registerRes.body.user.id;

      // Then login
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: registerRes.body.user.email,
          password: '123456',
        })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe(registerRes.body.user.email);
      authToken = res.body.accessToken;
    });

    it('POST /auth/login should reject invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('GET /auth/me should return current user with valid token', async () => {
      // Register and get token
      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `me-test-${Date.now()}@example.com`,
          name: 'Me Test',
          password: '123456',
          role: 'REPORTER',
        });
      testUserId = registerRes.body.user.id;
      authToken = registerRes.body.accessToken;

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.id).toBe(testUserId);
      expect(res.body.email).toBe(registerRes.body.user.email);
    });

    it('GET /auth/me should reject without token', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });
  });

  describe('Stories', () => {
    beforeEach(async () => {
      // Create a test user and authenticate
      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `story-test-${Date.now()}@example.com`,
          name: 'Story Test User',
          password: '123456',
          role: 'REPORTER',
        });
      testUserId = registerRes.body.user.id;
      authToken = registerRes.body.accessToken;
    });

    it('POST /stories should create a story', async () => {
      const res = await request(app.getHttpServer())
        .post('/stories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'E2E Test Story',
          description: 'Test description',
          priority: 1,
          tags: ['test', 'e2e'],
        })
        .expect(201);

      expect(res.body.title).toBe('E2E Test Story');
      expect(res.body.reporterId).toBe(testUserId);
      testStoryId = res.body.id;
    });

    it('GET /stories should return stories for authenticated user', async () => {
      // First create a story
      const createRes = await request(app.getHttpServer())
        .post('/stories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'List Test Story',
          description: 'For list test',
          priority: 1,
        });
      testStoryId = createRes.body.id;

      // Then list
      const res = await request(app.getHttpServer())
        .get('/stories')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('GET /stories/:id should return a specific story', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/stories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Detail Test Story',
          description: 'For detail test',
          priority: 1,
        });
      testStoryId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .get(`/stories/${testStoryId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.id).toBe(testStoryId);
      expect(res.body.title).toBe('Detail Test Story');
    });

    it('PATCH /stories/:id should update a story', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/stories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Update Test Story',
          description: 'Before update',
          priority: 1,
        });
      testStoryId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/stories/${testStoryId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated Title',
        })
        .expect(200);

      expect(res.body.title).toBe('Updated Title');
    });

    it('DELETE /stories/:id should delete a story', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/stories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Delete Test Story',
          description: 'To be deleted',
          priority: 1,
        });
      testStoryId = createRes.body.id;

      await request(app.getHttpServer())
        .delete(`/stories/${testStoryId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify it's gone
      await request(app.getHttpServer())
        .get(`/stories/${testStoryId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      // Clear so afterEach doesn't fail
      testStoryId = '';
    });
  });

  describe('Articles', () => {
    beforeEach(async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `article-test-${Date.now()}@example.com`,
          name: 'Article Test User',
          password: '123456',
          role: 'REPORTER',
        });
      testUserId = registerRes.body.user.id;
      authToken = registerRes.body.accessToken;

      // Create a story for the article
      const storyRes = await request(app.getHttpServer())
        .post('/stories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Article Parent Story',
          description: 'Parent',
          priority: 1,
        });
      testStoryId = storyRes.body.id;
    });

    it('POST /articles should create an article', async () => {
      const res = await request(app.getHttpServer())
        .post('/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          storyId: testStoryId,
          title: 'E2E Test Article',
          content: '<p>Test content</p>',
        })
        .expect(201);

      expect(res.body.title).toBe('E2E Test Article');
      expect(res.body.authorId).toBe(testUserId);
      testArticleId = res.body.id;
    });

    it('GET /articles should return articles', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          storyId: testStoryId,
          title: 'List Article',
          content: '<p>Content</p>',
        });
      testArticleId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .get('/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /articles/:id should return a specific article', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          storyId: testStoryId,
          title: 'Detail Article',
          content: '<p>Detail content</p>',
        });
      testArticleId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .get(`/articles/${testArticleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.id).toBe(testArticleId);
      expect(res.body.title).toBe('Detail Article');
    });

    it('PATCH /articles/:id should update an article', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          storyId: testStoryId,
          title: 'Update Article',
          content: '<p>Original</p>',
        });
      testArticleId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/articles/${testArticleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated Article Title',
        })
        .expect(200);

      expect(res.body.title).toBe('Updated Article Title');
    });

    it('DELETE /articles/:id should delete an article', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          storyId: testStoryId,
          title: 'Delete Article',
          content: '<p>To delete</p>',
        });
      testArticleId = createRes.body.id;

      await request(app.getHttpServer())
        .delete(`/articles/${testArticleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/articles/${testArticleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      testArticleId = '';
    });
  });
});
