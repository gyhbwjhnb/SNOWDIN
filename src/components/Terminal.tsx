import { FormEvent, useEffect, useRef } from "react";
import { terminalUser } from "../data/site";
import { getPromptValidity, useTerminalStore } from "../store/terminal";

function PromptLabel({ cwd }: { cwd: string }) {
  return (
    <>
      <span className="text-violet-400">{terminalUser}</span>
      <span className="text-amber-400">:</span>
      <span className="text-amber-400">{cwd}</span>
      <span className="text-amber-400">$</span>
    </>
  );
}

export function Terminal() {
  const history = useTerminalStore((state) => state.history);
  const prompt = useTerminalStore((state) => state.prompt);
  const cwd = useTerminalStore((state) => state.cwd);
  const setPrompt = useTerminalStore((state) => state.setPrompt);
  const runCommand = useTerminalStore((state) => state.runCommand);
  const historyEndRef = useRef<HTMLDivElement | null>(null);
  const promptValidity = getPromptValidity(prompt, cwd);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [history]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = runCommand(prompt);

    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-violet-400 font-mono text-base leading-7 text-amber-50">
      <div className="min-h-0 flex-1 pr-8">
        <div className="terminal-scroll h-full overflow-y-scroll px-5 py-5">
        {history.map((entry) => (
          <div key={entry.id} className="mb-3">
            {entry.input || entry.id === 0 ? (
              <p className="text-lg">
                <PromptLabel cwd={entry.cwd} /> <span className="text-amber-50">{entry.input}</span>
              </p>
            ) : null}
            {entry.output.map((line, index) => (
              <p
                key={`${entry.id}-${index}`}
                className="whitespace-pre text-lg text-amber-50"
              >
                {line.includes("\t") ? (
                  <>
                    <span className="font-bold text-amber-50">
                        {line.split("\t")[0]}
                      </span>
                      <span className="pl-6 font-normal text-amber-100/75">
                        {line.split("\t")[1]}
                      </span>
                    </>
                  ) : (
                    line || <span className="block h-5" />
                  )}
                </p>
              ))}
            </div>
          ))}

          <form onSubmit={handleSubmit}>
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-lg">
                <PromptLabel cwd={cwd} />
              </span>
              <input
                autoFocus
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                spellCheck={false}
                autoComplete="off"
                className={`w-full bg-transparent text-lg outline-none ${
                  promptValidity === "valid"
                    ? "text-green-400"
                    : promptValidity === "invalid"
                      ? "text-red-400"
                      : "text-amber-50"
                }`}
              />
            </label>
          </form>
          <div ref={historyEndRef} />
        </div>
      </div>
    </section>
  );
}
