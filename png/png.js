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
    let currentTool = 'eraser';
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
    // 境界検出機能を削除するため、edgeMap関連の変数は残しますが、使われません。
    let edgeMap = null;
    let edgeMapWidth = 0;
    let edgeMapHeight = 0;
    let segmentationThreshold = autoRemoveThresholdInput ? parseFloat(autoRemoveThresholdInput.value) : 0.7;
    let bodyPixNet = null; 

    // 定数
    const TOUCH_OFFSET_Y_DISPLAY = -80;
    // 境界判別機能削除のため、以下の定数は使わなくなりますが、残しておきます。
    const EDGE_THRESHOLD = 0.4;
    const EDGE_BUFFER_DISTANCE = 3; 
    const DRAW_OFFSET_X = 0; 
    const DRAW_OFFSET_Y = 0; 

    // ----------------------------------------------------
    // ユーティリティ関数
    // ----------------------------------------------------

    // 境界判別機能を削除するため、createEdgeMap関数は呼び出されますが、イレイサーには使われません。
    const createEdgeMap = (imageData) => {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const edgeData = new Array(width * height).fill(0);
        const KERNEL = [0, 1, 0, 1, -4, 1, 0, 1, 0];
        const OFFSET = 1;

        for (let y = OFFSET; y < height - OFFSET; y++) {
            for (let x = OFFSET; x < width - OFFSET; x++) {
                let sumR = 0;
                let sumG = 0;
                let sumB = 0;
                let kernelIndex = 0;
                for (let ky = -OFFSET; ky <= OFFSET; ky++) {
                    for (let kx = -OFFSET; kx <= OFFSET; kx++) {
                        const pixelIndex = ((y + ky) * width + (x + kx)) * 4;
                        const kernelValue = KERNEL[kernelIndex++];
                        sumR += data[pixelIndex] * kernelValue;
                        sumG += data[pixelIndex + 1] * kernelValue;
                        sumB += data[pixelIndex + 2] * kernelValue;
                    }
                }
                const edgeStrength = (Math.abs(sumR) + Math.abs(sumG) + Math.abs(sumB)) / 3;
                const normalizedStrength = Math.min(255, edgeStrength * 0.5);
                edgeData[y * width + x] = normalizedStrength;
            }
        }
        
        edgeMapWidth = width;
        edgeMapHeight = height;
        return edgeData;
    };
    
    const updateUndoRedoButtons = () => {
        if (undoBtn) {
            undoBtn.disabled = historyIndex <= 0;
        }
        if (redoBtn) {
            redoBtn.disabled = historyIndex >= history.length - 1;
        }
    };
    
    const applyState = (imageData) => {
        ctx.putImageData(imageData, 0, 0);
        edgeMap = createEdgeMap(imageData);
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

        if (tool === 'eraser' && toolEraserBtn) {
            toolEraserBtn.classList.add('active');
        } else if (tool === 'restore' && toolRestoreBtn) {
            toolRestoreBtn.classList.add('active');
        } else if (tool === 'sampler' && toolSamplerBtn) {
            toolSamplerBtn.classList.add('active');
        }
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
    // スマホの巨大画像対策: 最大長を1600px程度に制限（任意）
    // あまりに大きいとAIがクラッシュするため
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

    // 1. キャンバス解像度の設定
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    
    // 2. 表示サイズの設定（親要素に合わせる）
    const container = canvas.parentElement;
    const scale = Math.min(container.clientWidth / targetWidth, container.clientHeight / targetHeight, 1.0);
    canvas.style.width = `${targetWidth * scale}px`;
    canvas.style.height = `${targetHeight * scale}px`;

    // 3. 描画
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // 以降の処理（ImageData取得など）
    const tempImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    originalImageData = new ImageData(
        new Uint8ClampedArray(tempImageData.data),
        tempImageData.width,
        tempImageData.height
    );
    edgeMap = createEdgeMap(tempImageData);
    if (downloadBtn) downloadBtn.disabled = false;
    history = [];
    historyIndex = -1;
    saveState();
};
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    if(toolEraserBtn) toolEraserBtn.addEventListener('click', () => {
        deactivateSamplerMode();
        setActiveTool('eraser');
        closeMenu();
    });
    
    if(toolRestoreBtn) toolRestoreBtn.addEventListener('click', () => {
        if (originalImageData) {
            deactivateSamplerMode();
            setActiveTool('restore');
            closeMenu();
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

        // 1. 描画座標 (x, y)
        let drawYOffset = 0;
        if (isTouchEvent) {
            drawYOffset = TOUCH_OFFSET_Y_DISPLAY * scaleY;
        }

        const x = (clientX - rect.left) * scaleX + DRAW_OFFSET_X; 
        const y = (clientY - rect.top) * scaleY + DRAW_OFFSET_Y + drawYOffset; // オフセットを加算

        // 2. DOM上の正確な位置
        const rawDisplayX = clientX - rect.left;
        const rawDisplayY = clientY - rect.top;

        // 3. ブラシの表示位置
        let brushDisplayY = rawDisplayY;
        
        if (isTouchEvent) {
            brushDisplayY += TOUCH_OFFSET_Y_DISPLAY; // インジケーターはDOM座標系でずらす
        }

        return {
            x: x, // キャンバス描画座標 (描画に使われる座標)
            y: y, // キャンバス描画座標 (描画に使われる座標)
            rawDisplayX: rawDisplayX, 
            rawDisplayY: rawDisplayY, 
            brushDisplayX: rawDisplayX, // DOM表示座標 (横軸)
            brushDisplayY: brushDisplayY // DOM表示座標 (縦軸、操作に応じてオフセット適用)
        };
    };

    // インジケーターのDOM表示位置を更新する関数
    const updateBrushIndicatorForDisplay = (pos) => {
        const size = brushSize;
        if(brushIndicator) {
            brushIndicator.style.width = `${size}px`;
            brushIndicator.style.height = `${size}px`;
            
            brushIndicator.style.left = `${pos.brushDisplayX}px`;
            brushIndicator.style.top = `${pos.brushDisplayY}px`;
            brushIndicator.style.opacity = 1;
        }
    }

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
        // x, y はDOM座標（オフセットなし）。指の真下に正確に表示。
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
        
        // 描画イベントリスナーを削除
        canvas.removeEventListener('mousedown', handleDrawStart);
        canvas.removeEventListener('mousemove', handleDrawMove);
        canvas.removeEventListener('mouseup', stopDrawing);
        canvas.removeEventListener('mouseleave', hideBrushIndicator);
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', stopDrawing);
        window.removeEventListener('touchcancel', stopDrawing);


        // スポイト専用イベントリスナーを設定
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
            
            // スポイト用イベントリスナーを削除
            canvas.removeEventListener('mousedown', handleSamplerStart);
            window.removeEventListener('mousemove', handleSamplerMove);
            window.removeEventListener('mouseup', handleSamplerEnd);
            canvas.removeEventListener('touchstart', handleSamplerStart);
            canvas.removeEventListener('touchmove', handleSamplerMove);
            window.removeEventListener('touchend', handleSamplerEnd);

            // 通常の描画イベントリスナーを再設定
            canvas.addEventListener('mousedown', handleDrawStart);
            canvas.addEventListener('mousemove', handleDrawMove);
            canvas.addEventListener('mouseup', stopDrawing);
            canvas.addEventListener('mouseleave', hideBrushIndicator);
            
            canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
            canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        }
    };
    
    // スポイト処理: インジケーター位置に rawDisplayX/Y を使用
    // スポイト処理: インジケーター位置に pos.x / pos.y を使用するように修正
