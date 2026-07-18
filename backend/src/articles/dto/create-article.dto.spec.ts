import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateArticleDto } from './create-article.dto';

describe('CreateArticleDto', () => {
  const createDto = (data: any) => plainToInstance(CreateArticleDto, data);

  it('should pass with valid data', async () => {
    const dto = createDto({
      storyId: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Test Article',
      content: 'Content here',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when storyId is not a valid UUID', async () => {
    const dto = createDto({
      storyId: 'not-a-uuid',
      title: 'Test',
      content: 'Content',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'storyId')).toBe(true);
  });

  it('should fail when title is missing', async () => {
    const dto = createDto({
      storyId: '550e8400-e29b-41d4-a716-446655440000',
      content: 'Content',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('should fail when content is missing', async () => {
    const dto = createDto({
      storyId: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Test',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'content')).toBe(true);
  });

  it('should allow optional fields', async () => {
    const dto = createDto({
      storyId: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Test',
      content: 'Content',
      subtitle: 'Subtitle',
      excerpt: 'Excerpt',
      tags: ['tag1'],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
