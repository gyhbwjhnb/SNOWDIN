import { create } from "zustand";
import { commandList, sections, type CommandName } from "../data/site";

type HistoryEntry = {
  id: number;
  input: string;
  output: string[];
};

type Theme = "system" | "matrix";

type TerminalState = {
  history: HistoryEntry[];
  prompt: string;
  theme: Theme;
  setPrompt: (value: string) => void;
  runCommand: (rawInput: string) => void;
};

const commandOutput = (input: string, theme: Theme): string[] => {
  const normalized = input.trim().toLowerCase() as CommandName;

  if (!normalized) {
    return [];
  }

  switch (normalized) {
    case "help":
      return [
        "可用命令：",
        ...commandList.map((command) => `- ${command}`),
      ];
    case "about":
    case "projects":
    case "skills":
    case "contact":
    case "resume":
      return sections[normalized];
    case "theme":
      return [`当前主题：${theme}`];
    case "clear":
      return ["__CLEAR__"];
    default:
      return [`未知命令: ${input}`, "输入 help 查看可用命令。"];
  }
};

export const useTerminalStore = create<TerminalState>((set, get) => ({
  history: [
    {
      id: 0,
      input: "system",
      output: [
        "欢迎来到 8028。",
        "输入 help 查看命令，后续可以把内容数据替换成你的真实信息。"
      ],
    },
  ],
  prompt: "",
  theme: "system",
  setPrompt: (value) => set({ prompt: value }),
  runCommand: (rawInput) => {
    const output = commandOutput(rawInput, get().theme);

    if (output.length === 1 && output[0] === "__CLEAR__") {
      set({ history: [], prompt: "" });
      return;
    }

    set((state) => ({
      prompt: "",
      history: [
        ...state.history,
        {
          id: state.history.length + 1,
          input: rawInput,
          output,
        },
      ],
    }));
  },
}));
