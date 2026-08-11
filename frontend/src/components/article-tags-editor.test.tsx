import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ArticleTagsEditor from './article-tags-editor';

describe('ArticleTagsEditor', () => {
  it('lets an editor add a manual tag', () => {
    const onChange = vi.fn();
    render(
      <ArticleTagsEditor
        tags={['手工标签']}
        onChange={onChange}
        onAITag={vi.fn()}
        aiLoading={false}
      />,
    );

    const input = screen.getByPlaceholderText('输入标签后按回车');
    fireEvent.change(input, { target: { value: '人工智能' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['手工标签', '人工智能']);
  });

  it('triggers one-click AI tagging', () => {
    const onAITag = vi.fn();
    render(
      <ArticleTagsEditor
        tags={[]}
        onChange={vi.fn()}
        onAITag={onAITag}
        aiLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'AI 一键打标' }));

    expect(onAITag).toHaveBeenCalledOnce();
  });
});
