import { create } from "zustand";
import {
  availableCommands,
  directoryChildren,
  directoryDescriptions,
  fileContents,
  githubUrl,
  terminalUser,
  type FileKey,
  type DirectoryKey,
} from "../data/site";

type HistoryEntry = {
  id: number;
  cwd: DirectoryKey;
  input: string;
  output: string[];
};

type CommandResult = {
  clearHistory?: boolean;
  cwd?: DirectoryKey;
  openUrl?: string;
  output: string[];
};

type TerminalState = {
  cwd: DirectoryKey;
  history: HistoryEntry[];
  prompt: string;
  setPrompt: (value: string) => void;
  runCommand: (rawInput: string) => string | null;
};

export type PromptValidity = "neutral" | "valid" | "invalid";

const resolveDirectory = (
  currentDirectory: DirectoryKey,
  target?: string,
): DirectoryKey | null => {
  if (!target || target === "~") {
    return "~";
  }

  if (target === ".") {
    return currentDirectory;
  }

  if (target === "..") {
    return "~";
  }

  if (target.startsWith("~/")) {
    return target in directoryChildren ? (target as DirectoryKey) : null;
  }

  const normalized = target.replace(/\/+$/, "");
  const candidate =
    currentDirectory === "~"
      ? (`~/${normalized}` as DirectoryKey)
      : (`${currentDirectory}/${normalized}` as DirectoryKey);

  return candidate in directoryChildren ? candidate : null;
};

const resolveFile = (
  currentDirectory: DirectoryKey,
  target?: string,
): FileKey | null => {
  if (!target) {
    return null;
  }

  const normalized = target.replace(/\/+$/, "");

  if (normalized.startsWith("~/")) {
    return normalized in fileContents ? (normalized as FileKey) : null;
  }

  const candidate =
    currentDirectory === "~"
      ? (`~/${normalized}` as FileKey)
      : (`${currentDirectory}/${normalized}` as FileKey);

  return candidate in fileContents ? candidate : null;
};

