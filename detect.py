import os
import cv2
import torch
import numpy as np
import argparse
from datetime import datetime

class GarbageDetector:
    def __init__(self, model_path='model/best.pt', conf_threshold=0.35, device=None):
        """
        Initialize the garbage detector with a YOLOv5 model
        
        Args:
            model_path: Path to the YOLOv5 model
            conf_threshold: Confidence threshold for detections
            device: Device to run the model on (None for auto-selection)
        """
        self.conf_threshold = conf_threshold
        
        # Determine device
        if device is None:
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        else:
            self.device = device
            
        print(f"Using device: {self.device}")
        
        # Load model
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model not found at {model_path}. Please train the model first.")
        
        print(f"Loading model from {model_path}...")
        try:
            self.model = torch.hub.load('ultralytics/yolov5', 'custom', path=model_path)
            self.model.conf = conf_threshold  # Set confidence threshold
            self.model.to(self.device)  # Move model to device
            print("Model loaded successfully")
        except Exception as e:
            print(f"Error loading model: {e}")
            # Try alternative method if torch.hub.load fails
            try:
                print("Trying alternative loading method...")
                # Using direct YOLOv5 repo if available
                if os.path.exists('yolov5'):
                    import sys
                    sys.path.append('yolov5')
                    from models.experimental import attempt_load
                    self.model = attempt_load(model_path, map_location=self.device)
                    print("Model loaded using alternative method")
                else:
                    raise FileNotFoundError("YOLOv5 repository not found")
            except Exception as e2:
                raise Exception(f"Failed to load model with both methods: {e}, {e2}")
    
    def detect(self, image, image_size=640):
        """
        Detect garbage in an image
        
        Args:
            image: OpenCV image (BGR format)
            image_size: Input size for the model
            
        Returns:
            List of detections, each detection is [x1, y1, x2, y2, confidence, class_id]
        """
        # Resize image if needed
        orig_shape = image.shape
        
        # Convert BGR to RGB (YOLOv5 expects RGB)
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Run inference
        results = self.model(image_rgb, size=image_size)
        
        # Process results
        detections = results.xyxy[0].cpu().numpy()  # Get detections as numpy array
        
        # Filter by confidence threshold
        detections = detections[detections[:, 4] >= self.conf_threshold]
        
        return detections
    
    def draw_detections(self, image, detections, class_mapping=None):
        """
        Draw bounding boxes and labels on the image
        
        Args:
            image: OpenCV image (BGR format)
            detections: List of detections from detect() method
            class_mapping: Dictionary mapping class IDs to class names
            
        Returns:
            Image with drawn detections
        """
        image_copy = image.copy()
        
        # Define color map for different classes
        color_map = {
            'trash': (0, 0, 255),    # Red for trash
            'bin': (0, 255, 0),      # Green for bins
            'person': (255, 0, 0),   # Blue for people
            'default': (255, 255, 0) # Yellow for other classes
        }
        
        # Get class names if available
        if class_mapping is None:
            # Try to get class names from model
            if hasattr(self.model, 'names'):
                class_mapping = self.model.names
            else:
                class_mapping = {}
        
        # Draw each detection
        for det in detections:
            x1, y1, x2, y2, conf, cls_id = det
            
            # Convert to integers
            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
            cls_id = int(cls_id)
            
            # Get class name
            if cls_id in class_mapping:
                cls_name = class_mapping[cls_id]
            else:
                cls_name = f"Class {cls_id}"
            
            # Get color based on class name
            if 'trash' in cls_name.lower():
                color = color_map['trash']
            elif 'bin' in cls_name.lower():
                color = color_map['bin']
            elif 'person' in cls_name.lower():
                color = color_map['person']
            else:
                color = color_map['default']
            
            # Draw rectangle
            cv2.rectangle(image_copy, (x1, y1), (x2, y2), color, 2)
            
            # Draw label
            label = f"{cls_name}: {conf:.2f}"
            text_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
            cv2.rectangle(image_copy, (x1, y1 - text_size[1] - 5), (x1 + text_size[0], y1), color, -1)
            cv2.putText(image_copy, label, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
        
        return image_copy

def process_image(image_path, output_path=None, conf_threshold=0.35):
    """
    Process a single image and display/save the result
    
    Args:
        image_path: Path to the input image
        output_path: Path to save the output image (if None, just display)
        conf_threshold: Confidence threshold for detections
    """
    # Load image
    image = cv2.imread(image_path)
    if image is None:
        print(f"Error: Could not load image at {image_path}")
        return
    
    # Initialize detector
    detector = GarbageDetector(conf_threshold=conf_threshold)
    
    # Detect garbage
    detections = detector.detect(image)
    
    # Draw detections
    result_image = detector.draw_detections(image, detections)
    
    # Save or display result
    if output_path:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        cv2.imwrite(output_path, result_image)
        print(f"Result saved to {output_path}")
    else:
        # Display the result
        cv2.imshow("Garbage Detection", result_image)
        cv2.waitKey(0)
        cv2.destroyAllWindows()

def process_video(video_path, output_path=None, conf_threshold=0.35, fps_limit=30):
    """
    Process a video and save/display the result
    
    Args:
        video_path: Path to the input video
        output_path: Path to save the output video (if None, just display)
        conf_threshold: Confidence threshold for detections
        fps_limit: Maximum FPS to process (to avoid overloading the system)
    """
    # Open video
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Could not open video at {video_path}")
        return
    
    # Get video properties
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    
    # Limit FPS if needed
    process_every_n_frames = max(1, int(fps / fps_limit))
    
    # Initialize detector
    detector = GarbageDetector(conf_threshold=conf_threshold)
    
    # Initialize video writer if needed
    writer = None
    if output_path:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    # Process frames
    frame_count = 0
    detections_count = 0
    start_time = datetime.now()
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        frame_count += 1
        
        # Process only every Nth frame
        if frame_count % process_every_n_frames != 0:
            if writer:
                writer.write(frame)
            continue
        
        # Detect garbage
        detections = detector.detect(frame)
        
        # Count detections
        if len(detections) > 0:
            detections_count += 1
        
        # Draw detections
        result_frame = detector.draw_detections(frame, detections)
        
        # Write or display the frame
        if writer:
            writer.write(result_frame)
        else:
            cv2.imshow("Garbage Detection", result_frame)
            key = cv2.waitKey(1)
            if key == 27:  # ESC key
                break
    
    # Release resources
    cap.release()
    if writer:
        writer.release()
    cv2.destroyAllWindows()
    
    # Calculate performance
    end_time = datetime.now()
    processing_time = (end_time - start_time).total_seconds()
    actual_fps = frame_count / processing_time if processing_time > 0 else 0
    
    print(f"Processed {frame_count} frames in {processing_time:.2f} seconds ({actual_fps:.2f} FPS)")
    print(f"Detected garbage in {detections_count} frames")

def process_camera(camera_id=0, output_path=None, conf_threshold=0.35, resolution=(1280, 720)):
    """
    Process live camera feed and display/save the result
    
    Args:
        camera_id: Camera ID (0 for default camera)
        output_path: Path to save the output video (if None, just display)
        conf_threshold: Confidence threshold for detections
        resolution: Camera resolution (width, height)
    """
    # Open camera
    cap = cv2.VideoCapture(camera_id)
    if not cap.isOpened():
        print(f"Error: Could not open camera with ID {camera_id}")
        return
    
    # Set resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, resolution[0])
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, resolution[1])
    
    # Get actual resolution (may be different from requested)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    
    print(f"Camera resolution: {width}x{height} at {fps} FPS")
    
    # Initialize detector
    detector = GarbageDetector(conf_threshold=conf_threshold)
    
    # Initialize video writer if needed
    writer = None
    if output_path:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    # Process frames
    frame_count = 0
    start_time = datetime.now()
    process_every_n_frames = 3  # Process every 3rd frame to improve performance
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print("Error: Could not read frame from camera")
            break
        
        frame_count += 1
        
        # Process only every Nth frame
        if frame_count % process_every_n_frames == 0:
            # Detect garbage
            detections = detector.detect(frame)
            
            # Draw detections
            result_frame = detector.draw_detections(frame, detections)
        else:
            result_frame = frame
        
        # Write or display the frame
        if writer:
            writer.write(result_frame)
        
        # Always display the frame
        cv2.imshow("Garbage Detection", result_frame)
        key = cv2.waitKey(1)
        if key == 27:  # ESC key
            break
    
    # Release resources
    cap.release()
    if writer:
        writer.release()
    cv2.destroyAllWindows()
    
    # Calculate performance
    end_time = datetime.now()
    processing_time = (end_time - start_time).total_seconds()
    actual_fps = frame_count / processing_time if processing_time > 0 else 0
    
    print(f"Processed {frame_count} frames in {processing_time:.2f} seconds ({actual_fps:.2f} FPS)")

