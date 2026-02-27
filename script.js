// Inisialisasi variabel
let video = document.getElementById('video');
let canvas = document.getElementById('output');
let ctx = canvas.getContext('2d');
let predictionText = document.getElementById('prediction-text');

let model = null;
let lastPrediction = "Tidak ada tangan terdeteksi";
let predictionCount = {};
let lastUpdateTime = 0;
const UPDATE_INTERVAL = 100; // Update setiap 100ms

// Setup kamera
async function setupCamera() {
    video = document.getElementById('video');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 640,
                height: 480,
                facingMode: 'user'
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
        console.error("Error accessing camera:", error);
        alert("Gagal mengakses kamera. Pastikan kamera terhubung dan izinkan akses kamera.");
    }
}

// Load handpose model
async function loadModel() {
    try {
        model = await handpose.load();
        console.log("Model loaded successfully!");
        return model;
    } catch (error) {
        console.error("Error loading model:", error);
        alert("Gagal memuat model. Refresh halaman dan coba lagi.");
    }
}

// Deteksi posisi tangan dan gesture
function detectGesture(landmarks) {
    // Ambil titik-titik penting
    const thumb = landmarks[4];        // Ujung ibu jari
    const index = landmarks[8];        // Ujung telunjuk
    const middle = landmarks[12];      // Ujung jari tengah
    const ring = landmarks[16];        // Ujung jari manis
    const pinky = landmarks[20];       // Ujung kelingking
    
    // Titik pangkal jari
    const thumbBase = landmarks[2];    // Pangkal ibu jari
    const indexBase = landmarks[5];    // Pangkal telunjuk
    const middleBase = landmarks[9];   // Pangkal jari tengah
    const ringBase = landmarks[13];    // Pangkal jari manis
    const pinkyBase = landmarks[17];   // Pangkal kelingking
    
    // Fungsi untuk cek apakah jari lurus (ujung lebih tinggi dari pangkal)
    function isFingerStraight(fingerTip, fingerBase) {
        return fingerTip[1] < fingerBase[1] - 20; // Kurangi 20 untuk toleransi
    }
    
    // Deteksi gesture
    
    // 1. Thumbs Up (ibu jari lurus ke atas, jari lain mengepal)
    if (isFingerStraight(thumb, thumbBase) && 
        !isFingerStraight(index, indexBase) &&
        !isFingerStraight(middle, middleBase) &&
        !isFingerStraight(ring, ringBase) &&
        !isFingerStraight(pinky, pinkyBase)) {
        return {
            emoji: "👍",
            text: "Thumbs Up",
            meaning: "Baik"
        };
    }
    
    // 2. Peace Sign (telunjuk dan tengah lurus, lainnya mengepal)
    if (isFingerStraight(index, indexBase) && 
        isFingerStraight(middle, middleBase) &&
        !isFingerStraight(ring, ringBase) &&
        !isFingerStraight(pinky, pinkyBase)) {
        return {
            emoji: "✌️",
            text: "Peace",
            meaning: "Damai"
        };
    }
    
    // 3. Pointing (hanya telunjuk lurus)
    if (isFingerStraight(index, indexBase) && 
        !isFingerStraight(middle, middleBase) &&
        !isFingerStraight(ring, ringBase) &&
        !isFingerStraight(pinky, pinkyBase)) {
        return {
            emoji: "☝️",
            text: "Pointing",
            meaning: "Satu"
        };
    }
    
    // 4. Open Palm (semua jari lurus)
    if (isFingerStraight(index, indexBase) && 
        isFingerStraight(middle, middleBase) &&
        isFingerStraight(ring, ringBase) &&
        isFingerStraight(pinky, pinkyBase)) {
        return {
            emoji: "✋",
            text: "Open Palm",
            meaning: "Halo"
        };
    }
    
    // 5. OK Sign (ibu jari dan telunjuk membentuk lingkaran)
    const thumbIndexDistance = Math.sqrt(
        Math.pow(thumb[0] - index[0], 2) + 
        Math.pow(thumb[1] - index[1], 2)
    );
    
    if (thumbIndexDistance < 30 && 
        !isFingerStraight(middle, middleBase) &&
        !isFingerStraight(ring, ringBase) &&
        !isFingerStraight(pinky, pinkyBase)) {
        return {
            emoji: "👌",
            text: "OK",
            meaning: "Baik/Oke"
        };
    }
    
    return null;
}

// Stabilkan prediksi (ambil mayoritas dari beberapa frame)
function stabilizePrediction(prediction) {
    if (!prediction) return null;
    
    const key = prediction.text;
    predictionCount[key] = (predictionCount[key] || 0) + 1;
    
    // Reset setiap 15 frame
    if (Object.keys(predictionCount).length > 15) {
        predictionCount = {};
    }
    
    // Cari prediksi dengan count tertinggi
    let maxCount = 0;
    let stablePrediction = lastPrediction;
    
    for (let [pred, count] of Object.entries(predictionCount)) {
        if (count > maxCount) {
            maxCount = count;
            stablePrediction = pred;
        }
    }
    
    return stablePrediction;
}

// Gambar landmark tangan
function drawHand(landmarks) {
    // Gambar titik-titik landmark
    ctx.fillStyle = '#ff4444';
    ctx.shadowColor = 'white';
    ctx.shadowBlur = 5;
    
    for (let i = 0; i < landmarks.length; i++) {
        const [x, y] = landmarks[i];
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fill();
        
        // Tambahkan nomor untuk debugging (opsional)
        if (i % 4 === 0) {
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.fillText(i, x - 10, y - 10);
            ctx.fillStyle = '#ff4444';
        }
    }
    
    // Gambar garis penghubung untuk jari
    ctx.strokeStyle = '#44ff44';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#44ff44';
    
    // Hubungkan titik-titik untuk setiap jari
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

// Main detection loop
async function detectHands() {
    if (!model) return;
    
    // Estimate hands
    const predictions = await model.estimateHands(video);
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    if (predictions.length > 0) {
        predictions.forEach(prediction => {
            const landmarks = prediction.landmarks;
            
            // Draw hand landmarks
            drawHand(landmarks);
            
            // Detect gesture
            const gesture = detectGesture(landmarks);
            
            if (gesture) {
                const stablePrediction = stabilizePrediction(gesture);
                
                if (stablePrediction) {
                    // Cari gesture yang sesuai
                    if (stablePrediction === gesture.text) {
                        predictionText.innerHTML = `${gesture.emoji} ${gesture.text}<br><small>${gesture.meaning}</small>`;
                    }
                }
            } else {
                predictionText.innerHTML = "🫱 Gesture tidak dikenal<br><small>Coba gesture yang tersedia</small>";
            }
        });
    } else {
        // No hands detected
        predictionText.innerHTML = "👋 Tidak ada tangan terdeteksi<br><small>Arahkan tangan ke kamera</small>";
    }
    
    requestAnimationFrame(detectHands);
}

// Initialize app
async function init() {
    try {
        await setupCamera();
        video.play();
        
        // Set canvas size sesuai video
        video.addEventListener('loadeddata', () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        });
        
        await loadModel();
        detectHands();
        
    } catch (error) {
        console.error("Error:", error);
        predictionText.innerHTML = "❌ Error: Gagal memulai aplikasi";
    }
}

// Start app when page loads
window.addEventListener('load', init);
