"use client";

// Skiper 39 Canvas_Landing_004 — walking-peeps crowd canvas (React + GSAP).
// Integrated for the landing page footer strip: spritesheet is served locally
// from /peeps.png (15 x 7 Open Peeps grid, transparent background).
// Adaptations from the original snippet:
//   - typed peeps/walks (no `any`), optional `scale` prop for short strips
//   - animation only ticks while the canvas is on screen (IntersectionObserver)
//   - prefers-reduced-motion renders a frozen crowd instead of walking
//   - debounced resize; full teardown on unmount
// Inspired by and adapted from https://codepen.io/zadvorsky/pen/xxwbBQV
// illustration by https://www.openpeeps.com/
// License & Usage: free to use and modify in personal and commercial projects.
// Author: @gurvinder-singh02 — https://gxuri.me

import { gsap } from "gsap";
import React, { useEffect, useRef } from "react";

interface CrowdCanvasProps {
  /** Spritesheet with a rows x cols grid of characters (transparent background). */
  src?: string;
  /** Columns across the spritesheet. */
  rows?: number;
  /** Rows down the spritesheet. */
  cols?: number;
  /** Render scale for the peeps (1 = natural spritesheet cell size). */
  scale?: number;
  /** Positioning classes for the canvas — parent should be `relative` and sized. */
  className?: string;
}

type WalkStart = { startX: number; startY: number; endX: number };

type Peep = {
  image: HTMLImageElement;
  rect: [number, number, number, number];
  width: number;
  height: number;
  x: number;
  y: number;
  anchorY: number;
  scaleX: number;
  walk: gsap.core.Timeline | null;
  render: (ctx: CanvasRenderingContext2D) => void;
};

type WalkFn = (args: { peep: Peep; props: WalkStart }) => gsap.core.Timeline;

