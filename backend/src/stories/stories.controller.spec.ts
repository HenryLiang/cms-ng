import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';

describe('StoriesController', () => {
  let controller: StoriesController;
  let storiesService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    verifyAccess: jest.Mock;
    assignEditor: jest.Mock;
    generateResearchKit: jest.Mock;
  };

  beforeEach(async () => {
    storiesService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      verifyAccess: jest.fn(),
      assignEditor: jest.fn(),
      generateResearchKit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StoriesController],
      providers: [{ provide: StoriesService, useValue: storiesService }],
    }).compile();

    controller = module.get<StoriesController>(StoriesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockUser = { userId: 'user-id', role: 'REPORTER' };
  const mockAdmin = { userId: 'admin-id', role: 'ADMIN' };
  const mockStory = (override?: any) => ({
    id: 'story-id',
    title: 'Test Story',
    reporterId: 'user-id',
    editorId: null,
    ...override,
  });

  describe('create', () => {
    it('should call storiesService.create', async () => {
      storiesService.create.mockResolvedValue(mockStory());

      const result = await controller.create('user-id', { title: 'Test' } as any);

      expect(storiesService.create).toHaveBeenCalledWith('user-id', { title: 'Test' });
      expect(result.title).toBe('Test Story');
    });
  });

  describe('findAll', () => {
    it('should call storiesService.findAll with user', async () => {
      storiesService.findAll.mockResolvedValue([mockStory()]);

      const result = await controller.findAll(mockUser);

      expect(storiesService.findAll).toHaveBeenCalledWith(mockUser);
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return story when user is author', async () => {
      storiesService.findOne.mockResolvedValue(mockStory({ reporterId: 'user-id' }));

      const result = await controller.findOne('story-id', mockUser);

      expect(storiesService.findOne).toHaveBeenCalledWith('story-id');
      expect(result.id).toBe('story-id');
    });

    it('should return story when user is admin', async () => {
      storiesService.findOne.mockResolvedValue(mockStory({ reporterId: 'other-id' }));

      const result = await controller.findOne('story-id', mockAdmin);

      expect(result.id).toBe('story-id');
    });

    it('should throw ForbiddenException when user has no access', async () => {
      storiesService.findOne.mockResolvedValue(mockStory({ reporterId: 'other-id', editorId: 'another-id' }));

      await expect(controller.findOne('story-id', mockUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should verify access then update', async () => {
      storiesService.verifyAccess.mockResolvedValue(undefined);
      storiesService.update.mockResolvedValue(mockStory({ title: 'Updated' }));

      const result = await controller.update('story-id', { title: 'Updated' } as any, mockUser);

      expect(storiesService.verifyAccess).toHaveBeenCalledWith('story-id', mockUser);
      expect(storiesService.update).toHaveBeenCalledWith('story-id', { title: 'Updated' });
      expect(result.title).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('should verify access then remove', async () => {
      storiesService.verifyAccess.mockResolvedValue(undefined);
      storiesService.remove.mockResolvedValue({ success: true });

      const result = await controller.remove('story-id', mockUser);

      expect(storiesService.verifyAccess).toHaveBeenCalledWith('story-id', mockUser);
      expect(storiesService.remove).toHaveBeenCalledWith('story-id');
      expect(result.success).toBe(true);
    });
  });

  describe('assignEditor', () => {
    it('should call assignEditor', async () => {
      storiesService.assignEditor.mockResolvedValue(mockStory({ editorId: 'editor-id' }));

      const result = await controller.assignEditor('story-id', 'editor-id');

      expect(storiesService.assignEditor).toHaveBeenCalledWith('story-id', 'editor-id');
      expect(result.editorId).toBe('editor-id');
    });
  });

  describe('generateResearchKit', () => {
    it('should verify access and call generateResearchKit', async () => {
      storiesService.verifyAccess.mockResolvedValue(undefined);
      storiesService.generateResearchKit.mockResolvedValue({
        timeline: [], people: [], data: [], opinions: [],
      });

      const result = await controller.generateResearchKit('story-id', mockUser);

      expect(storiesService.verifyAccess).toHaveBeenCalledWith('story-id', mockUser);
      expect(storiesService.generateResearchKit).toHaveBeenCalledWith('user-id', 'story-id');
      expect(result.timeline).toEqual([]);
    });

    it('should allow admin to generate research kit', async () => {
      storiesService.verifyAccess.mockResolvedValue(undefined);
      storiesService.generateResearchKit.mockResolvedValue({
        timeline: [{ date: '2024-01-01', event: 'E1' }],
        people: [], data: [], opinions: [],
      });

      const result = await controller.generateResearchKit('story-id', mockAdmin);

      expect(storiesService.verifyAccess).toHaveBeenCalledWith('story-id', mockAdmin);
      expect(result.timeline).toHaveLength(1);
    });
  });
});
