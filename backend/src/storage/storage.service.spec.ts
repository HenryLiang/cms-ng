import { STORAGE_SERVICE, StorageService, PutResult } from './storage.service';

describe('StorageService interface contract', () => {
  it('exports STORAGE_SERVICE as a unique symbol', () => {
    expect(typeof STORAGE_SERVICE).toBe('symbol');
  });

  it('StorageService interface has put and delete methods', () => {
    // 编译期断言:类型层面强制约束,运行时仅做 sanity check
    const fake: StorageService = {
      put: jest.fn(),
      delete: jest.fn(),
    };
    expect(typeof fake.put).toBe('function');
    expect(typeof fake.delete).toBe('function');
  });

  it('PutResult exposes url and key', () => {
    const r: PutResult = { url: 'https://x.com/k', key: 'k' };
    expect(r.url).toBe('https://x.com/k');
    expect(r.key).toBe('k');
  });
});
