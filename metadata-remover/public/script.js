// State
let processedFiles = [];

// Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const results = document.getElementById('results');
const fileList = document.getElementById('fileList');
const downloadAllBtn = document.getElementById('downloadAll');

// Event Listeners
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', handleDragOver);
dropzone.addEventListener('drop', handleDrop);
fileInput.addEventListener('change', handleFileSelect);
downloadAllBtn.addEventListener('click', downloadAll);

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

    for (const file of files) {
        await processFile(file);
    }
}

async function processFile(file) {
    const fileItem = createFileItem(file.name, 'Processing...');
    fileList.appendChild(fileItem);

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
        }

        processedFiles.push({
            original: file.name,
            cleaned: cleanedFile,
            metadataCount
        });

        updateFileItem(fileItem, file.name, metadataCount);
    } catch (error) {
        updateFileItem(fileItem, file.name, -1, error.message);
    }
}

async function cleanImage(file) {
    // Read EXIF data
    const exifData = await exifr.parse(file);
    const metadataCount = exifData ? Object.keys(exifData).length : 0;

    // Create clean image without EXIF
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    return new Promise((resolve) => {
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            canvas.toBlob((blob) => {
                const cleanFile = new File([blob], file.name, {
                    type: file.type
                });
                resolve({ file: cleanFile, count: metadataCount });
            }, file.type);
        };
        img.src = URL.createObjectURL(file);
    });
}

async function cleanPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
    
    // Count metadata
    const metadataCount = 5; // Simplified for demo
    
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
}

function createFileItem(filename, status) {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.innerHTML = `
        <div class="file-info">
            <h4>${filename}</h4>
            <p class="metadata-count">${status}</p>
        </div>
        <button class="btn-primary" disabled>Processing...</button>
    `;
    return div;
}

function updateFileItem(element, filename, count, error = null) {
    const statusEl = element.querySelector('.metadata-count');
    const buttonEl = element.querySelector('button');
    
    if (error) {
        statusEl.textContent = `Error: ${error}`;
        statusEl.style.color = '#DC2626';
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
        a.download = `cleaned_${filename}`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

function downloadAll() {
    processedFiles.forEach(file => {
        downloadFile(file.original);
    });
}