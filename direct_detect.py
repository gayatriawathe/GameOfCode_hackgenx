import os
import cv2
import torch
import numpy as np
import argparse
import time
from pathlib import Path

# YOLOv5 confidence threshold for detection
CONFIDENCE_THRESHOLD = 0.30

class GarbageDetector:
    def __init__(self, model_path='model/best.pt', conf_threshold=CONFIDENCE_THRESHOLD):
        """Initialize garbage detector"""
        self.conf_threshold = conf_threshold
        
        # Check if model exists
        if not os.path.exists(model_path):
            # Try to use a pre-trained model
            if os.path.exists('yolov5s.pt'):
                model_path = 'yolov5s.pt'
                print(f"Custom model not found. Using pre-trained YOLOv5s model.")
            else:
                raise FileNotFoundError(f"Model not found at {model_path}")
        
        # Load model
        print(f"Loading YOLOv5 model from {model_path}...")
        try:
            # Use YOLOv5 directly from torch hub
            self.model = torch.hub.load('ultralytics/yolov5', 'custom', path=model_path, trust_repo=True)
            self.model.conf = conf_threshold
            print("Model loaded successfully!")
        except Exception as e:
            print(f"Error loading model with torch hub: {e}")
            try:
                # Try loading with local YOLOv5 if available
                if os.path.exists('yolov5'):
                    print("Attempting to load model with local YOLOv5...")
                    import sys
                    sys.path.append('yolov5')
                    from models.experimental import attempt_load
                    self.model = attempt_load(model_path)
                    print("Model loaded with local YOLOv5 successfully!")
                else:
                    raise ImportError("YOLOv5 directory not found")
            except Exception as e2:
                raise RuntimeError(f"Failed to load model: {e2}")
        
        # Set model parameters
        self.model.conf = conf_threshold  # Confidence threshold
        self.model.iou = 0.45  # IoU threshold
        self.model.classes = None  # All classes
        self.model.multi_label = False  # One label per box
        
        # Get class names
        self.class_names = self.model.names
        print(f"Detected classes: {self.class_names}")
    
    def detect(self, frame):
        """
        Detect objects in a frame
        
        Args:
            frame: OpenCV BGR image
            
        Returns:
            detections: List of detection results
            annotated_frame: Frame with bounding boxes
        """
        # Run inference
        results = self.model(frame)
        
        # Process results
        detections = results.xyxy[0].cpu().numpy()  # Get detections as numpy array
        
        # Create annotated frame
        annotated_frame = frame.copy()
        
        # Draw detections
        for detection in detections:
            x1, y1, x2, y2, conf, cls_id = detection
            
            # Skip low confidence detections
            if conf < self.conf_threshold:
                continue
            
            # Convert to integers
            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
            cls_id = int(cls_id)
            
            # Get class name and color
            class_name = self.class_names[cls_id]
            
            # Select color based on class
            if 'trash' in class_name.lower() or cls_id == 1:
                color = (0, 0, 255)  # Red for trash
            elif 'bin' in class_name.lower() or cls_id == 0:
                color = (0, 255, 0)  # Green for bins
            else:
                color = (255, 255, 0)  # Yellow for others
            
            # Draw rectangle
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
            
            # Add label
            label = f"{class_name}: {conf:.2f}"
            text_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)[0]
            cv2.rectangle(annotated_frame, (x1, y1-25), (x1+text_size[0], y1), color, -1)
            cv2.putText(annotated_frame, label, (x1, y1-5), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
        
        return detections, annotated_frame
    
    def is_garbage_detected(self, detections):
        """Check if any garbage is detected"""
        for det in detections:
            _, _, _, _, conf, cls_id = det
            cls_id = int(cls_id)
            cls_name = self.class_names[cls_id]
            
            # Check if class is trash/garbage
            if 'trash' in cls_name.lower() or cls_id == 1:
                if conf >= self.conf_threshold:
                    return True
        
        return False

def process_image(image_path, output_path=None, conf_threshold=CONFIDENCE_THRESHOLD):
    """Process a single image for garbage detection"""
    # Load image
    img = cv2.imread(image_path)
    if img is None:
        print(f"Error: Could not load image from {image_path}")
        return
    
    # Create detector
    detector = GarbageDetector(conf_threshold=conf_threshold)
    
    # Detect objects
    start_time = time.time()
    detections, annotated_img = detector.detect(img)
    inference_time = time.time() - start_time
    
    # Print results
    print(f"Detection completed in {inference_time:.3f} seconds")
    print(f"Found {len(detections)} objects")
    
    # Check for garbage
    is_garbage = detector.is_garbage_detected(detections)
    print(f"Garbage detected: {is_garbage}")
    
    # Save or display results
    if output_path:
        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
        cv2.imwrite(output_path, annotated_img)
        print(f"Saved annotated image to {output_path}")
    else:
        cv2.imshow("Garbage Detection", annotated_img)
        cv2.waitKey(0)
        cv2.destroyAllWindows()

def process_video(video_path, output_path=None, conf_threshold=CONFIDENCE_THRESHOLD):
    """Process a video for garbage detection"""
    # Open video
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Could not open video from {video_path}")
        return
    
    # Get video properties
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    # Create detector
    detector = GarbageDetector(conf_threshold=conf_threshold)
    
    # Setup video writer if needed
    writer = None
    if output_path:
        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    # Process video
    frame_count = 0
    garbage_frames = 0
    start_time = time.time()
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        frame_count += 1
        
        # Process every 3rd frame to improve performance
        if frame_count % 3 == 0 or frame_count == 1:
            # Detect objects
            detections, annotated_frame = detector.detect(frame)
            
            # Check for garbage
            if detector.is_garbage_detected(detections):
                garbage_frames += 1
        else:
            # Skip detection, use previous frame
            annotated_frame = frame
        
        # Write or display frame
        if writer:
            writer.write(annotated_frame)
        
        # Display progress
        if frame_count % 30 == 0:
            print(f"Processing: {frame_count}/{total_frames} frames " 
                  f"({frame_count/total_frames*100:.1f}%) - "
                  f"Garbage detected in {garbage_frames} frames")
        
        # Display frame
        cv2.imshow("Garbage Detection", annotated_frame)
        key = cv2.waitKey(1) & 0xFF
        if key == 27:  # ESC
            break
    
    # Clean up
    cap.release()
    if writer:
        writer.release()
    cv2.destroyAllWindows()
    
    # Print results
    processing_time = time.time() - start_time
    fps = frame_count / processing_time
    
    print(f"\nProcessing completed in {processing_time:.2f} seconds")
    print(f"Average FPS: {fps:.2f}")
    print(f"Garbage detected in {garbage_frames}/{frame_count} frames "
          f"({garbage_frames/frame_count*100:.2f}%)")

def process_camera(camera_id=0, output_path=None, conf_threshold=CONFIDENCE_THRESHOLD):
    """Process live camera feed for garbage detection"""
    # Open camera
    cap = cv2.VideoCapture(camera_id)
    if not cap.isOpened():
        print(f"Error: Could not open camera {camera_id}")
        return
    
    # Set camera properties
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    
    # Get actual properties
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    
    print(f"Camera initialized: {width}x{height}@{fps:.1f}fps")
    
    # Create detector
    detector = GarbageDetector(conf_threshold=conf_threshold)
    
    # Setup video writer if needed
    writer = None
    if output_path:
        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    # Process camera feed
    frame_count = 0
    garbage_frames = 0
    garbage_detected = False
    start_time = time.time()
    last_detection_time = None
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print("Error reading from camera")
            break
        
        frame_count += 1
        
        # Process every 3rd frame to improve performance
        if frame_count % 3 == 0 or frame_count == 1:
            # Detect objects
            detections, annotated_frame = detector.detect(frame)
            
            # Check for garbage
            new_garbage_detected = detector.is_garbage_detected(detections)
            if new_garbage_detected:
                garbage_frames += 1
                
                # Track when garbage is first detected
                if not garbage_detected:
                    last_detection_time = time.time()
                
                garbage_detected = True
            else:
                garbage_detected = False
        else:
            # Skip detection, use previous frame
            annotated_frame = frame
        
        # Add status info to frame
        status = "Garbage Detected" if garbage_detected else "No Garbage"
        status_color = (0, 0, 255) if garbage_detected else (0, 255, 0)
        
        # Add timestamp
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(annotated_frame, timestamp, (10, 30), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        # Add status
        cv2.putText(annotated_frame, status, (10, 70), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, status_color, 2)
        
        # Add FPS
        current_fps = frame_count / (time.time() - start_time)
        cv2.putText(annotated_frame, f"FPS: {current_fps:.1f}", (10, 110), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        # Write frame if requested
        if writer:
            writer.write(annotated_frame)
        
        # Display frame
        cv2.imshow("Garbage Detection", annotated_frame)
        key = cv2.waitKey(1) & 0xFF
        if key == 27:  # ESC
            break
        elif key == ord('s'):  # Save image
            img_name = f"capture_{time.strftime('%Y%m%d_%H%M%S')}.jpg"
            cv2.imwrite(img_name, annotated_frame)
            print(f"Saved {img_name}")
    
    # Clean up
    cap.release()
    if writer:
        writer.release()
    cv2.destroyAllWindows()
    
    # Print results
    processing_time = time.time() - start_time
    fps = frame_count / processing_time
    
    print(f"\nProcessing completed in {processing_time:.2f} seconds")
    print(f"Average FPS: {fps:.2f}")
    print(f"Garbage detected in {garbage_frames}/{frame_count} frames "
          f"({garbage_frames/frame_count*100:.2f}%)")

def main():
    """Main function"""
    # Parse arguments
    parser = argparse.ArgumentParser(description='YOLOv5 Garbage Detection')
    parser.add_argument('--source', type=str, required=True, 
                       help='Source (image path, video path, or camera index)')
    parser.add_argument('--output', type=str, default=None,
                       help='Output path for results (optional)')
    parser.add_argument('--conf', type=float, default=CONFIDENCE_THRESHOLD,
                       help='Confidence threshold')
    args = parser.parse_args()
    
    # Determine source type
    if args.source.isdigit():
        # Camera
        print(f"Processing camera feed from camera {args.source}")
        process_camera(int(args.source), args.output, args.conf)
    elif os.path.isfile(args.source):
        # Check file type
        ext = os.path.splitext(args.source)[1].lower()
        if ext in ['.jpg', '.jpeg', '.png', '.bmp']:
            # Image
            print(f"Processing image: {args.source}")
            process_image(args.source, args.output, args.conf)
        elif ext in ['.mp4', '.avi', '.mov', '.mkv']:
            # Video
            print(f"Processing video: {args.source}")
            process_video(args.source, args.output, args.conf)
        else:
            print(f"Unsupported file type: {ext}")
    else:
        print(f"Source not found: {args.source}")

if __name__ == "__main__":
    main() 
