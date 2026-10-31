# ⚡ VoltClip — AI Lightning Strike Detection & Video Slicer

Detect lightning strikes in any video, expand each strike event by **+1 second at the beginning and +1 second at the end**, merge overlapping strikes, and export isolated clips containing only the lightning events.

Features both an interactive **Jupyter Notebook** ([`lightning_detection.ipynb`](file:///c:/Users/joeyw/GitProjects/Video-Lighnting-Detection/lightning_detection.ipynb)) for ML training/batch processing and a **Vite + React** web application ready for Vercel deployment.

---

## 📁 Repository Structure

```text
Video-Lightning-Detection/
├── .gitignore                  # Git exclusions for builds, models, and caches
├── README.md                   # Project overview & documentation
├── requirements.txt            # Python dependencies (ultralytics, opencv, torch)
├── pytest.ini                  # Pytest configuration (pythonpath, clean reporting)
├── package.json                # Web app scripts and dependencies
├── tsconfig.json               # TypeScript compiler options
├── vite.config.ts              # Vite configuration
├── vercel.json                 # Vercel SPA routing & cache headers
├── index.html                  # Web app entry HTML
│
├── lightning_detection.ipynb   # Interactive Jupyter Notebook for YOLO training & inference
│
├── data/                       # Lightning strike image dataset
│   ├── meta.json               # Dataset metadata
│   ├── train/                  # Training images
│   ├── val/                    # Validation images
│   └── test/                   # Test images
│
├── models/                     # Saved YOLO model weights
│   ├── lightning_yolo.pt       # Fine-tuned lightning strike detector
│   └── yolo11n.pt              # Base pre-trained model
│
├── scripts/                    # Automation & maintenance scripts
│   └── build_notebook.py       # Notebook generator & updater
│
├── src/                        # Application source code
│   ├── __init__.py             # Python package marker
│   ├── lightning_pipeline.py   # Python YOLO detection & clip slicer module
│   │
│   ├── App.tsx                 # React main dashboard
│   ├── main.tsx                # React entry point
│   ├── index.css               # Theme styling & electric animations
│   ├── types.ts                # TypeScript interfaces
│   │
│   ├── components/             # React UI components
│   │   ├── Header.tsx          # Top bar with status and indicators
│   │   ├── VideoUploader.tsx   # Video dropzone & sample storm loader
│   │   ├── TimelineViewer.tsx  # Interactive scrubber with buffer highlights
│   │   └── ClipCard.tsx        # Sliced event cards with instant download
│   │
│   └── utils/                  # Frontend utilities & algorithms
│       ├── intervalMerger.ts   # Event buffer padding & interval merging logic
│       ├── intervalMerger.test.ts # Vitest unit tests
│       ├── lightningAnalyzer.ts# Canvas luminance & temporal delta scanner
│       ├── videoSlicer.ts      # Browser-native video cutter (MediaRecorder)
│       └── syntheticVideo.ts   # In-memory thunderstorm video synthesizer
│
├── tests/                      # Python unit & integration test suite
│   └── test_pipeline.py        # 7 comprehensive tests for Python pipeline
│
└── yolo_dataset/               # Prepared YOLO object detection dataset
    ├── dataset.yaml            # YOLO dataset configuration
    ├── images/                 # Train/val/test images
    └── labels/                 # Normalized YOLO bounding boxes
```

---

## 🚀 Quick Start

### 1. Jupyter Notebook
Open [`lightning_detection.ipynb`](file:///c:/Users/joeyw/GitProjects/Video-Lighnting-Detection/lightning_detection.ipynb) in VS Code, Antigravity IDE, or JupyterLab.
- Supports both **Python 3.13** and **Python 3.14**.
- Automatically checks and ensures `opencv-python`, `ultralytics`, `torch`, and `matplotlib` are loaded.
- Converts raw dataset images into YOLO bounding-box format.
- Trains or loads `models/lightning_yolo.pt`.
- Slices videos with ±1.0s buffer on strikes and merges overlapping windows.

### 2. Vite Web Application
Run the client-side web application locally:
```bash
# Install packages
npm install

# Start local dev server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to upload any video or click **"Load Sample Storm Video"** to test immediately.

---

## 🧪 Testing

Both test suites run independently or together:

```bash
# Run all tests (TypeScript + Python)
npm run test:all

# Run TypeScript tests only (Vitest)
npm test

# Run Python tests only (Pytest)
python -m pytest
```

### Test Coverage:
- **`src/utils/intervalMerger.test.ts` (5 tests)**: Verifies isolated strike padding (+1s / -1s), boundary clamping at `0.0s` and `videoDuration`, and seamless merging of overlapping intervals.
- **`tests/test_pipeline.py` (7 tests)**: Verifies bounding box extraction, interval calculations, synthetic storm video generation, and end-to-end video pipeline slicing.

---

## ☁️ Vercel Deployment

Deploy with one command using the [Vercel CLI](https://vercel.com/cli):
```bash
npx vercel deploy --prod
```
Or import your Git repository into Vercel:
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
