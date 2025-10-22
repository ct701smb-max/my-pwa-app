/**
 * edit.js - 複数ファイル管理機能を持つWebエディタのコアロジック
 *
 * NOTE: このスクリプトは、外部でJSZipライブラリが読み込まれていることを前提としています。
 */
/* global JSZip */
document.addEventListener('DOMContentLoaded', () => {
    // ------------------------------------
    // 1. DOM要素の取得
    // ------------------------------------
    const appContainer = document.getElementById('app-container');
    const fileTabsContainer = document.getElementById('file-tabs');
    const codeInput = document.getElementById('code-input'); 
    
    // 共通のtextarea
    const filenameInput = document.getElementById('current-filename');
    const previewIframe = document.getElementById('preview-iframe');
    const switchToPreviewBtn = document.getElementById('switch-to-preview');
    const switchToEditorBtn = document.getElementById('switch-to-editor');
    const lineNumberDiv = document.getElementById('line-numbers'); // 行番号DIVの取得

    const fileMenuToggle = document.getElementById('file-menu-toggle');
    const fileTabs = document.getElementById('file-tabs');
    const fileTabsMenuContainer = document.getElementById('file-tabs-container');

    const exportBtn = document.getElementById('export-btn');
    const importFileInput = document.getElementById('import-file-input');
    
    // 🌟 [追加] Undo/RedoボタンのDOM要素を取得
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    
    // カスタムメッセージボックスのDOM設定
    const messageBox = document.createElement('div');
    messageBox.id = 'message-box';
    messageBox.style.cssText = 'position: fixed; top: 10px; right: 10px; background-color: #4CAF50; color: white; padding: 15px; border-radius: 5px; z-index: 1000; display: none; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.2);';
    document.body.appendChild(messageBox);
    
    // 🌟 検索機能関連のDOM要素の取得
    const searchToggleBtn = document.getElementById('search-toggle-btn');
    const searchBar = document.getElementById('search-bar');
    const searchInput = document.getElementById('search-input');
    const searchNextBtn = document.getElementById('search-next-btn');
    const searchPrevBtn = document.getElementById('search-prev-btn');
    const searchCloseBtn = document.getElementById('search-close-btn');
    const searchResultCount = document.getElementById('search-result-count');
    const highlightLayer = document.getElementById('highlight-layer');
    
    const DOM = {
    // 既存の要素
    appContainer,
    fileTabsContainer,
    codeInput,
    filenameInput,
    previewIframe,
    switchToPreviewBtn,
    switchToEditorBtn,
    lineNumberDiv,
    fileMenuToggle,
    fileTabs,
    fileTabsMenuContainer,
    exportBtn,
    importFileInput,
    undoBtn,
    redoBtn,
    messageBox,
    
    // 検索機能関連のDOM要素
    searchToggleBtn: searchToggleBtn,
    searchBar: searchBar,
    searchInput: searchInput,
    searchNextBtn: searchNextBtn,
    searchPrevBtn: searchPrevBtn,
    searchCloseBtn: searchCloseBtn,
    searchResultCount: searchResultCount,
    highlightLayer,
    // ...
};
    // ------------------------------------
    // 2. ファイル管理の状態変数と定数
    // ------------------------------------
    let files = {}; // { filename: { type: 'html'|'css'|'js'|'json'|'img', content: '...' } }
    let activeFile = null; // 現在アクティブなファイル名 (例: 'index.html')

    const FILE_TYPES_ORDERED = ['html', 'css', 'js', 'json', 'img'];
    const FILE_TYPES = ['html', 'css', 'js', 'json', 'img'];
    const DEFAULT_FILENAMES = {
        html: 'index.html',
        css: 'style.css',
        js: 'script.js',
        json: 'manifest.json'
    };
    
   // ----------------------------------------------------
    // 🌟 2.5. Undo/Redo 履歴管理用の状態変数 (新規追加)
    // ----------------------------------------------------
    let history = [];
    let historyPointer = -1;
    const MAX_HISTORY_SIZE = 50;
    let inputTimer = null;
    const DEBOUNCE_TIME = 300;

    // ====================================
    // 7. 検索/ハイライト コア関数
    // ====================================
    // 検索の状態変数
    let searchMatches = [];     // 一致する全検索結果 (start, end) を保持
    let currentMatchIndex = -1; // 現在選択されているマッチのインデックス
    
    /** 検索バーの表示・非表示を切り替える */
    function toggleSearchBar(forceClose = false) {
        // 'flex'が設定されているか、CSSにdisplay:flexが設定されているかをチェック
        const isVisible = DOM.searchBar.style.display === 'flex' || 
                          (getComputedStyle(DOM.searchBar).display !== 'none' && !forceClose);

        if (isVisible || forceClose) {
            DOM.searchBar.style.display = 'none';
            DOM.searchInput.value = ''; // 検索文字列をクリア

            // 検索状態とハイライトをクリアする
            searchMatches = [];
            currentMatchIndex = -1;
            updateSearchHighlight(); // setSelectionRange(0, 0)を実行してハイライトを解除
            
            DOM.codeInput.focus(); // エディタにフォーカスを戻す
            
            updateHighlightLayer(); // 検索ハイライトを消すためにレイヤーを更新
        } else {
            DOM.searchBar.style.display = 'flex';
            DOM.searchInput.focus();
            // バーを開いたとき、既存のテキストがあれば即座に検索を実行
            performSearch(DOM.searchInput.value); 
        }
    }

    /**
     * 現在のcodeInputの内容から検索文字列に一致するすべてのインデックスを取得する
     */
    function performSearch(query) {
        if (!activeFile || files[activeFile].type === 'img' || !query) {
            searchMatches = [];
            currentMatchIndex = -1;
            updateSearchHighlight();
            return;
        }

        const content = DOM.codeInput.value;
        searchMatches = [];
        currentMatchIndex = -1;

        try {
            const regex = new RegExp(query, 'gi'); // 大文字・小文字を区別しないグローバル検索
            let match;

            while ((match = regex.exec(content)) !== null) {
                searchMatches.push({
                    start: match.index,
                    end: match.index + match[0].length
                });
            }
        } catch (e) {
            console.error('無効な検索クエリ:', e);
            searchMatches = [];
        }

        DOM.searchResultCount.textContent = `${searchMatches.length} 件の結果`;

        if (searchMatches.length > 0) {
            currentMatchIndex = 0; // 最初のマッチに移動
            updateSearchHighlight(); // setSelectionRangeで選択＆ハイライトレイヤー更新
            scrollToMatch(searchMatches[currentMatchIndex]);
        } else {
            updateSearchHighlight(); // ハイライトをクリア (setSelectionRange(0, 0) とレイヤー更新)
        }
    }

    /** 次の検索結果に移動する */
    function searchNext() {
        if (searchMatches.length === 0) return;

        currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;

        updateSearchHighlight();
        scrollToMatch(searchMatches[currentMatchIndex]);
    }

    /** 前の検索結果に移動する */
    function searchPrev() {
        if (searchMatches.length === 0) return;

        currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;

        updateSearchHighlight();
        scrollToMatch(searchMatches[currentMatchIndex]);
    }
    
    /**
     * 現在選択されているマッチをハイライトし、他のハイライトを解除する
     * 検索結果の状態をハイライトレイヤーに反映させる
     */
    function updateSearchHighlight() {
        const match = searchMatches[currentMatchIndex];
        
        if (match) {
            // 現在のマッチ箇所を選択状態にする (ユーザーへのフィードバック)
            DOM.codeInput.setSelectionRange(match.start, match.end);
            
            // 選択件数の表示を更新
            DOM.searchResultCount.textContent = `${searchMatches.length} 件の結果 (${currentMatchIndex + 1}/${searchMatches.length})`;
        } else {
            // ハイライトを解除（選択を先頭に移動）
            DOM.codeInput.setSelectionRange(0, 0);
            DOM.searchResultCount.textContent = `${searchMatches.length} 件の結果`;
        }
        
        // 🌟 検索ハイライトをハイライトレイヤーにレンダリングする (重要)
        updateHighlightLayer(); 
    }

    /**
     * マッチ箇所までエディタをスクロールする
     */
    function scrollToMatch(match) {
        if (!DOM.codeInput || !match) return;
        
        DOM.codeInput.focus();
        // マッチ箇所にスクロールするために一時的にキャレットを移動
        DOM.codeInput.selectionStart = match.start;
        DOM.codeInput.selectionEnd = match.start;
        // スクロール後に、再度ハイライトを適用し直す
        updateSearchHighlight();
    }

    // ------------------------------------
    // 🌟 2.6. エディタ入力とスクロールの同期 (新規追加)
    // ------------------------------------
    
    // コード入力時にプレビュー、行番号、ハイライトを更新
    DOM.codeInput.addEventListener('input', () => {
        // 1. ファイルデータに保存（Undo/Redo機能のために遅延実行）
        if (activeFile && files[activeFile] && files[activeFile].type !== 'img') {
            files[activeFile].content = DOM.codeInput.value;
        }

        updateLineNumbers();
        updatePreview();
        // 🌟 バグ修正の核: 入力ごとにハイライトを更新し、検索ハイライトを表示する
        updateHighlightLayer(); 

        // Undo/Redoの状態をデバウンスで保存
        clearTimeout(inputTimer);
        inputTimer = setTimeout(saveState, DEBOUNCE_TIME);
    });

    // スクロール同期 (ハイライトレイヤーと行番号)
    DOM.codeInput.addEventListener('scroll', () => {
        DOM.lineNumberDiv.scrollTop = DOM.codeInput.scrollTop;
        // 🌟 バグ修正の核: ハイライトレイヤーのスクロールも同期させる
        DOM.highlightLayer.scrollTop = DOM.codeInput.scrollTop;
    });
    // ------------------------------------
    // 3. ユーティリティ関数
    // ------------------------------------

    /**
     * カスタムメッセージボックスを表示する
     */
    function showMessage(message, duration = 3000) {
        messageBox.textContent = message;
        messageBox.style.display = 'block';

        // 警告/成功に応じてスタイルを調整
        if (duration > 3000) {
            messageBox.style.backgroundColor = '#FFC107'; // 警告色 (黄色)
            messageBox.style.color = '#333';
        } else {
            messageBox.style.backgroundColor = '#4CAF50'; // 成功色 (緑)
            messageBox.style.color = 'white';
        }

        setTimeout(() => messageBox.style.display = 'none', duration);
    }

    /**
     * ファイル名からファイルタイプ (html, css, js, json, img) を推測する
     */
    function getFileTypeFromFilename(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        if (ext === 'html' || ext === 'htm') return 'html';
        if (ext === 'css') return 'css';
        if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') return 'js';
        if (ext === 'json') return 'json';
        
        if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) return 'img';

        return 'other';
    }

    /**
     * ファイルタイプに基づく初期コンテンツを取得
     */
    function getInitialContent(type, name) {
        const cssFileName = DEFAULT_FILENAMES.css;
        const jsFileName = DEFAULT_FILENAMES.js;
        const jsonFileName = DEFAULT_FILENAMES.json;

        if (type === 'html') {
            return `<!DOCTYPE html>
<html lang="ja">
    <!--ヘッダーの開始-->
<head>
    <!--ページのタイトル-->
    <title>${name}</title>
    
    <!--日本語の文字コード指定-->
    <meta charset="UTF-8">
    
    <!--端末処理-->
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!--リンク-->
    <link rel="stylesheet" href="${cssFileName}" media="all">



    <!--PWA用処理-->
    <link rel="manifest" href="${jsonFileName}">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black">
    <link rel="apple-touch-icon" href="icon.png">
    <meta name="theme-color" content="#333333">
    
</head>
<!--ヘッダーの終了-->
<!--ページの開始-->
<body>
    <h1>Webサイトをつくろう！</h1>



    <script src="${jsFileName}"></script>
    <!--PWA用処理-->
    <script src="register.js"></script>
</body>
<!--ページの終了-->
</html>`;
        } else if (type === 'css') {
            return `/* ${name} */
/* ==========================
   bodyタグに適用
========================== */
body {
    margin: 0px;
    padding: 0px;
    border: none;
    outline: none;
    box-sizing: border-box;
    background-color: #ffffff;   /* 背景の色 */
    background-image: url('画像アドレス');   /* 実際の画像アドレスを指定 */
    background-size: cover;           /* 画面にフィットさせる */
    background-repeat: no-repeat;     /* 繰り返さない */
    background-attachment: fixed;     /* 背景を固定（※スマホでは後述で解除） */
}

/* ==========================
   headerタグに適用
========================== */
header {
  background-image: url('画像アドレス');   /* 実際の画像アドレスを指定 */
  height: 100px;                  /* 画像の高さ */
  width: 100%;                   /* 画像の幅 */
  padding: 10px 10px 100px;      /* 上:10px、左右:10px、下:100px の余白 */
  margin: 20px 0px 0px;          /* 上:20pxの余白 */
  background-size: cover;        /* 背景画像を全体に広げる */
  background-position: center;   /* 画像を中央に表示 */
}

/* ==========================
   h1タグに適用
========================== */
h1 {
  color: #000000;               /* 文字の色 */
  background-color: #ffff00;    /* 背景の色 */
  font-size: 90px;              /* 文字のサイズ */
  border-style: solid;          /* 枠線の形 */
  border-color: orange;         /* 枠線の色 */
  border-width: 10px;           /* 枠線の太さ */
  border-bottom: 10px solid #3388dd;   /* 下線の太さと色 */
  text-align: center;           /* 文字の位置（中央） */
  border-radius: 90px;          /* 枠線のカーブ */
  padding: 10px 10px 10px;      /* 余白（上下左右） */
  margin: 20px 0px 0px;         /* 上:20pxの余白 */
  font-family: 'Lobster', cursive; /* フォント指定（Google Fontsで読み込み必要） */
  word-break: break-word;       /* 長い単語で折り返す */
}

/* ==========================
   h2タグに適用
========================== */
h2 {
  padding: 0.4em 0.5em;         /* 文字の上下・左右の余白 */
  color: #000000;               /* 文字色 */
  background: #f4f4f4;          /* 背景色 */
  border-left: solid 5px #7db4e6;   /* 左線 */
  border-bottom: solid 3px #d7d7d7; /* 下線 */
  font-size: 25px;              /* 文字サイズ */
}

/* ==========================
   スマホ画面（600px以下）対応
========================== */
@media screen and (max-width: 600px) {
  
  /* headerの高さや余白を調整 */
  header {
    height: auto;               /* 高さを内容に合わせる */
    padding: 20px 10px;         /* 上下20px, 左右10pxの余白 */
    margin: 10px 0 0;           /* 上マージン調整 */
  }

  /* h1の文字サイズ・余白を縮小 */
  h1 {
    font-size: 36px;            /* 小さくする */
    border-width: 5px;          /* 枠線を細く */
    border-bottom: 5px solid #3388dd;  /* 下線も細く */
    border-radius: 30px;        /* 丸みを小さく */
    padding: 10px;              /* 余白調整 */
    margin: 10px 10px;          /* 上下左右のマージン調整 */
  }

  /* h2の文字サイズを縮小 */
  h2 {
    font-size: 20px;            /* 少し小さめに */
    padding: 0.3em 0.5em;       /* 余白微調整 */
  }

  /* 背景画像の固定を解除 */
  body {
    background-attachment: scroll;  /* 背景が一緒にスクロールするように */
  }
}

`;
        } else if (type === 'js') {
            return `/* ${name} */
/*コードを入力してください*/
`;
        } else if (type === 'json') {
            return `{
    "name": "index",
    "short_name": "略称",
    "start_url": "./index.html",
    "display": "standalone",
    "background_color": "#ffffff",
    "theme_color": "#333333",
    "description": "アプリの説明",
    "icons": [
    {
        "src": "icon.png",
        "sizes": "192x192",
        "type": "image/png"
    },
    {
        "src": "icon.png",
        "sizes": "512x512",
        "type": "image/png"
    }
    ]
}`;
        }
        return '';
    }
    
    // ----------------------------------------------------
    // 🌟 3.5. Undo/Redo コア関数 (新規追加)
    // ----------------------------------------------------
    
    /**
     * Undo/Redoボタンの有効/無効状態を更新する
     */
    function updateUndoRedoButtons() {
        if (undoBtn) undoBtn.disabled = (historyPointer <= 0);
        if (redoBtn) redoBtn.disabled = (historyPointer >= history.length - 1);
    }

    /**
     * 現在のエディタの内容を履歴に保存し、ポインターを更新する
     */
    function saveState() {
        // 画像ファイルなど、テキスト編集不可のファイルが開かれている場合はスキップ
        if (activeFile && files[activeFile] && files[activeFile].type === 'img') {
            return;
        }
        
        const currentState = codeInput.value;

        // 現在のポインターより後の履歴を破棄（Redo後の新規入力に対応）
        if (historyPointer < history.length - 1) {
            history = history.slice(0, historyPointer + 1);
        }

        // 最後の状態と異なるときだけ保存
        if (history.length > 0 && history[history.length - 1] === currentState) {
            updateUndoRedoButtons();
            return;
        }

        // 履歴に追加
        history.push(currentState);
        historyPointer++;

        // 履歴が最大サイズを超えた場合、一番古いものを削除
        if (history.length > MAX_HISTORY_SIZE) {
            history.shift();
            historyPointer--;
        }

        updateUndoRedoButtons();
    }
    
    /**
     * Undo操作
     */
    function performUndo() {
        if (historyPointer > 0) {
            historyPointer--;
            codeInput.value = history[historyPointer];
            // プレビューと行番号を更新
            updatePreview();
            updateUndoRedoButtons();
        }
    }

    /**
     * Redo操作
     */
    function performRedo() {
        if (historyPointer < history.length - 1) {
            historyPointer++;
            codeInput.value = history[historyPointer];
            // プレビューと行番号を更新
            updatePreview();
            updateUndoRedoButtons();
        }
    }

// 3.6. シンタックス/検索ハイライト関数 (修正後)

/**
 * HTML特殊文字をエスケープする
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    // 改行を<br>タグに変換する処理を削除し、純粋なエスケープのみを行う
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
}

/**
 * ハイライトレイヤー (DOM.highlightLayer) の内容を更新する
 */
function updateHighlightLayer() {
    if (files[activeFile] && files[activeFile].type === 'img') {
        DOM.highlightLayer.textContent = '';
        return;
    }
    
    const content = DOM.codeInput.value;
    let highlightedHtml = ''; 
    let lastIndex = 0;

    // 検索マッチがない、または検索バーが非表示の場合は、エスケープされたコンテンツをそのまま表示
    if (searchMatches.length === 0 || DOM.searchBar.style.display === 'none') {
        // 🌟 修正: 改行を <br> に変換する処理を削除。CSSの white-space: pre-wrap; に依存させる
        DOM.highlightLayer.innerHTML = escapeHtml(content); 
        DOM.highlightLayer.scrollTop = DOM.codeInput.scrollTop;
        return;
    }
    
    // --- 検索ハイライトのロジックを適用する ---
    searchMatches.forEach((match, index) => {
        // マッチしていない部分を追加 (HTMLエスケープ必須)
        highlightedHtml += escapeHtml(content.substring(lastIndex, match.start));

        // マッチした部分を<mark>タグで囲む
        const isCurrent = index === currentMatchIndex;
        const matchText = escapeHtml(content.substring(match.start, match.end));

        highlightedHtml += `<mark class="search-match ${isCurrent ? 'current-match' : ''}">${matchText}</mark>`;
        lastIndex = match.end;
    });

    // 最後のマッチ以降の残りのテキストを追加
    highlightedHtml += escapeHtml(content.substring(lastIndex));

    // 🌟 修正: 改行を <br> に変換する処理を削除
    DOM.highlightLayer.innerHTML = highlightedHtml; 

    // スクロール同期
    DOM.highlightLayer.scrollTop = DOM.codeInput.scrollTop;
}
    
    /**
     * 行番号を更新する (簡易版)
     */
    function updateLineNumbers() {
        const lineCount = DOM.codeInput.value.split('\n').length;
        DOM.lineNumberDiv.innerHTML = Array(lineCount).fill(0).map((_, i) => `<div>${i + 1}</div>`).join('');
        // スクロール同期
        DOM.lineNumberDiv.scrollTop = DOM.codeInput.scrollTop;
    }

    // ------------------------------------
    // 4. ファイル操作関数
    // ------------------------------------

    /**
     * すべてのファイルデータとファイル名をローカルストレージに保存
     */
    function saveAll() {
        if (activeFile && files[activeFile] && files[activeFile].type !== 'img') {
            files[activeFile].content = codeInput.value;
        }

        localStorage.setItem('all_files_state', JSON.stringify(files));
        localStorage.setItem('active_file_name', activeFile);
    }

    /**
     * 新しいファイルをfilesオブジェクトに追加/上書きする
     */
    function addNewFile(type, name, content = '', overwrite = false) {
        if (files[name] && overwrite) {
            files[name].content = content;
            files[name].type = type;
            return name;
        }

        let finalName = name;
        let counter = 1;
        while (files[finalName]) {
            const lastDot = name.lastIndexOf('.');
            const base = lastDot > 0 ? name.substring(0, lastDot) : name;
            const ext = lastDot > 0 ? name.substring(lastDot) : '.' + type;

            finalName = `${base}(${counter})${ext}`;
            counter++;
        }

        files[finalName] = {
            type: type,
            content: content,
            history: [content], 
        historyPointer: 0
        };
        return finalName;
    }

    /**
     * ZIPエクスポート機能 (JSZipに依存)
     */
    function exportData() {
        saveAll();

        if (typeof JSZip === 'undefined') {
            showMessage("ZIPエクスポートに必要なJSZipライブラリが利用できません。");
            return;
        }

        const zip = new JSZip();

        Object.keys(files).forEach(filename => {
            const file = files[filename];
            
            if (file.type === 'img') {
                const dataUrlParts = file.content.split(',');
                if (dataUrlParts.length === 2) {
                    const base64Data = dataUrlParts[1];
                    zip.file(filename, base64Data, { base64: true });
                    return;
                }
                console.warn(`画像ファイル ${filename} のData URL形式が不正です。スキップしました。`);
                return;
            }
            
            zip.file(filename, file.content);
        });

        zip.generateAsync({ type: "blob" })
            .then(function(content) {
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'project.zip';

                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                URL.revokeObjectURL(url);
                showMessage("プロジェクトをZIPファイルとしてエクスポートしました。");
            })
            .catch(error => {
                console.error('ZIP生成エラー:', error);
                showMessage('ファイルのZIPエクスポート中にエラーが発生しました。');
            });
    }

    /**
     * ZIPまたは個別ファイルのインポート機能
     */
    function importData(event) {
        const selectedFiles = event.target.files;
        if (selectedFiles.length === 0) return;

        if (!window.confirm('現在の編集内容に、選択したファイルの内容を**追加・マージ**しますか？（ファイル名が重複する場合、そのファイルの内容は**上書き**されます。）')) {
            event.target.value = '';
            return;
        }

        const isZipImport = selectedFiles.length === 1 && selectedFiles[0].name.toLowerCase().endsWith('.zip');
        const newFiles = {};
        let importPromise;

        if (isZipImport) {
            if (typeof JSZip === 'undefined') {
                showMessage("ZIPインポートに必要なJSZipライブラリが利用できません。");
                event.target.value = '';
                return;
            }

            const file = selectedFiles[0];
            importPromise = JSZip.loadAsync(file)
                .then(zip => {
                    const filePromises = [];
                    zip.forEach((relativePath, zipEntry) => {
                        const filename = relativePath.split('/').pop();
                        if (!filename) return;

                        const type = getFileTypeFromFilename(filename);
                        if (zipEntry.dir || type === 'other') return;
                        
                        if (type === 'img') {
                            filePromises.push(
                                zipEntry.async("base64").then(content => {
                                    const mimeType = zipEntry.name.split('.').pop() === 'svg' ? 'image/svg+xml' : `image/${zipEntry.name.split('.').pop()}`;
                                    newFiles[filename] = { type, content: `data:${mimeType};base64,${content}` };
                                })
                            );
                        } else {
                            filePromises.push(
                                zipEntry.async("text").then(content => {
                                    newFiles[filename] = { type, content };
                                })
                            );
                        }
                    });
                    return Promise.all(filePromises);
                });
        } else {
            const filePromises = [];
            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i];
                const type = getFileTypeFromFilename(file.name);

                if (type === 'other') {
                    console.warn(`ファイル ${file.name} はサポートされていないファイルタイプのためスキップされました。`);
                    continue;
                }
                
                if (type === 'img') {
                    filePromises.push(new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            newFiles[file.name] = { type, content: e.target.result };
                            resolve();
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    }));
                } else {
                    filePromises.push(
                        file.text().then(content => {
                            newFiles[file.name] = { type, content };
                        })
                    );
                }
            }
            importPromise = Promise.all(filePromises);
        }

        importPromise
            .then(() => {
                if (Object.keys(newFiles).length === 0) {
                    throw new Error('有効なファイルが見つかりませんでした。');
                }

                saveAll(); 

                let addedOrOverwrittenCount = 0;
                let newHtmlFile = null;
                let importedFileToActivate = null;

                Object.keys(newFiles).forEach(name => {
                    const file = newFiles[name];
                    const finalName = addNewFile(file.type, name, file.content, true);

                    if (finalName === name) {
                        addedOrOverwrittenCount++;
                        if (file.type === 'html') {
                            newHtmlFile = finalName;
                        }
                        importedFileToActivate = finalName;
                    }
                });

                let activeAfterMerge = newHtmlFile || importedFileToActivate || activeFile;
                if (!activeAfterMerge || !files[activeAfterMerge]) {
                    activeAfterMerge = Object.keys(files).find(name => files[name].type === 'html') || Object.keys(files)[0];
                }

                if (addedOrOverwrittenCount > 0) {
                    localStorage.setItem('all_files_state', JSON.stringify(files));
                    initialize(activeAfterMerge);

                    let message = `プロジェクトファイルが正常に追加・マージされました。 (${addedOrOverwrittenCount}ファイル)`;
                    if (isZipImport) message = `ZIPファイルが正常にインポートされました。 (${addedOrOverwrittenCount}ファイル)`;

                    showMessage(message);
                } else {
                    throw new Error('インポートファイル内に有効なHTML、CSS、JS、またはJSONファイルが見つかりませんでした。');
                }
            })
            .catch(error => {
                console.error('インポートエラー:', error);
                showMessage('ファイルのインポート中にエラーが発生しました。' + (error.message || ''), 5000);
            })
            .finally(() => {
                event.target.value = '';
            });
    }
