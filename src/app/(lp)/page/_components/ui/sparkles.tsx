"use client";
import { useEffect, useId, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";

interface SparklesProps {
  className?: string;
  size?: number;
  density?: number;
  speed?: number;
  opacity?: number;
  direction?: "top" | "bottom" | "left" | "right" | "none";
  color?: string;
  background?: string;
}

export function Sparkles({
  className,
  size = 1,
  density = 800,
  speed = 1,
  opacity = 1,
  direction = "none",
  color = "#FFFFFF",
  background = "transparent",
}: SparklesProps) {
  const [isReady, setIsReady] = useState(false);
  const id = useId();

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setIsReady(true));
  }, []);

  const directionMap: Record<string, number> = {
    top: 270,
    bottom: 90,
    left: 180,
    right: 0,
    none: 0,
  };

  if (!isReady) return null;

  return (
    <Particles
      id={id}
      className={className}
      options={{
        background: { color: { value: background } },
        fullScreen: { enable: false },
        fpsLimit: 120,
        particles: {
          color: { value: color },
          move: {
            direction: direction === "none" ? "none" : (directionMap[direction] as any),
            enable: direction !== "none",
            speed: { min: 0.5, max: speed },
            straight: false,
          },
          number: { density: { enable: true, width: 400, height: 400 }, value: density },
          opacity: { value: { min: 0.1, max: opacity } },
          size: { value: { min: 0.5, max: size } },
        },
      }}
    />
  );
}
