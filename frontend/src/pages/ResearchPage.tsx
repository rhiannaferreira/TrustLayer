import { useState, type FormEvent } from 'react';
import { Globe, Search, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { useAppStore } from '@/context/AppStore';
import { createHttpClient, type ResearchResult } from '@/services/api';

const EXAMPLES = ['Who wrote the novel Dune?', 'Best practices for securing AI agents that call tools', 'Is it safe to buy a refurbished smartwatch?'];

export function ResearchPage() {
  const { dataSource, settings } = useAppStore();
  const live = dataSource === 'api';
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<ResearchResult | null>(null);

  async function run(q: string) {
    const text = q.trim();
    if (text.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await createHttpClient(settings.apiBaseUrl).research(text));
    } catch (err) {
      setResult(null);
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(query);
  }

  return (
    <div>
      <PageHeader
        eyebrow={<Badge tone="accent">{live ? 'Live backend · web search' : 'Needs Live Backend Mode'}</Badge>}
        title="Web research"
        description="Ask about any topic. The backend searches the web and returns a short answer with its sources. Results are unverified third-party content, so check the links before acting on them."
      />
      {!live ? (
        <EmptyState
          icon={<Globe className="h-4 w-4" />}
          title="Switch to Live Backend Mode"
          description="Web research runs on the backend and is not simulated in Demo Mode."
        />
      ) : (
        <div className="space-y-4">
          <Panel>
            <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
              <input
                className="input flex-1"
                aria-label="Research question"
                placeholder="Ask anything…"
                value={query}
                maxLength={500}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button type="submit" variant="primary" icon={<Search className="h-4 w-4" />} loading={busy} disabled={query.trim().length < 3}>
                Search
              </Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-ink"
                  onClick={() => {
                    setQuery(ex);
                    void run(ex);
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </Panel>
          {error != null && <ErrorBanner error={error} />}
          {result && (
            <>
              {result.answer && (
                <Panel title="Answer" subtitle="Generated from the sources below. Unverified.">
                  <p className="whitespace-pre-wrap text-sm text-ink">{result.answer}</p>
                </Panel>
              )}
              <Panel title={`Sources (${result.sources.length})`} subtitle="Unverified web content">
                {result.sources.length === 0 ? (
                  <p className="text-sm text-muted">No sources were returned for this question.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {result.sources.map((s) => (
                      <li key={s.id} className="py-3 first:pt-0 last:pb-0">
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-soft hover:underline">
                          {s.title}
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                        <p className="mt-0.5 break-all text-2xs text-faint">{s.url}</p>
                        {s.snippet && <p className="mt-1 text-xs text-muted">{s.snippet}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          )}
        </div>
      )}
    </div>
  );
}
