# GameOfCode_hackgenx
Automated Spill &amp; Garbage Detection – AI-powered waste management

# CleanSight - AI-Powered Garbage Detection System
CleanSight is an advanced facility monitoring system that uses AI-powered cameras to detect garbage and automatically assign tasks to cleaning crews. The system leverages computer vision technology with YOLOv5 object detection to provide real-time garbage monitoring, alerting, and management through a modern web interface.

## Project Overview
CleanSight addresses the challenge of efficient waste management by automating the detection process. The system can:

1. Connect to cameras to monitor environments in real-time
2. Detect garbage objects using a trained YOLOv5 model
3. Generate alerts when garbage is detected
4. Assign cleanup tasks to maintenance staff
5. Provide analytics on detection patterns and response times
6. Support both urban and rural area monitoring

## Key Features
- **Real-time Detection**: Identify garbage in live camera feeds with YOLOv5
- **Smart Alerting**: Instant notifications when garbage is detected
- **Task Management**: Assign and track cleanup tasks
- **Multi-environment Support**: Works in both urban and rural settings
- **Visual Dashboard**: Analytics and statistics with interactive charts
- **Image/Video Processing**: Analyze uploaded media files for offline detection
- **Mobile-responsive Interface**: Access the system from any device
- **Custom Model Training**: Train on specific datasets for improved accuracy
- **Detection Visualization**: View detection results with bounding boxes
- **Performance Optimization**: Efficient processing with CPU and GPU support

## Technology Stack
### Backend
- **Python**: Core programming language
- **Flask**: Web framework for the application
- **Flask-SocketIO**: Real-time bidirectional communication
- **OpenCV**: Computer vision library for image processing
- **PyTorch**: Deep learning framework for running YOLOv5
- **YOLOv5**: State-of-the-art object detection model
### Frontend
- **HTML5/CSS3**: Structure and styling
- **JavaScript/jQuery**: Client-side interactivity
- **Bootstrap 5**: Responsive UI components
- **Chart.js**: Interactive data visualization
- **Socket.IO**: Real-time updates and alerts
### Data Processing
- **NumPy**: Numerical computing for image manipulation
- **PIL/Pillow**: Python Imaging Library for image handling
- **JSON**: Data interchange format for API endpoints

## Project Structure

```
CleanSight/
├── app.py                 # Main Flask application with routes and WebSocket handling
├── detection.py           # Garbage detection module with YOLOv5 integration
├── detect.py              # Standalone detection script for images/videos
├── direct_detect.py       # Direct detection implementation
├── infer.py               # Inference utilities for model predictions
├── requirements.txt       # Python dependencies
├── yolov5s.pt             # Pre-trained YOLOv5 model weights
├── model/                 # Directory for custom trained models
├── data/                  # Data files and configurations for training
├── static/                # Static files for the web interface
│   ├── css/               # CSS stylesheets
│   ├── js/                # JavaScript files
│   ├── img/               # Image assets
│   └── uploads/           # Uploaded files for processing
├── templates/             # HTML templates
│   ├── index.html         # Live monitoring page
│   ├── dashboard.html     # Analytics dashboard
│   └── rural-area.html    # Rural monitoring interface
└── yolov5/                # YOLOv5 repository for model training and inference
```

## File Descriptions

- **app.py**: Main application server that handles HTTP routes, WebSocket connections, and coordinates the detection process
- **detection.py**: Core detection module that wraps YOLOv5 for garbage detection with class mapping
- **detect.py**: Command-line tool for running detection on images and videos
- **direct_detect.py**: Alternative implementation for direct camera access
- **infer.py**: Utilities for inference optimization and result formatting
- **requirements.txt**: List of Python packages required to run the system

## Setup Instructions

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Train or Download the YOLOv5 Model

Option 1: Train the model with the provided dataset:
```bash
python train_model.py --dataset_path data/GarbageDataSet --epochs 100
```

Option 2: Use a pre-trained model:
- The system includes a pre-trained YOLOv5s model
- Custom garbage detection models can be placed in the `model/` directory as `best.pt`

### 3. Run the Application

```bash
python app.py
```

The application will be available at `http://localhost:5000`.

## How It Works

1. The system connects to your webcam (or CCTV camera) and processes frames in real-time
2. The YOLOv5 model analyzes each frame to detect garbage/trash objects
3. When garbage is detected, the system triggers an alert via WebSockets
4. Cleaning staff can be assigned to handle the detected garbage through the task management interface
5. The dashboard provides analytics on detection frequency, locations, and response times
6. For rural areas, users can upload images for analysis without requiring a live camera feed

## Dataset

The system uses a garbage detection dataset with two primary classes:
- `bin` (class 0) - Garbage bins and containers
- `trash` (class 1) - Various trash and garbage items

For pre-trained models, the system maps COCO dataset classes to garbage-related objects.

## Detection Parameters

The detection system can be configured with various parameters:
- **Confidence threshold**: Minimum confidence score for detections (default: 0.35)
- **Image size**: Input resolution for the model (default: 640px)
- **Alert cooldown**: Time between consecutive alerts (default: 5 seconds)
- **Device**: CPU or CUDA for GPU acceleration

## License

This project is developed for educational and research purposes. The code is available for non-commercial use. 
