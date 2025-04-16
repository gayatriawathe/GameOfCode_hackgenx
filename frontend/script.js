// Global Variables
let webcamStream = null;
let detectionInterval = null;
let detectionActive = false;
let canvas, ctx, video;
let taskIdCounter = 1;
let alertIdCounter = 1;

// Mock data for demo purposes
const DETECTION_CLASSES = {
    0: { name: 'Garbage', type: 'garbage', color: 'rgb(255, 112, 67)' },
    1: { name: 'Spill', type: 'spill', color: 'rgb(66, 165, 245)' }
};

const LOCATIONS = ['Main Entrance', 'Corridor A', 'Cafeteria', 'Meeting Room B', 'Office Area'];
const CLEANERS = ["John Doe", "Jane Smith", "Mike Johnson", "Sarah Davis"];

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Initialize elements
    video = document.getElementById('webcam');
    canvas = document.getElementById('detection-canvas');
    ctx = canvas.getContext('2d');

    // Set up event listeners
    setupEventListeners();

    // Load initial data
    initializeDashboard();
    
    // Add sample data for testing
    addSampleAlerts();
    addSampleTasks();
    
    // Set up polling for updates from the backend
    setupBackendPolling();
});

// Set up all event listeners
function setupEventListeners() {
    // Camera controls
    document.getElementById('start-camera').addEventListener('click', startCamera);
    document.getElementById('stop-camera').addEventListener('click', stopCamera);

    // Task filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            filterTasks(e.target.dataset.filter);
        });
    });

    // Modal controls
    document.querySelector('.close-modal').addEventListener('click', closeModal);
    document.getElementById('cancel-assignment').addEventListener('click', closeModal);
    document.getElementById('assign-task-form').addEventListener('submit', handleTaskAssignment);
}

// Set up regular polling to the backend for updates
function setupBackendPolling() {
    // Poll for new tasks and detections every 2 seconds
    setInterval(() => {
        fetchTasksFromBackend();
        fetchDetectionsFromBackend();
    }, 2000);
    
    // Check detection status
    setInterval(() => {
        checkDetectionStatus();
    }, 5000);
}

// Fetch tasks from backend
async function fetchTasksFromBackend() {
    try {
        const response = await fetch('/api/tasks');
        if (response.ok) {
            const tasks = await response.json();
            updateTasksFromBackend(tasks);
        }
    } catch (error) {
        console.error('Error fetching tasks from backend:', error);
    }
}

// Fetch detections from backend
async function fetchDetectionsFromBackend() {
    try {
        const response = await fetch('/api/detections?limit=10');
        if (response.ok) {
            const detections = await response.json();
            updateDetectionsFromBackend(detections);
        }
    } catch (error) {
        console.error('Error fetching detections from backend:', error);
    }
}

// Check detection status from backend
async function checkDetectionStatus() {
    try {
        const response = await fetch('/api/detection/status');
        if (response.ok) {
            const status = await response.json();
            if (status.active) {
                updateStatus('detecting');
            } else {
                updateStatus('idle');
            }
        }
    } catch (error) {
        console.error('Error checking detection status:', error);
    }
}