/**
 * ファイル名を変更し、filesオブジェクトのキーとUIを更新する
 */
function renameFile(oldName, newName) {
    // 1. バリデーション
    if (!oldName || !newName || oldName === newName) {
        return false;
    }
    if (!files[oldName]) {
        showMessage(`ファイル「${oldName}」は見つかりませんでした。`, 5000);
        return false;
    }
    if (files[newName]) {
        showMessage(`新しいファイル名「${newName}」は既に存在します。`, 5000);
        return false;
    }

    // 2. filesオブジェクトのキーを更新
    // 古いファイルデータを取得
    const fileData = files[oldName];
    // 新しいキーでファイルを保存
    files[newName] = fileData;
    // 古いキーのファイルを削除
    delete files[oldName];

    // 3. activeFileの更新
    if (activeFile === oldName) {
        activeFile = newName;
    }

    // 4. UIの更新
    // a. ファイル名入力欄の更新
    if (DOM.filenameInput.value === oldName) {
        DOM.filenameInput.value = newName;
    }
    
    // b. タブUI全体の再描画
    renderTabs(); 

    // c. データの保存
    saveAll();
    
    showMessage(`ファイル名が「${oldName}」から「${newName}」に変更されました。`);
    return true;
}
    // ------------------------------------
    // 5. UI/タブ操作関数
    // ------------------------------------
    
    // ハンバーガーメニューの切り替えロジック
    if (fileMenuToggle && fileTabsMenuContainer) {
        fileMenuToggle.addEventListener('click', () => {
             fileTabsMenuContainer.classList.toggle('is-open');
             
             const icon = fileMenuToggle.querySelector('i');
             if (icon) {
                 if (fileTabsMenuContainer.classList.contains('is-open')) {
                     icon.classList.remove('fa-bars');
                     icon.classList.add('fa-times');
                 } else {
                     icon.classList.remove('fa-times');
                     icon.classList.add('fa-bars');
                 }
             }
        });
    }

    // タブクリックでメニューを閉じる（イベント委譲）
    if (fileTabs && fileTabsMenuContainer) {
        fileTabs.addEventListener('click', (e) => {
            if (e.target.closest('.tab-button')) {
                fileTabsMenuContainer.classList.remove('is-open');
                
                const icon = fileMenuToggle.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            }
        });
    }

    /**
     * タブUI全体を再構築する
     */
    function renderTabs() {
        if (!fileTabs) return;
        fileTabs.innerHTML = '';

        const htmlFileCount = Object.values(files).filter(f => f.type === 'html').length;

        const sortedFiles = Object.keys(files)
            .sort((a, b) => {
                const typeA = files[a].type;
                const typeB = files[b].type;
                return FILE_TYPES_ORDERED.indexOf(typeA) - FILE_TYPES_ORDERED.indexOf(typeB);
            });

        sortedFiles.forEach(filename => {
            const file = files[filename];
            const button = document.createElement('button');
            button.className = 'tab-button';
            button.textContent = filename;

            if (filename === activeFile) {
                button.classList.add('active');
            }

            button.addEventListener('click', () => {
                switchFile(filename);
            });

            const deleteIcon = document.createElement('i');
            deleteIcon.className = 'fas fa-times delete-icon';
            deleteIcon.style.marginLeft = '5px';
            deleteIcon.onclick = (e) => {
                e.stopPropagation();
                deleteFile(filename);
            };

            const canDelete = file.type !== 'html' || (file.type === 'html' && htmlFileCount > 1);

            if (canDelete) {
                button.appendChild(deleteIcon);
            }

            fileTabs.appendChild(button);
        });

        const addButton = document.createElement('button');
        addButton.className = 'tab-button add-file-button';
        addButton.innerHTML = '<i class="fas fa-plus"></i> Add File';
        addButton.addEventListener('click', showAddFileDialog);
        fileTabs.appendChild(addButton);

        filenameInput.value = activeFile || '';
    }

    /**
     * ファイルを追加するためのダイアログを表示（ファイルタイプをプルダウン選択式に改良）
     */
    function showAddFileDialog() {
        // 画像ファイルはインポート機能から追加するため、ここでは除外
        const availableTypes = ['html', 'css', 'js', 'json'];

        // 1. ファイルタイプを選択/入力 (カスタムダイアログに置き換え)
        getFileTypeFromDialog(availableTypes)
            .then(type => {
                if (!type) return; // キャンセルされた場合

                // 2. ファイル名の入力を促す (プロンプトはそのまま利用)
                const ext = type === 'html' ? '.html' :
                            type === 'css' ? '.css' :
                            type === 'js' ? '.js' :
                            type === 'json' ? '.json' : '';

                let baseName = prompt(`新しい ${type} ファイルの**基本名**を入力してください: (例: custom)`, `custom`);
                if (!baseName) return; // キャンセルされた場合

                baseName = baseName.trim();
                if (baseName.length === 0) {
                    showMessage("ファイル名が空です。");
                    return;
                }

                // 拡張子を含んでいる場合は除去して基本名にする (例: index.html -> index)
                if (baseName.toLowerCase().endsWith(ext)) {
                    baseName = baseName.substring(0, baseName.length - ext.length);
                }

                // 最終的なファイル名
                const finalName = baseName + ext;

                // 3. ファイルの追加処理
                saveAll();

                const newFilename = addNewFile(type, finalName, getInitialContent(type, finalName), false);

                if (files[finalName] && newFilename !== finalName) {
                    showMessage(`ファイル名「${finalName}」は既に使用されていたため、「${newFilename}」として追加されました。`);
                } else {
                    showMessage(`ファイル「${newFilename}」が追加されました。`);
                }

                renderTabs();
                switchFile(newFilename);
            })
            .catch(error => {
                console.error(error);
                showMessage('ファイルタイプ選択ダイアログの表示中にエラーが発生しました。');
            });
    }

    // -------------------------------------------------------------
    // 【新規追加関数】カスタムダイアログの実装
    // -------------------------------------------------------------

    function getFileTypeFromDialog(availableTypes) {
        return new Promise((resolve) => {
            // プルダウンのオプションHTMLを生成
            const optionsHtml = availableTypes.map(type => 
                `<option value="${type}">${type.toUpperCase()} (.${type})</option>`
            ).join('');

            // ダイアログのHTML構造
            const dialogHtml = `
                <div id="fileTypeModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; justify-content: center; align-items: center;">
                    <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 300px;">
                        <h3>ファイル種類の選択</h3>
                        <label for="fileTypeSelect">追加するファイルの**種類**を選択してください:</label>
                        <select id="fileTypeSelect" style="width: 100%; padding: 8px; margin: 10px 0; border: 1px solid #ccc; border-radius: 4px;">
                            <option value="" disabled selected>-- 選択してください --</option>
                            ${optionsHtml}
                        </select>
                        <div style="text-align: right; margin-top: 15px;">
                            <button id="cancelBtn" style="padding: 8px 15px; margin-right: 10px; border: none; background: #ccc; border-radius: 4px; cursor: pointer;">キャンセル</button>
                            <button id="okBtn" style="padding: 8px 15px; border: none; background: #007bff; color: white; border-radius: 4px; cursor: pointer;" disabled>OK</button>
                        </div>
                    </div>
                </div>
            `;

            // DOMにダイアログを追加
            document.body.insertAdjacentHTML('beforeend', dialogHtml);
            const modal = document.getElementById('fileTypeModal');
            const select = document.getElementById('fileTypeSelect');
            const okBtn = document.getElementById('okBtn');
            const cancelBtn = document.getElementById('cancelBtn');

            // 選択値の変更イベント
            select.addEventListener('change', () => {
                okBtn.disabled = select.value === "";
            });

            // OKボタンのクリック処理
            okBtn.addEventListener('click', () => {
                const selectedType = select.value;
                modal.remove(); // ダイアログを閉じる
                resolve(selectedType);
            });

            // キャンセルボタンのクリック処理
            cancelBtn.addEventListener('click', () => {
                modal.remove(); // ダイアログを閉じる
                resolve(null); // キャンセルとしてnullを返す
            });
        });
    }

    /**
     * ファイルの切り替え処理 (データとUIの更新)
     */
    function switchFile(filename) {
        saveAll();

        if (filename === activeFile) return;

        activeFile = filename;
        const file = files[filename];

        // エディタコンテナと画像プレビューコンテナを取得（または作成）
        const editorContainer = codeInput.parentElement;
        let imagePreviewDiv = document.getElementById('image-preview-container');

        // 既存のプレビューコンテナを削除
        if (imagePreviewDiv) {
            editorContainer.removeChild(imagePreviewDiv);
            imagePreviewDiv = null;
        }
        
        // 常にcodeInputを一旦表示状態にする
        codeInput.style.display = 'block';
        lineNumberDiv.style.display = 'block'; // 行番号も表示に戻す
        
        // searchBarが開いていたら閉じる
        if (searchBar && searchBar.style.display !== 'none') {
            toggleSearchBar();
        }
        
        // 🌟 ファイル切り替え時に履歴をクリアし、新しいファイルの状態を保存する
        history = [];
        historyPointer = -1;

        if (file) {
            if (file.type === 'img') {
                
                // ----------------------------------------------------
                // 🌟 画像ファイルの場合の処理 (画像プレビュー機能)
                // ----------------------------------------------------
                
                codeInput.value = `// [画像ファイル]: ${filename}\n// 画像ファイルはエディタで編集できません。\n// プレビューで確認してください。\n// ファイルサイズ: ${(file.content.length / 1024).toFixed(2)} KB (DataURL)`;
                filenameInput.value = filename;
                filenameInput.disabled = true;
                
                // codeInputと行番号を非表示にする
                codeInput.style.display = 'none';
                lineNumberDiv.style.display = 'none';
                
                // 画像プレビュー用のDIVを作成し、codeInputの親に追加
                imagePreviewDiv = document.createElement('div');
                imagePreviewDiv.id = 'image-preview-container';
                imagePreviewDiv.style.cssText = 'width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; background-color: #333; overflow: auto;';
                
                const imageElement = document.createElement('img');
                imageElement.src = file.content; // Data URLをそのまま使用
                imageElement.alt = filename;
                imageElement.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain; box-shadow: 0 0 10px rgba(0,0,0,0.5);';

                imagePreviewDiv.appendChild(imageElement);
                editorContainer.appendChild(imagePreviewDiv);

            } else if (file.content !== undefined) {
                // ----------------------------------------------------
                // 🌟 通常のテキストファイルの場合の処理
                // ----------------------------------------------------
                codeInput.value = file.content;
                filenameInput.value = filename;
                filenameInput.disabled = false;
            } else {
                codeInput.value = '';
                filenameInput.value = filename;
                filenameInput.disabled = false;
            }
        } else {
            codeInput.value = '';
            filenameInput.value = '';
            filenameInput.disabled = false;
        }

        renderTabs();

        const codeContentDiv = document.getElementById('code-content');
        if (codeContentDiv) {
            const fileTypeClass = file ? file.type : 'other';
            codeContentDiv.className = 'tab-content active code-type-' + fileTypeClass;
        }

        // 新しいファイルの内容を最初の履歴として保存
        saveState();
        
        updatePreview();
        if (file && file.type !== 'img') {
            codeInput.focus();
        }
    }

    /**
     * ファイルを削除する
     */
    function deleteFile(filename) {
        const file = files[filename];

        if (file.type === 'html') {
            const htmlFileCount = Object.values(files).filter(f => f.type === 'html').length;

            if (htmlFileCount <= 1) {
                showMessage("プロジェクトには最低1つのHTMLファイルが必要です。削除できません。");
                return;
            }
        }

        if (!window.confirm(`ファイル「${filename}」を削除しますか？`)) return;

        delete files[filename];

        if (activeFile === filename) {
            const nextActiveFile = Object.keys(files).find(name => files[name].type === 'html') || Object.keys(files)[0];
            
            // プレビューコンテナのクリーンアップを追加
            const imagePreviewDiv = document.getElementById('image-preview-container');
            if (imagePreviewDiv && imagePreviewDiv.parentElement) {
                imagePreviewDiv.parentElement.removeChild(imagePreviewDiv);
            }
            codeInput.style.display = 'block'; // エディタを再表示
            lineNumberDiv.style.display = 'block'; // 行番号を再表示

            if (!nextActiveFile) {
                // initializeDefaultFiles(); // 定義がないためコメントアウト
                // initialize();            // 定義がないためコメントアウト
                
                // ファイルがなくなった場合の暫定的な処理
                activeFile = null;
                codeInput.value = '';
                filenameInput.value = '';
                renderTabs();
                updatePreview();
                return;
            }
            switchFile(nextActiveFile);
        } else {
            saveAll();
            renderTabs();
            updatePreview();
        }

        showMessage(`ファイル「${filename}」が削除されました。`);
    }
    
    /**
     * メニューが開いているときに右クリックメニューの表示をキャンセルする
     */
    function preventContextMenu(event) {
        if (fileTabsMenuContainer.classList.contains('is-open')) {
            event.preventDefault();
        }
    }
    
    /**
 * クリックがメニュー要素外で行われた場合にメニューを閉じる
 */
