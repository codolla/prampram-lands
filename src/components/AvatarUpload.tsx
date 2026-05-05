import { useCallback, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

interface AvatarUploadProps {
  /** Current avatar URL (public). */
  value: string | null | undefined;
  /** Called with the new public URL after upload, or null after removal. */
  onChange: (url: string | null) => void;
  /** Storage folder inside the `avatars` bucket. e.g. "landowners", "users". */
  folder: string;
  /** Stable id used to namespace the file path (landowner id, user id, etc.). */
  entityId?: string | null;
  /** Initials shown in the fallback when there is no image. */
  fallback?: string;
  /** Avatar size in px. Defaults to 80. */
  size?: number;
  disabled?: boolean;
  /** Output square size in pixels after cropping. Defaults to 512. */
  outputSize?: number;
}

const MAX_BYTES = 5 * 1024 * 1024;

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

async function cropImageToBlob(src: string, area: Area, outputSize: number): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, outputSize, outputSize);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))),
      "image/jpeg",
      0.9,
    );
  });
}

export function AvatarUpload({
  value,
  onChange,
  folder,
  entityId,
  fallback,
  size = 80,
  disabled,
  outputSize = 512,
}: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<"idle" | "cropping" | "uploading" | "done">("idle");
  const [editorSrc, setEditorSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedArea(areaPixels);
  }, []);

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be smaller than 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEditorSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedArea(null);
    };
    reader.readAsDataURL(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function uploadBlob(blob: Blob) {
    setUploading(true);
    setStage("uploading");
    setProgress(40);
    try {
      const id = entityId ?? "new";
      const path = `${folder}/${id}/${Date.now()}.jpg`;
      setProgress(60);
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      setProgress(85);
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      onChange(data.publicUrl);
      setProgress(100);
      setStage("done");
      toast.success("Photo uploaded");
      setEditorSrc(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      setStage("idle");
      setProgress(0);
    } finally {
      setUploading(false);
      setTimeout(() => {
        setStage("idle");
        setProgress(0);
      }, 600);
    }
  }

  async function handleConfirmCrop() {
    if (!editorSrc || !croppedArea) return;
    try {
      setStage("cropping");
      setProgress(15);
      const blob = await cropImageToBlob(editorSrc, croppedArea, outputSize);
      setProgress(30);
      await uploadBlob(blob);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Crop failed");
      setStage("idle");
      setProgress(0);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar style={{ width: size, height: size }}>
        {value ? <AvatarImage src={value} alt="Profile photo" /> : null}
        <AvatarFallback>{(fallback ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {value ? "Change photo" : "Upload photo"}
          </Button>
          {value && !uploading && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange(null)}
              disabled={disabled}
            >
              <X className="mr-1 h-4 w-4" /> Remove
            </Button>
          )}
        </div>
        {uploading ? (
          <div className="w-56 space-y-1">
            <Progress value={progress} className="h-1.5" />
            <p className="text-xs text-muted-foreground">
              {stage === "cropping" ? "Processing image…" : "Uploading photo…"}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            PNG or JPG, up to 5MB. You can crop and zoom before saving.
          </p>
        )}
      </div>

      <Dialog
        open={!!editorSrc}
        onOpenChange={(o) => {
          if (!o && !uploading) setEditorSrc(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Crop your photo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative h-72 w-full overflow-hidden rounded-md bg-muted">
              {editorSrc && (
                <Cropper
                  image={editorSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Zoom</Label>
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.05}
                onValueChange={(v) => setZoom(v[0])}
                disabled={uploading}
              />
            </div>
            {uploading && (
              <div className="space-y-1">
                <Progress value={progress} className="h-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {stage === "cropping"
                      ? "Processing image…"
                      : stage === "uploading"
                        ? "Uploading to storage…"
                        : "Done"}
                  </span>
                  <span>{Math.round(progress)}%</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditorSrc(null)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirmCrop} disabled={uploading || !croppedArea}>
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Save photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
