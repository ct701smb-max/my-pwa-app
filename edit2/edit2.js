// ====== グローバル定数の定義 ======
const htmlInput = document.getElementById('htmlCode');
const cssInput = document.getElementById('cssCode');
const jsInput = document.getElementById('jsCode');
const previewFrame = document.getElementById('preview');

// ファイル名入力フィールド
const htmlFileNameInput = document.getElementById('htmlFileNameInput');
const cssFileNameInput = document.getElementById('cssFileNameInput');
const jsFileNameInput = document.getElementById('jsFileNameInput');

// 行番号表示フィールド
const htmlLineNumbers = document.getElementById('htmlLineNumbers');
const cssLineNumbers = document.getElementById('cssLineNumbers');
const jsLineNumbers = document.getElementById('jsLineNumbers');

// search.js連携のためにハイライトコンテナのDOM要素を再定義
const htmlHighlightContainer = document.getElementById('htmlHighlightContainer');
const cssHighlightContainer = document.getElementById('cssHighlightContainer');
const jsHighlightContainer = document.getElementById('jsHighlightContainer');

// ファイル操作要素
const importFile = document.getElementById('importFile');
const exportZipButton = document.getElementById('exportZipButton');
const fileNameInput = document.getElementById('fileNameInput');
const importImageFile = document.getElementById('importImageFile');

// 画像リストエリアとトグルボタン
const importedImageList = document.getElementById('importedImageList'); 
const toggleImageListButton = document.getElementById('toggleImageListButton'); 

// 画像ファイルを格納するオブジェクト (ファイル名: Object URL)
const importedImages = {};

