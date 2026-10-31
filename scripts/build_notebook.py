"""Script to generate the lightning_detection.ipynb Jupyter Notebook."""

import json
from pathlib import Path

notebook = {
    "cells": [],
    "metadata": {
        "language_info": {"name": "python", "version": "3.13.7"},
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
    },
    "nbformat": 4,
    "nbformat_minor": 2,
}


def add_md(text: str) -> None:
    notebook["cells"].append({
        "cell_type": "markdown",
        "metadata": {},
        "source": [line + "\n" for line in text.strip().split("\n")],
    })


def add_code(text: str) -> None:
    notebook["cells"].append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [line + "\n" for line in text.strip().split("\n")],
    })


# 1. Header
add_md("""# ⚡ YOLO Lightning Strike Detection & Video Slicer
Detect lightning strikes in any video, expand each strike event by **+1 second at the beginning and +1 second at the end**, merge overlapping strikes, and export isolated clips containing only the lightning events.

---

### Pipeline Architecture:
1. **Dataset Preparation**: Convert raw images in `data/{train,val,test}/lightning` into YOLO object detection format with automated bounding box generation.
2. **YOLO Model**: Train or load a fine-tuned YOLO11 lightning detector.
3. **Video Strike Detection**: Analyze video frames to record timestamps when lightning is detected.
4. **Buffered Interval Calculation**: Group contiguous detections, add **+1.0s before and after**, clamp to `[0, duration]`, and merge overlapping intervals.
5. **Video Slicing**: Export individual MP4 clips for each detected lightning event.""")

# 2. Imports
add_code("""import sys
import subprocess

# Self-healing dependency check (handles Python 3.13, 3.14, virtual environments)
for pkg, import_name in [("opencv-python", "cv2"), ("ultralytics", "ultralytics"), ("torch", "torch"), ("matplotlib", "matplotlib")]:
    try:
        __import__(import_name)
    except ImportError:
        print(f"Installing missing package {pkg} into {sys.executable}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])

import os
import glob
from pathlib import Path
import cv2
import numpy as np
import matplotlib.pyplot as plt
import torch
from ultralytics import YOLO

# Set ultralytics configuration directory
os.environ["YOLO_CONFIG_DIR"] = str(Path("./.ultralytics").resolve())

print(f"Python interpreter: {sys.executable}")
print(f"Python version: {sys.version.split()[0]}")
print(f"PyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"OpenCV version: {cv2.__version__}")""")

# 3. Dataset Prep Markdown
add_md("""## 1. Dataset Preparation & Auto-Annotation
The dataset contains lightning images in `data/train/lightning`, `data/val/lightning`, and `data/test/lightning`.
Because lightning channels present high luminance contrast against the dark background, we extract bounding boxes using adaptive thresholding and morphological filtering, then format them into the standard YOLO structure (`yolo_dataset/images` & `yolo_dataset/labels`).""")

# 4. Dataset Prep Code
add_code("""from src.lightning_pipeline import build_yolo_dataset, extract_lightning_bboxes

# Build YOLO dataset from local images
dataset_yaml = build_yolo_dataset(
    source_dir="data",
    output_dir="yolo_dataset",
    splits=("train", "val", "test")
)

print(f"Dataset configuration ready at: {dataset_yaml}")
train_imgs = list(Path("yolo_dataset/images/train").glob("*.jpg"))
val_imgs = list(Path("yolo_dataset/images/val").glob("*.jpg"))
print(f"Training images: {len(train_imgs)}")
print(f"Validation images: {len(val_imgs)}")""")

# 5. Visualization Code
add_code("""# Visualize sample training images with generated YOLO bounding boxes
fig, axes = plt.subplots(1, 4, figsize=(16, 4))
sample_files = train_imgs[:4]

for ax, img_p in zip(axes, sample_files):
    img = cv2.imread(str(img_p))
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    h, w = img.shape[:2]
    
    # Read label file
    lbl_p = Path("yolo_dataset/labels/train") / f"{img_p.stem}.txt"
    if lbl_p.exists():
        with open(lbl_p, "r", encoding="utf-8") as f:
            for line in f:
                cls_id, xc, yc, bw, bh = map(float, line.strip().split())
                x1 = int((xc - bw / 2) * w)
                y1 = int((yc - bh / 2) * h)
                x2 = int((xc + bw / 2) * w)
                y2 = int((yc + bh / 2) * h)
                cv2.rectangle(img_rgb, (x1, y1), (x2, y2), (255, 255, 0), 2)
                
    ax.imshow(img_rgb)
    ax.set_title(img_p.stem, fontsize=10)
    ax.axis("off")

plt.tight_layout()
plt.show()""")

# 6. Model Training Markdown
add_md("""## 2. YOLO Model: Load or Train
We use a lightweight YOLO model (`yolo11n.pt`) fine-tuned specifically for lightning strike detection.
You can either use the pre-trained weights in `models/lightning_yolo.pt` or run training below.""")

