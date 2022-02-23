import { Box, Environment, OrbitControls, Stats, Sphere, Loader, Circle } from '@react-three/drei'
import React, { Suspense, useRef } from 'react'
import ReactDOM from 'react-dom'
import { Canvas, useResource, useFrame } from 'react-three-fiber'
import { useReflector } from './use-reflector'
import usePostprocessing from './use-postprocessing'
import './styles.css'

function Totem({ material, ...props }) {
  return (
    <group {...props}>
      <Box receiveShadow castShadow args={[1, 6, 1]} material={material} />
    </group>
  )
}
function Ufo({ material }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime()
    const sinSlow = Math.sin(time * 2.33)
    const sin = Math.sin(time)
    const cos = Math.cos(time * 3)
    ref.current.position.set(5 * sin, 1 + sinSlow, 2 * cos)
  })
  return <Sphere castShadow ref={ref} args={[0.2, 64, 64]} material={material} />
}

function Scene() {
  const material = useResource()

  const [meshRef, ReflectorMaterial, passes] = useReflector()
  usePostprocessing(passes)

  return (
    <group position-z={-5}>
      <group>
        {/* <meshPhysicalMaterial
          ref={material}
          clearcoat={1}
          metalness={0.9}
          roughness={0.3}
        /> */}
        <Totem position-x={-4} rotation-y={Math.PI / 4} material={material.current} />
        <Totem material={material.current} />
        <Totem position-x={4} rotation-y={Math.PI / 4} material={material.current} />
        <Ufo material={material.current} />
      </group>
      <Circle receiveShadow ref={meshRef} args={[12, 256, 256]} rotation-x={-Math.PI / 2} position-y={-3.001}>
        <ReflectorMaterial metalness={0.8} roughness={0.3} clearcoat={0.5} reflectorOpacity={0.3} />
      </Circle>
    </group>
  )
}

function App() {
  return (
    <>
      <Canvas
        concurrent
        shadowMap
        colorManagement
        camera={{ position: [0, 0, 10], far: 100, near: 0.1, fov: 60 }}
        gl={{
          powerPreference: 'high-performance',
          alpha: false,
          antialias: false,
          stencil: false,
          depth: false
        }}>
        <color attach="background" args={['#000000']} />
        <spotLight
          position={[20, 20, 10]}
          intensity={3}
          castShadow
          angle={Math.PI / 3}
          penumbra={1}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <ambientLight intensity={0.3} />
        <Suspense fallback={null}>
          <Scene />
          <Environment files="rooftop_night_1k.hdr" />
        </Suspense>
        <OrbitControls />
      </Canvas>
      <Stats />
      <Loader />
    </>
  )
}

ReactDOM.render(<App />, document.getElementById('root'))
