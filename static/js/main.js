// Initialize the socket connection
const socket = io();

// DOM Elements
const videoFeed = document.getElementById('videoFeed');
const alertsList = document.getElementById('alertsList');
const alertCount = document.getElementById('alertCount');
const alertModal = new bootstrap.Modal(document.getElementById('alertModal'));
const alertsLink = document.getElementById('alertsLink');
const alertMessage = document.getElementById('alertMessage');
const alertLocation = document.getElementById('alertLocation');
const alertTime = document.getElementById('alertTime');
const resolveAlertBtn = document.getElementById('resolveAlertBtn');
const assignTaskBtn = document.getElementById('assignTaskBtn');
const startVideoBtn = document.getElementById('startVideoBtn');
const stopVideoBtn = document.getElementById('stopVideoBtn');
const lastDetection = document.getElementById('lastDetection');
const cameraStatus = document.getElementById('cameraStatus');
const aiStatus = document.getElementById('aiStatus');
const notificationStatus = document.getElementById('notificationStatus');
const cameraOverlayStatus = document.getElementById('cameraOverlayStatus');

// Global variables
let currentAlert = null;
let alerts = [];
let isVideoRunning = false;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Bootstrap components
    const alertModalEl = document.getElementById('alertModal');
    const alertModal = alertModalEl ? new bootstrap.Modal(alertModalEl) : null;
    
    // Fetch existing alerts
    fetchAlerts();
    
    // Socket events
    socket.on('connect', () => {
        console.log('Connected to server');
        updateSystemStatus('connected');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateSystemStatus('disconnected');
    });
    
    socket.on('alert', (alert) => {
        console.log('New alert received:', alert);
        addAlert(alert);
        playAlertSound();
        updateLastDetectionTime(alert.timestamp);
        
        // Show alert notification
        if (isVideoRunning) {
            showAlertModal(alert, alertModal);
        }
    });
    
    socket.on('alert_update', (updatedAlert) => {
        updateAlertStatus(updatedAlert);
    });
    
    socket.on('alerts', (serverAlerts) => {
        alerts = serverAlerts;
        updateAlertsList(alertModal);
        updateAlertCount();
    });
    
    // Event listeners
    if (alertsLink) {
        alertsLink.addEventListener('click', function(e) {
            e.preventDefault();
            showLatestAlert(alertModal);
        });
    }
    
    // Find and add listeners to alert action buttons
    if (resolveAlertBtn) {
        resolveAlertBtn.addEventListener('click', function() {
            if (currentAlert) {
                resolveAlert(currentAlert.id, alertModal);
            }
        });
    }
    
    if (assignTaskBtn) {
        assignTaskBtn.addEventListener('click', function() {
            if (currentAlert) {
                const assignTo = document.getElementById('assignSelect').value;
                assignAlert(currentAlert.id, assignTo, alertModal);
            }
        });
    }
    
    // Add event listeners for start/stop video buttons
    if (startVideoBtn) {
        startVideoBtn.addEventListener('click', function() {
            startVideo();
        });
    }
    
    if (stopVideoBtn) {
        stopVideoBtn.addEventListener('click', function() {
            stopVideo();
        });
    }
    
    // Add event listener for the refresh alerts button
    const refreshAlertsBtn = document.getElementById('refreshAlertsBtn');
    if (refreshAlertsBtn) {
        refreshAlertsBtn.addEventListener('click', function() {
            // Get the icon element
            const icon = this.querySelector('i.fas.fa-sync');
            
            // Add animation class to the icon
            if (icon) {
                icon.classList.add('fa-spin');
            }
            
            // Fetch alerts from the server
            fetchAlerts()
                .then(() => {
                    // Remove animation after a short delay
                    setTimeout(() => {
                        if (icon) {
                            icon.classList.remove('fa-spin');
                        }
                    }, 1000);
                })
                .catch(() => {
                    if (icon) {
                        icon.classList.remove('fa-spin');
                    }
                });
        });
    }
    
    // Handle rural request form submission
    const ruralForm = document.getElementById('rural-form');
    if (ruralForm) {
        ruralForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            
            fetch('/api/rural-request', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Show success message
                    showToast('Success', 'Rural area request submitted successfully', 'success');
                    
                    // Hide the modal if it exists
                    const ruralModal = document.getElementById('ruralRequestModal');
                    if (ruralModal) {
                        const bsModal = bootstrap.Modal.getInstance(ruralModal);
                        if (bsModal) bsModal.hide();
                    }
                    
                    // Reset form and image preview
                    this.reset();
                    const imagePreview = document.getElementById('image-preview');
                    if (imagePreview) {
                        imagePreview.innerHTML = '';
                        imagePreview.classList.add('d-none');
                    }
                } else {
                    showToast('Error', data.message || 'Failed to submit request', 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showToast('Error', 'An unexpected error occurred', 'error');
            });
        });
    }
    
    // Initialize video state
    if (startVideoBtn && stopVideoBtn) {
        startVideoBtn.disabled = false;
        stopVideoBtn.disabled = true;
    }
});

