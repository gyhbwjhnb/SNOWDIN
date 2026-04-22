export const defaultTerminalUser = "Frisk";
export const sudoTerminalUser = "Sans";
export const sudoPromptUser = "💀Sans";
export const githubUrl = "https://github.com/gyhbwjhnb/8028";

export const availableCommands = [
  "help",
  "whoami",
  "github",
  "sudo",
  "control",
] as const;

export type CommandName = (typeof availableCommands)[number];

export type DirectoryKey = "~";

export const isSudoIdentity = (user: string) =>
  user === sudoTerminalUser || user === sudoPromptUser || user.endsWith(sudoTerminalUser);
