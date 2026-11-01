/**
 * A scan field: paste, type, or use the camera — and never pretend a scan happened.
 *
 * The camera path uses the browser's own BarcodeDetector. Where that does not exist (Firefox,
 * older Safari, any non-secure context) the button is replaced by an honest sentence rather than
 * a dead control. A USB scanner needs nothing from this component: it types into the field and
 * the wedge buffer in `core/scanner.ts` recognises the rhythm.
 */

import { useEffect, useRef, useState } from 'react';
import { cameraScannerAvailable, classifyScan, createDetector } from '../core/scanner';

export interface ScanFieldProps {
  readonly label: string;
  readonly onScan: (text: string) => void;
  readonly placeholder?: string;
  readonly id?: string;
}

export function ScanField({ label, onScan, placeholder = 'paste a code, or scan it', id }: ScanFieldProps) {
  const fieldId = id ?? `scan-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const [text, setText] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);

  const canScan = cameraScannerAvailable();

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    const kind = classifyScan(trimmed);
    if (kind.kind === 'unknown') {
      setStatus('that code is not something slip can use');
      return;
    }
    setStatus(kind.description);
    onScan(trimmed);
  }

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    let timer: number | null = null;

    void (async () => {
      const detector = createDetector();
      if (!detector) {
        setStatus('this browser has no built-in barcode reader — paste the code instead');
        setCameraOpen(false);
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play();
        }
        const tick = async () => {
          if (cancelled || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            const first = found[0];
            if (first?.rawValue) {
              setText(first.rawValue);
              submit(first.rawValue);
              setCameraOpen(false);
              return;
            }
          } catch {
            // A dropped frame is normal; keep looking.
          }
          timer = window.setTimeout(() => void tick(), 350);
        };
        void tick();
      } catch (e) {
        setStatus(e instanceof Error ? `camera refused: ${e.message}` : 'the camera could not start');
        setCameraOpen(false);
      }
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [cameraOpen]);

  return (
    <div className="mt-3">
      <label className="block" htmlFor={fieldId}>
        <span className="eyebrow">{label}</span>
        <div className="mt-1 flex gap-2">
          <input
            id={fieldId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit(text);
            }}
            placeholder={placeholder}
            spellCheck={false}
            className="w-full rounded-lg border border-line bg-bg p-2 font-mono text-[11px] outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => submit(text)}
            className="shrink-0 rounded-lg border border-line px-3 text-xs text-muted hover:text-ink"
          >
            use
          </button>
          {canScan && !cameraOpen && (
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              className="shrink-0 rounded-lg border border-accent px-3 text-xs text-accent"
            >
              camera
            </button>
          )}
          {cameraOpen && (
            <button
              type="button"
              onClick={() => setCameraOpen(false)}
              className="shrink-0 rounded-lg border border-line px-3 text-xs text-muted"
            >
              stop
            </button>
          )}
        </div>
      </label>
      {cameraOpen && (
        <div className="mt-2 overflow-hidden rounded-lg border border-line">
          <video ref={video} muted playsInline className="h-56 w-full bg-black object-cover" />
          <p className="p-1 text-[11px] text-muted">Point at the QR. Nothing is recorded or uploaded.</p>
        </div>
      )}
      {status && <p className="mt-1 text-[11px] text-muted">{status}</p>}
    </div>
  );
}

export default ScanField;
