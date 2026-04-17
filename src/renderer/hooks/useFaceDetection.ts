import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { DetectionResult } from '../../shared/types';

export type DetectorState = 'idle' | 'loading' | 'ready' | 'error';

export function useFaceDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onResult: (result: DetectionResult) => void,
  enabled: boolean,
) {
  const detectorRef = useRef<FaceDetector | null>(null);
  const [state, setState] = useState<DetectorState>('idle');
  const lastTimestampRef = useRef(0);

  // Keep a ref to the latest callback and enabled flag so the rAF loop
  // never needs to restart when either changes.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    setState('loading');
    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
        );
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        });
        if (cancelled) {
          detector.close();
          return;
        }
        detectorRef.current = detector;
        setState('ready');
      } catch (err) {
        if (!cancelled) {
          console.error('FaceDetector init failed:', err);
          setState('error');
        }
      }
    }

    init();
    return () => {
      cancelled = true;
      detectorRef.current?.close();
      detectorRef.current = null;
    };
  }, []);

  const detect = useCallback(() => {
    const detector = detectorRef.current;
    const video = videoRef.current;
    if (!detector || !video || video.readyState < 2 || !enabledRef.current) return;

    const now = performance.now();
    if (now - lastTimestampRef.current < 66) return; // cap at ~15 detections/sec
    lastTimestampRef.current = now;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    const result = detector.detectForVideo(video, now);
    const faces = (result.detections ?? []).map((d) => {
      const bb = d.boundingBox!;
      return {
        x: bb.originX / w,
        y: bb.originY / h,
        width: bb.width / w,
        height: bb.height / h,
      };
    });
    onResultRef.current({ faces, frameMs: now });
  }, [videoRef]);

  useEffect(() => {
    let animId = 0;
    function loop() {
      detect();
      animId = requestAnimationFrame(loop);
    }
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [detect]);

  return { state };
}
