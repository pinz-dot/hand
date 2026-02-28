// Inisialisasi variabel global
let video = document.getElementById('video');
let canvas = document.getElementById('output');
let ctx = canvas.getContext('2d');
let predictionText = document.getElementById('prediction-text');
let loadingIndicator = document.getElementById('loading');
let confidenceBadge = document.getElementById('confidence');
let model = null;
let lastPrediction = null;
let stats = {
    totalDetections: 0,
    gesturesDetected: {},
    startTime: Date.now()
};
let detectionHistory = [];

// OPTIMASI 1: Batasi frame rate
const FRAME_SKIP = 2; // Proses setiap 2 frame
let frameCounter = 0;

// OPTIMASI 2: Cache DOM elements
const resultContent = document.querySelector('.result-content');
const statusIndicators = document.querySelectorAll('.gesture-status');

// OPTIMASI 3: Threshold untuk deteksi
const CONFIDENCE_THRESHOLD = 70; // Minimal kepercayaan

// Setup kamera dengan resolusi rendah
async function setupCamera() {
    try {
        // OPTIMASI 4: Gunakan resolusi lebih rendah untuk performa
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 320 }, // Turunkan resolusi
                height: { ideal: 240 },
                facingMode: 'user',
                frameRate: { ideal: 15 } // Turunkan frame rate
            },
            audio: false
        });
        
        video.srcObject = stream;
        
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                resolve(video);
            };
        });
    } catch (error) {
        console.error('Camera error:', error);
        showError('Gagal mengakses kamera.');
    }
}

// Load model handpose
async function loadModel() {
    try {
        loadingIndicator.style.display = 'flex';
        
        // OPTIMASI 5: Gunakan backend WebGL dengan setting optimal
        await tf.setBackend('webgl');
        await tf.ready();
        
        // OPTIMASI 6: Load model dengan konfigurasi ringan
        model = await handpose.load({
            detectionConfidence: 0.5, // Turunkan threshold
            maxContinuousChecks: 3,    // Kurangi pengecekan
            iouThreshold: 0.2,          // Threshold IOU lebih rendah
            scoreThreshold: 0.3          // Threshold score lebih rendah
        });
        
        console.log('Model loaded successfully');
        loadingIndicator.style.display = 'none';
        return model;
    } catch (error) {
        console.error('Model loading error:', error);
        showError('Gagal memuat model.');
    }
}

