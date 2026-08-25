'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Filter,
  BookOpen,
  DollarSign,
  FileText,
  Image,
  Send,
  Bell,
  Save,
} from 'lucide-react';
import type { StepTraceEntry } from '@/lib/auto-publish-api';

const STEP_KEY: Record<string, string> = {
  billing_check: 'billingCheck',
  'topic-collection': 'topicCollection',
  research: 'research',
  'article-generation': 'articleGeneration',
  'article-save': 'articleSave',
  'image-generation': 'imageGeneration',
  publish: 'publish',
  notification: 'notification',
};

const STEP_ICONS: Record<string, typeof CheckCircle> = {
  billing_check: DollarSign,
  'topic-collection': Filter,
  research: BookOpen,
  'article-generation': FileText,
  'article-save': Save,
  'image-generation': Image,
  publish: Send,
  notification: Bell,
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'success') return <CheckCircle className="h-4 w-4 text-emerald-500" />;
  if (status === 'failed') return <XCircle className="h-4 w-4 text-red-500" />;
  return <Clock className="h-4 w-4 text-subtle" />;
}

function statusColor(status: string): string {
  if (status === 'success') return 'bg-emerald-400';
  if (status === 'failed') return 'bg-red-400';
  return 'bg-line-strong';
}

// ── Special Renderers ──

