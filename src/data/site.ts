export type CommandName =
  | "help"
  | "about"
  | "projects"
  | "skills"
  | "contact"
  | "resume"
  | "theme"
  | "clear";

export const commandList: CommandName[] = [
  "help",
  "about",
  "projects",
  "skills",
  "contact",
  "resume",
  "theme",
  "clear",
];

export const sections = {
  about: [
    "一个基于命令行交互的个人信息站。",
    "通过输入命令访问个人简介、项目经历、技能和联系方式。"
  ],
  projects: [
    "项目区待补充：建议用结构化数据维护项目名称、角色、技术栈和结果。"
  ],
  skills: ["React 19", "TypeScript", "Vite", "React Router", "Zustand", "Tailwind CSS"],
  contact: ["邮箱：your@email.com", "GitHub：github.com/your-name"],
  resume: ["可提供在线预览或 PDF 下载链接。"],
};
