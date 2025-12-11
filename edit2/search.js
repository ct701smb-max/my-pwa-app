// ------------------------------------
// 検索機能ロジック (search.js) - 最終修正版
// ------------------------------------

// edit2.jsで定義されているグローバル関数/変数に依存
// (showToastNotification, htmlInput, cssInput, jsInput)

const toggleSearchButton = document.getElementById('toggleSearchButton');
const searchFormContainer = document.getElementById('searchFormContainer');
const searchInput = document.getElementById('searchInput');
const searchExecuteButton = document.getElementById('searchExecuteButton'); 

/**
 * すべてのエディターのハイライトをクリアし、元のコードをハイライトコンテナに反映させる。
 * (HTMLエスケープとタブ文字変換により、ズレを防ぎながら同期する)
 */
function clearHighlights() {
    const editorMap = [
        { editor: htmlInput, containerId: 'htmlHighlightContainer' },
        { editor: cssInput, containerId: 'cssHighlightContainer' },
        { editor: jsInput, containerId: 'jsHighlightContainer' }
    ];

    editorMap.forEach(({ editor, containerId }) => {
        const container = document.getElementById(containerId);
        if (container && editor) {
            // 1. HTMLエスケープ処理
            let safeHtml = editor.value.replace(/[&<>"']/g, function(match) {
                if (match === '&') return '&amp;';
                if (match === '<') return '&lt;';
                if (match === '>') return '&gt;';
                if (match === '"') return '&quot;';
                if (match === "'") return '&#39;';
                return match;
            });
            
            // 2. タブ文字を4つのスペースに変換 (横方向ズレ防止)
            safeHtml = safeHtml.replace(/\t/g, '    ');
            
            // ハイライトコンテナにエスケープされたコードを挿入
            container.innerHTML = safeHtml;
        }
    });
}

/**
 * 検索を実行し、結果をハイライト表示する。
 */
function executeSearch() {
    const keyword = searchInput.value.trim();
    
    // 既存のハイライトをクリア (元のテキストに戻す)
    clearHighlights();

    if (keyword === '') {
        showToastNotification("検索キーワードを入力してください。", 1500);
        return;
    }

    // 現在アクティブなタブのエディタを特定
    const activePanel = document.querySelector('.tab-content.active');
    if (!activePanel) {
        showToastNotification("コードエディタータブを開いてから検索してください。", 2000);
        return;
    }

    const activePanelId = activePanel.id;
    let currentEditor = null;
    let highlightContainer = null;
    let editorName = '';
    
    // グローバル変数が定義されていることを前提とする
    if (activePanelId === 'html-panel') {
        currentEditor = htmlInput;
        highlightContainer = document.getElementById('htmlHighlightContainer');
        editorName = 'HTML';
    } else if (activePanelId === 'css-panel') {
        currentEditor = cssInput;
        highlightContainer = document.getElementById('cssHighlightContainer');
        editorName = 'CSS';
    } else if (activePanelId === 'js-panel') {
        currentEditor = jsInput;
        highlightContainer = document.getElementById('jsHighlightContainer');
        editorName = 'JavaScript';
    } else {
        showToastNotification("コードエディタータブがアクティブではありません。", 2000);
        return;
    }

    if (!highlightContainer) return; 

    const content = currentEditor.value;
    
    // 検索キーワード内の特殊文字をエスケープして、正規表現として安全に扱う
    const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
    const regex = new RegExp(safeKeyword, 'gi'); 
    const matches = content.match(regex);
    
    if (matches && matches.length > 0) {
        showToastNotification(`${editorName}内で "${keyword}" が ${matches.length} 件見つかりました。`, 3000);
        
        // 1. 元のテキストを HTML エスケープ
        let highlightedHtml = content.replace(/[&<>"']/g, function(match) {
            if (match === '&') return '&amp;';
            if (match === '<') return '&lt;';
            if (match === '>') return '&gt;';
            if (match === '"') return '&quot;';
            if (match === "'") return '&#39;';
            return match;
        });

        // ⭐ 修正: タブ文字を4つのスペースに変換 (横方向ズレ防止) ⭐
        highlightedHtml = highlightedHtml.replace(/\t/g, '    ');

        // 2. エスケープされた文字列内で検索キーワードをハイライト用の span で囲む
        // ⭐ CSSで black に変更済みのため、インラインスタイルを削除 (クリーンアップ) ⭐
        const highlightReplace = `<span class="highlighted-match">$&</span>`; 
        highlightedHtml = highlightedHtml.replace(new RegExp(safeKeyword, 'gi'), highlightReplace);

        // 3. ハイライトコンテナにHTMLを挿入して表示
        highlightContainer.innerHTML = highlightedHtml;
        
        // 4. 最初の検索結果の位置にスクロール
        scrollToFirstMatch(currentEditor, content, keyword);
        
    } else {
        showToastNotification(`${editorName}内で "${keyword}" は見つかりませんでした。`, 2000);
        // clearHighlights() が既に実行されているため、ハイライトコンテナはリセットされている
    }
}

