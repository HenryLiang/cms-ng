import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import COS from 'cos-nodejs-sdk-v5';
import { PutResult, StorageService } from './storage.service';

@Injectable()
export class CosStorageService implements StorageService {
  private readonly client: COS;
  private readonly bucket: string;
  private readonly region: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    const secretId = config.get<string>('COS_SECRET_ID');
    const secretKey = config.get<string>('COS_SECRET_KEY');
    if (!secretId || !secretKey) {
      throw new Error('COS_SECRET_ID 和 COS_SECRET_KEY 必须配置');
    }
    this.client = new COS({ SecretId: secretId, SecretKey: secretKey });
    this.bucket = config.get<string>('COS_BUCKET', '');
    this.region = config.get<string>('COS_REGION', 'ap-shanghai');
    const explicit = config.get<string>('COS_BASE_URL');
    this.baseUrl = (
      explicit && explicit.length > 0
        ? explicit
        : `https://${this.bucket}.cos.${this.region}.myqcloud.com`
    ).replace(/\/$/, '');
  }

  async put(
    key: string,
    body: Buffer,
    contentType: string = 'application/octet-stream',
  ): Promise<PutResult> {
    await this.client.putObject({
      Bucket: this.bucket,
      Region: this.region,
      Key: key,
      Body: body,
      ContentType: contentType,
    });
    return { url: `${this.baseUrl}/${key}`, key };
  }

  async delete(key: string): Promise<void> {
    await this.client.deleteObject({
      Bucket: this.bucket,
      Region: this.region,
      Key: key,
    });
  }

  async copy(srcKey: string, destKey: string): Promise<PutResult> {
    await this.client.putObjectCopy({
      Bucket: this.bucket,
      Region: this.region,
      Key: destKey,
      CopySource: `${this.bucket}.cos.${this.region}.myqcloud.com/${srcKey}`,
    });
    return { url: `${this.baseUrl}/${destKey}`, key: destKey };
  }

  thumbnailUrl(url: string): string {
    // COS 数据万象 imageMogr2：按长边缩略到 300px + 去元数据（strip 含 EXIF）
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}imageMogr2/thumbnail/300x300/strip`;
  }
}
