import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 多模态参考物(仅 L1;角色可用性按 provider 能力位在 service 层校验) */
export class VideoReferenceDto {
  @ApiProperty({
    description:
      '参考角色:first_frame 首帧 | last_frame 尾帧 | reference_image 参考图 | reference_video 参考视频 | reference_audio 参考音频',
    enum: [
      'first_frame',
      'last_frame',
      'reference_image',
      'reference_video',
      'reference_audio',
    ],
  })
  @IsIn([
    'first_frame',
    'last_frame',
    'reference_image',
    'reference_video',
    'reference_audio',
  ])
  role!:
    | 'first_frame'
    | 'last_frame'
    | 'reference_image'
    | 'reference_video'
    | 'reference_audio';

  @ApiProperty({
    description: '公网可直达 https URL(媒体库 COS 地址或外部链接)',
  })
  @IsString()
  @MaxLength(2048)
  @Matches(/^https:\/\//, { message: '参考素材 URL 必须是 https:// 链接' })
  url!: string;
}

export class CreateVideoJobDto {
  @ApiPropertyOptional({
    description:
      '任务模式:TEXT_TO_CLIP(L1 文生片段)| ARTICLE_TO_VIDEO(L2 稿件成片)',
    enum: ['TEXT_TO_CLIP', 'ARTICLE_TO_VIDEO'],
    default: 'TEXT_TO_CLIP',
  })
  @IsOptional()
  @IsIn(['TEXT_TO_CLIP', 'ARTICLE_TO_VIDEO'])
  mode?: 'TEXT_TO_CLIP' | 'ARTICLE_TO_VIDEO';

  @ApiPropertyOptional({
    description:
      '画面描述(L1 必填;L2 可选,作为成片风格附加指引)。与 articleId 的交叉必填校验在 service 层',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prompt?: string;

  @ApiPropertyOptional({ description: '来源文章 ID(L2 必填,仅溯源引用)' })
  @IsOptional()
  @IsString()
  articleId?: string;

  @ApiPropertyOptional({
    description: '生成 provider,缺省用服务端 VIDEO_CLIP_PROVIDER 配置',
    enum: ['volcengine', 'minimax'],
  })
  @IsOptional()
  @IsIn(['volcengine', 'minimax'])
  provider?: string;

  @ApiPropertyOptional({
    description:
      '时长(秒),Seedance 2.x 支持 4~15 自由档;1.0 系归一 5/10,MiniMax 归一 6/10',
    default: 6,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(15)
  durationSec?: number;

  @ApiPropertyOptional({
    enum: ['480P', '720P'],
    default: '480P',
    description:
      '480P/720P 两档(Seedance 2.x 原生支持;MiniMax 无 480P/720P 档,均映射 768P)',
  })
  @IsOptional()
  @IsIn(['480P', '720P'])
  resolution?: '480P' | '720P';

  @ApiPropertyOptional({ enum: ['16:9', '9:16', '1:1'], default: '9:16' })
  @IsOptional()
  @IsIn(['16:9', '9:16', '1:1'])
  aspectRatio?: '16:9' | '9:16' | '1:1';

  @ApiPropertyOptional({
    description:
      '原生音频(仅 L1;Seedance 1.5+/2.x 支持,生成有声视频:对白/音效/配乐)。provider 不支持时静默忽略',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  generateAudio?: boolean;

  @ApiPropertyOptional({
    description:
      '多模态参考素材(仅 L1;Seedance 2.x 支持全部角色,其他模型/provider 仅 first_frame)。' +
      '约束:总数 ≤15,首/尾帧各 ≤1,图片合计 ≤9,视频 ≤3,音频 ≤3 且不能单独存在(须至少 1 图或 1 视频);' +
      '帧角色(首/尾帧)与参考角色(图/视频/音频)互斥不可混用',
    type: [VideoReferenceDto],
  })
  @IsOptional()
  @ArrayMaxSize(15) // 上限 = 图片 9 + 视频 3 + 音频 3(合法组合的理论最大值)
  @ValidateNested({ each: true })
  @Type(() => VideoReferenceDto)
  references?: VideoReferenceDto[];

  @ApiPropertyOptional({
    description: '随机种子(仅 L1;Seedance 2.x):相同 seed 可复现结果',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  seed?: number;

  @ApiPropertyOptional({
    description:
      '草稿模式(仅 L1;Seedance 2.x 非 mini 档):更快更便宜质量更低,用于打样。2.0-mini 全模式不支持(实测)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  draft?: boolean;

  @ApiPropertyOptional({
    description:
      '返回尾帧图(仅 L1;Seedance 2.x):成功后尾帧入库媒体库,用于续拍链(上段尾帧=下段首帧)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  returnLastFrame?: boolean;
}

export class QueryVideoJobDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional({ description: '按状态筛选(VideoJobStatus)' })
  @IsOptional()
  @IsString()
  status?: string;
}
