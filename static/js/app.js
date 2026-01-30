/**
 * Main Application Logic
 * Handles tab switching, uploads, analysis, review wizard, and export
 */

// Global state
const appState = {
    uploadedImages: [],
    canvasDrawer: null,
    colors: [],
    currentReviewIndex: 0,
    reviewData: [],
    reviewedParts: new Set(),  // Track which parts have been reviewed
    pdfData: null,  // Store PDF page data
    oftenParts: [],  // Often unrecognized parts (loaded dynamically)
    isAutoDetecting: false,  // Track auto-detect state
    recentColors: [],  // Recently used colors (max 3)
    usedColors: [],  // Colors that have been used in the current set
    userAddedParts: [],  // Parts that user manually added with part number and image
    helpBoxTutorialShown: false  // Track if help box tutorial was shown
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeCanvas();
    initializeUpload();
    initializeAnalysis();
    loadColors();
    loadOftenParts();
    checkAndResetSession();
});

// Check if session should be reset on page load
async function checkAndResetSession() {
    try {
        const response = await fetch('/check_session');
        if (response.ok) {
            const data = await response.json();
            if (data.should_reset) {
                console.log('Auto-resetting session (age: ' + data.age + 's)');
                await resetSessionInternal();
            }
        }
    } catch (error) {
        console.error('Error checking session:', error);
    }
}

// Reset session function
async function resetSession() {
    if (confirm('Do you really want to start a new session? All current data will be lost.')) {
        await resetSessionInternal();
        location.reload();
    }
}

async function resetSessionInternal() {
    try {
        await fetch('/reset_session', { method: 'POST' });
        // Enable upload tab before reload
        enableUploadTab();
    } catch (error) {
        console.error('Error resetting session:', error);
    }
}

window.resetSession = resetSession;

// Tab Management
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });
}

// Tab control functions
function disableUploadTab() {
    const uploadTabBtn = document.querySelector('[data-tab="upload"]');
    uploadTabBtn.disabled = true;
    uploadTabBtn.style.opacity = '0.5';
    uploadTabBtn.style.cursor = 'not-allowed';
}

function enableUploadTab() {
    const uploadTabBtn = document.querySelector('[data-tab="upload"]');
    uploadTabBtn.disabled = false;
    uploadTabBtn.style.opacity = '1';
    uploadTabBtn.style.cursor = 'pointer';
}

function switchTab(tabName) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
    
    // Load content for specific tabs
    if (tabName === 'results') {
        loadResults();
    } else if (tabName === 'review') {
        loadReviewWizard();
    } else if (tabName === 'export') {
        loadExport();
    }
}

// Canvas Initialization
function initializeCanvas() {
    appState.canvasDrawer = new CanvasDrawer('drawing-canvas');
    
    // Clear buttons
    document.getElementById('clear-box-btn').addEventListener('click', () => {
        appState.canvasDrawer.clearLastBox();
    });
    
    document.getElementById('clear-all-btn').addEventListener('click', () => {
        appState.canvasDrawer.clearAllBoxes();
    });
    
    // Auto detect button
    document.getElementById('auto-detect-btn').addEventListener('click', async () => {
        if (!appState.canvasDrawer.currentFilename) {
            alert('Please select an image first');
            return;
        }
        
        const btn = document.getElementById('auto-detect-btn');
        const originalText = btn.textContent;
        btn.innerHTML = '<span class="spinner-circle" style="width: 16px; height: 16px; display: inline-block; margin-right: 5px; border: 2px solid #fff; border-top-color: transparent; vertical-align: middle;"></span>Processing...';
        btn.disabled = true;
        
        // Set auto-detecting flag
        appState.isAutoDetecting = true;
        await updateAnalyzeButtonState();
        
        try {
            // Step 1: Auto detect boxes
            const response = await fetch('/auto_detect_boxes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: appState.canvasDrawer.currentFilename })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Check if no boxes were detected
                if (data.count === 0) {
                    // Show crop modal instead of alert
                    showCropModal(appState.canvasDrawer.currentFilename);
                    return;
                }
                
                // Set detected boxes (no scaling needed - server already uses scaled images)
                appState.canvasDrawer.setBoxes(data.boxes);
                
                // Step 2: Automatically remove text from boxes
                btn.innerHTML = '<span class="spinner-circle" style="width: 16px; height: 16px; display: inline-block; margin-right: 5px; border: 2px solid #fff; border-top-color: transparent; vertical-align: middle;"></span>Removing text...';
                
                // Show overlay spinner
                const overlay = document.getElementById('text-removal-overlay');
                if (overlay) overlay.style.display = 'block';
                
                const cropResponse = await fetch('/crop_text_from_boxes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        filename: appState.canvasDrawer.currentFilename,
                        boxes: data.boxes
                    })
                });
                
                const cropData = await cropResponse.json();
                
                // Hide overlay spinner
                if (overlay) overlay.style.display = 'none';
                
                if (cropData.success) {
                    // Update boxes with cropped versions (no scaling needed)
                    appState.canvasDrawer.setBoxes(cropData.boxes);
                    
                    if (cropData.modified > 0) {
                        console.log(`Auto-detect: Found ${data.count} parts, removed text from ${cropData.modified} boxes`);
                    }
                }
            } else {
                console.error('Auto-detect error:', data.error);
            }
        } catch (error) {
            console.error('Error auto-detecting boxes:', error);
            alert('Error during automatic detection');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
            appState.isAutoDetecting = false;
            await updateAnalyzeButtonState();
        }
    });
    
    // Crop text button (optional - only exists if element is present)
    const cropTextBtn = document.getElementById('crop-text-btn');
    if (cropTextBtn) {
        cropTextBtn.addEventListener('click', async () => {
            if (!appState.canvasDrawer.currentFilename) {
                alert('Please select an image first');
                return;
            }
            
            const currentBoxes = appState.canvasDrawer.getBoxes();
            if (currentBoxes.length === 0) {
                alert('No boxes to process. Please mark parts first or use Auto Detect.');
                return;
            }
            
            const btn = document.getElementById('crop-text-btn');
            const originalText = btn.textContent;
            btn.textContent = 'Processing...';
            btn.disabled = true;
            
            try {
                const response = await fetch('/crop_text_from_boxes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        filename: appState.canvasDrawer.currentFilename,
                        boxes: currentBoxes
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Update with cropped boxes (no scaling needed)
                    appState.canvasDrawer.setBoxes(data.boxes);
                    
                    if (data.modified > 0) {
                        alert(`✅ Success!\n\nModified ${data.modified} of ${data.total} boxes to remove text annotations.`);
                    } else {
                        alert(`ℹ️ No text found\n\nNo text annotations like "2x", "4x" were detected in any boxes.`);
                    }
                } else {
                    alert('Error: ' + data.error);
                }
            } catch (error) {
                console.error('Error cropping text from boxes:', error);
                alert('Error processing boxes');
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    }
}

// Upload Management
function initializeUpload() {
    const fileInput = document.getElementById('file-input');
    const pdfInput = document.getElementById('pdf-input');
    
    fileInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (files.length === 0) return;
        
        const formData = new FormData();
        for (let file of files) {
            formData.append('images', file);
        }
        
        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                const data = await response.json();
                const wasEmpty = appState.uploadedImages.length === 0;
                // Add new images to existing list instead of replacing
                appState.uploadedImages = [...appState.uploadedImages, ...data.uploaded];
                displayUploadedImages();
                
                // Show minifigure warning if this is the first upload
                if (wasEmpty && appState.uploadedImages.length > 0) {
                    const minifigWarning = document.getElementById('minifig-warning');
                    if (minifigWarning) {
                        minifigWarning.style.display = 'block';
                    }
                }
                
                // Auto-load first image if this was the first upload
                if (wasEmpty && appState.uploadedImages.length > 0) {
                    setTimeout(() => {
                        loadImageToCanvas(appState.uploadedImages[0].filename);
                        const firstThumb = document.querySelector('.image-thumb');
                        if (firstThumb) firstThumb.classList.add('selected');
                    }, 100);
                }
                
                // Clear input to allow re-uploading same files
                fileInput.value = '';
            } else {
                alert('Upload failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Upload failed');
        }
    });
    
    // PDF Upload Handler
    pdfInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Show spinner
        const spinnerModal = document.getElementById('pdf-spinner-modal');
        spinnerModal.style.display = 'block';
        
        const formData = new FormData();
        formData.append('pdf', file);
        
        try {
            const response = await fetch('/upload_pdf', {
                method: 'POST',
                body: formData
            });
            
            // Hide spinner
            spinnerModal.style.display = 'none';
            
            if (response.ok) {
                const data = await response.json();
                appState.pdfData = data;
                showPdfModal(data);
                pdfInput.value = '';
            } else {
                alert('PDF upload failed');
            }
        } catch (error) {
            console.error('PDF upload error:', error);
            spinnerModal.style.display = 'none';
            alert('PDF upload failed');
        }
    });
}

// PDF Modal Functions
function showPdfModal(pdfData) {
    const modal = document.getElementById('pdf-modal');
    const countText = document.getElementById('pdf-page-count');
    const grid = document.getElementById('pdf-pages-grid');
    
    countText.textContent = `This PDF has ${pdfData.page_count} page(s). Please select the pages containing part lists:`;
    
    grid.innerHTML = '';
    pdfData.pages.forEach(page => {
        const div = document.createElement('div');
        div.className = 'pdf-page-item';
        div.innerHTML = `
            <label style="cursor: pointer; display: block; border: 2px solid #ddd; border-radius: 8px; padding: 10px; text-align: center; background: white;">
                <input type="checkbox" value="${page.page_key}" style="margin-bottom: 10px;">
                <img src="data:image/png;base64,${page.thumbnail}" style="width: 100%; border-radius: 4px; margin-bottom: 8px;">
                <div style="font-weight: bold;">Page ${page.page_num + 1}</div>
            </label>
        `;
        grid.appendChild(div);
    });
    
    modal.style.display = 'block';
}

function closePdfModal() {
    document.getElementById('pdf-modal').style.display = 'none';
    appState.pdfData = null;
}

