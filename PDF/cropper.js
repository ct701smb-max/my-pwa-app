const imageInput = document.getElementById('imageInput');
const imageDisplay = document.getElementById('imageDisplay');
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
const cropButton = document.getElementById('cropButton');
const saveAllButton = document.getElementById('saveAllButton');
const currentImageIndexSpan = document.getElementById('currentImageIndex');
const totalImagesSpan = document.getElementById('totalImages');

const presetFullButton = document.getElementById('presetFull');
const presetCenterSquareButton = document.getElementById('presetCenterSquare');
const presetRightHalfButton = document.getElementById('presetRightHalf');
const presetLeftHalfButton = document.getElementById('presetLeftHalf');
const duplicateButton = document.getElementById('duplicateButton');
const sortByNameButton = document.getElementById('sortByNameButton');
const fileList = document.getElementById('fileList');
const saveCurrentImageButton = document.getElementById('saveCurrentImageButton');
const cropAlert = document.getElementById('cropAlert');

// 追加：2つのカスタム範囲記憶・適用ボタン
const saveMemory1Button = document.getElementById('saveMemory1Button');
const applyMemory1Button = document.getElementById('applyMemory1Button');
const saveMemory2Button = document.getElementById('saveMemory2Button');
const applyMemory2Button = document.getElementById('applyMemory2Button');

let imageFiles = [];
let croppedImages = [];
let currentIndex = 0;
let cropper = null;

// カスタム範囲および連続引き継ぎ用の変数
let memoryData1 = null;
let memoryData2 = null;
let lastUsedCropData = null;

// ===========================================
// ユーティリティ関数
// ===========================================
function showTemporaryAlert(message, duration = 1500) {
    if (!cropAlert) return;
    cropAlert.textContent = message;
    cropAlert.classList.add('show');
    setTimeout(() => cropAlert.classList.remove('show'), duration);
}

function setCropData(data) {
    if (cropper) cropper.setData(data);
}

function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
}

function renderFileList() {
    fileList.innerHTML = '';
    imageFiles.forEach((file, index) => {
        const li = document.createElement('li');
        li.className = 'file-item';
        li.draggable = true;
        li.dataset.index = index;

        if (index === currentIndex) {
            li.style.backgroundColor = '#e6f7ff';
            li.style.fontWeight = 'bold';
        }

        const nameSpan = document.createElement('span');
        const isCropped = croppedImages[index] !== null;
        nameSpan.textContent = `${isCropped ? '✅ ' : '⏳ '} ${file.name}`;
        nameSpan.title = file.name;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '✖';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeFile(index);
        };

        li.appendChild(nameSpan);
        li.appendChild(removeBtn);

        if (isCropped) {
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'download-single-btn';
            downloadBtn.textContent = 'ダウンロード';
            downloadBtn.title = 'トリミング画像をダウンロード';
            downloadBtn.onclick = (e) => {
                e.stopPropagation();
                downloadSingleImage(index);
            };
            li.appendChild(downloadBtn);
        }

        li.addEventListener('click', () => {
            currentIndex = index;
            loadAndInitCropper(currentIndex);
        });

        fileList.appendChild(li);
    });
    addDragAndDropListeners();
}

function removeFile(indexToRemove) {
    if (imageFiles.length === 0) return;

    imageFiles.splice(indexToRemove, 1);
    croppedImages.splice(indexToRemove, 1);

    if (imageFiles.length > 0) {
        if (currentIndex >= imageFiles.length) currentIndex = imageFiles.length - 1;
        loadAndInitCropper(currentIndex);
    } else {
        totalImagesSpan.textContent = 0;
        currentImageIndexSpan.textContent = 0;
        imageDisplay.innerHTML = '';
        if (cropper) cropper.destroy();
        cropper = null;
    }
    totalImagesSpan.textContent = imageFiles.length;
    updateUI();
}

