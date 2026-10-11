import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

export function NotFoundPage() {
  return (
    <EmptyState
      className="mt-16"
      icon={<Compass className="h-4 w-4" />}
      title="Page not found"
      description="That route does not exist in TrustLayer."
      action={
        <Link to="/" className="text-sm font-medium text-accent-soft hover:underline">
          Back to overview
        </Link>
      }
    />
  );
}