async function convertSelectedPages() {
    const checkboxes = document.querySelectorAll('#pdf-pages-grid input[type="checkbox"]:checked');
    const selectedPages = Array.from(checkboxes).map(cb => cb.value);
    
    if (selectedPages.length === 0) {
        alert('Please select at least one page.');
        return;
    }
    
    try {
        const response = await fetch('/convert_pdf_pages', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({pages: selectedPages})
        });
        
        if (response.ok) {
            const data = await response.json();
            const wasEmpty = appState.uploadedImages.length === 0;
            // Add converted pages to uploaded images
            appState.uploadedImages = [...appState.uploadedImages, ...data.converted];
            displayUploadedImages();
            
            // Show minifigure warning if this is the first upload
            if (wasEmpty && appState.uploadedImages.length > 0) {
                const minifigWarning = document.getElementById('minifig-warning');
                if (minifigWarning) {
                    minifigWarning.style.display = 'block';
                }
            }
            
            // Auto-load first image if this was the first upload
            if (wasEmpty && appState.uploadedImages.length > 0) {
                setTimeout(() => {
                    loadImageToCanvas(appState.uploadedImages[0].filename);
                    const firstThumb = document.querySelector('.image-thumb');
                    if (firstThumb) firstThumb.classList.add('selected');
                }, 100);
            }
            
            closePdfModal();
        } else {
            alert('Conversion failed');
        }
    } catch (error) {
        console.error('Conversion error:', error);
        alert('Conversion failed');
    }
}

// Make functions globally accessible
window.closePdfModal = closePdfModal;
window.convertSelectedPages = convertSelectedPages;

function displayUploadedImages() {
    const imageList = document.getElementById('image-list');
    imageList.innerHTML = '';
    
    appState.uploadedImages.forEach(img => {
        const div = document.createElement('div');
        div.className = 'image-thumb';
        div.innerHTML = `
            <img src="${img.url}" alt="${img.filename}">
            <p>${img.filename}</p>
        `;
        
        // Add click handler to switch to this image
        div.addEventListener('click', () => {
            loadImageToCanvas(img.filename);
            
            // Visual feedback - highlight selected thumbnail
            document.querySelectorAll('.image-thumb').forEach(thumb => {
                thumb.classList.remove('selected');
            });
            div.classList.add('selected');
        });
        
        imageList.appendChild(div);
    });
}

function updateImageSelector() {
    // Auto-select first image
    if (appState.uploadedImages.length > 0) {
        loadImageToCanvas(appState.uploadedImages[0].filename);
        
        // Highlight first thumbnail
        setTimeout(() => {
            const firstThumb = document.querySelector('.image-thumb');
            if (firstThumb) {
                firstThumb.classList.add('selected');
            }
        }, 100);
    }
}

async function loadImageToCanvas(filename) {
    const image = appState.uploadedImages.find(img => img.filename === filename);
    if (!image) return;
    
    // Add cache busting timestamp
    const url = `${image.url}?t=${Date.now()}`;
    await appState.canvasDrawer.loadImage(url, filename);
    appState.canvasDrawer.updateBoxCount();
    await updateAnalyzeButtonState();
}

// Analysis
function initializeAnalysis() {
    const analyzeBtn = document.getElementById('analyze-btn');
    const noTextCheckbox = document.getElementById('no-text-checkbox');
    analyzeBtn.disabled = true;  // Start disabled
    analyzeBtn.addEventListener('click', analyzeAllParts);
    if (noTextCheckbox) {
        noTextCheckbox.addEventListener('change', () => {
            updateAnalyzeButtonState();
        });
    }
}

// Check if any boxes exist across all images and update button state
async function updateAnalyzeButtonState() {
    const analyzeBtn = document.getElementById('analyze-btn');
    const timeEstimate = document.getElementById('analyze-time-estimate');
    if (!analyzeBtn) return;
    
    // Disable if auto-detecting
    if (appState.isAutoDetecting) {
        analyzeBtn.disabled = true;
        if (timeEstimate) {
            timeEstimate.textContent = 'Please wait for auto-detection to complete...';
            timeEstimate.style.color = '#ffc107';
        }
        return;
    }
    
    try {
        // Check all uploaded images for boxes
        let totalBoxes = 0;
        for (const img of appState.uploadedImages) {
            const response = await fetch(`/get_boxes/${img.filename}`);
            if (response.ok) {
                const data = await response.json();
                totalBoxes += (data.boxes || []).length;
            }
        }
        const noTextCheckbox = document.getElementById('no-text-checkbox');
        const checkboxChecked = noTextCheckbox ? noTextCheckbox.checked : false;
        analyzeBtn.disabled = !(totalBoxes > 0 && checkboxChecked);
        // Calculate and display estimated time
        if (timeEstimate) {
            if (totalBoxes > 0) {
                const seconds = totalBoxes * 0.5; // 0.5 seconds per part
                const minutes = Math.floor(seconds / 60);
                const remainingSeconds = Math.round(seconds % 60);
                let timeText = '(approx. ';
                if (minutes > 0) {
                    timeText += `${minutes} min `;
                }
                if (remainingSeconds > 0 || minutes === 0) {
                    timeText += `${remainingSeconds} sec`;
                }
                timeText += ')';
                timeEstimate.textContent = timeText;
            } else {
                timeEstimate.textContent = '';
            }
        }
    } catch (error) {
        console.error('Error checking boxes:', error);
    }
}

// Make globally accessible
window.updateAnalyzeButtonState = updateAnalyzeButtonState;

async function analyzeAllParts() {
    const statusDiv = document.getElementById('analyze-status');
    const spinner = document.getElementById('analyze-spinner');
    const analyzeBtn = document.getElementById('analyze-btn');
    const progressText = document.getElementById('analyze-progress-text');
    const progressBar = document.getElementById('analyze-progress-bar');
    
    // Check if analysis is already in progress
    try {
        const checkResponse = await fetch('/analysis_progress');
        const checkData = await checkResponse.json();
        if (checkData.in_progress) {
            alert('⚠️ Analysis already in progress!\n\nPlease wait for the current analysis to complete.\n\nThis can happen if you have multiple tabs open or started another analysis.');
            return;
        }
    } catch (error) {
        console.error('Error checking analysis status:', error);
    }
    
    // Show spinner, hide status, hide button
    spinner.style.display = 'block';
    analyzeBtn.style.display = 'none';
    statusDiv.textContent = '';
    statusDiv.className = '';
    progressText.textContent = 'Starting analysis...';
    progressBar.style.width = '0%';
    
    // Start progress polling
    const progressInterval = setInterval(async () => {
        try {
            const progressResponse = await fetch('/analysis_progress');
            const progress = await progressResponse.json();
            
            if (progress.total > 0) {
                const remaining = progress.total - progress.current;
                const timePerCall = 0.33; // seconds (3 calls per second)
                const estimatedSeconds = remaining * timePerCall;
                const minutes = Math.floor(estimatedSeconds / 60);
                const seconds = Math.round(estimatedSeconds % 60);
                
                let timeText = '';
                if (minutes > 0) {
                    timeText = ` (approx. ${minutes}m ${seconds}s remaining)`;
                } else if (seconds > 0) {
                    timeText = ` (approx. ${seconds}s remaining)`;
                }
                
                progressText.textContent = `Analyzing part ${progress.current} of ${progress.total} with brickognize.com${timeText} ...`;
                progressBar.style.width = `${progress.percentage}%`;
            }
        } catch (error) {
            console.error('Error fetching progress:', error);
        }
    }, 500);
    
    try {
        const response = await fetch('/analyze', {
            method: 'POST'
        });
        
        // Stop polling and hide spinner
        clearInterval(progressInterval);
        spinner.style.display = 'none';
        analyzeBtn.style.display = 'block';
        analyzeBtn.disabled = false;
        
        if (response.ok) {
            const data = await response.json();
            progressBar.style.width = '100%';
            statusDiv.className = 'success';
            statusDiv.textContent = `Done! ${data.recognized} of ${data.total} parts recognized.`;
            
            // Disable upload tab
            disableUploadTab();
            
            // Auto-switch to results tab after 2 seconds
            setTimeout(() => {
                switchTab('results');
            }, 2000);
        } else {
            // Get detailed error information
            let errorDetails = {
                status: response.status,
                statusText: response.statusText,
                url: response.url,
                timestamp: new Date().toISOString()
            };
            
            // Read response body once as text
            try {
                const responseText = await response.text();
                // Try to parse as JSON
                try {
                    const errorData = JSON.parse(responseText);
                    errorDetails.serverMessage = errorData.error || errorData.message || responseText;
                    
                    // Check for 409 Conflict (analysis already running)
                    if (response.status === 409) {
                        alert('⚠️ Analysis already in progress!\n\n' + errorData.message + '\n\nThis can happen if you have multiple tabs open.');
                        return;
                    }
                } catch (e) {
                    // Not JSON, use raw text
                    errorDetails.serverMessage = responseText || 'No error message provided';
                }
            } catch (e) {
                errorDetails.serverMessage = 'Could not read error response';
            }
            
            showErrorModal('Analysis Request Failed', errorDetails);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Analysis error:', error);
        clearInterval(progressInterval);
        spinner.style.display = 'none';
        analyzeBtn.style.display = 'block';
        analyzeBtn.disabled = false;
        statusDiv.className = 'error';
        statusDiv.innerHTML = 'Error during analysis! <button onclick="showLastError()" style="margin-left: 10px; padding: 8px 15px; cursor: pointer; background: #f44336; color: white; border: none; border-radius: 4px; font-weight: 500;">Show Details</button>';
        statusDiv.style.display = 'flex';
        statusDiv.style.alignItems = 'center';
        statusDiv.style.justifyContent = 'center';
        statusDiv.style.gap = '10px';
        
        // Store error details for later retrieval
        window.lastAnalysisError = {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            type: error.name || 'Error'
        };
    }
}

// Results
async function loadResults() {
    try {
        const response = await fetch('/get_results');
        if (!response.ok) return;
        
        const data = await response.json();
        displayResultsSummary(data.results);
        displayResultsImages(data.results);
    } catch (error) {
        console.error('Error loading results:', error);
    }
}

function displayResultsSummary(results) {
    const summaryDiv = document.getElementById('results-summary');
    
    const total = results.length;
    const recognized = results.filter(r => r.recognized).length;
    const failed = total - recognized;
    
    summaryDiv.innerHTML = `
        <div class="results-summary">
            <div class="stat-card total">
                <h3>${total}</h3>
                <p>Total</p>
            </div>
            <div class="stat-card success">
                <h3>${recognized}</h3>
                <p>Recognized</p>
            </div>
            <div class="stat-card failed">
                <h3>${failed}</h3>
                <p>Failed</p>
            </div>
        </div>
        <div class="text-center mt-20" style="margin-bottom: 40px;">
            <button class="btn btn-primary" onclick="switchTab('review')" style="font-size: 18px; padding: 15px 30px;">
                📋 Please review the results
            </button>
            <br/>
        </div>
    `;
}

function displayResultsImages(results) {
    const imagesDiv = document.getElementById('results-images');
    imagesDiv.innerHTML = '<h3>Annotated Images</h3>';
    
    // Group by image
    const byImage = {};
    results.forEach(r => {
        if (!byImage[r.image_name]) {
            byImage[r.image_name] = [];
        }
        byImage[r.image_name].push(r);
    });
    
    // Draw each image with boxes
    Object.keys(byImage).forEach(imageName => {
        const parts = byImage[imageName];
        const imageUrl = `/image/${imageName}`;
        
        // Create container
        const container = document.createElement('div');
        container.className = 'result-image';
        
        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Load and draw image
        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            
            // Draw image
            ctx.drawImage(img, 0, 0);
            
            // Draw boxes
            ctx.lineWidth = 1.5;
            ctx.font = '14px Arial';
            
            parts.forEach((part, idx) => {
                const bbox = part.bbox;
                
                // Color based on success/failure (with transparency)
                const color = part.recognized ? 'rgba(40, 167, 69, 0.6)' : 'rgba(220, 53, 69, 0.6)';
                const solidColor = part.recognized ? '#28a745' : '#dc3545';
                ctx.strokeStyle = color;
                
                // Draw box
                ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);
                
                // Draw label INSIDE the box (top-left, semi-transparent)
                const label = `${idx + 1}`;
                const textWidth = ctx.measureText(label).width;
                const padding = 5;
                
                // Background (semi-transparent)
                ctx.fillStyle = part.recognized ? 'rgba(40, 167, 69, 0.7)' : 'rgba(220, 53, 69, 0.7)';
                ctx.fillRect(bbox.x + 3, bbox.y + 3, textWidth + padding * 2, 22);
                
                // Text (white, bold)
                ctx.fillStyle = 'white';
                ctx.fillText(label, bbox.x + 3 + padding, bbox.y + 3 + 16);
            });
            
            container.appendChild(canvas);
            
            // Add filename label
            const label = document.createElement('p');
            label.textContent = imageName;
            container.appendChild(label);
        };
        
        img.src = imageUrl;
        imagesDiv.appendChild(container);
    });
}

