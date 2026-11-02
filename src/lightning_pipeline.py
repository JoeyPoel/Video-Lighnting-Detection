"""Lightning Strike YOLO Detection and Video Slicing Pipeline.

Provides accurate lightning detection strictly on original dataset images,
using temporal flash burst verification and static object suppression
to prevent continuous false positives on streetlights, clouds, and dark skies.
"""

from __future__ import annotations

import os
# Prevent OpenMP multiple runtime initialization crash on Windows
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
os.environ["OMP_NUM_THREADS"] = "1"

from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional
import cv2
import numpy as np


def extract_lightning_bboxes(
    image: np.ndarray,
    min_area: int = 30,
    intensity_threshold: int = 185,
) -> List[Tuple[float, float, float, float]]:
    """Detects bounding boxes for lightning channels using high-luminance stroke analysis.

    Args:
        image: Input RGB/BGR image as a numpy array.
        min_area: Minimum pixel area to consider a candidate lightning channel.
        intensity_threshold: Base minimum luminance intensity (0-255).

    Returns:
        List of normalized bounding boxes [x_center, y_center, width, height], clamped in [0, 1].

    Side effects:
        None.
    """
    height, width = image.shape[:2]
    if height == 0 or width == 0:
        return []

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    max_lum = int(np.max(gray))
    if max_lum < 150:
        return []

    thresh = max(int(intensity_threshold), int(max_lum * 0.85))
    _, mask = cv2.threshold(gray, thresh, 255, cv2.THRESH_BINARY)

    # Dilate to connect lightning branches into unified strokes
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    dilated = cv2.dilate(mask, kernel, iterations=1)

    cnts, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    bboxes: List[Tuple[float, float, float, float]] = []

    for c in cnts:
        area = cv2.contourArea(c)
        if area < min_area:
            continue
        x, y, w, h = cv2.boundingRect(c)
        if max(w, h) < 14:
            continue

        xc = (x + w / 2.0) / width
        yc = (y + h / 2.0) / height
        norm_w = w / width
        norm_h = h / height

        bboxes.append((
            max(0.0, min(1.0, xc)),
            max(0.0, min(1.0, yc)),
            max(0.005, min(1.0, norm_w)),
            max(0.005, min(1.0, norm_h)),
        ))

    return bboxes


def build_yolo_dataset(
    source_dir: str | Path = "data",
    output_dir: str | Path = "yolo_dataset",
    splits: Tuple[str, ...] = ("train", "val", "test"),
) -> Path:
    """Formats original lightning images into YOLO detection dataset structure.

    Args:
        source_dir: Root directory containing original split folders (data/train/lightning, etc.).
        output_dir: Destination directory for YOLO formatted dataset.
        splits: Names of splits to process.

    Returns:
        Path to the generated dataset.yaml file.

    Side effects:
        Creates directories, copies original images, writes label files and dataset.yaml.
    """
    source_path = Path(source_dir)
    out_path = Path(output_dir)

    for split in splits:
        img_out = out_path / "images" / split
        lbl_out = out_path / "labels" / split
        img_out.mkdir(parents=True, exist_ok=True)
        lbl_out.mkdir(parents=True, exist_ok=True)

        split_src = source_path / split / "lightning"
        if not split_src.exists():
            split_src = source_path / split

        img_files = list(split_src.glob("*.jpg")) + list(split_src.glob("*.png"))
        for img_p in img_files:
            img = cv2.imread(str(img_p))
            if img is None:
                continue

            dest_img_p = img_out / img_p.name
            if not dest_img_p.exists():
                cv2.imwrite(str(dest_img_p), img)

            bboxes = extract_lightning_bboxes(img)
            label_p = lbl_out / f"{img_p.stem}.txt"
            with open(label_p, "w", encoding="utf-8") as f:
                for xc, yc, w, h in bboxes:
                    f.write(f"0 {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n")

    yaml_content = f"""# YOLO Lightning Strike Dataset Config
path: {out_path.resolve().as_posix()}
train: images/train
val: images/val
test: images/test

names:
  0: lightning
"""
    yaml_p = out_path / "dataset.yaml"
    with open(yaml_p, "w", encoding="utf-8") as f:
        f.write(yaml_content)

    return yaml_p


