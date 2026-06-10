import { AuthNav } from "@/components/AuthNav";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">wisely-split</h1>
        <AuthNav />
      </div>
      <p className="mt-2 text-muted">Dashboard coming in Phase 2.</p>
    </main>
  );
}