// Review Wizard
async function loadReviewWizard() {
    try {
        // Make sure colors are loaded first
        if (appState.colors.length === 0) {
            await loadColors();
        }
        
        const response = await fetch('/get_results');
        if (!response.ok) return;
        
        const data = await response.json();
        appState.reviewData = data.results;
        appState.currentReviewIndex = 0;
        appState.reviewedParts.clear();  // Reset reviewed tracking
        
        displayReviewPart();
    } catch (error) {
        console.error('Error loading review:', error);
    }
}

// Often Unrecognized Parts Helper
async function loadOftenParts() {
    try {
        const response = await fetch('/get_often_parts');
        if (response.ok) {
            const data = await response.json();
            appState.oftenParts = data.parts;
            console.log(`Loaded ${appState.oftenParts.length} often unrecognized parts`);
        }
    } catch (error) {
        console.error('Error loading often parts:', error);
    }
}

function renderOftenUnrecognizedSidebar(isRecognized, keepCurrentState = false) {
    // Bei unrecognized automatisch geöffnet, bei recognized geschlossen
    // Wenn keepCurrentState=true, behalten wir den aktuellen Status
    let openClass = '';
    if (keepCurrentState) {
        const currentSidebar = document.getElementById('often-sidebar');
        openClass = currentSidebar && currentSidebar.classList.contains('open') ? 'open' : '';
    } else {
        openClass = !isRecognized ? 'open' : '';
    }
    
    let partsHtml = '';
    
    // Add user-added parts first (from this session)
    if (appState.userAddedParts.length > 0) {
        partsHtml += '<div style="font-size: 11px; font-weight: bold; color: #667eea; margin-bottom: 8px; padding: 8px; background: #f0f4ff; border-radius: 4px; text-align: center;">💾 YOUR PARTS (THIS SESSION)</div>';
        appState.userAddedParts.forEach(part => {
            partsHtml += `
                <div class="often-part-item" onclick="useOftenPart('${part.number}')" title="Click to use: ${part.number}">
                    <img src="${part.image}" alt="${part.number}" onerror="this.style.display='none'">
                    <div class="often-part-info">
                        <div class="often-part-number">${part.number}</div>
                        <div class="often-part-hint">Click to use</div>
                    </div>
                </div>
            `;
        });
    }
    
    // Add default often unrecognized parts
    if (appState.oftenParts.length > 0) {
        if (appState.userAddedParts.length > 0) {
            partsHtml += '<div style="font-size: 11px; font-weight: bold; color: #999; margin: 15px 0 8px 0; padding: 8px; background: #f5f5f5; border-radius: 4px; text-align: center;">📚 COMMON UNRECOGNIZED PARTS</div>';
        }
        appState.oftenParts.forEach(part => {
            partsHtml += `
                <div class="often-part-item" onclick="useOftenPart('${part.number}')" title="Click to use this part number">
                    <img src="${part.image}" alt="${part.number}" onerror="this.style.display='none'">
                    <div class="often-part-info">
                        <div class="often-part-number">${part.number}</div>
                        <div class="often-part-hint">Click to use</div>
                    </div>
                </div>
            `;
        });
    }
    
    return `
        <button class="often-sidebar-toggle" onclick="toggleOftenSidebar()" id="often-toggle-btn">
            📚 Part Helper
        </button>
        <div id="help-tutorial-hint" style="display: none; position: absolute; right: 0; top: 50px; background: #667eea; color: white; padding: 15px 25px; border-radius: 10px; font-size: 18px; font-weight: 700; white-space: nowrap; box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5); z-index: 999; border: 3px solid #ffffff;">
            👇 Click here to find common parts
        </div>
        <div class="often-unrecognized-sidebar ${openClass}" id="often-sidebar">
            <div class="often-sidebar-header">
                ❓ Often Unrecognized Parts
            </div>
            <div class="often-sidebar-content">
                ${partsHtml || '<p style="text-align: center; color: #999; font-size: 12px;">No reference parts available</p>'}
            </div>
        </div>
    `;
}

