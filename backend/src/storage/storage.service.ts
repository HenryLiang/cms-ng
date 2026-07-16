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

  /**
   * 复制一个对象(同 bucket 内,用于资产复制/正文图片另存)
   * @param srcKey 源对象 key
   * @param destKey 目标对象 key
   * @returns 目标对象的 url + key
   */
  copy(srcKey: string, destKey: string): Promise<PutResult>;

  /**
   * 由公网 url 生成缩略图 url。实现侧决定如何处理
   * (如 COS imageMogr2 / S3 image processing)。
   * 让缩略图策略与具体存储后端绑定,避免业务层硬编码。
   */
  thumbnailUrl(url: string): string;
}