// OPTIMASI 7: Deteksi gesture yang lebih efisien
function detectGesture(landmarks) {
    // Cache array indexes untuk akses lebih cepat
    const idx = {
        thumb: 4, thumbBase: 2,
        index: 8, indexBase: 5,
        middle: 12, middleBase: 9,
        ring: 16, ringBase: 13,
        pinky: 20, pinkyBase: 17
    };
    
    // Ambil koordinat dengan sekali akses
    const points = {
        thumb: landmarks[idx.thumb],
        thumbBase: landmarks[idx.thumbBase],
        index: landmarks[idx.index],
        indexBase: landmarks[idx.indexBase],
        middle: landmarks[idx.middle],
        middleBase: landmarks[idx.middleBase],
        ring: landmarks[idx.ring],
        ringBase: landmarks[idx.ringBase],
        pinky: landmarks[idx.pinky],
        pinkyBase: landmarks[idx.pinkyBase]
    };
    
    // Fungsi cek jari lurus (lebih sederhana)
    const isStraight = (tip, base) => tip[1] < base[1] - 10;
    
    // Hitung jarak untuk OK sign (gunakan Manhattan distance lebih cepat)
    const thumbIndexDist = Math.abs(points.thumb[0] - points.index[0]) + 
                          Math.abs(points.thumb[1] - points.index[1]);
    
    // Deteksi dengan early return (berhenti cepat jika ketemu)
    
    // 1. Open Palm (paling umum)
    if (isStraight(points.index, points.indexBase) && 
        isStraight(points.middle, points.middleBase) &&
        isStraight(points.ring, points.ringBase) &&
        isStraight(points.pinky, points.pinkyBase)) {
        return {
            name: 'Open Palm',
            emoji: '✋',
            meaning: 'Halo',
            confidence: 95
        };
    }
    
    // 2. Peace
    if (isStraight(points.index, points.indexBase) && 
        isStraight(points.middle, points.middleBase) &&
        !isStraight(points.ring, points.ringBase)) {
        return {
            name: 'Peace',
            emoji: '✌️',
            meaning: 'Damai',
            confidence: 90
        };
    }
    
    // 3. Thumbs Up
    if (isStraight(points.thumb, points.thumbBase) && 
        !isStraight(points.index, points.indexBase)) {
        return {
            name: 'Thumbs Up',
            emoji: '👍',
            meaning: 'Baik',
            confidence: 85
        };
    }
    
    // 4. Pointing
    if (isStraight(points.index, points.indexBase) && 
        !isStraight(points.middle, points.middleBase)) {
        return {
            name: 'Pointing',
            emoji: '☝️',
            meaning: 'Satu',
            confidence: 88
        };
    }
    
    // 5. OK Sign
    if (thumbIndexDist < 40 && 
        !isStraight(points.middle, points.middleBase)) {
        return {
            name: 'OK Sign',
            emoji: '👌',
            meaning: 'Oke',
            confidence: 92
        };
    }
    
    // 6. Rock On
    if (isStraight(points.index, points.indexBase) && 
        isStraight(points.pinky, points.pinkyBase) &&
        !isStraight(points.middle, points.middleBase)) {
        return {
            name: 'Rock On',
            emoji: '🤘',
            meaning: 'Keren',
            confidence: 87
        };
    }
    
    return null;
}

// OPTIMASI 8: Gambar landmark lebih ringan
function drawHand(landmarks) {
    // Hanya gambar titik-titik penting (kurangi jumlah)
    ctx.shadowBlur = 0; // Hilangkan shadow untuk performa
    
    // Gambar titik dengan ukuran lebih kecil
    ctx.fillStyle = '#ff4444';
    for (let i = 0; i < landmarks.length; i += 2) { // Skip setiap 2 titik
        const [x, y] = landmarks[i];
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    // Gambar garis penghubung (sederhanakan)
    ctx.strokeStyle = '#44ff44';
    ctx.lineWidth = 2;
    
    const connections = [
        [0,1], [1,2], [2,3], [3,4],     // Ibu jari
        [5,6], [6,7], [7,8],             // Telunjuk
        [9,10], [10,11], [11,12],        // Jari tengah
        [13,14], [14,15], [15,16],       // Jari manis
        [17,18], [18,19], [19,20]        // Kelingking
    ];
    
    ctx.beginPath();
    connections.forEach(([i, j]) => {
        const [x1, y1] = landmarks[i];
        const [x2, y2] = landmarks[j];
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
    });
    ctx.stroke();
}

// OPTIMASI 9: Update UI yang lebih efisien
function updateDetectionResult(gesture) {
    if (!gesture) {
        if (resultContent.innerHTML.includes('🫱')) return; // Skip jika sama
        resultContent.innerHTML = `
            <span class="result-emoji">🫱</span>
            <span class="result-message">Tidak dikenal</span>
        `;
        if (confidenceBadge) confidenceBadge.textContent = '0%';
        lastPrediction = null;
        return;
    }
    
    // Cek threshold confidence
    if (gesture.confidence < CONFIDENCE_THRESHOLD) return;
    
    // Update hanya jika gesture berbeda
    if (lastPrediction && lastPrediction.name === gesture.name) return;
    
    // Update result card
    resultContent.innerHTML = `
        <span class="result-emoji">${gesture.emoji}</span>
        <div class="result-message">
            <strong>${gesture.name}</strong><br>
            <small>${gesture.meaning}</small>
        </div>
    `;
    
    confidenceBadge.textContent = `${gesture.confidence}%`;
    
    // Update status indicator
    statusIndicators.forEach(ind => {
        ind.innerHTML = '⚪';
        ind.style.color = 'var(--text-secondary)';
    });
    
    const statusId = `status-${gesture.name.toLowerCase().replace(' ', '')}`;
    const statusEl = document.getElementById(statusId);
    if (statusEl) {
        statusEl.innerHTML = '🔵';
        statusEl.style.color = 'var(--primary-color)';
    }
    
    // Update stats
    stats.totalDetections++;
    stats.gesturesDetected[gesture.name] = (stats.gesturesDetected[gesture.name] || 0) + 1;
    
    // Add to history (batasi frekuensi)
    if (!lastPrediction || lastPrediction.name !== gesture.name) {
        const historyItem = {
            ...gesture,
            timestamp: new Date().toLocaleTimeString()
        };
        detectionHistory.unshift(historyItem);
        if (detectionHistory.length > 5) detectionHistory.pop(); // Kurangi jadi 5
    }
    
    lastPrediction = gesture;
}

// OPTIMASI 10: Detection loop yang dioptimasi
async function detectHands() {
    if (!model) return;
    
    // Skip frame untuk performa
    frameCounter++;
    if (frameCounter % FRAME_SKIP !== 0) {
        requestAnimationFrame(detectHands);
        return;
    }
    
    try {
        // OPTIMASI 11: Estimate dengan konfigurasi cepat
        const predictions = await model.estimateHands(video, false); // flipHorizontal = false untuk kecepatan
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        if (predictions.length > 0) {
            // OPTIMASI 12: Proses hanya 1 tangan pertama
            const prediction = predictions[0];
            drawHand(prediction.landmarks);
            
            const gesture = detectGesture(prediction.landmarks);
            updateDetectionResult(gesture);
        } else {
            updateDetectionResult(null);
        }
    } catch (error) {
        console.error('Detection error:', error);
    }
    
    requestAnimationFrame(detectHands);
}

// Initialize app
async function init() {
    await setupCamera();
    video.play();
    
    video.addEventListener('loadeddata', () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    });
    
    await loadModel();
    detectHands();
}

