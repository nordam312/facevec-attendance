'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button } from './ui';

type Mode = 'upload' | 'camera';

/**
 * Captures a face image either from a file upload or the webcam (getUserMedia →
 * canvas → JPEG blob) and hands the resulting Blob to `onCapture`.
 */
export function CaptureInput({
  onCapture,
  busy = false,
}: {
  onCapture: (image: Blob) => void;
  busy?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('upload');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (mode !== 'camera') {
      stopStream();
      return;
    }
    let active = true;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user' } })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setError(null);
      })
      .catch(() => setError('Could not access the camera — grant permission or use file upload.'));
    return () => {
      active = false;
      stopStream();
    };
  }, [mode, stopStream]);

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
      onCapture(file);
    }
  };

  const snapshot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          setPreview(URL.createObjectURL(blob));
          onCapture(blob);
        }
      },
      'image/jpeg',
      0.9,
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button variant={mode === 'upload' ? 'primary' : 'secondary'} onClick={() => setMode('upload')} type="button">
          Upload
        </Button>
        <Button variant={mode === 'camera' ? 'primary' : 'secondary'} onClick={() => setMode('camera')} type="button">
          Webcam
        </Button>
      </div>

      {error && <Alert tone="amber">{error}</Alert>}

      {mode === 'upload' ? (
        <input
          type="file"
          accept="image/*"
          onChange={handleFile}
          disabled={busy}
          className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-500 dark:text-neutral-300"
        />
      ) : (
        <div className="space-y-2">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="aspect-video w-full rounded-lg bg-neutral-900 object-cover"
          />
          <Button onClick={snapshot} disabled={busy} type="button">
            Capture frame
          </Button>
        </div>
      )}

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="captured preview" className="h-32 w-32 rounded-lg border border-neutral-200 object-cover dark:border-neutral-800" />
      )}
    </div>
  );
}
