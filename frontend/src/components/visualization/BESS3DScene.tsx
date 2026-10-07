import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

function BESSModel() {
  const group = useRef<THREE.Group>(null);
  const pulseMaterial = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (pulseMaterial.current) {
      // Subtle pulse effect to simulate energy flow
      const t = clock.getElapsedTime();
      pulseMaterial.current.emissiveIntensity = 0.5 + Math.sin(t * 2) * 0.3;
    }
    if (group.current) {
      // Very slow ambient rotation
      group.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.1) * 0.05;
    }
  });

  return (
    <group ref={group}>
      {/* Main Container */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 2.5, 2]} />
        <meshStandardMaterial color="#414141" roughness={0.7} metalness={0.2} />
      </mesh>
      
      {/* Front Panel / Screens / Detail */}
      <mesh position={[0, 0, 1.01]}>
        <boxGeometry args={[3.8, 2.3, 0.05]} />
        <meshStandardMaterial color="#2d2d2d" roughness={0.5} />
      </mesh>

      {/* Energy Indicator / Logo Plate */}
      <mesh position={[0, 0.5, 1.05]}>
        <boxGeometry args={[1.5, 0.2, 0.05]} />
        <meshStandardMaterial 
          ref={pulseMaterial}
          color="#BFD730" 
          emissive="#BFD730"
          emissiveIntensity={0.5}
        />
      </mesh>
      
      {/* Cooling Vents */}
      <mesh position={[-1.2, -0.5, 1.05]}>
        <boxGeometry args={[1, 0.8, 0.05]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
      </mesh>
      <mesh position={[1.2, -0.5, 1.05]}>
        <boxGeometry args={[1, 0.8, 0.05]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
      </mesh>
    </group>
  );
}

export function BESS3DScene() {
  // Check prefers-reduced-motion to potentially disable the whole canvas or simplify
  const prefersReducedMotion = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
    : false;

  return (
    <div className="w-full h-[300px] sm:h-[400px] lg:h-[500px]">
      <Canvas 
        camera={{ position: [5, 3, 5], fov: 45 }}
        dpr={typeof window !== 'undefined' && window.devicePixelRatio > 1 ? 2 : 1}
        shadows
      >
        <ambientLight intensity={0.5} />
        <directionalLight 
          position={[5, 10, 5]} 
          intensity={1.5} 
          castShadow 
          shadow-mapSize={1024}
        />
        
        {!prefersReducedMotion ? (
          <Float speed={1.5} rotationIntensity={0.1} floatIntensity={0.2}>
            <BESSModel />
          </Float>
        ) : (
          <BESSModel />
        )}
        
        <Environment preset="city" />
        <ContactShadows 
          position={[0, -1.5, 0]} 
          opacity={0.5} 
          scale={10} 
          blur={2} 
          far={4} 
        />
      </Canvas>
    </div>
  );
}
