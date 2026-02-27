// Inisialisasi variabel global
let video = document.getElementById('video');
let canvas = document.getElementById('output');
let ctx = canvas.getContext('2d');
let predictionText = document.getElementById('prediction-text');
let loadingIndicator = document.getElementById('loading');
let confidenceBadge = document.getElementById('confidence');
let model = null;
let lastPrediction = null;
let predictionHistory = [];
let stats = {
    totalDetections: 0,
    gesturesDetected: {},
    startTime: Date.now()
};
let detectionHistory = [];

// Setup kamera dengan kualitas terbaik
async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user',
                frameRate: { ideal: 30 }
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
        showError('Gagal mengakses kamera. Pastikan kamera terhubung dan izinkan akses.');
    }
}

// Load model handpose
async function loadModel() {
    try {
        loadingIndicator.style.display = 'flex';
        model = await handpose.load();
        console.log('Model loaded successfully');
        loadingIndicator.style.display = 'none';
        return model;
    } catch (error) {
        console.error('Model loading error:', error);
        showError('Gagal memuat model. Refresh halaman dan coba lagi.');
    }
}

// Deteksi gesture dengan lebih akurat
function detectGesture(landmarks) {
    // Ambil koordinat ujung jari
    const thumb = landmarks[4];      // Ibu jari
    const index = landmarks[8];       // Telunjuk
    const middle = landmarks[12];     // Jari tengah
    const ring = landmarks[16];       // Jari manis
    const pinky = landmarks[20];      // Kelingking
    
    // Ambil koordinat pangkal jari
    const thumbBase = landmarks[2];
    const indexBase = landmarks[5];
    const middleBase = landmarks[9];
    const ringBase = landmarks[13];
    const pinkyBase = landmarks[17];
    
    // Fungsi untuk menghitung jarak antar titik
    function getDistance(p1, p2) {
        return Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2));
    }
    
    // Fungsi untuk cek apakah jari lurus
    function isFingerStraight(tip, base) {
        return tip[1] < base[1] - 15; // Jari lurus ke atas
    }
    
    // Hitung jarak untuk deteksi OK
    const thumbIndexDistance = getDistance(thumb, index);
    
    // Deteksi gesture
    
    // 1. Open Palm (semua jari lurus)
    if (isFingerStraight(index, indexBase) && 
        isFingerStraight(middle, middleBase) &&
        isFingerStraight(ring, ringBase) &&
        isFingerStraight(pinky, pinkyBase)) {
        return {
            name: 'Open Palm',
            emoji: '✋',
            meaning: 'Halo / Hai',
            confidence: 95
        };
    }
    
    // 2. Peace (telunjuk dan tengah lurus)
    if (isFingerStraight(index, indexBase) && 
        isFingerStraight(middle, middleBase) &&
        !isFingerStraight(ring, ringBase) &&
        !isFingerStraight(pinky, pinkyBase)) {
        return {
            name: 'Peace',
            emoji: '✌️',
            meaning: 'Damai / Victory',
            confidence: 90
        };
    }
    
    // 3. Thumbs Up (ibu jari lurus)
    if (isFingerStraight(thumb, thumbBase) && 
        !isFingerStraight(index, indexBase) &&
        !isFingerStraight(middle, middleBase) &&
        !isFingerStraight(ring, ringBase) &&
        !isFingerStraight(pinky, pinkyBase)) {
        return {
            name: 'Thumbs Up',
            emoji: '👍',
            meaning: 'Baik / Sip',
            confidence: 85
        };
    }
    
    // 4. Pointing (telunjuk lurus)
    if (isFingerStraight(index, indexBase) && 
        !isFingerStraight(middle, middleBase) &&
        !isFingerStraight(ring, ringBase) &&
        !isFingerStraight(pinky, pinkyBase)) {
        return {
            name: 'Pointing',
            emoji: '☝️',
            meaning: 'Satu / Tunjuk',
            confidence: 88
        };
    }
    
    // 5. OK Sign
    if (thumbIndexDistance < 30 && 
        !isFingerStraight(middle, middleBase) &&
        !isFingerStraight(ring, ringBase) &&
        !isFingerStraight(pinky, pinkyBase)) {
        return {
            name: 'OK Sign',
            emoji: '👌',
            meaning: 'Oke / Setuju',
            confidence: 92
        };
    }
    
    // 6. Rock On (telunjuk dan kelingking lurus)
    if (isFingerStraight(index, indexBase) && 
        isFingerStraight(pinky, pinkyBase) &&
        !isFingerStraight(middle, middleBase) &&
        !isFingerStraight(ring, ringBase)) {
        return {
            name: 'Rock On',
            emoji: '🤘',
            meaning: 'Keren / Rock',
            confidence: 87
        };
    }
    
    return null;
}

