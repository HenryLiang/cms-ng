import { Test, TestingModule } from '@nestjs/testing';
import { RegistrationService } from './registration.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RegistrationService', () => {
  let service: RegistrationService;
  // Focused prisma mock: only the registrationSwitch delegate is exercised.
  const prisma = {
    registrationSwitch: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  } as unknown as jest.Mocked<PrismaService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<RegistrationService>(RegistrationService);
  });

  describe('isRegistrationOpen', () => {
    it('should return true when no row exists (default-open: absence = open)', async () => {
      prisma.registrationSwitch.findUnique.mockResolvedValue(null);

      await expect(service.isRegistrationOpen()).resolves.toBe(true);
      expect(prisma.registrationSwitch.findUnique).toHaveBeenCalledWith({
        where: { id: 'registration' },
      });
    });

    it('should return true when row enabled=true', async () => {
      prisma.registrationSwitch.findUnique.mockResolvedValue({
        id: 'registration',
        enabled: true,
      });

      await expect(service.isRegistrationOpen()).resolves.toBe(true);
    });

    it('should return false when row enabled=false', async () => {
      prisma.registrationSwitch.findUnique.mockResolvedValue({
        id: 'registration',
        enabled: false,
      });

      await expect(service.isRegistrationOpen()).resolves.toBe(false);
    });
  });

  describe('setRegistrationOpen', () => {
    it('should upsert enabled=false with audit fields and return false', async () => {
      prisma.registrationSwitch.upsert.mockResolvedValue({});

      const result = await service.setRegistrationOpen(
        false,
        'admin-id',
        '维护收口',
      );

      expect(prisma.registrationSwitch.upsert).toHaveBeenCalledWith({
        where: { id: 'registration' },
        create: expect.objectContaining({
          id: 'registration',
          enabled: false,
          enabledBy: 'admin-id',
          reason: '维护收口',
        }),
        update: expect.objectContaining({
          enabled: false,
          enabledBy: 'admin-id',
          reason: '维护收口',
        }),
      });
      expect(result).toBe(false);
    });

    it('should upsert enabled=true and return true (reason optional)', async () => {
      prisma.registrationSwitch.upsert.mockResolvedValue({});

      const result = await service.setRegistrationOpen(true, 'admin-id');

      const call = prisma.registrationSwitch.upsert.mock.calls[0][0];
      expect(call.update.enabled).toBe(true);
      expect(call.update.reason).toBeNull();
      expect(result).toBe(true);
    });
  });
});
