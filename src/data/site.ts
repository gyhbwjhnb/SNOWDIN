export const defaultTerminalUser = "Frisk";
export const sudoTerminalUser = "Sans";
export const sudoPromptUser = "💀Sans";
export const githubUrl = "https://github.com/gyhbwjhnb/8028";
export const terminalMonoFontFamily =
  'Consolas, "Cascadia Mono", "SFMono-Regular", ui-monospace, monospace';
export const initialTerminalOutput = [
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
] as const;

export const availableCommands = [
  "help",
  "clear",
  "whoami",
  "github",
  "sudo",
  "control",
] as const;

export type CommandName = (typeof availableCommands)[number];

export type DirectoryKey = "~";

export const isSudoIdentity = (user: string) =>
  user === sudoTerminalUser || user === sudoPromptUser || user.endsWith(sudoTerminalUser);
