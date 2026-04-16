"use client";
import { motion, useInView, Variants } from "framer-motion";
import { useRef, ReactNode, ElementType } from "react";

interface TimelineContentProps {
  children: ReactNode;
  animationNum: number;
  timelineRef: React.RefObject<HTMLDivElement | null>;
  customVariants?: Variants;
  className?: string;
  as?: ElementType;
}

export function TimelineContent({
  children,
  customVariants,
  className = "",
}: TimelineContentProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const defaultVariants: Variants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  const variants = customVariants ?? defaultVariants;

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={variants}
      className={className}
    >
      {children}
    </motion.div>
  );
}
