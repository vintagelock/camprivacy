import { Badge, Box, Stack, Text } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { DetectionResult, EffectConfig } from '../../shared/types';
import { useFaceDetection } from '../hooks/useFaceDetection';
import { useWebGLPipeline } from '../hooks/useWebGLPipeline';

interface Props {
  effect: EffectConfig;
  enabled: boolean;
  deviceId: string | null;
}

export function VideoFeed({ effect, enabled, deviceId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [faceCount, setFaceCount] = useState(0);
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastFpsRef = useRef(performance.now());

  const { updateFaces, updateEffect } = useWebGLPipeline(canvasRef, videoRef);

  // Keep effect config in sync with pipeline
  useEffect(() => {
    updateEffect(effect);
  }, [effect, updateEffect]);

  const handleDetection = useCallback(
    (result: DetectionResult) => {
      setFaceCount(result.faces.length);
      if (enabled) {
        updateFaces(result.faces);
      } else {
        updateFaces([]);
      }
      // FPS counter
      frameCountRef.current++;
      const now = performance.now();
      if (now - lastFpsRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsRef.current = now;
      }
    },
    [enabled, updateFaces],
  );

  const { state: detectorState } = useFaceDetection(videoRef, handleDetection, true);

  // Start/stop camera
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
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [deviceId]);

  return (
    <Box style={{ position: 'relative', width: '100%', background: '#0a0a0a', borderRadius: 8, overflow: 'hidden' }}>
      {/* Hidden video source */}
      <video ref={videoRef} style={{ display: 'none' }} muted playsInline />

      {/* WebGL output */}
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', aspectRatio: '16/9' }} />

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
