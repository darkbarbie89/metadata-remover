// Initialize counters
let totalFilesProcessed = parseInt(localStorage.getItem('totalFiles') || '0');
let totalMetadataRemoved = parseInt(localStorage.getItem('totalMetadata') || '0');
let processedFiles = [];

// Update counter displays
function updateCounters() {
    document.getElementById('filesProcessed').textContent = totalFilesProcessed.toLocaleString();
    document.getElementById('metadataRemoved').textContent = totalMetadataRemoved.toLocaleString();
}

// Animate counter
function animateCounter(element, start, end, duration) {
    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;
    
    const timer = setInterval(() => {
        current += increment;
        if (current >= end) {
            current = end;
            clearInterval(timer);
        }
        element.textContent = Math.floor(current).toLocaleString();
    }, 16);
}

// Initialize on page load
updateCounters();

// Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const results = document.getElementById('results');
const fileList = document.getElementById('fileList');
const downloadAllBtn = document.getElementById('downloadAll');
const processMoreBtn = document.getElementById('processMore');

// Event Listeners
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', handleDragOver);
dropzone.addEventListener('drop', handleDrop);
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('active'));
fileInput.addEventListener('change', handleFileSelect);
downloadAllBtn.addEventListener('click', downloadAll);
if (processMoreBtn) {
    processMoreBtn.addEventListener('click', () => {
        results.classList.add('hidden');
        fileInput.value = '';
        processedFiles = [];
    });
}

function handleDragOver(e) {
    e.preventDefault();
    dropzone.classList.add('active');
}

function handleDrop(e) {
    e.preventDefault();
    dropzone.classList.remove('active');
    handleFiles(e.dataTransfer.files);
}

function handleFileSelect(e) {
    handleFiles(e.target.files);
}

async function handleFiles(files) {
    processedFiles = [];
    fileList.innerHTML = '';
    results.classList.remove('hidden');
    
    // Scroll to results
    results.scrollIntoView({ behavior: 'smooth' });
    
    let totalMetadataCount = 0;
    
    for (const file of files) {
        const result = await processFile(file);
        totalMetadataCount += result.metadataCount || 0;
    }
    
    // Update and save counters
    totalFilesProcessed += files.length;
    totalMetadataRemoved += totalMetadataCount;
    localStorage.setItem('totalFiles', totalFilesProcessed);
    localStorage.setItem('totalMetadata', totalMetadataRemoved);
    
    // Animate counter updates
    const filesElement = document.getElementById('filesProcessed');
    const metadataElement = document.getElementById('metadataRemoved');
    
    animateCounter(filesElement, totalFilesProcessed - files.length, totalFilesProcessed, 500);
    animateCounter(metadataElement, totalMetadataRemoved - totalMetadataCount, totalMetadataRemoved, 500);
}

async function processFile(file) {
    const fileItem = createFileItem(file.name, 'Processing...');
    fileList.appendChild(fileItem);
    fileItem.classList.add('processing');

    try {
        let cleanedFile;
        let metadataCount = 0;

        if (file.type.includes('image')) {
            const result = await cleanImage(file);
            cleanedFile = result.file;
            metadataCount = result.count;
        } else if (file.type === 'application/pdf') {
            const result = await cleanPDF(file);
            cleanedFile = result.file;
            metadataCount = result.count;
        } else {
            // For unsupported files, just pass through
            cleanedFile = file;
            metadataCount = 0;
        }

        processedFiles.push({
            original: file.name,
            cleaned: cleanedFile,
            metadataCount
        });

        fileItem.classList.remove('processing');
        fileItem.classList.add('success');
        updateFileItem(fileItem, file.name, metadataCount);
        
        return { metadataCount };
    } catch (error) {
        fileItem.classList.remove('processing');
        updateFileItem(fileItem, file.name, -1, error.message);
        return { metadataCount: 0 };
    }
}

async function cleanImage(file) {
    try {
        // Try to parse EXIF data, but don't fail if it doesn't work
        let exifData = null;
        let metadataCount = 0;
        
        try {
            exifData = await exifr.parse(file);
            metadataCount = exifData ? Object.keys(exifData).length : 0;
        } catch (exifError) {
            // PNG files often don't have EXIF data, which is fine
            console.log('No EXIF data found:', exifError.message);
            metadataCount = 0;
        }

        // Create a clean version without metadata
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        return new Promise((resolve, reject) => {
            img.onload = () => {
                try {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    
                    // Determine output format
                    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                    const quality = file.type === 'image/png' ? 1 : 0.95;
                    
                    canvas.toBlob((blob) => {
                        if (blob) {
                            const cleanFile = new File([blob], file.name, {
                                type: outputType
                            });
                            resolve({ file: cleanFile, count: metadataCount });
                        } else {
                            reject(new Error('Failed to create clean image'));
                        }
                    }, outputType, quality);
                } catch (err) {
                    reject(err);
                }
            };
            
            img.onerror = () => {
                reject(new Error('Failed to load image'));
            };
            
            // Create object URL for the image
            const url = URL.createObjectURL(file);
            img.src = url;
        });
    } catch (error) {
        console.error('Image processing error:', error);
        // Return the original file if processing fails
        return { file: file, count: 0 };
    }
}

async function cleanPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
        
        // Count existing metadata
        let metadataCount = 0;
        if (pdfDoc.getTitle()) metadataCount++;
        if (pdfDoc.getAuthor()) metadataCount++;
        if (pdfDoc.getSubject()) metadataCount++;
        if (pdfDoc.getKeywords()) metadataCount++;
        if (pdfDoc.getProducer()) metadataCount++;
        if (pdfDoc.getCreator()) metadataCount++;
        
        // Remove metadata
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setProducer('');
        pdfDoc.setCreator('');
        
        const pdfBytes = await pdfDoc.save();
        const cleanFile = new File([pdfBytes], file.name, { type: 'application/pdf' });
        
        return { file: cleanFile, count: metadataCount };
    } catch (error) {
        console.error('PDF processing error:', error);
        return { file: file, count: 0 };
    }
}

function createFileItem(filename, status) {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.innerHTML = `
        <div class="file-info">
            <h4>${filename}</h4>
            <p>${status}</p>
        </div>
        <button class="btn-primary" disabled>Processing...</button>
    `;
    return div;
}

function updateFileItem(element, filename, count, error = null) {
    const statusEl = element.querySelector('.file-info p');
    const buttonEl = element.querySelector('button');
    
    if (error) {
        statusEl.textContent = `Error: ${error}`;
        statusEl.style.color = 'var(--danger, #DC2626)';
        buttonEl.textContent = 'Failed';
        buttonEl.disabled = true;
    } else {
        statusEl.textContent = `${count} metadata items removed`;
        buttonEl.textContent = 'Download';
        buttonEl.disabled = false;
        buttonEl.onclick = () => downloadFile(filename);
    }
}

function downloadFile(filename) {
    const file = processedFiles.find(f => f.original === filename);
    if (file) {
        const url = URL.createObjectURL(file.cleaned);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clean_${filename}`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

function downloadAll() {
    processedFiles.forEach(file => {
        downloadFile(file.original);
    });
}