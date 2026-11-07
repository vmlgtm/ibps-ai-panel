'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CameraOff, MicOff } from 'lucide-react';

interface WebcamMirrorProps {
  candidateName?: string;
  isInterviewActive?: boolean;
  isMicMuted?: boolean;
  candidateAudioLevel?: number;
  isCameraOn?: boolean;
  onToggleCamera?: () => void;
  onSnapshotsChange?: (snapshots: string[]) => void;
  className?: string;
}

export function WebcamMirror({
  candidateName = 'Candidate',
  isInterviewActive = false,
  isMicMuted = false,
  candidateAudioLevel = 0,
  isCameraOn: externalCameraOn,
  onToggleCamera,
  onSnapshotsChange,
  className,
}: WebcamMirrorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [internalCameraOn, setInternalCameraOn] = useState<boolean>(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [snapshots, setSnapshots] = useState<string[]>([]);

  const isCameraActive = externalCameraOn !== undefined ? externalCameraOn : internalCameraOn;

  const captureSnapshot = useCallback(() => {
    if (!videoRef.current || !isCameraActive) return;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw current video frame scaled to 320x240 for efficient bandwidth & token usage
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

      setSnapshots((prev) => {
        const next = [...prev, dataUrl].slice(-3); // Keep up to 3 most recent snapshots
        onSnapshotsChange?.(next);
        return next;
      });
    } catch (err) {
      console.warn('Could not capture webcam snapshot:', err);
    }
  }, [isCameraActive, onSnapshotsChange]);

  // Handle webcam stream initialization and teardown
  useEffect(() => {
    let active = true;

    async function initWebcam() {
      if (!isCameraActive) {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setHasPermission(true);
      } catch (err) {
        console.warn('Webcam permission denied or unavailable:', err);
        if (active) {
          setHasPermission(false);
        }
      }
    }

    initWebcam();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isCameraActive]);

  // Periodic capture when interview is active (every 40s)
  useEffect(() => {
    if (!isInterviewActive || !isCameraActive || hasPermission !== true) return;

    // Initial capture at 5 seconds
    const initialTimer = setTimeout(() => {
      captureSnapshot();
    }, 5000);

    // Periodic capture every 40 seconds
    const interval = setInterval(() => {
      captureSnapshot();
    }, 40000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [isInterviewActive, isCameraActive, hasPermission, captureSnapshot]);

  const handleToggle = () => {
    if (onToggleCamera) {
      onToggleCamera();
    } else {
      setInternalCameraOn((prev) => !prev);
    }
  };

  const candidateInitials = candidateName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'ME';

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-zinc-900 border border-white/15 shadow-xl z-20 group ${
        className || 'w-48 md:w-64 aspect-video'
      }`}
    >
      {/* Live Video Feed or Monochrome Initials Placeholder */}
      {isCameraActive && hasPermission !== false ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover transform -scale-x-100"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-400 select-none">
          <div className="w-12 h-12 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-sm font-medium text-zinc-200">
            {candidateInitials}
          </div>
          <span className="text-[10px] text-zinc-500 mt-1">
            {hasPermission === false ? 'Camera blocked' : 'Camera off'}
          </span>
        </div>
      )}

      {/* Top-Right: Snapshot & Camera Controls (visible on hover) */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
        {snapshots.length > 0 && (
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] font-mono text-zinc-300 border border-white/10"
            title={`${snapshots.length} posture snapshots recorded`}
          >
            <Camera className="w-3 h-3 text-zinc-400" strokeWidth={1.5} />
            <span>{snapshots.length}</span>
          </div>
        )}
        <button
          type="button"
          onClick={handleToggle}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-black/60 hover:bg-black/80 backdrop-blur-md text-zinc-300 hover:text-white border border-white/10"
          title={isCameraActive ? 'Turn off camera' : 'Turn on camera'}
        >
          {isCameraActive ? (
            <Camera className="w-3.5 h-3.5" strokeWidth={1.5} />
          ) : (
            <CameraOff className="w-3.5 h-3.5 text-red-400" strokeWidth={1.5} />
          )}
        </button>
      </div>

      {/* Bottom-Left: Google Meet PiP Nameplate */}
      <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-1.5 max-w-[calc(100%-16px)] z-10">
        {/* Mic Status Indicator */}
        {isMicMuted ? (
          <MicOff className="w-3 h-3 text-red-400 shrink-0" strokeWidth={1.5} />
        ) : (
          <span
            className="w-1.5 h-1.5 rounded-full bg-white shrink-0 transition-transform duration-75"
            style={{
              transform: `scale(${1 + Math.min(1.2, candidateAudioLevel * 2)})`,
              opacity: candidateAudioLevel > 0.05 ? 1 : 0.4,
            }}
          />
        )}
        <span className="text-xs font-medium text-zinc-100 truncate">
          You · {candidateName}
        </span>
      </div>
    </div>
  );
}
