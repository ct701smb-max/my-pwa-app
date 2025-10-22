document.addEventListener('DOMContentLoaded', () => {
    const searchToggleBtn = document.getElementById('search-toggle-btn');
    const searchBar = document.getElementById('search-bar');
    const searchInput = document.getElementById('search-input');
    const searchCloseBtn = document.getElementById('search-close-btn');
    const searchPrevBtn = document.getElementById('search-prev-btn');
    const searchNextBtn = document.getElementById('search-next-btn');
    const searchResultCount = document.getElementById('search-result-count');
    const codeInput = document.getElementById('code-input');
    const highlightLayer = document.getElementById('highlight-layer');

    let currentMatches = []; // 検索結果の配列 (開始インデックス)
    let currentMatchIndex = -1; // 現在フォーカスしているマッチのインデックス

    // 検索バーの表示/非表示を切り替える
    searchToggleBtn.addEventListener('click', () => {
        const isVisible = searchBar.style.display !== 'none';
        searchBar.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            searchInput.focus();
        } else {
            clearHighlights();
        }
    });

    // 検索バーを閉じる
    searchCloseBtn.addEventListener('click', () => {
        searchBar.style.display = 'none';
        clearHighlights();
    });

    // 検索処理を実行し、ハイライトを適用する
    const performSearch = () => {
        const query = searchInput.value;
        const codeText = codeInput.value;

        clearHighlights();

        if (query.length === 0) {
            searchResultCount.textContent = "";
            return;
        }

        // 検索キーワードを正規表現オブジェクトとして作成（g: グローバル、i: 大文字小文字を区別しない）
        const regex = new RegExp(query, 'gi');
        let match;
        currentMatches = [];

        // 全てのマッチ位置を検出
        while ((match = regex.exec(codeText)) !== null) {
            currentMatches.push(match.index);
        }

        // 結果件数を表示
        searchResultCount.textContent = `${currentMatches.length} 件`;

        if (currentMatches.length > 0) {
            currentMatchIndex = 0; // 最初の結果にフォーカス
            highlightCode(codeText, query);
            scrollToCurrentMatch(currentMatches[currentMatchIndex], query.length);
        } else {
            currentMatchIndex = -1;
            highlightLayer.textContent = codeText; // ハイライトがない場合はプレーンテキストに戻す
        }
    };

    // コード内の検索キーワードをHTMLでハイライトする
    const highlightCode = (codeText, query) => {
        // 検索キーワードをspanで囲む置換関数
        const highlightedHtml = codeText.replace(new RegExp(query, 'gi'), (match) => {
            return `<span class="highlight">${match}</span>`;
        });
        
        // プレーンテキスト層にHTMLとして挿入
        highlightLayer.innerHTML = highlightedHtml;
        updateCurrentHighlight(); // 現在のハイライトを適用
    };

    // 現在フォーカスしているハイライトを更新する
    const updateCurrentHighlight = () => {
        const highlights = highlightLayer.querySelectorAll('.highlight');
        
        // 全てのハイライトから 'highlight-current' クラスを削除
        highlights.forEach(h => h.classList.remove('highlight-current'));

        // 現在のマッチがある場合、それに 'highlight-current' クラスを追加
        if (currentMatchIndex >= 0 && currentMatchIndex < highlights.length) {
            highlights[currentMatchIndex].classList.add('highlight-current');
        }
    };

    // エディタの表示を現在のマッチ位置にスクロールする
    const scrollToCurrentMatch = (matchIndex, queryLength) => {
        // テキストエリアで選択状態を設定することでスクロールさせる
        if (matchIndex !== undefined) {
            codeInput.focus();
            codeInput.setSelectionRange(matchIndex, matchIndex + queryLength);
            // setSelectionRange()はフォーカスとスクロールを伴う
        }
        
        // オプション: highlightLayerをスクロールさせたい場合は、codeInputと同じスクロール位置を同期させるロジックが必要です
        // 例: highlightLayer.scrollTop = codeInput.scrollTop;
    };
    
    // ハイライトをクリアする
    const clearHighlights = () => {
        currentMatches = [];
        currentMatchIndex = -1;
        searchResultCount.textContent = "";
        
        // highlightLayerの内容をcode-inputの現在の内容に戻し、ハイライトを削除
        highlightLayer.textContent = codeInput.value; 
    };

    // 次のマッチへ移動
    searchNextBtn.addEventListener('click', () => {
        if (currentMatches.length === 0) return;
        
        currentMatchIndex = (currentMatchIndex + 1) % currentMatches.length;
        updateCurrentHighlight();
        scrollToCurrentMatch(currentMatches[currentMatchIndex], searchInput.value.length);
        searchResultCount.textContent = `${currentMatchIndex + 1}/${currentMatches.length} 件`;
    });

    // 前のマッチへ移動
    searchPrevBtn.addEventListener('click', () => {
        if (currentMatches.length === 0) return;

        currentMatchIndex = (currentMatchIndex - 1 + currentMatches.length) % currentMatches.length;
        updateCurrentHighlight();
        scrollToCurrentMatch(currentMatches[currentMatchIndex], searchInput.value.length);
        searchResultCount.textContent = `${currentMatchIndex + 1}/${currentMatches.length} 件`;
    });

    // 入力時に検索を実行
    searchInput.addEventListener('input', performSearch);
    
    // コード入力エリアが変更されたらハイライトをクリア（または再検索）
    codeInput.addEventListener('input', () => {
        // ユーザーがコードを変更したら、検索結果を一旦クリアし、再検索を促す
        if (searchBar.style.display !== 'none' && searchInput.value.length > 0) {
            performSearch(); // コードが変更されるたびに再検索
        }
    });

    // EnterキーとShift+Enterキーでナビゲーション
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // フォーム送信を防ぐ
            if (e.shiftKey) {
                searchPrevBtn.click(); // Shift+Enterで前へ
            } else {
                searchNextBtn.click(); // Enterで次へ
            }
        }
    });
    
    // 初期設定: codeInputの変更をhighlightLayerに反映させる（通常のエディタ処理の一部として実装されている可能性がありますが、ここでは検索のために念のため追加）
    // codeInputのスクロールと同期させる処理は、より複雑になるため省略しますが、実運用では必要です。
    // codeInput.addEventListener('scroll', () => {
    //     highlightLayer.scrollTop = codeInput.scrollTop;
    //     highlightLayer.scrollLeft = codeInput.scrollLeft;
    // });
    
    // codeInputの内容が変更されたら、highlightLayerの内容も更新
    // ※ 既存のコードハイライトロジック（edit.js）との兼ね合いを確認してください。
    // codeInput.addEventListener('input', () => {
    //     if (searchInput.value === "") { // 検索中でない場合のみ通常通り更新
    //         highlightLayer.textContent = codeInput.value;
    //     }
    // });

});