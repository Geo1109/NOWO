import React, { useEffect, useRef, useState } from "react";

interface LoadingScreenProps {
  onFinish?: () => void;
  /** Seconds the image is held before fade-to-black starts. Default: 1.5 */
  duration?: number;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  onFinish,
  duration = 1.5,
}) => {
  // Pick image once, stably
  const [image] = useState(() => {
    const imgs = ["/loading-male.png", "/loading-female.png"];
    return imgs[Math.floor(Math.random() * imgs.length)];
  });

  const wrapRef    = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const calledRef  = useRef(false);

  useEffect(() => {
    // The component is rendered with opacity:1 immediately — no fade-in, no flash.
    // After `duration` ms: fade the black overlay on top → then unmount.
    const t1 = setTimeout(() => {
      const ov = overlayRef.current;
      if (!ov) return;
      ov.style.transition = `opacity ${Math.min(duration * 0.5, 0.6)}s ease`;
      ov.style.opacity = '1';
    }, duration * 1000);

    const t2 = setTimeout(() => {
      if (!calledRef.current) {
        calledRef.current = true;
        onFinish?.();
      }
    }, duration * 1000 + Math.min(duration * 500, 650));

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#000',
        // No opacity animation on the container — prevents flash
      }}
    >
      {/* Background image — fills the screen immediately */}
      <img
        src={image}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />

      {/* Subtle dark vignette — always present */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.5) 100%)',
        pointerEvents: 'none',
      }} />

      {/* Fade-to-black overlay — starts transparent, JS transitions it to opaque */}
      <div
        ref={overlayRef}
        style={{
          position: 'absolute',
          inset: 0,
          background: '#000',
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};