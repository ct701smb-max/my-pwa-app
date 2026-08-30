const { PDFDocument, degrees } = window.PDFLib;
const { jsPDF } = window.jspdf;
// piexifjs がグローバル変数 piexif として利用できることを前提とします
const piexif = window.piexif;

// DOM要素を取得
const imageUpload = document.getElementById('imageUpload');
const folderUpload = document.getElementById('folderUpload');
const convertBtn = document.getElementById('convertBtn');
const previewArea = document.getElementById('previewArea');
const pdfFilenameInput = document.getElementById('pdfFilename');
const sortFilenameAscBtn = document.getElementById('sortFilenameAscBtn');
const sortFilenameDescBtn = document.getElementById('sortFilenameDescBtn');
// このコントロールエリアを、画像ごとのページ向き設定に使用します
const imageOrientationControls = document.getElementById('imageOrientationControls');

// ファイル移動モード関連のDOM要素
const moveControlsContainer = document.getElementById('moveControlsContainer');
const moveStatusText = document.getElementById('moveStatusText');
const cancelMoveBtn = document.getElementById('cancelMoveBtn');

// ファイル読み込み用バナー関連のDOM要素 (上部)
const progressContainerFile = document.getElementById('progressContainerFile');
const progressBarFile = document.getElementById('progressBarFile');
const progressTextFile = document.getElementById('progressTextFile');

// PDF変換用バナー関連のDOM要素 (下部)
const progressContainerPdf = document.getElementById('progressContainerPdf');
const progressBarPdf = document.getElementById('progressBarPdf');
const progressTextPdf = document.getElementById('progressTextPdf');

// 画像とPDFドキュメントを保持する配列 (一意なIDで管理)
let uploadedDocuments = [];

// ファイル選択方式による移動用変数
let selectedMoveSourceId = null; // 移動元として選択されたファイルID

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
// --- 個別ページ設定のUI制御とロジック ---
// ------------------------------------

/**
 * プレビュー要素がクリックされたときに個別のページ向き設定を表示し、
 * 初期チェック状態をグローバル設定に合わせる
 * @param {object} docObj - ドキュメントオブジェクト
 */
function displayImageOrientationControls(docObj) {
    if (docObj.type !== 'image') {
        imageOrientationControls.innerHTML = '<p style="font-size: 0.9rem; color: #888; margin: 5px 0;">PDFファイルは個別の向き設定ができません。</p>';
        return;
    }
    
    // グローバル設定をチェック
    const globalOrientationElement = document.querySelector('input[name="globalPdfOrientation"]:checked');
    const globalOrientation = globalOrientationElement ? globalOrientationElement.value : 'p';

    // 画像のピクセルサイズから、画像本来の向きを再判定 (表示用)
    const isImageLandscape = docObj.image.width > docObj.image.height;
    
    // 現在の個別設定
    const currentPageOrientation = docObj.pageOrientation;
    
    // 個別設定のラジオボタンの初期チェック状態を決定
    const initialCheckOrientation = docObj.pageOrientationWasChanged ? currentPageOrientation : globalOrientation;
    
    // 最終的に適用されるべき向き
    const effectiveOrientation = docObj.pageOrientationWasChanged ? currentPageOrientation : globalOrientation;
    
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
            const doc = uploadedDocuments.find(doc => doc.id === docObj.id);
            doc.pageOrientation = newOrientation;
            doc.pageOrientationWasChanged = true;
            
            displayImageOrientationControls(doc);
        });
    });
}


// ------------------------------------
// --- プレビューエリアクリック・フルスクリーン管理 ---
// ------------------------------------

// プレビューエリア自体のクリック（背景クリックで全画面切り替え）
previewArea.addEventListener('click', (e) => {
    // 各ファイルラッパーが直接クリックされた場合はバブリングで処理されるため、
    // プレビューエリアの背景部分がクリックされたときのみ全画面をトグル
    if (e.target === previewArea) {
        toggleFullscreen(previewArea);
    }
});

// フルスクリーン状態が変化したときの処理
document.addEventListener('fullscreenchange', () => {
    const isFullscreen = !!document.fullscreenElement;
    if (isFullscreen) {
        moveControlsContainer.style.display = 'block';
    } else {
        moveControlsContainer.style.display = 'none';
        resetMoveSelection(); // フルスクリーン解除時は移動選択をリセット
    }
});

function toggleFullscreen(element) {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        element.requestFullscreen().catch(err => {
            console.error(`全画面表示を有効にできませんでした: ${err.message} (${err.name})`);
            alert("ブラウザの設定により全画面表示がブロックされました。");
        });
    }
}


