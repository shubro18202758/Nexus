"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * GravityField — Google-Antigravity-inspired cursor-reactive background.
 *
 * Floating geometric shapes (hexagons, triangles, orbs) respond to cursor
 * movement with anti-gravity physics. Magnetic field lines connect shapes
 * near the cursor, and a glowing aura trails the cursor movement.
 */

interface Shape {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  type: "hexagon" | "triangle" | "circle" | "diamond" | "ring";
  color: string;
  alpha: number;
  pulsePhase: number;
  mass: number;
}

interface TrailPoint {
  x: number;
  y: number;
  age: number;
  alpha: number;
}

const COLORS = [
  "139, 92, 246",   // violet
  "6, 182, 212",    // cyan
  "236, 72, 153",   // pink
  "16, 185, 129",   // emerald
  "245, 158, 11",   // amber
  "99, 102, 241",   // indigo
  "168, 85, 247",   // purple
  "56, 189, 248",   // sky
];

function drawHexagon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const px = x + size * Math.cos(angle);
    const py = y + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const angle = (Math.PI * 2 / 3) * i - Math.PI / 2;
    const px = x + size * Math.cos(angle);
    const py = y + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.6, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size * 0.6, y);
  ctx.closePath();
}

export function GravityField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000, active: false });
  const shapesRef = useRef<Shape[]>([]);
  const trailRef = useRef<TrailPoint[]>([]);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

  const SHAPE_COUNT = 90;
  const ANTI_GRAVITY_RADIUS = 350;
  const ANTI_GRAVITY_FORCE = 0.12;
  const CONNECT_DISTANCE = 240;
  const TRAIL_LENGTH = 35;
  const FRICTION = 0.988;
  const CURSOR_GLOW_SIZE = 320;

  const initShapes = useCallback((width: number, height: number) => {
    const types: Shape["type"][] = ["hexagon", "triangle", "circle", "diamond", "ring"];
    const shapes: Shape[] = [];

    // Distribute shapes evenly across a grid with jitter for full-screen coverage
    const cols = Math.ceil(Math.sqrt(SHAPE_COUNT * (width / height)));
    const rows = Math.ceil(SHAPE_COUNT / cols);
    const cellW = width / cols;
    const cellH = height / rows;

    for (let i = 0; i < SHAPE_COUNT; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const jitterX = (Math.random() - 0.5) * cellW * 0.9;
      const jitterY = (Math.random() - 0.5) * cellH * 0.9;
      shapes.push({
        x: (col + 0.5) * cellW + jitterX,
        y: (row + 0.5) * cellH + jitterY,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: 6 + Math.random() * 22,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.025,
        type: types[Math.floor(Math.random() * types.length)],
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        alpha: 0.25 + Math.random() * 0.35,
        pulsePhase: Math.random() * Math.PI * 2,
        mass: 0.5 + Math.random() * 1.5,
      });
    }
    return shapes;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    shapesRef.current = initShapes(width, height);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      prevMouseRef.current = { ...mouseRef.current };
      mouseRef.current = { x: e.clientX, y: e.clientY, active: true };

      // Add trail points
      trailRef.current.push({
        x: e.clientX,
        y: e.clientY,
        age: 0,
        alpha: 0.6,
      });
      if (trailRef.current.length > TRAIL_LENGTH) {
        trailRef.current.shift();
      }
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    const animate = () => {
      timeRef.current += 0.016;
      ctx.clearRect(0, 0, width, height);

      const mouse = mouseRef.current;
      const shapes = shapesRef.current;
      const trail = trailRef.current;

      // ── 0. Ambient nebula clouds (always visible) ─────
      const t = timeRef.current;
      const nebula1X = width * (0.2 + 0.15 * Math.sin(t * 0.08));
      const nebula1Y = height * (0.3 + 0.1 * Math.cos(t * 0.06));
      const neb1 = ctx.createRadialGradient(nebula1X, nebula1Y, 0, nebula1X, nebula1Y, width * 0.35);
      neb1.addColorStop(0, "rgba(139, 92, 246, 0.06)");
      neb1.addColorStop(0.5, "rgba(139, 92, 246, 0.02)");
      neb1.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = neb1;
      ctx.fillRect(0, 0, width, height);

      const nebula2X = width * (0.8 + 0.1 * Math.cos(t * 0.07));
      const nebula2Y = height * (0.7 + 0.12 * Math.sin(t * 0.05));
      const neb2 = ctx.createRadialGradient(nebula2X, nebula2Y, 0, nebula2X, nebula2Y, width * 0.3);
      neb2.addColorStop(0, "rgba(6, 182, 212, 0.05)");
      neb2.addColorStop(0.5, "rgba(6, 182, 212, 0.015)");
      neb2.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = neb2;
      ctx.fillRect(0, 0, width, height);

      const nebula3X = width * (0.5 + 0.12 * Math.sin(t * 0.09));
      const nebula3Y = height * (0.15 + 0.08 * Math.cos(t * 0.04));
      const neb3 = ctx.createRadialGradient(nebula3X, nebula3Y, 0, nebula3X, nebula3Y, width * 0.25);
      neb3.addColorStop(0, "rgba(236, 72, 153, 0.04)");
      neb3.addColorStop(0.5, "rgba(236, 72, 153, 0.01)");
      neb3.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = neb3;
      ctx.fillRect(0, 0, width, height);

      // ── 1. Draw cursor glow aura ───────────────────────
      if (mouse.active) {
        const grad = ctx.createRadialGradient(
          mouse.x, mouse.y, 0,
          mouse.x, mouse.y, CURSOR_GLOW_SIZE
        );
        grad.addColorStop(0, "rgba(139, 92, 246, 0.15)");
        grad.addColorStop(0.25, "rgba(6, 182, 212, 0.08)");
        grad.addColorStop(0.5, "rgba(236, 72, 153, 0.04)");
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      // ── 2. Draw cursor trail ───────────────────────────
      if (trail.length > 2) {
        ctx.beginPath();
        ctx.moveTo(trail[0].x, trail[0].y);
        for (let i = 1; i < trail.length - 1; i++) {
          const xc = (trail[i].x + trail[i + 1].x) / 2;
          const yc = (trail[i].y + trail[i + 1].y) / 2;
          ctx.quadraticCurveTo(trail[i].x, trail[i].y, xc, yc);
        }
        const lastPt = trail[trail.length - 1];
        ctx.lineTo(lastPt.x, lastPt.y);

        const trailGrad = ctx.createLinearGradient(
          trail[0].x, trail[0].y,
          lastPt.x, lastPt.y
        );
        trailGrad.addColorStop(0, "rgba(139, 92, 246, 0)");
        trailGrad.addColorStop(0.5, "rgba(6, 182, 212, 0.25)");
        trailGrad.addColorStop(1, "rgba(236, 72, 153, 0.45)");

        ctx.strokeStyle = trailGrad;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      // Age trail points
      for (let i = trail.length - 1; i >= 0; i--) {
        trail[i].age += 0.05;
        trail[i].alpha -= 0.03;
        if (trail[i].alpha <= 0) trail.splice(i, 1);
      }

      // ── 3. Update & draw shapes ────────────────────────
      for (let i = 0; i < shapes.length; i++) {
        const s = shapes[i];

        // Anti-gravity: push shapes away from cursor
        if (mouse.active) {
          const dx = s.x - mouse.x;
          const dy = s.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < ANTI_GRAVITY_RADIUS && dist > 0) {
            const force = (ANTI_GRAVITY_RADIUS - dist) / ANTI_GRAVITY_RADIUS;
            const angle = Math.atan2(dy, dx);
            const pushForce = force * force * ANTI_GRAVITY_FORCE / s.mass;
            s.vx += Math.cos(angle) * pushForce;
            s.vy += Math.sin(angle) * pushForce;
            // Spin faster when pushed
            s.rotationSpeed += force * 0.005;
          }
        }

        // Gentle drift toward home position (spread-out, not center)
        // Each shape drifts toward its own grid sector, not the center
        const homeX = ((i % 10) + 0.5) * (width / 10);
        const homeY = (Math.floor(i / 10) + 0.5) * (height / 9);
        const homeDx = homeX - s.x;
        const homeDy = homeY - s.y;
        s.vx += homeDx * 0.000008;
        s.vy += homeDy * 0.000008;

        // Friction
        s.vx *= FRICTION;
        s.vy *= FRICTION;
        s.rotationSpeed *= 0.998;

        // Update position
        s.x += s.vx;
        s.y += s.vy;
        s.rotation += s.rotationSpeed;

        // Wrap around edges with margin
        const margin = s.size * 2;
        if (s.x < -margin) s.x = width + margin;
        if (s.x > width + margin) s.x = -margin;
        if (s.y < -margin) s.y = height + margin;
        if (s.y > height + margin) s.y = -margin;

        // Pulsing alpha — bolder range
        const pulse = Math.sin(timeRef.current * 1.5 + s.pulsePhase) * 0.12;
        const currentAlpha = Math.max(0.1, Math.min(0.65, s.alpha + pulse));

        // Distance-based glow near cursor
        let glowMultiplier = 1;
        if (mouse.active) {
          const dx = s.x - mouse.x;
          const dy = s.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < ANTI_GRAVITY_RADIUS) {
            glowMultiplier = 1 + (1 - dist / ANTI_GRAVITY_RADIUS) * 2;
          }
        }

        // Draw shape
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rotation);

        // Outer glow for shapes near cursor
        if (glowMultiplier > 1.2) {
          ctx.shadowColor = `rgba(${s.color}, ${currentAlpha * glowMultiplier * 0.5})`;
          ctx.shadowBlur = 20 * glowMultiplier;
        }

        ctx.fillStyle = `rgba(${s.color}, ${currentAlpha * glowMultiplier * 0.55})`;
        ctx.strokeStyle = `rgba(${s.color}, ${currentAlpha * glowMultiplier})`;
        ctx.lineWidth = 1.5;

        switch (s.type) {
          case "hexagon":
            drawHexagon(ctx, 0, 0, s.size);
            ctx.fill();
            ctx.stroke();
            break;
          case "triangle":
            drawTriangle(ctx, 0, 0, s.size);
            ctx.fill();
            ctx.stroke();
            break;
          case "circle":
            ctx.beginPath();
            ctx.arc(0, 0, s.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
          case "diamond":
            drawDiamond(ctx, 0, 0, s.size);
            ctx.fill();
            ctx.stroke();
            break;
          case "ring":
            ctx.beginPath();
            ctx.arc(0, 0, s.size, 0, Math.PI * 2);
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // Inner ring
            ctx.beginPath();
            ctx.arc(0, 0, s.size * 0.5, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${s.color}, ${currentAlpha * glowMultiplier * 0.4})`;
            ctx.stroke();
            break;
        }

        ctx.restore();
        ctx.shadowBlur = 0;

        // ── 4. Draw connections between nearby shapes ────
        for (let j = i + 1; j < shapes.length; j++) {
          const s2 = shapes[j];
          const dx = s.x - s2.x;
          const dy = s.y - s2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONNECT_DISTANCE) {
            const opacity = (1 - dist / CONNECT_DISTANCE) * 0.2;

            // Brighter connection if both shapes are near cursor
            let connectionGlow = 1;
            if (mouse.active) {
              const d1 = Math.sqrt((s.x - mouse.x) ** 2 + (s.y - mouse.y) ** 2);
              const d2 = Math.sqrt((s2.x - mouse.x) ** 2 + (s2.y - mouse.y) ** 2);
              if (d1 < ANTI_GRAVITY_RADIUS && d2 < ANTI_GRAVITY_RADIUS) {
                connectionGlow = 2.5;
              }
            }

            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s2.x, s2.y);
            ctx.strokeStyle = `rgba(${s.color}, ${opacity * connectionGlow})`;
            ctx.lineWidth = connectionGlow > 1 ? 1.2 : 0.8;
            ctx.stroke();
          }
        }
      }

      // ── 5. Draw magnetic field lines from cursor ──────
      if (mouse.active) {
        const nearShapes = shapes.filter((sh) => {
          const dx = sh.x - mouse.x;
          const dy = sh.y - mouse.y;
          return Math.sqrt(dx * dx + dy * dy) < ANTI_GRAVITY_RADIUS * 1.2;
        });

        for (const ns of nearShapes) {
          const dx = ns.x - mouse.x;
          const dy = ns.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const opacity = (1 - dist / (ANTI_GRAVITY_RADIUS * 1.2)) * 0.2;

          // Curved field line using quadratic bezier
          const midX = (mouse.x + ns.x) / 2 + (Math.random() - 0.5) * 30;
          const midY = (mouse.y + ns.y) / 2 + (Math.random() - 0.5) * 30;

          ctx.beginPath();
          ctx.moveTo(mouse.x, mouse.y);
          ctx.quadraticCurveTo(midX, midY, ns.x, ns.y);

          const fieldGrad = ctx.createLinearGradient(mouse.x, mouse.y, ns.x, ns.y);
          fieldGrad.addColorStop(0, `rgba(139, 92, 246, ${opacity})`);
          fieldGrad.addColorStop(1, `rgba(${ns.color}, ${opacity * 0.5})`);

          ctx.strokeStyle = fieldGrad;
          ctx.lineWidth = 0.5;
          ctx.setLineDash([4, 8]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Cursor crosshair
        const crossSize = 12;
        const crossAlpha = 0.25;
        ctx.strokeStyle = `rgba(6, 182, 212, ${crossAlpha})`;
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(mouse.x - crossSize, mouse.y);
        ctx.lineTo(mouse.x + crossSize, mouse.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(mouse.x, mouse.y - crossSize);
        ctx.lineTo(mouse.x, mouse.y + crossSize);
        ctx.stroke();

        // Cursor ring
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(139, 92, 246, 0.3)`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [initShapes]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 1 }}
    />
  );
}
