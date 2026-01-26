/**
 * Canvas Drawing Module
 * Handles interactive bounding box drawing on images
 */

class CanvasDrawer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.image = null;
        this.boxes = [];
        this.currentBox = null;
        this.isDrawing = false;
        this.isResizing = false;
        this.resizeEdge = null;
        this.resizeBoxIndex = -1;
        this.startX = 0;
        this.startY = 0;
        this.currentFilename = null;
        this.hoveredBoxIndex = -1;  // Track which box is being hovered
        this.imageScale = 1;  // Track image scaling factor
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.onMouseLeave.bind(this));
        this.canvas.addEventListener('click', this.onClick.bind(this));
    }

    onClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        const clickX = (e.clientX - rect.left) * scaleX;
        const clickY = (e.clientY - rect.top) * scaleY;
        
        // Check if click is on any delete button
        for (let i = this.boxes.length - 1; i >= 0; i--) {
            const box = this.boxes[i];
            if (box.deleteBtn) {
                const btn = box.deleteBtn;
                const distance = Math.sqrt(
                    Math.pow(clickX - (btn.x + btn.size/2), 2) + 
                    Math.pow(clickY - (btn.y + btn.size/2), 2)
                );
                
                if (distance <= btn.size/2) {
                    // Delete this box
                    this.boxes.splice(i, 1);
                    this.saveBoxesToServer();
                    this.redraw();
                    return; // Stop after deleting one box
                }
            }
        }
    }
    
    loadImage(imageUrl, filename) {
        return new Promise((resolve, reject) => {
            this.currentFilename = filename;
            this.image = new Image();
            
            this.image.onload = () => {
                // Set canvas size to image size (image is already scaled server-side)
                this.canvas.width = this.image.width;
                this.canvas.height = this.image.height;
                
                // Load existing boxes for this image
                this.loadBoxesFromServer(filename).then(() => {
                    this.redraw();
                    resolve();
                });
            };
            
            this.image.onerror = reject;
            this.image.src = imageUrl;
        });
    }
    
    async loadBoxesFromServer(filename) {
        try {
            const response = await fetch(`/get_boxes/${filename}`);
            if (response.ok) {
                const data = await response.json();
                this.boxes = data.boxes || [];
            } else {
                this.boxes = [];
            }
        } catch (error) {
            console.error('Error loading boxes:', error);
            this.boxes = [];
        }
    }
    
    async saveBoxesToServer() {
        if (!this.currentFilename) return;
        
        try {
            const response = await fetch('/save_boxes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: this.currentFilename,
                    boxes: this.boxes
                })
            });
            
            if (!response.ok) {
                console.error('Failed to save boxes');
            }
            
            this.updateBoxCount();
            
            // Update analyze button state
            if (window.updateAnalyzeButtonState) {
                await window.updateAnalyzeButtonState();
            }
        } catch (error) {
            console.error('Error saving boxes:', error);
        }
    }
    
    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        this.startX = (e.clientX - rect.left) * scaleX;
        this.startY = (e.clientY - rect.top) * scaleY;
        
        // Check if mouse is near any box edge for resizing
        const edge = this.getEdgeAtPosition(this.startX, this.startY);
        if (edge) {
            this.isResizing = true;
            this.resizeEdge = edge.edge;
            this.resizeBoxIndex = edge.boxIndex;
            return;
        }
        
        // Otherwise start drawing new box
        this.isDrawing = true;
        this.currentBox = {
            x: this.startX,
            y: this.startY,
            width: 0,
            height: 0
        };
    }
    
    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        const currentX = (e.clientX - rect.left) * scaleX;
        const currentY = (e.clientY - rect.top) * scaleY;
        
        // Check which box is being hovered
        let newHoveredBox = -1;
        for (let i = 0; i < this.boxes.length; i++) {
            const box = this.boxes[i];
            if (currentX >= box.x && currentX <= box.x + box.width &&
                currentY >= box.y && currentY <= box.y + box.height) {
                newHoveredBox = i;
                break;
            }
        }
        
        // Redraw if hover state changed
        if (newHoveredBox !== this.hoveredBoxIndex) {
            this.hoveredBoxIndex = newHoveredBox;
            this.redraw();
        }
        
        // Update cursor based on position
        const edge = this.getEdgeAtPosition(currentX, currentY);
        if (edge) {
            if (edge.edge === 'left' || edge.edge === 'right') {
                this.canvas.style.cursor = 'ew-resize';
            } else if (edge.edge === 'top' || edge.edge === 'bottom') {
                this.canvas.style.cursor = 'ns-resize';
            }
        } else {
            this.canvas.style.cursor = 'crosshair';
        }
        
        // Handle resizing
        if (this.isResizing) {
            const box = this.boxes[this.resizeBoxIndex];
            const dx = currentX - this.startX;
            const dy = currentY - this.startY;
            
            if (this.resizeEdge === 'left') {
                box.x += dx;
                box.width -= dx;
            } else if (this.resizeEdge === 'right') {
                box.width += dx;
            } else if (this.resizeEdge === 'top') {
                box.y += dy;
                box.height -= dy;
            } else if (this.resizeEdge === 'bottom') {
                box.height += dy;
            }
            
            this.startX = currentX;
            this.startY = currentY;
            this.redraw();
            return;
        }
        
        // Handle drawing new box
        if (!this.isDrawing) return;
        
        this.currentBox.width = currentX - this.startX;
        this.currentBox.height = currentY - this.startY;
        
        this.redraw();
    }
    
    onMouseUp(e) {
        if (this.isResizing) {
            this.isResizing = false;
            this.resizeEdge = null;
            this.resizeBoxIndex = -1;
            this.saveBoxesToServer();
            this.redraw();
            return;
        }
        
        if (!this.isDrawing) return;
        
        this.isDrawing = false;
        
        // Normalize box (handle negative width/height)
        if (this.currentBox.width < 0) {
            this.currentBox.x += this.currentBox.width;
            this.currentBox.width = Math.abs(this.currentBox.width);
        }
        if (this.currentBox.height < 0) {
            this.currentBox.y += this.currentBox.height;
            this.currentBox.height = Math.abs(this.currentBox.height);
        }
        
        // Only add if box has reasonable size
        if (this.currentBox.width > 10 && this.currentBox.height > 10) {
            this.boxes.push({...this.currentBox});
            this.saveBoxesToServer();
        }
        
        this.currentBox = null;
        this.redraw();
    }
    
    onMouseLeave(e) {
        if (this.isDrawing) {
            this.onMouseUp(e);
        }
        if (this.isResizing) {
            this.onMouseUp(e);
        }
        // Reset hover when mouse leaves canvas
        if (this.hoveredBoxIndex !== -1) {
            this.hoveredBoxIndex = -1;
            this.redraw();
        }
    }
    
    getEdgeAtPosition(x, y) {
        const threshold = 8; // pixels from edge to trigger resize
        
        for (let i = 0; i < this.boxes.length; i++) {
            const box = this.boxes[i];
            const left = box.x;
            const right = box.x + box.width;
            const top = box.y;
            const bottom = box.y + box.height;
            
            // Check if near edges
            if (y >= top && y <= bottom) {
                if (Math.abs(x - left) < threshold) {
                    return { boxIndex: i, edge: 'left' };
                }
                if (Math.abs(x - right) < threshold) {
                    return { boxIndex: i, edge: 'right' };
                }
            }
            
            if (x >= left && x <= right) {
                if (Math.abs(y - top) < threshold) {
                    return { boxIndex: i, edge: 'top' };
                }
                if (Math.abs(y - bottom) < threshold) {
                    return { boxIndex: i, edge: 'bottom' };
                }
            }
        }
        
        return null;
    }
    
    redraw() {
        if (!this.image) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw image with zoom
        this.ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);
        
        // Draw saved boxes (blue with transparency)
        this.ctx.lineWidth = 1.5;
        this.ctx.font = 'bold 14px Arial';
        
        this.boxes.forEach((box, idx) => {
            // Draw semi-transparent blue border
            this.ctx.strokeStyle = 'rgba(0, 102, 255, 0.6)';
            this.ctx.strokeRect(box.x, box.y, box.width, box.height);
            
            // Draw part number INSIDE the box (top-left) - only if hovered
            if (this.hoveredBoxIndex === idx) {
                const label = `${idx + 1}`;
                const textWidth = this.ctx.measureText(label).width;
                const padding = 5;
                
                // Background for text (semi-transparent)
                this.ctx.fillStyle = 'rgba(0, 102, 255, 0.7)';
                this.ctx.fillRect(box.x + 3, box.y + 3, textWidth + padding * 2, 22);
                
                // Text (white, bold)
                this.ctx.fillStyle = 'white';
                this.ctx.fillText(label, box.x + 3 + padding, box.y + 3 + 16);
            }
            
            // Draw delete button (X) ON the top-right corner of box
            const deleteSize = 20;
            const deleteX = box.x + box.width - deleteSize / 2;
            const deleteY = box.y - deleteSize / 2;
            
            // Red background circle
            this.ctx.fillStyle = '#ff4444';
            this.ctx.beginPath();
            this.ctx.arc(deleteX + deleteSize/2, deleteY + deleteSize/2, deleteSize/2, 0, Math.PI * 2);
            this.ctx.fill();
            
            // White X
            this.ctx.strokeStyle = 'white';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(deleteX + 5, deleteY + 5);
            this.ctx.lineTo(deleteX + deleteSize - 5, deleteY + deleteSize - 5);
            this.ctx.moveTo(deleteX + deleteSize - 5, deleteY + 5);
            this.ctx.lineTo(deleteX + 5, deleteY + deleteSize - 5);
            this.ctx.stroke();
            
            // Store delete button position on box for click detection
            box.deleteBtn = {
                x: deleteX,
                y: deleteY,
                size: deleteSize
            };
            
            this.ctx.fillStyle = '#0066ff';
            this.ctx.strokeStyle = '#0066ff';
            this.ctx.lineWidth = 3;
        });
        
        // Draw current box (red, dashed)
        if (this.currentBox) {
            this.ctx.strokeStyle = '#ff0000';
            this.ctx.setLineDash([5, 5]);
            this.ctx.strokeRect(
                this.currentBox.x,
                this.currentBox.y,
                this.currentBox.width,
                this.currentBox.height
            );
            this.ctx.setLineDash([]);
        }
    }
    
    clearLastBox() {
        if (this.boxes.length > 0) {
            this.boxes.pop();
            this.saveBoxesToServer();
            this.redraw();
        }
    }
    
    clearAllBoxes() {
        if (confirm('Alle Boxen für dieses Bild löschen?')) {
            this.boxes = [];
            this.saveBoxesToServer();
            this.redraw();
        }
    }
    
    setBoxes(boxes) {
        this.boxes = boxes;
        this.saveBoxesToServer();
        this.redraw();
    }
    
    getBoxes() {
        return this.boxes;
    }
    
    getBoxCount() {
        return this.boxes.length;
    }
    
    updateBoxCount() {
        const counter = document.getElementById('box-count');
        if (counter) {
            counter.textContent = this.getBoxCount();
        }
    }
}

// Export for use in app.js
window.CanvasDrawer = CanvasDrawer;
