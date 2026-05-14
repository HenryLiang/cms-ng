'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth-store';
import { getStories, type Story } from '@/lib/story-api';
import { Plus, Clock, FileText, CheckCircle, Send, RefreshCw, Loader2 } from 'lucide-react';

const COLUMNS = [
  { key: 'DRAFT', label: '选题中', color: 'bg-zinc-100', borderColor: 'border-zinc-200', icon: Clock },
  { key: 'WRITING', label: '采写中', color: 'bg-blue-50', borderColor: 'border-blue-200', icon: FileText },
  { key: 'PENDING_REVIEW', label: '审核中', color: 'bg-amber-50', borderColor: 'border-amber-200', icon: Send },
  { key: 'PUBLISHED', label: '已发布', color: 'bg-emerald-50', borderColor: 'border-emerald-200', icon: CheckCircle },
] as const;

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStories();
  }, []);

  async function loadStories() {
    try {
      const data = await getStories();
      setStories(data);
    } finally {
      setLoading(false);
    }
  }

  async function moveStory(storyId: string, newStatus: string) {
    const { updateStory } = await import('@/lib/story-api');
    await updateStory(storyId, { status: newStatus as any });
    await loadStories();
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="h-full p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">欢迎回来，{user?.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">这是你的工作台，管理你的选题和稿件</p>
        </div>
        <Link
          href="/dashboard/stories/new"
          className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          <Plus className="h-4 w-4" />
          新建选题
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {COLUMNS.map((col) => {
          const colStories = stories.filter((s) => s.status === col.key);
          const Icon = col.icon;
          return (
            <div key={col.key} className="flex flex-col">
              <div className={`mb-3 flex items-center gap-2 rounded-lg border ${col.borderColor} ${col.color} px-3 py-2`}>
                <Icon className="h-4 w-4 text-zinc-600" />
                <span className="text-sm font-medium">{col.label}</span>
                <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-medium text-zinc-600">
                  {colStories.length}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {colStories.map((story) => (
                  <StoryCard key={story.id} story={story} onMove={moveStory} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StoryCard({ story, onMove }: { story: Story; onMove: (id: string, status: string) => void }) {
  const [showActions, setShowActions] = useState(false);

  const nextStatuses = COLUMNS.filter((c) => c.key !== story.status).map((c) => ({
    key: c.key,
    label: c.label,
  }));

  return (
    <div
      className="group relative rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <Link href={`/dashboard/stories/${story.id}`}>
        <h3 className="text-sm font-medium text-zinc-900 line-clamp-2">{story.title}</h3>
      </Link>
      {story.description && (
        <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{story.description}</p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {story.priority > 0 && (
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600">
              P{story.priority}
            </span>
          )}
          {story._count && story._count.articles > 0 && (
            <span className="flex items-center gap-1 text-xs text-zinc-400">
              <FileText className="h-3 w-3" />
              {story._count.articles}
            </span>
          )}
        </div>
        <span className="text-xs text-zinc-400">
          {new Date(story.updatedAt).toLocaleDateString('zh-CN')}
        </span>
      </div>

      {showActions && (
        <div className="absolute -right-2 -top-2 flex gap-1">
          {nextStatuses.map((s) => (
            <button
              key={s.key}
              onClick={(e) => {
                e.stopPropagation();
                onMove(story.id, s.key);
              }}
              className="rounded-full bg-zinc-900 p-1.5 text-white shadow-lg hover:bg-zinc-700"
              title={`移至${s.label}`}
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