function closeMenuOnClickOutside(event) {
    // 1. メニューが開いていなければ終了
    if (!fileTabsMenuContainer.classList.contains('is-open')) {
        return;
    }

    // 2. クリックされた要素がメニュー内、またはメニューボタン自体であるかを確認
    const isClickInsideMenu = fileTabsMenuContainer.contains(event.target);
    const isClickOnToggle = fileMenuToggle.contains(event.target);

    // 3. メニュー内またはボタン上のクリックなら閉じずに終了
    if (isClickInsideMenu || isClickOnToggle) {
        return;
    }

    // 4. メニューを閉じる
    fileTabsMenuContainer.classList.remove('is-open');

    // 5. アイコンをハンバーガーに戻す
    const icon = fileMenuToggle.querySelector('i');
    if (icon) {
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
    }
}

/**
 * 🌟 メニュー外クリックでメニューを閉じるイベントリスナーをドキュメント全体に登録 🌟
 * タッチデバイスでも動作するように 'click' を使用
 */
if (fileTabsMenuContainer && fileMenuToggle) {
    document.addEventListener('click', closeMenuOnClickOutside);

    // 必要に応じて、モバイルでのタップをより確実に検出するために 'touchstart' も追加できます
    // document.addEventListener('touchstart', closeMenuOnClickOutside);
}
    /**
     * 画面内のクリックが検索バー要素外で行われた場合に検索バーを閉じる (新規追加)
     */
    function closeSearchBarOnClickOutside(event) {
        if (!searchBar || searchBar.style.display !== 'flex') {
            return;
        }

        const isClickInsideSearchBar = searchBar.contains(event.target);
        const isClickOnToggle = searchToggleBtn && searchToggleBtn.contains(event.target);

        if (isClickInsideSearchBar || isClickOnToggle) {
            return;
        }

        // toggleSearchBar(); // toggleSearchBarが未定義のためコメントアウト
    }


    // ------------------------------------
    // 6. プレビュー/コンテンツ/行番号関連関数
    // ------------------------------------

    /**
     * 行番号を更新する
     */
    function updateLineNumbers() {
        if (!codeInput || !lineNumberDiv || codeInput.style.display === 'none') return; // 画像プレビュー時は更新しない
        const lines = codeInput.value.split('\n');
        const lineCount = lines.length;
        const numbers = Array.from({ length: lineCount }, (_, i) => i + 1).join('<br>');
        lineNumberDiv.innerHTML = numbers;
    }

    /**
     * プレビューを更新する (複数ファイル対応)
     */
    function updatePreview() {
        saveAll();
        updateLineNumbers();

        let targetHtmlFilename = activeFile && files[activeFile] && files[activeFile].type === 'html' ? activeFile : null;
        
        if (!targetHtmlFilename) {
            targetHtmlFilename = Object.keys(files).find(name => files[name].type === 'html');
        }

        if (!targetHtmlFilename) return;

        const htmlCodeOriginal = files[targetHtmlFilename].content;
        const previewingFilename = targetHtmlFilename;
        
        let htmlCode = htmlCodeOriginal;
        let finalCss = '';
        let finalJs = '';
        let alertHtml = '';

        let htmlWarning = '';
        if (activeFile !== previewingFilename && files[activeFile] && files[activeFile].type !== 'html') {
             htmlWarning = `
             <div id="preview-alert" style="background: #e0f2fe; border-color: #7dd3fc; color: #0369a1; padding: 10px; margin-bottom: 10px; font-size: 12px; border-radius: 4px;">
                 <strong>[情報]:</strong> エディタは**${activeFile}**を開いていますが、プレビューはHTMLファイルである**${previewingFilename}**の内容を表示しています。
             </div>
             `;
        }


        Object.keys(files).forEach(filename => {
            const file = files[filename];
            const escapedName = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            let isLinked = false;
            let warningText = '';

            if (file.type === 'css') {
                const regex = new RegExp(`<link[^>]*rel=["']?stylesheet["']?[^>]*href=["']?${escapedName}["']?[^>]*>`, 'i');
                isLinked = regex.test(htmlCode);
                if (isLinked) finalCss += file.content + '\n';
                else warningText = `<strong>[警告]:</strong> ${filename} はHTMLにリンクされていません。`;
                
            } else if (file.type === 'js') {
                const regex = new RegExp(`<script[^>]*src=["']?${escapedName}["']?[^>]*>[\s\S]*?<\/script>`, 'i');
                isLinked = regex.test(htmlCode);
                if (isLinked) finalJs += file.content + '\n';
                else warningText = `<strong>[警告]:</strong> ${filename} はHTMLにリンクされていません。`;

            } else if (file.type === 'json') {
                const regex = new RegExp(`<link[^>]*rel=["']?manifest["']?[^>]*href=["']?${escapedName}["']?[^>]*>`, 'i');
                isLinked = regex.test(htmlCode);
                if (!isLinked) warningText = `<strong>[警告]:</strong> ${filename} (マニフェスト) はHTMLにリンクされていません。`;
                
            } else if (file.type === 'img') {
                const imgRegex = new RegExp(`(<img[^>]*src=["']?)(${escapedName})(["'][^>]*>)`, 'gi');
                if (imgRegex.test(htmlCode)) {
                    htmlCode = htmlCode.replace(imgRegex, `$1${file.content}$3`);
                    isLinked = true;
                }

                // CSSや他の場所で参照されている可能性もあるが、ここではimgタグのみをチェック
                if (!isLinked) {
                    warningText = `<strong>[情報]:</strong> ${filename} はHTML内の <code>&lt;img src="..."&gt;</code> で参照されていません。`;
                }
            }

            if (warningText) {
                // (省略された警告メッセージの構築ロジック)
            }
        });
        
        // (プレビューコンテンツの構築ロジックの続き)
        const finalContent = `
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Preview</title>
                <style>
                    /* 警告メッセージ用のスタイル */
                    #preview-alert-container {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        z-index: 99999;
                        padding: 10px;
                        pointer-events: none;
                    }
                    /* 統合されたCSS */
                    ${finalCss}
                </style>
            </head>
            <body>
                ${htmlWarning}
                <div id="preview-content">
                    ${htmlCode.replace(/<\/head>|<body>/i, '').replace(/<link[^>]*>|<script[^>]*>|<\/body>|<\/html>/gi, '')}
                </div>
                <script>
                    ${finalJs}
                </script>
            </body>
            </html>
        `;

        if (previewIframe) {
            previewIframe.srcdoc = finalContent;
        }

    }
    
     // ------------------------------------
    // 7. 検索機能の関数
    // ------------------------------------
    
    /**
     * 検索バーの表示/非表示を切り替え、状態をリセットする
     * @param {boolean} forceClose - trueの場合、強制的に閉じる
     */
    function toggleSearchBar(forceClose = false) {
        const isVisible = searchBar.style.display === 'flex';

        if (isVisible && !forceClose) {
             // 既に開いている場合は閉じる
             searchBar.style.display = 'none';
        } else if (!isVisible && !forceClose) {
             // 閉じていたら開く
             searchBar.style.display = 'flex';
             searchInput.focus();
             // 前回検索結果があれば再ハイライト
             if (searchMatches.length > 0) {
                 highlightMatches();
             } else if (searchInput.value) {
                 // 検索語が残っていたら再検索
                 performSearch();
             } else {
                 searchResultCount.textContent = '';
             }
             return;
        }
        
        // 閉じる場合、検索状態をリセットしハイライトを削除
        if (isVisible || forceClose) {
            searchBar.style.display = 'none';
            searchInput.value = '';
            searchMatches = [];
            currentMatchIndex = -1;
            searchResultCount.textContent = '';
            deleteHighlights(); 
        }
    }
    
    /**
     * 検索テキストをエディタ内でハイライトする処理
     */
    function performSearch() {
        if (!activeFile || files[activeFile].type === 'img') return;
        
        deleteHighlights();

        const searchTerm = searchInput.value;
        originalText = codeInput.value;
        searchMatches = [];
        currentMatchIndex = -1;

        if (!searchTerm || searchTerm.length < 1) {
            searchResultCount.textContent = '';
            return;
        }

        const regex = new RegExp(searchTerm.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
        let match;

        while ((match = regex.exec(originalText)) !== null) {
            searchMatches.push({
                start: match.index,
                length: match[0].length
            });
        }
        
        // 結果が見つかった場合
        if (searchMatches.length > 0) {
            currentMatchIndex = 0; // 最初の結果を選択
            highlightMatches();
            scrollToMatch(currentMatchIndex);
        }

        searchResultCount.textContent = `${searchMatches.length}件の結果`;
        
        // ボタンの有効/無効を更新
        searchNextBtn.disabled = searchMatches.length === 0;
        searchPrevBtn.disabled = searchMatches.length === 0;
    }
    
    /**
     * 検索結果をDOMでハイライトし、現在選択中のものをマークする
     */
    function highlightMatches() {
        if (!editorWrapper || files[activeFile].type === 'img') return;
        
        // ハイライトのためにエディタを隠し、プリタグを作成
        deleteHighlights(); 
        
        const text = codeInput.value;
        let highlightedHtml = '';
        let lastIndex = 0;

        searchMatches.forEach((match, index) => {
            const isCurrent = index === currentMatchIndex;
            const className = isCurrent ? 'highlight-match current-match' : 'highlight-match';

            // 前の部分のテキストを追加
            highlightedHtml += text.substring(lastIndex, match.start);
            
            // ハイライトされた部分のテキストを追加
            highlightedHtml += `<span class="${className}">${text.substring(match.start, match.start + match.length)}</span>`;

            lastIndex = match.start + match.length;
        });

        highlightedHtml += text.substring(lastIndex);
        
        // codeInputを非表示にして、その上にハイライトを表示する
        const highlightLayer = document.createElement('pre');
        highlightLayer.id = 'highlight-layer';
        highlightLayer.className = 'highlight-layer';
        highlightLayer.innerHTML = highlightedHtml;
        
        // CSSでcodeInputとハイライトレイヤーを重ねる設定が前提
        editorWrapper.insertBefore(highlightLayer, codeInput); 
        codeInput.style.color = 'transparent'; // テキストを透明にする
        codeInput.style.caretColor = 'black'; // カーソルは黒のまま
        
        // スクロールを同期させる (ハイライトレイヤーをcodeInputのスクロール位置に合わせる)
        highlightLayer.scrollTop = codeInput.scrollTop;
        
        updateCurrentMatchIndicator();
    }
    /**
 * 現在の検索インデックスに基づいて、textareaの選択範囲を更新しハイライトする
 */
function updateSearchHighlight() {
    // 古いハイライトを削除（この機能では不要だが、クリア処理として機能）
    if (searchMatches.length === 0 || currentMatchIndex === -1) {
        codeInput.setSelectionRange(0, 0); // 選択を解除
        searchResultCount.textContent = '0 results';
        return;
    }

    const currentMatch = searchMatches[currentMatchIndex];
    
    // 現在の検索結果の番号を更新
    searchResultCount.textContent = `${currentMatchIndex + 1}/${searchMatches.length} 件の結果`;

    // textareaの選択範囲を設定し、ハイライトとして表示
    // 選択範囲はハイライトされた状態で、カーソル位置は終了位置に移動します
    codeInput.setSelectionRange(currentMatch.start, currentMatch.end);
}

/**
 * 該当する検索結果の位置までスクロールする
 */
function scrollToMatch(match) {
    // 選択範囲を設定することで、ブラウザが自動的にその位置までスクロールしてくれるはずです。
    // 明示的なスクロールが必要な場合は、ここでコードを追加します。
    // 例: codeInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // もしくは、行番号を計算してスクロール位置を調整します。
    
    // 現状はシンプルな選択範囲設定で、ブラウザの自動スクロールに期待します。
}
    /**
     * すべてのハイライトを削除し、エディタを元に戻す
     */
    function deleteHighlights() {
        
        if (highlightLayer) {
            highlightLayer.remove();
        }
        
        // codeInputのスタイルを元に戻す
        codeInput.style.color = 'inherit';
    }

    /**
     * 現在のハイライトインジケータ（検索結果数表示）を更新
     */
    function updateCurrentMatchIndicator() {
         if (searchMatches.length > 0) {
            searchResultCount.textContent = `${currentMatchIndex + 1}/${searchMatches.length}`;
         } else {
            searchResultCount.textContent = '';
         }
    }
    
    /**
     * エディタをスクロールして現在の検索結果を表示する
     */
    function scrollToMatch(index) {
        if (searchMatches.length === 0 || index < 0 || index >= searchMatches.length) return;

        const match = searchMatches[index];
        const textBeforeMatch = originalText.substring(0, match.start);
        
        // テキストの長さをベースにスクロール位置を推定する
        const linesBefore = textBeforeMatch.split('\n').length - 1;
        const computedStyle = window.getComputedStyle(codeInput);
        // 行の高さを計算 (line-heightが数値の場合、font-size * line-height)
        let lineHeight = parseFloat(computedStyle.lineHeight) || 20; 
        if (computedStyle.lineHeight === 'normal') {
             lineHeight = parseFloat(computedStyle.fontSize) * 1.2; // fallback
        }
        
        // スクロール位置を計算（中央に表示したい場合は調整）
        const targetScrollTop = linesBefore * lineHeight - (codeInput.clientHeight / 2) + (lineHeight / 2);
        
        codeInput.scrollTop = targetScrollTop < 0 ? 0 : targetScrollTop;
    }
    
    /**
     * 次の検索結果に移動する
     */
    function findNext() {
        if (searchMatches.length === 0) return;
        
        // 現在のハイライトをクリア
        deleteHighlights(); 
        
        currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
        
        highlightMatches();
        scrollToMatch(currentMatchIndex);
        updateCurrentMatchIndicator();
    }
    
    /**
     * 前の検索結果に移動する
     */
    function findPrev() {
        if (searchMatches.length === 0) return;

        // 現在のハイライトをクリア
        deleteHighlights(); 
        
        currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;

        highlightMatches();
        scrollToMatch(currentMatchIndex);
        updateCurrentMatchIndicator();
    }


    // ------------------------------------
    // 7. 初期化とイベントリスナーの設定
    // ------------------------------------
    
    // ご提示のコードには initializeDefaultFiles と initialize が定義されていませんが、
    // ここでは初期化ロジックの一部としてダミーを定義します。
    function initializeDefaultFiles() {
        if (Object.keys(files).length === 0) {
            // デフォルトファイルを files に追加する処理をここに記述
            addNewFile('html', DEFAULT_FILENAMES.html, getInitialContent('html', DEFAULT_FILENAMES.html));
            addNewFile('css', DEFAULT_FILENAMES.css, getInitialContent('css', DEFAULT_FILENAMES.css));
            addNewFile('js', DEFAULT_FILENAMES.js, getInitialContent('js', DEFAULT_FILENAMES.js));
            addNewFile('json', DEFAULT_FILENAMES.json, getInitialContent('json', DEFAULT_FILENAMES.json));
        }
    }
    
    function initialize(fileToActivate = null) {
        let loadedFiles = localStorage.getItem('all_files_state');
        if (loadedFiles) {
            files = JSON.parse(loadedFiles);
        }

        initializeDefaultFiles();

        let initialActiveFile = fileToActivate || localStorage.getItem('active_file_name');
        
        if (!initialActiveFile || !files[initialActiveFile]) {
            initialActiveFile = DEFAULT_FILENAMES.html;
        }
        
        switchFile(initialActiveFile);
    }
    // 🌟 検索バーのトグルボタンにイベントを登録
if (searchToggleBtn && searchBar) {
    searchToggleBtn.addEventListener('click', toggleSearchBar);
}

// 🌟 キーボードショートカット (Ctrl/Cmd + F) で検索バーを開閉
document.addEventListener('keydown', (event) => {
    // Ctrl + F (Windows/Linux) または Cmd + F (Mac)
    if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault(); // ブラウザの標準検索を防止
        toggleSearchBar();
    }
});
    // =======================================================
    // 🌟 Undo/Redo/タグ挿入のイベントリスナー設定 (最重要) 🌟
    // =======================================================

    // 1. エディタへの入力イベントを監視し、一定時間後に履歴を保存（デバウンス処理）
    codeInput.addEventListener('input', () => {
    // 1. ファイル内容の更新
    if (activeFile && files[activeFile].type !== 'img') {
        files[activeFile].content = codeInput.value;
    }

    // 2. 自動保存 (リアルタイムでLocalStorageに保存)
    saveAll(); 
    
    // 3. 履歴保存のためのデバウンス
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => {
        saveState(); // 300ms後に入力が止まっていたら履歴に保存
    }, DEBOUNCE_TIME);
    
    // 4. その他の更新処理
    updateLineNumbers();
    updatePreview(); 
    
    // 5. 検索バーが開いている場合は検索もデバウンス
    if (searchBar.style.display !== 'none' && searchInput.value) {
        performSearch(searchInput.value); 
    }
});

    // 2. Undo/Redoボタンに処理を設定
    if (undoBtn) undoBtn.addEventListener('click', performUndo);
    if (redoBtn) redoBtn.addEventListener('click', performRedo);

    // 3. Ctrl+Z / Ctrl+Y のショートカットキーにも対応
    document.addEventListener('keydown', (e) => {
        // エディタにフォーカスがある、またはボタンが押されたときのみ実行
        if (document.activeElement === codeInput || e.target === undoBtn || e.target === redoBtn) {
            // Ctrl/Cmd + Z (Undo)
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault(); 
                performUndo();
            }
            // Ctrl/Cmd + Y または Shift + Ctrl/Cmd + Z (Redo)
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
                e.preventDefault(); 
                performRedo();
            }
        }
    });

    // -------------------------------------------------------------
    // 🌟 タグ挿入関数 (HTMLファイルに定義されていたものをこちらに移管または再定義)
    // -------------------------------------------------------------
    
    // HTMLファイル内の <script> タグで定義されていた insertTag 関数を、
    // Undo/Redoが機能するように修正した上で、こちらに統合します。
    // NOTE: HTMLの <script> タグ内の insertTag は削除してください。

    /**
     * 指定したタグ文字列をコード入力エリアのカーソル位置に挿入する
     * @param {string} tagType - 挿入するタグのタイプ ('img', 'a', 'p', 'div')
     */
    function insertTag(tagType) {
        if (!codeInput) return; 

        let tagToInsert = '';
        let cursorOffset = 0; 

        switch (tagType) {
            case 'img':// imgタグの処理
                tagToInsert = '<img src="画像アドレス" width="200" height="200" alt="説明文">';
                cursorOffset = '<img src="画像アドレス'.length;
                break;
            case 'a':// aタグの処理
                tagToInsert = '<a href=""></a>';
                cursorOffset = '<a href="'.length;
                break;
            case 'p':// pタグの処理
                tagToInsert = '<p></p>';
                cursorOffset = '<p>'.length;
                break;
            case 'div':// divタグの処理
                tagToInsert = '<div style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap;">\n\n</div>';
                cursorOffset = '<div>\n'.length;
                break;
            case 'comment': // コメントタグの処理
                tagToInsert = '<!--コメント-->';
                cursorOffset = '<!--コメン\n'.length;
                break;
            case 'tab': // タブの挿入
                tagToInsert = '    ';
                cursorOffset = '   \n'.length;
                break;
            default:
                return;
        }

        const start = codeInput.selectionStart;
        const end = codeInput.selectionEnd;

        const currentValue = codeInput.value;
        codeInput.value = currentValue.substring(0, start) + tagToInsert + currentValue.substring(end);

        const newCursorPosition = start + cursorOffset;
        codeInput.selectionStart = newCursorPosition;
        codeInput.selectionEnd = newCursorPosition;

        codeInput.focus();
        
        // 🌟【ここが重要】タグ挿入操作後に明示的に履歴を保存する
        saveState(); 
        
        // プレビューも更新する
        updatePreview();
    }
    
    // タグショートカットボタンのイベントリスナー設定 (HTMLから移動)
    const tagButtons = document.querySelectorAll('#tag-shortcut-panel .tag-button');
    tagButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tagType = button.getAttribute('data-tag-type');
            // imgなどのボタンがクリックされたら、↑で定義した insertTag を呼び出す
            insertTag(tagType); 
        });
    });
