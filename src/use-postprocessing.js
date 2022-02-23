import { useFrame, useThree, useLoader } from 'react-three-fiber'
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BlendFunction,
  ChromaticAberrationEffect,
  BloomEffect,
  NoiseEffect,
  PredicationMode,
  SMAAEffect,
  SMAAImageLoader,
  TextureEffect
} from 'postprocessing'

function usePostprocessing(reflectorPipeline = []) {
  const { gl, size, scene, camera } = useThree()
  const smaa = useLoader(SMAAImageLoader)

  const [composer] = useMemo(() => {
    const composer = new EffectComposer(gl, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0
    })
    const renderPass = new RenderPass(scene, camera)

    const CHROMATIC_ABERRATION = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.001, 0.001)
    })
    const BLOOM = new BloomEffect({
      luminanceSmoothing: 0.3,
      intensity: 0.5
    })
    const NOISE = new NoiseEffect({
      blendFunction: BlendFunction.COLOR_DODGE
    })
    NOISE.blendMode.opacity.value = 0.03

    // INIT ANTIALIAS
    const SMAA = new SMAAEffect(...smaa)
    SMAA.edgeDetectionMaterial.setEdgeDetectionThreshold(0.05)
    SMAA.edgeDetectionMaterial.setPredicationMode(PredicationMode.DEPTH)
    SMAA.edgeDetectionMaterial.setPredicationThreshold(0.002)
    SMAA.edgeDetectionMaterial.setPredicationScale(1.0)
    const edgesTextureEffect = new TextureEffect({
      blendFunction: BlendFunction.SKIP,
      texture: SMAA.renderTargetEdges.texture
    })
    const weightsTextureEffect = new TextureEffect({
      blendFunction: BlendFunction.SKIP,
      texture: SMAA.renderTargetWeights.texture
    })
    // END ANTIALIAS

    const effectPass = new EffectPass(camera, SMAA, edgesTextureEffect, weightsTextureEffect, BLOOM, NOISE)
    const effectPassChroAbb = new EffectPass(camera, CHROMATIC_ABERRATION)

    reflectorPipeline.forEach((pass) => composer.addPass(pass))

    composer.addPass(renderPass)
    composer.addPass(effectPass)
    composer.addPass(effectPassChroAbb)

    return [composer]
  }, [gl, scene, camera, reflectorPipeline, smaa])

  useEffect(() => void composer.setSize(size.width, size.height), [composer, size])
  useFrame((_, delta) => void composer.render(delta), -1)
}

export default usePostprocessing