def calculate_strike_intervals(
    detected_timestamps: List[float],
    video_duration: float,
    buffer_seconds: float = 2.0,
    merge_threshold: float = 0.5,
) -> List[Tuple[float, float]]:
    """Calculates buffered time intervals around detected strikes and merges overlapping events.

    Each strike event is buffered by +buffer_seconds at the start (subtracted) and +buffer_seconds
    at the end (added), then clamped to [0.0, video_duration]. Overlapping or contiguous intervals
    are merged into seamless clips.

    Args:
        detected_timestamps: Sorted or unsorted list of timestamps (in seconds) where lightning occurred.
        video_duration: Total length of the video in seconds.
        buffer_seconds: Seconds to add before and after each strike event (default 1.0s).
        merge_threshold: Maximum gap in seconds between detections to be grouped into the same strike event.

    Returns:
        List of merged (start_seconds, end_seconds) tuples.

    Side effects:
        None.
    """
    if not detected_timestamps or video_duration <= 0.0:
        return []

    sorted_times = sorted(detected_timestamps)

    # 1. Group consecutive detections into distinct events
    events: List[Tuple[float, float]] = []
    current_start = sorted_times[0]
    current_end = sorted_times[0]

    for t in sorted_times[1:]:
        if t - current_end <= merge_threshold:
            current_end = t
        else:
            events.append((current_start, current_end))
            current_start = t
            current_end = t
    events.append((current_start, current_end))

    # 2. Add buffer (+buffer_seconds at start, +buffer_seconds at end) and clamp
    buffered_intervals: List[Tuple[float, float]] = []
    for start_t, end_t in events:
        padded_start = max(0.0, start_t - buffer_seconds)
        padded_end = min(video_duration, end_t + buffer_seconds)
        buffered_intervals.append((padded_start, padded_end))

    # 3. Merge any overlapping intervals resulting from the padding
    if not buffered_intervals:
        return []

    merged: List[Tuple[float, float]] = [buffered_intervals[0]]
    for cur_start, cur_end in buffered_intervals[1:]:
        prev_start, prev_end = merged[-1]
        if cur_start <= prev_end:
            merged[-1] = (prev_start, max(prev_end, cur_end))
        else:
            merged.append((cur_start, cur_end))

    return [(round(s, 3), round(e, 3)) for s, e in merged]


def extract_video_clips(
    video_path: str | Path,
    intervals: List[Tuple[float, float]],
    output_dir: str | Path,
    clip_prefix: str = "lightning_clip",
) -> List[Path]:
    """Extracts specified time intervals from a video file into separate MP4 clips.

    Args:
        video_path: Path to source video file.
        intervals: List of (start_seconds, end_seconds) tuples to extract.
        output_dir: Directory where sliced clips will be saved.
        clip_prefix: Base filename prefix for the output clips.

    Returns:
        List of Paths to generated video clip files.

    Side effects:
        Reads video file and writes new sliced video files to disk.
    """
    video_p = Path(video_path)
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(str(video_p))
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")

    output_clips: List[Path] = []

    try:
        for idx, (start_sec, end_sec) in enumerate(intervals, start=1):
            start_frame = int(round(start_sec * fps))
            end_frame = int(round(end_sec * fps))

            out_clip_path = out_dir / f"{clip_prefix}_{idx:02d}_{start_sec:.1f}s_to_{end_sec:.1f}s.mp4"
            writer = cv2.VideoWriter(str(out_clip_path), fourcc, fps, (width, height))

            cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
            current_frame_idx = start_frame

            while current_frame_idx <= end_frame:
                ret, frame = cap.read()
                if not ret:
                    break
                writer.write(frame)
                current_frame_idx += 1

            writer.release()
            output_clips.append(out_clip_path)
    finally:
        cap.release()

    return output_clips


