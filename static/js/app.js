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
    pdfData: null  // Store PDF page data
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeCanvas();
    initializeUpload();
    initializeAnalysis();
    loadColors();
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
        
        try {
            const response = await fetch('/auto_detect_boxes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: appState.canvasDrawer.currentFilename })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Check if no boxes were detected
                if (data.count === 0) {
                    alert('⚠️ No parts detected!\n\nAuto-Detect could not find any LEGO parts in the image. This can happen if:\n• The image is too bright/dark\n• There is not enough contrast\n• The parts are very small\n\nTry another image or mark the parts manually.');
                    return;
                }
                
                appState.canvasDrawer.setBoxes(data.boxes);
            } else {
                console.error('Auto-detect error:', data.error);
            }
        } catch (error) {
            console.error('Error auto-detecting boxes:', error);
            alert('Error during automatic detection');
        }
    });
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
    
    await appState.canvasDrawer.loadImage(image.url, filename);
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
    
    // Validate requirements before starting
    let totalBoxes = 0;
    for (const img of appState.uploadedImages) {
        try {
            const response = await fetch(`/get_boxes/${img.filename}`);
            if (response.ok) {
                const data = await response.json();
                totalBoxes += (data.boxes || []).length;
            }
        } catch (error) {
            console.error('Error checking boxes:', error);
        }
    }
    
    const noTextCheckbox = document.getElementById('no-text-checkbox');
    const checkboxChecked = noTextCheckbox ? noTextCheckbox.checked : false;
    
    // Check if requirements are met
    if (appState.uploadedImages.length === 0) {
        statusDiv.className = 'error';
        statusDiv.textContent = '❌ Please upload at least one image first.';
        return;
    }
    
    if (totalBoxes === 0) {
        statusDiv.className = 'error';
        statusDiv.textContent = '❌ Please mark at least one part by drawing boxes around them.';
        return;
    }
    
    if (!checkboxChecked) {
        statusDiv.className = 'error';
        statusDiv.textContent = '❌ Please confirm the checkbox that you did not mark text as parts.';
        return;
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
                const timePerCall = 0.5; // seconds
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
            throw new Error('Analysis failed');
        }
    } catch (error) {
        console.error('Analysis error:', error);
        clearInterval(progressInterval);
        spinner.style.display = 'none';
        analyzeBtn.style.display = 'block';
        analyzeBtn.disabled = false;
        statusDiv.className = 'error';
        statusDiv.textContent = 'Error during analysis!';
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

function displayReviewPart() {
    const reviewContent = document.getElementById('review-content');
    
    if (appState.reviewData.length === 0) {
        reviewContent.innerHTML = '<p>No parts to review.</p>';
        return;
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
            <p><strong>Recognized Part Number:</strong> ${part.part_id || 'N/A'}</p>
            <p><strong>Name:</strong> ${part.part_name || 'N/A'}</p>
            <p><strong>Confidence:</strong> ${(part.confidence * 100).toFixed(1)}%</p>
        `;
    } else {
        partInfo = '<p style="color: red;"><strong>Not recognized</strong></p>';
    }
    
    // Build color options with visual preview
    let colorOptions = '';
    if (part.recognized && part.colors) {
        part.colors.forEach(color => {
            // Find matching color from BrickLink colors
            const blColor = appState.colors.find(c => c.name === color.name || c.id === color.name);
            const hexColor = blColor ? blColor.rgb : '#ccc';  // RGB is actually HEX string
            const displayName = blColor ? blColor.name : color.name;  // Use BrickLink name
            colorOptions += `
                <div class="color-option" data-value="${color.name}" data-rgb="${hexColor}" onclick="selectColor('${color.name}', '${hexColor}', '${displayName.replace(/'/g, "\\'")}')">  
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
            <div class="review-progress" style="margin-bottom: 15px;">
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
                        <p style="margin: 0 0 5px 0; font-size: 13px;"><strong>API Reference:</strong></p>
                        <img src="${part.api_image_url}" style="width: 120px; height: 120px; object-fit: contain; border: 2px solid #28a745; border-radius: 8px;" onerror="this.style.display='none'">
                    </div>
                    ` : ''}
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${partNum > 1 ? '<button class="btn btn-secondary" style="padding: 8px 16px; font-size: 13px;" onclick="previousPart()">◄ Back</button>' : ''}
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
                            <label style="font-size: 12px; display: block; margin-bottom: 3px;">Part Number:</label>
                            <input type="text" id="part-num-input" value="${part.part_id || ''}" placeholder="e.g. 3001" style="width: 100%; padding: 6px;">
                        </div>
                        <div>
                            <label style="font-size: 12px; display: block; margin-bottom: 3px;">Color:</label>
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
                        </div>
                        <div>
                            <label style="font-size: 12px; display: block; margin-bottom: 3px;">Quantity:</label>
                            <input type="number" id="quantity-input" value="1" min="1" style="width: 100%; padding: 6px;">
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
            exportBtn.onclick = () => {
                const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'brickonizer_export.json';
                a.click();
            };
            
            // Add copy to clipboard button
            const copyBtn = document.getElementById('copy-json-btn');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
                        copyBtn.textContent = '✅ Copied!';
                        setTimeout(() => {
                            copyBtn.textContent = '📋 Copy to clipboard';
                        }, 2000);
                    });
                };
            }
            
            // Get unrecognized parts
            const resultsResponse = await fetch('/get_results');
            if (resultsResponse.ok) {
                const resultsData = await resultsResponse.json();
                const unrecognized = resultsData.results.filter(r => !r.recognized || (r.recognized && !r.part_id));
                
                if (unrecognized.length > 0) {
                    let unrecognizedHTML = `
                        <div class="unrecognized-section">
                            <h3>⚠️ Unrecognized Parts</h3>
                            <p>You will need to add these parts manually in brickIsbrick.com:</p>
                            <div class="unrecognized-grid">
                    `;
                    
                    unrecognized.forEach((part, idx) => {
                        unrecognizedHTML += `
                            <div class="unrecognized-part">
                                <img src="data:image/jpeg;base64,${part.crop_image}" alt="Part ${idx + 1}">
                                <p>Part ${idx + 1} from ${part.image_name}</p>
                            </div>
                        `;
                    });
                    
                    unrecognizedHTML += `
                            </div>
                        </div>
                    `;
                    
                    exportContent.innerHTML += unrecognizedHTML;
                }
            }
        }
    } catch (error) {
        console.error('Error loading export:', error);
    }
}

// Make functions global for onclick handlers
window.savePart = savePart;
window.skipPart = skipPart;
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

window.toggleColorDropdown = toggleColorDropdown;
window.selectColor = selectColor;