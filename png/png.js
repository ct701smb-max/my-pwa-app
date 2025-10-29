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

    if (!canvas || !imageLoader || !brushSizeInput || !ctx || !colorSamplerIndicator) {
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
    let edgeMap = null;
    let edgeMapWidth = 0;
    let edgeMapHeight = 0;

    // 定数
    const TOUCH_OFFSET_Y_DISPLAY = -80; // タッチ操作時にブラシインジケーターを指より上にずらす量
    const EDGE_THRESHOLD = 0.4;
    const EDGE_BUFFER_DISTANCE = 3;
    
    // 描画位置のズレを解消するため、オフセットを0に設定
    const DRAW_OFFSET_X = 0; 
    const DRAW_OFFSET_Y = 0; 

    // ----------------------------------------------------
    // ユーティリティ関数
    // ----------------------------------------------------

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
        // Undo/Redoのパフォーマンスボトルネック（キャンバス全体をコピー）
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
        if (tool === 'eraser' && toolEraserBtn) {
            toolEraserBtn.classList.add('active');
        } else if (tool === 'restore' && toolRestoreBtn) {
            toolRestoreBtn.classList.add('active');
        }
        if (tool !== 'sampler') {
            colorSamplerIndicator.classList.add('hidden');
        }
        if (tool !== 'eraser' && tool !== 'restore') {
            hideBrushIndicator();
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
                // 1. 画像のオリジナルサイズをキャンバスの**描画解像度**に設定
                canvas.width = img.width;
                canvas.height = img.height;
                
                // 2. 画面に収まるようにキャンバスの**CSS表示サイズ**を調整
                const container = canvas.parentElement; 
                const maxWidth = container.clientWidth;
                const maxHeight = container.clientHeight;

                const imgWidth = img.width;
                const imgHeight = img.height;
                
                const widthRatio = maxWidth / imgWidth;
                const heightRatio = maxHeight / imgHeight;
                
                const scale = Math.min(widthRatio, heightRatio, 1.0); 

                canvas.style.width = `${imgWidth * scale}px`;
                canvas.style.height = `${imgHeight * scale}px`;
                canvas.style.maxWidth = `100%`;
                canvas.style.maxHeight = `100%`;

                // 3. 描画
                ctx.drawImage(img, 0, 0);
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

        // 1. **描画座標 (x, y)**: 実際に消去/修復を行うキャンバス内の座標
        let drawYOffset = 0;
        // 💡 修正ポイント: タッチ操作の場合のみ、描画座標にもインジケーターのオフセットを適用
        if (isTouchEvent) {
            // DOM座標系のオフセットをキャンバス描画座標系（ピクセル）に変換して適用
            drawYOffset = TOUCH_OFFSET_Y_DISPLAY * scaleY;
        }

        const x = (clientX - rect.left) * scaleX + DRAW_OFFSET_X; 
        const y = (clientY - rect.top) * scaleY + DRAW_OFFSET_Y + drawYOffset; // オフセットを加算

        // 2. **DOM上の正確な位置**: 
        const rawDisplayX = clientX - rect.left;
        const rawDisplayY = clientY - rect.top;

        // 3. **ブラシの表示位置**: マウス/タッチで表示位置を切り替える 
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

    // 💡 インジケーターのDOM表示位置を更新する関数
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
        colorSamplerIndicator.classList.remove('hidden');
        
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
            colorSamplerIndicator.classList.add('hidden');
            
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
    const handleSamplerStart = (e) => {
        e.preventDefault();
        const pos = getMousePos(e);
        const color = getColorAtPos(Math.round(pos.x), Math.round(pos.y));
        tempSampleColor = color;
        // rawDisplayX/Y を使用して、指の真下に表示
        updateSamplerIndicator(pos.rawDisplayX, pos.rawDisplayY, color);
    };

    const handleSamplerMove = (e) => {
        if (!samplerActive) return;
        e.preventDefault();
        const pos = getMousePos(e);
        const color = getColorAtPos(Math.round(pos.x), Math.round(pos.y));
        tempSampleColor = color;
        // rawDisplayX/Y を使用して、指の真下に表示
        updateSamplerIndicator(pos.rawDisplayX, pos.rawDisplayY, color);
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
        const startX = Math.max(0, Math.floor(x - halfSize - EDGE_BUFFER_DISTANCE));
        const startY = Math.max(0, Math.floor(y - halfSize - EDGE_BUFFER_DISTANCE));
        const width = Math.min(canvas.width - startX, Math.ceil(brushSize + 2 * EDGE_BUFFER_DISTANCE));
        const height = Math.min(canvas.height - startY, Math.ceil(brushSize + 2 * EDGE_BUFFER_DISTANCE));

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
                    let isNearEdge = false;
                    if (edgeMap) {
                        for (let dy_b = -EDGE_BUFFER_DISTANCE; dy_b <= EDGE_BUFFER_DISTANCE; dy_b++) {
                            for (let dx_b = -EDGE_BUFFER_DISTANCE; dx_b <= EDGE_BUFFER_DISTANCE; dx_b++) {
                                const checkX = globalX + dx_b;
                                const checkY = globalY + dy_b;

                                if (checkX >= 0 && checkX < edgeMapWidth && checkY >= 0 && checkY < edgeMapHeight) {
                                    const neighborIndex = checkY * edgeMapWidth + checkX;
                                    if (edgeMap[neighborIndex] / 255.0 > EDGE_THRESHOLD) {
                                        isNearEdge = true;
                                        break;
                                    }
                                }
                            }
                            if (isNearEdge) break;
                        }
                    }

                    if (!isNearEdge) {
                        data[alphaIndex] = 0;
                    }
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
    // 描画イベント制御
    // ----------------------------------------------------
    const stopDrawing = () => {
        isDrawing = false;
        lastX = null;
        lastY = null;
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
        if (drawTools.includes(currentTool)) {
            const pos = getMousePos(e);
            
            // インジケーター表示には操作に応じた pos.brushDisplayX/Y を使用
            updateBrushIndicatorForDisplay(pos);
            
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
    // 初期イベントリスナーのセットアップ
    // ----------------------------------------------------
    
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
            location.reload(); 
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
    window.addEventListener('touchend', () => { stopDrawing(); hideBrushIndicator(); });
    window.addEventListener('touchcancel', () => { stopDrawing(); hideBrushIndicator(); });


    // Undo/Redoボタンのイベントリスナー登録
    if (undoBtn) {
        undoBtn.addEventListener('click', undo);
    }
    if (redoBtn) {
        redoBtn.addEventListener('click', redo);
    }
    
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
});