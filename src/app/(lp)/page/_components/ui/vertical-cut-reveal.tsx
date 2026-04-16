"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface VerticalCutRevealProps {
  children: string;
  splitBy?: "words" | "characters";
  staggerDuration?: number;
  staggerFrom?: "first" | "last";
  reverse?: boolean;
  containerClassName?: string;
  transition?: object;
}

export function VerticalCutReveal({
  children,
  splitBy = "words",
  staggerDuration = 0.1,
  staggerFrom = "first",
  reverse = false,
  containerClassName,
  transition = {},
}: VerticalCutRevealProps) {
  const parts =
    splitBy === "words" ? children.split(" ") : children.split("");

  return (
    <motion.span
      className={cn("flex flex-wrap gap-x-[0.25em]", containerClassName)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={{
        visible: {
          transition: {
            staggerChildren: staggerDuration,
            staggerDirection: staggerFrom === "last" || reverse ? -1 : 1,
          },
        },
      }}
    >
      {parts.map((part, i) => (
        <span key={i} className="overflow-hidden inline-block">
          <motion.span
            className="inline-block"
            variants={{
              hidden: { y: "100%", opacity: 0 },
              visible: { y: 0, opacity: 1, transition },
            }}
          >
            {part}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}
