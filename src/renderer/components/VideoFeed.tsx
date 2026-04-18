import { Badge, Box, Stack, Text } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { DetectionResult, EffectConfig, FaceRegion } from '../../shared/types';
import { useFaceDetection } from '../hooks/useFaceDetection';
import { useWebGLPipeline } from '../hooks/useWebGLPipeline';

interface Props {
  effect: EffectConfig;
  enabled: boolean;
  mirrored: boolean;
  showDebug: boolean;
  deviceId: string | null;
}

export function VideoFeed({ effect, enabled, mirrored, showDebug, deviceId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);
  const [faceCount, setFaceCount] = useState(0);
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastFpsRef = useRef(performance.now());

  const { updateFaces, updateEffect } = useWebGLPipeline(canvasRef, videoRef);

  useEffect(() => {
    updateEffect(effect);
  }, [effect, updateEffect]);

  // Draw bounding boxes onto the 2D debug overlay canvas.
  const drawDebug = useCallback((faces: FaceRegion[]) => {
    const overlay = debugCanvasRef.current;
    const video = videoRef.current;
    if (!overlay || !video) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    overlay.width = w;
    overlay.height = h;

    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = Math.max(2, w / 400);
    ctx.font = `${Math.max(12, w / 60)}px monospace`;
    ctx.fillStyle = '#00ff00';

    for (const face of faces) {
      const x = face.x * w;
      const y = face.y * h;
      const fw = face.width * w;
      const fh = face.height * h;
      ctx.strokeRect(x, y, fw, fh);
      ctx.fillText(`${((fw / w) * 100).toFixed(0)}%w`, x + 4, y - 6);
    }
  }, []);

  const handleDetection = useCallback(
    (result: DetectionResult) => {
      setFaceCount(result.faces.length);
      updateFaces(enabled ? result.faces : []);

      if (showDebug) {
        drawDebug(result.faces);
      } else {
        // Clear any leftover debug drawing when toggled off
        const overlay = debugCanvasRef.current;
        if (overlay) overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
      }

      frameCountRef.current++;
      const now = performance.now();
      if (now - lastFpsRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsRef.current = now;
      }
    },
    [enabled, showDebug, updateFaces, drawDebug],
  );

  const { state: detectorState } = useFaceDetection(videoRef, handleDetection, true);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error('Camera error:', err);
      }
    }

    startCamera();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [deviceId]);

  const videoTransform = mirrored ? 'scaleX(-1)' : undefined;

  return (
    <Box style={{ position: 'relative', width: '100%', background: '#0a0a0a', borderRadius: 8, overflow: 'hidden' }}>
      <video ref={videoRef} style={{ display: 'none' }} muted playsInline />

      {/* WebGL output */}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', aspectRatio: '16/9', transform: videoTransform }}
      />

      {/* Debug bounding-box overlay — sits directly on top, same transform as the GL canvas */}
      <canvas
        ref={debugCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          transform: videoTransform,
        }}
      />

      {/* HUD */}
      <Stack gap={4} style={{ position: 'absolute', top: 10, right: 10, alignItems: 'flex-end' }}>
        <Badge
          color={
            detectorState === 'ready' ? 'green'
            : detectorState === 'loading' ?
              'yellow'
            : 'red'
          }
          size="sm"
        >
          {detectorState === 'ready' ? `${fps} fps` : detectorState}
        </Badge>
        {faceCount > 0 && (
          <Badge color="blue" size="sm">
            {faceCount} face{faceCount !== 1 ? 's' : ''}
          </Badge>
        )}
        {enabled && effect.type !== 'none' && (
          <Badge color="violet" size="sm">
            {effect.type}
          </Badge>
        )}
      </Stack>

      {detectorState === 'loading' && (
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
          }}
        >
          <Text c="dimmed" size="sm">
            Loading face detector…
          </Text>
        </Box>
      )}
    </Box>
  );
}
