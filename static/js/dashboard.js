// Initialize the socket connection
const socket = io();

// DOM Elements
const alertCount = document.getElementById('alertCount');
const alertModal = new bootstrap.Modal(document.getElementById('alertModal'));
const alertsLink = document.getElementById('alertsLink');
const totalDetections = document.getElementById('totalDetections');
const pendingAlerts = document.getElementById('pendingAlerts');
const resolvedAlerts = document.getElementById('resolvedAlerts');
const avgResponseTime = document.getElementById('avgResponseTime');
const tasksTableBody = document.getElementById('tasksTableBody');
const toggleSidebar = document.getElementById('toggleSidebar');
const sidebar = document.getElementById('sidebar');
const navMenu = document.getElementById('navMenu');
const newTaskBtn = document.getElementById('newTaskBtn');
const newTaskModal = new bootstrap.Modal(document.getElementById('newTaskModal'));
const createTaskBtn = document.getElementById('createTaskBtn');
const alertsContainer = document.getElementById('alerts-container');
const alertCounter = document.getElementById('alert-counter');
const startButton = document.getElementById('start-button');
const stopButton = document.getElementById('stop-button');
const captureButton = document.getElementById('capture-button');
const videoElement = document.getElementById('video-feed');
const ruralForm = document.getElementById('rural-form');
const imageUpload = document.getElementById('image-upload');
const imagePreview = document.getElementById('image-preview');
const alertCountBadge = document.getElementById('alertCountBadge');
const alertsTab = document.getElementById('alertsTab');
const startCameraBtn = document.getElementById('startCameraBtn');
const stopCameraBtn = document.getElementById('stopCameraBtn');
const ruralRequestBtn = document.getElementById('ruralRequestBtn');
const toastContainer = document.getElementById('toast-container');

