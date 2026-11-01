/* eslint-disable */
"use client";

import React, { useEffect, useRef } from "react";

interface BoltPoint {
  x: number;
  y: number;
}

interface BoltBranch {
  points: BoltPoint[];
  width: number;
}

interface ActiveStrike {
  branches: BoltBranch[];
  startTime: number;
  duration: number;
  originX: number;
  originY: number;
  peakAlpha: number;
  isSheetOnly?: boolean;
}

interface CloudPuff {
  x: number;
  y: number;
  width: number;
  height: number;
  speedX: number;
  alpha: number;
  spriteIndex: number;
  layer: number; // 0 = deep background, 1 = mid stormhead, 2 = foreground fog
}

interface MistParticle {
  x: number;
  y: number;
  length: number;
  speedX: number;
  speedY: number;
  alpha: number;
}

export interface ThunderStrikeProps {
  speed?: number;
}

/**
 * Living Storm & Lightning Engine (60 FPS Hardware-Accelerated).
 * Features multi-layer parallax thunderclouds, intra-cloud backlighting,
 * drifting storm mist, and crisp lightning discharges.
 */
export const ThunderStrike: React.FC<ThunderStrikeProps> = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return;

    let isDestroyed = false;
    let animId = 0;
    const activeStrikes: ActiveStrike[] = [];
    let nextStrikeTime = performance.now() + 500;
    let nextSheetFlashTime = performance.now() + 1200;

    let width = window.innerWidth;
    let height = window.innerHeight;

    // 1. Create Pre-Rendered Offscreen Cloud Textures for Zero-Lag Blitting
    const cloudSprites: HTMLCanvasElement[] = [];
    const createCloudSprites = () => {
      cloudSprites.length = 0;
      const spriteSize = 320;

      // Sprite 0: Dense Dark Thunderhead Puff
      const c0 = document.createElement("canvas");
      c0.width = spriteSize;
      c0.height = spriteSize;
      const ctx0 = c0.getContext("2d");
      if (ctx0) {
        const rad = ctx0.createRadialGradient(
          spriteSize * 0.5,
          spriteSize * 0.5,
          10,
          spriteSize * 0.5,
          spriteSize * 0.5,
          spriteSize * 0.5
        );
        rad.addColorStop(0, "rgba(28, 16, 56, 0.85)");
        rad.addColorStop(0.4, "rgba(18, 10, 38, 0.65)");
        rad.addColorStop(0.75, "rgba(12, 6, 26, 0.35)");
        rad.addColorStop(1, "rgba(7, 4, 13, 0)");
        ctx0.fillStyle = rad;
        ctx0.fillRect(0, 0, spriteSize, spriteSize);
      }
      cloudSprites.push(c0);

      // Sprite 1: Wispy Violet Storm Cloud
      const c1 = document.createElement("canvas");
      c1.width = spriteSize;
      c1.height = spriteSize;
      const ctx1 = c1.getContext("2d");
      if (ctx1) {
        const rad = ctx1.createRadialGradient(
          spriteSize * 0.45,
          spriteSize * 0.45,
          15,
          spriteSize * 0.5,
          spriteSize * 0.5,
          spriteSize * 0.48
        );
        rad.addColorStop(0, "rgba(58, 28, 112, 0.75)");
        rad.addColorStop(0.35, "rgba(35, 17, 72, 0.5)");
        rad.addColorStop(0.7, "rgba(18, 9, 38, 0.2)");
        rad.addColorStop(1, "rgba(7, 4, 13, 0)");
        ctx1.fillStyle = rad;
        ctx1.fillRect(0, 0, spriteSize, spriteSize);
      }
      cloudSprites.push(c1);

      // Sprite 2: Low-altitude Mist / Atmospheric Fog
      const c2 = document.createElement("canvas");
      c2.width = spriteSize;
      c2.height = spriteSize;
      const ctx2 = c2.getContext("2d");
      if (ctx2) {
        const rad = ctx2.createRadialGradient(
          spriteSize * 0.5,
          spriteSize * 0.5,
          5,
          spriteSize * 0.5,
          spriteSize * 0.5,
          spriteSize * 0.5
        );
        rad.addColorStop(0, "rgba(42, 22, 80, 0.5)");
        rad.addColorStop(0.5, "rgba(22, 11, 46, 0.25)");
        rad.addColorStop(1, "rgba(7, 4, 13, 0)");
        ctx2.fillStyle = rad;
        ctx2.fillRect(0, 0, spriteSize, spriteSize);
      }
      cloudSprites.push(c2);
    };

    createCloudSprites();

    // 2. Multi-Layer Cloud Population
    const clouds: CloudPuff[] = [];
    const initClouds = (w: number, h: number) => {
      clouds.length = 0;
      const count = 28; // Generous stormy cloud coverage

      for (let i = 0; i < count; i++) {
        const layer = i % 3; // 0, 1, 2
        const spriteIdx = i % 3;
        const scale = layer === 0 ? 1.6 + Math.random() * 0.8 : layer === 1 ? 1.2 + Math.random() * 0.6 : 0.9 + Math.random() * 0.5;
        const cw = 320 * scale;
        const ch = 220 * scale;

        clouds.push({
          x: Math.random() * (w + cw) - cw * 0.5,
          y: layer === 0 
            ? Math.random() * (h * 0.45) - 40 
            : layer === 1 
            ? Math.random() * (h * 0.65) - 20 
            : Math.random() * (h * 0.85),
          width: cw,
          height: ch,
          speedX: (layer === 0 ? 0.08 : layer === 1 ? 0.16 : 0.28) * (Math.random() * 0.4 + 0.8),
          alpha: layer === 0 ? 0.85 : layer === 1 ? 0.7 : 0.5,
          spriteIndex: spriteIdx,
          layer,
        });
      }
    };

    // 3. Ambient Storm Rain & Wind Streaks
    const mistParticles: MistParticle[] = [];
    const initMist = (w: number, h: number) => {
      mistParticles.length = 0;
      const count = 45;
      for (let i = 0; i < count; i++) {
        mistParticles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          length: 12 + Math.random() * 22,
          speedX: 2.5 + Math.random() * 2.5,
          speedY: 7.0 + Math.random() * 5.0,
          alpha: 0.08 + Math.random() * 0.12,
        });
      }
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      initClouds(width, height);
      initMist(width, height);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });

    /**
     * Fast fractal polyline generator.
     */
    const generateBranchPoints = (
      p1: BoltPoint,
      p2: BoltPoint,
      displacement: number,
      depth: number,
      points: BoltPoint[],
      branches: BoltBranch[]
    ) => {
      if (depth <= 0) {
        points.push(p2);
        return;
      }

      const midX = (p1.x + p2.x) / 2 + (Math.random() - 0.5) * displacement;
      const midY = (p1.y + p2.y) / 2 + (Math.random() - 0.5) * displacement * 0.35;
      const mid: BoltPoint = { x: midX, y: midY };

      generateBranchPoints(p1, mid, displacement * 0.55, depth - 1, points, branches);
      generateBranchPoints(mid, p2, displacement * 0.55, depth - 1, points, branches);

      if (depth > 1 && Math.random() < 0.38) {
        const angle = (Math.random() - 0.5) * 1.1 + (Math.random() > 0.5 ? 0.4 : -0.4);
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) * (0.35 + Math.random() * 0.4);
        const subBranchPoints: BoltPoint[] = [mid];
        const subEnd: BoltPoint = {
          x: midX + Math.sin(angle) * len,
          y: midY + Math.cos(angle) * len,
        };
        const subBranch: BoltBranch = { points: subBranchPoints, width: 1.5 };
        branches.push(subBranch);

        generateBranchPoints(mid, subEnd, displacement * 0.45, depth - 2, subBranchPoints, branches);
      }
    };

    /**
     * Spawns ground/cloud lightning strikes.
     */
    const spawnStrikes = () => {
      const boltCount = Math.random() < 0.65 ? 2 : 1;

      for (let s = 0; s < boltCount; s++) {
        const startX = (s / boltCount) * width + Math.random() * (width / boltCount);
        const startY = -15 + Math.random() * 35;
        const endX = startX + (Math.random() - 0.5) * (width * 0.28);
        const endY = height * (0.68 + Math.random() * 0.38);

        const mainPoints: BoltPoint[] = [{ x: startX, y: startY }];
        const mainBranch: BoltBranch = { points: mainPoints, width: 3.0 };
        const branches: BoltBranch[] = [mainBranch];

        generateBranchPoints(
          { x: startX, y: startY },
          { x: endX, y: endY },
          width * 0.16,
          6,
          mainPoints,
          branches
        );

        activeStrikes.push({
          branches,
          startTime: performance.now(),
          duration: 280 + Math.random() * 200,
          originX: startX,
          originY: startY,
          peakAlpha: 0.98,
        });

        // 45% chance of rapid restrike
        if (Math.random() < 0.45) {
          const restrikeDelay = 55 + Math.random() * 65;
          setTimeout(() => {
            if (isDestroyed) return;
            const restrikePoints: BoltPoint[] = [{ x: startX + (Math.random() - 0.5) * 20, y: startY }];
            const restrikeBranch: BoltBranch = { points: restrikePoints, width: 2.2 };
            const subBranches: BoltBranch[] = [restrikeBranch];

            generateBranchPoints(
              { x: startX + (Math.random() - 0.5) * 20, y: startY },
              { x: endX + (Math.random() - 0.5) * 35, y: endY },
              width * 0.14,
              5,
              restrikePoints,
              subBranches
            );

            activeStrikes.push({
              branches: subBranches,
              startTime: performance.now(),
              duration: 200,
              originX: startX,
              originY: startY,
              peakAlpha: 0.95,
            });
          }, restrikeDelay);
        }
      }

      nextStrikeTime = performance.now() + 850 + Math.random() * 1150;
    };

    /**
     * Ambient intra-cloud sheet flash (lights up thunderclouds from inside).
     */
    const spawnSheetFlash = () => {
      activeStrikes.push({
        branches: [],
        startTime: performance.now(),
        duration: 220 + Math.random() * 150,
        originX: Math.random() * width,
        originY: Math.random() * (height * 0.4),
        peakAlpha: 0.55 + Math.random() * 0.35,
        isSheetOnly: true,
      });

      nextSheetFlashTime = performance.now() + 1400 + Math.random() * 2200;
    };

    const render = () => {
      if (isDestroyed) return;

      const now = performance.now();

      if (now >= nextStrikeTime) {
        spawnStrikes();
      }

      if (now >= nextSheetFlashTime) {
        spawnSheetFlash();
      }

      // 1. Dark Void Base Plane
      ctx.fillStyle = "#07040d";
      ctx.fillRect(0, 0, width, height);

      // Check max strike & cloud illumination factor
      let maxFlashAlpha = 0;
      let flashOriginX = width * 0.5;
      let flashOriginY = height * 0.2;

      for (let i = activeStrikes.length - 1; i >= 0; i--) {
        const strike = activeStrikes[i];
        const elapsed = now - strike.startTime;
        const progress = elapsed / strike.duration;

        if (progress >= 1.0) {
          activeStrikes.splice(i, 1);
          continue;
        }

        let flicker = 1.0;
        if (progress < 0.1) {
          flicker = Math.random() > 0.25 ? 1.0 : 0.35;
        } else if (progress < 0.3) {
          flicker = 1.0;
        } else {
          flicker = Math.exp(-(progress - 0.3) * 5.5);
        }

        const alpha = Math.max(0, Math.min(1, strike.peakAlpha * flicker));
        if (alpha > maxFlashAlpha) {
          maxFlashAlpha = alpha;
          flashOriginX = strike.originX;
          flashOriginY = strike.originY;
        }
      }

      // 2. Intra-Cloud Atmosphere Flash (Drawn behind and through clouds)
      if (maxFlashAlpha > 0.05) {
        const grad = ctx.createRadialGradient(
          flashOriginX,
          flashOriginY,
          20,
          flashOriginX,
          flashOriginY,
          width * 0.85
        );
        grad.addColorStop(0, `rgba(233, 213, 255, ${0.4 * maxFlashAlpha})`);
        grad.addColorStop(0.3, `rgba(168, 85, 247, ${0.25 * maxFlashAlpha})`);
        grad.addColorStop(0.65, `rgba(88, 28, 135, ${0.1 * maxFlashAlpha})`);
        grad.addColorStop(1, "rgba(7, 4, 13, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      // 3. Render Drifting Thunderclouds (Fast Offscreen Sprite Blitting)
      for (const cloud of clouds) {
        cloud.x += cloud.speedX;
        if (cloud.x > width + 100) {
          cloud.x = -cloud.width - 50;
        }

        const sprite = cloudSprites[cloud.spriteIndex];
        if (!sprite) continue;

        // Illumination boost when thunder strikes
        const effectiveAlpha = Math.min(1.0, cloud.alpha + maxFlashAlpha * 0.45);
        ctx.globalAlpha = effectiveAlpha;
        ctx.drawImage(sprite, cloud.x, cloud.y, cloud.width, cloud.height);
      }
      ctx.globalAlpha = 1.0;

      // 4. Slanted Storm Rain / Wind Mist Streaks
      ctx.strokeStyle = "rgba(192, 132, 252, 0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const p of mistParticles) {
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x > width) p.x = -10;
        if (p.y > height) {
          p.y = -20;
          p.x = Math.random() * width;
        }

        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.length * 0.4, p.y + p.length);
      }
      ctx.stroke();

      // 5. Render Active Lightning Bolts (Zero-Lag Layered Alpha Passes)
      if (activeStrikes.length > 0) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        for (const strike of activeStrikes) {
          if (strike.isSheetOnly || strike.branches.length === 0) continue;

          const elapsed = now - strike.startTime;
          const progress = elapsed / strike.duration;
          let flicker = 1.0;
          if (progress < 0.08) {
            flicker = Math.random() > 0.25 ? 1.0 : 0.3;
          } else if (progress < 0.25) {
            flicker = 1.0;
          } else if (progress < 0.45) {
            flicker = Math.random() > 0.2 ? 0.95 : 0.45;
          } else {
            flicker = Math.exp(-(progress - 0.45) * 6.5);
          }
          const alpha = Math.max(0, Math.min(1, strike.peakAlpha * flicker));
          if (alpha <= 0.01) continue;

          // Outer Glow
          ctx.strokeStyle = `rgba(168, 85, 247, ${0.3 * alpha})`;
          for (const branch of strike.branches) {
            const pts = branch.points;
            if (pts.length < 2) continue;
            ctx.lineWidth = branch.width * 4.5;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let p = 1; p < pts.length; p++) ctx.lineTo(pts[p].x, pts[p].y);
            ctx.stroke();
          }

          // Lavender Mid Pass
          ctx.strokeStyle = `rgba(225, 195, 255, ${0.7 * alpha})`;
          for (const branch of strike.branches) {
            const pts = branch.points;
            if (pts.length < 2) continue;
            ctx.lineWidth = branch.width * 2.0;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let p = 1; p < pts.length; p++) ctx.lineTo(pts[p].x, pts[p].y);
            ctx.stroke();
          }

          // White Core
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.98 * alpha})`;
          for (const branch of strike.branches) {
            const pts = branch.points;
            if (pts.length < 2) continue;
            ctx.lineWidth = Math.max(1.2, branch.width * 0.85);
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let p = 1; p < pts.length; p++) ctx.lineTo(pts[p].x, pts[p].y);
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      isDestroyed = true;
      window.removeEventListener("resize", resize);
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 w-screen h-screen pointer-events-none z-0 overflow-hidden"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
      }}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};

export default ThunderStrike;