const handleSamplerStart = (e) => {
    e.preventDefault();
    const pos = getMousePos(e);
    // 描画座標（オフセット適用済み）の色を取得
    const color = getColorAtPos(Math.round(pos.x), Math.round(pos.y));
    tempSampleColor = color;
    
    // インジケーターの表示位置も、指の真下(rawDisplay)ではなく、
    // 実際に抽出している座標(brushDisplay)に合わせる
    updateSamplerIndicator(pos.brushDisplayX, pos.brushDisplayY, color);
};

const handleSamplerMove = (e) => {
    if (!samplerActive) return;
    e.preventDefault();
    const pos = getMousePos(e);
    // 描画座標（オフセット適用済み）の色を取得
    const color = getColorAtPos(Math.round(pos.x), Math.round(pos.y));
    tempSampleColor = color;
    
    // インジケーターの表示位置を更新
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

    // ----------------------------------------------------
    // その他イベントリスナー
    // ----------------------------------------------------
    
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
            setTimeout(() => {
                toolColorEraserBtn.classList.remove('active');
            }, 100);
        } else {
            alert("先に画像を読み込んでください。");
        }
    });

    if(brushSizeInput) brushSizeInput.addEventListener('input', (e) => {
        brushSize = parseInt(e.target.value);
        if (brushIndicator && brushIndicator.style.opacity > 0) {
            // 現在のDOM表示位置を取得（オフセット適用済み）
            const currentDisplayX = parseFloat(brushIndicator.style.left);
            const currentDisplayY = parseFloat(brushIndicator.style.top);
            
            // 新しいブラシサイズでインジケーターを更新（位置は変えない）
            updateBrushIndicatorForDisplay({
                brushDisplayX: currentDisplayX,
                brushDisplayY: currentDisplayY
            });
        }
    });

    // ----------------------------------------------------
    // コアロジック関数 (描画処理/透過/修復)
    // ----------------------------------------------------
    
    const applyEraser = (x, y) => {
        const halfSize = brushSize / 2;
        // 🌟 境界判別機能を削除したため、探索範囲をシンプルにブラシサイズで設定
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
                    
                    // 🌟 無条件に透明度を0に設定
                    data[alphaIndex] = 0; 
                    
                }
            }
        }

        ctx.putImageData(imageData, startX, startY);
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
        edgeMap = createEdgeMap(imageData);
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

    // BodyPixモデルのロード
    const loadBodyPix = async () => {
        try {
            // モデルの設定（速度と精度のバランスを取る）
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
    
    // 自動背景削除の実行関数
    const applyAutoBackgroundRemoval = async () => {
        if (!originalImageData) {
            alert("先に画像を読み込んでください。");
            return;
        }
        if (!bodyPixNet) {
            alert("AIモデルがまだ読み込み中です。しばらくお待ちください。");
            return;
        }

        // 描画開始前に履歴を保存
        saveState(); 

        try {
            // BodyPixで人物のセグメンテーションを実行
            const segmentation = await bodyPixNet.segmentPerson(canvas, {
                flipHorizontal: false, 
                internalResolution: 'high', 
                segmentationThreshold: segmentationThreshold // ユーザー設定値を使用
            });

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const segmentationData = segmentation.data; // マスクデータ (1=人物, 0=背景)
            const pixelCount = segmentationData.length;

            // マスクデータを使って背景を一括透明化
            for (let i = 0; i < pixelCount; i++) {
                // segmentationDataが0（背景）の場合
                if (segmentationData[i] === 0) { 
                    // ImageDataのインデックスを計算 (R, G, B, A の A)
                    const alphaIndex = i * 4 + 3; 
                    data[alphaIndex] = 0; // アルファ値を0に設定（透明化）
                }
            }

            // 変更をキャンバスに反映
            ctx.putImageData(imageData, 0, 0);
            edgeMap = createEdgeMap(imageData); // エッジマップも更新
            
            updateUndoRedoButtons();
            

        } catch (error) {
            console.error("Automatic background removal failed:", error);
            alert("自動背景削除中にエラーが発生しました。");
        }
    };
    
    // ----------------------------------------------------
    // 描画イベント制御
    // ----------------------------------------------------
    const stopDrawing = () => {
        isDrawing = false;
        lastX = null;
        lastY = null;
        hideBrushIndicator(); 
    };
    
    const drawTools = ['eraser', 'restore'];
    
    const handleDrawStart = (e) => {
        if (downloadBtn && !downloadBtn.disabled) {
            if (drawTools.includes(currentTool)) {
                saveState(); // 描画開始時に履歴を保存
                isDrawing = true;
                const pos = getMousePos(e);
                // 描画にはオフセットあり/なしが調整された pos.x/y を使用
                continuousDraw(pos.x, pos.y);
                // インジケーター表示には操作に応じた pos.brushDisplayX/Y を使用
                updateBrushIndicatorForDisplay(pos);
            }
        }
    };
    
    const handleDrawMove = (e) => {
        if (drawTools.includes(currentTool) || currentTool === 'sampler') {
            const pos = getMousePos(e);
            
            // 描画ツールの場合はブラシインジケーターを表示
            if (drawTools.includes(currentTool)) {
                updateBrushIndicatorForDisplay(pos);
            }
            
            if (isDrawing) {
                // 描画にはオフセットあり/なしが調整された pos.x/y を使用
                if (pos.x >= 0 && pos.x <= canvas.width && pos.y >= 0 && pos.y <= canvas.height) {
                    continuousDraw(pos.x, pos.y);
                } else {
                    lastX = pos.x;
                    lastY = pos.y;
                }
            }
        }
    };
    
    const handleTouchStart = (e) => { e.preventDefault(); handleDrawStart(e); };
    const handleTouchMove = (e) => { e.preventDefault(); handleDrawMove(e); };

    // ----------------------------------------------------
    // 閾値スライダー イベントリスナー
    // ----------------------------------------------------
    if(autoRemoveThresholdInput) autoRemoveThresholdInput.addEventListener('input', (e) => {
        segmentationThreshold = parseFloat(e.target.value);
        if (thresholdValueSpan) thresholdValueSpan.textContent = e.target.value;
    });

    // ----------------------------------------------------
    // 初期イベントリスナーのセットアップ
    // ----------------------------------------------------
    
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
            location.reload(); 
        });
    }
    
    // 自動背景削除ボタンのイベントリスナー
    if (toolAutoRemoveBtn) {
        toolAutoRemoveBtn.addEventListener('click', () => {
            deactivateSamplerMode();
            applyAutoBackgroundRemoval();
            setActiveTool('eraser');
            closeMenu();
        });
    }


    // マウスイベント (キャンバス専用)
    canvas.addEventListener('mousedown', handleDrawStart);
    canvas.addEventListener('mousemove', handleDrawMove);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', hideBrushIndicator);

    // タッチイベント (キャンバス上での描画操作用)
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', stopDrawing); 
    window.addEventListener('touchcancel', stopDrawing); 


    // Undo/Redoボタンのイベントリスナー登録
    if (undoBtn) {
        undoBtn.addEventListener('click', undo);
    }
    if (redoBtn) {
        redoBtn.addEventListener('click', redo);
    }
    // ----------------------------------------------------
// キーボードショートカット (Ctrl+Z / Ctrl+Y)
// ----------------------------------------------------
window.addEventListener('keydown', (e) => {
    // Ctrlキー（またはMacのCommandキー）が押されているか確認
    const isControl = e.ctrlKey || e.metaKey;

    if (isControl) {
        switch (e.key.toLowerCase()) {
            case 'z':
                e.preventDefault(); // ブラウザ既定の挙動を防止
                if (e.shiftKey) {
                    // Ctrl + Shift + Z は Redo として動作させることが多い
                    redo();
                } else {
                    undo();
                }
                break;
            case 'y':
                e.preventDefault();
                redo();
                break;
        }
    }
});
    // ダウンロード
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

    // ハンバーガーメニューの開閉制御
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
    
    // 起動時にAIモデルのロードを開始
    loadBodyPix();
});