def main():
    """Main function to parse arguments and call the appropriate processing function"""
    parser = argparse.ArgumentParser(description="Garbage Detection using YOLOv5")
    parser.add_argument('--source', type=str, required=True, help='Source (image, video path, or camera ID)')
    parser.add_argument('--output', type=str, default=None, help='Output path for processed image/video')
    parser.add_argument('--conf', type=float, default=0.35, help='Confidence threshold for detections')
    parser.add_argument('--img-size', type=int, default=640, help='Image size for processing')
    
    args = parser.parse_args()
    
    # Determine source type
    if args.source.isdigit():
        # Camera
        camera_id = int(args.source)
        print(f"Processing camera feed from camera ID {camera_id}")
        process_camera(camera_id=camera_id, output_path=args.output, conf_threshold=args.conf)
    elif os.path.isfile(args.source):
        # Check if it's an image or video
        if args.source.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp')):
            # Image
            print(f"Processing image: {args.source}")
            process_image(args.source, args.output, args.conf)
        elif args.source.lower().endswith(('.mp4', '.avi', '.mov', '.mkv')):
            # Video
            print(f"Processing video: {args.source}")
            process_video(args.source, args.output, args.conf)
        else:
            print(f"Unsupported file format: {args.source}")
    else:
        print(f"Source not found: {args.source}")

if __name__ == "__main__":
    main() 