function toggleOftenSidebar() {
    const sidebar = document.getElementById('often-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

function useOftenPart(partNumber) {
    const part = appState.reviewData[appState.currentReviewIndex];
    const partInput = document.getElementById('part-num-input');
    if (partInput) {
        partInput.value = partNumber;
        partInput.focus();
        
        // Visual feedback
        partInput.style.background = '#d4edda';
        setTimeout(() => {
            partInput.style.background = '';
        }, 1000);
    }
    
    // Mark that we want to close the sidebar after refresh
    appState.closeSidebarAfterRefresh = true;
    
    // Save old App Suggestion part to alternatives before replacing
    if (part && part.part_id && part.api_image_url) {
        // Create alternative entry from current part
        const oldPartAsAlt = {
            id: part.part_id,
            name: part.part_name,
            score: part.confidence || 0,
            img_url: part.api_image_url
        };
        
        // Initialize raw_api_response if it doesn't exist
        if (!part.raw_api_response) {
            part.raw_api_response = { items: [] };
        }
        if (!part.raw_api_response.items) {
            part.raw_api_response.items = [];
        }
        
        // Add old part to alternatives (insert at beginning after current)
        part.raw_api_response.items.splice(1, 0, oldPartAsAlt);
    }
    
    // Update the App Suggestion image
    const oftenPart = appState.oftenParts.find(p => p.number === partNumber);
    if (oftenPart && oftenPart.image) {
        // Update part data
        if (part) {
            part.part_id = partNumber;
            part.part_name = oftenPart.name || 'Unknown';
            part.api_image_url = oftenPart.image;
        }
        
        // Find the App Suggestion image in the review card
        const reviewCard = document.querySelector('.review-card');
        if (reviewCard) {
            const appSuggestionImg = reviewCard.querySelector('img[src*="brickognize"]') || 
                                    reviewCard.querySelectorAll('img')[1]; // Second image is usually app suggestion
            if (appSuggestionImg) {
                appSuggestionImg.src = oftenPart.image;
            }
        }
    }
    
    // Remove old part info (Recognized Part Number, Name, Confidence)
    const partDetails = document.querySelector('.part-details');
    if (partDetails) {
        const partInfoDiv = partDetails.querySelector('div[style*="font-size: 13px"]');
        if (partInfoDiv) {
            partInfoDiv.remove();
        }
    }
    
    // Refresh the display to show the new alternative
    displayReviewPart();
    
    // Now close the sidebar after refresh
    if (appState.closeSidebarAfterRefresh) {
        const sidebar = document.getElementById('often-sidebar');
        if (sidebar) {
            sidebar.classList.remove('open');
        }
        appState.closeSidebarAfterRefresh = false;
    }
}

function getQuickColorChips() {
    console.log('getQuickColorChips called. usedColors:', appState.usedColors);
    
    const quickColors = [
        "Black",
        "White",
        "Light Bluish Gray",
        "Dark Bluish Gray",
        "Red",
        "Yellow",
        "Reddish Brown",
        "Blue",
        "Tan",
        "Light Gray"
    ];
    
    let chipsHtml = '';
    
    // Add standard quick colors
    quickColors.forEach(colorName => {
        const color = appState.colors.find(c => c.name === colorName);
        if (color) {
            const hexColor = color.rgb;
            chipsHtml += `
                <div class="quick-color-chip" onclick="selectQuickColor('${color.id}', '${hexColor}', '${colorName.replace(/'/g, "\\'")}')"
                     title="${colorName}">
                    <div class="quick-color-chip-circle" style="background: ${hexColor};"></div>
                    <span class="quick-color-chip-name">${colorName}</span>
                </div>
            `;
        }
    });
    
    // Add "Colors in your set" section if there are used colors
    if (appState.usedColors.length > 0) {
        console.log('Adding Colors in your set section with', appState.usedColors.length, 'colors');
        chipsHtml += '<div style="width: 100%; margin: 15px 0 10px 0; padding: 10px; background: linear-gradient(135deg, #28a745 0%, #20c997 100%); border-radius: 6px; font-size: 12px; font-weight: bold; color: white; text-align: center; box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);">✓ Colors in your set:</div>';
        
        appState.usedColors.forEach(color => {
            const hexColor = color.rgb;
            chipsHtml += `
                <div class="quick-color-chip" onclick="selectQuickColor('${color.id}', '${hexColor}', '${color.name.replace(/'/g, "\\'")}')"
                     title="${color.name}" style="border: 3px solid #28a745; box-shadow: 0 2px 6px rgba(40, 167, 69, 0.2);">
                    <div class="quick-color-chip-circle" style="background: ${hexColor};"></div>
                    <span class="quick-color-chip-name">${color.name}</span>
                </div>
            `;
        });
    } else {
        console.log('No used colors yet');
    }
    
    console.log('Generated chips HTML length:', chipsHtml.length);
    return chipsHtml;
}

function selectQuickColor(colorId, hexColor, colorName) {
    selectColor(colorId, hexColor, colorName);
}

let imageModalTimeout = null;

function showOriginalImageOnHover(imageName) {
    // Clear any pending hide timeout
    if (imageModalTimeout) {
        clearTimeout(imageModalTimeout);
        imageModalTimeout = null;
    }
    
    // Create modal if it doesn't exist
    let modal = document.getElementById('original-image-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'original-image-modal';
        modal.className = 'original-image-modal';
        modal.innerHTML = `
            <div class="original-image-content" onmouseenter="clearImageModalTimeout()" onmouseleave="hideOriginalImageOnHover()">
                <canvas id="original-image-canvas" style="max-width: 90vw; max-height: 90vh;"></canvas>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Get current part's bounding box
    const part = appState.reviewData[appState.currentReviewIndex];
    const bbox = part?.bbox || part?.box;
    
    // Load image and draw with box
    const canvas = document.getElementById('original-image-canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
        // Set canvas size to image size
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Draw the image
        ctx.drawImage(img, 0, 0);
        
        // Draw the bounding box if available
        if (bbox) {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 4;
            ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);
            
            // Add a semi-transparent overlay outside the box
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(0, 0, canvas.width, bbox.y); // Top
            ctx.fillRect(0, bbox.y, bbox.x, bbox.height); // Left
            ctx.fillRect(bbox.x + bbox.width, bbox.y, canvas.width - (bbox.x + bbox.width), bbox.height); // Right
            ctx.fillRect(0, bbox.y + bbox.height, canvas.width, canvas.height - (bbox.y + bbox.height)); // Bottom
        }
    };
    
    // Add cache busting to always get the latest version (especially after cropping)
    img.src = `/image/${imageName}?t=${Date.now()}`;
    modal.classList.add('active');
}

function clearImageModalTimeout() {
    if (imageModalTimeout) {
        clearTimeout(imageModalTimeout);
        imageModalTimeout = null;
    }
}

function hideOriginalImageOnHover() {
    // Add a small delay to allow moving from button to modal
    imageModalTimeout = setTimeout(() => {
        const modal = document.getElementById('original-image-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }, 150);
}

let colorHelpTimeout = null;
let colorHelpMouseX = 0;
let colorHelpMouseY = 0;
let colorHelpModalOpen = false;

function toggleColorHelp() {
    const modal = document.getElementById('color-help-modal');
    if (modal && modal.classList.contains('active')) {
        hideColorHelp();
    } else {
        showColorHelp();
    }
}

function showColorHelp() {
    // Create modal if it doesn't exist
    let modal = document.getElementById('color-help-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'color-help-modal';
        modal.className = 'original-image-modal';
        modal.innerHTML = `
            <div class="original-image-content" onmouseleave="hideColorHelp()" style="max-width: 95vw; max-height: 95vh;">
                <img src="/static/legocolors.jpg" style="max-width: 100%; max-height: 95vh; display: block;" alt="LEGO Colors Reference">
            </div>
        `;
        document.body.appendChild(modal);
        
        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideColorHelp();
            }
        });
    }
    
    // Create floating crop image if it doesn't exist
    let floatingCrop = document.getElementById('floating-crop-image');
    if (!floatingCrop) {
        floatingCrop = document.createElement('div');
        floatingCrop.id = 'floating-crop-image';
        floatingCrop.style.cssText = 'position: fixed; z-index: 10001; pointer-events: none; background: white; border: 3px solid #667eea; border-radius: 8px; padding: 5px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: none;';
        document.body.appendChild(floatingCrop);
        
        // Track mouse movement
        document.addEventListener('mousemove', (e) => {
            colorHelpMouseX = e.clientX;
            colorHelpMouseY = e.clientY;
            if (floatingCrop.style.display === 'block') {
                // Position to the right and below cursor
                floatingCrop.style.left = (e.clientX + 20) + 'px';
                floatingCrop.style.top = (e.clientY + 20) + 'px';
            }
        });
    }
    
    // Get current part's crop image
    const part = appState.reviewData[appState.currentReviewIndex];
    if (part && part.crop_image) {
        floatingCrop.innerHTML = `<img src="data:image/jpeg;base64,${part.crop_image}" style="width: 100px; height: 100px; object-fit: contain; display: block;">`;
        floatingCrop.style.display = 'block';
        floatingCrop.style.left = (colorHelpMouseX + 20) + 'px';
        floatingCrop.style.top = (colorHelpMouseY + 20) + 'px';
    }
    
    modal.classList.add('active');
    colorHelpModalOpen = true;
}

function hideColorHelp() {
    // Hide modal and floating crop
    const modal = document.getElementById('color-help-modal');
    const floatingCrop = document.getElementById('floating-crop-image');
    if (modal) {
        modal.classList.remove('active');
    }
    if (floatingCrop) {
        floatingCrop.style.display = 'none';
    }
    colorHelpModalOpen = false;
}

function incrementQuantity() {
    const quantityInput = document.getElementById('quantity-input');
    if (quantityInput) {
        const currentValue = parseInt(quantityInput.value) || 1;
        quantityInput.value = currentValue + 1;
    }
}

function displayReviewPart(keepSidebarState = false) {
    const reviewContent = document.getElementById('review-content');
    
    if (appState.reviewData.length === 0) {
        reviewContent.innerHTML = '<p>No parts to review.</p>';
        return;
    }
    
    // Wenn wir aus useOftenPart kommen, Sidebar-Status beibehalten
    if (appState.closeSidebarAfterRefresh) {
        keepSidebarState = true;
    }
    
    const part = appState.reviewData[appState.currentReviewIndex];
    const partNum = appState.currentReviewIndex + 1;
    const total = appState.reviewData.length;
    const progress = (partNum / total) * 100;
    
    // Get alternative parts from raw API response
    let alternativeParts = [];
    if (part.raw_api_response && part.raw_api_response.items) {
        // Skip first item (it's the currently selected one)
        alternativeParts = part.raw_api_response.items.slice(1);
    }
    
    let partInfo = '';
    if (part.recognized) {
        partInfo = `
            <p><strong>Recognized Lego Part Number:</strong> ${part.part_id || 'N/A'}</p>
            <p><strong>Name:</strong> ${part.part_name || 'N/A'}</p>
            <p><strong>Confidence:</strong> ${(part.confidence * 100).toFixed(1)}%</p>
        `;
    } else {
        partInfo = `
            <p style="color: red; margin-bottom: 8px;"><strong>Not recognized</strong></p>
            <div style="background: #e7f3ff; border-left: 3px solid #2196F3; padding: 10px; border-radius: 4px; font-size: 12px;">
                <p style="margin: 0; color: #1976D2; line-height: 1.5;">
                    <strong>💡 Tip:</strong> If this is a non-LEGO special brand piece: no worries! You can add it manually at <strong>brickisbrick.com</strong> later. Just click <strong>"Don't know"</strong> to skip for now.
                </p>
            </div>
        `;
    }
    
    // Build color options with visual preview
    let colorOptions = '';
    if (part.recognized && part.colors) {
        part.colors.forEach(color => {
            // Find matching color from BrickLink colors
            const blColor = appState.colors.find(c => c.name === color.name || c.id === color.name);
            const hexColor = blColor ? blColor.rgb : '#ccc';  // RGB is actually HEX string
            const displayName = blColor ? blColor.name : color.name;  // Use BrickLink name
            const colorId = blColor ? blColor.id : color.name;  // Use BrickLink ID if available
            colorOptions += `
                <div class="color-option" data-value="${colorId}" data-rgb="${hexColor}" onclick="selectColor('${colorId}', '${hexColor}', '${displayName.replace(/'/g, "\\'")}')">  
                    <div class="color-circle" style="background: ${hexColor}; border: 2px solid #333;"></div>
                    <span>${displayName}</span>
                </div>`;
        });
    }
    
    // Add separator
    if (part.recognized && part.colors && part.colors.length > 0) {
        colorOptions += '<div class="color-separator">All Colors:</div>';
    }
    
    // Add all BrickLink colors
    appState.colors.forEach(color => {
        const hexColor = color.rgb;  // RGB is actually HEX string like '#FFFFFF'
        colorOptions += `
            <div class="color-option" data-value="${color.id}" data-rgb="${hexColor}" onclick="selectColor('${color.id}', '${hexColor}', '${color.name.replace(/'/g, "\\'")}')">  
                <div class="color-circle" style="background: ${hexColor}; border: 2px solid #333;"></div>
                <span>${color.name}</span>
            </div>`;
    });
    
    reviewContent.innerHTML = `
        <div class="review-wizard">
            ${renderOftenUnrecognizedSidebar(part.recognized, keepSidebarState)}
            <div class="review-progress" style="margin-bottom: 15px; position: relative;">
                <h3 style="margin-bottom: 5px;">Part ${partNum} of ${total}</h3>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
            </div>
            <div class="review-card" style="padding: 15px;">
                <div style="display: flex; gap: 15px; justify-content: center; align-items: center; margin-bottom: 10px;">
                    <div style="width: 120px; text-align: center;">
                        <p style="margin: 0 0 5px 0; font-size: 13px;"><strong>Your Crop:</strong></p>
                        ${part.crop_image ? `<img src="data:image/jpeg;base64,${part.crop_image}" style="width: 120px; height: 120px; object-fit: contain; border: 2px solid #667eea; border-radius: 8px;">` : '<p>No image available</p>'}
                        <p style="margin: 5px 0 0 0; font-size: 11px;"><em>from: ${part.image_name}</em></p>
                    </div>
                    ${part.api_image_url ? `
                    <div style="width: 120px; text-align: center;">
                        <p style="margin: 0 0 5px 0; font-size: 13px;"><strong>App Suggestion:</strong></p>
                        <img src="${part.api_image_url}" style="width: 120px; height: 120px; object-fit: contain; border: 2px solid #28a745; border-radius: 8px;" onerror="this.style.display='none'">
                    </div>
                    ` : ''}
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${partNum > 1 ? '<button class="btn btn-secondary" style="padding: 8px 16px; font-size: 13px;" onclick="previousPart()">◄ Back</button>' : ''}
                        <button class="btn btn-danger" style="padding: 8px 16px; font-size: 13px; background: #dc3545;" onclick="removePartFromList()">🗑️ Remove from List</button>
                        ${part.recognized ? '<button class="btn btn-warning" style="padding: 8px 16px; font-size: 13px;" onclick="noMatchPart()">None of these</button>' : ''}
                        ${part.recognized ? '<button class="btn btn-danger" style="padding: 8px 16px; font-size: 13px;" onclick="skipPart()">Skip</button>' : '<button class="btn btn-secondary" style="padding: 8px 16px; font-size: 13px;" onclick="unknownPart()">Don\'t know</button>'}
                        <button class="btn btn-success" style="padding: 8px 16px; font-size: 13px;" onclick="savePart()">Save & Next ►</button>
                    </div>
                </div>
                <div class="part-details" style="margin-top: 10px;">
                    <div style="font-size: 13px; margin-bottom: 10px;">
                        ${partInfo}
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 10px; align-items: end; margin-bottom: 10px;">
                        <div>
                            <label style="font-size: 12px; display: block; margin-bottom: 3px;">Lego Part Number:</label>
                            <input type="text" id="part-num-input" value="${part.part_id || ''}" placeholder="e.g. 3001" style="width: 100%; padding: 6px;">
                            <p style="font-size: 12px; color: #999; margin-top: 4px; font-style: italic; opacity: 0.9;">💡 Only insert Lego part numbers - they'll be auto-mapped to other brands later</p>
                        </div>
                        <div>
                            <label style="font-size: 12px; display: block; margin-bottom: 3px;">Color:</label>
                            <p id="color-help-trigger" style="font-size: 10px; color: #667eea; margin: 0 0 5px 0; cursor: pointer; text-decoration: underline dotted;" onclick="toggleColorHelp()">❓ Need color help?</p>
                            <div class="custom-color-dropdown">
                                <div class="color-dropdown-header" id="color-dropdown-header" onclick="toggleColorDropdown()">
                                    <div class="selected-color">
                                        <div class="color-circle" id="selected-color-circle" style="background: #ccc;"></div>
                                        <span id="selected-color-text">Choose color...</span>
                                    </div>
                                    <span class="dropdown-arrow">▼</span>
                                </div>
                                <div class="color-dropdown-list" id="color-dropdown-list" style="display: none;">
                                    ${colorOptions}
                                </div>
                            </div>
                            <input type="hidden" id="color-select" value="">
                            <div class="quick-color-chips">
                                ${getQuickColorChips()}
                            </div>
                        </div>
                        <div>
                            <label style="font-size: 12px; display: block; margin-bottom: 3px;">Quantity:</label>
                            <div style="display: flex; gap: 5px; margin-bottom: 3px;">
                                <input type="number" id="quantity-input" value="1" min="1" style="flex: 1; padding: 6px;">
                                <button class="btn btn-primary" onclick="incrementQuantity()" style="padding: 6px 12px; font-size: 16px; line-height: 1;">+</button>
                            </div>
                            <div id="quantity-info" style="font-size: 10px; color: #6c757d; display: none; font-style: italic; margin-bottom: 5px;">
                                ℹ️ Quantity read from image (may contain errors)
                            </div>
                            <button class="btn btn-secondary" style="width: 100%; padding: 6px 12px; font-size: 12px;" onmouseenter="showOriginalImageOnHover('${part.image_name}')" onmouseleave="hideOriginalImageOnHover()" title="Hover to see the part location in the original image">
                                🖼️ Show Original
                            </button>
                        </div>
                    </div>
                    ${alternativeParts.length > 0 ? `
                        <div class="alternative-parts" style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6;">
                            <h4 style="margin: 0 0 8px 0; color: #667eea; font-size: 13px;">Also possible:</h4>
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                                ${alternativeParts.map((altPart, idx) => `
                                    <div class="alt-part-item" style="display: flex; gap: 8px; align-items: center; padding: 6px; background: white; border-radius: 4px; border: 1px solid #e0e0e0;">
                                        ${altPart.img_url ? `<img src="${altPart.img_url}" style="width: 40px; height: 40px; object-fit: contain; border: 1px solid #ddd; border-radius: 3px; flex-shrink: 0;" onerror="this.style.display='none'">` : ''}
                                        <div style="flex: 1; min-width: 0;">
                                            <p style="margin: 0; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${altPart.id || 'N/A'}</p>
                                            <p style="margin: 2px 0 0 0; font-size: 10px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${altPart.name || 'Unknown'}</p>
                                            <p style="margin: 2px 0 0 0; font-size: 9px; color: #888;">Conf: ${(altPart.score * 100).toFixed(1)}%</p>
                                        </div>
                                        <button class="btn btn-primary" style="padding: 3px 6px; font-size: 10px; white-space: nowrap;" onclick="chooseAlternativePart(${idx + 1})">Choose</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                <details class="raw-data-details">
                    <summary>📄 Raw Data (API Response)</summary>
                    <pre>${JSON.stringify(part.raw_api_response || part, null, 2)}</pre>
                </details>
            </div>
        </div>
    `;
    
    // Pre-select first color if available
    setTimeout(() => {
        if (part.recognized && part.colors && part.colors.length > 0) {
            const firstColor = part.colors[0];
            const blColor = appState.colors.find(c => c.name === firstColor.name || c.id === firstColor.name);
            if (blColor) {
                const hexColor = blColor.rgb;  // RGB is actually HEX string
                selectColor(firstColor.name, hexColor, firstColor.name);
            }
        }
        
        // Auto-detect quantity
        autoDetectQuantity();
        
        // Show help box tutorial on first part
        if (appState.currentReviewIndex === 0 && !appState.helpBoxTutorialShown) {
            appState.helpBoxTutorialShown = true;
            setTimeout(() => {
                const sidebar = document.getElementById('often-sidebar');
                const tutorialHint = document.getElementById('help-tutorial-hint');
                
                if (sidebar && tutorialHint) {
                    // Open sidebar
                    sidebar.classList.add('open');
                    // Show tutorial hint
                    tutorialHint.style.display = 'block';
                    
                    // Auto-close after 3 seconds
                    setTimeout(() => {
                        sidebar.classList.remove('open');
                        // Fade out hint
                        tutorialHint.style.transition = 'opacity 0.5s';
                        tutorialHint.style.opacity = '0';
                        setTimeout(() => {
                            tutorialHint.style.display = 'none';
                            tutorialHint.style.opacity = '1';
                        }, 500);
                    }, 3000);
                }
            }, 200);
        }
        
        // Add event listener to part number input for manual changes
        const partNumInput = document.getElementById('part-num-input');
        if (partNumInput) {
            let debounceTimer;
            const originalPartId = part.part_id || '';
            
            partNumInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    const newValue = e.target.value.trim();
                    // If user changed the part number manually
                    if (newValue !== originalPartId && newValue !== '') {
                        // Hide/remove App Suggestion image and label
                        const reviewCard = document.querySelector('.review-card');
                        if (reviewCard) {
                            const appSuggestionContainer = Array.from(reviewCard.querySelectorAll('div[style*="width: 120px"]')).find(div => 
                                div.textContent.includes('App Suggestion')
                            );
                            if (appSuggestionContainer) {
                                appSuggestionContainer.style.display = 'none';
                            }
                        }
                        
                        // Remove part info (Recognized Part Number, Name, Confidence)
                        const partDetails = document.querySelector('.part-details');
                        if (partDetails) {
                            const partInfoDiv = partDetails.querySelector('div[style*="font-size: 13px"]');
                            if (partInfoDiv) {
                                partInfoDiv.remove();
                            }
                        }
                        
                        // Remove the "unrecognized" tip box if present
                        const tipBox = document.querySelector('div[style*="background: #e7f3ff"]');
                        if (tipBox) {
                            tipBox.remove();
                        }
                    }
                }, 500); // 500ms debounce
            });
        }
    }, 100);
}

async function savePart() {
    const part = appState.reviewData[appState.currentReviewIndex];
    const partNum = document.getElementById('part-num-input').value.trim();
    const colorId = document.getElementById('color-select').value;
    const quantity = parseInt(document.getElementById('quantity-input').value);
    
    if (!partNum) {
        alert('Please enter part number!');
        return;
    }
    
    if (!colorId) {
        alert('Please select color!');
        return;
    }
    
    // Add color to usedColors if not already there
    const selectedColor = appState.colors.find(c => 
        c.id === colorId || 
        c.id === parseInt(colorId) || 
        c.name === colorId
    );
    console.log('Saving part. colorId:', colorId, 'Selected color:', selectedColor);
    
    if (selectedColor) {
        const existingUsedColor = appState.usedColors.find(c => c.id === selectedColor.id);
        console.log('Existing used color?', existingUsedColor);
        
        if (!existingUsedColor) {
            // Add to usedColors
            appState.usedColors.push({
                id: selectedColor.id,
                rgb: selectedColor.rgb,
                name: selectedColor.name
            });
            console.log('Added color to usedColors. Total now:', appState.usedColors.length, appState.usedColors);
        } else {
            console.log('Color already in usedColors');
        }
    } else {
        console.log('Could not find selected color in appState.colors. colorId was:', colorId, 'type:', typeof colorId);
    }
    
    // If this was an unrecognized or no_match part, add it to userAddedParts
    if (!part.recognized || part.no_match) {
        const existingPart = appState.userAddedParts.find(p => p.number === partNum);
        if (!existingPart) {
            // Add to userAddedParts with crop image
            appState.userAddedParts.push({
                number: partNum,
                image: part.crop_image ? `data:image/jpeg;base64,${part.crop_image}` : ''
            });
        }
    }
    
    // Mark as reviewed
    appState.reviewedParts.add(appState.currentReviewIndex);
    
    // Save to server
    await fetch('/update_part', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            index: appState.currentReviewIndex,
            part_num: partNum,
            color_id: colorId,
            quantity: quantity,
            skip: false
        })
    });
    
    nextPart();
}

async function skipPart() {
    // DON'T mark as reviewed when skipping - only save the skip status
    await fetch('/update_part', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            index: appState.currentReviewIndex,
            skip: true
        })
    });
    
    nextPart();
}

async function removePartFromList() {
    if (!confirm('Remove this part from the list?\n\nThis will permanently delete this detection and reduce the total part count.')) {
        return;
    }
    
    const currentIndex = appState.currentReviewIndex;
    
    // Call backend to remove the part
    const response = await fetch('/remove_part', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            index: currentIndex
        })
    });
    
    if (response.ok) {
        const data = await response.json();
        console.log(`Removed part ${currentIndex + 1}, new total: ${data.new_total}`);
        
        // Remove from reviewed parts tracking (adjust indices)
        const newReviewedParts = new Set();
        appState.reviewedParts.forEach(idx => {
            if (idx < currentIndex) {
                newReviewedParts.add(idx);
            } else if (idx > currentIndex) {
                newReviewedParts.add(idx - 1);
            }
            // Skip the removed index
        });
        appState.reviewedParts = newReviewedParts;
        
        // Reload the data from server
        const reviewResponse = await fetch('/get_results');
        if (reviewResponse.ok) {
            const reviewData = await reviewResponse.json();
            appState.reviewData = reviewData.results;
            
            // Stay at same index (which now shows the next part)
            // But if we're at the end, go to the previous part
            if (currentIndex >= appState.reviewData.length) {
                appState.currentReviewIndex = Math.max(0, appState.reviewData.length - 1);
            } else {
                appState.currentReviewIndex = currentIndex;
            }
            
            // Display the part at the current/adjusted index
            if (appState.reviewData.length > 0) {
                displayReviewPart();
            } else {
                // All parts removed
                const reviewContent = document.getElementById('review-content');
                reviewContent.innerHTML = '<p>No parts to review.</p>';
            }
        }
    } else {
        alert('Error removing part');
    }
}

async function unknownPart() {
    // Mark as reviewed and unknown
    appState.reviewedParts.add(appState.currentReviewIndex);
    
    await fetch('/update_part', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            index: appState.currentReviewIndex,
            unknown: true
        })
    });
    
    nextPart();
}

async function noMatchPart() {
    // Mark as reviewed and unrecognized
    appState.reviewedParts.add(appState.currentReviewIndex);
    
    // Mark the part as no_match in client state
    const part = appState.reviewData[appState.currentReviewIndex];
    if (part) {
        part.no_match = true;
        part.recognized = false; // Also mark as unrecognized
    }
    
    await fetch('/update_part', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            index: appState.currentReviewIndex,
            no_match: true
        })
    });
    
    nextPart();
}

function nextPart() {
    const totalParts = appState.reviewData.length;
    const reviewedCount = appState.reviewedParts.size;
    
    // Find next unreviewed part
    let nextIndex = -1;
    for (let i = appState.currentReviewIndex + 1; i < totalParts; i++) {
        if (!appState.reviewedParts.has(i)) {
            nextIndex = i;
            break;
        }
    }
    
    // If no unreviewed part found after current, search from beginning
    if (nextIndex === -1) {
        for (let i = 0; i < appState.currentReviewIndex; i++) {
            if (!appState.reviewedParts.has(i)) {
                nextIndex = i;
                break;
            }
        }
    }
    
    // If all reviewed, check if complete
    if (reviewedCount === totalParts) {
        alert('✅ All parts have been reviewed! You can now switch to the Export tab.');
        switchTab('export');
        return;
    }
    
    // If found next unreviewed, go there
    if (nextIndex !== -1) {
        appState.currentReviewIndex = nextIndex;
        displayReviewPart();
    } else {
        alert('⚠ Please review all parts before continuing!');
    }
}

function chooseAlternativePart(altIndex) {
    const part = appState.reviewData[appState.currentReviewIndex];
    
    // Get alternative part from raw API response
    if (!part.raw_api_response || !part.raw_api_response.items) {
        alert('No alternative parts available.');
        return;
    }
    
    const altPart = part.raw_api_response.items[altIndex];
    if (!altPart) {
        alert('Alternative part not found.');
        return;
    }
    
    // Store current part as a new alternative (swap functionality)
    const currentPartAsAlt = {
        id: part.part_id,
        name: part.part_name,
        score: part.confidence,
        img_url: part.api_image_url
    };
    
    // Update current part with alternative data
    part.part_id = altPart.id;
    part.part_name = altPart.name;
    part.confidence = altPart.score;
    part.api_image_url = altPart.img_url;
    
    // Replace the chosen alternative with the previous current part (swap)
    part.raw_api_response.items[altIndex] = currentPartAsAlt;
    
    // Refresh display
    displayReviewPart();
}

function previousPart() {
    if (appState.currentReviewIndex > 0) {
        appState.currentReviewIndex--;
        displayReviewPart();
    }
}

// Colors
async function loadColors() {
    try {
        const response = await fetch('/colors');
        if (response.ok) {
            const data = await response.json();
            // Sort colors alphabetically by name
            appState.colors = data.colors.sort((a, b) => a.name.localeCompare(b.name));
        }
    } catch (error) {
        console.error('Error loading colors:', error);
    }
    }


// Global function for downloading JSON
window.downloadJson = function() {
    console.log('[EXPORT] downloadJson called');
    const jsonPreview = document.getElementById('json-preview');
    if (!jsonPreview || !jsonPreview.textContent) {
        console.error('[EXPORT] No JSON data available');
        alert('No data to export. Please go to Export tab first.');
        return;
    }
    
    console.log('[EXPORT] Creating JSON download');
    const blob = new Blob([jsonPreview.textContent], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'brickonizer_export.json';
    a.click();
    URL.revokeObjectURL(url);
    console.log('[EXPORT] JSON download triggered');
};

// Global function for BrickLink XML export
window.downloadBrickLinkXml = function() {
    console.log('[EXPORT] downloadBrickLinkXml called');
    window.location.href = '/export_bricklink_xml';
};

// Global function for copy button (called from HTML onclick)
window.copyJsonToClipboard = function() {
    console.log('[COPY] Function called');
    const jsonPreview = document.getElementById('json-preview');
    const copyBtn = document.getElementById('copy-json-btn');
    
    if (!jsonPreview || !jsonPreview.textContent) {
        console.error('[COPY] No JSON content found');
        alert('No JSON content to copy. Please load the export first.');
        return;
    }
    
    const jsonText = jsonPreview.textContent;
    console.log('[COPY] JSON text length:', jsonText.length);
    
    // Create textarea for copying
    const textArea = document.createElement('textarea');
    textArea.value = jsonText;
    textArea.style.position = 'absolute';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    
    // Select and copy
    textArea.select();
    textArea.setSelectionRange(0, 99999);
    
    let success = false;
    try {
        success = document.execCommand('copy');
        console.log('[COPY] execCommand result:', success);
    } catch (err) {
        console.error('[COPY] execCommand error:', err);
    }
    
    document.body.removeChild(textArea);
    
    if (success && copyBtn) {
        copyBtn.textContent = '✅ Copied!';
        copyBtn.style.background = '#28a745';
        console.log('[COPY] Success!');
        setTimeout(() => {
            copyBtn.textContent = '📋 Copy to Clipboard';
            copyBtn.style.background = '';
        }, 2000);
    } else {
        console.error('[COPY] Failed!');
        alert('Copy failed. Please select and copy manually from the preview below.');
    }
};

// Export
async function loadExport() {
    const exportBtn = document.getElementById('export-btn');
    const jsonPreview = document.getElementById('json-preview');
    const exportContent = document.getElementById('export-content');
    
    try {
        const response = await fetch('/export');
        if (response.ok) {
            const data = await response.json();
            jsonPreview.textContent = JSON.stringify(data, null, 2);
            
            // Update export button
            console.log('[EXPORT] Setting up JSON download button');
            if (exportBtn) {
                exportBtn.onclick = () => {
                    console.log('[EXPORT] JSON download button clicked');
                    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'brickonizer_export.json';
                    a.click();
                    console.log('[EXPORT] JSON download triggered');
                };
                console.log('[EXPORT] JSON button handler attached');
            } else {
                console.error('[EXPORT] JSON button not found!');
            }
            
            // Add BrickLink XML export button
            console.log('[EXPORT] Setting up BrickLink XML button');
            const bricklinkBtn = document.getElementById('export-bricklink-btn');
            if (bricklinkBtn) {
                bricklinkBtn.onclick = () => {
                    console.log('[EXPORT] BrickLink XML button clicked');
                    window.location.href = '/export_bricklink_xml';
                };
                console.log('[EXPORT] BrickLink button handler attached');
            } else {
                console.error('[EXPORT] BrickLink button not found!');
            }
            
            // Copy button now uses global function defined at top of file via HTML onclick attribute
            
            // Show unrecognized parts if there are any
            if (data.unrecognizedParts && data.unrecognizedParts.length > 0) {
                // Fetch the full part data to display images
                const resultsResponse = await fetch('/get_results');
                if (resultsResponse.ok) {
                    const resultsData = await resultsResponse.json();
                    
                    let unrecognizedHTML = `
                        <div class="unrecognized-section">
                            <h3>⚠️ Unrecognized Parts</h3>
                            <p>These ${data.unrecognizedParts.length} part(s) were not exported (skipped or unknown):</p>
                            <div class="unrecognized-grid">
                    `;
                    
                    // Display each unrecognized part using the index from backend
                    data.unrecognizedParts.forEach(unrecPart => {
                        const fullPart = resultsData.results[unrecPart.index];
                        if (fullPart) {
                            unrecognizedHTML += `
                                <div class="unrecognized-part">
                                    <img src="data:image/jpeg;base64,${fullPart.crop_image}" alt="Part ${unrecPart.index + 1}">
                                    <p>Part ${unrecPart.index + 1} from ${unrecPart.image_name}</p>
                                </div>
                            `;
                        }
                    });
                    
                    unrecognizedHTML += `
                            </div>
                        </div>
                    `;
                    
                    exportContent.innerHTML += unrecognizedHTML;
                }
            } else if (data.recognizedParts === data.totalParts) {
                // All parts were successfully processed
                let successHTML = `
                    <div class="success-section" style="margin-top: 20px; padding: 20px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; color: #155724;">
                        <h3>✅ All Parts Successfully Processed!</h3>
                        <p>All ${data.totalParts} parts have been recognized and exported.</p>
                    </div>
                `;
                exportContent.innerHTML += successHTML;
            }
        }
    } catch (error) {
        console.error('Error loading export:', error);
    }
}

// Make functions global for onclick handlers
window.savePart = savePart;
window.skipPart = skipPart;
window.removePartFromList = removePartFromList;
window.unknownPart = unknownPart;
window.nextPart = nextPart;
window.previousPart = previousPart;

// Custom Color Dropdown Functions
function toggleColorDropdown() {
    const list = document.getElementById('color-dropdown-list');
    const isVisible = list.style.display === 'block';
    list.style.display = isVisible ? 'none' : 'block';
}

function selectColor(colorId, rgb, colorName) {
    // Update hidden input
    document.getElementById('color-select').value = colorId;
    
    // Update display
    document.getElementById('selected-color-circle').style.background = rgb;
    document.getElementById('selected-color-text').textContent = colorName || colorId;
    
    // Close dropdown
    document.getElementById('color-dropdown-list').style.display = 'none';
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const dropdown = document.querySelector('.custom-color-dropdown');
    if (dropdown && !dropdown.contains(event.target)) {
        const list = document.getElementById('color-dropdown-list');
        if (list) list.style.display = 'none';
    }
});

async function autoDetectQuantity() {
    const part = appState.reviewData[appState.currentReviewIndex];
    const quantityInput = document.getElementById('quantity-input');
    const quantityInfo = document.getElementById('quantity-info');
    
    if (!part || !part.box) {
        console.log('[QUANTITY] No box data available for auto-detection');
        return;
    }
    
    try {
        const response = await fetch('/detect_quantity', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: part.image_name,
                box: part.box
            })
        });
        
        const data = await response.json();
        
        if (data.success && data.quantity) {
            // Update quantity input
            quantityInput.value = data.quantity;
            
            // Show info message
            if (quantityInfo) {
                quantityInfo.style.display = 'block';
            }
            
            // Visual feedback
            quantityInput.style.background = '#d4edda';
            setTimeout(() => {
                quantityInput.style.background = '';
            }, 1500);
            
            console.log('[QUANTITY] Auto-detected:', data.quantity);
        } else {
            console.log('[QUANTITY] Auto-detection failed:', data.message || 'No quantity found');
        }
    } catch (error) {
        console.error('[QUANTITY] Auto-detection error:', error);
    }
}

async function detectQuantity() {
    const part = appState.reviewData[appState.currentReviewIndex];
    const btn = document.getElementById('detect-qty-btn');
    const quantityInput = document.getElementById('quantity-input');
    
    console.log('[QUANTITY] Part data:', part);
    console.log('[QUANTITY] Box:', part.box);
    
    if (!part || !part.box) {
        console.error('[QUANTITY] ERROR: No box data available');
        console.log('[QUANTITY] Full part object:', JSON.stringify(part, null, 2));
        alert('No box information available for this part');
        return;
    }
    
    // Show loading state
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Detecting...';
    btn.disabled = true;
    
    try {
        const response = await fetch('/detect_quantity', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: part.image_name,
                box: part.box
            })
        });
        
        const data = await response.json();
        
        if (data.success && data.quantity) {
            // Update quantity input
            quantityInput.value = data.quantity;
            
            // Show success feedback
            btn.innerHTML = `✓ Found: ${data.quantity}x`;
            btn.style.background = '#28a745';
            
            // Visual feedback
            quantityInput.style.background = '#d4edda';
            setTimeout(() => {
                quantityInput.style.background = '';
            }, 1000);
            
            console.log('[QUANTITY] Detected:', data);
            
            // Reset button after 2 seconds
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = '';
                btn.disabled = false;
            }, 2000);
        } else {
            // No quantity found
            btn.innerHTML = '✗ Not found';
            btn.style.background = '#ffc107';
            
            console.log('[QUANTITY] Not detected:', data);
            
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = '';
                btn.disabled = false;
            }, 2000);
        }
    } catch (error) {
        console.error('Error detecting quantity:', error);
        btn.innerHTML = '✗ Error';
        btn.style.background = '#dc3545';
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
            btn.disabled = false;
        }, 2000);
    }
}

window.toggleColorDropdown = toggleColorDropdown;
window.selectColor = selectColor;
window.selectQuickColor = selectQuickColor;
window.showOriginalImageOnHover = showOriginalImageOnHover;
window.hideOriginalImageOnHover = hideOriginalImageOnHover;
window.clearImageModalTimeout = clearImageModalTimeout;
window.toggleColorHelp = toggleColorHelp;
window.showColorHelp = showColorHelp;
window.hideColorHelp = hideColorHelp;
window.toggleOftenSidebar = toggleOftenSidebar;
window.useOftenPart = useOftenPart;
window.incrementQuantity = incrementQuantity;
window.detectQuantity = detectQuantity;
window.chooseAlternativePart = chooseAlternativePart;
window.noMatchPart = noMatchPart;

// Error Modal Functions
function showErrorModal(errorMessage, errorDetails) {
    const modal = document.getElementById('error-modal');
    const messageEl = document.getElementById('error-message');
    const detailsEl = document.getElementById('error-details');
    
    messageEl.textContent = errorMessage;
    
    // Format error details nicely
    const detailsText = JSON.stringify(errorDetails, null, 2);
    detailsEl.textContent = detailsText;
    
    // Store for clipboard
    window.currentErrorDetails = {
        message: errorMessage,
        details: errorDetails,
        timestamp: new Date().toISOString()
    };
    
    modal.style.display = 'block';
}

function closeErrorModal() {
    const modal = document.getElementById('error-modal');
    modal.style.display = 'none';
}

function showLastError() {
    if (window.lastAnalysisError) {
        showErrorModal('Analysis Error', window.lastAnalysisError);
    }
}

async function copyErrorToClipboard(event) {
    if (!window.currentErrorDetails) return;
    
    const errorText = `
=== ERROR REPORT ===
Timestamp: ${window.currentErrorDetails.timestamp}
Message: ${window.currentErrorDetails.message}

Technical Details:
${JSON.stringify(window.currentErrorDetails.details, null, 2)}

Please send this error report to the administrator.
===================
`.trim();
    
    try {
        await navigator.clipboard.writeText(errorText);
        
        // Visual feedback - find the button
        const btn = event ? event.target : document.querySelector('#error-modal button');
        if (btn) {
            const originalText = btn.textContent;
            const originalBg = btn.style.background;
            btn.textContent = '✓ Copied!';
            btn.style.background = '#28a745';
            
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = originalBg;
            }, 2000);
        } else {
            alert('Error details copied to clipboard!');
        }
    } catch (err) {
        console.error('Failed to copy:', err);
        alert('Could not copy to clipboard. Please manually copy the error details above.');
    }
}

// Make functions globally accessible
window.showErrorModal = showErrorModal;
window.closeErrorModal = closeErrorModal;
window.showLastError = showLastError;
window.copyErrorToClipboard = copyErrorToClipboard;

// Cancel Analysis Function
async function cancelAnalysis() {
    if (!confirm('Are you sure you want to cancel the analysis?\n\nYour boxes will be preserved and you can start a new analysis after adding missing parts.')) {
        return;
    }
    
    try {
        const response = await fetch('/cancel_analysis', {
            method: 'POST'
        });
        
        if (response.ok) {
            const statusDiv = document.getElementById('analyze-status');
            const spinner = document.getElementById('analyze-spinner');
            const analyzeBtn = document.getElementById('analyze-btn');
            
            // Hide spinner, show button
            spinner.style.display = 'none';
            analyzeBtn.style.display = 'block';
            analyzeBtn.disabled = false;
            
            // Show cancellation message
            statusDiv.className = 'error';
            statusDiv.style.display = 'flex';
            statusDiv.style.alignItems = 'center';
            statusDiv.style.justifyContent = 'center';
            statusDiv.textContent = '⚠️ Analysis cancelled. You can add more boxes and restart the analysis.';
        } else {
            alert('Failed to cancel analysis. Please try again.');
        }
    } catch (error) {
        console.error('Error cancelling analysis:', error);
        alert('Failed to cancel analysis. Please try again.');
    }
}

window.cancelAnalysis = cancelAnalysis;

// ===== BLUEBRIXX INTEGRATION =====

// Store current Bluebrixx data for later use
let currentBluebrixxData = {
    set_itemno: null,
    order_no: null
};

function openBluebrixxModal() {
    document.getElementById('bluebrixx-modal').style.display = 'block';
    // Reset form
    document.getElementById('bluebrixx-paste-area').value = '';
    document.getElementById('bluebrixx-spinner').style.display = 'none';
    document.getElementById('bluebrixx-status').innerHTML = '';
    document.getElementById('bluebrixx-result').style.display = 'none';
}

function closeBluebrixxModal() {
    document.getElementById('bluebrixx-modal').style.display = 'none';
}

async function fetchBluebrixxPartlist() {
    const pastedText = document.getElementById('bluebrixx-paste-area').value.trim();
    
    // Validation
    if (!pastedText) {
        alert('Please paste the Bluebrixx part list first!');
        return;
    }
    
    // Show spinner, hide previous results
    const spinner = document.getElementById('bluebrixx-spinner');
    const statusDiv = document.getElementById('bluebrixx-status');
    const resultDiv = document.getElementById('bluebrixx-result');
    const fetchBtn = document.getElementById('bluebrixx-fetch-btn');
    
    spinner.style.display = 'block';
    statusDiv.innerHTML = '';
    resultDiv.style.display = 'none';
    fetchBtn.disabled = true;
    
    try {
        const response = await fetch('/bluebrixx_parse', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pasted_text: pastedText
            })
        });
        
        const data = await response.json();
        
        // Hide spinner
        spinner.style.display = 'none';
        fetchBtn.disabled = false;
        
        if (response.ok && data.success) {
            // Show success
            // Calculate total quantity
            const totalQuantity = data.parts.reduce((sum, part) => sum + parseInt(part.qty || 0), 0);
            
            document.getElementById('bluebrixx-part-count').textContent = 
                `Found ${data.part_count} different parts with ${totalQuantity} total pieces`;
            
            // Show parts preview
            const previewDiv = document.getElementById('bluebrixx-parts-preview');
            let previewHtml = '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
            previewHtml += '<thead><tr style="background: #f5f5f5; font-weight: 600; text-align: left;">';
            previewHtml += '<th style="padding: 6px; border-bottom: 2px solid #ddd;">Part Number</th>';
            previewHtml += '<th style="padding: 6px; border-bottom: 2px solid #ddd;">Article</th>';
            previewHtml += '<th style="padding: 6px; border-bottom: 2px solid #ddd;">Color</th>';
            previewHtml += '<th style="padding: 6px; border-bottom: 2px solid #ddd;">Qty</th>';
            previewHtml += '</tr></thead><tbody>';
            
            data.parts.forEach((part, idx) => {
                const bgColor = idx % 2 === 0 ? '#fff' : '#f9f9f9';
                previewHtml += `<tr style="background: ${bgColor};">`;
                previewHtml += `<td style="padding: 6px; border-bottom: 1px solid #eee;">${part.form_nr}</td>`;
                previewHtml += `<td style="padding: 6px; border-bottom: 1px solid #eee;">${part.article_nr}</td>`;
                previewHtml += `<td style="padding: 6px; border-bottom: 1px solid #eee;">${part.color}</td>`;
                previewHtml += `<td style="padding: 6px; border-bottom: 1px solid #eee;">${part.qty}</td>`;
                previewHtml += '</tr>';
            });
            
            previewHtml += '</tbody></table>';
            previewDiv.innerHTML = previewHtml;
            
            // Show result section
            resultDiv.style.display = 'block';
            
        } else {
            
            // Show error
            statusDiv.innerHTML = `
                <div style="background: #f8d7da; border: 2px solid #f5c6cb; border-radius: 8px; padding: 15px;">
                    <div style="font-size: 28px; margin-bottom: 8px;">❌</div>
                    <h3 style="margin: 0 0 8px 0; color: #721c24; font-size: 16px;">Error Parsing Part List</h3>
                    <p style="margin: 0; color: #721c24; font-size: 13px;">${data.error || 'Unknown error occurred'}</p>
                    <details style="margin-top: 10px;">
                        <summary style="cursor: pointer; color: #721c24; font-weight: 600; font-size: 12px;">Troubleshooting Tips</summary>
                        <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #721c24; text-align: left; line-height: 1.6; font-size: 12px;">
                            <li>Make sure you copied the <strong>entire parts table</strong> from the Bluebrixx page</li>
                            <li>Include the lines with part numbers (e.g., 500024, 500042, etc.)</li>
                            <li>The text should contain tab-separated values or columns</li>
                            <li>Try copying again from the "Add Spare Parts" page</li>
                        </ul>
                    </details>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Bluebrixx parse error:', error);
        spinner.style.display = 'none';
        fetchBtn.disabled = false;
        
        statusDiv.innerHTML = `
            <div style="background: #f8d7da; border: 2px solid #f5c6cb; border-radius: 8px; padding: 15px; text-align: center;">
                <div style="font-size: 28px; margin-bottom: 8px;">❌</div>
                <h3 style="margin: 0 0 8px 0; color: #721c24; font-size: 16px;">Network Error</h3>
                <p style="margin: 0; color: #721c24; font-size: 13px;">Could not connect to the server. Please try again.</p>
            </div>
        `;
    }
}

function downloadBluebrixxXml() {
    console.log('[BLUEBRIXX] Downloading XML');
    window.location.href = '/bluebrixx_download_xml';
}

function inspectBluebrixxPartlist() {
    alert('To view the part list on Bluebrixx:\n\n1. Go to bluebrixx.com\n2. Log in to your account\n3. Go to Orders\n4. Find your order and click "Complain about missing parts"\n5. Click "+ Add Spare Parts"');
}

// Make functions globally accessible
window.openBluebrixxModal = openBluebrixxModal;
window.closeBluebrixxModal = closeBluebrixxModal;
window.fetchBluebrixxPartlist = fetchBluebrixxPartlist;
window.downloadBluebrixxXml = downloadBluebrixxXml;
window.inspectBluebrixxPartlist = inspectBluebrixxPartlist;

// Add initializeTabs to window (create placeholder if missing)
if (typeof initializeTabs !== 'function') {
    function initializeTabs() {
        // Placeholder: implement tab initialization if needed
    }
}
window.initializeTabs = initializeTabs;

// ===== IMAGE CROP FUNCTIONALITY =====

let cropState = {
    canvas: null,
    ctx: null,
    image: null,
    filename: null,
    cropBox: null,
    isDrawing: false,
    startX: 0,
    startY: 0
};

function showCropModal(filename) {
    const modal = document.getElementById('crop-modal');
    cropState.canvas = document.getElementById('crop-canvas');
    cropState.ctx = cropState.canvas.getContext('2d');
    cropState.filename = filename;
    cropState.cropBox = null;
    
    // Load the image
    const img = new Image();
    img.onload = function() {
        cropState.image = img;
        
        // Set canvas size to image size
        cropState.canvas.width = img.width;
        cropState.canvas.height = img.height;
        
        // Draw image
        cropState.ctx.drawImage(img, 0, 0);
        
        // Setup event listeners
        setupCropEventListeners();
    };
    
    img.src = `/image/${filename}?t=${Date.now()}`;
    modal.style.display = 'block';
}

function setupCropEventListeners() {
    const canvas = cropState.canvas;
    
    canvas.onmousedown = function(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        cropState.startX = (e.clientX - rect.left) * scaleX;
        cropState.startY = (e.clientY - rect.top) * scaleY;
        cropState.isDrawing = true;
        cropState.cropBox = {
            x: cropState.startX,
            y: cropState.startY,
            width: 0,
            height: 0
        };
    };
    
    canvas.onmousemove = function(e) {
        if (!cropState.isDrawing) return;
        
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const currentX = (e.clientX - rect.left) * scaleX;
        const currentY = (e.clientY - rect.top) * scaleY;
        
        cropState.cropBox.width = currentX - cropState.startX;
        cropState.cropBox.height = currentY - cropState.startY;
        
        // Redraw
        redrawCropCanvas();
    };
    
    canvas.onmouseup = function(e) {
        cropState.isDrawing = false;
        
        // Normalize crop box (handle negative dimensions)
        if (cropState.cropBox.width < 0) {
            cropState.cropBox.x += cropState.cropBox.width;
            cropState.cropBox.width = Math.abs(cropState.cropBox.width);
        }
        if (cropState.cropBox.height < 0) {
            cropState.cropBox.y += cropState.cropBox.height;
            cropState.cropBox.height = Math.abs(cropState.cropBox.height);
        }
        
        redrawCropCanvas();
    };
}

function redrawCropCanvas() {
    const ctx = cropState.ctx;
    const canvas = cropState.canvas;
    
    // Clear and redraw image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cropState.image, 0, 0);
    
    if (cropState.cropBox) {
        // Draw semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Clear the crop area
        ctx.clearRect(
            cropState.cropBox.x,
            cropState.cropBox.y,
            cropState.cropBox.width,
            cropState.cropBox.height
        );
        
        // Redraw image in crop area
        ctx.drawImage(
            cropState.image,
            cropState.cropBox.x,
            cropState.cropBox.y,
            cropState.cropBox.width,
            cropState.cropBox.height,
            cropState.cropBox.x,
            cropState.cropBox.y,
            cropState.cropBox.width,
            cropState.cropBox.height
        );
        
        // Draw border around crop area
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 3;
        ctx.strokeRect(
            cropState.cropBox.x,
            cropState.cropBox.y,
            cropState.cropBox.width,
            cropState.cropBox.height
        );
    }
}

function closeCropModal() {
    document.getElementById('crop-modal').style.display = 'none';
    cropState = {
        canvas: null,
        ctx: null,
        image: null,
        filename: null,
        cropBox: null,
        isDrawing: false,
        startX: 0,
        startY: 0
    };
}

async function applyCrop() {
    if (!cropState.cropBox || cropState.cropBox.width < 50 || cropState.cropBox.height < 50) {
        alert('Please select a larger area to crop.');
        return;
    }
    
    // Store filename before anything else
    const filename = cropState.filename;
    
    if (!filename) {
        alert('Error: No filename found. Please try again.');
        return;
    }
    
    // Show loading state
    const applyBtn = document.querySelector('#crop-modal button[onclick="applyCrop()"]');
    const originalBtnText = applyBtn.innerHTML;
    applyBtn.innerHTML = '<span class="spinner-circle" style="width: 16px; height: 16px; display: inline-block; margin-right: 5px; border: 2px solid #fff; border-top-color: transparent; vertical-align: middle;"></span>Processing...';
    applyBtn.disabled = true;
    
    // Create a new canvas for the cropped image
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropState.cropBox.width;
    croppedCanvas.height = cropState.cropBox.height;
    const croppedCtx = croppedCanvas.getContext('2d');
    
    // Draw the cropped portion
    croppedCtx.drawImage(
        cropState.image,
        cropState.cropBox.x,
        cropState.cropBox.y,
        cropState.cropBox.width,
        cropState.cropBox.height,
        0,
        0,
        cropState.cropBox.width,
        cropState.cropBox.height
    );
    
    // Convert to blob and create a temporary URL
    croppedCanvas.toBlob(async (blob) => {
        try {
            // Create object URL for immediate display
            const croppedImageUrl = URL.createObjectURL(blob);
            
            // Close crop modal first
            closeCropModal();
            
            // Clear boxes 
            appState.canvasDrawer.boxes = [];
            
            // Load cropped image directly into canvas
            await appState.canvasDrawer.loadImage(croppedImageUrl, filename);
            
            // Upload cropped image to server in background
            const formData = new FormData();
            formData.append('file', blob, filename);
            formData.append('overwrite', 'true');
            
            const response = await fetch('/upload_image', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error('Failed to upload cropped image');
            }
            
            // Update the image URL in uploadedImages
            const imageIndex = appState.uploadedImages.findIndex(img => img.filename === filename);
            if (imageIndex !== -1) {
                appState.uploadedImages[imageIndex].url = `/image/${filename}`;
            }
            
            // Automatically trigger auto-detect again
            const autoDetectBtn = document.getElementById('auto-detect-btn');
            autoDetectBtn.click();
            
            // Clean up object URL after a delay
            setTimeout(() => URL.revokeObjectURL(croppedImageUrl), 5000);
            
        } catch (error) {
            console.error('Error applying crop:', error);
            alert('Error saving cropped image. Please try again.');
            applyBtn.innerHTML = originalBtnText;
            applyBtn.disabled = false;
        }
    }, 'image/jpeg', 0.95);
}

window.showCropModal = showCropModal;
window.closeCropModal = closeCropModal;
window.applyCrop = applyCrop;
