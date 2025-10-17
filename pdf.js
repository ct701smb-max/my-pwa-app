const { PDFDocument, degrees } = window.PDFLib;
const { jsPDF } = window.jspdf;
// piexifjs がグローバル変数 piexif として利用できることを前提とします (今回はEXIF自動回転防止のため使用しません)
const piexif = window.piexif;

// DOM要素を取得
const imageUpload = document.getElementById('imageUpload');
const convertBtn = document.getElementById('convertBtn');
const previewArea = document.getElementById('previewArea');
const pdfFilenameInput = document.getElementById('pdfFilename');
const sortFilenameAscBtn = document.getElementById('sortFilenameAscBtn');
const sortFilenameDescBtn = document.getElementById('sortFilenameDescBtn');
// このコントロールエリアを、画像ごとのページ向き設定に使用します
const imageOrientationControls = document.getElementById('imageOrientationControls');

// ★修正: ファイル読み込み用バナー関連のDOM要素 (上部)
const progressContainerFile = document.getElementById('progressContainerFile');
const progressBarFile = document.getElementById('progressBarFile');
const progressTextFile = document.getElementById('progressTextFile');

// ★修正: PDF変換用バナー関連のDOM要素 (下部)
const progressContainerPdf = document.getElementById('progressContainerPdf');
const progressBarPdf = document.getElementById('progressBarPdf');
const progressTextPdf = document.getElementById('progressTextPdf');

// 画像とPDFドキュメントを保持する配列 (一意なIDで管理)
let uploadedDocuments = [];

// ドラッグ＆ドロップ関連の変数 (ロジック本体は変わっていません)
let dragStartIndex = -1;
let initialTouchY = null;
let initialTouchX = null;
let currentDraggingElement = null;
const TOUCH_DRAG_THRESHOLD = 10;
let dragOffsetX = 0;
let dragOffsetY = 0;
let isDragging = false;
let rafId = null;
let currentTouchX = 0;
let currentTouchY = 0;
const AUTOSCROLL_THRESHOLD = 50;
const AUTOSCROLL_SPEED = 10;
const AUTOSCROLL_INTERVAL = 30;
let autoscrollTimer = null;

// 日本語フォント設定
const FONT_PATH = 'assets/fonts/NotoSansJP-Regular.ttf';
let fontBytes = null;

/**
 * フォントを読み込み、PDF作成に備える
 */