// Global variables
let currentAlert = null;
let alerts = [];
let isMobile = window.innerWidth < 768;
let displayedTasksCount = 10; // Track how many tasks are currently displayed
let selectedImage = null;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded - setting up event handlers");
    
    // Check screen size and adjust UI
    checkScreenSize();
    
    // Fetch existing alerts
    fetchAlerts();
    
    // Socket events
    socket.on('connect', () => {
        console.log('Connected to server');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
    
    socket.on('alert', (alert) => {
        console.log('New alert received:', alert);
        addAlert(alert);
        playAlertSound();
        updateDashboardStats();
    });
    
    socket.on('alert_update', (updatedAlert) => {
        updateAlertStatus(updatedAlert);
        updateDashboardStats();
    });
    
    socket.on('alerts', (serverAlerts) => {
        alerts = serverAlerts;
        updateAlertCount();
        updateDashboardStats();
    });
    
    // Event listeners
    alertsLink.addEventListener('click', function(e) {
        e.preventDefault();
        showLatestAlert();
    });
    
    // Toggle sidebar on mobile
    if (toggleSidebar) {
        toggleSidebar.addEventListener('click', function() {
            navMenu.classList.toggle('show-menu');
        });
    }
    
    // Listen for window resize
    window.addEventListener('resize', function() {
        checkScreenSize();
    });
    
    // New Task button click handler
    if (newTaskBtn) {
        newTaskBtn.addEventListener('click', function() {
            // Clear the form fields
            document.getElementById('newTaskForm').reset();
            // Show the new task modal
            newTaskModal.show();
        });
    }
    
    // Create Task button click handler in the modal
    if (createTaskBtn) {
        createTaskBtn.addEventListener('click', function() {
            createNewTask();
        });
    }
    
    // Rural request form handlers
    $('#openRuralRequestBtn').on('click', openRuralRequestForm);
    $('#ruralRequestImage').on('change', handleImageSelect);
    $('#submitRuralRequest').on('click', submitRuralRequest);
    $('#saveAlertChanges').on('click', updateAlertStatus);
    
    // Initialize tooltips
    $('[data-toggle="tooltip"]').tooltip();
    
    // Fetch and display alerts on page load
    fetchAlerts();
    
    // Event listeners
    if (startButton) startButton.addEventListener('click', startDetection);
    if (stopButton) stopButton.addEventListener('click', stopDetection);
    if (captureButton) captureButton.addEventListener('click', captureFrame);
    if (ruralForm) ruralForm.addEventListener('submit', submitRuralRequest);
    if (imageUpload) imageUpload.addEventListener('change', previewImage);
    
    // Socket events
    socket.on('new_alert', function(alert) {
        addAlert(alert);
        showToast('New alert received', 'success');
    });
    
    socket.on('alert_updated', function(alert) {
        updateAlertInUI(alert);
        showToast(`Alert status updated to: ${alert.status}`, 'info');
    });

    // Event listeners
    if (startCameraBtn) startCameraBtn.addEventListener('click', startCamera);
    if (stopCameraBtn) stopCameraBtn.addEventListener('click', stopCamera);
    if (ruralRequestBtn) ruralRequestBtn.addEventListener('click', () => {
        // Reset form and preview when opening modal
        if (ruralForm) ruralForm.reset();
        if (imagePreview) {
            imagePreview.innerHTML = '';
            imagePreview.classList.add('d-none');
        }
    });
    
    // Direct event listeners for buttons
    const setupModalEventListeners = function() {
        console.log("Setting up modal event listeners");
        const resolveAlertBtn = document.getElementById('resolveAlertBtn');
        const assignTaskBtn = document.getElementById('assignTaskBtn');
        
        console.log('resolveAlertBtn:', resolveAlertBtn);
        console.log('assignTaskBtn:', assignTaskBtn);
        
        if (resolveAlertBtn) {
            resolveAlertBtn.onclick = function() {
                console.log('Resolve button clicked. Current alert:', currentAlert);
                if (currentAlert) {
                    resolveAlert(currentAlert.id);
                } else {
                    console.error("No current alert found");
                    showToast('Error', 'No alert selected', 'error');
                }
            };
            console.log("Resolve button event listener attached");
        }
        
        if (assignTaskBtn) {
            assignTaskBtn.onclick = function() {
                console.log('Assign button clicked. Current alert:', currentAlert);
                if (currentAlert) {
                    const assignSelect = document.getElementById('assignSelect');
                    if (assignSelect) {
                        const assignTo = assignSelect.value;
                        console.log(`Assigning alert ${currentAlert.id} to ${assignTo}`);
                        assignAlert(currentAlert.id, assignTo);
                    } else {
                        console.error("Assignment select not found");
                        showToast('Error', 'Assignment select not found', 'error');
                    }
                } else {
                    console.error("No current alert found");
                    showToast('Error', 'No alert selected', 'error');
                }
            };
            console.log("Assign button event listener attached");
        }
    };
    
    // Call the setup function immediately
    setupModalEventListeners();
    
    // Set up mutation observer to monitor for dynamic modal creation
    const body = document.body;
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                for (let i = 0; i < mutation.addedNodes.length; i++) {
                    const node = mutation.addedNodes[i];
                    if (node.id === 'alertModal') {
                        console.log("Alert modal dynamically added to DOM");
                        setupModalEventListeners();
                    }
                }
            }
        });
    });
    
    observer.observe(body, { childList: true, subtree: true });
});

// Functions
function checkScreenSize() {
    isMobile = window.innerWidth < 768;
    
    // Adjust UI based on screen size
    if (isMobile) {
        if (navMenu) navMenu.classList.remove('show-menu');
    }
}

function fetchAlerts() {
    fetch('/api/alerts')
        .then(response => response.json())
        .then(data => {
            alerts = data;
            updateAlertCount();
            updateDashboardStats();
            updateTasksTable();
        })
        .catch(error => console.error('Error fetching alerts:', error));
}

function addAlert(alert) {
    alerts.unshift(alert);  // Add to beginning of array
    updateAlertCount();
    updateTasksTable();
}

function updateAlertCount() {
    const pendingCount = alerts.filter(a => a.status === 'pending').length;
    alertCount.textContent = pendingCount;
    
    if (pendingCount > 0) {
        alertCount.style.display = 'inline-block';
    } else {
        alertCount.style.display = 'none';
    }
}