// 検索トグルボタン (アイコン) のクリックイベント
if (searchToggleBtn) {
    searchToggleBtn.addEventListener('click', () => {
        toggleSearchBar(); // 検索バーの開閉関数を呼び出す
    });
}
    // 検索バーの閉じるボタンにイベントリスナーを追加
if (searchCloseBtn) {
    searchCloseBtn.addEventListener('click', () => {
        toggleSearchBar(); // toggleSearchBarを呼び出して閉じる
    });
}
    // ドキュメント全体でのクリックイベントを登録（検索バー外クリックで閉じるため）
document.addEventListener('click', (e) => {
    // 検索バーが開いていない場合は何もしない
    if (searchBar.style.display !== 'flex') {
        return;
    }

    // クリックされた要素が検索バー内、または検索トグルボタン内のいずれでもない場合
    const isClickInsideSearchBar = searchBar.contains(e.target);
    const isClickOnToggleButton = searchToggleBtn.contains(e.target); // トグルボタン自体をクリックしたときも閉じないようにする

    if (!isClickInsideSearchBar && !isClickOnToggleButton) {
        // 検索バーを閉じる（強制的に閉じるためforceClose=trueは不要、現在のロジックでOK）
        toggleSearchBar(); 
    }
});
    // 🌟 検索機能のイベントリスナー