// Update tasks from backend data
function updateTasksFromBackend(tasks) {
    const tasksContainer = document.getElementById('tasks-container');
    const currentFilter = document.querySelector('.filter-btn.active').dataset.filter;
    
    // Clear existing tasks
    tasksContainer.innerHTML = '';
    
    // Sort tasks by timestamp (newest first)
    tasks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Add tasks to UI
    tasks.forEach(task => {
        // Apply filter
        if (currentFilter !== 'all' && task.status !== currentFilter) {
            return;
        }
        
        // Format timestamp
        const taskTime = new Date(task.timestamp);
        const timeString = taskTime.toLocaleTimeString();
        
        // Create task HTML
        const taskHTML = `
            <tr class="task-item" data-status="${task.status}" id="${task.id}">
                <td>${task.id}</td>
                <td>${task.type.charAt(0).toUpperCase() + task.type.slice(1)}</td>
                <td>${task.location}</td>
                <td>${task.assigned_to || '-'}</td>
                <td>${timeString}</td>
                <td>
                    <span class="task-status status-${task.status}">
                        ${task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                    </span>
                </td>
                <td class="task-actions">
                    ${task.status === 'pending' ? 
                        `<button class="btn btn-primary btn-sm" onclick="openAssignModal('${task.id}', '${task.type}', '${task.location}')">
                            <i class="fas fa-user-plus"></i> Assign
                        </button>` : ''}
                    ${task.status === 'assigned' ? 
                        `<button class="btn btn-secondary btn-sm" onclick="markAsCompleted('${task.id}')">
                            <i class="fas fa-check"></i> Complete
                        </button>` : ''}
                    <button class="btn btn-danger btn-sm" onclick="deleteTask('${task.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
        
        tasksContainer.insertAdjacentHTML('beforeend', taskHTML);
    });
    
    // If no tasks are displayed, show a message
    if (tasksContainer.children.length === 0) {
        tasksContainer.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">No tasks found</td>
            </tr>
        `;
    }
    
    // Update stats
    updateStats();
}

// Update detections from backend data
function updateDetectionsFromBackend(detections) {
    const alertsContainer = document.getElementById('alerts-container');
    
    // Clear existing alerts
    alertsContainer.innerHTML = '';
    
    // Add alerts to UI
    detections.forEach(detection => {
        // Format timestamp
        const detectionTime = new Date(detection.timestamp);
        const timeString = detectionTime.toLocaleTimeString();
        
        // Create alert HTML
        const alertHTML = `
            <div class="alert-item ${detection.type.toLowerCase()}" id="alert-${detection.id}">
                <div class="alert-icon ${detection.type.toLowerCase()}">
                    <i class="fas ${detection.type.toLowerCase() === 'garbage' ? 'fa-trash-alt' : 'fa-water'}"></i>
                </div>
                <div class="alert-details">
                    <div class="alert-type">${detection.type.charAt(0).toUpperCase() + detection.type.slice(1)} Detected</div>
                    <div class="alert-location">Location: ${detection.location}</div>
                    <div class="alert-time">Time: ${timeString}</div>
                    <div class="alert-actions">
                        <button class="btn btn-primary btn-sm" onclick="createTask('${detection.type.toLowerCase()}', '${detection.location}', '${timeString}')">Create Task</button>
                        <button class="btn btn-secondary btn-sm" onclick="dismissAlert('alert-${detection.id}')">Dismiss</button>
                    </div>
                </div>
            </div>
        `;
        
        alertsContainer.insertAdjacentHTML('afterbegin', alertHTML);
    });
    
    // If no alerts are displayed, show a message
    if (alertsContainer.children.length === 0) {
        alertsContainer.innerHTML = `
            <div class="alert-empty">
                No recent detections
            </div>
        `;
    }
    
    // Update stats
    updateStats();
}

// Initialize dashboard with sample data
function initializeDashboard() {
    // Add some sample tasks
    addSampleTasks();
    
    // Add some sample alerts
    addSampleAlerts();
    
    // Update stats
    updateStats();
}

// Start webcam and detection
async function startCamera() {
    try {
        // Call backend to start detection
        const response = await fetch('/api/detection/start', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.status === 'error') {
            console.error('Error starting detection:', data.message);
            alert('Failed to start detection: ' + data.message);
            return;
        }
        
        // Update UI
        updateStatus('detecting');
        
        // Set video source to the video feed endpoint
        const videoElement = document.getElementById('webcam');
        const feedUrl = `/video_feed?t=${new Date().getTime()}`;
        
        // Display the video feed directly from backend (using img for MJPEG stream)
        videoElement.style.display = 'block';
        videoElement.src = feedUrl;
        canvas.style.display = 'none';
        
    } catch (error) {
        console.error('Error accessing webcam:', error);
        alert('Failed to access webcam. Please check permissions and try again.');
    }
}

// Stop webcam and detection
async function stopCamera() {
    try {
        // Call backend to stop detection
        const response = await fetch('/api/detection/stop', {
            method: 'POST'
        });
        
        await response.json();
        
        // Update UI
        updateStatus('idle');
        
        // Stop displaying video
        const videoElement = document.getElementById('webcam');
        videoElement.src = '';
        videoElement.style.display = 'none';
        canvas.style.display = 'none';
        
    } catch (error) {
        console.error('Error stopping detection:', error);
    }
}

// Update detection status
function updateStatus(status) {
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    
    statusIndicator.className = '';
    
    switch (status) {
        case 'idle':
            statusIndicator.classList.add('status-idle');
            statusText.textContent = 'Camera Idle';
            break;
        case 'detecting':
            statusIndicator.classList.add('status-detecting');
            statusText.textContent = 'Detecting...';
            break;
        case 'detected':
            statusIndicator.classList.add('status-detected');
            statusText.textContent = 'Object Detected!';
            break;
    }
}

// Add a new alert to the UI
function addAlert(type, location) {
    const alertsContainer = document.getElementById('alerts-container');
    const alertId = `alert-${alertIdCounter++}`;
    const timestamp = new Date();
    const timeString = timestamp.toLocaleTimeString();
    
    const alertHTML = `
        <div class="alert-item ${type}" id="${alertId}">
            <div class="alert-icon ${type}">
                <i class="fas ${type === 'garbage' ? 'fa-trash-alt' : 'fa-water'}"></i>
            </div>
            <div class="alert-details">
                <div class="alert-type">${type === 'garbage' ? 'Garbage Detected' : 'Spill Detected'}</div>
                <div class="alert-location">Location: ${location}</div>
                <div class="alert-time">Time: ${timeString}</div>
                <div class="alert-actions">
                    <button class="btn btn-primary btn-sm" onclick="createTask('${type}', '${location}', '${timeString}')">Create Task</button>
                    <button class="btn btn-secondary btn-sm" onclick="dismissAlert('${alertId}')">Dismiss</button>
                </div>
            </div>
        </div>
    `;
    
    alertsContainer.insertAdjacentHTML('afterbegin', alertHTML);
    
    // Limit the number of alerts displayed
    const maxAlerts = 10;
    const alerts = alertsContainer.querySelectorAll('.alert-item');
    if (alerts.length > maxAlerts) {
        for (let i = maxAlerts; i < alerts.length; i++) {
            alerts[i].remove();
        }
    }
}

// Add a new task to the UI
function addTask(type, location, assignedTo = '', status = 'pending', timeDetected = null) {
    const tasksContainer = document.getElementById('tasks-container');
    const taskId = `task-${taskIdCounter++}`;
    const timestamp = timeDetected ? new Date(timeDetected) : new Date();
    const timeString = timeDetected || timestamp.toLocaleTimeString();
    
    const taskHTML = `
        <tr class="task-item" data-status="${status}" id="${taskId}">
            <td>${taskId}</td>
            <td>${type === 'garbage' ? 'Garbage' : 'Spill'}</td>
            <td>${location}</td>
            <td>${assignedTo || '-'}</td>
            <td>${timeString}</td>
            <td>
                <span class="task-status status-${status}">
                    ${status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
            </td>
            <td class="task-actions">
                ${status === 'pending' ? 
                    `<button class="btn btn-primary btn-sm" onclick="openAssignModal('${taskId}', '${type}', '${location}')">
                        <i class="fas fa-user-plus"></i> Assign
                    </button>` : ''}
                ${status === 'assigned' ? 
                    `<button class="btn btn-secondary btn-sm" onclick="markAsCompleted('${taskId}')">
                        <i class="fas fa-check"></i> Complete
                    </button>` : ''}
                <button class="btn btn-danger btn-sm" onclick="deleteTask('${taskId}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `;
    
    tasksContainer.insertAdjacentHTML('afterbegin', taskHTML);
}

// Open the assign task modal
function openAssignModal(taskId, type, location) {
    const modal = document.getElementById('task-modal');
    
    // Fill form fields
    document.getElementById('task-id').value = taskId;
    document.getElementById('task-type').value = type === 'garbage' ? 'Garbage' : 'Spill';
    document.getElementById('task-location').value = location;
    
    // Show modal
    modal.classList.add('show');
}

// Close the modal
function closeModal() {
    const modal = document.getElementById('task-modal');
    modal.classList.remove('show');
}

// Handle task assignment form submission
function handleTaskAssignment(e) {
    e.preventDefault();
    
    const taskId = document.getElementById('task-id').value;
    const assignedTo = document.getElementById('assigned-to').value;
    
    if (!assignedTo) {
        alert('Please select a cleaner to assign the task.');
        return;
    }
    
    // Update task in UI
    const taskRow = document.getElementById(taskId);
    if (taskRow) {
        taskRow.querySelector('td:nth-child(4)').textContent = assignedTo;
        taskRow.querySelector('td:nth-child(6) span').textContent = 'Assigned';
        taskRow.querySelector('td:nth-child(6) span').className = 'task-status status-assigned';
        taskRow.setAttribute('data-status', 'assigned');
        
        // Update actions column
        const actionsCell = taskRow.querySelector('td:nth-child(7)');
        actionsCell.innerHTML = `
            <button class="btn btn-secondary btn-sm" onclick="markAsCompleted('${taskId}')">
                <i class="fas fa-check"></i> Complete
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteTask('${taskId}')">
                <i class="fas fa-trash"></i>
            </button>
        `;
    }
    
    // Update stats
    updateStats();
    
    // Close modal
    closeModal();
    
    // Send to server
    sendTaskToBackend({
        taskId: taskId,
        type: document.getElementById('task-type').value.toLowerCase(),
        location: document.getElementById('task-location').value,
        assignedTo: assignedTo,
        priority: document.getElementById('priority').value,
        status: 'assigned'
    });
}

// Mark a task as completed
function markAsCompleted(taskId) {
    const taskRow = document.getElementById(taskId);
    if (taskRow) {
        taskRow.querySelector('td:nth-child(6) span').textContent = 'Completed';
        taskRow.querySelector('td:nth-child(6) span').className = 'task-status status-completed';
        taskRow.setAttribute('data-status', 'completed');
        
        // Update actions column (remove action buttons except delete)
        const actionsCell = taskRow.querySelector('td:nth-child(7)');
        actionsCell.innerHTML = `
            <button class="btn btn-danger btn-sm" onclick="deleteTask('${taskId}')">
                <i class="fas fa-trash"></i>
            </button>
        `;
    }
    
    // Update stats
    updateStats();
    
    // Send to server
    updateTaskStatusBackend(taskId, 'completed');
}

// Delete a task
function deleteTask(taskId) {
    const taskRow = document.getElementById(taskId);
    if (taskRow) {
        taskRow.remove();
    }
    
    // Update stats
    updateStats();
    
    // Send to server
    deleteTaskBackend(taskId);
}

// Dismiss an alert
function dismissAlert(alertId) {
    const alert = document.getElementById(alertId);
    if (alert) {
        alert.remove();
    }
}

// Create a task from an alert
function createTask(type, location, timeDetected) {
    // Add to UI
    addTask(type, location, '', 'pending', timeDetected);
    updateStats();
    
    // If type is garbage, auto-assign to a cleaner
    if (type === 'garbage') {
        // Randomly select a cleaner
        const randomCleaner = CLEANERS[Math.floor(Math.random() * CLEANERS.length)];
        
        // Get the task ID (using the latest one)
        const taskId = `task-${taskIdCounter - 1}`;
        
        // Auto-assign the task
        const taskRow = document.getElementById(taskId);
        if (taskRow) {
            taskRow.querySelector('td:nth-child(4)').textContent = randomCleaner;
            taskRow.querySelector('td:nth-child(6) span').textContent = 'Assigned';
            taskRow.querySelector('td:nth-child(6) span').className = 'task-status status-assigned';
            taskRow.setAttribute('data-status', 'assigned');
            
            // Update actions column
            const actionsCell = taskRow.querySelector('td:nth-child(7)');
            actionsCell.innerHTML = `
                <button class="btn btn-secondary btn-sm" onclick="markAsCompleted('${taskId}')">
                    <i class="fas fa-check"></i> Complete
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteTask('${taskId}')">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        }
        
        // Send to backend with auto-assignment
        sendTaskToBackend({
            type: type,
            location: location,
            assignedTo: randomCleaner,
            status: 'assigned',
            priority: 'high'
        });
    } else {
        // For other types, just create a pending task
        sendTaskToBackend({
            type: type,
            location: location,
            status: 'pending'
        });
    }
}

// Filter tasks based on status
function filterTasks(filter) {
    const tasks = document.querySelectorAll('.task-item');
    
    tasks.forEach(task => {
        if (filter === 'all' || task.dataset.status === filter) {
            task.style.display = '';
        } else {
            task.style.display = 'none';
        }
    });
}

// Update dashboard statistics
function updateStats() {
    // Count garbage detected
    const garbageCount = document.querySelectorAll('.alert-item.garbage').length;
    document.getElementById('garbage-count').textContent = garbageCount;
    
    // Count spills detected
    const spillCount = document.querySelectorAll('.alert-item.spill').length;
    document.getElementById('spill-count').textContent = spillCount;
    
    // Count tasks assigned
    const assignedCount = document.querySelectorAll('.task-item[data-status="assigned"]').length;
    document.getElementById('task-count').textContent = assignedCount;
    
    // Count tasks completed
    const completedCount = document.querySelectorAll('.task-item[data-status="completed"]').length;
    document.getElementById('completed-count').textContent = completedCount;
}

// Add sample tasks for demo
function addSampleTasks() {
    addTask('garbage', 'Main Entrance', 'John Doe', 'assigned', '09:15:32');
    addTask('spill', 'Cafeteria', '', 'pending', '09:32:47');
    addTask('garbage', 'Meeting Room B', 'Sarah Davis', 'completed', '08:55:12');
}

// Add sample alerts for demo
function addSampleAlerts() {
    addAlert('garbage', 'Main Entrance');
    addAlert('spill', 'Cafeteria');
}

// API Functions to communicate with backend
async function sendTaskToBackend(taskData) {
    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(taskData)
        });
        
        const data = await response.json();
        console.log('Task sent to backend:', data);
        
        // Refresh tasks from backend
        fetchTasksFromBackend();
    } catch (error) {
        console.error('Error sending task to backend:', error);
    }
}

async function updateTaskStatusBackend(taskId, status) {
    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });
        
        const data = await response.json();
        console.log('Task status updated:', data);
    } catch (error) {
        console.error('Error updating task status:', error);
    }
}

async function deleteTaskBackend(taskId) {
    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        console.log('Task deleted:', data);
    } catch (error) {
        console.error('Error deleting task:', error);
    }
}

// Expose functions to global scope for button click handlers
window.openAssignModal = openAssignModal;
window.closeModal = closeModal;
window.markAsCompleted = markAsCompleted;
window.deleteTask = deleteTask;
window.dismissAlert = dismissAlert;
window.createTask = createTask; 