// Functions
function fetchAlerts() {
    return fetch('/api/alerts')
        .then(response => response.json())
        .then(data => {
            alerts = data;
            updateAlertsList();
            updateAlertCount();
            return data; // Return the data for promise chaining
        })
        .catch(error => {
            console.error('Error fetching alerts:', error);
            throw error; // Re-throw the error for promise chaining
        });
}

function addAlert(alert) {
    alerts.unshift(alert);  // Add to beginning of array
    updateAlertsList();
    updateAlertCount();
}

function updateAlertsList(modal) {
    if (!alertsList) return;
    
    alertsList.innerHTML = '';
    
    if (alerts.length === 0) {
        alertsList.innerHTML = '<div class="empty-state">No alerts yet</div>';
        return;
    }
    
    // Show only the last 5 alerts
    const recentAlerts = alerts.slice(0, 5);
    
    recentAlerts.forEach(alert => {
        const alertItem = document.createElement('div');
        alertItem.className = 'alert-item';
        
        // Check if it's garbage or another type of alert
        const alertType = alert.message && alert.message.toLowerCase().includes('garbage') ? 'garbage' : 'spill';
        const statusClass = alert.status === 'pending' ? 'bg-danger' : 
                            alert.status === 'assigned' ? 'bg-warning' : 'bg-success';
        
        alertItem.innerHTML = `
            <div class="alert-icon ${alertType}">
                <i class="fas fa-${alertType === 'garbage' ? 'trash-alt' : 'water'}"></i>
            </div>
            <div class="alert-content">
                <h6>${alert.message || 'Alert'}</h6>
                <p>Location: ${alert.location || 'Unknown'}</p>
                <p class="alert-time">${formatTime(alert.timestamp)}</p>
                <span class="badge ${statusClass}">${alert.status || 'pending'}</span>
            </div>
            <div class="alert-actions">
                <button class="btn btn-primary btn-sm assign-btn">Assign</button>
                <button class="btn btn-light btn-sm resolve-btn">Dismiss</button>
            </div>
        `;
        
        alertsList.appendChild(alertItem);
        
        // Add event listeners after the element is added to the DOM
        // Using event delegation to handle button clicks
        const content = alertItem.querySelector('.alert-content');
        const assignBtn = alertItem.querySelector('.assign-btn');
        const resolveBtn = alertItem.querySelector('.resolve-btn');
        
        if (content) {
            // Make the content area clickable to show alert details
            content.addEventListener('click', () => {
                showAlertModal(alert, modal);
            });
        }
        
        if (assignBtn) {
            // Assign button
            assignBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering the parent's click event
                showAlertModal(alert, modal);
                
                // Focus the assign select dropdown when modal opens
                const alertModalElement = document.getElementById('alertModal');
                if (alertModalElement) {
                    alertModalElement.addEventListener('shown.bs.modal', function() {
                        const assignSelect = document.getElementById('assignSelect');
                        if (assignSelect) assignSelect.focus();
                    }, { once: true });
                }
            });
        }
        
        if (resolveBtn) {
            // Resolve button
            resolveBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering the parent's click event
                resolveAlert(alert.id, modal);
                
                // Visual feedback - fade out the alert item
                alertItem.style.opacity = '0.5';
                setTimeout(() => {
                    updateAlertsList(); // Refresh the list after a short delay
                }, 500);
            });
        }
    });
}

function formatTime(timestamp) {
    if (!timestamp) return 'Unknown time';
    
    try {
        // Check if timestamp is a string or Date object
        const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
        console.error('Error formatting time:', e);
        return String(timestamp);
    }
}

function updateAlertCount() {
    if (!alertCount) return;
    
    const pendingCount = alerts.filter(a => a.status === 'pending').length;
    alertCount.textContent = pendingCount;
    
    if (pendingCount > 0) {
        alertCount.style.display = 'inline-block';
    } else {
        alertCount.style.display = 'none';
    }
}

