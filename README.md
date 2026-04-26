# 8028

```text
      ┌---------------------------------------------------------┐
     ███████╗███╗   ██╗ ██████╗ ██╗    ██╗██████╗ ██╗███╗   ██╗ │
     ██╔════╝████╗  ██║██╔═══██╗██║    ██║██╔══██╗██║████╗  ██║ │
     ███████╗██╔██╗ ██║██║   ██║██║ █╗ ██║██║  ██║██║██╔██╗ ██║ │
     ╚════██║██║╚██╗██║██║   ██║██║███╗██║██║  ██║██║██║╚██╗██║ │
     ███████║██║ ╚████║╚██████╔╝╚███╔███╔╝██████╔╝██║██║ ╚████║ │
     ╚══════╝╚═╝  ╚═══╝ ╚═════╝  ╚══╝╚══╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝ │
      │                                                         │
      │                              Welcome to Snowdin         │
      │                                                         │
      └---------------------------------------------------------┘
```

`8028` is a Vite + React site that combines:

- a 3D computer model viewer
- a terminal-style personal site
- a screen-projected terminal route rendered inside the model display flow

## Current behavior

- Default mode uses the moving camera around the 3D computer.
- The computer screen stays black in non-front-view mode.
- After switching to `正视图` and fully reaching the front-facing camera position, the screen shows a Windows-style loading spinner for 3 seconds.
- After that delay, the live terminal page is loaded through an `iframe` on the projected screen area.
- Screen interaction is only enabled after the front-view camera is fully in place.

## Routes

- `/` : main 3D computer showcase
- `/terminal` : standalone terminal page used by the projected screen iframe

## Local development

Requirements:

- Node.js 24+

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## Project notes

- Main 3D screen/camera logic lives in [src/components/ComputerShowcase.tsx](C:/Users/31764/8028/src/components/ComputerShowcase.tsx).
- Terminal UI lives in [src/components/Terminal.tsx](C:/Users/31764/8028/src/components/Terminal.tsx).
- The computer model asset is [public/computer.glb](C:/Users/31764/8028/public/computer.glb).

## Tech stack

- React
- React Router
- Zustand
- Three.js
- @react-three/fiber
- @react-three/drei
- Vite
