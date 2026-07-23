"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { MeshDistortMaterial, Float } from "@react-three/drei";
import { useRef } from "react";
import type { Mesh } from "three";
import { useReducedMotion } from "motion/react";

function OrganicShape({ position, color, scale = 1 }: { position: [number, number, number]; color: string; scale?: number }) {
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.0008;
      meshRef.current.rotation.y += 0.001;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
      <mesh ref={meshRef} position={position} scale={scale}>
        <sphereGeometry args={[1, 64, 64]} />
        <MeshDistortMaterial
          color={color}
          distort={0.35}
          speed={1.2}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>
    </Float>
  );
}

export function Hero3D() {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return (
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: "linear-gradient(135deg, #FFFFFF 0%, #B5CED6 50%, #6E97A7 100%)",
        }}
        aria-hidden="true"
        role="presentation"
      />
    );
  }

  return (
    <div className="absolute inset-0 -z-10" aria-hidden="true" role="presentation">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 4]} intensity={0.4} color="#FFFFFF" />
        <OrganicShape position={[-1.5, 0.5, 0]} color="#B5CED6" scale={1.2} />
        <OrganicShape position={[1.5, -0.5, -1]} color="#6E97A7" scale={1.0} />
        <OrganicShape position={[0, 1.5, -2]} color="#FFFFFF" scale={0.7} />
      </Canvas>
    </div>
  );
}