const CrowdCanvas = ({ src = "/peeps.png", rows = 15, cols = 7, scale = 1, className }: CrowdCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // UTILS
    const randomRange = (min: number, max: number) => min + Math.random() * (max - min);
    const randomIndex = (array: unknown[]) => randomRange(0, array.length) | 0;
    const removeFromArray = <T,>(array: T[], i: number) => array.splice(i, 1)[0];
    const removeItemFromArray = <T,>(array: T[], item: T) => removeFromArray(array, array.indexOf(item));
    const removeRandomFromArray = <T,>(array: T[]) => removeFromArray(array, randomIndex(array));
    const getRandomFromArray = <T,>(array: T[]) => array[randomIndex(array)];

    // TWEEN FACTORIES
    const resetPeep = ({ stage, peep }: { stage: { width: number; height: number }; peep: Peep }): WalkStart => {
      const direction = Math.random() > 0.5 ? 1 : -1;
      const offsetY = 100 - 250 * gsap.parseEase("power2.in")(Math.random());
      const startY = stage.height - peep.height + offsetY;
      const startX = direction === 1 ? -peep.width : stage.width + peep.width;
      const endX = direction === 1 ? stage.width : 0;
      peep.scaleX = direction;

      peep.x = startX;
      peep.y = startY;
      peep.anchorY = startY;

      return { startX, startY, endX };
    };

    const normalWalk: WalkFn = ({ peep, props }) => {
      const { startX, startY, endX } = props;
      const xDuration = 10;
      const yDuration = 0.25;

      const tl = gsap.timeline();
      tl.timeScale(randomRange(0.5, 1.5));
      tl.to(peep, { duration: xDuration, x: endX, ease: "none" }, 0);
      tl.to(peep, { duration: yDuration, repeat: xDuration / yDuration, yoyo: true, y: startY - 10 }, 0);

      return tl;
    };

    const walks: WalkFn[] = [normalWalk];

    // FACTORY FUNCTIONS
    const createPeep = ({ image, rect }: { image: HTMLImageElement; rect: [number, number, number, number] }): Peep => {
      const peep: Peep = {
        image,
        rect,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        anchorY: 0,
        scaleX: 1,
        walk: null,
        render: (c) => {
          c.save();
          c.translate(peep.x, peep.y);
          c.scale(peep.scaleX, 1);
          c.drawImage(
            peep.image,
            peep.rect[0],
            peep.rect[1],
            peep.rect[2],
            peep.rect[3],
            0,
            0,
            peep.width,
            peep.height,
          );
          c.restore();
        },
      };

      peep.width = rect[2] * scale;
      peep.height = rect[3] * scale;
      return peep;
    };

    // MAIN
    const img = document.createElement("img");
    const stage = { width: 0, height: 0 };

    const allPeeps: Peep[] = [];
    const availablePeeps: Peep[] = [];
    const crowd: Peep[] = [];

    const createPeeps = () => {
      const total = rows * cols;
      const { naturalWidth: width, naturalHeight: height } = img;
      if (!width || !height) return;
      const rectWidth = width / rows;
      const rectHeight = height / cols;

      for (let i = 0; i < total; i++) {
        allPeeps.push(
          createPeep({
            image: img,
            rect: [
              (i % rows) * rectWidth,
              ((i / rows) | 0) * rectHeight,
              rectWidth,
              rectHeight,
            ],
          }),
        );
      }
    };

    const addPeepToCrowd = () => {
      const peep = removeRandomFromArray(availablePeeps);
      const walk = getRandomFromArray(walks)({
        peep,
        props: resetPeep({ peep, stage }),
      }).eventCallback("onComplete", () => {
        removePeepFromCrowd(peep);
        addPeepToCrowd();
      });

      peep.walk = walk;
      crowd.push(peep);
      crowd.sort((a, b) => a.anchorY - b.anchorY);

      return peep;
    };

    const removePeepFromCrowd = (peep: Peep) => {
      removeItemFromArray(crowd, peep);
      availablePeeps.push(peep);
    };

    const initCrowd = () => {
      while (availablePeeps.length) {
        addPeepToCrowd().walk?.progress(Math.random());
      }
    };

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

      crowd.forEach((peep) => {
        peep.render(ctx);
      });

      ctx.restore();
    };

    const resize = () => {
      stage.width = canvas.clientWidth;
      stage.height = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = stage.width * dpr;
      canvas.height = stage.height * dpr;

      crowd.forEach((peep) => {
        peep.walk?.kill();
      });

      crowd.length = 0;
      availablePeeps.length = 0;
      availablePeeps.push(...allPeeps);

      initCrowd();

      if (prefersReduced) {
        // Frozen illustration: pause every walk where it stands, draw once.
        crowd.forEach((peep) => peep.walk?.pause());
        render();
      }
    };

    let ticking = false;
    const startTicker = () => {
      if (!ticking) {
        gsap.ticker.add(render);
        ticking = true;
      }
    };
    const stopTicker = () => {
      if (ticking) {
        gsap.ticker.remove(render);
        ticking = false;
      }
    };

    let observer: IntersectionObserver | null = null;

    const init = () => {
      createPeeps();
      resize();
      if (!prefersReduced) {
        observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((e) => e.isIntersecting)) startTicker();
            else stopTicker();
          },
          { threshold: 0.02 },
        );
        observer.observe(canvas);
      }
    };

    img.onload = init;
    img.src = src;

    let resizeTimer: number | undefined;
    const handleResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => resize(), 150);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.clearTimeout(resizeTimer);
      observer?.disconnect();
      stopTicker();
      crowd.forEach((peep) => {
        peep.walk?.kill();
      });
    };
  }, [src, rows, cols, scale]);

  return <canvas ref={canvasRef} aria-hidden className={className ?? "absolute bottom-0 left-0 h-full w-full"} />;
};

// Full-screen demo wrapper (kept for parity with the original snippet).
const Skiper39 = () => {
  return (
    <div className="relative h-full w-full bg-white text-zinc-950">
      <div className="absolute left-1/2 top-22 grid -translate-x-1/2 content-start justify-items-center gap-6 text-center">
        <span className="relative max-w-[12ch] text-xs uppercase leading-tight opacity-40 after:absolute after:left-1/2 after:top-full after:h-16 after:w-px after:bg-gradient-to-b after:from-transparent after:to-zinc-950 after:content-['']">
          Crowd canvas
        </span>
      </div>
      <div className="absolute bottom-0 h-full w-screen">
        <CrowdCanvas className="absolute bottom-0 left-0 h-[90vh] w-full" />
      </div>
    </div>
  );
};

export { CrowdCanvas, Skiper39 };
export default Skiper39;