function showAlertModal(alert) {
    console.log("Opening alert modal with alert:", alert);
    
    // Set current alert - important for the resolve/assign functionality
    currentAlert = alert;
    
    // Populate modal with alert information
    const alertIdElement = document.getElementById('alert-id');
    const alertTimeElement = document.getElementById('alert-time');
    const alertLocationElement = document.getElementById('alert-location');
    const alertMessageElement = document.getElementById('alert-message');
    const alertStatusElement = document.getElementById('alert-status');
    const alertAssignedToElement = document.getElementById('alert-assigned-to');
    const alertImageContainer = document.getElementById('alert-image-container');
    
    if (alertIdElement) alertIdElement.textContent = alert.id;
    if (alertTimeElement) alertTimeElement.textContent = formatDateAndTime(alert.timestamp);
    if (alertLocationElement) alertLocationElement.textContent = alert.location;
    if (alertMessageElement) alertMessageElement.textContent = alert.message || 'No details available';
    
    // Check if this is a rural area request
    const isRuralRequest = alert.message && alert.message.includes('Rural Area Request');
    
    // Display image if available (for rural area requests)
    if (alertImageContainer) {
        alertImageContainer.innerHTML = '';
        if (isRuralRequest && alert.imageUrl) {
            const img = document.createElement('img');
            img.src = alert.imageUrl;
            img.classList.add('img-fluid', 'rounded', 'mb-3');
            img.alt = 'Request image';
            alertImageContainer.appendChild(img);
        }
    }
    
    // Set status badge with appropriate color
    if (alertStatusElement) {
        alertStatusElement.innerHTML = '';
        const statusBadge = document.createElement('span');
        statusBadge.className = `badge ${getBadgeClass(alert.status)}`;
        statusBadge.textContent = alert.status;
        alertStatusElement.appendChild(statusBadge);
    }
    
    if (alertAssignedToElement) {
        alertAssignedToElement.value = alert.assignedTo || '';
    }
    
    // Set up the status dropdown in the modal
    const statusSelect = document.getElementById('alert-status-select');
    if (statusSelect) {
        statusSelect.value = alert.status;
    }
    
    // Set up save changes button
    const saveChangesBtn = document.getElementById('save-alert-changes');
    if (saveChangesBtn) {
        saveChangesBtn.onclick = function() {
            updateAlertStatus(alert.id);
        };
    }
    
    // Check if the resolve and assign buttons should be enabled based on alert status
    const resolveAlertBtn = document.getElementById('resolveAlertBtn');
    const assignTaskBtn = document.getElementById('assignTaskBtn');
    
    if (resolveAlertBtn && assignTaskBtn) {
        // Enable/disable buttons based on status
        if (alert.status === 'resolved') {
            resolveAlertBtn.disabled = true;
            assignTaskBtn.disabled = true;
        } else {
            resolveAlertBtn.disabled = false;
            assignTaskBtn.disabled = false;
        }
        
        // Add direct event handlers right here in the modal open
        resolveAlertBtn.onclick = function() {
            console.log('Resolve button clicked directly from modal. Current alert:', currentAlert);
            resolveAlert(alert.id);
            return false; // Prevent default
        };
        
        assignTaskBtn.onclick = function() {
            console.log('Assign button clicked directly from modal. Current alert:', currentAlert);
            const assignSelect = document.getElementById('assignSelect');
            if (assignSelect) {
                const assignTo = assignSelect.value;
                console.log(`Assigning alert ${alert.id} to ${assignTo}`);
                assignAlert(alert.id, assignTo);
            } else {
                console.error("Assignment select not found");
                showToast('Error', 'Assignment select not found', 'error');
            }
            return false; // Prevent default
        };
    }
    
    // Show the modal
    const alertModal = new bootstrap.Modal(document.getElementById('alertModal'));
    alertModal.show();
    
    // Additional safeguard: reattach event listeners after modal is shown
    document.getElementById('alertModal').addEventListener('shown.bs.modal', function() {
        console.log("Modal shown event - reattaching button handlers");
        
        // Re-get the buttons
        const resolveBtn = document.getElementById('resolveAlertBtn');
        const assignBtn = document.getElementById('assignTaskBtn');
        
        if (resolveBtn) {
            resolveBtn.onclick = function() {
                console.log('Resolve button clicked from shown event. Current alert:', currentAlert);
                resolveAlert(alert.id);
                return false;
            };
        }
        
        if (assignBtn) {
            assignBtn.onclick = function() {
                console.log('Assign button clicked from shown event. Current alert:', currentAlert);
                const select = document.getElementById('assignSelect');
                if (select) {
                    assignAlert(alert.id, select.value);
                }
                return false;
            };
        }
    });
}

function showLatestAlert() {
    if (alerts.length > 0) {
        const pendingAlerts = alerts.filter(a => a.status === 'pending');
        if (pendingAlerts.length > 0) {
            showAlertModal(pendingAlerts[0]);
        } else {
            showAlertModal(alerts[0]);
        }
    }
}

