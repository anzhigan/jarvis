import { useEffect, useRef, useState } from 'react';
import { Loader2, X, RotateCcw } from 'lucide-react';

interface Props {
  file: File;
  onCancel: () => void;
  onConfirm: (cropped: Blob) => void | Promise<void>;
}

/**
 * Interactive square-crop modal with a circular preview mask.
 * User drags the image to pan, uses slider to zoom. Output: 512×512 JPEG blob.
 */
export default function AvatarCropper({ file, onCancel, onConfirm }: Props) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const CROP_SIZE = 280;  // visual crop area in px

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => setImgSrc(e.target?.result as string);
    reader.readAsDataURL(file);
  }, [file]);

  // Once image loads, figure out initial scale + center it
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth, h = img.naturalHeight;
    setImgSize({ w, h });
    // Scale so that the smaller side fills the crop area
    const minScale = CROP_SIZE / Math.min(w, h);
    setScale(minScale);
    setPos({ x: (CROP_SIZE - w * minScale) / 2, y: (CROP_SIZE - h * minScale) / 2 });
  };

  // Clamp position so that image always covers the crop area
  const clamp = (x: number, y: number, s: number): { x: number; y: number } => {
    if (!imgSize) return { x, y };
    const displayW = imgSize.w * s;
    const displayH = imgSize.h * s;
    const minX = CROP_SIZE - displayW;
    const maxX = 0;
    const minY = CROP_SIZE - displayH;
    const maxY = 0;
    return {
      x: Math.min(maxX, Math.max(minX, x)),
      y: Math.min(maxY, Math.max(minY, y)),
    };
  };

  const startDrag = (clientX: number, clientY: number) => {
    dragging.current = true;
    dragStart.current = { x: clientX, y: clientY, posX: pos.x, posY: pos.y };
  };
  const moveDrag = (clientX: number, clientY: number) => {
    if (!dragging.current) return;
    const dx = clientX - dragStart.current.x;
    const dy = clientY - dragStart.current.y;
    setPos(clamp(dragStart.current.posX + dx, dragStart.current.posY + dy, scale));
  };
  const endDrag = () => { dragging.current = false; };

  const onScaleChange = (newScale: number) => {
    if (!imgSize) return;
    // Keep center point stable while zooming
    const centerX = CROP_SIZE / 2;
    const centerY = CROP_SIZE / 2;
    const imgX = (centerX - pos.x) / scale;
    const imgY = (centerY - pos.y) / scale;
    const newX = centerX - imgX * newScale;
    const newY = centerY - imgY * newScale;
    setPos(clamp(newX, newY, newScale));
    setScale(newScale);
  };

  const reset = () => {
    if (!imgSize) return;
    const minScale = CROP_SIZE / Math.min(imgSize.w, imgSize.h);
    setScale(minScale);
    setPos({ x: (CROP_SIZE - imgSize.w * minScale) / 2, y: (CROP_SIZE - imgSize.h * minScale) / 2 });
  };

  const minScale = imgSize ? CROP_SIZE / Math.min(imgSize.w, imgSize.h) : 1;
  const maxScale = minScale * 3;

  const confirm = async () => {
    if (!imgSrc || !imgSize) return;
    setSaving(true);
    try {
      // Create an offscreen canvas and draw the cropped region
      const OUTPUT_SIZE = 512;
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = rej;
        img.src = imgSrc;
      });

      // Source rect in original image coordinates
      const srcX = -pos.x / scale;
      const srcY = -pos.y / scale;
      const srcW = CROP_SIZE / scale;
      const srcH = CROP_SIZE / scale;

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      const blob: Blob = await new Promise((res, rej) => {
        canvas.toBlob((b) => { if (b) res(b); else rej(new Error('Canvas empty')); }, 'image/jpeg', 0.9);
      });

      await onConfirm(blob);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => !saving && onCancel()}
    >
      <div
        className="bg-card border border-border rounded-2xl p-5 max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">Crop avatar</h3>
          <button
            onClick={onCancel}
            disabled={saving}
            className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-secondary text-muted-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {/* Crop area */}
        <div className="flex justify-center mb-4">
          <div
            ref={containerRef}
            className="relative overflow-hidden rounded-lg bg-muted select-none"
            style={{ width: CROP_SIZE, height: CROP_SIZE, touchAction: 'none', cursor: dragging.current ? 'grabbing' : 'grab' }}
            onMouseDown={(e) => { e.preventDefault(); startDrag(e.clientX, e.clientY); }}
            onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onTouchStart={(e) => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); }}
            onTouchMove={(e) => moveDrag(e.touches[0].clientX, e.touches[0].clientY)}
            onTouchEnd={endDrag}
          >
            {imgSrc && (
              <img
                src={imgSrc}
                alt=""
                draggable={false}
                onLoad={onImageLoad}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  width: imgSize ? imgSize.w * scale : undefined,
                  height: imgSize ? imgSize.h * scale : undefined,
                  maxWidth: 'none',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              />
            )}

            {/* Circle mask overlay — SVG with inverse mask */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={CROP_SIZE}
              height={CROP_SIZE}
            >
              <defs>
                <mask id="hole">
                  <rect width={CROP_SIZE} height={CROP_SIZE} fill="white" />
                  <circle cx={CROP_SIZE / 2} cy={CROP_SIZE / 2} r={CROP_SIZE / 2} fill="black" />
                </mask>
              </defs>
              <rect width={CROP_SIZE} height={CROP_SIZE} fill="rgba(0,0,0,0.5)" mask="url(#hole)" />
              <circle
                cx={CROP_SIZE / 2}
                cy={CROP_SIZE / 2}
                r={CROP_SIZE / 2 - 1}
                fill="none"
                stroke="white"
                strokeWidth="2"
                opacity="0.9"
              />
            </svg>
          </div>
        </div>

        {/* Zoom */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground">Zoom</span>
            <button
              onClick={reset}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw size={11} />
              Reset
            </button>
          </div>
          <input
            type="range"
            min={minScale}
            max={maxScale}
            step={0.01}
            value={scale}
            onChange={(e) => onScaleChange(parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <p className="text-xs text-muted-foreground mb-4 text-center">
          Drag to move, use slider to zoom. Face should fit inside the circle.
        </p>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={saving}
            className="h-10 px-4 text-sm text-muted-foreground hover:text-foreground rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={saving || !imgSize}
            className="h-10 px-5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
