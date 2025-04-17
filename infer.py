import argparse
import os
import sys
import torch
import cv2
import numpy as np
from pathlib import Path

def parse_args():
    parser = argparse.ArgumentParser(description='Run inference with trained YOLOv5 garbage detection model')
    parser.add_argument('--source', type=str, required=True, help='Source image, video, directory, or 0 for webcam')
    parser.add_argument('--weights', type=str, required=True, help='Path to trained model weights')
    parser.add_argument('--img_size', type=int, default=640, help='Inference size (pixels)')
    parser.add_argument('--conf_thres', type=float, default=0.25, help='Confidence threshold')
    parser.add_argument('--iou_thres', type=float, default=0.45, help='NMS IoU threshold')
    parser.add_argument('--save_dir', type=str, default='results', help='Directory to save results')
    parser.add_argument('--show', action='store_true', help='Display results')
    parser.add_argument('--device', type=str, default='', help='cuda device, i.e. 0 or 0,1,2,3 or cpu')
    return parser.parse_args()

def setup_model(weights_path, device=''):
    """Load the YOLOv5 model"""
    # Check for YOLOv5 repo and download if not exists
    if not os.path.exists('yolov5'):
        print("Downloading YOLOv5 repository...")
        os.system('git clone https://github.com/ultralytics/yolov5.git')
        os.system('pip install -r yolov5/requirements.txt')
    
    # Add YOLOv5 to path
    yolov5_path = str(Path('yolov5').absolute())
    if yolov5_path not in sys.path:
        sys.path.append(yolov5_path)
    
    # Load model
    from models.experimental import attempt_load
    return attempt_load(weights_path, map_location=device)

def preprocess_image(img_path, img_size=640):
    """Preprocess image for inference"""
    # Read image
    if img_path.isdigit():  # Webcam
        cap = cv2.VideoCapture(int(img_path))
        ret, img = cap.read()
        cap.release()
        if not ret:
            raise Exception(f"Failed to capture image from webcam {img_path}")
    else:  # Image file
        img = cv2.imread(img_path)
        if img is None:
            raise Exception(f"Failed to read image {img_path}")
    
    # Resize and convert to RGB
    h, w = img.shape[:2]
    img = cv2.resize(img, (img_size, img_size))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    
    # Normalize and convert to tensor
    img = img.transpose(2, 0, 1)  # HWC to CHW
    img = np.ascontiguousarray(img)
    img = torch.from_numpy(img).float()
    img /= 255.0  # 0 - 255 to 0.0 - 1.0
    if img.ndimension() == 3:
        img = img.unsqueeze(0)
    
    return img, (h, w)

def main():
    args = parse_args()
    
    # Create save directory
    save_dir = Path(args.save_dir)
    save_dir.mkdir(exist_ok=True)
    
    # Initialize device
    device = args.device if args.device else ('cuda:0' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    # Load model
    print(f"Loading model from {args.weights}...")
    model = setup_model(args.weights, device)
    model.eval()
    model.to(device)
    
    # Check if source is a directory or a single file
    source = Path(args.source)
    if source.is_dir():
        files = list(source.glob('**/*.jpg')) + list(source.glob('**/*.png'))
        print(f"Found {len(files)} images in {source}")
    elif source.is_file() or source == Path('0'):  # File or webcam
        files = [source]
    else:
        raise Exception(f"Source {source} does not exist")
    
    # Process each file
    for file_path in files:
        try:
            print(f"Processing {file_path}...")
            img, original_size = preprocess_image(str(file_path), args.img_size)
            img = img.to(device)
            
            # Run inference
            with torch.no_grad():
                pred = model(img)[0]
                
                # Apply NMS
                from utils.general import non_max_suppression
                pred = non_max_suppression(pred, args.conf_thres, args.iou_thres)
            
            # Process predictions
            if len(pred[0]):
                # Read image for visualization
                orig_img = cv2.imread(str(file_path)) if file_path != Path('0') else img.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255
                orig_img = orig_img.astype(np.uint8)
                
                # Process detections
                for det in pred[0]:
                    xyxy, conf, cls = det[:4], det[4], det[5]
                    
                    # Scale coordinates to original size
                    xyxy[0] = xyxy[0].item() * original_size[1] / args.img_size
                    xyxy[1] = xyxy[1].item() * original_size[0] / args.img_size
                    xyxy[2] = xyxy[2].item() * original_size[1] / args.img_size
                    xyxy[3] = xyxy[3].item() * original_size[0] / args.img_size
                    
                    # Draw bounding box
                    cv2.rectangle(orig_img, 
                               (int(xyxy[0]), int(xyxy[1])), 
                               (int(xyxy[2]), int(xyxy[3])), 
                               (0, 255, 0), 2)
                    cv2.putText(orig_img, 
                             f"Garbage: {conf:.2f}", 
                             (int(xyxy[0]), int(xyxy[1] - 10)), 
                             cv2.FONT_HERSHEY_SIMPLEX, 0.5, 
                             (0, 255, 0), 2)
                
                # Save image with detections
                save_path = save_dir / f"{file_path.stem}_detection{file_path.suffix}"
                cv2.imwrite(str(save_path), orig_img)
                print(f"Detection saved to {save_path}")
                
                # Show image if requested
                if args.show:
                    cv2.imshow('Detection', orig_img)
                    cv2.waitKey(0)
            else:
                print(f"No detections found in {file_path}")
        
        except Exception as e:
            print(f"Error processing {file_path}: {e}")
    
    cv2.destroyAllWindows()
    print("Inference completed")

if __name__ == "__main__":
    main() 