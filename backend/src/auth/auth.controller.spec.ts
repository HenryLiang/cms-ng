import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    getCurrentUser: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      getCurrentUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should call authService.register with dto', async () => {
      const dto = { email: 'test@example.com', name: 'Test', password: 'password123', role: 'REPORTER' };
      authService.register.mockResolvedValue({ token: 'jwt-token', user: { id: 'u1' } });

      const result = await controller.register(dto as any);

      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(result.token).toBe('jwt-token');
    });
  });

  describe('login', () => {
    it('should call authService.login with dto', async () => {
      const dto = { email: 'test@example.com', password: 'password123' };
      authService.login.mockResolvedValue({ token: 'jwt-token', user: { id: 'u1' } });

      const result = await controller.login(dto as any);

      expect(authService.login).toHaveBeenCalledWith(dto);
      expect(result.token).toBe('jwt-token');
    });
  });

  describe('getMe', () => {
    it('should call authService.getCurrentUser with userId', async () => {
      authService.getCurrentUser.mockResolvedValue({ id: 'u1', name: 'Test' });

      const result = await controller.getMe('u1');

      expect(authService.getCurrentUser).toHaveBeenCalledWith('u1');
      expect(result.name).toBe('Test');
    });
  });

  // ===== issue #49 — POST /auth/refresh =====
  describe('refresh (issue #49)', () => {
    it('should call authService.refresh with the token from the dto body', async () => {
      authService.refresh.mockResolvedValue({
        accessToken: 'new_jwt_token',
        user: { id: 'u1' },
      });

      const result = await controller.refresh({ token: 'old.jwt.token' } as any);

      expect(authService.refresh).toHaveBeenCalledWith('old.jwt.token');
      expect(result.accessToken).toBe('new_jwt_token');
    });
  });
});
