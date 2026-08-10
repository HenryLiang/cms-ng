import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindAllArticlesDto } from './find-all-articles.dto';

describe('FindAllArticlesDto', () => {
  it('trims search before applying the length limit', async () => {
    const search = 'x'.repeat(200);
    const dto = plainToInstance(FindAllArticlesDto, {
      search: `  ${search}  `,
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.search).toBe(search);
  });

  it('accepts an all-whitespace search as an empty search', async () => {
    const dto = plainToInstance(FindAllArticlesDto, {
      search: ' '.repeat(201),
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.search).toBe('');
  });
});