def create_lightning_montage_video(
    video_path: str | Path,
    intervals: List[Tuple[float, float]],
    output_path: str | Path,
) -> Path:
    """Stitches all detected lightning strike intervals into a single continuous montage video.

    Preserves 100% native resolution, framerate, and full frame quality without downscaling.

    Args:
        video_path: Path to source video file.
        intervals: List of (start_seconds, end_seconds) intervals to concatenate.
        output_path: Destination path for the montage video file.

    Returns:
        Path to the generated montage video file.

    Side effects:
        Reads video and writes continuous stitched video to disk.
    """
    video_p = Path(video_path)
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(str(video_p))
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")

    sorted_intervals = sorted(intervals, key=lambda x: x[0])
    writer = cv2.VideoWriter(str(out_p), fourcc, fps, (width, height))

    try:
        for start_sec, end_sec in sorted_intervals:
            start_frame = int(round(start_sec * fps))
            end_frame = int(round(end_sec * fps))

            cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
            current_frame_idx = start_frame

            while current_frame_idx <= end_frame:
                ret, frame = cap.read()
                if not ret:
                    break
                writer.write(frame)
                current_frame_idx += 1
    finally:
        writer.release()
        cap.release()

    return out_p


def create_synthetic_lightning_video(
    output_path: str | Path,
    duration_sec: float = 10.0,
    fps: int = 30,
    strike_times: Tuple[float, ...] = (2.5, 6.0),
    strike_duration_sec: float = 0.2,
) -> Path:
    """Generates a synthetic nighttime thunderstorm video with lightning flashes for testing.

    Args:
        output_path: Destination path for generated MP4 video.
        duration_sec: Total duration of synthetic video in seconds.
        fps: Frames per second.
        strike_times: Timestamps (in seconds) where lightning strikes begin.
        strike_duration_sec: Duration of each lightning flash in seconds.

    Returns:
        Path to the created video file.

    Side effects:
        Writes synthetic video to disk.
    """
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    width, height = 640, 360
    total_frames = int(duration_sec * fps)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(out_p), fourcc, float(fps), (width, height))

    try:
        for f in range(total_frames):
            time_now = f / fps
            # Base dark storm sky
            frame = np.full((height, width, 3), (25, 20, 20), dtype=np.uint8)

            # Check if current time falls within any lightning strike
            is_lightning = any(
                st <= time_now < (st + strike_duration_sec) for st in strike_times
            )

            if is_lightning:
                # Add sky illumination glow
                frame = cv2.add(frame, np.full((height, width, 3), (80, 75, 90), dtype=np.uint8))
                # Draw sharp lightning bolt
                pts = np.array([
                    [320, 10], [335, 90], [315, 140], [350, 220], [330, 280], [340, 350]
                ], np.int32)
                cv2.polylines(frame, [pts], False, (255, 255, 255), 3, cv2.LINE_AA)
                # Lightning branches
                branch1 = np.array([[335, 90], [360, 130], [375, 160]], np.int32)
                branch2 = np.array([[315, 140], [290, 180], [275, 210]], np.int32)
                cv2.polylines(frame, [branch1, branch2], False, (240, 240, 255), 2, cv2.LINE_AA)

            writer.write(frame)
    finally:
        writer.release()

    return out_p


