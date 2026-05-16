import { Controller, Get, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CurrentUser } from './current-user.decorator';

describe('CurrentUser decorator', () => {
  @Controller('test')
  class TestController {
    @Get('user')
    getUser(@CurrentUser() user: any) {
      return user;
    }

    @Get('userid')
    getUserId(@CurrentUser('userId') userId: string) {
      return userId;
    }
  }

  it('decorator should exist and be a function', () => {
    expect(typeof CurrentUser).toBe('function');
  });

  it('should compile a controller using @CurrentUser()', async () => {
    const module = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();

    const controller = module.get(TestController);
    expect(controller).toBeDefined();
  });
});
