// =========================
// MetaRemoval - script.js
// =========================

// ---------- DEVICE-LOCAL COUNTERS ----------
const LS_FILES_KEY = 'mr_totalFiles';
const LS_META_KEY  = 'mr_totalMetadata';

function readIntLS(key) {
  const v = localStorage.getItem(key);
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

let totalFilesProcessed  = readIntLS(LS_FILES_KEY)  || 57;   // start at 57
let totalMetadataRemoved = readIntLS(LS_META_KEY)   || 248;  // start at 248

let processedFiles = [];

// Update counter displays (device totals)
function updateCounters() {
  const elFiles = document.getElementById('filesProcessed');
  const elMeta  = document.getElementById('metadataRemoved');
  if (!elFiles || !elMeta) return;
  elFiles.textContent = totalFilesProcessed.toLocaleString();
  elMeta.textContent  = totalMetadataRemoved.toLocaleString();
}

// Animate counter (UI only)
function animateCounter(element, start, end, duration) {
  if (!element) return;
  const range = end - start;
  if (range === 0) { element.textContent = end.toLocaleString(); return; }
  const steps = Math.max(1, Math.floor(duration / 16));
  const increment = range / steps;
  let current = start;
  let i = 0;

  const timer = setInterval(() => {
    i++;
    current += increment;
    if (i >= steps) { current = end; clearInterval(timer); }
    element.textContent = Math.floor(current).toLocaleString();
  }, 16);
}

// Initialize on page load (device counters + optional labels)
document.addEventListener('DOMContentLoaded', () => {
  updateCounters();
  const filesLbl = document.querySelector('#filesProcessed')?.closest('.stat-item')?.querySelector('.stat-label');
  const metaLbl  = document.querySelector('#metadataRemoved')?.closest('.stat-item')?.querySelector('.stat-label');
  if (filesLbl && !filesLbl.textContent.includes('(on this device)')) filesLbl.innerHTML += ' <span style="opacity:.7">(on this device)</span>';
  if (metaLbl  && !metaLbl.textContent.includes('(on this device)'))  metaLbl.innerHTML  += ' <span style="opacity:.7">(on this device)</span>';

  // If you later add a global stats API, you can call loadGlobalStats() here.
  // loadGlobalStats();
});

// Bump device totals and persist
function bumpDeviceCounters({ filesDelta = 0, metadataDelta = 0 }) {
  totalFilesProcessed  += filesDelta;
  totalMetadataRemoved += metadataDelta;
  localStorage.setItem(LS_FILES_KEY, String(totalFilesProcessed));
  localStorage.setItem(LS_META_KEY,  String(totalMetadataRemoved));
  updateCounters();
}

// ---------- OPTIONAL GLOBAL COUNTERS (wire up when you have /api/stats) ----------
async function loadGlobalStats() {
  try {
    const res = await fetch('/api/stats', { cache: 'no-store' });
    if (!res.ok) return;
    const { totalFiles, totalMeta } = await res.json();
    const filesEl = document.getElementById('filesProcessed');
    const metaEl  = document.getElementById('metadataRemoved');
    if (filesEl) filesEl.textContent = (totalFiles || 0).toLocaleString();
    if (metaEl)  metaEl.textContent  = (totalMeta  || 0).toLocaleString();

    const filesLbl = filesEl?.closest('.stat-item')?.querySelector('.stat-label');
    const metaLbl  = metaEl?.closest('.stat-item')?.querySelector('.stat-label');
    if (filesLbl) filesLbl.textContent = 'Files Processed (global)';
    if (metaLbl)  metaLbl.textContent  = 'Metadata Items Removed (global)';
  } catch {/* no-op */}
}

async function bumpGlobalCounters({ filesDelta = 0, metadataDelta = 0 }) {
  try {
    await fetch('/api/stats', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filesDelta, metadataDelta }),
      keepalive: true
    });
  } catch {/* no-op */}
}

// ---------- UI ELEMENTS ----------
const dropzone       = document.getElementById('dropzone');
const fileInput      = document.getElementById('fileInput');
const results        = document.getElementById('results');
const fileList       = document.getElementById('fileList');
const downloadAllBtn = document.getElementById('downloadAll');
const processMoreBtn = document.getElementById('processMore');

// ---------- EVENT LISTENERS ----------
if (dropzone) {
  dropzone.addEventListener('click', () => fileInput && fileInput.click());
  dropzone.addEventListener('dragover', handleDragOver);
  dropzone.addEventListener('drop', handleDrop);
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('active'));
}
if (fileInput) fileInput.addEventListener('change', handleFileSelect);
if (downloadAllBtn) downloadAllBtn.addEventListener('click', downloadAll);
if (processMoreBtn) {
  processMoreBtn.addEventListener('click', () => {
    if (results) results.classList.add('hidden');
    if (fileInput) fileInput.value = '';
    processedFiles = [];
  });
}

// ---------- DND HANDLERS ----------
function handleDragOver(e) {
  e.preventDefault();
  if (dropzone) dropzone.classList.add('active');
}

function handleDrop(e) {
  e.preventDefault();
  if (dropzone) dropzone.classList.remove('active');
  if (e.dataTransfer && e.dataTransfer.files) {
    handleFiles(e.dataTransfer.files);
  }
}

function handleFileSelect(e) {
  const files = e.target && e.target.files ? e.target.files : null;
  if (files) handleFiles(files);
}

