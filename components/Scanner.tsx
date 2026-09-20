import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

declare const jsQR: any;

interface ScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

const Scanner: React.FC<ScannerProps> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number;
    let mounted = true;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        
        if (mounted && videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          // Muted is essential for mobile browsers to allow autoplay without user interaction context
          videoRef.current.muted = true;
          await videoRef.current.play();
          setLoading(false);
          requestAnimationFrame(tick);
        } else {
            if(stream) stream.getTracks().forEach(t => t.stop());
        }
      } catch (err) {
        console.error("Camera error", err);
        if(mounted) setLoading(false);
      }
    };

    const tick = () => {
      if (!mounted) return;
      
      if (videoRef.current && canvasRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        
        if (ctx) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            });
    
            if (code) {
              // Cleanup immediately
              if (video.srcObject) {
                  const s = video.srcObject as MediaStream;
                  s.getTracks().forEach(track => track.stop());
              }
              onScan(code.data);
              return;
            }
        }
      }
      animationFrameId = requestAnimationFrame(tick);
    };

    startCamera();

    return () => {
      mounted = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      <button onClick={onClose} className="absolute top-6 right-6 p-3 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all z-50">
        <X size={24} />
      </button>
      
      <div className="relative w-full h-full max-w-lg max-h-[80vh] flex flex-col items-center justify-center">
          <div className="text-white/80 mb-8 text-center px-4 font-light">
              <h2 className="text-2xl mb-2">Scan Code</h2>
              <p className="text-sm opacity-60">Point camera at the viewer's QR Code</p>
          </div>
          
          <div className="relative w-72 h-72 rounded-3xl overflow-hidden border border-white/20 shadow-2xl">
            {loading && <div className="absolute inset-0 flex items-center justify-center text-white/50 bg-zinc-900">Starting Camera...</div>}
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Scanning Overlay UI */}
            <div className="absolute inset-0 border-[30px] border-black/50 pointer-events-none"></div>
            <div className="absolute inset-0 border-2 border-white/30 rounded-3xl opacity-50"></div>
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse-slow"></div>
          </div>
      </div>
    </div>
  );
};

export default Scanner;