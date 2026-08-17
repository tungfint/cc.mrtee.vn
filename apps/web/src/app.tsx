const capabilities = [
  'Năng lực dài hạn',
  'Điểm thưởng minh bạch',
  'Season công bằng',
  'Đồng bộ an toàn',
];

export function App() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#070b14] px-6 py-10 text-slate-100 sm:px-10 lg:px-16">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(57,189,248,0.14),transparent_28%),radial-gradient(circle_at_85%_75%,rgba(168,85,247,0.12),transparent_30%)]" />
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-between">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-cyan-400 font-black text-slate-950">
              CC
            </span>
            <div>
              <p className="m-0 text-sm font-semibold tracking-wide">MRTEE LAB</p>
              <p className="m-0 text-xs text-slate-500">Codeforces Gamification Tracker</p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            Phase 0
          </span>
        </header>

        <section className="grid items-end gap-12 py-20 lg:grid-cols-[1.25fr_0.75fr]">
          <div>
            <p className="mb-5 text-sm font-bold uppercase tracking-[0.24em] text-cyan-300">
              Practice. Progress. Prove it.
            </p>
            <h1 className="m-0 max-w-4xl text-5xl font-black leading-[0.98] tracking-[-0.05em] sm:text-7xl">
              Tiến bộ thật,
              <span className="block bg-gradient-to-r from-cyan-300 to-violet-400 bg-clip-text text-transparent">
                không chỉ là điểm số.
              </span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
              Theo dõi năng lực Codeforces, duy trì nhịp học và ghi nhận mỗi bước tiến bằng một hệ
              thống có thể kiểm chứng.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {capabilities.map((capability, index) => (
              <div
                className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur"
                key={capability}
              >
                <span className="font-mono text-xs text-cyan-300">0{index + 1}</span>
                <span className="font-semibold text-slate-200">{capability}</span>
              </div>
            ))}
          </div>
        </section>

        <footer className="flex flex-col gap-2 border-t border-white/10 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Modular monolith · PostgreSQL source of truth</span>
          <span>Bootstrap environment ready</span>
        </footer>
      </div>
    </main>
  );
}
