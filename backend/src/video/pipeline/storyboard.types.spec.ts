import { parseStoryboard, sceneDurationSec } from './storyboard.types';

const VALID = {
  title: '测试成片',
  scenes: [
    {
      narration: '第一段口播文本。',
      visual: { type: 'image', prompt: '城市日出', durationHintSec: 5 },
    },
    {
      narration: '第二段口播文本。',
      visual: { type: 'video_clip', prompt: '航拍', durationHintSec: 8 },
    },
  ],
};

describe('parseStoryboard 分镜契约', () => {
  it('合法输入归一化:index 重排、画幅透传、fallback 默认 image', () => {
    const sb = parseStoryboard(VALID, { aspectRatio: '9:16' });
    expect(sb.title).toBe('测试成片');
    expect(sb.aspectRatio).toBe('9:16');
    expect(sb.scenes).toHaveLength(2);
    expect(sb.scenes[0].index).toBe(0);
    expect(sb.scenes[1].visual.type).toBe('video_clip');
    expect(sb.scenes[0].fallback).toBe('image');
  });

  it('非对象 / 缺 scenes → 抛错', () => {
    expect(() => parseStoryboard(null, { aspectRatio: '9:16' })).toThrow(
      /不是 JSON 对象/,
    );
    expect(() => parseStoryboard({}, { aspectRatio: '9:16' })).toThrow(
      /scenes/,
    );
  });

  it('镜数越界(<2 或 >12)→ 抛错', () => {
    expect(() =>
      parseStoryboard({ scenes: [VALID.scenes[0]] }, { aspectRatio: '9:16' }),
    ).toThrow(/镜数/);
    expect(() =>
      parseStoryboard(
        { scenes: Array(13).fill(VALID.scenes[0]) },
        { aspectRatio: '9:16' },
      ),
    ).toThrow(/镜数/);
  });

  it('缺口播文本 / 缺视觉 prompt → 抛错并指出镜号', () => {
    expect(() =>
      parseStoryboard(
        {
          scenes: [
            VALID.scenes[0],
            { narration: '  ', visual: VALID.scenes[0].visual },
          ],
        },
        { aspectRatio: '9:16' },
      ),
    ).toThrow(/第 2 镜缺口播文本/);
    expect(() =>
      parseStoryboard(
        {
          scenes: [
            VALID.scenes[0],
            { narration: '有口播', visual: { type: 'image', prompt: ' ' } },
          ],
        },
        { aspectRatio: '9:16' },
      ),
    ).toThrow(/第 2 镜缺视觉生成 prompt/);
  });

  it('未知视觉类型归一为 image;media_asset 缺 id 抛错', () => {
    const sb = parseStoryboard(
      {
        scenes: [
          VALID.scenes[0],
          {
            narration: '口播',
            visual: { type: 'hologram', prompt: 'p', durationHintSec: 5 },
          },
        ],
      },
      { aspectRatio: '9:16' },
    );
    expect(sb.scenes[1].visual.type).toBe('image');
    expect(() =>
      parseStoryboard(
        {
          scenes: [
            VALID.scenes[0],
            { narration: '口播', visual: { type: 'media_asset' } },
          ],
        },
        { aspectRatio: '9:16' },
      ),
    ).toThrow(/mediaAssetId/);
  });

  it('durationHintSec 越界回退 6;非法画幅回退 9:16', () => {
    const sb = parseStoryboard(
      {
        scenes: [
          {
            narration: '一',
            visual: { type: 'image', prompt: 'p', durationHintSec: 99 },
          },
          VALID.scenes[1],
        ],
      },
      { aspectRatio: '4:3' },
    );
    expect(sb.scenes[0].visual.durationHintSec).toBe(6);
    expect(sb.aspectRatio).toBe('9:16');
  });
});

describe('sceneDurationSec', () => {
  it('有配音按配音时长(向上取整,下限 2s);无配音按 hint', () => {
    const base = parseStoryboard(VALID, { aspectRatio: '9:16' }).scenes[0];
    expect(sceneDurationSec(base)).toBe(5);
    expect(
      sceneDurationSec({
        ...base,
        voice: { audioUrl: 'u', durationMs: 4300 },
      }),
    ).toBe(5);
    expect(
      sceneDurationSec({ ...base, voice: { audioUrl: 'u', durationMs: 800 } }),
    ).toBe(2);
  });
});
