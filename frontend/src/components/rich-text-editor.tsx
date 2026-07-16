'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import Youtube from '@tiptap/extension-youtube';
import CharacterCount from '@tiptap/extension-character-count';
import Dropcursor from '@tiptap/extension-dropcursor';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Highlighter,
  Palette,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  ImagePlus,
  Video,
  Table as TableIcon,
  Trash2,
  Undo,
  Redo,
} from 'lucide-react';
import { forwardRef, useImperativeHandle, useEffect, useState } from 'react';
import { MediaPicker } from './media-picker';

export interface RichTextEditorRef {
  editor: Editor | null;
}

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  function RichTextEditor({ content, onChange, placeholder }, ref) {
    const [showTableMenu, setShowTableMenu] = useState(false);
    const [showMediaPicker, setShowMediaPicker] = useState(false);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Placeholder.configure({
          placeholder: placeholder || '开始写作...',
        }),
        Link.configure({
          openOnClick: false,
        }),
        Image.configure({
          inline: false,
          allowBase64: false,
        }),
        TextAlign.configure({
          types: ['heading', 'paragraph'],
        }),
        Underline,
        Highlight.configure({
          multicolor: false,
        }),
        TextStyle,
        Color.configure({
          types: ['textStyle'],
        }),
        Table.configure({
          resizable: true,
        }),
        TableRow,
        TableCell,
        TableHeader,
        Youtube.configure({
          nocookie: true,
          modestBranding: true,
        }),
        CharacterCount,
        Dropcursor,
      ],
      content,
      onUpdate: ({ editor }) => {
        onChange(editor.getHTML());
      },
    });

    useEffect(() => {
      if (editor && content !== editor.getHTML()) {
        editor.commands.setContent(content, { emitUpdate: false });
      }
    }, [content, editor]);

    useImperativeHandle(ref, () => ({
      editor,
    }), [editor]);

    if (!editor) return null;

    const toggleLink = () => {
      const previousUrl = editor.getAttributes('link').href;
      const url = window.prompt('输入链接地址', previousUrl);
      if (url === null) return;
      if (url === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        return;
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    };

    const insertImage = () => {
      setShowMediaPicker(true);
    };

    const insertYoutube = () => {
      const url = window.prompt('输入 YouTube 视频链接');
      if (!url) return;
      editor.chain().focus().setYoutubeVideo({ src: url }).run();
    };

    const setTextColor = () => {
      const color = window.prompt('输入颜色值（如 #ff0000 或 red）', editor.getAttributes('textStyle').color || '');
      if (color === null) return;
      if (color === '') {
        editor.chain().focus().unsetColor().run();
        return;
      }
      editor.chain().focus().setColor(color).run();
    };

    const charCount = editor.storage.characterCount?.characters?.() ?? 0;
    const wordCount = editor.storage.characterCount?.words?.() ?? 0;

    const ToolbarButton = ({
      onClick,
      active,
      icon,
      title,
    }: {
      onClick: () => void;
      active?: boolean;
      icon: React.ReactNode;
      title: string;
    }) => (
      <button
        onClick={onClick}
        title={title}
        className={`rounded-md p-1.5 transition-colors ${
          active ? 'bg-surface-muted text-foreground' : 'text-muted hover:bg-surface-muted hover:text-foreground'
        }`}
      >
        {icon}
      </button>
    );

    return (
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex items-center gap-1 border-b border-line bg-canvas px-3 py-1.5 flex-wrap">
          {/* Format */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            icon={<Bold className="h-4 w-4" />}
            title="加粗"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            icon={<Italic className="h-4 w-4" />}
            title="斜体"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive('underline')}
            icon={<UnderlineIcon className="h-4 w-4" />}
            title="下划线"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            active={editor.isActive('highlight')}
            icon={<Highlighter className="h-4 w-4" />}
            title="高亮"
          />
          <ToolbarButton
            onClick={setTextColor}
            active={editor.isActive('textStyle')}
            icon={<Palette className="h-4 w-4" />}
            title="文字颜色"
          />
          <div className="mx-1 h-4 w-px bg-line" />

          {/* Headings */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            icon={<Heading1 className="h-4 w-4" />}
            title="一级标题"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            icon={<Heading2 className="h-4 w-4" />}
            title="二级标题"
          />
          <div className="mx-1 h-4 w-px bg-line" />

          {/* Lists */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            icon={<List className="h-4 w-4" />}
            title="无序列表"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            icon={<ListOrdered className="h-4 w-4" />}
            title="有序列表"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive('blockquote')}
            icon={<Quote className="h-4 w-4" />}
            title="引用"
          />
          <div className="mx-1 h-4 w-px bg-line" />

          {/* Alignment */}
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            active={editor.isActive({ textAlign: 'left' })}
            icon={<AlignLeft className="h-4 w-4" />}
            title="左对齐"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            active={editor.isActive({ textAlign: 'center' })}
            icon={<AlignCenter className="h-4 w-4" />}
            title="居中对齐"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            active={editor.isActive({ textAlign: 'right' })}
            icon={<AlignRight className="h-4 w-4" />}
            title="右对齐"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            active={editor.isActive({ textAlign: 'justify' })}
            icon={<AlignJustify className="h-4 w-4" />}
            title="两端对齐"
          />
          <div className="mx-1 h-4 w-px bg-line" />

          {/* Media */}
          <ToolbarButton
            onClick={toggleLink}
            active={editor.isActive('link')}
            icon={<LinkIcon className="h-4 w-4" />}
            title="插入链接"
          />
          <ToolbarButton
            onClick={insertImage}
            icon={<ImagePlus className="h-4 w-4" />}
            title="插入图片"
          />
          <ToolbarButton
            onClick={insertYoutube}
            icon={<Video className="h-4 w-4" />}
            title="插入 YouTube 视频"
          />
          <div className="mx-1 h-4 w-px bg-line" />

          {/* Table */}
          <div className="relative">
            <ToolbarButton
              onClick={() => setShowTableMenu(!showTableMenu)}
              active={editor.isActive('table')}
              icon={<TableIcon className="h-4 w-4" />}
              title="表格"
            />
            {showTableMenu && (
              <div className="absolute top-full left-0 mt-1 z-50 rounded-lg border border-line bg-surface shadow-pop p-2 w-40">
                <button
                  onClick={() => {
                    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                    setShowTableMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-surface-muted"
                >
                  <TableIcon className="h-3.5 w-3.5" />
                  插入 3x3 表格
                </button>
                <button
                  onClick={() => {
                    editor.chain().focus().addColumnBefore().run();
                    setShowTableMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-surface-muted"
                >
                  在当前列前插入
                </button>
                <button
                  onClick={() => {
                    editor.chain().focus().addColumnAfter().run();
                    setShowTableMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-surface-muted"
                >
                  在当前列后插入
                </button>
                <button
                  onClick={() => {
                    editor.chain().focus().deleteColumn().run();
                    setShowTableMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-surface-muted"
                >
                  删除当前列
                </button>
                <button
                  onClick={() => {
                    editor.chain().focus().addRowBefore().run();
                    setShowTableMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-surface-muted"
                >
                  在当前行前插入
                </button>
                <button
                  onClick={() => {
                    editor.chain().focus().addRowAfter().run();
                    setShowTableMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-surface-muted"
                >
                  在当前行后插入
                </button>
                <button
                  onClick={() => {
                    editor.chain().focus().deleteRow().run();
                    setShowTableMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-surface-muted"
                >
                  删除当前行
                </button>
                <div className="my-1 h-px bg-line" />
                <button
                  onClick={() => {
                    editor.chain().focus().deleteTable().run();
                    setShowTableMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除表格
                </button>
              </div>
            )}
          </div>
          <div className="flex-1" />

          {/* Undo / Redo */}
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            icon={<Undo className="h-4 w-4" />}
            title="撤销"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            icon={<Redo className="h-4 w-4" />}
            title="重做"
          />
          <div className="mx-1 h-4 w-px bg-line" />

          {/* Character count */}
          <span className="text-xs text-subtle whitespace-nowrap">
            {charCount} 字 / {wordCount} 词
          </span>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-auto">
          <EditorContent
            editor={editor}
            className="prose prose-zinc max-w-none p-8 focus:outline-none [&_.ProseMirror]:min-h-[50vh] [&_.ProseMirror]:outline-none [&_.ProseMirror-focused]:outline-none [&_.ProseMirror_p]:my-2 [&_.ProseMirror_h1]:my-3 [&_.ProseMirror_h2]:my-3 [&_.ProseMirror_h3]:my-2 [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-zinc-200 [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ol]:my-2 [&_.ProseMirror_img]:rounded-lg [&_.ProseMirror_img]:my-4 [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-zinc-300 [&_.ProseMirror_th]:bg-zinc-100 [&_.ProseMirror_th]:px-3 [&_.ProseMirror_th]:py-2 [&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-zinc-300 [&_.ProseMirror_td]:px-3 [&_.ProseMirror_td]:py-2 [&_.ProseMirror_youtubeWrapper]:my-4"
          />
        </div>
        <MediaPicker
          open={showMediaPicker}
          onClose={() => setShowMediaPicker(false)}
          onPick={(asset) => {
            editor
              .chain()
              .focus()
              .setImage({
                src: asset.url,
                alt: asset.altText || asset.fileName,
                title: asset.title ?? undefined,
              })
              .run();
          }}
        />
      </div>
    );
  }
);

export default RichTextEditor;
