import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex w-full flex-col items-center justify-center py-20">
      <Card className="mx-4 w-full max-w-md">
        <CardContent className="pt-6">
          <div className="mb-4 flex gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">
              404 Page Not Found
            </h1>
          </div>
          <p className="mt-4 text-sm text-gray-600">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/" className="border border-[hsl(var(--foreground))] px-4 py-2 text-xs font-bold uppercase transition hover:bg-[hsl(var(--foreground))] hover:text-[hsl(var(--background))]">
              Go Home
            </a>
            <a href="/live-scores" className="border px-4 py-2 text-xs font-bold uppercase transition hover:bg-[hsl(var(--muted))]">
              Live Scores
            </a>
            <a href="/trending" className="border px-4 py-2 text-xs font-bold uppercase transition hover:bg-[hsl(var(--muted))]">
              Trending
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