async function loadFont() {
    try {
        const response = await fetch(FONT_PATH);
        if (!response.ok) {
            throw new Error(`フォントファイルが見つかりません: ${FONT_PATH}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        fontBytes = new Uint8Array(arrayBuffer);
        console.log("フォントの読み込みに成功しました。");
    } catch (error) {
        console.error("フォントの読み込み中にエラーが発生しました。日本語テキストは正しく表示されない可能性があります。", error);
    }
}

// ページロード時にフォントを事前に読み込む
loadFont();


// ------------------------------------
// --- 個別ページ設定のUI制御とロジック (変更なし) ---
// ------------------------------------

/**
 * プレビュー要素がクリックされたときに個別のページ向き設定を表示し、
 * 初期チェック状態をグローバル設定に合わせるように修正
 * @param {object} docObj - ドキュメントオブジェクト
 */
function displayImageOrientationControls(docObj) {
    if (docObj.type !== 'image') {
        imageOrientationControls.innerHTML = '<p style="font-size: 0.9rem; color: #888; margin: 5px 0;">PDFファイルは個別の向き設定ができません。</p>';
        return;
    }
    
    // グローバル設定をチェック
    const globalOrientationElement = document.querySelector('input[name="globalPdfOrientation"]:checked');
    const globalOrientation = globalOrientationElement ? globalOrientationElement.value : 'p'; // グローバル設定がない場合は 'p'

    // 画像のピクセルサイズから、画像本来の向きを再判定 (表示用)
    const isImageLandscape = docObj.image.width > docObj.image.height;
    
    // 現在の個別設定（ユーザーがクリックして変更した場合の値、または初期値）
    const currentPageOrientation = docObj.pageOrientation;
    
    // 個別設定のラジオボタンの初期チェック状態を決定
    // 1. ユーザーが既に個別設定を変更していれば、その値 (currentPageOrientation) を使う
    // 2. 変更していなければ、グローバル設定 (globalOrientation) の値を初期チェック状態とする
    const initialCheckOrientation = docObj.pageOrientationWasChanged ? currentPageOrientation : globalOrientation;
    
    // 最終的に適用されるべき向き (表示上の警告メッセージに使用 - 個別設定が優先)
    const effectiveOrientation = docObj.pageOrientationWasChanged ? currentPageOrientation : globalOrientation;
    
    // 画像の向きとページの向きが異なる場合は、ユーザーに注意を促すメッセージを表示
    let warningMessage = '';
    
    if (effectiveOrientation === 'p' && isImageLandscape) {
        warningMessage = '<span style="color: #e74c3c; font-weight: bold;">画像が横長のため、縦長ページでは左右に大きな余白ができます。</span>';
    } else if (effectiveOrientation === 'l' && !isImageLandscape) {
        warningMessage = '<span style="color: #e74c3c; font-weight: bold;">画像が縦長のため、横長ページでは上下に大きな余白ができます。</span>';
    } else {
        warningMessage = '<span style="color: #2ecc71; font-weight: bold;">画像とページの向きは合致しています。</span>';
    }

    let globalNote = '';
    if (docObj.pageOrientationWasChanged) {
        globalNote = `<small style="display: block; font-size: 0.8rem; color: #e67e22; margin-bottom: 5px;">✅ **このページは個別に設定されています**。全体設定よりもこちらの設定が優先されます。</small>`;
    } else {
        globalNote = `<small style="display: block; font-size: 0.8rem; color: #3498db; margin-bottom: 5px;">※ 現在、全体設定（${globalOrientation === 'p' ? '縦' : '横'}）に合わせています。変更する場合のみクリックしてください。</small>`;
    }


    imageOrientationControls.innerHTML = `
        <h3 style="font-size: 1rem; margin-bottom: 8px; text-align:center;">ファイル: ${docObj.fileName}</h3>
        <p style="font-size: 0.85rem; color: var(--text-medium); margin: 0 0 10px 0; text-align:center;">
            元画像は**${isImageLandscape ? '横長' : '縦長'}**のピクセルサイズです。
        </p>
        ${globalNote}
        <div style="text-align: center; margin-bottom: 10px;">
            <p style="font-size: 0.9rem; font-weight: bold; margin-bottom: 5px;">PDFページの向きを選択</p>
            <input type="radio" id="page_p_${docObj.id}" name="pageOrientation_${docObj.id}" value="p" ${initialCheckOrientation === 'p' ? 'checked' : ''}>
            <label for="page_p_${docObj.id}">縦向きページ (A4 縦)</label>
            <br>
            <input type="radio" id="page_l_${docObj.id}" name="pageOrientation_${docObj.id}" value="l" ${initialCheckOrientation === 'l' ? 'checked' : ''}>
            <label for="page_l_${docObj.id}">横向きページ (A4 横)</label>
        </div>
        <small style="display: block; font-size: 0.8rem; margin-top: 5px; text-align:center; padding: 5px; border-top: 1px solid #eee;">
            ※ **画像自体を90度回転させる処理は行いません**。ページの用紙サイズのみを変更します。<br>
            ${warningMessage}
        </small>
    `;

    // ラジオボタンの変更イベントを設定
    imageOrientationControls.querySelectorAll(`input[name="pageOrientation_${docObj.id}"]`).forEach(radio => {
        radio.addEventListener('change', (e) => {
            const newOrientation = e.target.value;
            // 個別の設定を更新し、変更フラグを立てる
            const doc = uploadedDocuments.find(doc => doc.id === docObj.id);
            doc.pageOrientation = newOrientation;
            doc.pageOrientationWasChanged = true; // 変更されたフラグ
            
            // 変更後、UIを更新して注意メッセージを反映
            displayImageOrientationControls(doc);
        });
    });
}


// プレビューエリアのクリックリスナー
previewArea.addEventListener('click', (e) => {
    const wrapper = e.target.closest('.preview-image-wrapper');
    if (wrapper) {
        const fileId = wrapper.dataset.fileId;
        const docObj = uploadedDocuments.find(doc => doc.id === fileId);
        if (docObj) {
            displayImageOrientationControls(docObj);
        }
    } else {
        toggleFullscreen(previewArea);
    }
});

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && currentDraggingElement && currentDraggingElement.classList.contains('dragging')) {
        handleTouchEnd(null);
    }
});


/**
 * requestAnimationFrameによって実行されるアニメーションループ (ドラッグ中の要素の位置更新)
 */
function updateDragPosition() {
    if (!currentDraggingElement || !isDragging) {
        rafId = null;
        return;
    }
    currentDraggingElement.style.left = `${currentTouchX - dragOffsetX}px`;
    currentDraggingElement.style.top = `${currentTouchY - dragOffsetY}px`;
    rafId = requestAnimationFrame(updateDragPosition);
}

/**
 * プレビュー要素を生成し、イベントリスナーを設定する関数
 */
function createPreviewElement(docObj, index) { 
    const wrapper = document.createElement('div');
    wrapper.classList.add('preview-image-wrapper');
    wrapper.classList.add(docObj.type === 'pdf' ? 'preview-pdf-wrapper' : 'preview-image-item');
    wrapper.setAttribute('draggable', true);
    wrapper.dataset.index = index;
    wrapper.dataset.fileId = docObj.id;
    wrapper.classList.add('no-select');
    
    const numberSpan = document.createElement('span');
    numberSpan.classList.add('sequence-number');
    numberSpan.textContent = index + 1;
    
    let content;
    if (docObj.type === 'image') {
        const imgElement = document.createElement('img');
        imgElement.src = docObj.dataUrl; // 修正済みのData URLを使用
        imgElement.classList.add('preview-image');
        content = imgElement;
    } else {
        const pdfIcon = document.createElement('div');
        pdfIcon.classList.add('pdf-icon');
        pdfIcon.innerHTML = 'PDF';
        content = pdfIcon;
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentIndex = Number(wrapper.dataset.index);
        removeDocument(currentIndex);
    });

    const fileNameSpan = document.createElement('span');
    fileNameSpan.classList.add('file-name-label');
    fileNameSpan.textContent = docObj.fileName;
    fileNameSpan.title = docObj.fileName;

    wrapper.appendChild(numberSpan);
    wrapper.appendChild(content); // 画像またはPDFアイコンを追加
    wrapper.appendChild(deleteBtn);
    wrapper.appendChild(fileNameSpan);

    wrapper.addEventListener('dragstart', handleDragStart);
    wrapper.addEventListener('dragover', handleDragOver);
    wrapper.addEventListener('drop', handleDrop);
    wrapper.addEventListener('dragend', handleDragEnd);
    wrapper.addEventListener('touchstart', handleTouchStart);
    wrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
    wrapper.addEventListener('touchend', handleTouchEnd);
    wrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    return wrapper;
}


// ファイルが選択されたときの処理
imageUpload.addEventListener('change', (event) => {
    const files = event.target.files;
    
    if (files.length > 0) {
        convertBtn.disabled = false;
        
        // ★ 1. ファイル処理開始時に【ファイル用バナー】を表示
        progressContainerFile.style.display = 'block';
        progressBarFile.style.width = '0%';
        progressTextFile.textContent = `ファイルを読み込み中... (0 / ${files.length} ファイル)`;
        
        // PDF変換用バナーは非表示にしておく
        progressContainerPdf.style.display = 'none';

        let processedCount = 0; // 処理済みファイルカウンター

        const filePromises = Array.from(files).map(file => {
            return new Promise(resolve => {
                const reader = new FileReader();
                
                // ファイル処理が完了するたびにプログレスを更新するラッパー
                const updateProgressAndResolve = (result) => {
                    processedCount++;
                    const progress = Math.round((processedCount / files.length) * 100);
                    // ★ ファイル用バナーを更新
                    progressBarFile.style.width = `${progress}%`;
                    progressTextFile.textContent = `ファイルを読み込み中... (${processedCount} / ${files.length} ファイル) ${progress}%`;
                    resolve(result);
                };

                if (file.type === 'application/pdf') {
                    reader.onload = (e) => {
                        updateProgressAndResolve({ // プログレスを更新して解決
                            type: 'pdf',
                            id: Date.now() + '-' + Math.random().toString(36).substring(2, 9),
                            arrayBuffer: e.target.result,
                            fileName: file.name,
                            pageOrientation: 'p',
                            pageOrientationWasChanged: false
                        });
                    };
                    reader.readAsArrayBuffer(file);

                } else if (file.type.startsWith('image/')) {
                    reader.onload = (e) => {
                        const dataUrl = e.target.result;
                        const img = new Image();
                        
                        // 画像ロード後、Canvasに描画することでEXIF情報を剥がし、強制回転を防ぐ
                        img.onload = async () => {
                            let finalDataUrl = dataUrl;
                            const mimeType = file.type;
                            let format = 'JPEG';
                            
                            const canvas = document.createElement('canvas');
                            canvas.width = img.naturalWidth;
                            canvas.height = img.naturalHeight;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);

                            if (mimeType.includes('png') || mimeType.includes('webp') || mimeType.includes('gif')) {
                                finalDataUrl = canvas.toDataURL('image/png');
                                format = 'PNG';
                            } else {
                                finalDataUrl = canvas.toDataURL('image/jpeg', 0.95);
                                format = 'JPEG';
                            }
                            
                            const defaultOrientation = canvas.width > canvas.height ? 'l' : 'p';

                            updateProgressAndResolve({ // プログレスを更新して解決
                                type: 'image',
                                id: Date.now() + '-' + Math.random().toString(36).substring(2, 9),
                                dataUrl: finalDataUrl,
                                image: { width: canvas.width, height: canvas.height },
                                fileName: file.name,
                                format: format,
                                pageOrientation: defaultOrientation,
                                pageOrientationWasChanged: false
                            });
                        };
                        img.onerror = () => {
                            // 画像ロード失敗時もプログレスを更新
                            console.error(`画像の読み込みに失敗しました: ${file.name}`);
                            updateProgressAndResolve(null);
                        }
                        img.src = dataUrl;
                    };
                    reader.readAsDataURL(file);

                } else {
                    updateProgressAndResolve(null); // サポートされていないファイルもプログレスを更新
                }
            });
        });

        // ★ 2. すべてのPromiseが完了した後に【ファイル用バナー】を非表示
        Promise.all(filePromises).then(newDocuments => {
            newDocuments.filter(doc => doc !== null).forEach((docObj) => {
                uploadedDocuments.push(docObj);
            });
            rebuildPreview();

            // 最終表示と非表示
            progressTextFile.textContent = '✅ ファイル読み込み完了！';
            setTimeout(() => {
                progressContainerFile.style.display = 'none';
                convertBtn.disabled = uploadedDocuments.length === 0;
            }, 1000); // 完了メッセージを1秒間表示
        }).catch(error => {
            console.error("ファイル処理中にエラーが発生しました:", error);
            progressTextFile.textContent = '❌ ファイル処理エラー';
            progressBarFile.style.width = '0%';
            setTimeout(() => {
                progressContainerFile.style.display = 'none';
            }, 3000);
        });

    } else if (uploadedDocuments.length === 0) {
        convertBtn.disabled = true;
    }
    
    event.target.value = null;
});


// ------------------------------------
// --- ドラッグ＆ドロップ（PC/タッチ共通）ロジック (変更なし) ---
// ------------------------------------
function handleDragStart(e) {
    dragStartIndex = Number(this.dataset.index);
    this.classList.add('dragging');
    e.dataTransfer.setData('text/plain', dragStartIndex);
}

function handleDragOver(e) {
    e.preventDefault();
    this.classList.add('drag-over');
}

function handleDragEnd(e) {
    document.querySelectorAll('.preview-image-wrapper').forEach(item => {
        item.classList.remove('dragging', 'drag-over');
    });
}

function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');

    const dropEndIndex = Number(this.dataset.index);

    if (dragStartIndex !== -1 && dragStartIndex !== dropEndIndex) {
        const draggedItem = previewArea.children[dragStartIndex];
        const targetItem = previewArea.children[dropEndIndex];
        
        if (dragStartIndex < dropEndIndex) {
            previewArea.insertBefore(draggedItem, targetItem.nextSibling);
        } else {
            previewArea.insertBefore(draggedItem, targetItem);
        }
        
        arrayMove(uploadedDocuments, dragStartIndex, dropEndIndex);

        updatePreviewIndices();
    }
}

function handleTouchStart(e) {
    if (e.touches.length !== 1) return;
    const wrapper = this;
    dragStartIndex = Number(wrapper.dataset.index);
    initialTouchX = e.touches[0].clientX;
    initialTouchY = e.touches[0].clientY;
    currentDraggingElement = wrapper;
    const rect = wrapper.getBoundingClientRect();
    dragOffsetX = initialTouchX - rect.left;
    dragOffsetY = initialTouchY - rect.top;
    
    currentDraggingElement.touchDragTimer = setTimeout(() => {
        currentDraggingElement.classList.add('dragging');
        document.body.style.overflow = 'hidden';
        
        const placeholder = document.createElement('div');
        placeholder.classList.add('placeholder');
        placeholder.style.width = wrapper.offsetWidth + 'px';
        placeholder.style.height = wrapper.offsetHeight + 'px';
        
        wrapper.parentNode.insertBefore(placeholder, wrapper);
        
        currentTouchX = initialTouchX;
        currentTouchY = initialTouchY;
        
        isDragging = true;
        if (!rafId) {
            rafId = requestAnimationFrame(updateDragPosition);
        }
    }, 100);
}

function handleTouchMove(e) {
    if (!currentDraggingElement || e.touches.length !== 1) return;
    currentTouchX = e.touches[0].clientX;
    currentTouchY = e.touches[0].clientY;
    const diffX = Math.abs(currentTouchX - initialTouchX);
    const diffY = Math.abs(currentTouchY - initialTouchY);

    if (currentDraggingElement.touchDragTimer) {
        if (diffX > TOUCH_DRAG_THRESHOLD || diffY > TOUCH_DRAG_THRESHOLD) {
            clearTimeout(currentDraggingElement.touchDragTimer);
            currentDraggingElement.touchDragTimer = null;
            return;
        }
    }

    if (currentDraggingElement.classList.contains('dragging')) {
        e.preventDefault();
        isDragging = true;
        if (!rafId) {
             rafId = requestAnimationFrame(updateDragPosition);
        }

        const clientY = currentTouchY;
        const previewRect = previewArea.getBoundingClientRect();
        let scrollDirection = 0;
        if (clientY < previewRect.top + AUTOSCROLL_THRESHOLD) {
            scrollDirection = -1;
        } else if (clientY > previewRect.bottom - AUTOSCROLL_THRESHOLD) {
            scrollDirection = 1;
        }
        if (scrollDirection !== 0) {
            startAutoscroll(scrollDirection);
        } else {
            stopAutoscroll();
        }

        const targetElement = document.elementFromPoint(currentTouchX, currentTouchY);
        if (targetElement) {
            let dropTargetWrapper = targetElement.closest('.preview-image-wrapper');
            if (dropTargetWrapper) {
                const placeholder = previewArea.querySelector('.placeholder');
                if (placeholder && dropTargetWrapper !== currentDraggingElement) {
                    const rect = dropTargetWrapper.getBoundingClientRect();
                    const targetCenterY = rect.top + rect.height / 2;
                    const children = Array.from(previewArea.children);
                    const placeholderIndex = children.indexOf(placeholder);
                    const targetIndexInDom = children.indexOf(dropTargetWrapper);
                    
                    if (placeholderIndex !== targetIndexInDom) {
                        if (currentTouchY > targetCenterY && placeholderIndex < targetIndexInDom) {
                            previewArea.insertBefore(placeholder, dropTargetWrapper.nextSibling);
                        } else if (currentTouchY < targetCenterY && placeholderIndex > targetIndexInDom) {
                            previewArea.insertBefore(placeholder, dropTargetWrapper);
                        }
                    }
                }
            }
        }
    }
}

function handleTouchEnd(e) {
    if (!currentDraggingElement) return;

    stopAutoscroll();
    document.body.style.overflow = '';

    if (rafId) {
        cancelAnimationFrame(rafId);
    }
    isDragging = false;
    rafId = null;

    if (currentDraggingElement.touchDragTimer) {
        clearTimeout(currentDraggingElement.touchDragTimer);
        currentDraggingElement.touchDragTimer = null;
        if (!currentDraggingElement.classList.contains('dragging')) {
            const fileId = currentDraggingElement.dataset.fileId;
            const docObj = uploadedDocuments.find(doc => doc.id === fileId);
            if (docObj) {
                // タップ/クリックでページ向き設定を表示
                displayImageOrientationControls(docObj);
            }
        }
    }

    if (currentDraggingElement.classList.contains('dragging')) {
        const placeholder = previewArea.querySelector('.placeholder');
        
        if (placeholder) {
            placeholder.parentNode.insertBefore(currentDraggingElement, placeholder);
            placeholder.remove();
            
            const newOrder = Array.from(previewArea.children)
                .filter(el => el.classList.contains('preview-image-wrapper'))
                .map(el => {
                    const fileId = el.dataset.fileId;
                    return uploadedDocuments.find(doc => doc.id === fileId);
                });
                
            uploadedDocuments = newOrder.filter(doc => doc);
            
            updatePreviewIndices();
        }
        
        currentDraggingElement.removeAttribute('style');
    }

    currentDraggingElement.classList.remove('dragging', 'drag-over');
    dragStartIndex = -1;
    initialTouchY = null;
    initialTouchX = null;
    currentDraggingElement = null;
    dragOffsetX = 0;
    dragOffsetY = 0;
}


// ------------------------------------
// --- ユーティリティ関数 (変更なし) ---
// ------------------------------------
function startAutoscroll(direction) {
    if (autoscrollTimer) return;
    autoscrollTimer = setInterval(() => {
        previewArea.scrollBy(0, direction * AUTOSCROLL_SPEED);
    }, AUTOSCROLL_INTERVAL);
}
function stopAutoscroll() {
    if (autoscrollTimer) {
        clearInterval(autoscrollTimer);
        autoscrollTimer = null;
    }
}

function toggleFullscreen(element) {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    }
    else {
        element.requestFullscreen().catch(err => {
            console.error(`全画面表示を有効にできませんでした: ${err.message} (${err.name})`);
            alert("ブラウザの設定により全画面表示がブロックされました。");
        });
    }
}

function rebuildPreview() {
    previewArea.innerHTML = '';
    
    uploadedDocuments.forEach((docObj, index) => {
        const previewElement = createPreviewElement(docObj, index);
        previewArea.appendChild(previewElement);
    });
    
    updatePreviewIndices();
    imageOrientationControls.innerHTML = '<p style="font-size: 0.9rem; color: #888; margin: 5px 0;">画像をクリックすると、このエリアに個別のページ向き設定が表示されます。</p>';
}

function updatePreviewIndices() {
    const wrappers = previewArea.querySelectorAll('.preview-image-wrapper');
    wrappers.forEach((wrapper, index) => {
        wrapper.dataset.index = index;
        wrapper.querySelector('.sequence-number').textContent = index + 1;
    });
}

function arrayMove(arr, fromIndex, toIndex) {
    const element = arr[fromIndex];
    arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, element);
}

function removeDocument(index) {
    if (index >= 0 && index < uploadedDocuments.length) {
        uploadedDocuments.splice(index, 1);
        rebuildPreview();
        if (uploadedDocuments.length === 0) {
            convertBtn.disabled = true;
        }
        imageOrientationControls.innerHTML = '<p style="font-size: 0.9rem; color: #888; margin: 5px 0;">画像をクリックすると、このエリアに個別のページ向き設定が表示されます。</p>';
    }
}

// ソート関数 (ファイル名 昇順)
sortFilenameAscBtn.addEventListener('click', () => {
    if (uploadedDocuments.length === 0) return;
    uploadedDocuments.sort((a, b) => {
        if (a.fileName && b.fileName) {
            return a.fileName.localeCompare(b.fileName, 'ja', { numeric: true });
        }
        return 0;
    });
    rebuildPreview();
});

// ソート関数 (ファイル名 降順)
sortFilenameDescBtn.addEventListener('click', () => {
    if (uploadedDocuments.length === 0) return;
    uploadedDocuments.sort((a, b) => {
        if (a.fileName && b.fileName) {
            return b.fileName.localeCompare(a.fileName, 'ja', { numeric: true });
        }
        return 0;
    });
    rebuildPreview();
});


// ------------------------------------
// --- PDF生成のコアロジック (PDF-libベース) ---
// ------------------------------------

/**
 * 最終的なPDFを生成するメイン処理
 */
async function createPDF() {
    if (uploadedDocuments.length === 0) return;

    convertBtn.disabled = true;
    convertBtn.textContent = '結合処理を開始...';
    
    // ★ ファイル用バナーを非表示にし、PDF変換用バナーを表示・初期化する
    progressContainerFile.style.display = 'none';
    progressContainerPdf.style.display = 'block';
    progressBarPdf.style.width = '0%';
    progressTextPdf.textContent = `準備中... (0 / ${uploadedDocuments.length} ページ)`;
    

    // グローバルなPDF向き設定を読み取る
    const globalOrientationElement = document.querySelector('input[name="globalPdfOrientation"]:checked');
    const globalPdfOrientation = globalOrientationElement ? globalOrientationElement.value : 'p'; // デフォルトは縦

    // imageFit の値 ('fill' (余白なし) または 'fit' (見切れなし)) を受け取る
    const imageFit = document.querySelector('input[name="imageFit"]:checked').value;
    
    let outputFilename = pdfFilenameInput.value.trim() || 'combined_document';
    if (!outputFilename.endsWith('.pdf')) {
        outputFilename += '.pdf';
    }

    try {
        const finalPdfDoc = await PDFDocument.create();
        
        let pdfLibFont = null;
        if (fontBytes) {
            finalPdfDoc.registerFontkit(window.fontkit); // fontkitを登録
            pdfLibFont = await finalPdfDoc.embedFont(fontBytes);
        }

        // A4サイズの定義 (point単位)
        const A4_WIDTH = 595.28;
        const A4_HEIGHT = 841.89;
        
        // ★進行状況のカウンター
        let completedCount = 0;
        const totalDocuments = uploadedDocuments.length;
        
        for (const docObj of uploadedDocuments) {
            if (docObj.type === 'image') {
                
                // **** 修正後の優先順位ロジック (個別優先) ****
                // 1. 個別設定の変更フラグが立っている場合、個別設定 (docObj.pageOrientation) を最優先
                // 2. 変更フラグがない場合は、グローバル設定 (globalPdfOrientation) を使用
                const pageOrientation = docObj.pageOrientationWasChanged 
                                             ? docObj.pageOrientation 
                                             : globalPdfOrientation;
                
                // 指定されたページ向きに応じて、PDFのページサイズを決定
                const maxW = pageOrientation === 'p' ? A4_WIDTH : A4_HEIGHT; // 縦向きなら幅595、横向きなら幅841
                const maxH = pageOrientation === 'p' ? A4_HEIGHT : A4_WIDTH; // 縦向きなら高さ841、横向きなら高さ595

                const img = docObj.image;
                const effectiveWidth = img.width; // EXIF補正を無視した画像の幅
                const effectiveHeight = img.height; // EXIF補正を無視した画像の高さ

                // 2. ページレイアウト計算
                let w, h;
                
                if (imageFit === 'fill') {
                    // **[余白ゼロ/強制引き伸ばし]** アスペクト比を無視し、ページ全体にフィットさせる
                    w = maxW;
                    h = maxH;
                } else {
                    // 'fit' **[見切れなし/余白あり]** アスペクト比を維持し、画像全体がページに収まるようにする
                    const scaleRatio = Math.min(maxW / effectiveWidth, maxH / effectiveHeight);
                    w = effectiveWidth * scaleRatio;
                    h = effectiveHeight * scaleRatio;
                }
                
                // 画像を中央に配置するためのX, Y座標を計算
                const x = (maxW - w) / 2;
                const y = (maxH - h) / 2;
                
                // 3. PDF-libで新しいページを作成し、画像を埋め込む
                // maxW, maxH で定義されたサイズ (個別に指定された縦または横) のページが作成される
                const page = finalPdfDoc.addPage([maxW, maxH]);
                
                let embeddedImage;
                let imageType = docObj.format === 'PNG' ? 'PNG' : 'JPEG';

                // Data URLからBase64部分を取得
                const base64Data = docObj.dataUrl.split(',')[1];
                const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                
                if (imageType === 'PNG') {
                    embeddedImage = await finalPdfDoc.embedPng(imageBytes);
                } else {
                    embeddedImage = await finalPdfDoc.embedJpg(imageBytes);
                }

                // 4. 画像を描画 
                page.drawImage(embeddedImage, {
                    x: x,
                    y: y,
                    width: w,
                    height: h,
                });
                
            } else if (docObj.type === 'pdf') {
                // PDFファイルの結合 (pdf-libを使用)
                const existingPdfDoc = await PDFDocument.load(docObj.arrayBuffer);
                const copiedPages = await finalPdfDoc.copyPages(existingPdfDoc, existingPdfDoc.getPageIndices());
                
                // PDF結合の場合は、元のページの向きを維持
                copiedPages.forEach(page => finalPdfDoc.addPage(page));
            }
            
            // ★PDF変換用バナーの進行状況を更新
            completedCount++;
            const progress = Math.round((completedCount / totalDocuments) * 100);
            
            progressBarPdf.style.width = `${progress}%`;
            progressTextPdf.textContent = `ページ生成中... (${completedCount} / ${totalDocuments} ページ) ${progress}%`;
            
            // 進行状況の表示を更新するため、小さな遅延を設ける (ブラウザにレンダリングの機会を与える)
            await new Promise(resolve => setTimeout(resolve, 10)); 
        }
        
        if (finalPdfDoc.getPageCount() === 0) {
            throw new Error("PDFページが生成されませんでした。処理できるファイルがありません。");
        }
        
        // ★最終処理の進捗表示
        progressTextPdf.textContent = '最終処理中... (ファイル保存)';
        progressBarPdf.style.width = '100%';
        // 最終処理が非常に高速な場合があるため、視覚的なフィードバックとして少し待つ
        await new Promise(resolve => setTimeout(resolve, 500)); 

        const pdfBytes = await finalPdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = outputFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error("PDF生成中に致命的なエラーが発生しました:", error);
        alert(`PDF生成中にエラーが発生しました。\n詳細はコンソールをご確認ください。\nエラー: ${error.message}`);
    } finally {
        // ★ 完了時、またはエラー時にPDF変換用バナーを非表示に戻す
        convertBtn.textContent = 'PDFに変換してダウンロード';
        convertBtn.disabled = uploadedDocuments.length === 0;
        
        // 完了表示を数秒間見せた後、バナーを隠す
        progressTextPdf.textContent = '✅ 完了しました！ダウンロードを開始します。';
        setTimeout(() => {
            progressContainerPdf.style.display = 'none';
        }, 3000); 
    }
}

// 変換ボタンにイベントリスナーを設定
convertBtn.addEventListener('click', createPDF);