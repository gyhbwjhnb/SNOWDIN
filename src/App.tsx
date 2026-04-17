import { Outlet } from "react-router-dom";

export function App() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1e293b,_#020617_55%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/80">
              Terminal Portfolio
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white">8028</h1>
          </div>
          <p className="hidden text-sm text-slate-400 sm:block">
            React + TypeScript + Vite
          </p>
        </header>

        <main className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