function updateUI() {
    const total = imageFiles.length;
    currentImageIndexSpan.textContent = total > 0 ? currentIndex + 1 : 0;
    totalImagesSpan.textContent = total;

    prevButton.disabled = currentIndex === 0 || total === 0;
    nextButton.disabled = currentIndex === total - 1 || total === 0;
    cropButton.disabled = total === 0;

    const allCropped = croppedImages.every(img => img !== null) && total > 0;
    saveAllButton.disabled = !allCropped;

    const controlDisabled = total === 0;
    presetFullButton.disabled = controlDisabled;
    presetCenterSquareButton.disabled = controlDisabled;
    presetRightHalfButton.disabled = controlDisabled;
    presetLeftHalfButton.disabled = controlDisabled;
    duplicateButton.disabled = controlDisabled;
    sortByNameButton.disabled = controlDisabled;

    // カスタム記憶ボタンの有効/無効制御
    if (saveMemory1Button) saveMemory1Button.disabled = controlDisabled;
    if (saveMemory2Button) saveMemory2Button.disabled = controlDisabled;
    if (applyMemory1Button) applyMemory1Button.disabled = controlDisabled || !memoryData1;
    if (applyMemory2Button) applyMemory2Button.disabled = controlDisabled || !memoryData2;

    const isCurrentCropped = croppedImages[currentIndex] !== null;
    saveCurrentImageButton.disabled = !isCurrentCropped;

    renderFileList();
}

function loadAndInitCropper(index) {
    if (index < 0 || index >= imageFiles.length) return;

    const file = imageFiles[index];
    const reader = new FileReader();

    reader.onload = (event) => {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }

        imageDisplay.innerHTML = `<img id="currentImage" src="${event.target.result}">`;
        const currentImage = document.getElementById('currentImage');

        cropper = new Cropper(currentImage, {
            aspectRatio: NaN,
            viewMode: 1,
            rotatable: true,
            autoCropArea: 1,

            // ================================
            // ピンチアウト・拡大防止のオプション
            zoomable: false,
            scalable: false,
            toggleDragModeOnDblclick: false
            // ================================
        });

        currentImage.addEventListener('ready', () => {
            const imageData = cropper.getImageData();
            
            // 連続で同じ範囲を引き継ぐ、または直前の範囲があれば適用する
            if (lastUsedCropData) {
                cropper.setData(lastUsedCropData);
            } else {
                cropper.setData({
                    x: 0,
                    y: 0,
                    width: imageData.naturalWidth,
                    height: imageData.naturalHeight
                });
            }
        });

        updateUI();
    };
    reader.readAsDataURL(file);
}
// ===========================================
// ドラッグ＆ドロップ処理
// ===========================================

let draggedItem = null;

function addDragAndDropListeners() {
    const listItems = fileList.querySelectorAll('.file-item');
    listItems.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);
    });
}

function handleDragStart(e) {
    draggedItem = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.index);
    setTimeout(() => this.classList.add('dragging'), 0);
}

function handleDragOver(e) {
    e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
    e.preventDefault();

    if (draggedItem === null || this === draggedItem) return;

    const fromIndex = parseInt(draggedItem.dataset.index);
    const toIndex = parseInt(this.dataset.index);
    
    reorderFiles(fromIndex, toIndex);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedItem = null;
    updateUI();
}

/**
 * ファイルとトリミングデータを配列内で並び替える
 */
function reorderFiles(fromIndex, toIndex) {
    const fileToMove = imageFiles.splice(fromIndex, 1)[0];
    imageFiles.splice(toIndex, 0, fileToMove);

    const croppedToMove = croppedImages.splice(fromIndex, 1)[0];
    croppedImages.splice(toIndex, 0, croppedToMove);

    if (currentIndex === fromIndex) {
        currentIndex = toIndex;
    } else if (currentIndex > fromIndex && currentIndex <= toIndex) {
        currentIndex--;
    } else if (currentIndex < fromIndex && currentIndex >= toIndex) {
        currentIndex++;
    }
    
    updateUI();
}

// ===========================================
// イベントリスナー
// ===========================================

// --- 1. 複数の画像の一括挿入と再選択の許可 ---
imageInput.addEventListener('change', (e) => {
    const newFiles = Array.from(e.target.files);
    
    const startLength = imageFiles.length;
    imageFiles.push(...newFiles);
    
    for (let i = 0; i < newFiles.length; i++) {
        croppedImages.push(null);
    }
    
    e.target.value = ''; 

    if (imageFiles.length > 0 && startLength === 0) {
        currentIndex = 0;
        loadAndInitCropper(currentIndex);
    } else if (imageFiles.length > 0) {
        updateUI();
    } else {
        updateUI();
    }
});

// --- 2. トリミング完了ボタン ---
cropButton.addEventListener('click', () => {
    if (cropper) {
        // 現在のトリミング枠データを次の画像用に保持（連続引き継ぎ）
        lastUsedCropData = cropper.getData();

        const croppedCanvas = cropper.getCroppedCanvas();
        const dataURL = croppedCanvas.toDataURL('image/png', 0.9);
        
        croppedImages[currentIndex] = { 
            dataURL: dataURL,
            originalFileName: imageFiles[currentIndex].name,
            originalType: imageFiles[currentIndex].type
        };

        if (currentIndex < imageFiles.length - 1) {
            currentIndex++;
            loadAndInitCropper(currentIndex);
            showTemporaryAlert("✅ トリミング完了！ 次の画像へ");
        } else {
            updateUI();
            showTemporaryAlert("🎉 全画像のトリミング完了！", 3000);
        }
    }
});

