import React, { useEffect, useRef } from 'react';

interface MotionDetectorProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  onMotion: () => void;
  active: boolean;
}

const MotionDetector: React.FC<MotionDetectorProps> = ({ videoRef, onMotion, active }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastImageDataRef = useRef<ImageData | null>(null);

  useEffect(() => {
    if (!active || !videoRef.current) return;

    let animationFrameId: number;
    const canvas = canvasRef.current;
    const video = videoRef.current;

    if (!canvas) return;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;

    // Detection settings
    const threshold = 30; // Pixel difference threshold (0-255)
    const motionPixelThreshold = 1000; // How many pixels need to change to trigger motion
    const interval = 500; // Check every 500ms
    let lastCheck = 0;

    const checkMotion = (timestamp: number) => {
      if (timestamp - lastCheck > interval && video.readyState === 4) {
        lastCheck = timestamp;

        // Set canvas dimensions to match video (scaled down for performance)
        const width = 320; 
        const height = 240;
        canvas.width = width;
        canvas.height = height;

        context.drawImage(video, 0, 0, width, height);
        const imageData = context.getImageData(0, 0, width, height);
        const data = imageData.data;

        if (lastImageDataRef.current) {
          const lastData = lastImageDataRef.current.data;
          let diffCount = 0;

          // Compare pixels (skip 4 bytes at a time: R, G, B, A)
          for (let i = 0; i < data.length; i += 4 * 4) { // Check every 4th pixel for speed
            const rDiff = Math.abs(data[i] - lastData[i]);
            const gDiff = Math.abs(data[i + 1] - lastData[i + 1]);
            const bDiff = Math.abs(data[i + 2] - lastData[i + 2]);

            if (rDiff + gDiff + bDiff > threshold * 3) {
              diffCount++;
            }
          }

          if (diffCount > (motionPixelThreshold / 4)) {
             onMotion();
          }
        }

        lastImageDataRef.current = imageData;
      }
      animationFrameId = requestAnimationFrame(checkMotion);
    };

    animationFrameId = requestAnimationFrame(checkMotion);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [active, videoRef, onMotion]);

  return <canvas ref={canvasRef} className="hidden" />;
};

export default MotionDetector;