// ------------------------------------
// ⭐ トースト通知表示ヘルパー関数
// ------------------------------------
function showToastNotification(message, duration = 2000) {
    const existingToast = document.getElementById('editorToast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'editorToast';
    toast.textContent = message;
    
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background-color: #333;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.5s, transform 0.5s;
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5);
    `;
    
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, 0)';
    }, 10);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, 20px)';
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}


// ⭐【行番号機能】行番号を生成・更新する関数
function updateLineNumbers(textArea, lineNumberDiv) {
    if (!textArea || !lineNumberDiv) return;

    const lines = textArea.value.split('\n');
    const lineCount = lines.length;
    
    let lineNumbers = '';
    for (let i = 1; i <= lineCount; i++) {
        lineNumbers += i + '\n';
    }
    
    lineNumberDiv.innerText = lineNumbers.trimEnd();
}


// ------------------------------------
// ⭐ 画像URL置換ヘルパー関数 (NEW) ⭐
// ------------------------------------
/**
 * コード内のインポートされた画像ファイル名を Blob URL に置換する。
 * @param {string} code - HTML, CSS, または JavaScript のコード文字列。
 * @returns {string} Blob URL に置換されたコード。
 */
function replaceImageUrls(code) {
    let newCode = code;
    
    for (const [fileName, url] of Object.entries(importedImages)) {
        // 正規表現: 'fileName' または "fileName" に一致させる
        // 例: src="image.jpg", url('image.jpg'), 'image.jpg'
        const regex = new RegExp(`(['"])${fileName}(['"])`, 'gi');
        
        // 置換: マッチしたクォーテーションを保持しつつ、ファイル名部分を Blob URL に置き換える
        // $1は最初のキャプチャグループ（クォーテーション）、$2は2番目のキャプチャグループ
        newCode = newCode.replace(regex, `$1${url}$2`);
    }
    return newCode;
}


// ⭐ ライブプレビュー機能 (画像URL置換ロジックを拡張)
function updatePreview() {
    const htmlCode = htmlInput.value;
    const cssCode = cssInput.value;
    const jsCode = jsInput.value;

    const previewDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;

    // ⭐ 修正: すべてのコードに対して置換関数を適用する ⭐
    const finalHtmlCode = replaceImageUrls(htmlCode);
    const finalCssCode = replaceImageUrls(cssCode);
    const finalJsCode = replaceImageUrls(jsCode);

    const content = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Preview</title>
            <style>${finalCssCode}</style>
        </head>
        <body>
            ${finalHtmlCode}
            <script>
                try {
                    ${finalJsCode} 
                } catch (e) {
                    window.parent.console.error('Preview JS Error:', e.message);
                }
            </script>
        </body>
        </html>
    `;

    previewDoc.open();
    previewDoc.write(content);
    previewDoc.close();
    
    saveCodeToLocalStorage();
}

// ------------------------------------
// 🌟 7. 一時保存機能 (LocalStorage) 
// ------------------------------------

function saveCodeToLocalStorage() {
    try {
        localStorage.setItem('web_editor_html', htmlInput.value);
        localStorage.setItem('web_editor_css', cssInput.value);
        localStorage.setItem('web_editor_js', jsInput.value);
        localStorage.setItem('web_editor_html_name', htmlFileNameInput.value);
        localStorage.setItem('web_editor_css_name', cssFileNameInput.value);
        localStorage.setItem('web_editor_js_name', jsFileNameInput.value);
    } catch (e) {
        console.error('LocalStorageへの保存に失敗しました:', e);
    }
}

function loadCodeFromLocalStorage() {
    const savedHtml = localStorage.getItem('web_editor_html');
    const savedCss = localStorage.getItem('web_editor_css');
    const savedJs = localStorage.getItem('web_editor_js');

    if (savedHtml !== null) { htmlInput.value = savedHtml; }
    if (savedCss !== null) { cssInput.value = savedCss; }
    if (savedJs !== null) { jsInput.value = savedJs; }

    const savedHtmlName = localStorage.getItem('web_editor_html_name');
    const savedCssName = localStorage.getItem('web_editor_css_name');
    const savedJsName = localStorage.getItem('web_editor_js_name');
    
    if (savedHtmlName !== null) { htmlFileNameInput.value = savedHtmlName; }
    if (savedCssName !== null) { cssFileNameInput.value = savedCssName; }
    if (savedJsName !== null) { jsFileNameInput.value = savedJsName; }
}


// ------------------------------------
// 8. イベントリスナーと初期実行
// ------------------------------------

function handleCodeEditorInput(textArea, lineNumberDiv) {
    updatePreview(); 
    updateLineNumbers(textArea, lineNumberDiv);
    
    // search.js の clearHighlights() を呼び出して、入力時にハイライトコンテナに元のコードを反映させる
    if (typeof clearHighlights === 'function') {
        clearHighlights();
    }
}

// コード入力
htmlInput.addEventListener('input', () => handleCodeEditorInput(htmlInput, htmlLineNumbers));
cssInput.addEventListener('input', () => handleCodeEditorInput(cssInput, cssLineNumbers));
jsInput.addEventListener('input', () => handleCodeEditorInput(jsInput, jsLineNumbers));

// ファイル名入力
htmlFileNameInput.addEventListener('input', saveCodeToLocalStorage);
cssFileNameInput.addEventListener('input', saveCodeToLocalStorage);
jsFileNameInput.addEventListener('input', saveCodeToLocalStorage);


// ⭐ 画像リストトグルボタンのイベントリスナー
if (toggleImageListButton) {
    toggleImageListButton.addEventListener('click', () => {
        const isHidden = importedImageList.classList.toggle('hidden');
        
        if (isHidden) {
            toggleImageListButton.textContent = '画像リストを表示';
        } else {
            toggleImageListButton.textContent = '画像リストを隠す';
        }
    });
}


// 初期ロード時の処理
loadCodeFromLocalStorage(); 
updateLineNumbers(htmlInput, htmlLineNumbers);
updateLineNumbers(cssInput, cssLineNumbers);
updateLineNumbers(jsInput, jsLineNumbers);
updatePreview(); 

// search.js がロードされていれば、初期ロード時にハイライトをクリア（元のコードを反映）
if (typeof clearHighlights === 'function') {
    clearHighlights();
}

// ------------------------------------
// ⭐ 画像リスト表示ヘルパー関数
// ------------------------------------

function addImageToDisplayList(fileName, imageUrl) {
    const existingItem = document.getElementById(`img-item-${fileName}`);
    if (existingItem) {
        // 既存の Blob URL を解放する処理
        const oldUrl = importedImages[fileName];
        if (oldUrl && oldUrl.startsWith('blob:')) {
            URL.revokeObjectURL(oldUrl);
        }
        existingItem.remove(); 
    }
    
    const itemDiv = document.createElement('div');
    itemDiv.className = 'image-item';
    itemDiv.id = `img-item-${fileName}`;
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = fileName;
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = fileName;
    
    itemDiv.appendChild(img);
    itemDiv.appendChild(nameSpan);
    
    // クリックイベントを追加 (ファイル名のみをコピーし、トースト通知)
    itemDiv.addEventListener('click', () => {
        const contentToCopy = fileName;
        
        navigator.clipboard.writeText(contentToCopy).then(() => {
            showToastNotification(`ファイル名 "${contentToCopy}" をコピーしました`, 1500); 
            
        }).catch(err => {
            console.error('コピー失敗:', err);
            alert(`コピー失敗。手動でファイル名をコピーしてください:\n${contentToCopy}`);
        });
    });

    importedImageList.prepend(itemDiv);
}


// ------------------------------------
// ⭐ 画像インポート機能 
// ------------------------------------
importImageFile.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name;
    
    if (importedImages[fileName]) {
        // 上書き処理を行うが、先に古い URL を解放するために addImageToDisplayList が内部で処理する
        showToastNotification(`画像 "${fileName}" は上書きされました。`, 2500);
    }

    // Blob URL を生成し、importedImagesにURLを保存 
    const imageUrl = URL.createObjectURL(file);
    importedImages[fileName] = imageUrl;

    // addImageToDisplayList で古い URL の解放と DOM の更新を行う
    addImageToDisplayList(fileName, imageUrl);

    showToastNotification(`画像 "${fileName}" をインポートしました。`, 2500);

    event.target.value = '';
    updatePreview(); 
});


// ------------------------------------
// 6. インポート機能 (コード/ZIP)
// ------------------------------------

function handleSingleFileImport(file, extension) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        let textArea = null;
        let fileNameInput = null;
        let lineNumberDiv = null;

        if (extension === 'html') {
            textArea = htmlInput;
            fileNameInput = htmlFileNameInput;
            lineNumberDiv = htmlLineNumbers;
        } else if (extension === 'css') {
            textArea = cssInput;
            fileNameInput = cssFileNameInput;
            lineNumberDiv = cssLineNumbers;
        } else if (extension === 'js') {
            textArea = jsInput;
            fileNameInput = jsFileNameInput;
            lineNumberDiv = jsLineNumbers;
        }
        
        if (textArea) {
            textArea.value = content;
            fileNameInput.value = file.name; 
            updateLineNumbers(textArea, lineNumberDiv);
            
            // インポート時もハイライトをクリアし、表示をリセット
            if (typeof clearHighlights === 'function') {
                clearHighlights();
            }
        }
        
        updatePreview();
        alert(`${file.name} を正常にインポートしました。`);
    };
    reader.onerror = () => {
        alert('ファイルの読み込み中にエラーが発生しました。');
    };
    reader.readAsText(file);
}

function handleZipImport(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            // JSZip.loadAsync はグローバルに定義されていることを想定
            const zip = await JSZip.loadAsync(e.target.result); 
            let importedCount = 0;

            const filesToImport = [
                { type: '.html', input: htmlInput, nameInput: htmlFileNameInput, lineDiv: htmlLineNumbers },
                { type: '.css', input: cssInput, nameInput: cssFileNameInput, lineDiv: cssLineNumbers },
                { type: '.js', input: jsInput, nameInput: jsFileNameInput, lineDiv: jsLineNumbers }
            ];

            for (const zipEntry in zip.files) {
                if (zip.files[zipEntry].dir) continue;

                const entryName = zipEntry.toLowerCase();
                const fileToMatch = filesToImport.find(f => entryName.endsWith(f.type));

                if (fileToMatch && importedCount < filesToImport.length) {
                    const content = await zip.file(zipEntry).async("text");
                    fileToMatch.input.value = content;
                    fileToMatch.nameInput.value = zipEntry; 
                    updateLineNumbers(fileToMatch.input, fileToMatch.lineDiv);
                    importedCount++;
                }
            }
            
            if (importedCount > 0) {
                updatePreview();
                alert(`ZIPファイルから ${importedCount} 個のファイルを正常にインポートしました。`);
                
                // インポート時もハイライトをクリアし、表示をリセット
                if (typeof clearHighlights === 'function') {
                    clearHighlights();
                }
            } else {
                alert('ZIPファイル内にインポート可能な .html, .css, .js ファイルが見つかりませんでした。');
            }

        } catch (error) {
            console.error('ZIPファイルの処理エラー:', error);
            alert('ZIPファイルの読み込みまたは展開中にエラーが発生しました。');
        }
    };
    reader.readAsArrayBuffer(file);
}

importFile.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const fileExtension = file.name.split('.').pop().toLowerCase();

    if (fileExtension === 'zip') {
        handleZipImport(file);
    } else if (['html', 'css', 'js'].includes(fileExtension)) {
        handleSingleFileImport(file, fileExtension);
    } else {
        alert('サポートされていないファイル形式です。(.html, .css, .js, .zip のみ)');
    }
    event.target.value = '';
});


// ------------------------------------
// エクスポート機能
// ------------------------------------
exportZipButton.addEventListener('click', () => {
    // 1. プロンプトでファイル名を入力させる
    const defaultFileName = 'web_editor_project';
    const fileName = prompt("エクスポートするZIPファイルのベースファイル名を入力してください:", defaultFileName);

    // キャンセルまたは空文字チェック
    if (fileName === null || fileName.trim() === '') {
        showToastNotification("エクスポートがキャンセルされました。", 1500);
        return;
    }

    // ファイル名として安全な文字に変換
    const safeBaseFileName = fileName.trim().replace(/[\\/:*?"<>|]/g, '_');
    const zipFileName = `${safeBaseFileName}.zip`;
    
    // 2. ボタンの無効化とUI更新
    exportZipButton.disabled = true;
    exportZipButton.textContent = 'ZIP生成中...';

    const zip = new JSZip();

    // 3. コードファイルを追加 
    const htmlName = htmlFileNameInput.value.trim() || 'index.html';
    const cssName = cssFileNameInput.value.trim() || 'style.css';
    const jsName = jsFileNameInput.value.trim() || 'script.js';
    
    zip.file(htmlName, htmlInput.value);
    zip.file(cssName, cssInput.value);
    zip.file(jsName, jsInput.value);

    // 4. インポートされた画像ファイル (Blob URL) を fetch で取得しZIPに追加
    const imagePromises = Object.entries(importedImages).map(([imgFileName, url]) => {
        return new Promise((resolve, reject) => {
            if (!url) return resolve(); 
            
            fetch(url)
                .then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error(`HTTP status ${response.status}`)))
                .then(arrayBuffer => {
                    zip.file(imgFileName, arrayBuffer, { binary: true });
                    resolve();
                })
                .catch(e => {
                    console.error(`Fetch failed for image ${imgFileName}:`, e);
                    // エラーが出ても他のファイルのエクスポートは続行できるように resolve() する方が良い場合もある
                    resolve(); 
                });
        });
    });

    // 5. すべての処理が完了するのを待ってからZIPを生成・ダウンロード
    Promise.all(imagePromises)
        .then(() => {
            return zip.generateAsync({ type: "blob" });
        })
        .then(function(content) { 
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = zipFileName; 
            link.click();
            
            URL.revokeObjectURL(link.href);
            
            const imageCount = Object.keys(importedImages).length;
            showToastNotification(`ZIPエクスポート完了: ${zipFileName} (画像 ${imageCount}点)`, 5000);
        })
        .catch((error) => {
            console.error('最終的なZIP生成/処理エラー:', error);
            showToastNotification(`ZIPの生成中にエラーが発生しました。\n詳細: ${error.message || error}`, 5000);
        })
        .finally(() => {
            exportZipButton.disabled = false;
            exportZipButton.textContent = 'ZIPでエクスポート (すべて)'; 
        });
});

// ------------------------------------
// 9. タブ切り替え機能
// ------------------------------------
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const targetId = button.dataset.tab;

        // アクティブ状態の切り替えとARIA属性の更新
        tabButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.hasAttribute('role') && btn.getAttribute('role') === 'tab') {
                btn.setAttribute('aria-selected', 'false');
            }
        });
        tabContents.forEach(content => content.classList.remove('active'));

        button.classList.add('active');
        document.getElementById(targetId).classList.add('active');
        if (button.hasAttribute('role') && button.getAttribute('role') === 'tab') {
            button.setAttribute('aria-selected', 'true');
        }
        
        if (targetId === 'preview-panel') {
            updatePreview();
            return; 
        }
        
        // アクティブなエディタの特定と更新
        let activeInput, activeLineNumbers;
        
        switch (targetId) {
            case 'html-panel':
                activeInput = htmlInput;
                activeLineNumbers = htmlLineNumbers;
                break;
            case 'css-panel':
                activeInput = cssInput;
                activeLineNumbers = cssLineNumbers;
                break;
            case 'js-panel':
                activeInput = jsInput;
                activeLineNumbers = jsLineNumbers;
                break;
        }

        if (activeInput) {
            updateLineNumbers(activeInput, activeLineNumbers);
            // search.js の clearHighlights() を呼び出し
            if (typeof clearHighlights === 'function') {
                clearHighlights();
            }
            // タブ切り替え時、スクロール位置を上端にリセット
            activeInput.scrollTop = 0;
        }
    });
});
