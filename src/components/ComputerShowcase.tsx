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
const FRONT_VIEW_STEP_1 = {
  position: { x: 0, y: 0, z: 0 },
  target: { x: 0, y: 0, z: -1 },
};

const FRONT_VIEW_STEP_2 = {
  position: { x: -0.21, y: 0.1, z: 0.9 },
  target: { x: 0, y: 0, z: -1 },
};

const MODEL_MARKERS = {
  point_1_red: { x: -0.21 - X_OFFSET, y: 0.1 + Y_OFFSET, z: Z_OFFSET, color: "#ff4d4f", label: "1_red" },
  point_2_green: { x: -0.21 + X_OFFSET - 0.02, y: 0.1 + Y_OFFSET, z: Z_OFFSET, color: "#52c41a", label: "2_green" },
  point_3_blue: { x: -0.21 + X_OFFSET - 0.02, y: 0.1 - Y_OFFSET, z: Z_OFFSET, color: "#1677ff", label: "3_blue" },
  point_4_yellow: { x: -0.21 - X_OFFSET, y: 0.1 - Y_OFFSET, z: Z_OFFSET, color: "#fadb14", label: "4_yellow" },
} as const;

type CameraMode = "orbit" | "front";

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

  return {
    x: projectedTopLeft.x,
    y: projectedTopLeft.y,
    width: Math.hypot(projectedTopRight.x - projectedTopLeft.x, projectedTopRight.y - projectedTopLeft.y),
    height: Math.hypot(projectedBottomLeft.x - projectedTopLeft.x, projectedBottomLeft.y - projectedTopLeft.y),
    angle: Math.atan2(projectedTopRight.y - projectedTopLeft.y, projectedTopRight.x - projectedTopLeft.x),
    visible:
      [projectedTopLeft.z, projectedTopRight.z, projectedBottomLeft.z].every((z) => z > -1 && z < 1) &&
      Math.hypot(projectedTopRight.x - projectedTopLeft.x, projectedTopRight.y - projectedTopLeft.y) > 40 &&
      Math.hypot(projectedBottomLeft.x - projectedTopLeft.x, projectedBottomLeft.y - projectedTopLeft.y) > 30,
  };
}

function BlackScreenPlane() {
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

  return (
    <group rotation={[0, MODEL_ROTATION_Y, 0]}>
      <mesh geometry={screenGeometry}>
        <meshBasicMaterial color="#141414" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Scene({
  cameraMode,
  onFrontInteractiveChange,
  onOverlayFrame,
}: {
  cameraMode: CameraMode;
  onFrontInteractiveChange: (interactive: boolean) => void;
  onOverlayFrame: (frame: OverlayFrame) => void;
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

    if (cameraMode === "front") {
      const camera = cameraRef.current;
      const orbit = orbitRef.current;

      frontStepRef.current = 0;

      if (camera && orbit) {
        orbit.step1Radius = Math.hypot(camera.position.x, camera.position.z);
        orbit.step1Y = camera.position.y;
        orbit.step1Angle = Math.atan2(camera.position.z, camera.position.x);
        viewDirectionRef.current.copy(new THREE.Vector3(0, 0, 0).sub(camera.position).normalize());
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
    } else if (frontStepRef.current === 0) {
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

      camera.position.copy(stepOnePosition);
      camera.up.set(0, 1, 0);
      viewDirectionRef.current.copy(new THREE.Vector3(0, 0, 0).sub(camera.position).normalize());
      camera.lookAt(0, 0, 0);
      setFrontInteractive(false);

      if (forwardAngleDelta(orbit.step1Angle, targetAngle) < FRONT_STEP_EPSILON) {
        frontStepRef.current = 1;
      }
    } else {
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
    }

    camera.updateMatrixWorld();
    onOverlayFrame(buildOverlayFrame(camera, state.size.width, state.size.height));
  });

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={40} />
      <group rotation={[0, MODEL_ROTATION_Y, 0]}>
        <group ref={centeredModelRef}>
          <primitive object={model} dispose={null} />
        </group>
      </group>
      <BlackScreenPlane />
    </>
  );
}

export function ComputerShowcase() {
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  const [frontInteractive, setFrontInteractive] = useState(false);
  const [iframeVisible, setIframeVisible] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [loadingVisible, setLoadingVisible] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const showLoading = loadingVisible || (iframeVisible && !iframeLoaded);

  useEffect(() => {
    if (!frontInteractive) {
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
  }, [frontInteractive]);

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
      <div className="controls">
        <button className="control-button" type="button" onClick={() => setCameraMode("front")}>
          正视图
        </button>
        <button className="control-button" type="button" onClick={() => setCameraMode("orbit")}>
          继续环绕
        </button>
      </div>
      <div className="controls controls-status">
        <div className="control-button control-button-static">{frontInteractive ? "终端已解锁" : "终端锁定中"}</div>
      </div>
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
      <Canvas frameloop="always">
        <color attach="background" args={["#1f1f1f"]} />
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 8, 5]} intensity={2.2} />
        <directionalLight position={[-4, 4, -3]} intensity={1.1} />
        <Scene
          cameraMode={cameraMode}
          onFrontInteractiveChange={setFrontInteractive}
          onOverlayFrame={handleOverlayFrame}
        />
      </Canvas>
    </div>
  );
}

useGLTF.preload("/computer.glb");