function TopicDecisionPanel({ metadata }: { metadata: Record<string, unknown> }) {
  const t = useTranslations('components');
  const sources = metadata.sources as {
    fixedKeywords?: { count: number; items: string[] };
    trendingTopics?: { count: number; items: string[] };
  } | undefined;

  const fk = sources?.fixedKeywords;
  const tt = sources?.trendingTopics;

  return (
    <div className="space-y-3">
      {/* Source breakdown */}
      {sources && (
        <div>
          <h4 className="text-xs font-medium text-muted mb-1">{t('trace.dataSources')}</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded bg-blue-50 p-2">
              <span className="font-medium text-blue-700">{t('trace.fixedKeywords')}</span>
              <span className="ml-1 text-blue-600">{t('trace.itemCount', { count: fk?.count || 0 })}</span>
              {fk?.items && fk.items.length > 0 && (
                <div className="mt-1 text-blue-500 truncate" title={fk.items.join(', ')}>
                  {fk.items.join(', ')}
                </div>
              )}
            </div>
            <div className="rounded bg-purple-50 p-2">
              <span className="font-medium text-purple-700">{t('trace.trendingTopics')}</span>
              <span className="ml-1 text-purple-600">{t('trace.itemCount', { count: tt?.count || 0 })}</span>
              {tt?.items && tt.items.length > 0 && (
                <div className="mt-1 text-purple-500 truncate" title={tt.items.join(', ')}>
                  {tt.items.join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter funnel */}
      <div>
        <h4 className="text-xs font-medium text-muted mb-1">{t('trace.filterFunnel')}</h4>
        <div className="flex items-center gap-1 text-xs">
          <span className="rounded bg-surface-muted px-2 py-0.5">
            {t('trace.funnelRaw', { count: String(metadata.rawCandidateCount || 0) })}
          </span>
          <span className="text-subtle">→</span>
          <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">
            {t('trace.funnelFiltered', { count: String(metadata.afterFilterCount || 0) })}
          </span>
          <span className="text-subtle">→</span>
          <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">
            {t('trace.funnelDeduped', { count: String(metadata.afterDedupCount || 0) })}
          </span>
          <span className="text-subtle">→</span>
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700 font-medium">
            {t('trace.funnelSelected')}
          </span>
        </div>
      </div>
    </div>
  );
}

function ResearchDataPanel({ metadata }: { metadata: Record<string, unknown> }) {
  const t = useTranslations('components');
  const kit = metadata.researchKit as { timelineCount?: number; peopleCount?: number; dataCount?: number; opinionsCount?: number } | undefined;
  const fullKit = metadata.fullResearchKit as Record<string, unknown> | undefined;
  const [showFull, setShowFull] = useState(false);

  return (
    <div className="space-y-3">
      {kit && (
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="rounded bg-blue-50 p-2 text-center">
            <div className="font-semibold text-blue-700">{kit.timelineCount || 0}</div>
            <div className="text-blue-500">{t('trace.timeline')}</div>
          </div>
          <div className="rounded bg-green-50 p-2 text-center">
            <div className="font-semibold text-green-700">{kit.peopleCount || 0}</div>
            <div className="text-green-500">{t('trace.people')}</div>
          </div>
          <div className="rounded bg-orange-50 p-2 text-center">
            <div className="font-semibold text-orange-700">{kit.dataCount || 0}</div>
            <div className="text-orange-500">{t('trace.dataPoints')}</div>
          </div>
          <div className="rounded bg-purple-50 p-2 text-center">
            <div className="font-semibold text-purple-700">{kit.opinionsCount || 0}</div>
            <div className="text-purple-500">{t('trace.opinions')}</div>
          </div>
        </div>
      )}

      {fullKit && (
        <button
          onClick={() => setShowFull(!showFull)}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          {showFull ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {showFull ? t('trace.hideFullResearch') : t('trace.showFullResearch')}
        </button>
      )}

      {showFull && fullKit && (
        <pre className="text-xs bg-canvas rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap">
          {JSON.stringify(fullKit, null, 2)}
        </pre>
      )}
    </div>
  );
}

function BillingPanel({ metadata }: { metadata: Record<string, unknown> }) {
  const t = useTranslations('components');
  if (!metadata.balanceCheckEnabled) {
    return <div className="text-xs text-muted">{t('trace.billingDisabled')}</div>;
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="flex justify-between">
        <span className="text-muted">{t('trace.currentBalance')}</span>
        <span className="font-medium">¥{Number(metadata.currentBalance || 0).toFixed(4)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">{t('trace.estimatedCost')}</span>
        <span className="font-medium text-amber-600">¥{Number(metadata.estimatedCost || 0).toFixed(4)}</span>
      </div>
    </div>
  );
}

// ── Metadata Renderer ──

function MetadataRenderer({ step, metadata }: { step: string; metadata: Record<string, unknown> }) {
  if (step === 'topic-collection') return <TopicDecisionPanel metadata={metadata} />;
  if (step === 'research') return <ResearchDataPanel metadata={metadata} />;
  if (step === 'billing_check') return <BillingPanel metadata={metadata} />;

  // Generic JSON display for other steps
  return (
    <pre className="text-xs bg-canvas rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap">
      {JSON.stringify(metadata, null, 2)}
    </pre>
  );
}

// ── Step Card ──

function StepCard({
  entry,
  expanded,
  onToggle,
}: {
  entry: StepTraceEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('components');
  const Icon = STEP_ICONS[entry.step] || Clock;
  const label = t(`trace.steps.${STEP_KEY[entry.step] ?? entry.step}`);
  const hasDetails = (entry.decisions?.length ?? 0) > 0 || (entry.metadata ? Object.keys(entry.metadata).length > 0 : false);

  return (
    <div className={`rounded-lg border ${entry.status === 'failed' ? 'border-red-200 bg-red-50/50' : 'border-line bg-surface'}`}>
      <button
        onClick={onToggle}
        disabled={!hasDetails && !entry.error}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left disabled:cursor-default"
      >
        <StatusIcon status={entry.status} />
        <Icon className="h-3.5 w-3.5 text-subtle" />
        <span className="text-sm font-medium text-foreground flex-1">{label}</span>
        <span className="text-xs text-subtle tabular-nums">{formatDuration(entry.durationMs)}</span>
        {hasDetails && (
          expanded
            ? <ChevronDown className="h-4 w-4 text-subtle" />
            : <ChevronRight className="h-4 w-4 text-subtle" />
        )}
      </button>

      {expanded && (hasDetails || entry.error) && (
        <div className="border-t border-line px-4 py-3 space-y-3">
          {/* Decisions */}
          {entry.decisions && entry.decisions.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted mb-1">{t('trace.decisionLog')}</h4>
              <ul className="space-y-1">
                {entry.decisions.map((d, i) => (
                  <li key={i} className="text-xs text-foreground flex gap-2">
                    <span className="text-subtle shrink-0">•</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Metadata */}
          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted mb-1">{t('trace.metadata')}</h4>
              <MetadataRenderer step={entry.step} metadata={entry.metadata} />
            </div>
          )}

          {/* Error */}
          {entry.error && (
            <div>
              <h4 className="text-xs font-medium text-red-500 mb-1">{t('trace.errorInfo')}</h4>
              <div className="text-xs text-red-600 bg-red-50 rounded p-2">
                <p className="font-medium">{entry.error.message}</p>
                {entry.error.stack && (
                  <pre className="mt-1 text-[10px] text-red-400 whitespace-pre-wrap overflow-auto max-h-32">
                    {entry.error.stack}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

export default function ExecutionTraceViewer({
  trace,
  totalDurationMs,
}: {
  trace: StepTraceEntry[];
  totalDurationMs: number;
}) {
  const t = useTranslations('components');
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  if (!trace || trace.length === 0) {
    return (
      <div className="text-sm text-muted text-center py-4">
        {t('trace.empty')}
      </div>
    );
  }

  const total = totalDurationMs || trace.reduce((sum, e) => sum + e.durationMs, 0);

  return (
    <div className="space-y-3">
      {/* Timeline bar */}
      <div className="flex h-5 rounded-lg overflow-hidden" title={t('trace.totalDuration', { duration: formatDuration(total) })}>
        {trace.map((entry) => {
          const pct = total > 0 ? Math.max((entry.durationMs / total) * 100, 1) : 0;
          return (
            <div
              key={entry.step}
              style={{ width: `${pct}%` }}
              className={`${statusColor(entry.status)} transition-all`}
              title={`${t(`trace.steps.${STEP_KEY[entry.step] ?? entry.step}`)}: ${formatDuration(entry.durationMs)}`}
            />
          );
        })}
      </div>

      {/* Total duration */}
      <div className="text-xs text-muted text-right">
        {t('trace.totalDuration', { duration: formatDuration(total) })}
      </div>

      {/* Step cards */}
      <div className="space-y-1.5">
        {trace.map((entry) => (
          <StepCard
            key={entry.step}
            entry={entry}
            expanded={expandedStep === entry.step}
            onToggle={() =>
              setExpandedStep(expandedStep === entry.step ? null : entry.step)
            }
          />
        ))}
      </div>
    </div>
  );
}