function showAlertModal(alert, modal) {
    if (!alertMessage || !alertLocation || !alertTime) return;
    
    currentAlert = alert;
    
    // Update modal content
    alertMessage.textContent = alert.message || 'No details available';
    alertLocation.textContent = alert.location || 'Unknown location';
    alertTime.textContent = formatTime(alert.timestamp);
    
    // Update status badge if it exists
    const alertStatusEl = document.getElementById('alert-status');
    if (alertStatusEl) {
        alertStatusEl.innerHTML = '';
        const statusBadge = document.createElement('span');
        statusBadge.className = `badge ${getBadgeClass(alert.status)}`;
        statusBadge.textContent = alert.status || 'pending';
        alertStatusEl.appendChild(statusBadge);
    }
    
    // Update assigned to input if it exists
    const alertAssignedToEl = document.getElementById('alert-assigned-to');
    if (alertAssignedToEl) {
        alertAssignedToEl.value = alert.assignedTo || '';
    }
    
    // Update status select if it exists
    const statusSelectEl = document.getElementById('alert-status-select');
    if (statusSelectEl && alert.status) {
        statusSelectEl.value = alert.status;
    }
    
    // Update button states based on alert status
    const resolveAlertBtn = document.getElementById('resolveAlertBtn');
    const assignTaskBtn = document.getElementById('assignTaskBtn');
    
    if (resolveAlertBtn && assignTaskBtn) {
        if (alert.status === 'resolved') {
            resolveAlertBtn.disabled = true;
            assignTaskBtn.disabled = true;
        } else {
            resolveAlertBtn.disabled = false;
            assignTaskBtn.disabled = false;
        }
    }
    
    // Set up save changes button if it exists
    const saveChangesBtn = document.getElementById('save-alert-changes');
    if (saveChangesBtn) {
        saveChangesBtn.onclick = function() {
            updateAlertStatus(alert.id);
            
            // Close the modal
            const alertModalElement = document.getElementById('alertModal');
            if (alertModalElement) {
                const bsModal = bootstrap.Modal.getInstance(alertModalElement);
                if (bsModal) bsModal.hide();
            }
        };
    }
    
    // Show the modal
    const alertModalElement = document.getElementById('alertModal');
    if (alertModalElement) {
        const modalInstance = bootstrap.Modal.getOrCreateInstance(alertModalElement);
        modalInstance.show();
    }
}

function showLatestAlert(modal) {
    if (alerts.length > 0) {
        const pendingAlerts = alerts.filter(a => a.status === 'pending');
        if (pendingAlerts.length > 0) {
            showAlertModal(pendingAlerts[0], modal);
        } else {
            showAlertModal(alerts[0], modal);
        }
    }
}

function resolveAlert(alertId, modal) {
    fetch(`/api/alerts/${alertId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'resolved' }),
    })
    .then(response => response.json())
    .then(updatedAlert => {
        updateAlertStatus(updatedAlert);
        
        // Close modal if it exists and was provided
        if (modal) {
            modal.hide();
        } else {
            // Try to close the modal anyway
            const alertModalElement = document.getElementById('alertModal');
            if (alertModalElement) {
                const bsModal = bootstrap.Modal.getInstance(alertModalElement);
                if (bsModal) bsModal.hide();
            }
        }
        
        showToast('Success', 'Alert marked as resolved', 'success');
    })
    .catch(error => {
        console.error('Error updating alert:', error);
        showToast('Error', 'Failed to resolve alert', 'error');
    });
}

function assignAlert(alertId, assignTo, modal) {
    fetch(`/api/alerts/${alertId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            status: 'assigned', 
            assignedTo: assignTo 
        }),
    })
    .then(response => response.json())
    .then(updatedAlert => {
        updateAlertStatus(updatedAlert);
        
        // Close modal if it exists and was provided
        if (modal) {
            modal.hide();
        } else {
            // Try to close the modal anyway
            const alertModalElement = document.getElementById('alertModal');
            if (alertModalElement) {
                const bsModal = bootstrap.Modal.getInstance(alertModalElement);
                if (bsModal) bsModal.hide();
            }
        }
        
        showToast('Success', 'Alert assigned successfully', 'success');
    })
    .catch(error => {
        console.error('Error assigning alert:', error);
        showToast('Error', 'Failed to assign alert', 'error');
    });
}

function updateAlertStatus(updatedAlert) {
    const index = alerts.findIndex(a => a.id === updatedAlert.id);
    if (index !== -1) {
        alerts[index] = updatedAlert;
        updateAlertsList();
        updateAlertCount();
    }
}

