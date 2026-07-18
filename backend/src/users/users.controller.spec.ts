import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserRole } from '@cms-ng/shared';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    findAll: jest.Mock;
    findEditors: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    setStatus: jest.Mock;
    resetPassword: jest.Mock;
    getConsumption: jest.Mock;
    changePassword: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findAll: jest.fn(),
      findEditors: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      setStatus: jest.fn(),
      resetPassword: jest.fn(),
      getConsumption: jest.fn(),
      changePassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      usersService.findAll.mockResolvedValue([{ id: 'u1', name: 'Test' }]);

      const result = await controller.findAll();

      expect(usersService.findAll).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('findEditors', () => {
    it('should return editor users', async () => {
      usersService.findEditors.mockResolvedValue([
        { id: 'e1', name: 'Editor' },
      ]);

      const result = await controller.findEditors();

      expect(usersService.findEditors).toHaveBeenCalled();
      expect(result[0].name).toBe('Editor');
    });
  });

  describe('findOne', () => {
    it('should return user by id', async () => {
      usersService.findOne.mockResolvedValue({ id: 'u1', name: 'Test' });

      const result = await controller.findOne('u1');

      expect(usersService.findOne).toHaveBeenCalledWith('u1');
      expect(result.id).toBe('u1');
    });
  });

  describe('update', () => {
    it('should allow admin to update any user', async () => {
      const dto = {
        name: 'Updated Name',
        preferredLanguage: 'ENGLISH' as const,
      };
      usersService.update.mockResolvedValue({ id: 'u2', name: 'Updated Name' });
      const admin = { userId: 'admin-id', role: UserRole.ADMIN };

      const result = await controller.update('u2', dto, admin);

      expect(usersService.update).toHaveBeenCalledWith('u2', dto);
      expect(result.name).toBe('Updated Name');
    });

    it('should reject updating other user profile for non-admin', async () => {
      const dto = { name: 'Updated Name' };
      const user = { userId: 'u1', role: UserRole.REPORTER };

      await expect(controller.update('u2', dto, user)).rejects.toThrow(
        'You can only update your own profile',
      );
    });
  });

  describe('create', () => {
    it('should create a user and return user + one-time password', async () => {
      const dto = {
        email: 'new@example.com',
        name: 'New',
        role: UserRole.REPORTER,
      };
      usersService.create.mockResolvedValue({
        user: { id: 'u2', email: 'new@example.com' },
        initialPassword: 'randompwd12',
      });

      const result = await controller.create(dto);

      expect(usersService.create).toHaveBeenCalledWith(dto);
      expect(result.initialPassword).toBe('randompwd12');
    });
  });

  describe('updateStatus', () => {
    it('should delegate to service with operator id', async () => {
      usersService.setStatus.mockResolvedValue({ id: 'u2', isActive: false });
      const dto = { isActive: false };

      const result = await controller.updateStatus('u2', dto, 'admin-id');

      expect(usersService.setStatus).toHaveBeenCalledWith(
        'u2',
        dto,
        'admin-id',
      );
      expect(result.isActive).toBe(false);
    });
  });

  describe('resetPassword', () => {
    it('should delegate to service and return one-time password', async () => {
      usersService.resetPassword.mockResolvedValue({ password: 'newrandom12' });

      const result = await controller.resetPassword('u2');

      expect(usersService.resetPassword).toHaveBeenCalledWith('u2');
      expect(result.password).toBe('newrandom12');
    });
  });

  describe('getConsumption', () => {
    it('should parse page/pageSize and delegate to service', async () => {
      usersService.getConsumption.mockResolvedValue({
        user: { id: 'u2' },
        summary: { totalSpent: 10 },
      });

      await controller.getConsumption('u2', '2', '50');

      expect(usersService.getConsumption).toHaveBeenCalledWith('u2', 2, 50);
    });

    it('should default page/pageSize when omitted', async () => {
      usersService.getConsumption.mockResolvedValue({ summary: {} });

      await controller.getConsumption('u2');

      expect(usersService.getConsumption).toHaveBeenCalledWith('u2', 1, 20);
    });
  });

  describe('changePassword', () => {
    it('should delegate to service with the current user id', async () => {
      const dto = { currentPassword: 'old', newPassword: 'new-password' };
      usersService.changePassword.mockResolvedValue(undefined);

      const result = await controller.changePassword('u1', dto);

      expect(usersService.changePassword).toHaveBeenCalledWith('u1', dto);
      expect(result).toEqual({ success: true });
    });
  });
});
