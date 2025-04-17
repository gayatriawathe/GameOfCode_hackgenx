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
import base64
from werkzeug.utils import secure_filename
import uuid

app = Flask(__name__)
app.config['SECRET_KEY'] = 'cleansight_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*")

# Global variables
camera = None
garbage_detected = False
last_detection_time = None
last_alert_time = None
alert_cooldown = 5  # seconds between alerts (reduced to make system more responsive)

# Create detector
detector = None

# Store alerts
alerts = []

# Class mapping for pre-trained model (if needed)
# This will map COCO classes to our garbage classes
class_mapping = {
    # COCO class indices for trash-like objects
    39: 'trash',  # bottle
    41: 'trash',  # cup
    43: 'trash',  # knife
    44: 'trash',  # spoon
    46: 'trash',  # wine glass
    47: 'trash',  # cup
    67: 'trash',  # laptop
    73: 'trash',  # book
    76: 'trash',  # scissors
    77: 'trash',  # toothbrush
    84: 'trash',  # book
}

# Global variables
detector = None
alerts = []
camera = None
is_camera_active = False
UPLOAD_FOLDER = 'static/uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

# Ensure upload directory exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

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
            detector = GarbageDetector(model_path='model/best.pt', conf_threshold=0.25)
        else:
            # Use pre-trained model
            print("Using pre-trained YOLOv5 model")
            detector = GarbageDetector(conf_threshold=0.25)
            
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
    
    # Additional common objects that could be garbage
    if class_name in ['bottle', 'cup', 'wine glass', 'book', 'cell phone', 'laptop', 'vase']:
        return True
    
    return False

