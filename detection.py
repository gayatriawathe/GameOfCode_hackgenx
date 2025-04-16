import os
import cv2
import torch
import numpy as np
from PIL import Image
from datetime import datetime
import urllib.request
import zipfile
import shutil

class GarbageDetector:
    def __init__(self, model_path='model/best.pt', conf_threshold=0.5):
        """
        Initialize the garbage detector with a trained YOLOv5 model
        
        Args:
            model_path: Path to the YOLOv5 model weights
            conf_threshold: Confidence threshold for detections
        """
        self.conf_threshold = conf_threshold
        
        print(f"Initializing garbage detector with threshold: {conf_threshold}")
        
        # Check if we need to use a pre-trained model
        if not os.path.exists(model_path):
            print(f"Model not found at {model_path}. Attempting to use pre-trained YOLOv5 model.")
            self._use_pretrained_model()
            model_path = 'model/yolov5s.pt'  # Use downloaded model
        
        # Load YOLOv5 model
        try:
            # First, make sure we have YOLOv5 repo
            self._ensure_yolov5_exists()
            
            self.model = torch.hub.load('ultralytics/yolov5', 'custom', path=model_path)
            self.model.conf = conf_threshold
            self.model.eval()
            print(f"Model loaded successfully from {model_path}")
            
            # Get class names from the model
            self.class_names = self.model.names
            print(f"Detected classes: {self.class_names}")
        except Exception as e:
            raise RuntimeError(f"Error loading model: {e}")
    
    def _ensure_yolov5_exists(self):
        """
        Make sure YOLOv5 code exists locally
        """
        if not os.path.exists('yolov5'):
            print("Downloading YOLOv5 repository...")
            # Download YOLOv5 zip from GitHub
            zip_url = "https://github.com/ultralytics/yolov5/archive/refs/heads/master.zip"
            zip_path = "yolov5-master.zip"
            
            # Download the zip file
            try:
                urllib.request.urlretrieve(zip_url, zip_path)
                
                # Extract the zip file
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(".")
                
                # Rename the folder
                if os.path.exists("yolov5-master"):
                    os.rename("yolov5-master", "yolov5")
                
                # Clean up the zip file
                os.remove(zip_path)
                
                print("YOLOv5 repository downloaded and extracted successfully")
            except Exception as e:
                print(f"Failed to download YOLOv5: {e}")
                raise
    
    def _use_pretrained_model(self):
        """
        Download and use a pre-trained YOLOv5 model
        """
        import torch
        
        try:
            # Create model directory if it doesn't exist
            os.makedirs('model', exist_ok=True)
            
            # Download pre-trained YOLOv5s model
            print("Downloading pre-trained YOLOv5s model...")
            torch.hub.download_url_to_file(
                'https://github.com/ultralytics/yolov5/releases/download/v6.0/yolov5s.pt',
                'model/yolov5s.pt'
            )
            print("Pre-trained model downloaded successfully")
        except Exception as e:
            print(f"Error downloading pre-trained model: {e}")
            raise
    
    def detect(self, frame):
        """
        Detect garbage in a frame
        
        Args:
            frame: OpenCV image (BGR format)
            
        Returns:
            detections: List of detection results
            annotated_frame: Frame with bounding boxes
        """
        # Convert to RGB for YOLOv5
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Run inference
        results = self.model(rgb_frame, size=640)
        
        # Convert results to detections list
        detections = []
        
        # Get detection pandas dataframe
        df = results.pandas().xyxy[0]
        
        for _, row in df.iterrows():
            detection = {
                'class': row['class'],
                'name': row['name'],
                'confidence': row['confidence'],
                'bbox': [row['xmin'], row['ymin'], row['xmax'], row['ymax']]
            }
            detections.append(detection)
        
        # Render the detections on the frame
        annotated_frame = results.render()[0]
        
        # Convert back to BGR for OpenCV
        annotated_frame = cv2.cvtColor(annotated_frame, cv2.COLOR_RGB2BGR)
        
        return detections, annotated_frame
    
    def is_garbage_detected(self, detections):
        """
        Check if garbage/trash is detected in the detections
        
        Args:
            detections: List of detection results
            
        Returns:
            bool: True if garbage is detected
        """
        for detection in detections:
            # Check if the class is 'trash' (class 1 in our dataset)
            if detection['name'] == 'trash' and detection['confidence'] >= self.conf_threshold:
                return True
        
        return False

# Helper function to convert detections to a simplified format
def format_detections(detections):
    """
    Format detections for easier processing
    
    Args:
        detections: List of detection results
        
    Returns:
        list: Simplified list of detections
    """
    formatted = []
    for d in detections:
        formatted.append({
            'class': d['name'],
            'confidence': round(float(d['confidence']), 2),
            'bbox': [int(coord) for coord in d['bbox']]
        })
    return formatted

# Helper function to save a detection image
def save_detection_image(frame, filename=None):
    """
    Save a detection image to disk
    
    Args:
        frame: OpenCV image
        filename: Optional filename, otherwise uses timestamp
        
    Returns:
        str: Path to saved image
    """
    if filename is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"detection_{timestamp}.jpg"
    
    save_dir = "static/img/detections"
    os.makedirs(save_dir, exist_ok=True)
    
    save_path = os.path.join(save_dir, filename)
    cv2.imwrite(save_path, frame)
    
    return save_path 