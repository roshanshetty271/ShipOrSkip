"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <h2 className="font-display text-2xl italic mb-4">Something went wrong</h2>
        <p className="text-sm text-ink-400 mb-6">{error.message || "An unexpected error occurred."}</p>
        <button onClick={reset} className="btn-primary text-sm">Try again</button>
      </div>
    </div>
  );
}
