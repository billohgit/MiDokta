"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";

/** Longest side of a stored image. Larger adds upload time without helping anyone read it. */
const MAX_SIDE = 1568;
const JPEG_QUALITY = 0.85;

type Props = {
  label: string;
  hint: string;
  /** "face" frames a selfie with the front camera; "card" frames a document with the rear camera. */
  mode: "face" | "card";
  value: File | null;
  onChange: (file: File | null) => void;
};

/** Draws a source onto a canvas no larger than MAX_SIDE and encodes it as JPEG. */
async function toJpeg(source: CanvasImageSource, width: number, height: number, name: string, mirror = false) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d")!;
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("encode failed");
  return new File([blob], name, { type: "image/jpeg" });
}

async function shrinkUpload(file: File, name: string) {
  const bitmap = await createImageBitmap(file);
  try {
    return await toJpeg(bitmap, bitmap.width, bitmap.height, name);
  } finally {
    bitmap.close();
  }
}

export default function ImageCapture({ label, hint, mode, value, onChange }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const fileName = `${mode === "face" ? "photo" : "id-card"}.jpg`;

  useEffect(() => {
    if (!value) return setPreview(null);
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      onChange(await shrinkUpload(file, fileName));
      setError(null);
    } catch {
      setError("That file couldn't be read as an image. Try a JPEG or PNG.");
    }
  };

  const openCamera = () => {
    setError(null);
    // Without camera access in the page, fall back to the phone's own camera app.
    if (!navigator.mediaDevices?.getUserMedia) captureRef.current?.click();
    else setCameraOpen(true);
  };

  return (
    <div className="field">
      <span>{label}</span>
      <div className={`capture capture-${mode}${preview ? " has-image" : ""}`}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL
          <img src={preview} alt={`${label} preview`} />
        ) : (
          <div className="capture-empty">
            <i className={`fa-solid ${mode === "face" ? "fa-circle-user" : "fa-id-card"}`} />
            <small>{hint}</small>
          </div>
        )}
      </div>
      <div className="capture-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={openCamera}>
          <i className="fa-solid fa-camera btn-icon" /> {preview ? "Retake" : mode === "card" ? "Scan with camera" : "Take photo"}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => uploadRef.current?.click()}>
          <i className="fa-solid fa-upload btn-icon" /> Upload
        </button>
        {preview && (
          <button type="button" className="btn btn-sm capture-remove" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </div>
      {error && <small className="form-error">{error}</small>}
      <input ref={uploadRef} type="file" accept="image/*" hidden onChange={onFile} />
      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture={mode === "face" ? "user" : "environment"}
        hidden
        onChange={onFile}
      />
      {cameraOpen && (
        <CameraModal
          title={mode === "face" ? "Take your photo" : "Scan your ID card"}
          mode={mode}
          fileName={fileName}
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => {
            onChange(file);
            setCameraOpen(false);
          }}
          onUnavailable={() => {
            setCameraOpen(false);
            setError("The camera isn't available. Allow camera access in your browser, or use Upload.");
          }}
        />
      )}
    </div>
  );
}

type CameraProps = {
  title: string;
  mode: Props["mode"];
  fileName: string;
  onClose: () => void;
  onCapture: (file: File) => void;
  onUnavailable: () => void;
};

function CameraModal({ title, mode, fileName, onClose, onCapture, onUnavailable }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const mirror = mode === "face";
  // Kept in a ref so a new callback identity doesn't restart the camera.
  const unavailable = useRef(onUnavailable);
  useEffect(() => {
    unavailable.current = onUnavailable;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: mode === "face" ? "user" : "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => !cancelled && unavailable.current());
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [mode]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    onCapture(await toJpeg(video, video.videoWidth, video.videoHeight, fileName, mirror));
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div className={`camera camera-${mode}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setReady(true)}
          style={mirror ? { transform: "scaleX(-1)" } : undefined}
        />
        <div className="camera-guide" aria-hidden="true" />
      </div>
      <p className="camera-tip">
        {mode === "face"
          ? "Face the camera in good light, without glasses or a hat."
          : "Fit the whole card inside the frame, flat and in good light, with no glare on the text."}
      </p>
      <div className="modal-actions">
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={capture} disabled={!ready}>
          <i className="fa-solid fa-camera btn-icon" /> Capture
        </button>
      </div>
    </Modal>
  );
}