if (DOM.searchToggleBtn) {
    DOM.searchToggleBtn.addEventListener('click', () => toggleSearchBar());
}
if (DOM.searchCloseBtn) {
    DOM.searchCloseBtn.addEventListener('click', () => toggleSearchBar(true));
}
if (DOM.searchInput) {
    // ユーザーが入力するたびに検索を即座に更新
    DOM.searchInput.addEventListener('input', (e) => {
        performSearch(e.target.value);
    });
    // Enterキーで次の検索結果に移動する
    DOM.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // デフォルトのフォーム送信を防ぐ
            if (e.shiftKey) {
                searchPrev(); // Shift+Enterで前へ
            } else {
                searchNext(); // Enterで次へ
            }
        }
    });
}
if (DOM.searchNextBtn) {
    DOM.searchNextBtn.addEventListener('click', searchNext);
}
if (DOM.searchPrevBtn) {
    DOM.searchPrevBtn.addEventListener('click', searchPrev);
}
    // 🌟 検索機能のイベントリスナー
if (DOM.searchToggleBtn) {
    console.log('✅ searchToggleBtn イベントリスナーを登録しました。'); // 追加
    DOM.searchToggleBtn.addEventListener('click', () => {
        console.log('▶️ searchToggleBtn がクリックされました。'); // 追加
        toggleSearchBar();
    });
} else {
    console.error('❌ searchToggleBtn が見つかりません！IDを確認してください。'); // 追加
}
// ファイル名変更のイベントリスナー
    DOM.filenameInput.addEventListener('change', (e) => {
        // 現在のファイル名 (変更前)
        const oldName = activeFile; 
        // 入力された新しいファイル名 (変更後の値)
        let newName = e.target.value.trim();
        
        if (!oldName) {
            e.target.value = ''; // ファイルがアクティブでない場合はクリア
            return;
        }

        // 新しいファイル名が空でないことを確認
        if (newName.length === 0) {
            showMessage("ファイル名は空にできません。", 3000);
            // 変更を取り消して元の名前に戻す
            e.target.value = oldName; 
            return;
        }

        // 拡張子のチェックと自動補完（オプション）
        // ただし、ユーザーが自由に拡張子を変更したい場合もあるため、厳密なチェックはここでは行わない
        const fileType = files[oldName].type;
        const requiredExt = fileType === 'html' ? '.html' : 
                            fileType === 'css' ? '.css' : 
                            fileType === 'js' ? '.js' : 
                            fileType === 'json' ? '.json' : '';
        
        // 拡張子が変わるとファイルタイプが変わる可能性があるため、シンプルなリネームに留める
        
        renameFile(oldName, newName);
    });

    
    // ------------------------------------
    // 8. その他のイベント設定
    // ------------------------------------

    // ファイル名入力欄の変更を監視
    filenameInput.addEventListener('change', () => {
        // (ファイル名変更ロジックは省略)
    });
    
    // エクスポート/インポート
    exportBtn.addEventListener('click', exportData);
    importFileInput.addEventListener('change', importData);

    // ビュー切り替え
    switchToPreviewBtn.addEventListener('click', () => {
        appContainer.classList.remove('view-editor');
        appContainer.classList.add('view-preview');
        updatePreview();
    });
    switchToEditorBtn.addEventListener('click', () => {
        appContainer.classList.remove('view-preview');
        appContainer.classList.add('view-editor');
    });

    // 行番号のスクロール同期
    if (codeInput && lineNumberDiv) {
        codeInput.addEventListener('scroll', () => {
            lineNumberDiv.scrollTop = codeInput.scrollTop;
        });
    }

    // 初期化処理の実行
    initialize();

});