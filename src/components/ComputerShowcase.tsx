import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerspectiveCamera, useGLTF } from "@react-three/drei";
import * as THREE from "three";

const ORBIT_SPEED = 0.45;
const CAMERA_DAMPING = 4.5;
const FRONT_STEP_1_DAMPING = 2.2;
const FRONT_STEP_EPSILON = 0.03;
const MODEL_ROTATION_Y = -0.35;
const X_OFFSET = 0.42;
const Y_OFFSET = 0.28;
const Z_OFFSET = 0.055;
const FRONT_POSITION_EPSILON = 0.035;
const FRONT_DIRECTION_EPSILON = 0.985;
const RETURN_POSITION_EPSILON = 0.04;
const SCREEN_RESOLUTION = { width: 1280, height: 860 };
const INTRO_TEXT = "Click the computer to begin...";

const FRONT_VIEW_STEP_1 = {
  position: { x: 0, y: 0, z: 0 },
  target: { x: 0, y: 0, z: -1 },
};

const FRONT_VIEW_STEP_2 = {
  position: { x: -0.21, y: 0.1, z: 0.9 },
  target: { x: 0, y: 0, z: -1 },
};

const MODEL_MARKERS = {
  point_1_red: { x: -0.21 - X_OFFSET, y: 0.1 + Y_OFFSET, z: Z_OFFSET },
  point_2_green: { x: -0.21 + X_OFFSET - 0.02, y: 0.1 + Y_OFFSET, z: Z_OFFSET },
  point_3_blue: { x: -0.21 + X_OFFSET - 0.02, y: 0.1 - Y_OFFSET, z: Z_OFFSET },
  point_4_yellow: { x: -0.21 - X_OFFSET, y: 0.1 - Y_OFFSET, z: Z_OFFSET },
} as const;

type CameraMode = "orbit" | "front" | "returning";
type ExitStage = "none" | "loading" | "black" | "returning" | "pause";

type OrbitState = {
  currentAngle: number;
  baseRadius: number;
  baseY: number;
  step1Radius: number;
  step1Y: number;
  step1Angle: number;
};

type OverlayFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  visible: boolean;
};

function alignedToWorld(x: number, y: number, z: number) {
  return new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), MODEL_ROTATION_Y);
}

function worldToAligned(x: number, y: number, z: number) {
  return new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -MODEL_ROTATION_Y);
}

function forwardAngleDelta(current: number, target: number) {
  return THREE.MathUtils.euclideanModulo(target - current, Math.PI * 2);
}

function getFrontStep(stepIndex: number, orbitRadius: number) {
  if (stepIndex === 0) {
    return {
      position: { x: FRONT_VIEW_STEP_1.position.x, y: FRONT_VIEW_STEP_1.position.y, z: orbitRadius },
      target: FRONT_VIEW_STEP_1.target,
    };
  }

  return FRONT_VIEW_STEP_2;
}

function projectToScreen(point: THREE.Vector3, camera: THREE.PerspectiveCamera, width: number, height: number) {
  const projected = point.clone().project(camera);
  return {
    x: ((projected.x + 1) / 2) * width,
    y: ((1 - projected.y) / 2) * height,
    z: projected.z,
  };
}

function buildOverlayFrame(camera: THREE.PerspectiveCamera, width: number, height: number): OverlayFrame {
  const topLeft = alignedToWorld(MODEL_MARKERS.point_1_red.x, MODEL_MARKERS.point_1_red.y, MODEL_MARKERS.point_1_red.z);
  const topRight = alignedToWorld(MODEL_MARKERS.point_2_green.x, MODEL_MARKERS.point_2_green.y, MODEL_MARKERS.point_2_green.z);
  const bottomLeft = alignedToWorld(MODEL_MARKERS.point_4_yellow.x, MODEL_MARKERS.point_4_yellow.y, MODEL_MARKERS.point_4_yellow.z);

  const projectedTopLeft = projectToScreen(topLeft, camera, width, height);
  const projectedTopRight = projectToScreen(topRight, camera, width, height);
  const projectedBottomLeft = projectToScreen(bottomLeft, camera, width, height);

  const overlayWidth = Math.hypot(projectedTopRight.x - projectedTopLeft.x, projectedTopRight.y - projectedTopLeft.y);
  const overlayHeight = Math.hypot(projectedBottomLeft.x - projectedTopLeft.x, projectedBottomLeft.y - projectedTopLeft.y);

  return {
    x: projectedTopLeft.x,
    y: projectedTopLeft.y,
    width: overlayWidth,
    height: overlayHeight,
    angle: Math.atan2(projectedTopRight.y - projectedTopLeft.y, projectedTopRight.x - projectedTopLeft.x),
    visible:
      [projectedTopLeft.z, projectedTopRight.z, projectedBottomLeft.z].every((z) => z > -1 && z < 1) &&
      overlayWidth > 40 &&
      overlayHeight > 30,
  };
}

