import {
  parseShanghaiRelativeDate,
  shanghaiDateTimeToTimestamp,
} from './newsnow-date.util';

describe('newsnow-date.util (上海时区,固定系统时间 2026-08-23 12:00 上海)', () => {
  // 固定系统时间:2026-08-23T04:00:00Z = 上海 2026-08-23 12:00
  const FIXED_NOW = Date.parse('2026-08-23T04:00:00Z');

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('shanghaiDateTimeToTimestamp', () => {
    it('解析北京时间的完整日期时间(不依赖机器时区)', () => {
      expect(shanghaiDateTimeToTimestamp('2026-08-23 14:32:11')).toBe(
        Date.parse('2026-08-23T14:32:11+08:00'),
      );
    });

    it('解析日期 + 时分', () => {
      expect(shanghaiDateTimeToTimestamp('2026-08-23 14:32')).toBe(
        Date.parse('2026-08-23T14:32+08:00'),
      );
    });

    it('仅日期按零点解释', () => {
      expect(shanghaiDateTimeToTimestamp('2026-08-23')).toBe(
        Date.parse('2026-08-23T00:00:00+08:00'),
      );
    });

    it('非法输入 fail-open 返回当前时间', () => {
      expect(shanghaiDateTimeToTimestamp('不是日期')).toBe(FIXED_NOW);
    });
  });

  describe('parseShanghaiRelativeDate', () => {
    it('「刚刚」-> 当前时间', () => {
      expect(parseShanghaiRelativeDate('刚刚')).toBe(FIXED_NOW);
    });

    it('「N分钟前」按分钟回退', () => {
      expect(parseShanghaiRelativeDate('10分钟前')).toBe(FIXED_NOW - 600_000);
    });

    it('「N小时前」「N天前」「N秒前」', () => {
      expect(parseShanghaiRelativeDate('3小时前')).toBe(
        FIXED_NOW - 3 * 3_600_000,
      );
      expect(parseShanghaiRelativeDate('2天前')).toBe(
        FIXED_NOW - 2 * 86_400_000,
      );
      expect(parseShanghaiRelativeDate('45秒前')).toBe(FIXED_NOW - 45_000);
    });

    it('「昨天 21:04」-> 上海时区昨天 21:04', () => {
      expect(parseShanghaiRelativeDate('昨天 21:04')).toBe(
        Date.parse('2026-08-22T21:04+08:00'),
      );
    });

    it('「前天」不带时间 -> 前天零点', () => {
      expect(parseShanghaiRelativeDate('前天')).toBe(
        Date.parse('2026-08-21T00:00:00+08:00'),
      );
    });

    it('「MM-DD」-> 当年上海时区零点', () => {
      expect(parseShanghaiRelativeDate('08-15')).toBe(
        Date.parse('2026-08-15T00:00:00+08:00'),
      );
    });

    it('「MM-DD」比当前晚超过 3 天 -> 视为去年(跨年榜单)', () => {
      expect(parseShanghaiRelativeDate('12-30')).toBe(
        Date.parse('2025-12-30T00:00:00+08:00'),
      );
    });

    it('「HH:mm」-> 当天上海时区', () => {
      expect(parseShanghaiRelativeDate('09:30')).toBe(
        Date.parse('2026-08-23T09:30+08:00'),
      );
    });

    it('完整日期时间回退到绝对解析', () => {
      expect(parseShanghaiRelativeDate('2026-08-20 08:00:00')).toBe(
        Date.parse('2026-08-20T08:00:00+08:00'),
      );
    });

    it('未识别模式 fail-open 返回当前时间', () => {
      expect(parseShanghaiRelativeDate('一炷香之前')).toBe(FIXED_NOW);
    });
  });
});
