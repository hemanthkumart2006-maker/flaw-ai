import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Mic, MicOff, Volume2, Square, X, Sparkles, Maximize2, Minimize2, Radio, Eye } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { VoiceMode, LiveKitVoiceState } from "../types";

export type AssistantState = "idle" | "listening" | "thinking" | "speaking";

interface AnimeAssistant3DProps {
  voiceMode: VoiceMode;
  setVoiceMode: (mode: VoiceMode) => void;
  isListening: boolean;
  isProcessing: boolean;
  isPlayingAudio: boolean;
  audioLevel: number;
  onToggleListening: () => void;
  onStopAudio: () => void;
  livekitConnected?: boolean;
  livekitState?: LiveKitVoiceState;
  onLiveKitInterrupt?: () => void;
}

export const AnimeAssistant3D: React.FC<AnimeAssistant3DProps> = ({
  voiceMode,
  setVoiceMode,
  isListening,
  isProcessing,
  isPlayingAudio,
  audioLevel,
  onToggleListening,
  onStopAudio,
  livekitConnected,
  livekitState,
  onLiveKitInterrupt,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<"3d" | "waveform">("3d");

  // Determine current active assistant state (seamlessly mapping LiveKit voice states)
  let assistantState: AssistantState = "idle";
  if (livekitConnected && livekitState) {
    if (livekitState === "SPEAKING") {
      assistantState = "speaking";
    } else if (livekitState === "THINKING" || livekitState === "PROCESSING" || livekitState === "CONNECTING") {
      assistantState = "thinking";
    } else if (livekitState === "LISTENING" || livekitState === "INTERRUPTED") {
      assistantState = "listening";
    } else {
      assistantState = "idle";
    }
  } else {
    assistantState = isPlayingAudio 
      ? "speaking" 
      : isProcessing 
      ? "thinking" 
      : isListening 
      ? "listening" 
      : "idle";
  }

  // Three.js animation refs
  const stateRef = useRef<AssistantState>(assistantState);
  stateRef.current = assistantState;

  const audioLevelRef = useRef<number>(audioLevel);
  audioLevelRef.current = audioLevel;

  useEffect(() => {
    if (!containerRef.current || viewMode !== "3d") return;

    const container = containerRef.current;
    const width = container.clientWidth || 320;
    const height = container.clientHeight || 260;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.2, 3.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xa5b4fc, 1.8);
    keyLight.position.set(2, 3, 3);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xf472b6, 2.0);
    rimLight.position.set(-3, 2, -2);
    scene.add(rimLight);

    const cyanPointLight = new THREE.PointLight(0x38bdf8, 2.2, 10);
    cyanPointLight.position.set(0, -1, 1.5);
    scene.add(cyanPointLight);

    // Root Character Group
    const characterGroup = new THREE.Group();
    scene.add(characterGroup);

    // 1. Head (Stylized Anime Face Geometry)
    const headGroup = new THREE.Group();
    characterGroup.add(headGroup);

    const headGeo = new THREE.SphereGeometry(0.68, 32, 32);
    headGeo.scale(1, 1.15, 0.95);
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xfff0eb,
      roughness: 0.4,
      metalness: 0.05,
    });
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headGroup.add(headMesh);

    // 2. Anime Hair (Layered stylized locks)
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x4f46e5, // Futuristic indigo anime hair
      roughness: 0.35,
      metalness: 0.25,
    });

    const hairBackGeo = new THREE.SphereGeometry(0.74, 24, 24);
    hairBackGeo.scale(1.02, 1.22, 1.05);
    const hairBackMesh = new THREE.Mesh(hairBackGeo, hairMat);
    hairBackMesh.position.set(0, 0.08, -0.12);
    headGroup.add(hairBackMesh);

    // Hair Bangs / Strands
    const strandsGroup = new THREE.Group();
    headGroup.add(strandsGroup);

    const strandGeo = new THREE.ConeGeometry(0.14, 0.65, 8);
    for (let i = -3; i <= 3; i++) {
      const strand = new THREE.Mesh(strandGeo, hairMat);
      strand.position.set(i * 0.16, 0.52 - Math.abs(i) * 0.06, 0.58 - Math.abs(i) * 0.04);
      strand.rotation.x = Math.PI - 0.2;
      strand.rotation.z = -i * 0.15;
      strandsGroup.add(strand);
    }

    // Side Twin Tails / Energy Ribbons
    const sideRibbonGeo = new THREE.CylinderGeometry(0.06, 0.14, 1.4, 16);
    const sideHairLeft = new THREE.Mesh(sideRibbonGeo, hairMat);
    sideHairLeft.position.set(-0.75, -0.2, -0.05);
    sideHairLeft.rotation.z = 0.25;
    headGroup.add(sideHairLeft);

    const sideHairRight = new THREE.Mesh(sideRibbonGeo, hairMat);
    sideHairRight.position.set(0.75, -0.2, -0.05);
    sideHairRight.rotation.z = -0.25;
    headGroup.add(sideHairRight);

    // 3. Anime Expressive Eyes
    const eyeWhiteGeo = new THREE.SphereGeometry(0.13, 16, 16);
    eyeWhiteGeo.scale(1.2, 1.6, 0.3);
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const leftEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    leftEyeWhite.position.set(-0.25, 0.1, 0.62);
    headGroup.add(leftEyeWhite);

    const rightEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    rightEyeWhite.position.set(0.25, 0.1, 0.62);
    headGroup.add(rightEyeWhite);

    // Iris & Pupils (Glowing violet/cyan cybernetic anime eyes)
    const irisGeo = new THREE.CircleGeometry(0.09, 24);
    const irisMat = new THREE.MeshBasicMaterial({ color: 0x818cf8, side: THREE.DoubleSide });

    const leftIris = new THREE.Mesh(irisGeo, irisMat);
    leftIris.position.set(-0.25, 0.1, 0.68);
    headGroup.add(leftIris);

    const rightIris = new THREE.Mesh(irisGeo, irisMat);
    rightIris.position.set(0.25, 0.1, 0.68);
    headGroup.add(rightIris);

    // Eye Highlights
    const highlightGeo = new THREE.CircleGeometry(0.03, 12);
    const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

    const leftHl = new THREE.Mesh(highlightGeo, highlightMat);
    leftHl.position.set(-0.22, 0.13, 0.69);
    headGroup.add(leftHl);

    const rightHl = new THREE.Mesh(highlightGeo, highlightMat);
    rightHl.position.set(0.28, 0.13, 0.69);
    headGroup.add(rightHl);

    // Eyelids (for blinking animation)
    const eyelidGeo = new THREE.SphereGeometry(0.14, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    eyelidGeo.scale(1.25, 1.65, 0.35);
    const eyelidMat = new THREE.MeshStandardMaterial({ color: 0xffe2d6, roughness: 0.5 });

    const leftEyelid = new THREE.Mesh(eyelidGeo, eyelidMat);
    leftEyelid.position.set(-0.25, 0.15, 0.63);
    leftEyelid.rotation.x = -Math.PI / 2;
    leftEyelid.scale.set(1, 0.05, 1); // Start open
    headGroup.add(leftEyelid);

    const rightEyelid = new THREE.Mesh(eyelidGeo, eyelidMat);
    rightEyelid.position.set(0.25, 0.15, 0.63);
    rightEyelid.rotation.x = -Math.PI / 2;
    rightEyelid.scale.set(1, 0.05, 1); // Start open
    headGroup.add(rightEyelid);

    // 4. Stylized Mouth (Dynamic morphing for speaking lip sync)
    const mouthGeo = new THREE.TorusGeometry(0.07, 0.02, 8, 16, Math.PI);
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0xe11d48 });
    const mouthMesh = new THREE.Mesh(mouthGeo, mouthMat);
    mouthMesh.position.set(0, -0.26, 0.64);
    mouthMesh.rotation.z = Math.PI;
    headGroup.add(mouthMesh);

    // 5. Holographic Collar & Cybernetic Base
    const collarGeo = new THREE.CylinderGeometry(0.24, 0.38, 0.45, 24);
    const collarMat = new THREE.MeshStandardMaterial({
      color: 0x1e1e24,
      metalness: 0.8,
      roughness: 0.2,
    });
    const collarMesh = new THREE.Mesh(collarGeo, collarMat);
    collarMesh.position.set(0, -0.75, 0);
    characterGroup.add(collarMesh);

    // Cybernetic Glowing Ring (Aura)
    const haloGeo = new THREE.TorusGeometry(0.9, 0.015, 16, 64);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.7 });
    const haloRing = new THREE.Mesh(haloGeo, haloMat);
    haloRing.rotation.x = Math.PI / 2.3;
    haloRing.position.set(0, -0.1, 0);
    characterGroup.add(haloRing);

    // Thinking Particle Ring
    const particleCount = 40;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const radius = 1.1 + (Math.random() - 0.5) * 0.2;
      particlePos[i * 3] = Math.cos(angle) * radius;
      particlePos[i * 3 + 1] = (Math.random() - 0.5) * 0.6;
      particlePos[i * 3 + 2] = Math.sin(angle) * radius;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePos, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xa855f7,
      size: 0.04,
      transparent: true,
      opacity: 0.8,
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    characterGroup.add(particleSystem);

    // Animation Loop Variables
    let animationFrameId: number;
    let clock = new THREE.Clock();
    let blinkTimer = 0;
    let isBlinking = false;
    let blinkProgress = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const time = clock.getElapsedTime();
      const currentState = stateRef.current;
      const currentLevel = audioLevelRef.current;

      // Handle Blinking Logic
      blinkTimer += 0.016;
      if (blinkTimer > 3.5 && !isBlinking) {
        if (Math.random() < 0.03) {
          isBlinking = true;
          blinkProgress = 0;
        }
      }

      if (isBlinking) {
        blinkProgress += 0.12;
        const blinkAmount = Math.sin(blinkProgress * Math.PI);
        const lidScale = THREE.MathUtils.lerp(0.05, 1.0, Math.max(0, blinkAmount));
        leftEyelid.scale.y = lidScale;
        rightEyelid.scale.y = lidScale;

        if (blinkProgress >= 1) {
          isBlinking = false;
          blinkTimer = 0;
          leftEyelid.scale.y = 0.05;
          rightEyelid.scale.y = 0.05;
        }
      }

      // STATE SPECIFIC BEHAVIORS:
      if (currentState === "idle") {
        // Natural idle breathing & sway
        characterGroup.position.y = Math.sin(time * 1.8) * 0.04;
        headGroup.rotation.y = Math.sin(time * 0.7) * 0.08;
        headGroup.rotation.x = Math.sin(time * 1.2) * 0.03;
        sideHairLeft.rotation.z = 0.25 + Math.sin(time * 2.0) * 0.03;
        sideHairRight.rotation.z = -0.25 - Math.sin(time * 2.0) * 0.03;

        mouthMesh.scale.set(1, 0.4, 1);
        haloMat.color.setHex(0x38bdf8);
        haloMat.opacity = 0.5;
        particleMat.opacity = 0.3;
        haloRing.rotation.z += 0.005;

      } else if (currentState === "listening") {
        // Listening: Attentive forward lean, responsive audio-reactive glow
        characterGroup.position.y = 0.03 + Math.sin(time * 3) * 0.02;
        headGroup.rotation.y = Math.sin(time * 1.5) * 0.05;
        headGroup.rotation.x = -0.06; // tilt forward attentively

        // Glow halo pulses with microphone audio level
        const pulse = 0.6 + (currentLevel / 100) * 0.8;
        haloMat.color.setHex(0xf59e0b); // Amber listening hue
        haloMat.opacity = Math.min(1.0, pulse);
        haloRing.rotation.z += 0.02;
        particleMat.opacity = 0.7;

        mouthMesh.scale.set(1, 0.3, 1);

      } else if (currentState === "thinking") {
        // Thinking: Thoughtful head tilt, rapid particle orbits
        headGroup.rotation.y = 0.15;
        headGroup.rotation.x = -0.08 + Math.sin(time * 2) * 0.02; // looking slightly upward
        characterGroup.position.y = Math.sin(time * 2.5) * 0.05;

        haloMat.color.setHex(0xa855f7); // Purple thinking aura
        haloMat.opacity = 0.9;
        haloRing.rotation.z += 0.04;
        particleSystem.rotation.y += 0.03;
        particleMat.opacity = 0.9;

        mouthMesh.scale.set(0.9, 0.3, 1);

      } else if (currentState === "speaking") {
        // Speaking: Expressive mouth morphing tied to speech rhythm, rhythmic nodding
        characterGroup.position.y = Math.sin(time * 4) * 0.03;
        headGroup.rotation.x = Math.sin(time * 5) * 0.05;
        headGroup.rotation.y = Math.sin(time * 2.5) * 0.06;

        // Dynamic mouth movement (lip sync simulation driven by real audio amplitude)
        const audioAmp = currentLevel > 0 ? currentLevel / 100 : 0.5;
        const mouthOpen = 0.3 + (Math.abs(Math.sin(time * 16)) * 0.8 + audioAmp * 1.6) * 0.7;
        mouthMesh.scale.set(1.1, Math.min(2.5, mouthOpen), 1);

        // Vibrant speaking aura
        haloMat.color.setHex(0x6366f1); // Indigo voice emission
        haloMat.opacity = 0.85 + Math.sin(time * 10) * 0.15;
        haloRing.rotation.z += 0.03;
        particleMat.opacity = 0.8;
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
    };
  }, [viewMode, isExpanded]);

  if (voiceMode === "chat") return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 25 }}
        animate={{ 
          opacity: 1, 
          scale: 1, 
          y: 0,
          width: isExpanded ? 380 : 310,
        }}
        exit={{ opacity: 0, scale: 0.9, y: 25 }}
        transition={{ duration: 0.25 }}
        className="fixed bottom-24 right-6 z-40 bg-[#121216]/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 shadow-2xl select-none overflow-hidden"
      >
        {/* Assistant Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${
              assistantState === "speaking" 
                ? "bg-indigo-400 animate-ping" 
                : assistantState === "listening" 
                ? "bg-amber-400 animate-ping" 
                : assistantState === "thinking" 
                ? "bg-purple-400 animate-spin" 
                : "bg-emerald-400"
            }`} />
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                fLAW AI 3D <span className="text-[9px] px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 rounded-md font-mono">ANIME COMPANION</span>
              </span>
              <p className="text-[10px] text-slate-400 capitalize">
                State: <strong className="text-white">{assistantState}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* View Mode Toggle: 3D Hologram vs 2D Waveform */}
            <button
              onClick={() => setViewMode(prev => prev === "3d" ? "waveform" : "3d")}
              className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
              title={viewMode === "3d" ? "Switch to Waveform" : "Switch to 3D Character"}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>

            {/* Expand / Minimize */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            {/* Close Widget */}
            <button
              onClick={() => setVoiceMode("chat")}
              className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
              title="Close Voice Assistant"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3D Character Container or Waveform View */}
        <div className="relative rounded-2xl bg-gradient-to-b from-[#181822] via-[#0d0d12] to-[#07070a] border border-white/5 overflow-hidden flex flex-col items-center justify-center">
          {viewMode === "3d" ? (
            <div 
              ref={containerRef} 
              className={`w-full transition-all duration-300 ${isExpanded ? "h-64" : "h-52"}`}
            />
          ) : (
            <div className="h-52 w-full flex flex-col items-center justify-center p-4">
              {isPlayingAudio ? (
                <div className="flex items-center gap-1.5 h-16">
                  {[60, 100, 40, 80, 50, 90, 70, 30].map((h, i) => (
                    <motion.div
                      key={i}
                      animate={{ height: ["20%", `${h}%`, "20%"] }}
                      transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.1 }}
                      className="w-2 bg-gradient-to-t from-indigo-500 to-purple-400 rounded-full"
                    />
                  ))}
                </div>
              ) : isListening ? (
                <div className="flex items-center gap-1.5 h-16">
                  {[...Array(9)].map((_, i) => (
                    <div
                      key={i}
                      className="w-2 bg-amber-400 rounded-full transition-all duration-75"
                      style={{ height: `${Math.max(15, audioLevel * (0.5 + Math.random() * 0.8))}%` }}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-500">
                  <Mic className="w-8 h-8" />
                  <span className="text-xs">Ready. Click below to speak.</span>
                </div>
              )}
            </div>
          )}

          {/* Floating State Badge */}
          <div className="absolute top-2.5 left-2.5 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/10 text-[10px] font-bold text-slate-200 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${
              assistantState === "speaking" ? "bg-indigo-400 animate-pulse" :
              assistantState === "listening" ? "bg-amber-400 animate-pulse" :
              assistantState === "thinking" ? "bg-purple-400 animate-spin" : "bg-emerald-400"
            }`} />
            <span>{livekitConnected && livekitState ? livekitState : assistantState.toUpperCase()}</span>
          </div>

          {livekitConnected && (
            <div className="absolute top-2.5 right-2.5 px-2.5 py-0.5 bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-bold rounded-full flex items-center gap-1 shadow-sm">
              <Radio className="w-3 h-3 animate-pulse text-red-400" /> LIVE
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between gap-2.5 pt-3">
          <button
            onClick={onToggleListening}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 ${
              isListening
                ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/20"
                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20"
            }`}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span>{isListening ? "Stop Listening" : "Speak to Assistant"}</span>
          </button>

          {/* Barge-in / Interruption Button for LiveKit Voice */}
          {livekitConnected && assistantState === "speaking" && onLiveKitInterrupt && (
            <button
              onClick={onLiveKitInterrupt}
              className="py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-xl transition-all shadow-lg active:scale-95 text-xs flex items-center gap-1"
              title="Interrupt AI Speech (Barge-in)"
            >
              <span>Interrupt</span>
            </button>
          )}

          {isPlayingAudio && !livekitConnected && (
            <button
              onClick={onStopAudio}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors active:scale-95"
              title="Stop Speech"
            >
              <Square className="w-4 h-4 fill-white" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
