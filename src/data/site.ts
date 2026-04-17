export const defaultTerminalUser = "Frisk";
export const sudoTerminalUser = "Sans";
export const sudoPromptUser = "💀Sans";
export const githubUrl = "https://github.com/gyhbwjhnb/8028";

export const availableCommands = [
  "help",
  "whoami",
  "github",
  "sudo",
] as const;

export type CommandName = (typeof availableCommands)[number];

export type DirectoryKey = "~";