// ------------------------------------
// --- 選択方式によるファイル移動ロジック ---
// ------------------------------------

/**
 * ファイルプレビュー要素がクリックされたときの処理
 */
function handlePreviewItemClick(docObj, wrapperElement) {
    const isFullscreen = !!document.fullscreenElement;

    // プレビューエリアが拡大（フルスクリーン）されていないときは、従来の個別向き設定のみ
    if (!isFullscreen) {
        displayImageOrientationControls(docObj);
        return;
    }

    // --- プレビューエリア拡大時のファイル移動ロジック ---
    if (!selectedMoveSourceId) {
        // ステップ1: まだ移動元が選ばれていない場合 -> このファイルを選択元にする
        selectedMoveSourceId = docObj.id;
        wrapperElement.classList.add('move-source');
        moveStatusText.textContent = `「${docObj.fileName}」を選択中。移動先のファイルをクリックしてください。`;
        cancelMoveBtn.style.display = 'inline-block';
    } else {
        // ステップ2: 既に移動元が選ばれている場合 -> このファイルを移動先として実行
        if (selectedMoveSourceId === docObj.id) {
            // 同じファイルがクリックされた場合は選択を解除
            resetMoveSelection();
            return;
        }

        const sourceIndex = uploadedDocuments.findIndex(d => d.id === selectedMoveSourceId);
        const targetIndex = uploadedDocuments.findIndex(d => d.id === docObj.id);

        if (sourceIndex !== -1 && targetIndex !== -1) {
            // 移動先のファイルが移動元より「後ろ」にある場合は直後に、「前」にある場合は直前に配置する
            const movePosition = targetIndex > sourceIndex ? 'after' : 'before';
            
            // 配列から移動元を取り出す
            const [movedDoc] = uploadedDocuments.splice(sourceIndex, 1);

            // ターゲットのインデックスを再取得（spliceによってインデックスがずれる可能性があるため再計算）
            let newTargetIndex = uploadedDocuments.findIndex(d => d.id === docObj.id);

            if (movePosition === 'after') {
                newTargetIndex += 1;
            }
            // 'before' の場合は newTargetIndex のままでその直前に挿入される

            // 指定位置に挿入
            uploadedDocuments.splice(newTargetIndex, 0, movedDoc);

            // プレビューとインデックスを再構築
            rebuildPreview();
        }

        // 移動完了後に選択状態をリセット
        resetMoveSelection();
    }
}

/**
 * 移動選択状態をリセットする
 */
function resetMoveSelection() {
    selectedMoveSourceId = null;
    document.querySelectorAll('.preview-image-wrapper').forEach(el => {
        el.classList.remove('move-source');
    });
    moveStatusText.textContent = 'ファイル移動モード: 移動したいファイルを選択してください';
    cancelMoveBtn.style.display = 'none';
}

cancelMoveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetMoveSelection();
});


/**
 * プレビュー要素を生成し、イベントリスナーを設定する関数
 */
function createPreviewElement(docObj, index) { 
    const wrapper = document.createElement('div');
    wrapper.classList.add('preview-image-wrapper');
    wrapper.classList.add(docObj.type === 'pdf' ? 'preview-pdf-wrapper' : 'preview-image-item');
    wrapper.dataset.index = index;
    wrapper.dataset.fileId = docObj.id;
    wrapper.classList.add('no-select');
    
    // 既に移動元として選択されているファイルであればクラスを付与維持
    if (selectedMoveSourceId === docObj.id) {
        wrapper.classList.add('move-source');
    }

    const numberSpan = document.createElement('span');
    numberSpan.classList.add('sequence-number');
    numberSpan.textContent = index + 1;
    
    let content;
    if (docObj.type === 'image') {
        const imgElement = document.createElement('img');
        imgElement.src = docObj.dataUrl;
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
        if (selectedMoveSourceId === docObj.id) {
            resetMoveSelection();
        }
        removeDocument(currentIndex);
    });

    const fileNameSpan = document.createElement('span');
    fileNameSpan.classList.add('file-name-label');
    fileNameSpan.textContent = docObj.fileName;
    fileNameSpan.title = docObj.fileName;

    wrapper.appendChild(numberSpan);
    wrapper.appendChild(content);
    wrapper.appendChild(deleteBtn);
    wrapper.appendChild(fileNameSpan);

    // 選択方式によるクリックイベント
    wrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        handlePreviewItemClick(docObj, wrapper);
    });

    wrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    return wrapper;
}