// ---------- CORE FLOW ----------
async function handleFiles(files) {
  processedFiles = [];
  if (fileList) fileList.innerHTML = '';
  if (results) results.classList.remove('hidden');
  if (results && results.scrollIntoView) results.scrollIntoView({ behavior: 'smooth' });

  let totalMetadataCount = 0;

  // Convert FileList -> Array to safely iterate with for..of in older browsers
  const arr = Array.from(files);
  for (const file of arr) {
    const result = await processFile(file);
    totalMetadataCount += result.metadataCount || 0;
  }

  // ---- Update counters (DEVICE) ----
  const prevFiles = totalFilesProcessed;
  const prevMeta  = totalMetadataRemoved;

  bumpDeviceCounters({ filesDelta: arr.length, metadataDelta: totalMetadataCount });

  animateCounter(document.getElementById('filesProcessed'), prevFiles, totalFilesProcessed, 500);
  animateCounter(document.getElementById('metadataRemoved'), prevMeta,  totalMetadataRemoved, 500);

  // ---- Optional GLOBAL bump (no effect until you add /api/stats) ----
  // bumpGlobalCounters({ filesDelta: arr.length, metadataDelta: totalMetadataCount });
}

async function processFile(file) {
  const fileItem = createFileItem(file.name, 'Processing...');
  if (fileList) fileList.appendChild(fileItem);
  fileItem.classList.add('processing');

  try {
    let cleanedFile;
    let metadataCount = 0;
    let isProtected = false;

    if (file.type.includes('image')) {
      const result = await cleanImage(file);
      cleanedFile   = result.file;
      metadataCount = result.count;
    } else if (file.type === 'application/pdf') {
      const result = await cleanPDF(file);
      cleanedFile   = result.file;
      metadataCount = result.count;
      isProtected   = result.protected || false;
    } else {
      // Unsupported types: pass-through
      cleanedFile   = file;
      metadataCount = 0;
    }

    processedFiles.push({
      original: file.name,
      cleaned: cleanedFile,
      metadataCount,
      isProtected
    });

    fileItem.classList.remove('processing');

    if (isProtected) {
      fileItem.classList.add('warning');
      updateFileItem(fileItem, file.name, -2); // Protected
    } else {
      fileItem.classList.add('success');
      updateFileItem(fileItem, file.name, metadataCount);
    }

    return { metadataCount: isProtected ? 0 : metadataCount };
  } catch (error) {
    fileItem.classList.remove('processing');
    updateFileItem(fileItem, file.name, -1, error && error.message ? error.message : 'Unknown error');
    return { metadataCount: 0 };
  }
}

// ---------- IMAGE CLEAN ----------
async function cleanImage(file) {
  try {
    let metadataCount = 0;

    // Try EXIF parse (best-effort)
    try {
      const exifData = await exifr.parse(file);
      metadataCount = exifData ? Object.keys(exifData).length : 0;
    } catch (_err) {
      // Many PNGs/GIFs have no EXIF; not an error
      metadataCount = 0;
    }

    // Draw to canvas to strip metadata
    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d', { willReadFrequently: false });
    const img    = new Image();

    return new Promise((resolve, reject) => {
      img.onload = () => {
        try {
          canvas.width  = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const quality    = file.type === 'image/png' ? 1 : 0.95;

          canvas.toBlob((blob) => {
            if (blob) {
              const cleanFile = new File([blob], file.name, { type: outputType });
              resolve({ file: cleanFile, count: metadataCount });
            } else {
              reject(new Error('Failed to create clean image'));
            }
          }, outputType, quality);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  } catch (_error) {
    return { file: file, count: 0 };
  }
}

// ---------- PDF CLEAN ----------
async function cleanPDF(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    let pdfDoc;

    try {
      pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    } catch (_err) {
      // Encrypted/protected
      return { file: file, count: 0, protected: true };
    }

    // Count known metadata fields
    let metadataCount = 0;
    try {
      if (pdfDoc.getTitle())    metadataCount++;
      if (pdfDoc.getAuthor())   metadataCount++;
      if (pdfDoc.getSubject())  metadataCount++;
      if (pdfDoc.getKeywords()) metadataCount++;
      if (pdfDoc.getProducer()) metadataCount++;
      if (pdfDoc.getCreator())  metadataCount++;
    } catch (_err) { /* ignore */ }

    try {
      // Clear metadata
      pdfDoc.setTitle('');
      pdfDoc.setAuthor('');
      pdfDoc.setSubject('');
      pdfDoc.setKeywords([]);
      pdfDoc.setProducer('');
      pdfDoc.setCreator('');

      const pdfBytes = await pdfDoc.save();
      const cleanFile = new File([pdfBytes], file.name, { type: 'application/pdf' });
      return { file: cleanFile, count: metadataCount };
    } catch (_err) {
      return { file: file, count: 0, protected: true };
    }
  } catch (_error) {
    return { file: file, count: 0 };
  }
}

// ---------- LIST UI ----------
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

function updateFileItem(element, filename, count, error) {
  const statusEl = element.querySelector('.file-info p');
  const buttonEl = element.querySelector('button');

  if (count === -2) {
    // Protected PDF
    statusEl.textContent = 'PDF is protected — cannot remove metadata';
    statusEl.style.color = 'var(--accent, #F59E0B)';
    buttonEl.textContent = 'Protected';
    buttonEl.disabled = true;
    return;
  }

  if (error) {
    statusEl.textContent = `Error: ${error}`;
    statusEl.style.color = 'var(--danger, #DC2626)';
    buttonEl.textContent = 'Failed';
    buttonEl.disabled = true;
    return;
  }

  statusEl.textContent = `${count} metadata items removed`;
  buttonEl.textContent = 'Download';
  buttonEl.disabled = false;
  buttonEl.onclick = () => downloadFile(filename);
}

// ---------- DOWNLOADS ----------
function downloadFile(filename) {
  const file = processedFiles.find(f => f.original === filename);
  if (!file) return;
  const url = URL.createObjectURL(file.cleaned);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clean_${filename}`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadAll() {
  processedFiles.forEach(file => downloadFile(file.original));
}
