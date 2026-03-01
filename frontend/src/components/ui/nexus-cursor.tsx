"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useSpring, useMotionValue } from "framer-motion";

/**
 * NexusCursor — Custom animated cursor with magnetic trail.
 * Replaces the default cursor with a cyberpunk-themed animated dot.
 */
export function NexusCursor() {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const [isPointer, setIsPointer] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const rippleId = useRef(0);

  const springConfig = { damping: 25, stiffness: 300, mass: 0.5 };
  const dotX = useSpring(cursorX, springConfig);
  const dotY = useSpring(cursorY, springConfig);

  const ringConfig = { damping: 20, stiffness: 150, mass: 0.8 };
  const ringX = useSpring(cursorX, ringConfig);
  const ringY = useSpring(cursorY, ringConfig);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);

      const target = e.target as HTMLElement;
      const isClickable =
        target.closest("a, button, [role='button'], input, textarea, select, [data-clickable]") !== null ||
        window.getComputedStyle(target).cursor === "pointer";
      setIsPointer(isClickable);
    };

    const handleMouseDown = () => {
      setIsClicking(true);
      rippleId.current += 1;
      const x = cursorX.get();
      const y = cursorY.get();
      setRipples((prev) => [...prev.slice(-4), { id: rippleId.current, x, y }]);
    };

    const handleMouseUp = () => setIsClicking(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [cursorX, cursorY]);

  // Remove ripples after animation
  useEffect(() => {
    if (ripples.length === 0) return;
    const timer = setTimeout(() => {
      setRipples((prev) => prev.slice(1));
    }, 600);
    return () => clearTimeout(timer);
  }, [ripples]);

  // Hide on touch devices
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window);
  }, []);

  if (isTouchDevice) return null;

  return (
    <>
      {/* Outer ring — follows with delay */}
      <motion.div
        className="custom-cursor"
        style={{
          x: ringX,
          y: ringY,
          translateX: "-50%",
          translateY: "-50%",
        }}
      >
        <motion.div
          animate={{
            width: isPointer ? 44 : isClicking ? 20 : 32,
            height: isPointer ? 44 : isClicking ? 20 : 32,
            borderColor: isPointer
              ? "rgba(6, 182, 212, 0.6)"
              : "rgba(139, 92, 246, 0.4)",
          }}
          transition={{ duration: 0.2 }}
          className="rounded-full border-2 border-violet-500/40"
          style={{
            boxShadow: isPointer
              ? "0 0 20px rgba(6, 182, 212, 0.3), inset 0 0 10px rgba(6, 182, 212, 0.1)"
              : "0 0 10px rgba(139, 92, 246, 0.2)",
          }}
        />
      </motion.div>

      {/* Inner dot — follows precisely */}
      <motion.div
        className="custom-cursor"
        style={{
          x: dotX,
          y: dotY,
          translateX: "-50%",
          translateY: "-50%",
        }}
      >
        <motion.div
          animate={{
            width: isPointer ? 6 : isClicking ? 10 : 4,
            height: isPointer ? 6 : isClicking ? 10 : 4,
            backgroundColor: isPointer
              ? "rgba(6, 182, 212, 1)"
              : "rgba(139, 92, 246, 0.9)",
          }}
          transition={{ duration: 0.15 }}
          className="rounded-full"
          style={{
            boxShadow: isPointer
              ? "0 0 12px rgba(6, 182, 212, 0.8)"
              : "0 0 8px rgba(139, 92, 246, 0.6)",
          }}
        />
      </motion.div>

      {/* Click ripples */}
      {ripples.map((ripple) => (
        <motion.div
          key={ripple.id}
          className="custom-cursor"
          initial={{
            x: ripple.x,
            y: ripple.y,
            translateX: "-50%",
            translateY: "-50%",
          }}
          style={{
            x: ripple.x,
            y: ripple.y,
            translateX: "-50%",
            translateY: "-50%",
          }}
        >
          <motion.div
            initial={{ width: 8, height: 8, opacity: 0.6 }}
            animate={{ width: 60, height: 60, opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="rounded-full border border-cyan-400/50"
          />
        </motion.div>
      ))}
    </>
  );
}
