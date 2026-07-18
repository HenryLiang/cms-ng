import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import COS from 'cos-nodejs-sdk-v5';
import { CosStorageService } from './cos-storage.service';

// Mock COS SDK constructor
jest.mock('cos-nodejs-sdk-v5');

describe('CosStorageService', () => {
  let service: CosStorageService;
  let mockPutObject: jest.Mock;
  let mockDeleteObject: jest.Mock;
  let mockPutObjectCopy: jest.Mock;
  let config: { get: jest.Mock };

  const setupConfig = (env: Record<string, string>) => {
    config = {
      get: jest.fn((key: string, def?: string) => env[key] ?? def ?? ''),
    };
  };

  beforeEach(() => {
    mockPutObject = jest.fn().mockResolvedValue({});
    mockDeleteObject = jest.fn().mockResolvedValue({});
    mockPutObjectCopy = jest.fn().mockResolvedValue({});
    (COS as jest.MockedClass<typeof COS>).mockImplementation(
      () =>
        ({
          putObject: mockPutObject,
          deleteObject: mockDeleteObject,
          putObjectCopy: mockPutObjectCopy,
        }) as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('construction', () => {
    it('throws when COS_SECRET_ID is missing', async () => {
      setupConfig({ COS_SECRET_KEY: 'k', COS_BUCKET: 'b', COS_REGION: 'r' });
      await expect(
        Test.createTestingModule({
          providers: [
            CosStorageService,
            { provide: ConfigService, useValue: config },
          ],
        }).compile(),
      ).rejects.toThrow(/COS_SECRET_ID/);
    });

    it('throws when COS_SECRET_KEY is missing', async () => {
      setupConfig({ COS_SECRET_ID: 'i', COS_BUCKET: 'b', COS_REGION: 'r' });
      await expect(
        Test.createTestingModule({
          providers: [
            CosStorageService,
            { provide: ConfigService, useValue: config },
          ],
        }).compile(),
      ).rejects.toThrow(/COS_SECRET_KEY/);
    });
  });

  describe('put', () => {
    let serviceRef: CosStorageService;
    beforeEach(async () => {
      setupConfig({
        COS_SECRET_ID: 'sid',
        COS_SECRET_KEY: 'skey',
        COS_BUCKET: 'bkt-1300000000',
        COS_REGION: 'ap-shanghai',
      });
      const mod = await Test.createTestingModule({
        providers: [
          CosStorageService,
          { provide: ConfigService, useValue: config },
        ],
      }).compile();
      serviceRef = mod.get(CosStorageService);
    });

    it('calls cos.putObject with correct args and returns COS URL', async () => {
      const buf = Buffer.from('hello');
      const result = await serviceRef.put('cms-ng/x.png', buf, 'image/png');

      expect(mockPutObject).toHaveBeenCalledWith({
        Bucket: 'bkt-1300000000',
        Region: 'ap-shanghai',
        Key: 'cms-ng/x.png',
        Body: buf,
        ContentType: 'image/png',
      });
      expect(result).toEqual({
        url: 'https://bkt-1300000000.cos.ap-shanghai.myqcloud.com/cms-ng/x.png',
        key: 'cms-ng/x.png',
      });
    });

    it('uses COS_BASE_URL when set, stripping trailing slash', async () => {
      config.get.mockImplementation((k: string, d?: string) => {
        if (k === 'COS_BASE_URL') return 'https://cdn.example.com/';
        if (k === 'COS_BUCKET') return 'bkt-1300000000';
        if (k === 'COS_SECRET_ID') return 'sid';
        if (k === 'COS_SECRET_KEY') return 'skey';
        if (k === 'COS_REGION') return 'ap-shanghai';
        return d ?? '';
      });
      const mod = await Test.createTestingModule({
        providers: [
          CosStorageService,
          { provide: ConfigService, useValue: config },
        ],
      }).compile();
      const s = mod.get(CosStorageService);
      const r = await s.put('cms-ng/x.png', Buffer.from('x'), 'image/png');
      expect(r.url).toBe('https://cdn.example.com/cms-ng/x.png');
    });

    it('defaults contentType to application/octet-stream', async () => {
      await serviceRef.put('k', Buffer.from('x'));
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({ ContentType: 'application/octet-stream' }),
      );
    });
  });

  describe('delete', () => {
    it('calls cos.deleteObject with correct args', async () => {
      setupConfig({
        COS_SECRET_ID: 'sid',
        COS_SECRET_KEY: 'skey',
        COS_BUCKET: 'bkt-1300000000',
        COS_REGION: 'ap-shanghai',
      });
      const mod = await Test.createTestingModule({
        providers: [
          CosStorageService,
          { provide: ConfigService, useValue: config },
        ],
      }).compile();
      const s = mod.get(CosStorageService);
      await s.delete('cms-ng/x.png');
      expect(mockDeleteObject).toHaveBeenCalledWith({
        Bucket: 'bkt-1300000000',
        Region: 'ap-shanghai',
        Key: 'cms-ng/x.png',
      });
    });
  });

  describe('copy', () => {
    it('calls cos.putObjectCopy with correct args and returns dest URL', async () => {
      setupConfig({
        COS_SECRET_ID: 'sid',
        COS_SECRET_KEY: 'skey',
        COS_BUCKET: 'bkt-1300000000',
        COS_REGION: 'ap-shanghai',
      });
      const mod = await Test.createTestingModule({
        providers: [
          CosStorageService,
          { provide: ConfigService, useValue: config },
        ],
      }).compile();
      const s = mod.get(CosStorageService);
      const r = await s.copy(
        'cms-ng/media/u1/202607/a.png',
        'cms-ng/media/u1/202607/b.png',
      );
      expect(mockPutObjectCopy).toHaveBeenCalledWith({
        Bucket: 'bkt-1300000000',
        Region: 'ap-shanghai',
        Key: 'cms-ng/media/u1/202607/b.png',
        CopySource:
          'bkt-1300000000.cos.ap-shanghai.myqcloud.com/cms-ng/media/u1/202607/a.png',
      });
      expect(r).toEqual({
        url: 'https://bkt-1300000000.cos.ap-shanghai.myqcloud.com/cms-ng/media/u1/202607/b.png',
        key: 'cms-ng/media/u1/202607/b.png',
      });
    });
  });
});