/**
 * 共通のファイル処理コア関数
 * @param {File[]} files 処理対象のファイル配列
 * @param {boolean} isFolder フォルダ選択からの実行かどうか
 */
function processFiles(files, isFolder = false) {
    if (files.length > 0) {
        convertBtn.disabled = false;
        
        // 自然順ソート（ファイル名昇順 / フォルダ選択時は相対パスを優先）
        files.sort((a, b) => {
            const pathA = a.webkitRelativePath || a.name;
            const pathB = b.webkitRelativePath || b.name;
            return pathA.localeCompare(pathB, 'ja', { numeric: true });
        });

        // フォルダ選択時の処理：webkitRelativePathからルートフォルダ名を抽出してPDF名に自動セット
        if (isFolder) {
            for (let i = 0; i < files.length; i++) {
                const relPath = files[i].webkitRelativePath;
                if (relPath && relPath.includes('/')) {
                    const folderName = relPath.split('/')[0];
                    if (folderName && (!pdfFilenameInput.value || pdfFilenameInput.value.trim() === '')) {
                        pdfFilenameInput.value = folderName;
                    }
                    break;
                }
            }
        }
        
        // ファイル処理開始時に【ファイル用バナー】を表示・初期化
        progressContainerFile.style.display = 'block';
        progressBarFile.style.width = '0%';
        progressTextFile.textContent = `ファイルを読み込み中... (0 / ${files.length} ファイル) 0%`; 
        
        progressContainerPdf.style.display = 'none';
        
        let processedCount = 0;

        const filePromises = files.map(file => {
            return new Promise(resolve => {
                const reader = new FileReader();
                
                const updateProgressAndResolve = (result) => {
                    processedCount++;
                    let progress = 0;
                    if (files.length > 0) {
                        progress = Math.round((processedCount / files.length) * 100);
                    }
                    
                    progressBarFile.style.width = `${progress}%`;
                    progressTextFile.textContent = `ファイルを読み込み中... (${processedCount} / ${files.length} ファイル) ${progress}%`;
                    resolve(result);
                };

                // Macの隠しファイル（.DS_Storeなど）や無関係なファイルを除外する安全策
                if (file.name.startsWith('.')) {
                    updateProgressAndResolve(null);
                    return;
                }

                if (file.type === 'application/pdf') {
                    reader.onload = (e) => {
                        updateProgressAndResolve({
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

                            updateProgressAndResolve({
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
                            console.error(`画像の読み込みに失敗しました: ${file.name}`);
                            updateProgressAndResolve(null);
                        }
                        img.src = dataUrl;
                    };
                    reader.readAsDataURL(file);

                } else {
                    updateProgressAndResolve(null);
                }
            });
        });

        Promise.all(filePromises).then(newDocuments => {
            newDocuments.filter(doc => doc !== null).forEach((docObj) => {
                uploadedDocuments.push(docObj);
            });
            rebuildPreview();

            progressTextFile.textContent = '✅ ファイル読み込み完了！';
            setTimeout(() => {
                progressContainerFile.style.display = 'none';
                convertBtn.disabled = uploadedDocuments.length === 0;
            }, 1000);
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
}

// ファイル単体選択時のイベント
imageUpload.addEventListener('change', (event) => {
    const files = Array.from(event.target.files);
    processFiles(files, false);
    event.target.value = null;
});

// フォルダごと選択時のイベント
folderUpload.addEventListener('change', (event) => {
    const files = Array.from(event.target.files);
    processFiles(files, true);
    event.target.value = null;
});


// ------------------------------------
// --- ユーティリティ関数 ---
// ------------------------------------

function rebuildPreview() {
    previewArea.innerHTML = '';
    
    uploadedDocuments.forEach((docObj, index) => {
        const previewElement = createPreviewElement(docObj, index);
        previewArea.appendChild(previewElement);
    });
    
    updatePreviewIndices();
    if (!document.fullscreenElement) {
        imageOrientationControls.innerHTML = '<p style="font-size: 0.9rem; color: #888; margin: 5px 0;">画像をクリックすると、このエリアに個別のページ向き設定が表示されます。</p>';
    }
}

function updatePreviewIndices() {
    const wrappers = previewArea.querySelectorAll('.preview-image-wrapper');
    wrappers.forEach((wrapper, index) => {
        wrapper.dataset.index = index;
        wrapper.querySelector('.sequence-number').textContent = index + 1;
    });
}

function removeDocument(index) {
    if (index >= 0 && index < uploadedDocuments.length) {
        uploadedDocuments.splice(index, 1);
        rebuildPreview();
        if (uploadedDocuments.length === 0) {
            convertBtn.disabled = true;
        }
        if (!document.fullscreenElement) {
            imageOrientationControls.innerHTML = '<p style="font-size: 0.9rem; color: #888; margin: 5px 0;">画像をクリックすると、このエリアに個別のページ向き設定が表示されます。</p>';
        }
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
    resetMoveSelection();
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
    resetMoveSelection();
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
    
    progressContainerFile.style.display = 'none';
    progressContainerPdf.style.display = 'block';
    progressBarPdf.style.width = '0%';
    progressTextPdf.textContent = `準備中... (0 / ${uploadedDocuments.length} ページ)`;
    

    const globalOrientationElement = document.querySelector('input[name="globalPdfOrientation"]:checked');
    const globalPdfOrientation = globalOrientationElement ? globalOrientationElement.value : 'p';

    const imageFit = document.querySelector('input[name="imageFit"]:checked').value;
    
    let outputFilename = pdfFilenameInput.value.trim() || 'combined_document';
    if (!outputFilename.endsWith('.pdf')) {
        outputFilename += '.pdf';
    }

    try {
        const finalPdfDoc = await PDFDocument.create();
        
        let pdfLibFont = null;
        if (fontBytes) {
            finalPdfDoc.registerFontkit(window.fontkit);
            pdfLibFont = await finalPdfDoc.embedFont(fontBytes);
        }

        const A4_WIDTH = 595.28;
        const A4_HEIGHT = 841.89;
        
        let completedCount = 0;
        const totalDocuments = uploadedDocuments.length;
        
        for (const docObj of uploadedDocuments) {
            if (docObj.type === 'image') {
                const pageOrientation = docObj.pageOrientationWasChanged 
                                             ? docObj.pageOrientation 
                                             : globalPdfOrientation;
                
                const maxW = pageOrientation === 'p' ? A4_WIDTH : A4_HEIGHT;
                const maxH = pageOrientation === 'p' ? A4_HEIGHT : A4_WIDTH;

                const img = docObj.image;
                const effectiveWidth = img.width;
                const effectiveHeight = img.height;

                let w, h;
                
                if (imageFit === 'fill') {
                    w = maxW;
                    h = maxH;
                } else {
                    const scaleRatio = Math.min(maxW / effectiveWidth, maxH / effectiveHeight);
                    w = effectiveWidth * scaleRatio;
                    h = effectiveHeight * scaleRatio;
                }
                
                const x = (maxW - w) / 2;
                const y = (maxH - h) / 2;
                
                const page = finalPdfDoc.addPage([maxW, maxH]);
                
                let embeddedImage;
                let imageType = docObj.format === 'PNG' ? 'PNG' : 'JPEG';

                const base64Data = docObj.dataUrl.split(',')[1];
                const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                
                if (imageType === 'PNG') {
                    embeddedImage = await finalPdfDoc.embedPng(imageBytes);
                } else {
                    embeddedImage = await finalPdfDoc.embedJpg(imageBytes);
                }

                page.drawImage(embeddedImage, {
                    x: x,
                    y: y,
                    width: w,
                    height: h,
                });
                
            } else if (docObj.type === 'pdf') {
                const existingPdfDoc = await PDFDocument.load(docObj.arrayBuffer);
                const copiedPages = await finalPdfDoc.copyPages(existingPdfDoc, existingPdfDoc.getPageIndices());
                
                copiedPages.forEach(page => finalPdfDoc.addPage(page));
            }
            
            completedCount++;
            const progress = Math.round((completedCount / totalDocuments) * 100);
            
            progressBarPdf.style.width = `${progress}%`;
            progressTextPdf.textContent = `ページ生成中... (${completedCount} / ${totalDocuments} ページ) ${progress}%`;
            
            await new Promise(resolve => setTimeout(resolve, 10)); 
        }
        
        if (finalPdfDoc.getPageCount() === 0) {
            throw new Error("PDFページが生成されました。処理できるファイルがありません。");
        }
        
        progressTextPdf.textContent = '最終処理中... (ファイル保存)';
        progressBarPdf.style.width = '100%';
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
        convertBtn.textContent = 'PDFに変換してダウンロード';
        convertBtn.disabled = uploadedDocuments.length === 0;
        
        progressTextPdf.textContent = '✅ 完了しました！ダウンロードを開始します。';
        setTimeout(() => {
            progressContainerPdf.style.display = 'none';
        }, 3000); 
    }
}

convertBtn.addEventListener('click', createPDF);