/**
 * 最初の検索結果の位置にスクロールする補助関数 (textarea用)
 */
function scrollToFirstMatch(textArea, content, keyword) {
    const firstIndex = content.toLowerCase().indexOf(keyword.toLowerCase());
    
    if (firstIndex !== -1) {
        const textBefore = content.substring(0, firstIndex);
        const lineNumber = textBefore.split('\n').length;
        
        // CSSで line-height: 21px が保証されている前提
        const lineHeight = parseInt(getComputedStyle(textArea).lineHeight) || 21; 
        
        // スクロール位置を設定 
        textArea.scrollTop = (lineNumber - 1) * lineHeight;
    }
}

/**
 * エディタとハイライトコンテナ、行番号のスクロールを同期させる。
 */
function syncScroll(textAreaId, highlightContainerId, lineNumberDivId) {
    const textArea = document.getElementById(textAreaId);
    const highlightContainer = document.getElementById(highlightContainerId);
    const lineNumberDiv = document.getElementById(lineNumberDivId);
    
    if (textArea && highlightContainer) {
        // 垂直スクロールと水平スクロールの両方を同期
        highlightContainer.scrollTop = textArea.scrollTop;
        highlightContainer.scrollLeft = textArea.scrollLeft; 
    }
    
    if (textArea && lineNumberDiv) {
        // 行番号のスクロールを同期
        lineNumberDiv.scrollTop = textArea.scrollTop;
    }
}

/**
 * 検索フォームを非表示にする。
 */
function hideSearchForm() {
    if (searchFormContainer.classList.contains('hidden')) {
        return;
    }
    
    searchFormContainer.classList.add('hidden');
    
    // フォームが非表示になったら、現在アクティブなエディタにフォーカスを戻す
    const activePanel = document.querySelector('.tab-content.active');
    if (activePanel) {
        const activePanelId = activePanel.id;
        if (activePanelId === 'html-panel' && htmlInput) htmlInput.focus();
        else if (activePanelId === 'css-panel' && cssInput) cssInput.focus();
        else if (activePanelId === 'js-panel' && jsInput) jsInput.focus();
    }
    
    // ⭐ 追記: フォームを非表示にしたときにハイライトをクリア (元のテキストに戻す) ⭐
    clearHighlights();
}

/**
 * 検索フォームの表示/非表示を切り替える。
 */
function toggleSearchForm() {
    if (searchFormContainer.classList.contains('hidden')) {
        // 表示する
        searchFormContainer.classList.remove('hidden');
        searchInput.focus();
    } else {
        // 非表示にする
        hideSearchForm();
    }
}


// ------------------------------------
// イベントリスナーの追加
// ------------------------------------

// 1. 検索ボタンのクリックイベント (表示/非表示の切り替え)
toggleSearchButton.addEventListener('click', toggleSearchForm);
searchExecuteButton.addEventListener('click', () => {
    executeSearch();
});

// 2. Enterキーでの検索実行
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault(); 
        executeSearch();
    }
});

// 3. コードエリアの操作イベント (スクロール同期、ハイライトクリア)
// ⭐ edit2.js との連携を保証するため、HTML, CSS, JS のすべてで定義 ⭐

if (htmlInput) {
    htmlInput.addEventListener('scroll', () => syncScroll('htmlCode', 'htmlHighlightContainer', 'htmlLineNumbers'));
    htmlInput.addEventListener('input', clearHighlights); // ⭐ 修正: clearHighlights() に一本化 ⭐
    htmlInput.addEventListener('click', hideSearchForm);
}

if (cssInput) {
    cssInput.addEventListener('scroll', () => syncScroll('cssCode', 'cssHighlightContainer', 'cssLineNumbers'));
    cssInput.addEventListener('input', clearHighlights); // ⭐ 修正: clearHighlights() に一本化 ⭐
    cssInput.addEventListener('click', hideSearchForm);
}

if (jsInput) {
    jsInput.addEventListener('scroll', () => syncScroll('jsCode', 'jsHighlightContainer', 'jsLineNumbers'));
    jsInput.addEventListener('input', clearHighlights); // ⭐ 修正: clearHighlights() に一本化 ⭐
    jsInput.addEventListener('click', hideSearchForm);
}

// 4. タブ切り替え時にもハイライトをクリア
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', clearHighlights);
});

// 5. 初期ロード時にハイライトコンテナをクリア (元のコードを反映)
window.addEventListener('load', clearHighlights);