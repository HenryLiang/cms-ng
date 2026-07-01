import { Module } from '@nestjs/common';
import { AuthorStyleService } from './author-style.service';
import { AuthorStyleController } from './author-style.controller';

@Module({
  providers: [AuthorStyleService],
  controllers: [AuthorStyleController],
  exports: [AuthorStyleService],
})
export class AuthorStyleModule {}
