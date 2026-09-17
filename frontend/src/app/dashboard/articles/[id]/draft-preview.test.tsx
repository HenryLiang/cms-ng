import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import DraftPreview from './draft-preview';

describe('DraftPreview', () => {
  it('renders sanitized content without event handlers or scripts in the DOM', () => {
    const { container } = render(
      <DraftPreview
        content={
          '<p onclick="alert(1)">正文</p><script>alert(2)</script><img src=x onerror=alert(3)>'
        }
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.querySelectorAll('script,img,iframe')).toHaveLength(0);
    expect(root.querySelectorAll('[onclick],[onerror],[onload]')).toHaveLength(0);
    expect(root.textContent).toContain('正文');
  });

  it('keeps allowed editorial tags in the DOM', () => {
    const { container } = render(
      <DraftPreview content="<h2>小标题</h2><p>段落 <strong>重点</strong></p>" />,
    );
    expect(container.querySelector('h2')?.textContent).toBe('小标题');
    expect(container.querySelector('strong')?.textContent).toBe('重点');
  });
});
