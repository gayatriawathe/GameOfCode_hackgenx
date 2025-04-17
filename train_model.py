#!/usr/bin/env python
# Train a YOLOv5 model on garbage detection dataset

import os
import sys
import argparse
import yaml
import torch
import shutil
from pathlib import Path

# Add YOLOv5 to path
SCRIPT_DIR = Path(__file__).resolve().parent
YOLOV5_DIR = SCRIPT_DIR / 'yolov5'
sys.path.append(str(YOLOV5_DIR))

def train_yolo_model(
    dataset_path="data/GarbageDataSet",
    epochs=100,
    batch_size=16,
    img_size=640,
    fast_train=False,
    output_dir="model",
    pretrained=True,
    data_yaml=None
):
    """
    Train a YOLOv5 model on a garbage detection dataset
    
    Args:
        dataset_path (str): Path to the dataset
        epochs (int): Number of training epochs
        batch_size (int): Batch size
        img_size (int): Image size for training
        fast_train (bool): Use fast training settings (fewer epochs, smaller model)
        output_dir (str): Directory to save the trained model
        pretrained (bool): Use pretrained weights
        data_yaml (str): Path to data yaml file
    """
    print(f"Starting YOLOv5 training with the following settings:")
    print(f"Dataset path: {dataset_path}")
    print(f"Epochs: {epochs}")
    print(f"Image size: {img_size}px")
    print(f"Mode: {'Fast training' if fast_train else 'Full training'}")

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    # Select model size based on training speed preference
    if fast_train:
        model_size = "yolov5s.pt"  # Small model for faster training
        if epochs == 100:  # If not manually overridden
            epochs = 50    # Reduce epochs for fast training
    else:
        model_size = "yolov5m.pt"  # Medium model for better accuracy

    # Determine weights path
    if pretrained:
        weights = model_size  # Use pretrained weights
    else:
        weights = ""  # Train from scratch

    # Determine data YAML file
    if data_yaml is None:
        # Check if we have a garbage.yaml or garbage_dataset.yaml
        if os.path.exists(os.path.join(SCRIPT_DIR, "data", "garbage.yaml")):
            data_yaml = os.path.join(SCRIPT_DIR, "data", "garbage.yaml")
        elif os.path.exists(os.path.join(SCRIPT_DIR, "data", "garbage_dataset.yaml")):
            data_yaml = os.path.join(SCRIPT_DIR, "data", "garbage_dataset.yaml")
        else:
            # Create a data YAML file
            data_yaml = os.path.join(SCRIPT_DIR, "data", "garbage_data.yaml")
            create_data_yaml(dataset_path, data_yaml)
    
    print(f"Using data configuration: {data_yaml}")

    # Set up training parameters
    train_args = [
        '--img', str(img_size),
        '--batch', str(batch_size),
        '--epochs', str(epochs),
        '--data', data_yaml,
        '--weights', weights,
        '--project', str(SCRIPT_DIR),
        '--name', output_dir,
        '--exist-ok',  # Overwrite existing output directory
    ]

    # Import train function from YOLOv5
    try:
        sys.path.insert(0, str(YOLOV5_DIR))
        from train import train as yolo_train
        from train import parse_opt
        
        # Parse arguments
        opt = parse_opt(known=True)
        for i in range(0, len(train_args), 2):
            if i + 1 < len(train_args):
                key, value = train_args[i], train_args[i + 1]
                if key.startswith('--'):
                    key = key[2:]  # Remove -- prefix
                    key = key.replace('-', '_')  # Replace hyphens with underscores
                    setattr(opt, key, value)
        
        # Train the model
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"Training on {device}")
        yolo_train(opt.hyp, opt, device, None)
        
        # Copy the best model to the output directory
        best_model = Path(SCRIPT_DIR) / output_dir / 'weights' / 'best.pt'
        if best_model.exists():
            os.makedirs(os.path.join(SCRIPT_DIR, "model"), exist_ok=True)
            shutil.copy(best_model, os.path.join(SCRIPT_DIR, "model", "best.pt"))
            print(f"Best model saved to {os.path.join(SCRIPT_DIR, 'model', 'best.pt')}")
        else:
            print("Warning: Best model not found. Check training output for errors.")
        
        print("Training completed successfully!")
        
    except Exception as e:
        print(f"Error during training: {e}")
        raise

def create_data_yaml(dataset_path, yaml_path):
    """Create a YAML file for the dataset configuration"""
    
    # Check if dataset exists
    if not os.path.exists(dataset_path):
        print(f"Warning: Dataset path {dataset_path} does not exist")
        
    # Define the basic structure
    data = {
        'path': dataset_path,
        'train': 'images/train',
        'val': 'images/val',
        'test': 'images/test',
        'nc': 2,  # Default to 2 classes: bin and trash
        'names': ['bin', 'trash']  # Default class names
    }
    
    # Write to YAML file
    with open(yaml_path, 'w') as file:
        yaml.dump(data, file, default_flow_style=False)
    
    print(f"Created data configuration file at {yaml_path}")

def parse_arguments():
    parser = argparse.ArgumentParser(description='Train YOLOv5 model for garbage detection')
    parser.add_argument('--dataset_path', type=str, default='data/GarbageDataSet',
                        help='Path to the dataset')
    parser.add_argument('--epochs', type=int, default=100,
                        help='Number of training epochs')
    parser.add_argument('--batch_size', type=int, default=16,
                        help='Batch size for training')
    parser.add_argument('--img_size', type=int, default=640,
                        help='Image size for training')
    parser.add_argument('--fast_train', action='store_true',
                        help='Use fast training settings')
    parser.add_argument('--output_dir', type=str, default='model',
                        help='Directory to save the trained model')
    parser.add_argument('--data_yaml', type=str, default=None,
                        help='Path to data YAML file')
    parser.add_argument('--no_pretrained', action='store_true',
                        help='Train from scratch without pretrained weights')
    
    return parser.parse_args()

if __name__ == '__main__':
    args = parse_arguments()
    
    train_yolo_model(
        dataset_path=args.dataset_path,
        epochs=args.epochs,
        batch_size=args.batch_size,
        img_size=args.img_size,
        fast_train=args.fast_train,
        output_dir=args.output_dir,
        pretrained=not args.no_pretrained,
        data_yaml=args.data_yaml
    ) 