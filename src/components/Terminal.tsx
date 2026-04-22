import { FormEvent, type ReactElement, useEffect, useRef, useState } from "react";
import {
  layoutNextLine,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";
import { defaultTerminalUser, isSudoIdentity, sudoPromptUser } from "../data/site";
import { getPromptValidity, useTerminalStore } from "../store/terminal";

type TerminalProps = {
  interactive?: boolean;
};

type AnimationDirection = "forward" | "back" | "left" | "right";
type MovementKey = "w" | "a" | "s" | "d";

const spriteFrames = import.meta.glob("../../img/*/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

function getAnimationFrames(direction: AnimationDirection) {
  return Object.entries(spriteFrames)
    .filter(([path]) => path.includes(`/img/${direction}/`))
    .sort(([leftPath], [rightPath]) => {
      const leftFrame = Number.parseInt(leftPath.match(/(\d+)\.png$/)?.[1] ?? "0", 10);
      const rightFrame = Number.parseInt(rightPath.match(/(\d+)\.png$/)?.[1] ?? "0", 10);
      return leftFrame - rightFrame;
    })
    .map(([, assetUrl]) => assetUrl);
}

const spriteAnimations: Record<AnimationDirection, string[]> = {
  forward: getAnimationFrames("forward"),
  back: getAnimationFrames("back"),
  left: getAnimationFrames("left"),
  right: getAnimationFrames("right"),
};

const fallbackSpriteFrame =
  spriteAnimations.forward[0] ??
  spriteAnimations.back[0] ??
  spriteAnimations.left[0] ??
  spriteAnimations.right[0] ??
  "";
const idleFrame = spriteAnimations.forward[0] ?? fallbackSpriteFrame;
const movementKeys: MovementKey[] = ["w", "a", "s", "d"];
const spriteFrameDuration = 1000 / 15;
const baseMovementSpeed = 180;
const sprintMultiplier = 1.8;
const spriteSize = 96;
const spriteMargin = 16;
const spriteScrollbarGap = 72;
const terminalPaddingX = 20;
const terminalPaddingRight = 52;
const terminalPaddingY = 20;
const reflowLineHeight = 28;
const reflowFont = '18px "Courier New", "SFMono-Regular", Consolas, monospace';
const reflowBlockGap = 12;
const reflowObstacleHorizontalPadding = 0;
const reflowObstacleVerticalPadding = 0;
const spriteHullInsetX = 0;
const spriteHullInsetY = 0;
const softBreak = "\u200b";
const preparedByKey = new Map<string, PreparedTextWithSegments>();
const typedProgressById = new Map<string, number>();

type ReflowBlock = {
  className: string;
  displayText: string;
  font: string;
  id: string;
  lineHeight: number;
  naturalText: string;
  parts:
    | { kind: "prompt"; cwd: string; input: string; user: string }
    | { kind: "tabbed"; left: string; right: string }
    | { kind: "typed"; text: string }
    | { kind: "plain"; text: string };
};

type ReflowLine = {
  className: string;
  id: string;
  parts:
    | {
        kind: "prompt";
        cwd: string;
        end: number;
        input: string;
        start: number;
        user: string;
      }
    | { kind: "tabbed"; left: string; right: string }
    | { kind: "typed"; text: string }
    | { kind: "plain"; text: string };
  x: number;
  y: number;
};

type SpriteHull = {
  direction?: AnimationDirection;
  frame?: number;
  height: number;
  lefts: Array<number | null>;
  rights: Array<number | null>;
  width: number;
};

type SpriteHullPayload = {
  images: SpriteHull[];
};

type ReflowOverlayProps = {
  contentWidth: number;
  history: ReturnType<typeof useTerminalStore.getState>["history"];
  scrollTop: number;
  spritePosition: { x: number; y: number };
  spriteHull: SpriteHull | null;
};

function getDirectionFromKey(key: MovementKey): AnimationDirection {
  switch (key) {
    case "w":
      return "back";
    case "a":
      return "left";
    case "d":
      return "right";
    default:
      return "forward";
  }
}

function PromptLabel({ cwd, user }: { cwd: string; user: string }) {
  const promptUser = user === defaultTerminalUser ? user : isSudoIdentity(user) ? sudoPromptUser : user;

  return (
    <>
      <span className="text-violet-400">{promptUser}</span>
      <span className="text-amber-400">:</span>
      <span className="text-amber-400">{cwd}</span>
      <span className="text-amber-400">$</span>
    </>
  );
}

function renderPromptFragment({
  cwd,
  end,
  input,
  start,
  user,
}: Extract<ReflowLine["parts"], { kind: "prompt" }>) {
  const resolvedPromptUser =
    user === defaultTerminalUser ? user : isSudoIdentity(user) ? sudoPromptUser : user;
  const segments = [
    { className: "terminal-prompt-user", text: resolvedPromptUser },
    { className: "terminal-prompt-symbol", text: ":" },
    { className: "terminal-prompt-symbol", text: cwd },
    { className: "terminal-prompt-symbol", text: "$" },
    { className: "terminal-prompt-input", text: input ? ` ${input}` : "" },
  ];
  const fragments: ReactElement[] = [];
  let offset = 0;

  segments.forEach((segment, index) => {
    const segmentStart = offset;
    const segmentEnd = offset + segment.text.length;
    const overlapStart = Math.max(start, segmentStart);
    const overlapEnd = Math.min(end, segmentEnd);

    if (overlapEnd > overlapStart) {
      fragments.push(
        <span key={`${start}-${end}-${index}`} className={segment.className}>
          {segment.text.slice(overlapStart - segmentStart, overlapEnd - segmentStart)}
        </span>,
      );
    }

    offset = segmentEnd;
  });

  return fragments;
}

function TypedText({ text, typedId }: { text: string; typedId: string }) {
  const [visibleText, setVisibleText] = useState(() => {
    const cachedLength = typedProgressById.get(typedId) ?? 0;
    return text.slice(0, cachedLength);
  });

  useEffect(() => {
    const cachedLength = typedProgressById.get(typedId) ?? 0;

    if (cachedLength >= text.length) {
      setVisibleText(text);
      return;
    }

    setVisibleText(text.slice(0, cachedLength));
    let index = cachedLength;
    const intervalId = window.setInterval(() => {
      index += 1;
      const nextText = text.slice(0, index);
      typedProgressById.set(typedId, index);
      setVisibleText(nextText);

      if (index >= text.length) {
        typedProgressById.set(typedId, text.length);
        window.clearInterval(intervalId);
      }
    }, 100);

    return () => window.clearInterval(intervalId);
  }, [text, typedId]);

  return <>{visibleText || <span className="block h-5" />}</>;
}

function makeFlexibleBreakText(text: string) {
  return text
    .split(" ")
    .map((word) => Array.from(word).join(softBreak))
    .join(" ");
}

function stripSoftBreaks(text: string) {
  return text.replaceAll(softBreak, "");
}

function getPrepared(text: string, font: string) {
  const key = `${font}::${text}`;
  const cached = preparedByKey.get(key);

  if (cached) {
    return cached;
  }

  const prepared = prepareWithSegments(text, font);
  preparedByKey.set(key, prepared);
  return prepared;
}

function buildSpriteHullIndex(images: SpriteHull[]) {
  const index: Partial<Record<AnimationDirection, SpriteHull[]>> = {};

  images.forEach((image) => {
    if (!image.direction || typeof image.frame !== "number") {
      return;
    }

    if (!index[image.direction]) {
      index[image.direction] = [];
    }

    index[image.direction]![image.frame - 1] = image;
  });

  return index;
}

function carveLineSlotsFromHull(
  left: number,
  right: number,
  bandTop: number,
  bandBottom: number,
  spritePosition: { x: number; y: number },
  spriteHull: SpriteHull | null,
) {
  if (spriteHull === null) {
    return [{ left, right }];
  }

  const spriteTop = spritePosition.y;
  const spriteBottom = spritePosition.y + spriteSize;
  const effectiveTop = spriteTop + spriteHullInsetY;
  const effectiveBottom = spriteBottom - spriteHullInsetY;

  if (
    bandBottom <= effectiveTop - reflowObstacleVerticalPadding ||
    bandTop >= effectiveBottom + reflowObstacleVerticalPadding
  ) {
    return [{ left, right }];
  }

  const sampleTop = Math.max(effectiveTop, bandTop - reflowObstacleVerticalPadding);
  const sampleBottom = Math.min(effectiveBottom, bandBottom + reflowObstacleVerticalPadding);
  const startRow = Math.max(
    0,
    Math.floor(((sampleTop - spriteTop) / spriteSize) * spriteHull.height),
  );
  const endRow = Math.min(
    spriteHull.height - 1,
    Math.ceil(((sampleBottom - spriteTop) / spriteSize) * spriteHull.height),
  );
  let hullLeft = Number.POSITIVE_INFINITY;
  let hullRight = Number.NEGATIVE_INFINITY;

  for (let row = startRow; row <= endRow; row += 1) {
    const rowLeft = spriteHull.lefts[row];
    const rowRight = spriteHull.rights[row];

    if (rowLeft === null || rowRight === null) {
      continue;
    }

    const scaledLeft = spritePosition.x + (rowLeft / spriteHull.width) * spriteSize;
    const scaledRight = spritePosition.x + (rowRight / spriteHull.width) * spriteSize;
    hullLeft = Math.min(hullLeft, scaledLeft);
    hullRight = Math.max(hullRight, scaledRight);
  }

  if (!Number.isFinite(hullLeft) || !Number.isFinite(hullRight)) {
    return [{ left, right }];
  }

  const blockedLeft = Math.max(
    left,
    hullLeft + spriteHullInsetX - reflowObstacleHorizontalPadding,
  );
  const blockedRight = Math.min(
    right,
    hullRight - spriteHullInsetX + reflowObstacleHorizontalPadding,
  );

  if (blockedRight <= blockedLeft) {
    return [{ left, right }];
  }

  const slots = [];

  if (blockedLeft - left >= 24) {
    slots.push({ left, right: blockedLeft });
  }

  if (right - blockedRight >= 24) {
    slots.push({ left: blockedRight, right });
  }

  return slots;
}

function buildReflowBlocks(
  history: ReturnType<typeof useTerminalStore.getState>["history"],
): ReflowBlock[] {
  const blocks: ReflowBlock[] = [];

  history.forEach((entry) => {
    if (entry.input || entry.id === 0) {
      const promptUser =
        entry.user === defaultTerminalUser
          ? entry.user
          : isSudoIdentity(entry.user)
            ? sudoPromptUser
            : entry.user;
      const promptText = `${promptUser}:${entry.cwd}$ ${entry.input}`.trimEnd();
      blocks.push({
        className: "is-prompt",
        displayText: makeFlexibleBreakText(promptText),
        font: reflowFont,
        id: `prompt-${entry.id}`,
        lineHeight: reflowLineHeight,
        naturalText: promptText,
        parts: {
          kind: "prompt",
          cwd: entry.cwd,
          input: entry.input,
          user: entry.user,
        },
      });
    }

    entry.output.forEach((line, index) => {
      if (line.includes("\t")) {
        const [left, right = ""] = line.split("\t");

        blocks.push({
          className: "is-output",
          displayText: `${left}      ${right}`,
          font: reflowFont,
          id: `output-${entry.id}-${index}`,
          lineHeight: reflowLineHeight,
          naturalText: `${left}      ${right}`,
          parts: {
            kind: "tabbed",
            left,
            right,
          },
        });
        return;
      }

      const text = line.replace(/^__TYPE__:/, "");
      const isTyped = line.startsWith("__TYPE__:");
      const displayText =
        entry.id === 0 && !isTyped
          ? text
          : makeFlexibleBreakText(text);

      blocks.push({
        className: "is-output",
        displayText,
        font: reflowFont,
        id: `output-${entry.id}-${index}`,
        lineHeight: reflowLineHeight,
        naturalText: text,
        parts: isTyped
          ? {
              kind: "typed",
              text,
            }
          : {
              kind: "plain",
              text,
            },
      });
    });
  });

  return blocks;
}

function buildReflowLayout({
  contentWidth,
  history,
  scrollTop,
  spritePosition,
  spriteHull,
}: ReflowOverlayProps): { contentHeight: number; lines: ReflowLine[] } {
  const blocks = buildReflowBlocks(history);
  const documentSpritePosition = {
    x: spritePosition.x,
    y: spritePosition.y + scrollTop,
  };
  const lines: ReflowLine[] = [];
  let currentTop = terminalPaddingY;
  const layoutLeft = terminalPaddingX;
  const layoutRight = Math.max(
    terminalPaddingX + 24,
    contentWidth - terminalPaddingRight,
  );

  blocks.forEach((block) => {
    if (!block.displayText) {
      currentTop += block.lineHeight;
      return;
    }

    const prepared = getPrepared(block.displayText, block.font);
    let cursor: LayoutCursor = { graphemeIndex: 0, segmentIndex: 0 };
    let blockLineCount = 0;
    let visibleCharsConsumed = 0;

    while (true) {
      const carvedSlots = carveLineSlotsFromHull(
        layoutLeft,
        layoutRight,
        currentTop,
        currentTop + block.lineHeight,
        documentSpritePosition,
        spriteHull,
      ).sort((leftSlot, rightSlot) => leftSlot.left - rightSlot.left);
      const previewLine =
        block.parts.kind === "prompt"
          ? layoutNextLine(
              getPrepared(block.naturalText, block.font),
              cursor,
              layoutRight - layoutLeft,
            )
          : null;
      const slots =
        block.parts.kind === "prompt" && carvedSlots.length > 1
          ? carvedSlots[0] && previewLine && carvedSlots[0].right - carvedSlots[0].left >= previewLine.width
            ? [carvedSlots[0]]
            : carvedSlots
          : carvedSlots;

      if (slots.length === 0) {
        currentTop += block.lineHeight;
        continue;
      }

      let wroteOnThisBand = false;

      for (const slot of slots) {
        const line = layoutNextLine(prepared, cursor, slot.right - slot.left);
        const visibleLineText = stripSoftBreaks(line?.text ?? "");

        if (line === null) {
          break;
        }

        lines.push({
          className: block.className,
          id: `${block.id}-${blockLineCount}`,
          parts:
            block.parts.kind === "prompt"
              ? {
                  kind: "prompt" as const,
                  cwd: block.parts.cwd,
                  end: visibleCharsConsumed + visibleLineText.length,
                  input: block.parts.input,
                  start: visibleCharsConsumed,
                  user: block.parts.user,
                }
              : block.parts.kind === "tabbed"
                ? (() => {
                      const raw = visibleLineText;
                      const separator = "      ";
                      const separatorIndex = raw.indexOf(separator);

                    if (separatorIndex === -1) {
                      return {
                        kind: "plain" as const,
                        text: raw,
                      };
                    }

                    return {
                      kind: "tabbed" as const,
                      left: raw.slice(0, separatorIndex),
                      right: raw.slice(separatorIndex + separator.length),
                    };
                  })()
                  : {
                    kind:
                      block.parts.kind === "typed" ? ("typed" as const) : ("plain" as const),
                    text: visibleLineText,
                  },
          x: Math.round(slot.left),
          y: Math.round(currentTop),
        });

        cursor = line.end;
        blockLineCount += 1;
        visibleCharsConsumed += visibleLineText.length;
        wroteOnThisBand = true;
      }

      if (!wroteOnThisBand) {
        break;
      }

      currentTop += block.lineHeight;
    }

    currentTop += reflowBlockGap;
  });

  return {
    contentHeight: currentTop + terminalPaddingY,
    lines,
  };
}

function TerminalReflowOverlay({
  contentWidth,
  history,
  scrollTop,
  spritePosition,
  spriteHull,
}: ReflowOverlayProps) {
  const { contentHeight, lines } = buildReflowLayout({
    contentWidth,
    history,
    scrollTop,
    spritePosition,
    spriteHull,
  });

  return (
    <>
      <div aria-hidden="true" style={{ height: `${contentHeight}px` }} />
      <div className="terminal-reflow-layer" style={{ height: `${contentHeight}px` }}>
        {lines.map((line) => (
          <span
            key={line.id}
            className={`terminal-reflow-line ${line.className}`}
            style={{
              left: `${line.x}px`,
              top: `${line.y}px`,
              lineHeight: `${reflowLineHeight}px`,
            }}
          >
            {line.parts.kind === "prompt" ? (
              renderPromptFragment(line.parts)
            ) : line.parts.kind === "tabbed" ? (
              <>
                <span className="terminal-tab-left">{line.parts.left}</span>
                <span className="terminal-tab-gap">      </span>
                <span className="terminal-tab-right">{line.parts.right}</span>
              </>
            ) : line.parts.kind === "typed" ? (
              <TypedText text={line.parts.text} typedId={line.id} />
            ) : (
              line.parts.text
            )}
          </span>
        ))}
      </div>
    </>
  );
}

export function Terminal({ interactive = true }: TerminalProps) {
  const controlMode = useTerminalStore((state) => state.controlMode);
  const history = useTerminalStore((state) => state.history);
  const prompt = useTerminalStore((state) => state.prompt);
  const cwd = useTerminalStore((state) => state.cwd);
  const user = useTerminalStore((state) => state.user);
  const exitControlMode = useTerminalStore((state) => state.exitControlMode);
  const setPrompt = useTerminalStore((state) => state.setPrompt);
  const runCommand = useTerminalStore((state) => state.runCommand);
  const containerRef = useRef<HTMLElement | null>(null);
  const historyEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const movementOrderRef = useRef<MovementKey[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const lastAnimationTickRef = useRef(0);
  const lastMovementTickRef = useRef(0);
  const [spritePosition, setSpritePosition] = useState({ x: 0, y: 0 });
  const [spriteHullIndex, setSpriteHullIndex] = useState<
    Partial<Record<AnimationDirection, SpriteHull[]>>
  >({});
  const [spriteReady, setSpriteReady] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportSize, setViewportSize] = useState({ height: 0, width: 0 });
  const [activeDirection, setActiveDirection] = useState<AnimationDirection>("forward");
  const [spriteFrameIndex, setSpriteFrameIndex] = useState(0);
  const promptValidity = getPromptValidity(prompt, cwd, user);
  const isMoving = movementKeys.some((key) => pressedKeysRef.current.has(key));
  const activeSprite = isMoving
    ? spriteAnimations[activeDirection][spriteFrameIndex] ?? idleFrame
    : idleFrame;
  const activeHull =
    spriteHullIndex[isMoving ? activeDirection : "forward"]?.[
      isMoving ? spriteFrameIndex : 0
    ] ?? null;

  useEffect(() => {
    let cancelled = false;

    fetch("/sprite-hulls.json")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load sprite hulls: ${response.status}`);
        }

        return (await response.json()) as SpriteHullPayload;
      })
      .then((payload) => {
        if (!cancelled) {
          setSpriteHullIndex(buildSpriteHullIndex(payload.images));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSpriteHullIndex({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [history]);

  useEffect(() => {
    const positionSprite = () => {
      const container = containerRef.current;

      if (!container) {
        return;
      }

      const maxX = Math.max(
        spriteMargin,
        container.clientWidth - spriteSize - spriteMargin - spriteScrollbarGap,
      );
      const maxY = Math.max(spriteMargin, container.clientHeight - spriteSize - spriteMargin);
      setViewportSize({ height: container.clientHeight, width: container.clientWidth });

      setSpritePosition((current) => ({
        x: spriteReady ? Math.min(Math.max(current.x, spriteMargin), maxX) : maxX,
        y: spriteReady ? Math.min(Math.max(current.y, spriteMargin), maxY) : spriteMargin,
      }));
      setSpriteReady(true);
    };

    positionSprite();
    window.addEventListener("resize", positionSprite);

    return () => window.removeEventListener("resize", positionSprite);
  }, [spriteReady]);

  useEffect(() => {
    const scroller = scrollRef.current;

    if (!scroller) {
      return;
    }

    const handleScroll = () => {
      setScrollTop(scroller.scrollTop);
    };

    handleScroll();
    scroller.addEventListener("scroll", handleScroll);

    return () => scroller.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!controlMode) {
      pressedKeysRef.current.clear();
      movementOrderRef.current = [];
      setActiveDirection("forward");
      setSpriteFrameIndex(0);
      inputRef.current?.focus();
      return;
    }

    inputRef.current?.blur();

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key === "escape") {
        event.preventDefault();
        pressedKeysRef.current.clear();
        movementOrderRef.current = [];
        exitControlMode();
        return;
      }

      if (key === "shift" || movementKeys.includes(key as MovementKey)) {
        event.preventDefault();
      }

      if (!movementKeys.includes(key as MovementKey) && key !== "shift") {
        return;
      }

      pressedKeysRef.current.add(key);

      if (movementKeys.includes(key as MovementKey)) {
        const movementKey = key as MovementKey;
        movementOrderRef.current = [
          ...movementOrderRef.current.filter((item) => item !== movementKey),
          movementKey,
        ];
        setActiveDirection(getDirectionFromKey(movementKey));
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key === "shift" || movementKeys.includes(key as MovementKey)) {
        event.preventDefault();
      }

      pressedKeysRef.current.delete(key);

      if (!movementKeys.includes(key as MovementKey)) {
        return;
      }

      movementOrderRef.current = movementOrderRef.current.filter((item) => item !== key);
      const latestKey = movementOrderRef.current[movementOrderRef.current.length - 1];

      if (latestKey) {
        setActiveDirection(getDirectionFromKey(latestKey));
      } else {
        setActiveDirection("forward");
        setSpriteFrameIndex(0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [controlMode, exitControlMode]);

  useEffect(() => {
    if (!controlMode) {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = null;
      lastAnimationTickRef.current = 0;
      lastMovementTickRef.current = 0;
      return;
    }

    const updateSprite = (timestamp: number) => {
      const container = containerRef.current;

      if (!container) {
        animationFrameRef.current = window.requestAnimationFrame(updateSprite);
        return;
      }

      const pressedKeys = pressedKeysRef.current;
      const movingLeft = pressedKeys.has("a");
      const movingRight = pressedKeys.has("d");
      const movingUp = pressedKeys.has("w");
      const movingDown = pressedKeys.has("s");
      const moving = movingLeft || movingRight || movingUp || movingDown;

      if (moving) {
        if (lastAnimationTickRef.current === 0) {
          lastAnimationTickRef.current = timestamp;
        }

        if (timestamp - lastAnimationTickRef.current >= spriteFrameDuration) {
          lastAnimationTickRef.current = timestamp;
          setSpriteFrameIndex((current) => (current + 1) % spriteAnimations[activeDirection].length);
        }
      } else {
        lastAnimationTickRef.current = timestamp;
        setSpriteFrameIndex(0);
      }

      if (lastMovementTickRef.current === 0) {
        lastMovementTickRef.current = timestamp;
      }

      const deltaSeconds = (timestamp - lastMovementTickRef.current) / 1000;
      lastMovementTickRef.current = timestamp;

      if (moving) {
        let axisX = 0;
        let axisY = 0;

        if (movingLeft) {
          axisX -= 1;
        }
        if (movingRight) {
          axisX += 1;
        }
        if (movingUp) {
          axisY -= 1;
        }
        if (movingDown) {
          axisY += 1;
        }

        const magnitude = Math.hypot(axisX, axisY) || 1;
        const speed = baseMovementSpeed * (pressedKeys.has("shift") ? sprintMultiplier : 1);
        const moveX = (axisX / magnitude) * speed * deltaSeconds;
        const moveY = (axisY / magnitude) * speed * deltaSeconds;
        const maxX = Math.max(
          spriteMargin,
          container.clientWidth - spriteSize - spriteMargin - spriteScrollbarGap,
        );
        const maxY = Math.max(spriteMargin, container.clientHeight - spriteSize - spriteMargin);

        setSpritePosition((current) => ({
          x: Math.min(Math.max(current.x + moveX, spriteMargin), maxX),
          y: Math.min(Math.max(current.y + moveY, spriteMargin), maxY),
        }));
      }

      animationFrameRef.current = window.requestAnimationFrame(updateSprite);
    };

    animationFrameRef.current = window.requestAnimationFrame(updateSprite);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [activeDirection, controlMode]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!interactive || controlMode) {
      return;
    }

    const normalizedPrompt = prompt.trim().toLowerCase();

    if (normalizedPrompt === "exit" && user === defaultTerminalUser) {
      if (window.parent !== window) {
        window.parent.postMessage({ type: "terminal-exit" }, window.location.origin);
      }

      return;
    }

    const url = runCommand(prompt);

    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <section
      ref={containerRef}
      className="terminal-shell flex h-full flex-col overflow-hidden border border-violet-400 font-mono text-base leading-7 text-amber-50"
    >
      <div
        className={`terminal-sprite ${controlMode ? "is-controlled" : ""}`}
        style={{
          transform: `translate(${spritePosition.x}px, ${spritePosition.y}px)`,
          width: `${spriteSize}px`,
          height: `${spriteSize}px`,
        }}
      >
        <img src={activeSprite} alt="Animated sprite" draggable={false} />
      </div>

      <div className="min-h-0 flex-1 pr-8">
        <div
          ref={scrollRef}
          className="terminal-scroll terminal-scroll-reflow h-full overflow-y-scroll px-5 py-5"
        >
          <TerminalReflowOverlay
            contentWidth={viewportSize.width}
            history={history}
            scrollTop={scrollTop}
            spritePosition={spritePosition}
            spriteHull={activeHull}
          />

          <form onSubmit={handleSubmit}>
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-lg">
                <PromptLabel cwd={cwd} user={user} />
              </span>
              <input
                ref={inputRef}
                autoFocus={interactive}
                disabled={!interactive || controlMode}
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
                } disabled:cursor-not-allowed disabled:text-amber-50/60`}
              />
            </label>
          </form>
          <div ref={historyEndRef} />
        </div>
      </div>
    </section>
  );
}
