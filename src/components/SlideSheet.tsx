/**
 * SlideSheet — a bottom sheet that uses only CSS transitions.
 *
 * Why not Framer Motion on the sheet?
 * Framer keeps an active animation loop that overwrites inline `style.transform`
 * every frame, which conflicts with the manual drag-to-close manipulation.
 * This component avoids that conflict entirely by handling all motion in CSS.
 */

import React, { useEffect, useRef, useCallback } from 'react';

interface SlideSheetProps {
  onClose: () => void;
  children: React.ReactNode;
  /** Extra bottom padding (safe-area is always added on top of this) */
  extraBottomPad?: number;
  backdropColor?: string;
  /** Close when user taps the backdrop */
  closeOnBackdrop?: boolean;
  zIndex?: number;
}

export const SlideSheet: React.FC<SlideSheetProps> = ({
  onClose,
  children,
  extraBottomPad = 0,
  backdropColor = 'rgba(0,0,0,0.4)',
  closeOnBackdrop = true,
  zIndex = 80,
}) => {
  const sheetRef   = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const dragStart  = useRef(0);
  const dragDelta  = useRef(0);

  // ── Entry: start fully off-screen, slide up on next frame ────────────────
  useEffect(() => {
    const el = sheetRef.current;
    const bg = backdropRef.current;
    if (!el || !bg) return;

    // Start invisible
    el.style.transform = 'translateY(100%)';
    el.style.transition = 'none';
    bg.style.opacity = '0';
    bg.style.transition = 'none';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.34s cubic-bezier(0.32, 0.72, 0, 1)';
        el.style.transform = 'translateY(0)';
        bg.style.transition = 'opacity 0.28s ease';
        bg.style.opacity = '1';
      });
    });
  }, []);

  const closeSheet = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const el = sheetRef.current;
    const bg = backdropRef.current;
    if (el) {
      el.style.transition = 'transform 0.24s cubic-bezier(0.4, 0, 1, 1)';
      el.style.transform = 'translateY(110%)';
    }
    if (bg) {
      bg.style.transition = 'opacity 0.24s ease';
      bg.style.opacity = '0';
    }
    setTimeout(onClose, 240);
  }, [onClose]);

  // ── Drag-to-close ─────────────────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    if (closingRef.current) return;
    dragStart.current = e.touches[0].clientY;
    dragDelta.current = 0;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (closingRef.current) return;
    const d = e.touches[0].clientY - dragStart.current;
    dragDelta.current = d;
    if (d > 0 && sheetRef.current) {
      sheetRef.current.style.transition = 'none';
      sheetRef.current.style.transform = `translateY(${d}px)`;
    }
  };
  const onTouchEnd = () => {
    if (closingRef.current) return;
    if (dragDelta.current > 80) {
      closeSheet();
    } else if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
      sheetRef.current.style.transform = 'translateY(0)';
    }
    dragDelta.current = 0;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        style={{
          position: 'fixed', inset: 0,
          background: backdropColor,
          zIndex: zIndex - 1,
          opacity: 0,
        }}
        onClick={closeOnBackdrop ? closeSheet : undefined}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          zIndex,
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -4px 40px rgba(0,0,0,0.13)',
          background: 'white',
          overflow: 'hidden',
          paddingBottom: `calc(env(safe-area-inset-bottom) + ${extraBottomPad}px)`,
          maxWidth: '100vw',
          // will-change: transform gives the GPU a hint to create a compositing layer
          willChange: 'transform',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </>
  );
};