function ScreenPlane({ message }: { message: string }) {
  const canvas = useMemo(() => {
    const element = document.createElement("canvas");
    element.width = SCREEN_RESOLUTION.width;
    element.height = SCREEN_RESOLUTION.height;
    return element;
  }, []);

  const texture = useMemo(() => {
    const nextTexture = new THREE.CanvasTexture(canvas);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    return nextTexture;
  }, [canvas]);

  const screenGeometry = useMemo(() => {
    const topLeft = MODEL_MARKERS.point_1_red;
    const topRight = MODEL_MARKERS.point_2_green;
    const bottomRight = MODEL_MARKERS.point_3_blue;
    const bottomLeft = MODEL_MARKERS.point_4_yellow;
    const topLeftVector = new THREE.Vector3(topLeft.x, topLeft.y, topLeft.z);
    const topRightVector = new THREE.Vector3(topRight.x, topRight.y, topRight.z);
    const bottomRightVector = new THREE.Vector3(bottomRight.x, bottomRight.y, bottomRight.z);
    const bottomLeftVector = new THREE.Vector3(bottomLeft.x, bottomLeft.y, bottomLeft.z);
    const planeNormal = topRightVector
      .clone()
      .sub(topLeftVector)
      .cross(bottomLeftVector.clone().sub(topLeftVector))
      .normalize()
      .multiplyScalar(0.0015);

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      topLeftVector.x + planeNormal.x, topLeftVector.y + planeNormal.y, topLeftVector.z + planeNormal.z,
      topRightVector.x + planeNormal.x, topRightVector.y + planeNormal.y, topRightVector.z + planeNormal.z,
      bottomRightVector.x + planeNormal.x, bottomRightVector.y + planeNormal.y, bottomRightVector.z + planeNormal.z,
      bottomLeftVector.x + planeNormal.x, bottomLeftVector.y + planeNormal.y, bottomLeftVector.z + planeNormal.z,
    ]);
    const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();

    return geometry;
  }, []);

  useEffect(() => {
    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const width = canvas.width;
    const height = canvas.height;

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#141414";
    context.fillRect(0, 0, width, height);

    if (message) {
      context.fillStyle = "#f5f5f5";
      context.font = '34px "Segoe UI", sans-serif';
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(message, width / 2, height * 0.72);
    }

    texture.needsUpdate = true;
  }, [canvas, message, texture]);

  return (
    <group rotation={[0, MODEL_ROTATION_Y, 0]}>
      <mesh geometry={screenGeometry}>
        <meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Scene({
  cameraMode,
  onFrontInteractiveChange,
  onOverlayFrame,
  onModelClick,
  onReturnComplete,
}: {
  cameraMode: CameraMode;
  onFrontInteractiveChange: (interactive: boolean) => void;
  onOverlayFrame: (frame: OverlayFrame) => void;
  onModelClick: () => void;
  onReturnComplete: () => void;
}) {
  const { scene } = useGLTF("/computer.glb");
  const model = useMemo(() => scene.clone(true), [scene]);
  const centeredModelRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitRef = useRef<OrbitState | null>(null);
  const modeRef = useRef(cameraMode);
  const frontStepRef = useRef(0);
  const viewDirectionRef = useRef(new THREE.Vector3(0, 0, -1));
  const interactionReadyRef = useRef(false);
  const returnCompletedRef = useRef(false);

  const setFrontInteractive = (nextValue: boolean) => {
    if (interactionReadyRef.current === nextValue) {
      return;
    }

    interactionReadyRef.current = nextValue;
    onFrontInteractiveChange(nextValue);
  };

  useLayoutEffect(() => {
    const centeredModel = centeredModelRef.current;
    const camera = cameraRef.current;

    if (!centeredModel || !camera) {
      return;
    }

    centeredModel.position.set(0, 0, 0);

    const box = new THREE.Box3().setFromObject(centeredModel);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const distance = (maxDim / (2 * Math.tan(fov / 2))) * 2.7;
    const y = maxDim * 0.35;

    centeredModel.position.set(-center.x, -center.y, -center.z);

    orbitRef.current = {
      currentAngle: 0,
      baseRadius: distance,
      baseY: y,
      step1Radius: distance,
      step1Y: y,
      step1Angle: 0,
    };

    const startPosition = alignedToWorld(distance, y, 0);
    camera.position.copy(startPosition);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    viewDirectionRef.current.copy(new THREE.Vector3(0, 0, 0).sub(camera.position).normalize());
    camera.near = Math.max(distance / 100, 0.01);
    camera.far = Math.max(distance * 100, 1000);
    camera.updateProjectionMatrix();
  }, [model]);

  useLayoutEffect(() => {
    modeRef.current = cameraMode;
    setFrontInteractive(false);
    returnCompletedRef.current = false;

    if (cameraMode === "front") {
      const camera = cameraRef.current;
      const orbit = orbitRef.current;

      frontStepRef.current = 0;

      if (camera && orbit) {
        const localPosition = worldToAligned(camera.position.x, camera.position.y, camera.position.z);

        orbit.step1Radius = Math.hypot(localPosition.x, localPosition.z);
        orbit.step1Y = localPosition.y;
        orbit.step1Angle = Math.atan2(localPosition.z, localPosition.x);
        viewDirectionRef.current.copy(new THREE.Vector3(0, 0, 0).sub(camera.position).normalize());
      }
    } else if (cameraMode === "orbit") {
      const camera = cameraRef.current;
      const orbit = orbitRef.current;

      if (camera && orbit) {
        const localPosition = worldToAligned(camera.position.x, camera.position.y, camera.position.z);

        orbit.currentAngle = Math.atan2(localPosition.z, localPosition.x);
        orbit.baseY = localPosition.y;
      }
    } else if (cameraMode === "returning") {
      const orbit = orbitRef.current;

      if (orbit) {
        orbit.baseY = 0;
      }
    }
  }, [cameraMode]);

  useFrame((state, delta) => {
    const camera = cameraRef.current;
    const orbit = orbitRef.current;

    if (!camera || !orbit) {
      return;
    }

    if (modeRef.current === "orbit") {
      orbit.currentAngle += ORBIT_SPEED * delta;

      const orbitPosition = alignedToWorld(
        orbit.baseRadius * Math.cos(orbit.currentAngle),
        orbit.baseY,
        orbit.baseRadius * Math.sin(orbit.currentAngle),
      );

      camera.position.copy(orbitPosition);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      setFrontInteractive(false);
    } else if (modeRef.current === "front" && frontStepRef.current === 0) {
      const step = getFrontStep(0, orbit.step1Radius);
      const targetAngle = Math.atan2(step.position.z, step.position.x);

      orbit.step1Angle +=
        forwardAngleDelta(orbit.step1Angle, targetAngle) *
        (1 - Math.exp(-FRONT_STEP_1_DAMPING * delta));

      const stepOnePosition = new THREE.Vector3(
        orbit.step1Radius * Math.cos(orbit.step1Angle),
        orbit.step1Y,
        orbit.step1Radius * Math.sin(orbit.step1Angle),
      );

      camera.position.copy(alignedToWorld(stepOnePosition.x, stepOnePosition.y, stepOnePosition.z));
      camera.up.set(0, 1, 0);
      viewDirectionRef.current.copy(new THREE.Vector3(0, 0, 0).sub(camera.position).normalize());
      camera.lookAt(0, 0, 0);
      setFrontInteractive(false);

      if (forwardAngleDelta(orbit.step1Angle, targetAngle) < FRONT_STEP_EPSILON) {
        frontStepRef.current = 1;
      }
    } else if (modeRef.current === "front") {
      const step = getFrontStep(1, orbit.baseRadius);
      const frontPosition = alignedToWorld(step.position.x, step.position.y, step.position.z);
      const frontDirection = alignedToWorld(step.target.x, step.target.y, step.target.z).normalize();

      camera.position.x = THREE.MathUtils.damp(camera.position.x, frontPosition.x, CAMERA_DAMPING, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, frontPosition.y, CAMERA_DAMPING, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, frontPosition.z, CAMERA_DAMPING, delta);
      viewDirectionRef.current.lerp(frontDirection, 1 - Math.exp(-CAMERA_DAMPING * delta));
      viewDirectionRef.current.normalize();
      camera.up.set(0, 1, 0);
      camera.lookAt(camera.position.clone().add(viewDirectionRef.current));

      const positionReady = camera.position.distanceTo(frontPosition) < FRONT_POSITION_EPSILON;
      const directionReady = viewDirectionRef.current.dot(frontDirection) > FRONT_DIRECTION_EPSILON;
      setFrontInteractive(positionReady && directionReady);
    } else {
      const returnPosition = alignedToWorld(0, 0, orbit.baseRadius);

      camera.position.x = THREE.MathUtils.damp(camera.position.x, returnPosition.x, CAMERA_DAMPING, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, returnPosition.y, CAMERA_DAMPING, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, returnPosition.z, CAMERA_DAMPING, delta);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      setFrontInteractive(false);

      if (!returnCompletedRef.current && camera.position.distanceTo(returnPosition) < RETURN_POSITION_EPSILON) {
        returnCompletedRef.current = true;
        onReturnComplete();
      }
    }

    camera.updateMatrixWorld();
    onOverlayFrame(buildOverlayFrame(camera, state.size.width, state.size.height));
  });

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={40} />
      <group rotation={[0, MODEL_ROTATION_Y, 0]}>
        <group ref={centeredModelRef} onPointerDown={(event) => {
          event.stopPropagation();
          onModelClick();
        }}>
          <primitive object={model} dispose={null} />
        </group>
      </group>
      <ScreenPlane message="" />
    </>
  );
}

