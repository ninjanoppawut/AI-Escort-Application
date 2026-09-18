"use client";

import { Camera, Images, Info } from "lucide-react";
import { useId, useRef, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { IMAGE_INPUT_ACCEPT } from "@/lib/image-processing";

import { MEDIA_COPY } from "./media-copy";

export type CaptureSource = "camera" | "gallery";

/**
 * The 72 px camera button and the gallery picker. Both open hidden file
 * inputs from a real button tap (required on iOS). When adding is not
 * possible both stay visible, disabled, with the reason underneath.
 */
export function CaptureControls({
  disabledReason,
  maxFiles,
  onFiles,
}: {
  /** Null when images can be added. */
  disabledReason: string | null;
  /** Remaining slots; the gallery allows multiple picks only when > 1. */
  maxFiles: number;
  onFiles: (files: File[], source: CaptureSource) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const reasonId = useId();
  const disabled = disabledReason !== null;

  const handleChange =
    (source: CaptureSource) => (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const files = Array.from(input.files ?? []);
      // Allow picking the same file again after a cancel or failure.
      input.value = "";
      if (files.length > 0) onFiles(files, source);
    };

  return (
    <div className="grid gap-2" data-capture-controls="">
      <Button
        aria-describedby={disabled ? reasonId : undefined}
        className="h-[72px] w-full rounded-2xl text-base disabled:opacity-70"
        data-capture="camera"
        disabled={disabled}
        onClick={() => cameraRef.current?.click()}
      >
        <Camera aria-hidden="true" className="size-6" />
        {MEDIA_COPY.camera}
      </Button>
      <Button
        aria-describedby={disabled ? reasonId : undefined}
        className="h-12 w-full disabled:opacity-70"
        data-capture="gallery"
        disabled={disabled}
        onClick={() => galleryRef.current?.click()}
        variant="outline"
      >
        <Images aria-hidden="true" className="size-5" />
        {MEDIA_COPY.gallery}
      </Button>
      {disabledReason ? (
        <p
          className="flex items-start gap-2 text-sm leading-6"
          data-disabled-reason=""
          id={reasonId}
        >
          <Info aria-hidden="true" className="mt-1 size-4 shrink-0" />
          {disabledReason}
        </p>
      ) : null}
      <input
        accept={IMAGE_INPUT_ACCEPT}
        aria-hidden="true"
        capture="environment"
        className="sr-only"
        data-media-input="camera"
        disabled={disabled}
        onChange={handleChange("camera")}
        ref={cameraRef}
        tabIndex={-1}
        type="file"
      />
      <input
        accept={IMAGE_INPUT_ACCEPT}
        aria-hidden="true"
        className="sr-only"
        data-media-input="gallery"
        disabled={disabled}
        multiple={maxFiles > 1}
        onChange={handleChange("gallery")}
        ref={galleryRef}
        tabIndex={-1}
        type="file"
      />
    </div>
  );
}
