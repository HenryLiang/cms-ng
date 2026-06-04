/**
 * 对象存储抽象接口
 *
 * 当前实现:CosStorageService(腾讯云 COS)
 * 未来可扩展:S3StorageService、OssStorageService 等
 */
export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface PutResult {
  /** 公开可访问的完整 URL(末尾无 /) */
  url: string;
  /** 对象 key,供后续 delete 用 */
  key: string;
}

export interface StorageService {
  /**
   * 上传一个对象
   * @param key 对象 key(相对 bucket 根,不含前导 /)
   * @param body 二进制内容
   * @param contentType MIME 类型,默认 application/octet-stream
   */
  put(key: string, body: Buffer, contentType?: string): Promise<PutResult>;

  /**
   * 删除一个对象(找不到不抛错)
   */
  delete(key: string): Promise<void>;
}