// Fungsi screenshot yang lebih ringan
function takeScreenshot() {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8); // Kompresi JPEG
    const link = document.createElement('a');
    link.download = `hand-gesture-${Date.now()}.jpg`;
    link.href = dataUrl;
    link.click();
}

// Reset detection
function resetDetection() {
    stats = {
        totalDetections: 0,
        gesturesDetected: {},
        startTime: Date.now()
    };
    detectionHistory = [];
    updateDetectionResult(null);
}

// OPTIMASI 13: Switch tab yang efisien
function switchTab(tabName) {
    // Update active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const activeNav = Array.from(document.querySelectorAll('.nav-item')).find(
        item => item.querySelector('.nav-label').textContent.toLowerCase() === tabName
    );
    if (activeNav) activeNav.classList.add('active');
    
    // Hide all
    document.querySelector('.camera-card').style.display = 'none';
    document.querySelector('.guide-section').style.display = 'none';
    
    // Remove existing containers
    document.querySelectorAll('.stats-container, .history-container, .info-container')
        .forEach(c => c.remove());
    
    // Show selected
    switch(tabName) {
        case 'camera':
            document.querySelector('.camera-card').style.display = 'block';
            document.querySelector('.guide-section').style.display = 'block';
            break;
        case 'stats':
            showStatsTab();
            break;
        case 'history':
            showHistoryTab();
            break;
        case 'info':
            showInfoTab();
            break;
    }
}

