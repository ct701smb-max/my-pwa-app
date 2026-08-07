document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // DOM要素の取得
    // ----------------------------------------------------
    const canvas = document.getElementById('main-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const imageLoader = document.getElementById('image-loader');
    const downloadBtn = document.getElementById('download-btn');
    const brushSizeInput = document.getElementById('brush-size');
    const toolEraserBtn = document.getElementById('tool-eraser');
    const toolRestoreBtn = document.getElementById('tool-restore');
    const toolLassoBtn = document.getElementById('tool-lasso');
    const toolRectBtn = document.getElementById('tool-rect');     // 四角形ボタン
    const toolCircleBtn = document.getElementById('tool-circle'); // 円形ボタン
    const toolInvertBtn = document.getElementById('tool-invert'); // 色反転ボタン
    const brushIndicator = document.getElementById('brush-indicator');
    const sideMenuPanel = document.getElementById('side-menu-panel');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const colorPicker = document.getElementById('color-picker');
    const toolColorEraserBtn = document.getElementById('tool-color-eraser');
    const colorEraserToleranceInput = document.getElementById('color-eraser-tolerance');
    const toleranceValueSpan = document.getElementById('tolerance-value');
    const toolSamplerBtn = document.getElementById('tool-sampler');
    const colorSamplerIndicator = document.getElementById('color-sampler-indicator');
    const samplerOutputColor = document.getElementById('sampler-output-color');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const reloadBtn = document.getElementById('reload-btn');
    const toolAutoRemoveBtn = document.getElementById('tool-auto-remove');
    const autoRemoveThresholdInput = document.getElementById('auto-remove-threshold');
    const thresholdValueSpan = document.getElementById('threshold-value');

    if (!canvas || !imageLoader || !brushSizeInput || !ctx || !colorSamplerIndicator || !autoRemoveThresholdInput) {
        console.error("Critical DOM elements are missing. Check your HTML structure.");
        return;
    }

    // ----------------------------------------------------
    // 初期変数設定
    // ----------------------------------------------------
    let isDrawing = false;
    let currentTool = 'eraser'; // 'eraser', 'restore', 'lasso', 'sampler', 'rect', 'circle'
    let brushSize = parseInt(brushSizeInput.value);
    let targetColor = [255, 255, 255];
    let colorTolerance = colorEraserToleranceInput ? parseInt(colorEraserToleranceInput.value) : 30;
    let tempSampleColor = [255, 255, 255];
    let samplerActive = false;
    const MAX_HISTORY = 20;
    let history = [];
    let historyIndex = -1;
    let lastX = null;
    let lastY = null;
    let originalImageData = null;
    let segmentationThreshold = autoRemoveThresholdInput ? parseFloat(autoRemoveThresholdInput.value) : 0.7;
    let bodyPixNet = null; 

    // 投げ縄・図形ツール用の座標保存
    let lassoPoints = [];
    let shapeStartPoint = null;
    let shapeEndPoint = null;

    // 定数
    const TOUCH_OFFSET_Y_DISPLAY = -80;
    const DRAW_OFFSET_X = 0; 
    const DRAW_OFFSET_Y = 0; 

    // ----------------------------------------------------
    // ユーティリティ関数
    // ----------------------------------------------------
    const updateUndoRedoButtons = () => {
        if (undoBtn) undoBtn.disabled = historyIndex <= 0;
        if (redoBtn) redoBtn.disabled = historyIndex >= history.length - 1;
    };
    
    const applyState = (imageData) => {
        ctx.putImageData(imageData, 0, 0);
        updateUndoRedoButtons();
    };
    
    const saveState = () => {
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }
        const currentImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (history.length >= MAX_HISTORY) {
            history.shift();
        }
        history.push(currentImageData);
        historyIndex = history.length - 1;
        updateUndoRedoButtons();
    };
    
    const undo = () => {
        if (historyIndex > 0) {
            historyIndex--;
            applyState(history[historyIndex]);
        }
    };
    
    const redo = () => {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            applyState(history[historyIndex]);
        }
    };
    
    const closeMenu = () => {
        if (sideMenuPanel && menuToggleBtn && !sideMenuPanel.classList.contains('hidden')) {
            sideMenuPanel.classList.add('hidden');
            menuToggleBtn.textContent = 'メニュー ☰';
        }
    };
    
    const setActiveTool = (tool) => {
        currentTool = tool;
        document.querySelectorAll('#side-menu-panel button').forEach(btn => btn.classList.remove('active'));
        
        hideBrushIndicator(); 
        if (colorSamplerIndicator) colorSamplerIndicator.classList.add('hidden');

        if (tool === 'eraser' && toolEraserBtn) toolEraserBtn.classList.add('active');
        else if (tool === 'restore' && toolRestoreBtn) toolRestoreBtn.classList.add('active');
        else if (tool === 'lasso' && toolLassoBtn) toolLassoBtn.classList.add('active');
        else if (tool === 'rect' && toolRectBtn) toolRectBtn.classList.add('active');
        else if (tool === 'circle' && toolCircleBtn) toolCircleBtn.classList.add('active');
        else if (tool === 'sampler' && toolSamplerBtn) toolSamplerBtn.classList.add('active');
    };

    // ----------------------------------------------------
    // 画像の読み込みと自動調整
    // ----------------------------------------------------
    imageLoader.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const MAX_SIZE = 2000; 
                let targetWidth = img.width;
                let targetHeight = img.height;

                if (targetWidth > MAX_SIZE || targetHeight > MAX_SIZE) {
                    if (targetWidth > targetHeight) {
                        targetHeight = (MAX_SIZE / targetWidth) * targetHeight;
                        targetWidth = MAX_SIZE;
                    } else {
                        targetWidth = (MAX_SIZE / targetHeight) * targetWidth;
                        targetHeight = MAX_SIZE;
                    }
                }

                canvas.width = targetWidth;
                canvas.height = targetHeight;
                
                const container = canvas.parentElement;
                const scale = Math.min(container.clientWidth / targetWidth, container.clientHeight / targetHeight, 1.0);
                canvas.style.width = `${targetWidth * scale}px`;
                canvas.style.height = `${targetHeight * scale}px`;

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                const tempImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                originalImageData = new ImageData(
                    new Uint8ClampedArray(tempImageData.data),
                    tempImageData.width,
                    tempImageData.height
                );
                
                if (downloadBtn) downloadBtn.disabled = false;
                history = [];
                historyIndex = -1;
                saveState();
                setActiveTool('eraser');
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    // ツール切り替えイベント群
    if(toolEraserBtn) toolEraserBtn.addEventListener('click', () => { deactivateSamplerMode(); setActiveTool('eraser'); closeMenu(); });
    if(toolRestoreBtn) toolRestoreBtn.addEventListener('click', () => { if (originalImageData) { deactivateSamplerMode(); setActiveTool('restore'); closeMenu(); } else { alert("先に画像を読み込んでください。"); } });
    if(toolLassoBtn) toolLassoBtn.addEventListener('click', () => { if (originalImageData) { deactivateSamplerMode(); setActiveTool('lasso'); closeMenu(); } else { alert("先に画像を読み込んでください。"); } });
    if(toolRectBtn) toolRectBtn.addEventListener('click', () => { if (originalImageData) { deactivateSamplerMode(); setActiveTool('rect'); closeMenu(); } else { alert("先に画像を読み込んでください。"); } });
    if(toolCircleBtn) toolCircleBtn.addEventListener('click', () => { if (originalImageData) { deactivateSamplerMode(); setActiveTool('circle'); closeMenu(); } else { alert("先に画像を読み込んでください。"); } });

    if(toolInvertBtn) toolInvertBtn.addEventListener('click', () => {
        if (originalImageData) {
            deactivateSamplerMode();
            toolInvertBtn.classList.add('active');
            applyColorInversion();
            setActiveTool('eraser'); 
            closeMenu();
            setTimeout(() => { toolInvertBtn.classList.remove('active'); }, 100);
        } else {
            alert("先に画像を読み込んでください。");
        }
    });
    
    // ----------------------------------------------------
    // 描画座標と表示座標の取得・変換 
    // ----------------------------------------------------
    const getMousePos = (event) => {
        const rect = canvas.getBoundingClientRect(); 
        
        const isTouchEvent = event.touches && event.touches.length > 0;
        const clientX = isTouchEvent ? event.touches[0].clientX : event.clientX;
        const clientY = isTouchEvent ? event.touches[0].clientY : event.clientY;
        
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        let drawYOffset = 0;
        if (isTouchEvent) {
            drawYOffset = TOUCH_OFFSET_Y_DISPLAY * scaleY;
        }

        const x = (clientX - rect.left) * scaleX + DRAW_OFFSET_X; 
        const y = (clientY - rect.top) * scaleY + DRAW_OFFSET_Y + drawYOffset;

        const rawDisplayX = clientX - rect.left;
        const rawDisplayY = clientY - rect.top;

        let brushDisplayY = rawDisplayY;
        if (isTouchEvent) {
            brushDisplayY += TOUCH_OFFSET_Y_DISPLAY; 
        }

        return {
            x: x, 
            y: y, 
            rawDisplayX: rawDisplayX, 
            rawDisplayY: rawDisplayY, 
            brushDisplayX: rawDisplayX, 
            brushDisplayY: brushDisplayY 
        };
    };

    const updateBrushIndicatorForDisplay = (pos) => {
        const size = brushSize;
        if(brushIndicator) {
            brushIndicator.style.width = `${size}px`;
            brushIndicator.style.height = `${size}px`;
            brushIndicator.style.left = `${pos.brushDisplayX}px`;
            brushIndicator.style.top = `${pos.brushDisplayY}px`;
            brushIndicator.style.opacity = 1;
        }
    };

    const hideBrushIndicator = () => {
        if(brushIndicator) brushIndicator.style.opacity = 0;
    };

    // ----------------------------------------------------
    // カスタムスポイトツールのロジック
    // ----------------------------------------------------
    const getColorAtPos = (x, y) => {
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
            return [255, 255, 255];
        }
        const imageData = ctx.getImageData(x, y, 1, 1);
        const data = imageData.data;
        return [data[0], data[1], data[2]];
    };

    const updateSamplerIndicator = (x, y, color) => {
        colorSamplerIndicator.style.left = `${x}px`;
        colorSamplerIndicator.style.top = `${y}px`;
        
        const hexColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        if (samplerOutputColor) {
            samplerOutputColor.style.backgroundColor = hexColor;
        }
    };

    const activateSamplerMode = () => {
        if (!originalImageData) {
            alert("先に画像を読み込んでください。");
            return;
        }
        setActiveTool('sampler');
        samplerActive = true;
        if (colorSamplerIndicator) colorSamplerIndicator.classList.remove('hidden'); 
        
        canvas.removeEventListener('mousedown', handleDrawStart);
        canvas.removeEventListener('mousemove', handleDrawMove);
        canvas.removeEventListener('mouseup', stopDrawing);
        canvas.removeEventListener('mouseleave', hideBrushIndicator);
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);

        canvas.addEventListener('mousedown', handleSamplerStart);
        window.addEventListener('mousemove', handleSamplerMove);
        window.addEventListener('mouseup', handleSamplerEnd);
        canvas.addEventListener('touchstart', handleSamplerStart, { passive: false });
        window.addEventListener('touchmove', handleSamplerMove, { passive: false });
        window.addEventListener('touchend', handleSamplerEnd);
    };

    const deactivateSamplerMode = () => {
        if (samplerActive) {
            samplerActive = false;
            if (colorSamplerIndicator) colorSamplerIndicator.classList.add('hidden');
            
            canvas.removeEventListener('mousedown', handleSamplerStart);
            window.removeEventListener('mousemove', handleSamplerMove);
            window.removeEventListener('mouseup', handleSamplerEnd);
            canvas.removeEventListener('touchstart', handleSamplerStart);
            canvas.removeEventListener('touchmove', handleSamplerMove);
            window.removeEventListener('touchend', handleSamplerEnd);

            canvas.addEventListener('mousedown', handleDrawStart);
            canvas.addEventListener('mousemove', handleDrawMove);
            canvas.addEventListener('mouseup', stopDrawing);
            canvas.addEventListener('mouseleave', hideBrushIndicator);
            canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
            canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        }
    };
    
    const handleSamplerStart = (e) => {
        e.preventDefault();
        const pos = getMousePos(e);
        const color = getColorAtPos(Math.round(pos.x), Math.round(pos.y));
        tempSampleColor = color;
        updateSamplerIndicator(pos.brushDisplayX, pos.brushDisplayY, color);
    };

    const handleSamplerMove = (e) => {
        if (!samplerActive) return;
        e.preventDefault();
        const pos = getMousePos(e);
        const color = getColorAtPos(Math.round(pos.x), Math.round(pos.y));
        tempSampleColor = color;
        updateSamplerIndicator(pos.brushDisplayX, pos.brushDisplayY, color);
    };

    const handleSamplerEnd = () => {
        if (!samplerActive) return;
        targetColor = tempSampleColor;
        const toHex = (c) => c.toString(16).padStart(2, '0');
        const hex = `#${toHex(targetColor[0])}${toHex(targetColor[1])}${toHex(targetColor[2])}`;
        if (colorPicker) colorPicker.value = hex;
        deactivateSamplerMode();
        setActiveTool('eraser');
        closeMenu();
    };

    if (toolSamplerBtn) {
        toolSamplerBtn.addEventListener('click', () => {
            activateSamplerMode();
            closeMenu();
        });
    }

    if(colorEraserToleranceInput) colorEraserToleranceInput.addEventListener('input', (e) => {
        colorTolerance = parseInt(e.target.value);
        if (toleranceValueSpan) toleranceValueSpan.textContent = e.target.value;
    });
    
    if(toolColorEraserBtn) toolColorEraserBtn.addEventListener('click', () => {
        if (originalImageData) {
            deactivateSamplerMode();
            toolColorEraserBtn.classList.add('active');
            applyColorEraser();
            setActiveTool('eraser');
            closeMenu();
            setTimeout(() => { toolColorEraserBtn.classList.remove('active'); }, 100);
        } else {
            alert("先に画像を読み込んでください。");
        }
    });

    if(brushSizeInput) brushSizeInput.addEventListener('input', (e) => {
        brushSize = parseInt(e.target.value);
        if (brushIndicator && brushIndicator.style.opacity > 0) {
            const currentDisplayX = parseFloat(brushIndicator.style.left);
            const currentDisplayY = parseFloat(brushIndicator.style.top);
            updateBrushIndicatorForDisplay({
                brushDisplayX: currentDisplayX,
                brushDisplayY: currentDisplayY
            });
        }
    });

    // ----------------------------------------------------
    // コアロジック関数 (描画処理/透過/修復/投げ縄/色反転)
    // ----------------------------------------------------
    const applyEraser = (x, y) => {
        const halfSize = brushSize / 2;
        const startX = Math.max(0, Math.floor(x - halfSize));
        const startY = Math.max(0, Math.floor(y - halfSize));
        const width = Math.min(canvas.width - startX, Math.ceil(brushSize));
        const height = Math.min(canvas.height - startY, Math.ceil(brushSize));

        if (width <= 0 || height <= 0) return;

        const imageData = ctx.getImageData(startX, startY, width, height);
        const data = imageData.data;
        
        for (let j = 0; j < height; j++) {
            for (let i = 0; i < width; i++) {
                const globalX = startX + i;
                const globalY = startY + j;
                const dx = globalX - x;
                const dy = globalY - y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance <= halfSize) {
                    const alphaIndex = (j * width + i) * 4 + 3;
                    data[alphaIndex] = 0; 
                }
            }
        }
        ctx.putImageData(imageData, startX, startY);
    };

    // 四角形・円形マスクの確定処理（指定範囲外を透過）
    const applyShapeCrop = () => {
        if (!shapeStartPoint || !shapeEndPoint) return;

        ctx.putImageData(history[historyIndex], 0, 0);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        const x = shapeStartPoint.x;
        const y = shapeStartPoint.y;
        const w = shapeEndPoint.x - x;
        const h = shapeEndPoint.y - y;

        tempCtx.fillStyle = 'black';
        tempCtx.beginPath();

        if (currentTool === 'rect') {
            tempCtx.rect(x, y, w, h);
        } else if (currentTool === 'circle') {
            // 【変更】始点を左上、終点を右下とした四角形に内接する円を計算
            const centerX = x + w / 2;
            const centerY = y + h / 2;
            const radiusX = Math.abs(w / 2);
            const radiusY = Math.abs(h / 2);
            // 正円にするため、幅と高さの大きい方を基準に半径を決定（好みに応じてMath.minでも可）
            const radius = Math.max(radiusX, radiusY); 
            
            tempCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        }
        tempCtx.fill();

        const mainImgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const maskImgData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = mainImgData.data;
        const maskPixels = maskImgData.data;

        for (let i = 0; i < pixels.length; i += 4) {
            if (maskPixels[i + 3] === 0) {
                pixels[i + 3] = 0; // マスク外の領域を透明化
            }
        }
        ctx.putImageData(mainImgData, 0, 0);
    };

    // 図形ドラッグ中のプレビュー描画
    const drawShapePreview = () => {
        if (!shapeStartPoint || !shapeEndPoint) return;
        ctx.putImageData(history[historyIndex], 0, 0);

        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();

        const x = shapeStartPoint.x;
        const y = shapeStartPoint.y;
        const w = shapeEndPoint.x - x;
        const h = shapeEndPoint.y - y;

        if (currentTool === 'rect') {
            ctx.strokeRect(x, y, w, h);
        } else if (currentTool === 'circle') {
            // 【変更】プレビュー側も同様に内接する円として描画
            const centerX = x + w / 2;
            const centerY = y + h / 2;
            const radiusX = Math.abs(w / 2);
            const radiusY = Math.abs(h / 2);
            const radius = Math.max(radiusX, radiusY);

            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    };
        
    const applyColorEraser = () => {
        if (!originalImageData) return;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const [tr, tg, tb] = targetColor;
        const toleranceSq = colorTolerance * colorTolerance * 3;

        for (let i = 0; i < width * height; i++) {
            const index = i * 4;
            const r = data[index + 0];
            const g = data[index + 1];
            const b = data[index + 2];
            const diffR = r - tr;
            const diffG = g - tg;
            const diffB = b - tb;
            const distanceSq = diffR * diffR + diffG * diffG + diffB * diffB;

            if (distanceSq <= toleranceSq) {
                data[index + 3] = 0;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        saveState();
    };

    const applyRestore = (x, y) => {
        if (!originalImageData) return;
        const halfSize = brushSize / 2;
        const startX = Math.max(0, Math.floor(x - halfSize));
        const startY = Math.max(0, Math.floor(y - halfSize));
        const width = Math.min(canvas.width - startX, Math.ceil(brushSize));
        const height = Math.min(canvas.height - startY, Math.ceil(brushSize));

        if (width <= 0 || height <= 0) return;

        const currentImageData = ctx.getImageData(startX, startY, width, height);
        const currentData = currentImageData.data;
        const originalData = originalImageData.data;

        for (let j = 0; j < height; j++) {
            for (let i = 0; i < width; i++) {
                const globalX = startX + i;
                const globalY = startY + j;
                const dx = globalX - x;
                const dy = globalY - y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance <= halfSize) {
                    const localIndex = (j * width + i) * 4;
                    const globalIndex = (globalY * canvas.width + globalX) * 4;

                    currentData[localIndex + 0] = originalData[globalIndex + 0];
                    currentData[localIndex + 1] = originalData[globalIndex + 1];
                    currentData[localIndex + 2] = originalData[globalIndex + 2];
                    currentData[localIndex + 3] = originalData[globalIndex + 3];
                }
            }
        }
        ctx.putImageData(currentImageData, startX, startY);
    };

    const applyLassoCrop = () => {
        if (lassoPoints.length < 3) return;

        ctx.putImageData(history[historyIndex], 0, 0);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        tempCtx.fillStyle = 'black';
        tempCtx.beginPath();
        tempCtx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
        for (let i = 1; i < lassoPoints.length; i++) {
            tempCtx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
        }
        tempCtx.closePath();
        tempCtx.fill();

        const mainImgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const maskImgData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
        
        const pixels = mainImgData.data;
        const maskPixels = maskImgData.data;

        for (let i = 0; i < pixels.length; i += 4) {
            if (maskPixels[i + 3] === 0) {
                pixels[i + 3] = 0;
            }
        }
        ctx.putImageData(mainImgData, 0, 0);
    };

    const drawLassoPreview = () => {
        if (lassoPoints.length < 2) return;
        ctx.putImageData(history[historyIndex], 0, 0);

        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]); 
        ctx.beginPath();
        ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
        for (let i = 1; i < lassoPoints.length; i++) {
            ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]); 
    };

    const applyColorInversion = () => {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 0) {
                data[i]     = 255 - data[i];     // Red
                data[i + 1] = 255 - data[i + 1]; // Green
                data[i + 2] = 255 - data[i + 2]; // Blue
            }
        }
        ctx.putImageData(imageData, 0, 0);
        saveState();
    };

    const continuousDraw = (x, y) => {
        if (lastX !== null && lastY !== null) {
            const dist = Math.sqrt((x - lastX) ** 2 + (y - lastY) ** 2);
            if (dist > brushSize / 4) {
                const steps = Math.ceil(dist / (brushSize / 4));
                for (let i = 0; i < steps; i++) {
                    const px = lastX + (x - lastX) * i / steps;
                    const py = lastY + (y - lastY) * i / steps;
                    
                    if (currentTool === 'eraser') {
                        applyEraser(px, py);
                    } else if (currentTool === 'restore') {
                        applyRestore(px, py);
                    }
                }
            }
        }

        if (currentTool === 'eraser') {
            applyEraser(x, y);
        } else if (currentTool === 'restore') {
            applyRestore(x, y);
        }
        
        lastX = x;
        lastY = y;
    };
    
    // ----------------------------------------------------
    // AI/機械学習ロジック
    // ----------------------------------------------------
    const loadBodyPix = async () => {
        try {
            bodyPixNet = await bodyPix.load({
                architecture: 'MobileNetV1', 
                outputStride: 16, 
                multiplier: 0.75, 
                quantBytes: 2 
            });
            console.log("BodyPix model loaded successfully.");
        } catch (error) {
            console.error("BodyPix model failed to load:", error);
            alert("AIモデルの読み込みに失敗しました。ネットワーク接続を確認してください。");
        }
    };
    
    const applyAutoBackgroundRemoval = async () => {
        if (!originalImageData) {
            alert("先に画像を読み込んでください。");
            return;
        }
        if (!bodyPixNet) {
            alert("AIモデルがまだ読み込み中です。しばらくお待ちください。");
            return;
        }

        saveState(); 

        try {
            const segmentation = await bodyPixNet.segmentPerson(canvas, {
                flipHorizontal: false, 
                internalResolution: 'high', 
                segmentationThreshold: segmentationThreshold 
            });

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const segmentationData = segmentation.data; 
            const pixelCount = segmentationData.length;

            for (let i = 0; i < pixelCount; i++) {
                if (segmentationData[i] === 0) { 
                    const alphaIndex = i * 4 + 3; 
                    data[alphaIndex] = 0; 
                }
            }

            ctx.putImageData(imageData, 0, 0);
            updateUndoRedoButtons();
            saveState();

        } catch (error) {
            console.error("Automatic background removal failed:", error);
            alert("自動背景削除中にエラーが発生しました。");
        }
    };
    
    // ----------------------------------------------------
    // 描画イベント制御
    // ----------------------------------------------------
    const stopDrawing = () => {
        if (isDrawing) {
            isDrawing = false;
            
            if (currentTool === 'lasso') {
                applyLassoCrop();
                lassoPoints = [];
            } else if (currentTool === 'rect' || currentTool === 'circle') {
                applyShapeCrop();
                shapeStartPoint = null;
                shapeEndPoint = null;
            }

            lastX = null;
            lastY = null;
            saveState(); 
        }
        hideBrushIndicator(); 
    };
    
    const drawTools = ['eraser', 'restore', 'lasso', 'rect', 'circle'];
    
    const handleDrawStart = (e) => {
        if (downloadBtn && !downloadBtn.disabled) {
            if (drawTools.includes(currentTool)) {
                isDrawing = true;
                const pos = getMousePos(e);
                
                if (currentTool === 'lasso') {
                    lassoPoints = [{ x: pos.x, y: pos.y }];
                } else if (currentTool === 'rect' || currentTool === 'circle') {
                    shapeStartPoint = { x: pos.x, y: pos.y };
                    shapeEndPoint = { x: pos.x, y: pos.y };
                } else {
                    continuousDraw(pos.x, pos.y);
                    updateBrushIndicatorForDisplay(pos);
                }
            }
        }
    };
    
    const handleDrawMove = (e) => {
        if (drawTools.includes(currentTool) || currentTool === 'sampler') {
            const pos = getMousePos(e);
            
            if (currentTool === 'eraser' || currentTool === 'restore') {
                updateBrushIndicatorForDisplay(pos);
            }
            
            if (isDrawing) {
                if (pos.x >= 0 && pos.x <= canvas.width && pos.y >= 0 && pos.y <= canvas.height) {
                    if (currentTool === 'lasso') {
                        lassoPoints.push({ x: pos.x, y: pos.y });
                        drawLassoPreview();
                    } else if (currentTool === 'rect' || currentTool === 'circle') {
                        shapeEndPoint = { x: pos.x, y: pos.y };
                        drawShapePreview();
                    } else {
                        continuousDraw(pos.x, pos.y);
                    }
                } else {
                    lastX = pos.x;
                    lastY = pos.y;
                }
            }
        }
    };
    
    const handleTouchStart = (e) => { e.preventDefault(); handleDrawStart(e); };
    const handleTouchMove = (e) => { e.preventDefault(); handleDrawMove(e); };

    if(autoRemoveThresholdInput) autoRemoveThresholdInput.addEventListener('input', (e) => {
        segmentationThreshold = parseFloat(e.target.value);
        if (thresholdValueSpan) thresholdValueSpan.textContent = e.target.value;
    });

    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
            location.reload(); 
        });
    }
    
    if (toolAutoRemoveBtn) {
        toolAutoRemoveBtn.addEventListener('click', () => {
            deactivateSamplerMode();
            applyAutoBackgroundRemoval();
            setActiveTool('eraser');
            closeMenu();
        });
    }

    // キャンバスイベント設定
    canvas.addEventListener('mousedown', handleDrawStart);
    canvas.addEventListener('mousemove', handleDrawMove);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', hideBrushIndicator);

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', stopDrawing); 
    window.addEventListener('touchcancel', stopDrawing); 

    if (undoBtn) undoBtn.addEventListener('click', undo);
    if (redoBtn) redoBtn.addEventListener('click', redo);

    // ショートカットキー設定
    window.addEventListener('keydown', (e) => {
        const isControl = e.ctrlKey || e.metaKey;
        if (isControl) {
            switch (e.key.toLowerCase()) {
                case 'z':
                    e.preventDefault();
                    if (e.shiftKey) redo(); else undo();
                    break;
                case 'y':
                    e.preventDefault();
                    redo();
                    break;
            }
        }
    });

    if(downloadBtn) downloadBtn.addEventListener('click', () => {
        if (downloadBtn.disabled) return;
        const dataURL = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataURL;
        a.download = 'transparent_image.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    if (menuToggleBtn && sideMenuPanel) {
        menuToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sideMenuPanel.classList.toggle('hidden');
            if (sideMenuPanel.classList.contains('hidden')) {
                menuToggleBtn.textContent = 'メニュー ☰';
            } else {
                menuToggleBtn.textContent = '閉じる ×';
            }
        });
        window.addEventListener('click', (e) => {
            const isClickInsideMenu = sideMenuPanel.contains(e.target);
            const isClickOnToggle = menuToggleBtn.contains(e.target);
            if (!isClickInsideMenu && !isClickOnToggle) {
                closeMenu();
            }
        });
    }
    
    loadBodyPix();
});