# 7. Model Training Code
add_code("""weights_path = Path("models/lightning_yolo.pt")

if weights_path.exists():
    print(f"Loading existing trained lightning model from {weights_path}...")
    model = YOLO(str(weights_path))
else:
    print("Training YOLO on lightning dataset (3 epochs)...")
    model = YOLO("yolo11n.pt")
    model.train(
        data="yolo_dataset/dataset.yaml",
        epochs=3,
        imgsz=256,
        batch=16,
        project="lightning_runs",
        name="lightning_yolo",
        exist_ok=True,
        device="cpu"
    )
    weights_path.parent.mkdir(parents=True, exist_ok=True)
    import shutil
    shutil.copy("runs/detect/lightning_runs/lightning_yolo/weights/best.pt", weights_path)

print("Model ready for video inference!")""")

# 8. Detection Markdown
add_md("""## 3. Video Lightning Detection & Slicing Pipeline
The pipeline handles:
- **Frame Scanning**: Inspect frames at regular or full rate, recording timestamps where lightning is detected.
- **Buffer Expansion (+1s Start, +1s End)**: Adds 1.0 second before the strike and 1.0 second after the strike.
- **Interval Merging**: If two strikes happen close together (e.g. within 2 seconds of each other), their buffered windows overlap. The merger unites them into a single uninterrupted clip.
- **Boundary Clamping**: Clips are safely bounded within `[0.0, video_duration]`.
- **Clip Extraction**: Extracts and writes each event clip as a high-definition MP4 video.""")

# 9. Pipeline Functions Code
add_code("""from src.lightning_pipeline import (
    detect_lightning_in_video,
    calculate_strike_intervals,
    extract_video_clips,
    process_video_pipeline
)

print("Pipeline functions loaded:")
print(" - detect_lightning_in_video()")
print(" - calculate_strike_intervals()")
print(" - extract_video_clips()")
print(" - process_video_pipeline()")""")

# 10. Demo Markdown
add_md("""## 4. End-to-End Demo with Synthetic Storm Video
To demonstrate and verify the pipeline, we generate a synthetic storm video containing realistic dark skies, ambient thunderstorm illumination, and rapid multi-branch lightning strikes at known timestamps (2.5s and 6.0s).""")

# 11. Demo Video Creation
add_code("""from src.lightning_pipeline import create_synthetic_lightning_video

demo_video_path = Path("demo_storm.mp4")
print("Generating synthetic test video...")
create_synthetic_lightning_video(
    output_path=demo_video_path,
    duration_sec=10.0,
    fps=30,
    strike_times=(2.5, 6.0),
    strike_duration_sec=0.2
)
print(f"Synthetic test video created at: {demo_video_path}")""")

# 12. Demo Execution Code
add_code("""# Run end-to-end detection and clipping on demo video
output_dir = Path("lightning_clips")

results = process_video_pipeline(
    video_path=demo_video_path,
    model_path="models/lightning_yolo.pt",
    output_dir=output_dir,
    conf_threshold=0.15,
    buffer_seconds=1.0,
    frame_stride=1
)

print("=" * 60)
print("⚡ LIGHTNING DETECTION SUMMARY")
print("=" * 60)
meta = results["metadata"]
print(f"Video: {meta['video_path']}")
print(f"Duration: {meta['duration_seconds']}s | FPS: {meta['fps']} | Resolution: {meta['width']}x{meta['height']}")
print(f"Detected Strike Timestamps: {results['detected_timestamps']}")
print(f"Buffered & Merged Intervals (+1s buffer): {results['intervals']}")
print(f"Generated Clips ({len(results['clips'])} total):")
for clip in results["clips"]:
    clip_size = Path(clip).stat().st_size / 1024
    print(f"  - {clip} ({clip_size:.1f} KB)")
print("=" * 60)""")

# 13. Custom Video Markdown
add_md("""## 5. Process Your Own Custom Video
Use the function below to process any real-world lightning video. Simply provide the path to your video file.""")

# 14. Custom Video Function
add_code('''def detect_and_clip_lightning(
    video_path: str,
    output_dir: str = "output_clips",
    conf_threshold: float = 0.25,
    buffer_seconds: float = 1.0,
    frame_stride: int = 1
):
    """Processes an input video, detects lightning strikes, and extracts padded clips (+1s start/end).
    
    Args:
        video_path: Path to user video (MP4, AVI, MOV, etc.).
        output_dir: Output folder for extracted clips.
        conf_threshold: Minimum detection confidence (0.0 to 1.0).
        buffer_seconds: Seconds added before and after each strike (default: 1.0).
        frame_stride: Process every N frames (1 = full accuracy, 2 = 2x faster).
    """
    if not Path(video_path).exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")
        
    return process_video_pipeline(
        video_path=video_path,
        model_path="models/lightning_yolo.pt",
        output_dir=output_dir,
        conf_threshold=conf_threshold,
        buffer_seconds=buffer_seconds,
        frame_stride=frame_stride
    )

# Example usage for your own video:
# results = detect_and_clip_lightning("my_storm_video.mp4", buffer_seconds=1.0)
''')

with open("lightning_detection.ipynb", "w", encoding="utf-8") as f:
    json.dump(notebook, f, indent=1)

print("Successfully created lightning_detection.ipynb")

