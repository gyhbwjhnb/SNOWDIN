export const terminalUser = "Frisk";
export const githubUrl = "https://github.com/gyhbwjhnb/8028";

export const availableCommands = [
  "help",
  "whoami",
  "ls",
  "cd",
  "cat",
  "github",
] as const;

export type CommandName = (typeof availableCommands)[number];

export type DirectoryKey = "~" | "~/projects" | "~/notes" | "~/links";

export const directoryChildren: Record<DirectoryKey, string[]> = {
  "~": ["links/", "notes/", "projects/"],
  "~/projects": ["8028/"],
  "~/notes": ["help.txt"],
  "~/links": ["github.shortcut"],
};

export const directoryDescriptions: Record<DirectoryKey, string> = {
  "~": "Home",
  "~/projects": "Project workspace",
  "~/notes": "Notes",
  "~/links": "Shortcuts",
};

export const fileContents = {
  "~/notes/help.txt": [
    "Frisk Shell Quick Notes",
    "",
    "Use help to list available commands.",
    "Use ls to inspect the current directory.",
    "Use cd to move between ~/projects, ~/notes and ~/links.",
    "Use cat help.txt to read this file.",
  ],
  "~/links/github.shortcut": [
    "GitHub Shortcut",
    "Run github to open the project repository in a new tab.",
  ],
} as const;

export type FileKey = keyof typeof fileContents;