// Gambar landmark dengan style yang lebih baik
function drawHand(landmarks) {
    // Gambar titik-titik landmark
    landmarks.forEach((point, i) => {
        const [x, y] = point;
        
        // Gradient untuk titik
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 10);
        gradient.addColorStop(0, '#ff4444');
        gradient.addColorStop(1, '#ff8888');
        
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = gradient;
        ctx.shadowColor = '#ff4444';
        ctx.shadowBlur = 10;
        ctx.fill();
        
        // Nomor landmark (untuk debugging, bisa dihapus)
        if (i % 4 === 0) {
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'white';
            ctx.font = '10px Arial';
            ctx.fillText(i, x - 5, y - 10);
        }
    });
    
    // Gambar garis penghubung
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#44ff44';
    ctx.strokeStyle = '#44ff44';
    ctx.lineWidth = 3;
    
    const fingerIndices = [
        [0, 1, 2, 3, 4],     // Ibu jari
        [5, 6, 7, 8],        // Telunjuk
        [9, 10, 11, 12],     // Jari tengah
        [13, 14, 15, 16],    // Jari manis
        [17, 18, 19, 20]     // Kelingking
    ];
    
    fingerIndices.forEach(finger => {
        for (let i = 0; i < finger.length - 1; i++) {
            const [x1, y1] = landmarks[finger[i]];
            const [x2, y2] = landmarks[finger[i + 1]];
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
    });
    
    ctx.shadowBlur = 0;
}

// Update UI dengan hasil deteksi
function updateDetectionResult(gesture) {
    const resultContent = document.querySelector('.result-content');
    const statusIndicators = document.querySelectorAll('.gesture-status');
    
    // Reset semua status
    statusIndicators.forEach(ind => {
        ind.innerHTML = '⚪';
        ind.style.color = 'var(--text-secondary)';
    });
    
    if (gesture) {
        // Update result card
        resultContent.innerHTML = `
            <span class="result-emoji">${gesture.emoji}</span>
            <div class="result-message">
                <strong>${gesture.name}</strong><br>
                <small>${gesture.meaning}</small>
            </div>
        `;
        
        // Update confidence
        confidenceBadge.textContent = `${gesture.confidence}%`;
        
        // Update status indicator
        const statusId = `status-${gesture.name.toLowerCase().replace(' ', '')}`;
        const statusEl = document.getElementById(statusId);
        if (statusEl) {
            statusEl.innerHTML = '🔵';
            statusEl.style.color = 'var(--primary-color)';
        }
        
        // Update stats
        updateStats(gesture.name);
        
        // Add to history
        addToHistory(gesture);
        
        lastPrediction = gesture;
    } else {
        resultContent.innerHTML = `
            <span class="result-emoji">🫱</span>
            <span class="result-message">Gesture tidak dikenal</span>
        `;
        confidenceBadge.textContent = '0%';
    }
}

// Update statistik
function updateStats(gestureName) {
    stats.totalDetections++;
    stats.gesturesDetected[gestureName] = (stats.gesturesDetected[gestureName] || 0) + 1;
    
    // Update stats display jika tab stats aktif
    updateStatsDisplay();
}

// Update tampilan statistik
function updateStatsDisplay() {
    const statsContainer = document.querySelector('.stats-container');
    if (statsContainer && statsContainer.style.display === 'grid') {
        // Hitung gesture terbanyak
        let mostFrequent = Object.entries(stats.gesturesDetected)
            .sort((a, b) => b[1] - a[1])[0];
        
        document.getElementById('totalDetections').textContent = stats.totalDetections;
        document.getElementById('uniqueGestures').textContent = Object.keys(stats.gesturesDetected).length;
        document.getElementById('mostFrequent').textContent = mostFrequent ? mostFrequent[0] : '-';
        document.getElementById('sessionTime').textContent = 
            Math.floor((Date.now() - stats.startTime) / 1000) + ' detik';
    }
}

