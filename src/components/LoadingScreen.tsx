import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface LoadingScreenProps {
  onFinish?: () => void;
  /** Total visible time in seconds before the fade-out begins. Default: 2 */
  duration?: number;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  onFinish,
  duration = 2,
}) => {
  const [image, setImage] = useState<string | null>(null);
  const [phase, setPhase] = useState<"visible" | "transition" | "done">("visible");

  useEffect(() => {
    const images = ["/loading-male.png", "/loading-female.png"];
    setImage(images[Math.floor(Math.random() * images.length)]);

    // Start fade-out after `duration` seconds
    const t1 = setTimeout(() => setPhase("transition"), duration * 1000);
    // Done after fade (1 s — kept short)
    const t2 = setTimeout(() => {
      setPhase("done");
      onFinish?.();
    }, duration * 1000 + 1000);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [duration, onFinish]);

  if (!image || phase === "done") return null;

  return (
    <AnimatePresence mode="wait">
      <div
        key="loading-screen"
        className="fixed inset-0 z-[999] overflow-hidden"
        style={{ background: "#000" }}
      >
        <motion.img
          src={image}
          alt="Loading"
          className="w-full h-full object-cover"
          draggable={false}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ display: "block" }}
        />

        {/* Vignette */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)", pointerEvents: "none" }} />

        {/* App name */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          style={{ position: "absolute", bottom: "12%", left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none" }}
        >
          <p style={{ color: "white", fontSize: 32, fontWeight: 900, letterSpacing: "-0.5px", textShadow: "0 2px 12px rgba(0,0,0,0.5)", fontFamily: "'Syne', sans-serif" }}>Nowo</p>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 500, letterSpacing: "0.5px" }}>Fii în siguranță. Oriunde.</p>
        </motion.div>

        {/* Fade-to-black overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={phase === "transition" ? { opacity: 1 } : { opacity: 0 }}
          transition={phase === "transition" ? { duration: 1, ease: [0.4, 0, 0.2, 1] } : { duration: 0 }}
          style={{ position: "absolute", inset: 0, background: "#000", pointerEvents: "none" }}
        />
      </div>
    </AnimatePresence>
  );
};