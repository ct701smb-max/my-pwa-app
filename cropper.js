const imageInput = document.getElementById('imageInput');
const imageDisplay = document.getElementById('imageDisplay');
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
const cropButton = document.getElementById('cropButton');
const saveAllButton = document.getElementById('saveAllButton');
const currentImageIndexSpan = document.getElementById('currentImageIndex');
const totalImagesSpan = document.getElementById('totalImages');

const presetFullButton = document.getElementById('presetFull');
const presetRightHalfButton = document.getElementById('presetRightHalf');
const presetLeftHalfButton = document.getElementById('presetLeftHalf');
const duplicateButton = document.getElementById('duplicateButton');
const sortByNameButton = document.getElementById('sortByNameButton');
const fileList = document.getElementById('fileList');

let imageFiles = [];    // 選択された全ファイル
let croppedImages = []; // トリミング後のデータURLを格納
let currentIndex = 0;
let cropper = null;

// ===========================================
// ユーティリティ関数
// ===========================================

/**
 * Cropper.jsにトリミング範囲のデータ（x, y, width, height）を設定する
 */
function setCropData(data) {
    if (cropper) {
        cropper.setData(data);
    }
}

/**
 * Base64データURLをBlob（バイナリデータ）に変換するヘルパー関数
 */
function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1]; 
    const bstr = atob(arr[1]); 
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new Blob([u8arr], {type: mime});
}

/**
 * ファイルリストUIをレンダリングする
 */
function renderFileList() {
    fileList.innerHTML = ''; 
    
    imageFiles.forEach((file, index) => {
        const li = document.createElement('li');
        li.className = 'file-item';
        li.draggable = true;
        li.dataset.index = index;
        
        // 現在表示中の画像を目立たせる
        if (index === currentIndex) {
            li.style.backgroundColor = '#e6f7ff';
            li.style.fontWeight = 'bold';
        }

        const nameSpan = document.createElement('span');
        const isCropped = croppedImages[index] !== null;
        nameSpan.textContent = `${isCropped ? '✅ ' : '⏳ '} ${file.name}`;
        nameSpan.title = file.name;
        
        // 削除ボタン
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '✖';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeFile(index);
        };
        
        li.appendChild(nameSpan);
        li.appendChild(removeBtn);
        
        li.addEventListener('click', () => {
            currentIndex = index;
            loadAndInitCropper(currentIndex);
        });
        
        fileList.appendChild(li);
    });

    addDragAndDropListeners();
}

/**
 * ファイルをリストから削除する
 */
function removeFile(indexToRemove) {
    if (imageFiles.length === 0) return;

    imageFiles.splice(indexToRemove, 1);
    croppedImages.splice(indexToRemove, 1);
    
    if (imageFiles.length > 0) {
        if (currentIndex >= imageFiles.length) {
            currentIndex = imageFiles.length - 1;
        }
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

/**
 * UI（ボタンやインデックス、リスト）の状態を更新する関数
 */
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
    presetRightHalfButton.disabled = controlDisabled;
    presetLeftHalfButton.disabled = controlDisabled;
    duplicateButton.disabled = controlDisabled;
    sortByNameButton.disabled = controlDisabled;

    renderFileList();
}

/**
 * 画像を読み込み、Cropper.jsを初期化する
 */
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
        });
        
        currentImage.addEventListener('ready', () => {
            const imageData = cropper.getImageData();
            
            // 初期状態を画像全体にする
            cropper.setData({
                x: 0,
                y: 0,
                width: imageData.naturalWidth,
                height: imageData.naturalHeight
            });
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
    // 1. imageFiles の並び替え
    const fileToMove = imageFiles.splice(fromIndex, 1)[0];
    imageFiles.splice(toIndex, 0, fileToMove);

    // 2. croppedImages の並び替え
    const croppedToMove = croppedImages.splice(fromIndex, 1)[0];
    croppedImages.splice(toIndex, 0, croppedToMove);

    // 3. 現在表示中のインデックスを追跡・修正
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
    
    // ファイル選択インプットをリセットして、同じファイルを再選択できるようにする
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
        const croppedCanvas = cropper.getCroppedCanvas();
        const dataURL = croppedCanvas.toDataURL('image/jpeg', 0.9); 
        
        // トリミング時の Cropper.js の設定を保存したい場合は、ここに保存ロジックを追加可能
        croppedImages[currentIndex] = { 
            dataURL: dataURL,
            originalFileName: imageFiles[currentIndex].name,
            originalType: imageFiles[currentIndex].type
        };

        if (currentIndex < imageFiles.length - 1) {
            currentIndex++;
            loadAndInitCropper(currentIndex);
        } else {
             updateUI();
             alert("全画像のトリミングが完了しました！一括ダウンロードボタンを押してください。");
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

    // ファイル名に (copy N) をつけて一意性を高める
    const newFileName = `${baseName} (copy ${imageFiles.length + 1})${extension}`;
    // Fileオブジェクトは不変なので、新しい名前で新しいFileオブジェクトを作成する
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

    // ファイル名を基準にインデックスをソート (大文字・小文字を区別しない)
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


// --- 7. 全ファイルをZIPで一括ダウンロード (🎯 重複ファイル名に連番を付与) ---
saveAllButton.addEventListener('click', () => {
    if (!croppedImages.every(img => img !== null)) {
        alert("まだトリミングが完了していない画像があります。");
        return;
    }

    const zip = new JSZip();
    const folder = zip.folder("cropped_images");

    saveAllButton.textContent = "ZIPファイル作成中...";
    saveAllButton.disabled = true;

    // 最終的なファイル名を記録し、重複をチェックするSet
    const finalFileNames = new Set(); 

    croppedImages.forEach((imgData) => {
        if (imgData) {
            const originalFileName = imgData.originalFileName;
            const newExtension = imgData.dataURL.includes('image/png') ? '.png' : '.jpeg';

            // 1. 拡張子より前のファイル名部分を取得
            const lastDotIndex = originalFileName.lastIndexOf('.');
            const nameWithoutExt = lastDotIndex !== -1 
                                 ? originalFileName.substring(0, lastDotIndex) 
                                 : originalFileName;

            let baseName = nameWithoutExt;
            let finalFileName = baseName + newExtension;
            let counter = 1;

            // 2. 重複チェックと連番付与のロジック
            while (finalFileNames.has(finalFileName)) {
                // ファイル名がすでに存在する場合、(N) をつけて再チェック
                baseName = `${nameWithoutExt}(${counter})`;
                finalFileName = baseName + newExtension;
                counter++;
            }
            
            // 3. 確定したファイル名を記録し、ZIPファイルに追加
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

// 初期UI更新
updateUI();