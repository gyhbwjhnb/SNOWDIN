import { create } from "zustand";
import {
  availableCommands,
  defaultTerminalUser,
  githubUrl,
  isSudoIdentity,
  sudoTerminalUser,
  type DirectoryKey,
} from "../data/site";

type HistoryEntry = {
  id: number;
  cwd: DirectoryKey;
  input: string;
  output: string[];
  user: string;
};

type CommandResult = {
  cwd?: DirectoryKey;
  nextUser?: string;
  openUrl?: string;
  output: string[];
};

type TerminalState = {
  controlMode: boolean;
  cwd: DirectoryKey;
  history: HistoryEntry[];
  prompt: string;
  user: string;
  exitControlMode: () => void;
  setPrompt: (value: string) => void;
  runCommand: (rawInput: string) => string | null;
};

export type PromptValidity = "neutral" | "valid" | "invalid";

const sansWhoamiPool = [
  { name: "Flowey", weight: 1 },
  { name: "Toriel", weight: 1 },
  { name: "Papyrus", weight: 1 },
  { name: "Asriel", weight: 1 },
  { name: "Asgore", weight: 1 },
  { name: "Undyne", weight: 1 },
  { name: "Alphys", weight: 1 },
  { name: "Sans", weight: 93 },
] as const;

const specialSansReveal = "__TYPE__:Hahaha, you found out I am Sans.";

const initialTerminalOutput = [
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
] as const;

const pickSansWhoami = () => {
  const totalWeight = sansWhoamiPool.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const item of sansWhoamiPool) {
    roll -= item.weight;
    if (roll < 0) {
      return item.name;
    }
  }

  return "Flowey";
};

export const getPromptValidity = (
  rawInput: string,
  _currentDirectory: DirectoryKey,
  currentUser: string,
): PromptValidity => {
  if (!rawInput) {
    return "neutral";
  }

  const trimmed = rawInput.trim();

  if (!trimmed) {
    return "neutral";
  }

  if (trimmed.includes(" ")) {
    return "invalid";
  }

  const validCommands = isSudoIdentity(currentUser)
    ? [...availableCommands, "exit"]
    : [...availableCommands.filter((command) => command !== "control"), "exit"];

  return validCommands.includes(trimmed) ? "valid" : "invalid";
};

const executeCommand = (
  rawInput: string,
  currentDirectory: DirectoryKey,
  currentUser: string,
): CommandResult => {
  const trimmed = rawInput.trim();

  if (!trimmed) {
    return {
      cwd: currentDirectory,
      nextUser: currentUser,
      output: [],
    };
  }

  const normalizedCommand = trimmed.toLowerCase();

  switch (normalizedCommand) {
    case "help":
      return {
        cwd: currentDirectory,
        nextUser: currentUser,
        output: [
          "help\tShow this message",
          "whoami\tPrint current user",
          "github\tOpen project GitHub page",
          ...(isSudoIdentity(currentUser)
            ? ["control\tControl the sprite with WASD, Shift and Esc"]
            : []),
        ],
      };
    case "whoami":
      if (isSudoIdentity(currentUser)) {
        const selectedName = pickSansWhoami();

        return {
          cwd: currentDirectory,
          nextUser: currentUser,
          output: selectedName === "Sans" ? [specialSansReveal] : [selectedName],
        };
      }

      return {
        cwd: currentDirectory,
        nextUser: currentUser,
        output: [currentUser],
      };
    case "github":
      return {
        cwd: currentDirectory,
        nextUser: currentUser,
        openUrl: githubUrl,
        output: [`Opening ${githubUrl}`],
      };
    case "sudo":
      return {
        cwd: currentDirectory,
        nextUser: sudoTerminalUser,
        output: [`Switched User To ${sudoTerminalUser}`],
      };
    case "control":
      if (!isSudoIdentity(currentUser)) {
        return {
          cwd: currentDirectory,
          nextUser: currentUser,
          output: [
            `${normalizedCommand}: Command not found`,
            'Type "help" to view available commands.',
          ],
        };
      }

      return {
        cwd: currentDirectory,
        nextUser: currentUser,
        output: [
          "Control mode enabled.",
          "Use WASD to move, hold Shift to accelerate, press Esc to exit control mode.",
        ],
      };
    case "exit":
      if (isSudoIdentity(currentUser)) {
        return {
          cwd: currentDirectory,
          nextUser: defaultTerminalUser,
          output: [`Switched User To ${defaultTerminalUser}`],
        };
      }

      return {
        cwd: currentDirectory,
        nextUser: currentUser,
        output: [
          `${normalizedCommand}: Command not found`,
          'Type "help" to view available commands.',
        ],
      };
    default:
      return {
        cwd: currentDirectory,
        nextUser: currentUser,
        output: [
          `${normalizedCommand}: Command not found`,
          'Type "help" to view available commands.',
        ],
      };
  }
};

export const useTerminalStore = create<TerminalState>((set, get) => ({
  controlMode: false,
  cwd: "~",
  history: [
    {
      id: 0,
      cwd: "~",
      input: "",
      user: defaultTerminalUser,
      output: [...initialTerminalOutput],
    },
  ],
  prompt: "",
  user: defaultTerminalUser,
  exitControlMode: () => set({ controlMode: false }),
  setPrompt: (value) => set({ prompt: value }),
  runCommand: (rawInput) => {
    const state = get();
    const result = executeCommand(rawInput, state.cwd, state.user);
    const normalizedInput = rawInput.trim().toLowerCase();

    if (!rawInput.trim()) {
      set({ prompt: "" });
      return result.openUrl ?? null;
    }

    set({
      controlMode:
        normalizedInput === "control" && isSudoIdentity(state.user)
          ? true
          : result.nextUser === defaultTerminalUser
            ? false
            : state.controlMode,
      cwd: result.cwd ?? state.cwd,
      prompt: "",
      user: result.nextUser ?? state.user,
      history: [
        ...state.history,
        {
          id: state.history.length + 1,
          cwd: state.cwd,
          input: rawInput,
          output: result.output,
          user: state.user,
        },
      ],
    });

    return result.openUrl ?? null;
  },
}));
