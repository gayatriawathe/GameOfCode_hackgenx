import os
import cv2
import numpy as np
import torch
import time
import json
from flask import Flask, render_template, Response, jsonify, request
from flask_socketio import SocketIO, emit
from datetime import datetime
from PIL import Image
from detection import GarbageDetector, format_detections, save_detection_image

app = Flask(__name__)
app.config['SECRET_KEY'] = 'cleansight_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*")

# Global variables
camera = None
garbage_detected = False
last_detection_time = None
last_alert_time = None
alert_cooldown = 15  # seconds between alerts (reduced to make system more responsive)

# Create detector
detector = None

# Store alerts
alerts = []

# Class mapping for pre-trained model (if needed)
# This will map COCO classes to our garbage classes
class_mapping = {
    # COCO class indices for trash-like objects
    39: 'trash',  # bottle
    73: 'trash',  # book
    41: 'trash',  # cup
    76: 'trash',  # scissors
    75: 'trash',  # remote
    77: 'trash',  # toothbrush
    25: 'trash',  # backpack
    33: 'trash',  # suitcase
    14: 'trash',  # bench
    61: 'trash',  # cake
    67: 'trash',  # laptop
    84: 'trash',  # book
    44: 'trash',  # bottle
    66: 'trash',  # keyboard
    46: 'trash',  # wine glass
    47: 'trash',  # cup
    43: 'trash',  # knife
    62: 'trash',  # chair
    64: 'trash',  # potted plant
    1: 'bin',     # bicycle (as placeholder for bin)
    0: 'bin'      # person (as placeholder for bin)
}

def initialize_detector():
    global detector
    
    try:
        # Create model directory if it doesn't exist
        os.makedirs('model', exist_ok=True)
        
        # Check if we should train a custom model first
        if os.path.exists('GarbageDataSet') and not os.path.exists('model/best.pt'):
            print("Found GarbageDataSet but no trained model. Training custom model first...")
            from train_model import train_yolo_model
            train_yolo_model(fast_train=False)  # Use full training for better accuracy
        
        # Try to use custom model if it exists
        if os.path.exists('model/best.pt'):
            print("Using custom garbage detection model")
            # Lower confidence threshold for custom model (more sensitive detection)
            detector = GarbageDetector(model_path='model/best.pt', conf_threshold=0.30)
        else:
            # Use pre-trained model
            print("Using pre-trained YOLOv5 model")
            detector = GarbageDetector(conf_threshold=0.35)
            
        print("Garbage detector initialized successfully")
    except Exception as e:
        print(f"Error initializing detector: {e}")
        raise  # Re-raise the exception to stop the application

def is_trash_object(class_id, class_name):
    """Check if a detected object is considered garbage"""
    # For custom model
    if class_name == 'trash':
        return True
    
    # For pre-trained model
    if class_id in class_mapping and class_mapping[class_id] == 'trash':
        return True
    
    return False

def generate_frames():
    global camera, garbage_detected, last_detection_time, detector
    
    if camera is None:
        camera = cv2.VideoCapture(0)  # Use default webcam
        
        # Set higher resolution for better detection
        camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        
        # Check if camera is opened successfully
        if not camera.isOpened():
            print("Error: Unable to access webcam. Make sure webcam is connected.")
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + 
                   cv2.imencode('.jpg', np.zeros((480, 640, 3), np.uint8))[1].tobytes() + 
                   b'\r\n')
            return
    
    if detector is None:
        initialize_detector()
    
    # Frame counter for periodic detection (to save resources)
    frame_count = 0
    
    while True:
        success, frame = camera.read()
        if not success:
            # Return a blank frame if camera read fails
            blank_frame = np.zeros((480, 640, 3), np.uint8)
            cv2.putText(blank_frame, "Camera Error", (200, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            ret, buffer = cv2.imencode('.jpg', blank_frame)
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            # Try to reinitialize camera
            camera.release()
            camera = cv2.VideoCapture(0)
            time.sleep(1)  # Wait before trying again
            continue
            
        try:
            frame_count += 1
            do_detection = (frame_count % 5 == 0)  # Only run detection every 5 frames
            
            if do_detection:
                # Process frame with real detector
                detections, annotated_frame = detector.detect(frame)
                
                # Apply additional filtering for higher accuracy
                filtered_detections = []
                for det in detections:
                    # Keep only higher confidence detections
                    if det['confidence'] >= detector.conf_threshold:
                        filtered_detections.append(det)
                
                # Check for garbage based on our classes or mapped classes
                garbage_found = False
                for det in filtered_detections:
                    if is_trash_object(det['class'], det['name']):
                        garbage_found = True
                        break
                
                # Update garbage detection status
                if garbage_found:
                    if not garbage_detected:
                        garbage_detected = True
                        last_detection_time = datetime.now()
                        
                        # Send alert - no longer saving images
                        check_and_send_alert()
                else:
                    garbage_detected = False
            else:
                # If we're not doing detection, just use the last annotated frame or the current frame
                if 'annotated_frame' not in locals():
                    annotated_frame = frame
            
            # Add timestamp to frame
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cv2.putText(annotated_frame, timestamp, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            
            # Add system status
            status_text = "Garbage Detected" if garbage_detected else "No Garbage"
            status_color = (0, 0, 255) if garbage_detected else (0, 255, 0)
            cv2.putText(annotated_frame, status_text, (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, status_color, 2)
            
            # Convert to jpeg
            ret, buffer = cv2.imencode('.jpg', annotated_frame)
            frame = buffer.tobytes()
            
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
                   
        except Exception as e:
            print(f"Error processing frame: {e}")
            # Return error frame
            error_frame = frame.copy()
            cv2.putText(error_frame, f"Processing Error: {str(e)[:30]}", (10, 30), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            ret, buffer = cv2.imencode('.jpg', error_frame)
            frame = buffer.tobytes()
            
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

def check_and_send_alert(image_path=None):
    global last_alert_time, alerts
    
    current_time = datetime.now()
    
    # Check if we should send an alert (cooldown period)
    if last_alert_time is None or (current_time - last_alert_time).total_seconds() > alert_cooldown:
        last_alert_time = current_time
        
        # Create alert without image path
        alert = {
            'id': len(alerts) + 1,
            'timestamp': current_time.strftime("%Y-%m-%d %H:%M:%S"),
            'message': 'Garbage detected! Cleanup required.',
            'location': 'Camera 1',
            'status': 'pending'
        }
        
        alerts.append(alert)
        
        # Send alert via WebSocket
        socketio.emit('alert', alert)
        print(f"Alert sent: {alert}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/alerts')
def get_alerts():
    return jsonify(alerts)

@app.route('/api/alerts/<int:alert_id>', methods=['PUT'])
def update_alert(alert_id):
    data = request.json
    
    for alert in alerts:
        if alert['id'] == alert_id:
            alert['status'] = data.get('status', alert['status'])
            if 'assignedTo' in data:
                alert['assignedTo'] = data['assignedTo']
            
            # Emit update to all clients
            socketio.emit('alert_update', alert)
            return jsonify(alert)
    
    return jsonify({'error': 'Alert not found'}), 404

@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('alerts', alerts)

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

def cleanup():
    global camera
    if camera is not None:
        camera.release()
    print("Camera released")

if __name__ == '__main__':
    # Create necessary directories
    os.makedirs('model', exist_ok=True)
    # No longer creating directory for detection images
    
    # Initialize detector
    initialize_detector()
    
    # Register cleanup handler
    import atexit
    atexit.register(cleanup)
    
    # Start the app
    socketio.run(app, debug=True, host='0.0.0.0', port=5000) 