// --- 3. スライド（前/次） ---
prevButton.addEventListener('click', () => {
    if (currentIndex > 0) {
        currentIndex--;
        loadAndInitCropper(currentIndex);
    }
});

nextButton.addEventListener('click', () => {
    if (currentIndex < imageFiles.length - 1) {
        currentIndex++;
        loadAndInitCropper(currentIndex);
    }
});

// --- 4. プリセットボタン ---
presetFullButton.addEventListener('click', () => {
    const imageData = cropper.getImageData();
    if (!imageData) return;
    setCropData({
        x: 0, y: 0,
        width: imageData.naturalWidth,
        height: imageData.naturalHeight
    });
});

presetCenterSquareButton.addEventListener('click', () => {
    const imageData = cropper.getImageData();
    if (!imageData) return;

    const width = imageData.naturalWidth;
    const height = imageData.naturalHeight;
    const squareSize = Math.min(width, height);
    const x = (width - squareSize) / 2;
    const y = (height - squareSize) / 2;

    setCropData({
        x: x,
        y: y,
        width: squareSize,
        height: squareSize
    });
});

presetRightHalfButton.addEventListener('click', () => {
    const imageData = cropper.getImageData();
    if (!imageData) return;
    const halfWidth = imageData.naturalWidth / 2;
    setCropData({
        x: halfWidth, y: 0,
        width: halfWidth,
        height: imageData.naturalHeight
    });
});

presetLeftHalfButton.addEventListener('click', () => {
    const imageData = cropper.getImageData();
    if (!imageData) return;
    const halfWidth = imageData.naturalWidth / 2;
    setCropData({
        x: 0, y: 0,
        width: halfWidth,
        height: imageData.naturalHeight
    });
});

// --- 4.5. カスタム範囲1・2の記憶と適用 ---
if (saveMemory1Button && applyMemory1Button) {
    saveMemory1Button.addEventListener('click', () => {
        if (!cropper) return;
        memoryData1 = cropper.getData();
        applyMemory1Button.disabled = false;
        showTemporaryAlert("📌 範囲1を記憶しました");
    });

    applyMemory1Button.addEventListener('click', () => {
        if (!cropper || !memoryData1) return;
        setCropData(memoryData1);
        lastUsedCropData = memoryData1; // 次の画像への連続引き継ぎ用にも保持
        showTemporaryAlert("📋 範囲1を適用しました");
    });
}

if (saveMemory2Button && applyMemory2Button) {
    saveMemory2Button.addEventListener('click', () => {
        if (!cropper) return;
        memoryData2 = cropper.getData();
        applyMemory2Button.disabled = false;
        showTemporaryAlert("📌 範囲2を記憶しました");
    });

    applyMemory2Button.addEventListener('click', () => {
        if (!cropper || !memoryData2) return;
        setCropData(memoryData2);
        lastUsedCropData = memoryData2; // 次の画像への連続引き継ぎ用にも保持
        showTemporaryAlert("📋 範囲2を適用しました");
    });
}

// --- 5. 現在の画像を複製してリストに追加 ---
duplicateButton.addEventListener('click', () => {
    if (imageFiles.length === 0) return;

    const currentFile = imageFiles[currentIndex];
    const originalName = currentFile.name;
    const lastDotIndex = originalName.lastIndexOf('.');
    
    let baseName, extension;
    if (lastDotIndex === -1) {
        baseName = originalName;
        extension = '';
    } else {
        baseName = originalName.substring(0, lastDotIndex);
        extension = originalName.substring(lastDotIndex);
    }

    const newFileName = `${baseName} (copy ${imageFiles.length + 1})${extension}`;
    const duplicatedFile = new File([currentFile], newFileName, { type: currentFile.type });

    imageFiles.push(duplicatedFile);
    croppedImages.push(null);
    
    totalImagesSpan.textContent = imageFiles.length;
    updateUI();

    alert(`「${duplicatedFile.name}」としてリストに追加されました。`);
});


