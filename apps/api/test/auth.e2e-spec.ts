import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Authentication & RBAC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let refreshToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    prisma = app.get(PrismaService);
    
    await app.init();
  });

  afterAll(async () => {
    // Cleanup test users
    await prisma.user.deleteMany({
      where: { email: { contains: '@test.com' } },
    });
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('should register new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'newuser@test.com',
          password: 'SecurePassword123!',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: expect.any(Number),
      });

      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
    });

    it('should reject duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'newuser@test.com',
          password: 'AnotherPassword123!',
        })
        .expect(409);
    });

    it('should reject weak password', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'another@test.com',
          password: '123',
        })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'newuser@test.com',
          password: 'SecurePassword123!',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });

      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
    });

    it('should reject invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'newuser@test.com',
          password: 'WrongPassword',
        })
        .expect(401);
    });

    it('should reject non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'notexist@test.com',
          password: 'AnyPassword',
        })
        .expect(401);
    });
  });

  describe('GET /auth/me', () => {
    it('should return user profile with token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        email: 'newuser@test.com',
        roles: expect.any(Array),
        permissions: expect.any(Array),
      });

      userId = response.body.userId;
    });

    it('should reject without token', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);
    });

    it('should reject invalid token', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh access token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(201);

      expect(response.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });

      // Update tokens
      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
    });

    it('should reject invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid_refresh_token' })
        .expect(401);
    });
  });

  describe('GET /auth/permissions', () => {
    it('should return user permissions', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/permissions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        roles: expect.any(Array),
        permissions: expect.any(Array),
      });

      // New users should have viewer role
      expect(response.body.roles.some((r: any) => r.name === 'viewer')).toBe(true);
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout successfully', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(201);
    });

    it('should reject reused refresh token', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  describe('RBAC - Role-based access', () => {
    let adminToken: string;
    let viewerToken: string;

    beforeAll(async () => {
      // Create admin user
      const adminRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'admin@test.com',
          password: 'AdminPass123!',
        });
      adminToken = adminRes.body.accessToken;

      // Create viewer user
      const viewerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'viewer@test.com',
          password: 'ViewerPass123!',
        });
      viewerToken = viewerRes.body.accessToken;
    });

    it('viewers can read reports', async () => {
      await request(app.getHttpServer())
        .get('/reports/trial-balance')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });

    it('viewers cannot create entries', async () => {
      await request(app.getHttpServer())
        .post('/entries')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          date: '2025-01-15',
          description: 'Test entry',
          postings: [
            { accountCode: '1000', debit: 100 },
            { accountCode: '4000', credit: 100 },
          ],
        })
        .expect(403);
    });
  });

  describe('Password hashing with argon2', () => {
    it('should hash passwords securely', async () => {
      const email = 'hashtest@test.com';
      
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email,
          password: 'TestPassword123!',
        });

      const user = await prisma.user.findUnique({
        where: { email },
      });

      expect(user?.passwordHash).toBeDefined();
      expect(user?.passwordHash).not.toContain('TestPassword123!');
      expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    });
  });
});
