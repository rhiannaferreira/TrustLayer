import { AlertOctagon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '@/services/api';

export function errorMessage(err: unknown): { title: string; detail: string } {
  if (err instanceof ApiError) {
    return {
      title: err.status ? `Backend returned ${err.status}` : 'Backend request failed',
      detail: `${err.message} (${err.endpoint})`,
    };
  }
  if (err instanceof Error) return { title: 'Something went wrong', detail: err.message };
  return { title: 'Something went wrong', detail: String(err) };
}

export function ErrorBanner({ error, action }: { error: unknown; action?: ReactNode }) {
  const { title, detail } = errorMessage(error);
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/[0.07] p-3">
      <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-0.5 break-words text-xs text-muted">{detail}</p>
        <p className="mt-1 text-2xs text-faint">No mock result was substituted.</p>
      </div>
      {action}
    </div>
  );
}
