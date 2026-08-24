import { MealLogger } from "@/components/meal-logger";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <header className="mb-6">
        <h1 className="font-mono text-lg font-semibold tracking-tight">corpus</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Phase 0 — estimate accuracy spike. Nothing is saved yet.
        </p>
      </header>
      <MealLogger />
    </main>
  );
}
