import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateStoryDto } from './create-story.dto';

describe('CreateStoryDto', () => {
  const createDto = (data: any) => plainToInstance(CreateStoryDto, data);

  it('should pass with valid data', async () => {
    const dto = createDto({ title: 'Test Story' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when title is missing', async () => {
    const dto = createDto({});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('should fail when title is not a string', async () => {
    const dto = createDto({ title: 123 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('should allow optional fields to be omitted', async () => {
    const dto = createDto({
      title: 'Test',
      description: 'Desc',
      angle: 'Angle',
      priority: 1,
      tags: ['tag1'],
      deadline: '2026-01-01T00:00:00Z',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail with invalid status enum', async () => {
    const dto = createDto({ title: 'Test', status: 'INVALID' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('should fail with invalid deadline format', async () => {
    const dto = createDto({ title: 'Test', deadline: 'not-a-date' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'deadline')).toBe(true);
  });
});
