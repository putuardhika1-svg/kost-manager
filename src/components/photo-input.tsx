"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type Props = {
  name: string;
  required?: boolean;
  allowPdf?: boolean;
  cameraOnly?: boolean;
  facingMode?: "environment" | "user";
  hint?: string;
  watermark?: boolean;
};

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const label = new Date().toLocaleString("id-ID");
  const fontSize = Math.max(14, Math.round(width * 0.025));
  ctx.font = `${fontSize}px sans-serif`;
  const padding = Math.round(fontSize * 0.4);
  const textWidth = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, height - fontSize - padding * 2, textWidth + padding * 2, fontSize + padding * 2);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(label, padding, height - fontSize / 2 - padding);
}

export function PhotoInput({
  name,
  required = false,
  allowPdf = false,
  cameraOnly = false,
  facingMode = "environment",
  hint,
  watermark = true,
}: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const accept = allowPdf
    ? "image/jpeg,image/png,image/webp,application/pdf"
    : "image/jpeg,image/png,image/webp";

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!cameraOn) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => setError("Kamera gagal menampilkan pratinjau."));
  }, [cameraOn]);

  function showPreview(file: File | null) {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current =
      file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    setPreview(objectUrlRef.current);
    setFileName(file?.name ?? null);
  }

  function applyFile(file: File | null) {
    const input = fileRef.current;
    if (!input) return;
    if (file) {
      try {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
      } catch {
        setError("Perangkat tidak mendukung kamera ini.");
        return;
      }
    } else {
      input.value = "";
    }
    showPreview(file);
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    showPreview(event.target.files?.[0] ?? null);
  }

  async function openCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        cameraOnly
          ? "Perangkat ini tidak mendukung kamera."
          : "Perangkat ini tidak mendukung kamera. Gunakan tombol Pilih file.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      setError(
        cameraOnly
          ? "Kamera tidak dapat diakses. Izinkan akses kamera lalu coba lagi."
          : "Kamera tidak dapat diakses. Gunakan tombol Pilih file.",
      );
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function snap() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (watermark) drawWatermark(ctx, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) {
      setError("Gagal mengambil foto, coba lagi.");
      return;
    }
    applyFile(new File([blob], `${name}-${Date.now()}.jpg`, { type: "image/jpeg" }));
    closeCamera();
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        ref={fileRef}
        name={name}
        type="file"
        accept={accept}
        required={required}
        onChange={onPick}
        onClick={cameraOnly ? (event) => event.preventDefault() : undefined}
        tabIndex={cameraOnly ? -1 : undefined}
        style={visuallyHidden}
      />

      {cameraOn ? (
        <div style={{ display: "grid", gap: 8 }}>
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            style={{ width: "100%", maxHeight: 360, background: "#000", borderRadius: 8 }}
          />
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={snap}>
              Ambil foto
            </button>
            <button type="button" className="btn" onClick={closeCamera}>
              Batal
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {preview ? (
            <img
              src={preview}
              alt="Pratinjau"
              style={{ width: "100%", maxHeight: 360, objectFit: "contain", borderRadius: 8 }}
            />
          ) : fileName ? (
            <span className="small muted">Berkas siap dikirim.</span>
          ) : null}
          <div className="form-actions" style={{ flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" onClick={openCamera}>
              {preview ? "Ambil ulang" : "Ambil foto"}
            </button>
            {cameraOnly ? null : (
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                Pilih file
              </button>
            )}
            {fileName ? (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => applyFile(null)}
              >
                Hapus
              </button>
            ) : null}
            {hint ? <span className="small muted">{hint}</span> : null}
          </div>
        </div>
      )}

      {error ? <p className="small muted">{error}</p> : null}
    </div>
  );
}