// Tambah ke history
function addToHistory(gesture) {
    const historyItem = {
        ...gesture,
        timestamp: new Date().toLocaleTimeString()
    };
    
    detectionHistory.unshift(historyItem);
    if (detectionHistory.length > 10) detectionHistory.pop();
    
    updateHistoryDisplay();
}

// Update tampilan history
function updateHistoryDisplay() {
    const historyContainer = document.querySelector('.history-container');
    if (historyContainer && historyContainer.style.display === 'block') {
        historyContainer.innerHTML = detectionHistory.map(item => `
            <div class="history-item">
                <span class="history-emoji">${item.emoji}</span>
                <div class="history-info">
                    <strong>${item.name}</strong>
                    <p>${item.meaning}</p>
                    <div class="history-time">${item.timestamp}</div>
                </div>
                <span class="confidence-badge">${item.confidence}%</span>
            </div>
        `).join('');
    }
}

// Main detection loop
async function detectHands() {
    if (!model) return;
    
    const predictions = await model.estimateHands(video);
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    if (predictions.length > 0) {
        predictions.forEach(prediction => {
            drawHand(prediction.landmarks);
            
            const gesture = detectGesture(prediction.landmarks);
            updateDetectionResult(gesture);
        });
    } else {
        updateDetectionResult(null);
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

// Function untuk screenshot
function takeScreenshot() {
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `hand-gesture-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    
    // Tampilkan notifikasi
    alert('📸 Screenshot disimpan!');
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
    updateStatsDisplay();
    updateHistoryDisplay();
}

// Switch tab
function switchTab(tabName) {
    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    
    // Hide all tab contents
    document.querySelector('.camera-card').style.display = 'block';
    document.querySelector('.guide-section').style.display = 'block';
    
    // Show selected tab content (untuk pengembangan lebih lanjut)
    if (tabName === 'stats') {
        // Tampilkan stats
    } else if (tabName === 'history') {
        // Tampilkan history
    } else if (tabName === 'info') {
        // Tampilkan info
    }
}

// Show gesture detail
function showGestureDetail(gesture) {
    const modal = document.getElementById('gestureModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    const details = {
        openpalm: {
            title: 'Open Palm ✋',
            desc: 'Telapak tangan terbuka dengan semua jari lurus',
            meaning: 'Halo / Hai',
            tips: 'Pastikan semua jari terlihat jelas dan terbuka lebar'
        },
        peace: {
            title: 'Peace Sign ✌️',
            desc: 'Jari telunjuk dan tengah lurus membentuk huruf V',
            meaning: 'Damai / Victory',
            tips: 'Jari manis dan kelingking harus menekuk'
        },
        thumbsup: {
            title: 'Thumbs Up 👍',
            desc: 'Ibu jari lurus ke atas, jari lainnya mengepal',
            meaning: 'Baik / Sip',
            tips: 'Pastikan ibu jari terlihat jelas di samping'
        },
        pointing: {
            title: 'Pointing ☝️',
            desc: 'Hanya jari telunjuk yang lurus',
            meaning: 'Satu / Tunjuk',
            tips: 'Jari lainnya harus menekuk dengan rapat'
        },
        ok: {
            title: 'OK Sign 👌',
            desc: 'Ibu jari dan telunjuk membentuk lingkaran',
            meaning: 'Oke / Setuju',
            tips: 'Pastikan lingkaran terlihat jelas'
        },
        rock: {
            title: 'Rock On 🤘',
            desc: 'Jari telunjuk dan kelingking lurus',
            meaning: 'Keren / Rock',
            tips: 'Jari tengah dan manis harus menekuk'
        }
    };
    
    const detail = details[gesture];
    if (detail) {
        modalTitle.textContent = detail.title;
        modalBody.innerHTML = `
            <p style="margin-bottom: 15px;">${detail.desc}</p>
            <p style="margin-bottom: 10px;"><strong>Arti:</strong> ${detail.meaning}</p>
            <p><strong>Tips:</strong> ${detail.tips}</p>
        `;
        modal.classList.add('active');
    }
}

// Close modal
function closeModal() {
    document.getElementById('gestureModal').classList.remove('active');
}

// Show error
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--danger-color);
        color: white;
        padding: 15px 25px;
        border-radius: 50px;
        z-index: 1000;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 3000);
}

// Start app
window.addEventListener('load', init);

// Handle orientation change
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }, 100);
});
