// ------------------------------------
// 検索機能ロジック (search.js)
// ------------------------------------

// edit2.jsで定義されているグローバル関数/変数に依存
// (showToastNotification, htmlInput, cssInput, jsInput)

const toggleSearchButton = document.getElementById('toggleSearchButton');
const searchFormContainer = document.getElementById('searchFormContainer');
const searchInput = document.getElementById('searchInput');
const searchExecuteButton = document.getElementById('searchExecuteButton'); 

/**
 * すべてのエディターのハイライトをクリアする。
 */
function clearHighlights() {
    const containers = [
        document.getElementById('htmlHighlightContainer'),
        document.getElementById('cssHighlightContainer'),
        document.getElementById('jsHighlightContainer')
    ];
    containers.forEach(container => {
        if (container) {
            container.innerHTML = '';
        }
    });
}

/**
 * 検索を実行し、結果をハイライト表示する。
 */
function executeSearch() {
    const keyword = searchInput.value.trim();
    
    // 既存のハイライトをクリア
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
        // プレビュータブなどがアクティブな場合
        showToastNotification("コードエディタータブがアクティブではありません。", 2000);
        return;
    }

    const content = currentEditor.value;
    const regex = new RegExp(keyword, 'gi'); // 大文字・小文字を区別しないグローバル検索
    const matches = content.match(regex);
    
    if (matches && matches.length > 0) {
        showToastNotification(`${editorName}内で "${keyword}" が ${matches.length} 件見つかりました。`, 3000);
        
        // 1. HTMLエスケープ処理
        // < や & などの文字をハイライト処理前にエスケープし、HTMLとして解釈されないようにする
        let highlightedHtml = content.replace(/[&<>"']/g, function(match) {
            if (match === '&') return '&amp;';
            if (match === '<') return '&lt;';
            if (match === '>') return '&gt;';
            if (match === '"') return '&quot;';
            if (match === "'") return '&#39;';
            return match;
        });
        
        // 2. 検索キーワードをハイライト用の span で囲む
        // $& は正規表現にマッチした文字列全体を表す
        // ★修正: インラインスタイルで color: black を強制適用する ★
        const highlightReplace = `<span class="highlighted-match" style="color: black !important;">$&</span>`; 
        highlightedHtml = highlightedHtml.replace(regex, highlightReplace);

        // 3. ハイライトコンテナにHTMLを挿入して表示
        highlightContainer.innerHTML = highlightedHtml;
        
        // 4. 最初の検索結果の位置にスクロール
        scrollToFirstMatch(currentEditor, content, keyword);
        
    } else {
        showToastNotification(`${editorName}内で "${keyword}" は見つかりませんでした。`, 2000);
        // 見つからなかった場合、ハイライトコンテナにコンテンツを反映
        // ここでは clearHighlights() の直後にテキストコンテンツを反映するロジックに任せるため、innerHTML操作は不要
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
        
        const computedStyle = getComputedStyle(textArea);
        const lineHeight = parseInt(computedStyle.lineHeight) || 21; 
        
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
        // スクロール位置を同期
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
    // 検索実行後もフォームは開いたままにする (連続検索を可能にするため)
});

// 2. Enterキーでの検索実行
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault(); 
        executeSearch();
    }
});

// 3. コードエリアの操作イベント (スクロール同期、ハイライトクリア)
if (htmlInput) {
    // スクロール時の同期
    htmlInput.addEventListener('scroll', () => syncScroll('htmlCode', 'htmlHighlightContainer', 'htmlLineNumbers'));
    // 入力時はハイライトをクリアし、即座に同期 (入力されたテキストをハイライトコンテナに反映)
    htmlInput.addEventListener('input', () => { 
        clearHighlights();
        document.getElementById('htmlHighlightContainer').textContent = htmlInput.value;
    });
    // クリックでフォームを閉じる
    htmlInput.addEventListener('click', hideSearchForm);
}

if (cssInput) {
    cssInput.addEventListener('scroll', () => syncScroll('cssCode', 'cssHighlightContainer', 'cssLineNumbers'));
    cssInput.addEventListener('input', () => {
        clearHighlights();
        document.getElementById('cssHighlightContainer').textContent = cssInput.value;
    });
    cssInput.addEventListener('click', hideSearchForm);
}

if (jsInput) {
    jsInput.addEventListener('scroll', () => syncScroll('jsCode', 'jsHighlightContainer', 'jsLineNumbers'));
    jsInput.addEventListener('input', () => {
        clearHighlights();
        document.getElementById('jsHighlightContainer').textContent = jsInput.value;
    });
    jsInput.addEventListener('click', hideSearchForm);
}

// 4. タブ切り替え時にもハイライトをクリア
document.querySelectorAll('.tab-button').forEach(button => {
    // 検索ボタンはタブ切り替えロジックから除外されている前提
    button.addEventListener('click', clearHighlights);
});