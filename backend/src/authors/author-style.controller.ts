import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { AuthorStyleService, AuthorSourceInfo } from './author-style.service';

@ApiTags('authors')
@Controller('authors')
export class AuthorStyleController {
  constructor(private readonly authorStyleService: AuthorStyleService) {}

  @Get()
  @ApiOperation({
    summary: 'List available author personas for author-style writing',
    description:
      'Returns the author list read from data/authors/. When the directory is missing or empty, returns an empty list with source="fallback" and a warning — the app then generates with the default style.',
  })
  @ApiOkResponse({
    description: 'Author list + data-source status',
  })
  async list(): Promise<AuthorSourceInfo> {
    return this.authorStyleService.listAuthors();
  }
}