def generate_frames():
    global camera, garbage_detected, last_detection_time, detector
    
    if camera is None:
        try:
            camera = cv2.VideoCapture(0)  # Use default webcam
            
            # Set higher resolution for better detection
            camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            
            # Check if camera is opened successfully
            if not camera.isOpened():
                print("Error: Unable to access webcam. Make sure webcam is connected.")
                # Create a blank frame with error message
                blank_frame = np.zeros((480, 640, 3), np.uint8)
                cv2.putText(blank_frame, "Camera Error - No Device Found", (80, 240), 
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                ret, buffer = cv2.imencode('.jpg', blank_frame)
                frame_bytes = buffer.tobytes()
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                return
        except Exception as e:
            print(f"Error initializing camera: {e}")
            # Create a blank frame with error message
            blank_frame = np.zeros((480, 640, 3), np.uint8)
            cv2.putText(blank_frame, f"Camera Error: {str(e)[:30]}", (80, 240), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            ret, buffer = cv2.imencode('.jpg', blank_frame)
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
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
                
                # Check for garbage based on our classes or mapped classes
                garbage_found = False
                for det in detections:
                    if is_trash_object(det['class'], det['name']):
                        garbage_found = True
                        break
                
                # Update garbage detection status
                if garbage_found:
                    if not garbage_detected:
                        garbage_detected = True
                        last_detection_time = datetime.now()
                        
                        # Send alert
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
        
        # Create alert 
        alert = {
            'id': len(alerts) + 1,
            'timestamp': current_time.strftime("%Y-%m-%d %H:%M:%S"),
            'message': 'Garbage detected! Cleanup required.',
            'location': 'Camera 1',
            'status': 'pending',
            'assignedTo': ''
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

@app.route('/Rulararea')
def rural_area():
    return render_template('Rulararea.html')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    return jsonify(alerts)

@app.route('/api/alerts', methods=['POST'])
def create_alert():
    data = request.json
    
    # Validate required fields
    if 'message' not in data or 'location' not in data:
        return jsonify({'error': 'Missing required fields'}), 400
    
    # Create a new alert with the next available ID
    new_alert = {
        'id': len(alerts) + 1,
        'timestamp': data.get('timestamp', datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        'message': data['message'],
        'location': data['location'],
        'status': data.get('status', 'pending'),
        'assignedTo': data.get('assignedTo')
    }
    
    # Add to alerts list
    alerts.append(new_alert)
    
    # Notify connected clients
    socketio.emit('alert', new_alert)
    
    return jsonify(new_alert), 201

@app.route('/api/alerts/<int:alert_id>', methods=['PUT'])
def update_alert(alert_id):
    data = request.json
    
    for i, alert in enumerate(alerts):
        if alert['id'] == alert_id:
            # Update fields that were provided
            if 'status' in data:
                alert['status'] = data['status']
            if 'assignedTo' in data:
                alert['assignedTo'] = data['assignedTo']
            
            # Emit event to notify clients
            socketio.emit('alert_update', alert)
            return jsonify(alert)
    
    return jsonify({'error': 'Alert not found'}), 404

# New routes for controlling the video feed
@app.route('/api/start_video', methods=['POST'])
def start_video():
    global camera
    
    try:
        # Initialize camera if it's not already active
        if camera is None or not camera.isOpened():
            camera = cv2.VideoCapture(0)  # Use default webcam
            camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            
            if not camera.isOpened():
                return jsonify({'error': 'Failed to start camera'}), 500
        
        return jsonify({'success': True, 'message': 'Video started successfully'})
    except Exception as e:
        print(f"Error starting video: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/stop_video', methods=['POST'])
def stop_video():
    global camera
    
    try:
        # Release the camera if it's active
        if camera is not None and camera.isOpened():
            camera.release()
            camera = None
        
        return jsonify({'success': True, 'message': 'Video stopped successfully'})
    except Exception as e:
        print(f"Error stopping video: {e}")
        return jsonify({'error': str(e)}), 500

@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('alerts', alerts)

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

def cleanup():
    global camera
    
    # Release the camera on application shutdown
    if camera is not None and camera.isOpened():
        camera.release()
        print("Camera resources released")

# After the existing routes, add routes for handling rural area request images
@app.route('/upload_rural_image', methods=['POST'])
def upload_rural_image():
    if 'image' not in request.files:
        return jsonify({'success': False, 'error': 'No image file provided'}), 400
    
    image_file = request.files['image']
    if image_file.filename == '':
        return jsonify({'success': False, 'error': 'No image selected'}), 400
    
    # Create uploads directory if it doesn't exist
    upload_dir = os.path.join(app.static_folder, 'uploads')
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir)
    
    # Generate unique filename with timestamp
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = secure_filename(f"{timestamp}_{image_file.filename}")
    filepath = os.path.join(upload_dir, filename)
    
    # Save the image
    image_file.save(filepath)
    
    # Return the relative path to be stored with the alert
    relative_path = f"/static/uploads/{filename}"
    return jsonify({'success': True, 'imagePath': relative_path})

@app.route('/api/rural-request', methods=['POST'])
def submit_rural_request():
    try:
        location = request.form.get('location', '')
        message = request.form.get('message', '')
        
        # Initialize alert data
        alert_data = {
            'id': str(uuid.uuid4()),
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'location': location,
            'message': message,
            'isRural': True,
            'status': 'pending',
            'image_path': None
        }
        
        # Handle image upload if present
        if 'image' in request.files:
            file = request.files['image']
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                # Create unique filename
                unique_filename = f"{alert_data['id']}_{filename}"
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
                file.save(file_path)
                # Store relative path
                alert_data['image_path'] = os.path.join('uploads', unique_filename)
        
        # Add to alerts
        alerts.append(alert_data)
        
        # Emit socket event to notify clients
        socketio.emit('new_alert', alert_data)
        
        return jsonify({'success': True, 'message': 'Rural request submitted successfully', 'alert': alert_data})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500

@app.route('/api/update-alert-status', methods=['POST'])
def update_alert_status():
    try:
        data = request.json
        alert_id = data.get('id')
        new_status = data.get('status')
        
        for alert in alerts:
            if alert['id'] == alert_id:
                alert['status'] = new_status
                socketio.emit('alert_updated', alert)
                return jsonify({'success': True, 'message': 'Alert status updated'})
        
        return jsonify({'success': False, 'message': 'Alert not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500

if __name__ == '__main__':
    # Initialize the detector
    try:
        initialize_detector()
    except Exception as e:
        print(f"Error initializing detector: {e}")
    
    # Run the Flask app
    try:
        print("Starting CleanSight application...")
        print("Access the application at http://localhost:5000")
        socketio.run(app, debug=True, host='0.0.0.0')
    finally:
        # Make sure to clean up resources when the app is shutting down
        cleanup() 
