import { useCallback, useMemo, useState } from "react";
import {
  LinearFilter,
  MathUtils,
  Matrix4,
  PerspectiveCamera,
  Plane,
  RGBFormat,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  RGBADepthPacking,
} from "three";
import {
  SavePass,
  RenderPass,
  LambdaPass,
  DepthPass,
  EffectPass,
  DepthOfFieldEffect,
} from "postprocessing";
import { useResource, useThree } from "react-three-fiber";
import { ReflectorMaterial } from "./reflector-material";

export function useReflector(
  textureWidth = 512,
  textureHeight = 512,
  clipBias = 0
) {
  const meshRef = useResource();
  const [reflectorPlane] = useState(() => new Plane());
  const [normal] = useState(() => new Vector3());
  const [reflectorWorldPosition] = useState(() => new Vector3());
  const [cameraWorldPosition] = useState(() => new Vector3());
  const [rotationMatrix] = useState(() => new Matrix4());
  const [lookAtPosition] = useState(() => new Vector3(0, 0, -1));
  const [clipPlane] = useState(() => new Vector4());
  const [view] = useState(() => new Vector3());
  const [target] = useState(() => new Vector3());
  const [q] = useState(() => new Vector4());
  const [textureMatrix] = useState(() => new Matrix4());
  const [virtualCamera] = useState(() => new PerspectiveCamera());
  const { gl: renderer, scene, camera } = useThree();

  const beforeRender = useCallback(
    function beforeRender() {
      if (!meshRef.current) return;
      meshRef.current.visible = false;
      reflectorWorldPosition.setFromMatrixPosition(meshRef.current.matrixWorld);
      cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);

      rotationMatrix.extractRotation(meshRef.current.matrixWorld);

      normal.set(0, 0, 1);
      normal.applyMatrix4(rotationMatrix);

      view.subVectors(reflectorWorldPosition, cameraWorldPosition);

      // Avoid rendering when reflector is facing away
      if (view.dot(normal) > 0) return;

      view.reflect(normal).negate();
      view.add(reflectorWorldPosition);

      rotationMatrix.extractRotation(camera.matrixWorld);

      lookAtPosition.set(0, 0, -1);
      lookAtPosition.applyMatrix4(rotationMatrix);
      lookAtPosition.add(cameraWorldPosition);

      target.subVectors(reflectorWorldPosition, lookAtPosition);
      target.reflect(normal).negate();
      target.add(reflectorWorldPosition);

      virtualCamera.position.copy(view);
      virtualCamera.up.set(0, 1, 0);
      virtualCamera.up.applyMatrix4(rotationMatrix);
      virtualCamera.up.reflect(normal);
      virtualCamera.lookAt(target);

      virtualCamera.far = camera.far; // Used in WebGLBackground

      virtualCamera.updateMatrixWorld();
      virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

      // Update the texture matrix
      textureMatrix.set(
        0.5,
        0.0,
        0.0,
        0.5,
        0.0,
        0.5,
        0.0,
        0.5,
        0.0,
        0.0,
        0.5,
        0.5,
        0.0,
        0.0,
        0.0,
        1.0
      );
      textureMatrix.multiply(virtualCamera.projectionMatrix);
      textureMatrix.multiply(virtualCamera.matrixWorldInverse);
      textureMatrix.multiply(meshRef.current.matrixWorld);

      // Now update projection matrix with new clip plane, implementing code from: http://www.terathon.com/code/oblique.html
      // Paper explaining this technique: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf
      reflectorPlane.setFromNormalAndCoplanarPoint(
        normal,
        reflectorWorldPosition
      );
      reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse);

      clipPlane.set(
        reflectorPlane.normal.x,
        reflectorPlane.normal.y,
        reflectorPlane.normal.z,
        reflectorPlane.constant
      );

      const projectionMatrix = virtualCamera.projectionMatrix;

      q.x =
        (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) /
        projectionMatrix.elements[0];
      q.y =
        (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) /
        projectionMatrix.elements[5];
      q.z = -1.0;
      q.w =
        (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];

      // Calculate the scaled plane vector
      clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));

      // Replacing the third row of the projection matrix
      projectionMatrix.elements[2] = clipPlane.x;
      projectionMatrix.elements[6] = clipPlane.y;
      projectionMatrix.elements[10] = clipPlane.z + 1.0 - clipBias;
      projectionMatrix.elements[14] = clipPlane.w;
    },
    [
      clipBias,
      meshRef,
      camera,
      reflectorPlane,
      normal,
      reflectorWorldPosition,
      cameraWorldPosition,
      rotationMatrix,
      lookAtPosition,
      clipPlane,
      view,
      target,
      q,
      textureMatrix,
      virtualCamera,
    ]
  );

  function afterRender() {
    if (!meshRef.current) return;
    meshRef.current.visible = true;
  }

  const {
    renderPass,
    savePass,
    depthPass,
    blurPass,
    lambdaPassBefore,
    lambdaPassAfter,
  } = useMemo(() => {
    const parameters = {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      format: RGBFormat,
    };
    const renderTarget = new WebGLRenderTarget(
      textureWidth,
      textureHeight,
      parameters
    );
    renderTarget.texture.encoding = renderer.outputEncoding;

    if (
      !MathUtils.isPowerOfTwo(textureWidth) ||
      !MathUtils.isPowerOfTwo(textureHeight)
    ) {
      renderTarget.texture.generateMipmaps = false;
    }

    const renderPass = new RenderPass(scene, virtualCamera);
    const depthPass = new DepthPass(scene, virtualCamera);
    const dof = new DepthOfFieldEffect(virtualCamera, {
      focusDistance: 0.3,
      focalLength: 0.6,
      bokehScale: 3.0,
    });
    const blurPass = new EffectPass(virtualCamera, dof);
    blurPass.setDepthTexture(depthPass.texture, RGBADepthPacking);

    const savePass = new SavePass(renderTarget);
    const lambdaPassBefore = new LambdaPass(beforeRender);
    const lambdaPassAfter = new LambdaPass(afterRender);
    return {
      renderPass,
      savePass,
      lambdaPassBefore,
      lambdaPassAfter,
      blurPass,
      depthPass,
    };
  }, [
    textureWidth,
    textureHeight,
    beforeRender,
    virtualCamera,
    scene,
    renderer.outputEncoding,
  ]);

  const Material = useMemo(
    () => ReflectorMaterial({ savePass, textureMatrix }),
    [savePass, textureMatrix]
  );

  return [
    meshRef,
    Material,
    [
      lambdaPassBefore,
      renderPass,
      depthPass,
      blurPass,
      savePass,
      lambdaPassAfter,
    ],
  ];
}