// --- 6. ファイル名を基準にソート ---
sortByNameButton.addEventListener('click', () => {
    if (imageFiles.length === 0) return;

    const indices = imageFiles.map((_, index) => index);
    const currentFile = imageFiles[currentIndex]; 

    indices.sort((a, b) => {
        const nameA = imageFiles[a].name.toLowerCase();
        const nameB = imageFiles[b].name.toLowerCase();
        
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
    });

    const newImageFiles = [];
    const newCroppedImages = [];
    let newCurrentIndex = -1;

    indices.forEach(originalIndex => {
        const file = imageFiles[originalIndex];
        
        newImageFiles.push(file);
        newCroppedImages.push(croppedImages[originalIndex]);

        if (file === currentFile) {
            newCurrentIndex = newImageFiles.length - 1;
        }
    });

    imageFiles = newImageFiles;
    croppedImages = newCroppedImages;
    
    currentIndex = newCurrentIndex !== -1 ? newCurrentIndex : 0; 

    loadAndInitCropper(currentIndex);
    updateUI();
});


// --- 7. 全ファイルをZIPで一括ダウンロード ---
saveAllButton.addEventListener('click', () => {
    if (!croppedImages.every(img => img !== null)) {
        alert("まだトリミングが完了していない画像があります。");
        return;
    }

    const zip = new JSZip();
    const folder = zip.folder("cropped_images");

    saveAllButton.textContent = "ZIPファイル作成中...";
    saveAllButton.disabled = true;

    const finalFileNames = new Set(); 

    croppedImages.forEach((imgData) => {
        if (imgData) {
            const originalFileName = imgData.originalFileName;
            const newExtension = imgData.dataURL.includes('image/png') ? '.png' : '.jpeg';

            const lastDotIndex = originalFileName.lastIndexOf('.');
            const nameWithoutExt = lastDotIndex !== -1 
                                 ? originalFileName.substring(0, lastDotIndex) 
                                 : originalFileName;

            let baseName = nameWithoutExt;
            let finalFileName = baseName + newExtension;
            let counter = 1;

            while (finalFileNames.has(finalFileName)) {
                baseName = `${nameWithoutExt}(${counter})`;
                finalFileName = baseName + newExtension;
                counter++;
            }
            
            finalFileNames.add(finalFileName);
            const blob = dataURLtoBlob(imgData.dataURL);
            folder.file(finalFileName, blob);
        }
    });
    
    zip.generateAsync({type: "blob"})
       .then(function(content) {
           const url = URL.createObjectURL(content);
           const a = document.createElement('a');
           a.href = url;
           a.download = 'cropped_images.zip';
           document.body.appendChild(a);
           a.click();
           document.body.removeChild(a);
           URL.revokeObjectURL(url);
           
           saveAllButton.textContent = "全ファイルを一括ダウンロード";
           updateUI();
       })
       .catch(e => {
           console.error("ZIP作成エラー:", e);
           alert("ZIPファイルの作成中にエラーが発生しました。");
           saveAllButton.textContent = "全ファイルを一括ダウンロード";
           updateUI();
       });
});

saveCurrentImageButton.addEventListener('click', () => {
    downloadSingleImage(currentIndex);
});

/**
 * 指定されたインデックスのトリミング済み画像をダウンロードする
 */
function downloadSingleImage(index) {
    const imgData = croppedImages[index];

    if (!imgData) {
        alert("この画像はまだトリミングされていません。");
        return;
    }

    const blob = dataURLtoBlob(imgData.dataURL);
    const originalFileName = imgData.originalFileName;
    const newExtension = imgData.dataURL.includes('image/png') ? '.png' : '.jpeg';

    const lastDotIndex = originalFileName.lastIndexOf('.');
    const nameWithoutExt = lastDotIndex !== -1 ? originalFileName.substring(0, lastDotIndex) : originalFileName;
    const downloadFileName = nameWithoutExt + "_cropped" + newExtension;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    a.href = url;
    a.download = downloadFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ===========================================
// ブラウザのピンチ・ズーム防止
// ===========================================
['contextmenu','selectstart'].forEach(evt => imageDisplay.addEventListener(evt, e => e.preventDefault()));
['touchstart','touchmove','gesturestart','gesturechange','gestureend'].forEach(evt => {
    imageDisplay.addEventListener(evt, e => e.preventDefault(), { passive: false });
});

// 初期UI更新
updateUI();

['contextmenu', 'selectstart'].forEach(evt => {
    imageDisplay.addEventListener(evt, e => e.preventDefault());
});

imageDisplay.addEventListener(
    'touchstart',
    e => e.preventDefault(),
    { passive: false }
);