const directoryCandidates = (currentDirectory: DirectoryKey): string[] => {
  const childDirectories = directoryChildren[currentDirectory]
    .filter((item) => item.endsWith("/"))
    .map((item) => item.replace(/\/$/, ""));

  const absoluteDirectories = (Object.keys(directoryChildren) as DirectoryKey[])
    .filter((key) => key !== "~")
    .map((key) => key.replace(/^~\//, ""));

  return [
    "~",
    ".",
    "..",
    ...childDirectories,
    ...(currentDirectory === "~" ? [] : [currentDirectory.replace(/^~\//, "")]),
    ...(Object.keys(directoryChildren) as DirectoryKey[]),
    ...absoluteDirectories,
  ];
};

const fileCandidates = (currentDirectory: DirectoryKey): string[] => {
  const absoluteFiles = Object.keys(fileContents) as FileKey[];
  const relativeFiles = absoluteFiles
    .filter((file) => file.startsWith(`${currentDirectory}/`))
    .map((file) => file.slice(currentDirectory.length + 1));

  return [...relativeFiles, ...absoluteFiles];
};

export const getPromptValidity = (
  rawInput: string,
  currentDirectory: DirectoryKey,
): PromptValidity => {
  if (!rawInput) {
    return "neutral";
  }

  const hasTrailingSpace = /\s$/.test(rawInput);
  const trimmedStart = rawInput.trimStart();

  if (!trimmedStart) {
    return "neutral";
  }

  const parts = trimmedStart.split(/\s+/);
  const commandPart = parts[0].toLowerCase();
  const hasCommandSpace = trimmedStart.includes(" ") || hasTrailingSpace;

  if (!hasCommandSpace) {
    return availableCommands.includes(
      commandPart as (typeof availableCommands)[number],
    )
      ? "valid"
      : "invalid";
  }

  if (
    !availableCommands.includes(
      commandPart as (typeof availableCommands)[number],
    )
  ) {
    return "invalid";
  }

  const argumentPart = trimmedStart.slice(parts[0].length).trimStart();

  switch (commandPart) {
    case "help":
    case "whoami":
    case "ls":
    case "github":
      return argumentPart ? "invalid" : "valid";
    case "cd":
      if (!argumentPart) {
        return rawInput.endsWith(" ") ? "invalid" : "valid";
      }

      return directoryCandidates(currentDirectory).some(
        (candidate) => candidate === argumentPart,
      )
        ? "valid"
        : "invalid";
    case "cat":
      if (!argumentPart) {
        return rawInput.endsWith(" ") ? "invalid" : "valid";
      }

      return fileCandidates(currentDirectory).some(
        (candidate) => candidate === argumentPart,
      )
        ? "valid"
        : "invalid";
    default:
      return "invalid";
  }
};

const executeCommand = (
  rawInput: string,
  currentDirectory: DirectoryKey,
): CommandResult => {
  const trimmed = rawInput.trim();

  if (!trimmed) {
    return {
      cwd: currentDirectory,
      output: [],
    };
  }

  const [command, ...args] = trimmed.split(/\s+/);
  const normalizedCommand = command.toLowerCase();

  switch (normalizedCommand) {
    case "help":
      return {
        cwd: currentDirectory,
        output: [
          "help\tShow this message",
          "whoami\tPrint current user",
          "ls\tList directory contents",
          "cd\tChange directory",
          "cat\tRead file contents",
          "github\tOpen project GitHub page",
        ],
      };
    case "whoami":
      return {
        cwd: currentDirectory,
        output: [terminalUser],
      };
    case "ls":
      return {
        cwd: currentDirectory,
        output: [directoryChildren[currentDirectory].join("  ")],
      };
    case "cd": {
      const nextDirectory = resolveDirectory(currentDirectory, args[0]);

      if (!nextDirectory) {
        const target = args[0] ?? "";

        return {
          cwd: currentDirectory,
          output: [`cd: No such file or directory: ${target}`],
        };
      }

      return {
        cwd: nextDirectory,
        output: [`Moved to ${directoryDescriptions[nextDirectory]}`],
      };
    }
    case "cat": {
      if (!args[0]) {
        return {
          cwd: currentDirectory,
          output: ["cat: Missing file operand"],
        };
      }

      const file = resolveFile(currentDirectory, args[0]);

      if (!file) {
        return {
          cwd: currentDirectory,
          output: [`cat: ${args[0]}: No such file or directory`],
        };
      }

      return {
        cwd: currentDirectory,
        output: [...fileContents[file]],
      };
    }
    case "github":
      return {
        cwd: currentDirectory,
        openUrl: githubUrl,
        output: [`Opening ${githubUrl}`],
      };
    default:
      return {
        cwd: currentDirectory,
        output: [
          `${normalizedCommand}: Command not found`,
          'Type "help" to view available commands.',
        ],
      };
  }
};

export const useTerminalStore = create<TerminalState>((set, get) => ({
  cwd: "~",
  history: [
    {
      id: 0,
      cwd: "~",
      input: "",
      output: [
        "      ┌---------------------------------------------------------┐",
        "     ███████╗███╗   ██╗ ██████╗ ██╗    ██╗██████╗ ██╗███╗   ██╗ │",
        "     ██╔════╝████╗  ██║██╔═══██╗██║    ██║██╔══██╗██║████╗  ██║ │",
        "     ███████╗██╔██╗ ██║██║   ██║██║ █╗ ██║██║  ██║██║██╔██╗ ██║ │",
        "     ╚════██║██║╚██╗██║██║   ██║██║███╗██║██║  ██║██║██║╚██╗██║ │",
        "     ███████║██║ ╚████║╚██████╔╝╚███╔███╔╝██████╔╝██║██║ ╚████║ │",
        "     ╚══════╝╚═╝  ╚═══╝ ╚═════╝  ╚══╝╚══╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝ │",
        "      │                                                         │",
        "      │                              Welcome to Snowdin         │",
        "      │                                                         │",
        "      └---------------------------------------------------------┘",
        "Type 'help' to see the list of available commands.",
      ],
    },
  ],
  prompt: "",
  setPrompt: (value) => set({ prompt: value }),
  runCommand: (rawInput) => {
    const state = get();
    const result = executeCommand(rawInput, state.cwd);

    if (result.clearHistory) {
      set({
        cwd: result.cwd ?? state.cwd,
        history: [],
        prompt: "",
      });

      return result.openUrl ?? null;
    }

    if (!rawInput.trim()) {
      set({ prompt: "" });
      return result.openUrl ?? null;
    }

    set({
      cwd: result.cwd ?? state.cwd,
      prompt: "",
      history: [
        ...state.history,
        {
          id: state.history.length + 1,
          cwd: state.cwd,
          input: rawInput,
          output: result.output,
        },
      ],
    });

    return result.openUrl ?? null;
  },
}));