function updateAlertStatus(updatedAlert) {
    const index = alerts.findIndex(a => a.id === updatedAlert.id);
    if (index !== -1) {
        alerts[index] = updatedAlert;
        updateAlertCount();
        updateTasksTable();
    }
}

function formatDateAndTime(timestamp) {
    if (!timestamp) return 'Unknown time';
    
    try {
        const date = new Date(timestamp);
        return date.toLocaleString([], { 
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (e) {
        console.error('Error formatting time:', e);
        return timestamp.toString();
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

function updateDashboardStats() {
    // Update summary statistics
    totalDetections.textContent = alerts.length;
    pendingAlerts.textContent = alerts.filter(a => a.status === 'pending').length;
    resolvedAlerts.textContent = alerts.filter(a => a.status === 'assigned').length;
    avgResponseTime.textContent = alerts.filter(a => a.status === 'resolved').length;
}

function updateTasksTable(resetPagination = true) {
    tasksTableBody.innerHTML = '';
    
    if (resetPagination) {
        displayedTasksCount = 10; // Reset to initial count when refreshing
    }
    
    if (alerts.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `
            <td colspan="6" class="text-center">No tasks available</td>
        `;
        tasksTableBody.appendChild(emptyRow);
        return;
    }
    
    // Show tasks up to the displayedTasksCount
    const tasksToShow = Math.min(displayedTasksCount, alerts.length);
    const recentAlerts = alerts.slice(0, tasksToShow);
    
    recentAlerts.forEach(alert => {
        const tr = document.createElement('tr');
        // Check if this is a rural area request
        const isRuralRequest = alert.message && alert.message.includes('Rural Area Request');
        
        tr.innerHTML = `
            <td>#${alert.id}</td>
            <td>${formatDateAndTime(alert.timestamp)}</td>
            <td>
                ${alert.location}
                ${isRuralRequest ? '<span class="badge bg-info ms-1">Rural</span>' : ''}
            </td>
            <td class="d-none d-md-table-cell">${alert.assignedTo || 'Unassigned'}</td>
            <td><span class="badge ${getBadgeClass(alert.status)}">${alert.status}</span></td>
            <td>
                <button class="btn btn-sm btn-info view-task" data-id="${alert.id}"><i class="fas fa-eye"></i></button>
            </td>
        `;
        
        tasksTableBody.appendChild(tr);
    });
    
    // Add "Load More" row if there are more alerts to show
    if (alerts.length > displayedTasksCount) {
        const loadMoreRow = document.createElement('tr');
        loadMoreRow.className = 'load-more-row';
        loadMoreRow.innerHTML = `
            <td colspan="6" class="text-center">
                <button class="btn btn-sm btn-outline-primary load-more-btn">
                    Load More Tasks (${alerts.length - displayedTasksCount} remaining)
                </button>
            </td>
        `;
        tasksTableBody.appendChild(loadMoreRow);
        
        // Add click listener to the Load More button
        document.querySelector('.load-more-btn').addEventListener('click', loadMoreTasks);
    }
    
    // Add click listeners to view buttons
    document.querySelectorAll('.view-task').forEach(btn => {
        btn.addEventListener('click', () => {
            const alertId = parseInt(btn.getAttribute('data-id'));
            const alert = alerts.find(a => a.id === alertId);
            if (alert) {
                showAlertModal(alert);
            }
        });
    });
}

function loadMoreTasks() {
    // Increase the number of displayed tasks
    displayedTasksCount += 10;
    // Update the table without resetting pagination
    updateTasksTable(false);
}

function playAlertSound() {
    // Create and play alert sound
    const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-alert-quick-chime-766.mp3');
    audio.play().catch(e => console.log('Error playing sound:', e));
}

function createNewTask() {
    // Get form values
    const message = document.getElementById('taskMessage').value;
    const location = document.getElementById('taskLocation').value;
    const assignee = document.getElementById('taskAssignee').value;
    const priority = document.getElementById('taskPriority').value;
    
    // Validate form inputs
    if (!message || !location || !assignee) {
        alert('Please fill out all required fields.');
        return;
    }
    
    // Create a new task alert object
    const newTask = {
        message: message,
        location: location,
        assignedTo: assignee,
        status: 'assigned',
        timestamp: new Date().toISOString(),
        priority: priority
    };
    
    // Send the task to the server
    fetch('/api/alerts', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(newTask)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to create task');
        }
        return response.json();
    })
    .then(data => {
        // Add the new task to the local alerts array
        addAlert(data);
        // Close the modal
        newTaskModal.hide();
        // Show success message
        showToast('Task created successfully', 'success');
    })
    .catch(error => {
        console.error('Error creating task:', error);
        // If the API endpoint doesn't exist, we'll simulate adding a task locally
        console.log('Falling back to local task creation');
        simulateTaskCreation(newTask);
    });
}

function simulateTaskCreation(task) {
    // Create a task ID based on the current timestamp
    const taskId = alerts.length + 1;
    
    // Create a new task with an ID
    const newTask = {
        ...task,
        id: taskId
    };
    
    // Add to our local alerts array
    alerts.unshift(newTask);
    
    // Update UI
    updateAlertCount();
    updateDashboardStats();
    updateTasksTable();
    
    // Close the modal
    newTaskModal.hide();
    
    // Show success feedback
    showToast('Task created successfully', 'success');
}

function showToast(title, message, type = 'info') {
    const toastId = 'toast-' + Date.now();
    const bgClass = type === 'success' ? 'bg-success' : 
                   type === 'error' ? 'bg-danger' : 
                   type === 'warning' ? 'bg-warning' : 'bg-info';
    
    // Create toast container if it doesn't exist
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        toastContainer.style.zIndex = "11";
        document.body.appendChild(toastContainer);
    }
    
    const toastHTML = `
    <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="5000">
        <div class="toast-header ${bgClass} text-white">
            <strong class="me-auto">${title}</strong>
            <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
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

// Function to open rural area request form
function openRuralRequestForm() {
    $('#ruralRequestModal').modal('show');
}

// Function to handle image selection
function handleImageSelect(event) {
    const file = event.target.files[0];
    if (file) {
        selectedImage = file;
        
        // Display preview
        const reader = new FileReader();
        reader.onload = function(e) {
            $('#imagePreview').attr('src', e.target.result).show();
        };
        reader.readAsDataURL(file);
    }
}

// Function to submit rural area request
function submitRuralRequest(form) {
    // Create FormData object
    const formData = new FormData(form);
    
    // Send request to backend
    fetch('/api/rural-request', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Show success toast and close modal
            showToast('Success', 'Rural area request submitted successfully', 'success');
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('ruralRequestModal'));
            if (modal) modal.hide();
            
            // Reset form
            form.reset();
            imagePreview.innerHTML = '';
            imagePreview.classList.add('d-none');
        } else {
            showToast('Error', data.message || 'Failed to submit request', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showToast('Error', 'An unexpected error occurred', 'error');
    });
}

// Function to reset the rural request form
function resetRuralRequestForm() {
    $('#ruralRequestLocation').val('');
    $('#ruralRequestMessage').val('');
    $('#ruralRequestImage').val('');
    $('#imagePreview').attr('src', '').hide();
    selectedImage = null;
}

// Update showAlertDetails function to handle image display
function showAlertDetails(alert) {
    // ... existing code ...
    
    // Update the modal with alert details
    $('#alert-id').text(alert.id);
    $('#alert-time').text(alert.timestamp);
    $('#alert-location').text(alert.location);
    $('#alert-status').text(alert.status);
    $('#alert-assigned').text(alert.assigned_to || 'Not assigned');
    
    // Set the alert ID for the status update form
    $('#alert-id-input').val(alert.id);
    
    // Handle image display for rural requests
    if (alert.type === 'rural_request' && alert.image_path) {
        $('#alert-image-container').show();
        $('#alert-image').attr('src', alert.image_path);
    } else {
        $('#alert-image-container').hide();
    }
    
    // Show the modal
    $('#alertModal').modal('show');
}

// Function to update alert status
function updateAlertStatus(alertId, newStatus) {
    fetch('/api/update-alert-status', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            id: alertId,
            status: newStatus
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Success', 'Alert status updated', 'success');
        } else {
            showToast('Error', data.message || 'Failed to update alert status', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showToast('Error', 'An unexpected error occurred', 'error');
    });
}

// Preview uploaded image
function previewImage(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            imagePreview.innerHTML = `<img src="${event.target.result}" class="img-fluid" alt="Preview">`;
            imagePreview.classList.remove('d-none');
        };
        reader.readAsDataURL(file);
    } else {
        imagePreview.innerHTML = '';
        imagePreview.classList.add('d-none');
    }
}

// Update an existing alert in the UI
function updateAlertInUI(updatedAlert) {
    const alertElement = document.querySelector(`#alert-${updatedAlert.id}`);
    if (alertElement) {
        const statusBadge = alertElement.querySelector('.alert-status');
        if (statusBadge) {
            // Update badge class
            statusBadge.className = 'alert-status badge';
            
            // Add appropriate class based on status
            if (updatedAlert.status === 'resolved') {
                statusBadge.classList.add('bg-success');
            } else if (updatedAlert.status === 'in-progress') {
                statusBadge.classList.add('bg-warning');
            } else {
                statusBadge.classList.add('bg-danger');
            }
            
            statusBadge.textContent = updatedAlert.status;
        }
    }
}

// Completely rewrite the assignAlert function to ensure it works properly
function assignAlert(alertId, assignTo) {
    console.log(`Assigning alert ${alertId} to ${assignTo}`);
    
    // Show feedback toast that we're processing
    showToast('Processing', 'Assigning task...', 'info');
    
    // Make the API request
    fetch(`/api/alerts/${alertId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            status: 'assigned',
            assignedTo: assignTo
        })
    })
    .then(response => {
        console.log('Assign API response:', response);
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || `Server responded with status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(updatedAlert => {
        console.log('Alert assigned successfully:', updatedAlert);
        
        // Update the alert in our local array
        const index = alerts.findIndex(a => a.id === updatedAlert.id);
        if (index !== -1) {
            alerts[index] = updatedAlert;
            updateTasksTable();
            updateAlertCount();
        }
        
        // Close the modal
        try {
            const alertModalElement = document.getElementById('alertModal');
            if (alertModalElement) {
                const bsModal = bootstrap.Modal.getInstance(alertModalElement);
                if (bsModal) {
                    bsModal.hide();
                } else {
                    alertModalElement.classList.remove('show');
                    alertModalElement.style.display = 'none';
                    const modalBackdrops = document.getElementsByClassName('modal-backdrop');
                    if (modalBackdrops.length > 0) {
                        for (let i = 0; i < modalBackdrops.length; i++) {
                            document.body.removeChild(modalBackdrops[i]);
                        }
                    }
                    document.body.classList.remove('modal-open');
                }
            }
        } catch (e) {
            console.error('Error closing modal:', e);
        }
        
        // Show success notification
        showToast('Success', `Task assigned to ${assignTo}`, 'success');
    })
    .catch(error => {
        console.error('Error assigning task:', error);
        showToast('Error', `Failed to assign task: ${error.message}`, 'error');
    });
}

// Completely rewrite the resolveAlert function to ensure it works properly
function resolveAlert(alertId) {
    console.log(`Resolving alert ${alertId}`);
    
    // Show feedback toast that we're processing
    showToast('Processing', 'Resolving task...', 'info');
    
    // Make the API request
    fetch(`/api/alerts/${alertId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            status: 'resolved'
        })
    })
    .then(response => {
        console.log('Resolve API response:', response);
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || `Server responded with status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(updatedAlert => {
        console.log('Alert resolved successfully:', updatedAlert);
        
        // Update the alert in our local array
        const index = alerts.findIndex(a => a.id === updatedAlert.id);
        if (index !== -1) {
            alerts[index] = updatedAlert;
            updateTasksTable();
            updateAlertCount();
        }
        
        // Close the modal
        try {
            const alertModalElement = document.getElementById('alertModal');
            if (alertModalElement) {
                const bsModal = bootstrap.Modal.getInstance(alertModalElement);
                if (bsModal) {
                    bsModal.hide();
                } else {
                    alertModalElement.classList.remove('show');
                    alertModalElement.style.display = 'none';
                    const modalBackdrops = document.getElementsByClassName('modal-backdrop');
                    if (modalBackdrops.length > 0) {
                        for (let i = 0; i < modalBackdrops.length; i++) {
                            document.body.removeChild(modalBackdrops[i]);
                        }
                    }
                    document.body.classList.remove('modal-open');
                }
            }
        } catch (e) {
            console.error('Error closing modal:', e);
        }
        
        // Show success notification
        showToast('Success', 'Task marked as resolved', 'success');
    })
    .catch(error => {
        console.error('Error resolving task:', error);
        showToast('Error', `Failed to resolve task: ${error.message}`, 'error');
    });
} 