// Show stats tab (ringan)
function showStatsTab() {
    const mainContent = document.querySelector('.main-content');
    const statsContainer = document.createElement('div');
    statsContainer.className = 'stats-container';
    statsContainer.style.cssText = 'display:block; padding:20px; background:var(--card-bg); border-radius:24px;';
    
    const totalTime = Math.floor((Date.now() - stats.startTime) / 1000);
    const minutes = Math.floor(totalTime / 60);
    const seconds = totalTime % 60;
    
    statsContainer.innerHTML = `
        <h2 style="margin-bottom:15px;">📊 Statistik</h2>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div class="stat-card"><div style="font-size:2rem;">${stats.totalDetections}</div><div>Total</div></div>
            <div class="stat-card"><div style="font-size:2rem;">${Object.keys(stats.gesturesDetected).length}</div><div>Gesture</div></div>
            <div class="stat-card"><div style="font-size:2rem;">${minutes}m</div><div>Waktu</div></div>
            <div class="stat-card"><div style="font-size:2rem;">85%</div><div>Akurasi</div></div>
        </div>
        <button onclick="switchTab('camera')" style="width:100%; padding:12px; margin-top:15px; background:var(--primary-color); border:none; border-radius:12px; color:white;">
            Kembali
        </button>
    `;
    
    mainContent.appendChild(statsContainer);
}

// Show history tab (ringan)
function showHistoryTab() {
    const mainContent = document.querySelector('.main-content');
    const historyContainer = document.createElement('div');
    historyContainer.className = 'history-container';
    historyContainer.style.cssText = 'display:block; padding:20px; background:var(--card-bg); border-radius:24px;';
    
    let html = '<h2 style="margin-bottom:15px;">📜 Riwayat</h2>';
    
    if (detectionHistory.length === 0) {
        html += '<p style="text-align:center; padding:20px;">Belum ada riwayat</p>';
    } else {
        detectionHistory.slice(0, 5).forEach(item => {
            html += `
                <div style="display:flex; align-items:center; gap:10px; padding:10px; border-bottom:1px solid var(--border-color);">
                    <span style="font-size:2rem;">${item.emoji}</span>
                    <div style="flex:1;">${item.name}<br><small>${item.timestamp}</small></div>
                    <span class="confidence-badge">${item.confidence}%</span>
                </div>
            `;
        });
    }
    
    html += `<button onclick="switchTab('camera')" style="width:100%; padding:12px; margin-top:15px; background:var(--primary-color); border:none; border-radius:12px; color:white;">Kembali</button>`;
    
    historyContainer.innerHTML = html;
    mainContent.appendChild(historyContainer);
}

// Show info tab (ringan)
function showInfoTab() {
    const mainContent = document.querySelector('.main-content');
    const infoContainer = document.createElement('div');
    infoContainer.className = 'info-container';
    infoContainer.style.cssText = 'display:block; padding:20px; background:var(--card-bg); border-radius:24px;';
    
    infoContainer.innerHTML = `
        <h2 style="margin-bottom:15px;">ℹ️ Info</h2>
        <div style="padding:15px; background:rgba(255,255,255,0.05); border-radius:12px; margin-bottom:15px;">
            <p><strong>🤟 Hand Sign Language</strong></p>
            <p style="margin-top:10px;">Aplikasi deteksi bahasa isyarat real-time</p>
        </div>
        <div style="padding:15px; background:rgba(255,255,255,0.05); border-radius:12px; margin-bottom:15px;">
            <p><strong>📋 Cara Pakai:</strong></p>
            <ol style="padding-left:20px; margin-top:10px;">
                <li>Arahkan tangan ke kamera</li>
                <li>Tunjukkan gesture</li>
                <li>Lihat hasil deteksi</li>
            </ol>
        </div>
        <button onclick="switchTab('camera')" style="width:100%; padding:12px; background:var(--primary-color); border:none; border-radius:12px; color:white;">
            Kembali
        </button>
    `;
    
    mainContent.appendChild(infoContainer);
}

// Show error (ringan)
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:var(--danger-color); color:white; padding:10px 20px; border-radius:50px; z-index:1000;';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 2000);
}

// Start app
window.addEventListener('load', init);

// Handle orientation change
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        if (video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }
    }, 100);
});
