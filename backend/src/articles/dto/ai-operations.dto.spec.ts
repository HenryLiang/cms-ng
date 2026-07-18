import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  RewriteTextDto,
  ExpandTextDto,
  CondenseTextDto,
  PolishTextDto,
  GenerateHeadlinesDto,
  GenerateExcerptDto,
  ChatWithAIDto,
  ChatMessageDto,
} from './ai-operations.dto';

describe('AI Operations DTOs', () => {
  describe('RewriteTextDto', () => {
    it('should pass with valid text', async () => {
      const dto = plainToInstance(RewriteTextDto, { text: 'Hello world' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail when text is missing', async () => {
      const dto = plainToInstance(RewriteTextDto, {});
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'text')).toBe(true);
    });

    it('should fail with invalid style', async () => {
      const dto = plainToInstance(RewriteTextDto, {
        text: 'Hello',
        style: 'invalid',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'style')).toBe(true);
    });

    it('should allow valid style values', async () => {
      for (const style of ['serious', 'casual', 'academic', 'concise']) {
        const dto = plainToInstance(RewriteTextDto, { text: 'Hello', style });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });
  });

  describe('ExpandTextDto', () => {
    it('should pass with valid text', async () => {
      const dto = plainToInstance(ExpandTextDto, { text: 'Hello' });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('should fail when text is missing', async () => {
      const dto = plainToInstance(ExpandTextDto, {});
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'text')).toBe(true);
    });
  });

  describe('CondenseTextDto', () => {
    it('should pass with valid text', async () => {
      const dto = plainToInstance(CondenseTextDto, { text: 'Hello' });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('should pass with maxLength', async () => {
      const dto = plainToInstance(CondenseTextDto, {
        text: 'Hello',
        maxLength: 100,
      });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('should fail when maxLength is not an integer', async () => {
      const dto = plainToInstance(CondenseTextDto, {
        text: 'Hello',
        maxLength: 100.5,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'maxLength')).toBe(true);
    });
  });

  describe('PolishTextDto', () => {
    it('should pass with valid text', async () => {
      const dto = plainToInstance(PolishTextDto, { text: 'Hello' });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('should fail when text is missing', async () => {
      const dto = plainToInstance(PolishTextDto, {});
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'text')).toBe(true);
    });
  });

  describe('GenerateHeadlinesDto', () => {
    it('should pass with empty object', async () => {
      const dto = plainToInstance(GenerateHeadlinesDto, {});
      expect(await validate(dto)).toHaveLength(0);
    });

    it('should pass with valid count', async () => {
      const dto = plainToInstance(GenerateHeadlinesDto, { count: 5 });
      expect(await validate(dto)).toHaveLength(0);
    });
  });

  describe('GenerateExcerptDto', () => {
    it('should pass with empty object', async () => {
      const dto = plainToInstance(GenerateExcerptDto, {});
      expect(await validate(dto)).toHaveLength(0);
    });
  });

  describe('ChatWithAIDto', () => {
    it('should pass with valid messages', async () => {
      const dto = plainToInstance(ChatWithAIDto, {
        messages: [{ role: 'user', content: 'Hello' }],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid message role', async () => {
      const dto = plainToInstance(ChatWithAIDto, {
        messages: [{ role: 'invalid', content: 'Hello' }],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