export function ComputerShowcase() {
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  const [frontInteractive, setFrontInteractive] = useState(false);
  const [iframeVisible, setIframeVisible] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [loadingVisible, setLoadingVisible] = useState(false);
  const [typedIntro, setTypedIntro] = useState("");
  const [exitStage, setExitStage] = useState<ExitStage>("none");
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const showLoading = loadingVisible || (iframeVisible && !iframeLoaded);

  useEffect(() => {
    if (cameraMode !== "orbit" || exitStage !== "none") {
      setTypedIntro("");
      return;
    }

    setTypedIntro("");
    let intervalId = 0;
    const startTimeoutId = window.setTimeout(() => {
      let index = 0;
      intervalId = window.setInterval(() => {
        index += 1;
        setTypedIntro(INTRO_TEXT.slice(0, index));

        if (index >= INTRO_TEXT.length) {
          window.clearInterval(intervalId);
        }
      }, 65);
    }, 1000);

    return () => {
      window.clearTimeout(startTimeoutId);
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [cameraMode, exitStage]);

  useEffect(() => {
    if (!frontInteractive || exitStage !== "none") {
      setIframeVisible(false);
      setIframeLoaded(false);
      setLoadingVisible(false);
      return;
    }

    setLoadingVisible(true);
    const timeoutId = window.setTimeout(() => {
      setLoadingVisible(false);
      setIframeVisible(true);
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [frontInteractive, exitStage]);

  useEffect(() => {
    if (exitStage === "loading") {
      const timeoutId = window.setTimeout(() => {
        setLoadingVisible(false);
        setExitStage("black");
      }, 1000);

      return () => window.clearTimeout(timeoutId);
    }

    if (exitStage === "black") {
      const timeoutId = window.setTimeout(() => {
        setCameraMode("returning");
        setExitStage("returning");
      }, 1000);

      return () => window.clearTimeout(timeoutId);
    }

    if (exitStage === "pause") {
      const timeoutId = window.setTimeout(() => {
        setExitStage("none");
        setCameraMode("orbit");
      }, 1000);

      return () => window.clearTimeout(timeoutId);
    }
  }, [exitStage]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.type === "terminal-exit") {
        setIframeVisible(false);
        setIframeLoaded(false);
        setLoadingVisible(true);
        setExitStage("loading");
      }
    };

    window.addEventListener("message", handleMessage);

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleOverlayFrame = (frame: OverlayFrame) => {
    const overlay = overlayRef.current;

    if (!overlay) {
      return;
    }

    overlay.style.width = `${frame.width}px`;
    overlay.style.height = `${frame.height}px`;
    overlay.style.transform = `translate(${frame.x}px, ${frame.y}px) rotate(${frame.angle}rad)`;
    overlay.style.opacity = (loadingVisible || iframeVisible) && frame.visible ? "1" : "0";
    overlay.style.pointerEvents = iframeVisible && frontInteractive && frame.visible ? "auto" : "none";
  };

  return (
    <div className="viewer">
      <div className="screen-overlay-layer">
        <div ref={overlayRef} className="screen-overlay-frame">
          {showLoading ? (
            <div className="screen-loading">
              <div className="screen-loading-spinner" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : null}
          {iframeVisible ? (
            <iframe
              className="screen-iframe"
              src="/terminal"
              title="Embedded Terminal"
              onLoad={() => setIframeLoaded(true)}
              style={{ opacity: iframeLoaded ? 1 : 0 }}
            />
          ) : null}
        </div>
      </div>
      {cameraMode === "orbit" ? (
        <div className="intro-overlay">
          <div className="intro-overlay-text">{typedIntro}</div>
        </div>
      ) : null}
      <Canvas frameloop="always">
        <color attach="background" args={["#1f1f1f"]} />
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 8, 5]} intensity={2.2} />
        <directionalLight position={[-4, 4, -3]} intensity={1.1} />
        <Scene
          cameraMode={cameraMode}
          onFrontInteractiveChange={setFrontInteractive}
          onOverlayFrame={handleOverlayFrame}
          onModelClick={() => {
            if (cameraMode === "orbit") {
              setCameraMode("front");
            }
          }}
          onReturnComplete={() => {
            if (exitStage === "returning") {
              setExitStage("pause");
            }
          }}
        />
      </Canvas>
    </div>
  );
}

useGLTF.preload("/computer.glb");
