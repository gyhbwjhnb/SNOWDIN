import { FormEvent } from "react";
import { motion } from "motion/react";
import { commandList } from "../data/site";
import { useTerminalStore } from "../store/terminal";

export function Terminal() {
  const history = useTerminalStore((state) => state.history);
  const prompt = useTerminalStore((state) => state.prompt);
  const setPrompt = useTerminalStore((state) => state.setPrompt);
  const runCommand = useTerminalStore((state) => state.runCommand);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runCommand(prompt);
  };

  return (
    <>
      <section className="rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-4 shadow-[0_20px_60px_rgba(8,145,178,0.12)] backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-2">
            <span className="h-3 w-3 rounded-full bg-rose-400" />
            <span className="h-3 w-3 rounded-full bg-amber-300" />
            <span className="h-3 w-3 rounded-full bg-emerald-400" />
          </div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Session
          </p>
        </div>

        <div className="space-y-4 font-mono text-sm text-slate-200">
          {history.map((entry) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-cyan-300">$ {entry.input}</p>
              {entry.output.map((line) => (
                <p key={`${entry.id}-${line}`} className="mt-1 text-slate-300">
                  {line}
                </p>
              ))}
            </motion.div>
          ))}
        </div>

        <form className="mt-6" onSubmit={handleSubmit}>
          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="font-mono text-cyan-300">$</span>
            <input
              autoFocus
              className="w-full bg-transparent font-mono text-sm text-white outline-none placeholder:text-slate-500"
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="输入命令，例如 help"
              value={prompt}
            />
          </label>
        </form>
      </section>

      <aside className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/80">
          Boot Checklist
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-white">开发环境已就位</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          当前已经补齐了 Vite + React + TypeScript + Router + Zustand +
          Tailwind 的基础工程。下一步直接安装依赖并启动即可。
        </p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
            Commands
          </p>
          <ul className="mt-3 space-y-2 font-mono text-sm text-slate-200">
            {commandList.map((command) => (
              <li key={command}>{command}</li>
            ))}
          </ul>
        </div>
      </aside>
    </>
  );
}
