import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { FindAllStoriesDto } from './find-all-stories.dto';

describe('FindAllStoriesDto', () => {
  const toDto = (data: any) => plainToInstance(FindAllStoriesDto, data);

  it('should pass with empty data (all fields optional)', async () => {
    const errors = await validate(toDto({}));
    expect(errors).toHaveLength(0);
  });

  it('should coerce string page/pageSize to numbers', async () => {
    const dto = toDto({ page: '1', pageSize: '20' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(20);
  });

  it('should fail with negative page', async () => {
    const errors = await validate(toDto({ page: 0 }));
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('should fail with non-integer pageSize', async () => {
    const errors = await validate(toDto({ pageSize: 1.5 }));
    expect(errors.some((e) => e.property === 'pageSize')).toBe(true);
  });

  it('should pass with valid status enum', async () => {
    const dto = toDto({ status: 'APPROVED' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.status).toBe('APPROVED');
  });

  it('should fail with invalid status', async () => {
    const errors = await validate(toDto({ status: 'NOT_A_STATUS' }));
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('should pass with valid contentLanguage enum', async () => {
    const dto = toDto({ contentLanguage: 'ENGLISH' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.contentLanguage).toBe('ENGLISH');
  });

  it('should pass with valid sortBy', async () => {
    const dto = toDto({ sortBy: 'createdAt' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail with invalid sortBy', async () => {
    const errors = await validate(toDto({ sortBy: 'password' }));
    expect(errors.some((e) => e.property === 'sortBy')).toBe(true);
  });

  it('should fail with invalid order', async () => {
    const errors = await validate(toDto({ order: 'sideways' }));
    expect(errors.some((e) => e.property === 'order')).toBe(true);
  });
});