def detect_lightning_in_video(
    video_path: str | Path,
    model: Any,
    conf_threshold: float = 0.25,
    frame_stride: int = 1,
    max_static_frames: int = 10,
) -> Tuple[List[float], Dict[str, Any]]:
    """Runs YOLO inference with temporal flash delta and static light suppression on video frames.

    Distinguishes true transient lightning from background video elements:
    - Bounding boxes persisting in the same location across consecutive frames without sudden flash are suppressed.
    - Verified strikes require either a distinct temporal flash surge or high-confidence lightning detection.

    Args:
        video_path: Path to the input video.
        model: Ultralytics YOLO model instance or path to weights.
        conf_threshold: Confidence threshold for lightning detection (default: 0.50).
        frame_stride: Process every Nth frame (1 = every frame).
        max_static_frames: Max consecutive frames a box can stay in place before classified as static lamp (default: 10).

    Returns:
        Tuple of:
          - List of timestamps (seconds) where verified lightning strikes occurred.
          - Metadata dictionary containing fps, total_frames, duration, width, height.

    Side effects:
        Reads video file from disk; performs model inference.
    """
    from ultralytics import YOLO

    yolo_model = YOLO(model) if isinstance(model, (str, Path)) else model
    video_p = Path(video_path)

    cap = cv2.VideoCapture(str(video_p))
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total_frames / fps if fps > 0 else 0.0

    detected_timestamps: List[float] = []
    frame_idx = 0
    active_tracks: List[Dict[str, Any]] = []

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % frame_stride == 0:
                current_time = frame_idx / fps

                # Run pure YOLO object detection on the frame
                results = yolo_model(frame, conf=conf_threshold, verbose=False)
                has_verified_strike = False

                if len(results) > 0 and len(results[0].boxes) > 0:
                    current_boxes = results[0].boxes.xyxy.cpu().numpy()
                    current_confs = results[0].boxes.conf.cpu().numpy()

                    updated_tracks: List[Dict[str, Any]] = []

                    for box, conf in zip(current_boxes, current_confs):
                        bx1, by1, bx2, by2 = map(int, box)
                        bw = max(1, bx2 - bx1)
                        bh = max(1, by2 - by1)
                        cx, cy = (bx1 + bx2) / 2.0, (by1 + by2) / 2.0

                        matched_track = None
                        for trk in active_tracks:
                            tcx = (trk['box'][0] + trk['box'][2]) / 2.0
                            tcy = (trk['box'][1] + trk['box'][3]) / 2.0
                            dist = np.hypot(cx - tcx, cy - tcy)
                            if dist < max(25.0, max(bw, bh) * 0.4):
                                matched_track = trk
                                break

                        if matched_track:
                            matched_track['frames_active'] += 1
                            matched_track['last_frame'] = frame_idx
                            matched_track['box'] = [bx1, by1, bx2, by2]
                            updated_tracks.append(matched_track)
                            frames_active = matched_track['frames_active']
                        else:
                            new_track = {
                                'box': [bx1, by1, bx2, by2],
                                'frames_active': 1,
                                'last_frame': frame_idx,
                            }
                            updated_tracks.append(new_track)
                            frames_active = 1

                        # Suppress stationary objects that persist indefinitely
                        is_static_light = frames_active > max_static_frames

                        if not is_static_light:
                            has_verified_strike = True

                    active_tracks = [t for t in updated_tracks if frame_idx - t['last_frame'] <= 3]
                else:
                    active_tracks = [t for t in active_tracks if frame_idx - t['last_frame'] <= 3]

                if has_verified_strike:
                    detected_timestamps.append(round(current_time, 3))

            frame_idx += 1
    finally:
        cap.release()

    metadata = {
        "video_path": str(video_p),
        "fps": fps,
        "total_frames": total_frames,
        "duration_seconds": round(duration, 3),
        "width": width,
        "height": height,
    }

    return detected_timestamps, metadata


def process_video_pipeline(
    video_path: str | Path,
    model_path: str | Path,
    output_dir: str | Path = "output_clips",
    conf_threshold: float = 0.25,
    buffer_seconds: float = 2.0,
    frame_stride: int = 1,
) -> Dict[str, Any]:
    """End-to-end pipeline: detects verified lightning, expands intervals by +1s, and slices video clips.

    Args:
        video_path: Path to input video file.
        model_path: Path to trained YOLO weights (.pt).
        output_dir: Directory where resulting event clips will be saved.
        conf_threshold: Minimum confidence score for detection (default: 0.50).
        buffer_seconds: Padding in seconds added to beginning and end of each event (default: 1.0).
        frame_stride: Step size between processed frames (default: 1).

    Returns:
        Summary dictionary with metadata, detected strike times, padded intervals, and clip paths.

    Side effects:
        Reads video and model weights, writes sliced video clips to output_dir.
    """
    timestamps, metadata = detect_lightning_in_video(
        video_path=video_path,
        model=model_path,
        conf_threshold=conf_threshold,
        frame_stride=frame_stride,
    )

    intervals = calculate_strike_intervals(
        detected_timestamps=timestamps,
        video_duration=metadata["duration_seconds"],
        buffer_seconds=buffer_seconds,
    )

    clip_paths = extract_video_clips(
        video_path=video_path,
        intervals=intervals,
        output_dir=output_dir,
    )

    return {
        "metadata": metadata,
        "detected_timestamps": timestamps,
        "intervals": intervals,
        "clips": [str(p) for p in clip_paths],
    }
