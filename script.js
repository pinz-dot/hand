// Inisialisasi variabel
let video = document.getElementById('video');
let canvas = document.getElementById('output');
let ctx = canvas.getContext('2d');
let predictionText = document.getElementById('prediction-text');
let speakBtn = document.getElementById('speak-btn');

let model = null;
let lastPrediction = "Tidak ada tangan terdeteksi";
let predictionCount = {};

// Setup kamera
async function setupCamera() {
    video = document.getElementById('video');
    
    const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
    });
    
    video.srcObject = stream;
    
    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            resolve(video);
        };
    });
}

// Load handpose model
async function loadModel() {
    model = await handpose.load();
    console.log("Model loaded!");
    return model;
}

// Deteksi posisi tangan
function detectHand(hand) {
    const landmarks = hand.landmarks;
    
    // Ambil titik-titik penting
    const thumb = landmarks[4];        // Ibu jari
    const index = landmarks[8];        // Telunjuk
    const middle = landmarks[12];       // Jari tengah
    const ring = landmarks[16];         // Jari manis
    const pinky = landmarks[20];        // Kelingking
    
    // Deteksi gesture sederhana
    // Cek thumbs up
    if (thumb[1] < index[1] && thumb[1] < middle[1] && 
        thumb[1] < ring[1] && thumb[1] < pinky[1]) {
        return "Thumbs Up = 👍 (Baik)";
    }
    
    // Cek peace sign (jari telunjuk dan tengah lurus)
    if (index[1] < thumb[1] && middle[1] < thumb[1] &&
        ring[1] > index[1] && pinky[1] > index[1]) {
        return "Peace = ✌️ (Damai)";
    }
    
    // Cek pointing (hanya telunjuk lurus)
    if (index[1] < thumb[1] && middle[1] > index[1] && 
        ring[1] > index[1] && pinky[1] > index[1]) {
        return "Pointing = ☝️ (Satu)";
    }
    
    // Cek open palm (semua jari lurus)
    if (index[1] < thumb[1] && middle[1] < thumb[1] && 
        ring[1] < thumb[1] && pinky[1] < thumb[1]) {
        return "Open Palm = ✋ (Halo)";
    }
    
    return "Gesture lain terdeteksi";
}

// Stabilkan prediksi (ambil mayoritas dari 5 frame terakhir)
function stabilizePrediction(prediction) {
    const key = prediction;
    predictionCount[key] = (predictionCount[key] || 0) + 1;
    
    // Reset setiap 10 frame
    if (Object.keys(predictionCount).length > 10) {
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

// Fungsi untuk mengeluarkan suara
function speak(text) {
    // Bersihkan text dari emoji untuk speech
    let cleanText = text.replace(/[✋✌️👍☝️]/g, '').trim();
    
    if ('speechSynthesis' in window) {
        // Hentikan ucapan yang sedang berlangsung
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'id-ID';
        utterance.rate = 0.9;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
    } else {
        alert('Browser tidak mendukung text-to-speech!');
    }
}

// Main detection loop
async function detectHands() {
    if (!model) return;
    
    // Estimate hands
    const predictions = await model.estimateHands(video);
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (predictions.length > 0) {
        // Draw hand
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        predictions.forEach(prediction => {
            const landmarks = prediction.landmarks;
            
            // Draw landmarks
            ctx.fillStyle = 'red';
            for (let i = 0; i < landmarks.length; i++) {
                const [x, y] = landmarks[i];
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, 2 * Math.PI);
                ctx.fill();
            }
            
            // Draw connections between landmarks
            ctx.strokeStyle = 'blue';
            ctx.lineWidth = 2;
            
            // Connect adjacent landmarks
            for (let i = 0; i < landmarks.length - 1; i++) {
                if (i % 4 !== 0) { // Connect fingers
                    const [x1, y1] = landmarks[i];
                    const [x2, y2] = landmarks[i + 1];
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
            }
            
            // Detect gesture
            const gesture = detectHand(prediction);
            const stableGesture = stabilizePrediction(gesture);
            lastPrediction = stableGesture;
            predictionText.textContent = stableGesture;
        });
    } else {
        // No hands detected
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        predictionText.textContent = "Tidak ada tangan terdeteksi";
    }
    
    requestAnimationFrame(detectHands);
}

// Initialize app
async function init() {
    try {
        await setupCamera();
        video.play();
        
        // Set canvas size
        video.addEventListener('loadeddata', () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        });
        
        await loadModel();
        detectHands();
        
    } catch (error) {
        console.error("Error:", error);
        alert("Gagal mengakses kamera atau memuat model. Pastikan kamera terhubung dan izinkan akses kamera.");
    }
}

// Event listeners
speakBtn.addEventListener('click', () => {
    speak(lastPrediction);
});

// Start app
init();
