import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GenerateDraftFromResearchKitDto } from './generate-draft.dto';

describe('GenerateDraftFromResearchKitDto', () => {
  it('rejects an unsupported article genre', async () => {
    const dto = plainToInstance(GenerateDraftFromResearchKitDto, {
      researchKit: { timeline: [], people: [], data: [], opinions: [] },
      genre: 'SOCIAL_MEDIA_POST',
      targetWordCount: 1500,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'genre')).toBe(true);
  });

  it.each([99, 10001, 1200.5])(
    'rejects an invalid target word count: %s',
    async (targetWordCount) => {
      const dto = plainToInstance(GenerateDraftFromResearchKitDto, {
        researchKit: { timeline: [], people: [], data: [], opinions: [] },
        targetWordCount,
      });

      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'targetWordCount')).toBe(
        true,
      );
    },
  );

  it.each([100, 1500, 10000])(
    'accepts a freely entered target word count in range: %s',
    async (targetWordCount) => {
      const dto = plainToInstance(GenerateDraftFromResearchKitDto, {
        researchKit: { timeline: [], people: [], data: [], opinions: [] },
        genre: 'FEATURE_STORY',
        targetWordCount,
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );
});
