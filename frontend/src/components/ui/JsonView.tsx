import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/cn';

export function JsonView({ value, className, maxHeight = 'max-h-[60vh]' }: { value: unknown; className?: string; maxHeight?: string }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(value, null, 2);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className={cn('relative', className)}>
      <button onClick={copy} className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-2xs text-muted hover:text-ink" aria-label="Copy JSON">
        {copied ? <Check className="h-3 w-3 text-safe" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className={cn('overflow-auto rounded-lg border border-line bg-canvas p-3 pr-20 font-mono text-[11.5px] leading-relaxed text-muted', maxHeight)}>{text}</pre>
    </div>
  );
}