function getBadgeClass(status) {
    switch (status) {
        case 'pending': return 'bg-danger';
        case 'assigned': return 'bg-warning';
        case 'resolved': return 'bg-success';
        default: return 'bg-secondary';
    }
}

function updateSystemStatus(status) {
    if (!cameraStatus || !aiStatus || !notificationStatus) return;
    
    if (status === 'connected') {
        cameraStatus.textContent = 'Online';
        aiStatus.textContent = 'Running';
        notificationStatus.textContent = 'Active';
        
        document.querySelectorAll('.status-icon').forEach(icon => {
            if (icon.parentElement.querySelector('.status-details h6').textContent !== 'Last Detection') {
                icon.classList.add('online');
                icon.classList.remove('danger');
            }
        });
    } else {
        cameraStatus.textContent = 'Offline';
        aiStatus.textContent = 'Stopped';
        notificationStatus.textContent = 'Inactive';
        
        document.querySelectorAll('.status-icon').forEach(icon => {
            if (icon.parentElement.querySelector('.status-details h6').textContent !== 'Last Detection') {
                icon.classList.remove('online');
                icon.classList.add('danger');
            }
        });
    }
}

function startVideo() {
    if (!videoFeed || !startVideoBtn || !stopVideoBtn || !cameraOverlayStatus) return;
    
    isVideoRunning = true;
    
    // Make a request to the server to start the video feed
    fetch('/api/start_video', {
        method: 'POST',
    })
    .then(response => response.json())
    .then(data => {
        console.log('Video started:', data);
        
        // Reload the video feed with a cache-busting parameter
        videoFeed.src = "/video_feed?t=" + new Date().getTime();
        
        // Show the video feed
        videoFeed.style.display = 'block';
        
        // Update buttons
        startVideoBtn.disabled = true;
        stopVideoBtn.disabled = false;
        
        // Update status
        cameraOverlayStatus.textContent = 'Camera Active';
        cameraOverlayStatus.style.backgroundColor = 'rgba(0, 150, 0, 0.7)';
        
        // Show toast notification
        showToast('Success', 'Camera started successfully', 'success');
    })
    .catch(error => {
        console.error('Error starting video:', error);
        showToast('Error', 'Failed to start video feed', 'error');
        isVideoRunning = false;
    });
}

function stopVideo() {
    if (!videoFeed || !startVideoBtn || !stopVideoBtn || !cameraOverlayStatus) return;
    
    isVideoRunning = false;
    
    // Make a request to the server to stop the video feed
    fetch('/api/stop_video', {
        method: 'POST',
    })
    .then(response => response.json())
    .then(data => {
        console.log('Video stopped:', data);
        
        // Use a data URI for a black image with text instead of relying on an external file
        videoFeed.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">' +
            '<rect width="640" height="480" fill="black"/>' +
            '<text x="320" y="240" font-family="Arial" font-size="24" fill="white" text-anchor="middle">Camera Off</text>' +
            '</svg>'
        );
        
        // Update buttons
        startVideoBtn.disabled = false;
        stopVideoBtn.disabled = true;
        
        // Update status
        cameraOverlayStatus.textContent = 'Camera Idle';
        cameraOverlayStatus.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        
        // Show toast notification
        showToast('Info', 'Camera stopped', 'info');
    })
    .catch(error => {
        console.error('Error stopping video:', error);
        showToast('Error', 'Failed to stop video feed', 'error');
        isVideoRunning = true;
    });
}

function playAlertSound() {
    // Create and play alert sound
    const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-alert-quick-chime-766.mp3');
    audio.play().catch(e => console.log('Error playing sound:', e));
}

function updateLastDetectionTime(timestamp) {
    if (lastDetection) {
        const date = new Date(timestamp);
        lastDetection.textContent = formatTime(date);
    }
}

function showToast(title, message, type = 'info') {
    // Create toast container if it doesn't exist
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(toastContainer);
    }
    
    // Create toast element
    const toastId = 'toast-' + Date.now();
    const bgClass = type === 'success' ? 'bg-success' : 
                   type === 'error' ? 'bg-danger' : 
                   type === 'warning' ? 'bg-warning' : 'bg-info';
    
    const toastHTML = `
    <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="5000">
        <div class="toast-header ${bgClass} text-white">
            <strong class="me-auto">${title}</strong>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body">
            ${message}
        </div>
    </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
    
    // Remove toast from DOM after it's hidden
    toastElement.addEventListener('hidden.bs.toast', function() {
        toastElement.remove();
    });
} 