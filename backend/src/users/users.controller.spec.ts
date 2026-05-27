import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    findAll: jest.Mock;
    findEditors: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findAll: jest.fn(),
      findEditors: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
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
      usersService.findEditors.mockResolvedValue([{ id: 'e1', name: 'Editor' }]);

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
    it('should update user and return updated user', async () => {
      const dto = { name: 'Updated Name', preferredLanguage: 'ENGLISH' as const };
      usersService.update.mockResolvedValue({ id: 'u1', name: 'Updated Name' });

      const result = await controller.update('u1', dto);

      expect(usersService.update).toHaveBeenCalledWith('u1', dto);
      expect(result.name).toBe('Updated Name');
    });
  });
});
