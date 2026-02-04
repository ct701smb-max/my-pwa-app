(function() {
    window.addEventListener('load', () => {
        const canvas = document.getElementById('main-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        const lassoBtn = document.getElementById('tool-lasso');
        const applyBtn = document.getElementById('apply-outside-clear');
        const TOUCH_OFFSET_Y_DISPLAY = -80; 

        let isLassoActive = false;
        let isDrawing = false;
        let points = [];
        let snapshot = null; // 描画開始前の画像状態を保存

        lassoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isLassoActive = !isLassoActive;
            if (isLassoActive) {
                lassoBtn.style.backgroundColor = "#ff4444";
                lassoBtn.style.color = "white";
                canvas.style.cursor = "crosshair";
            } else {
                resetLasso();
            }
        });

        function handleStart(e) {
            if (!isLassoActive) return;
            if (e.type === 'touchstart') e.preventDefault();
            e.stopImmediatePropagation(); 
            
            isDrawing = true;
            points = [];
            
            // 重要：描画を始める直前のキャンバスの状態を保存する
            snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            points.push(getSyncPos(e));
        }

        function handleMove(e) {
            if (!isLassoActive || !isDrawing) return;
            if (e.type === 'touchmove') e.preventDefault();
            
            points.push(getSyncPos(e));
            
            // 重要：一度保存した状態に戻してから新しい線を引く（これで線が重ならない）
            if (snapshot) {
                ctx.putImageData(snapshot, 0, 0);
            }
            drawPreview();
        }

        function handleEnd() {
            isDrawing = false;
        }

        function getSyncPos(event) {
            const rect = canvas.getBoundingClientRect();
            const isTouchEvent = event.touches && event.touches.length > 0;
            const clientX = isTouchEvent ? event.touches[0].clientX : event.clientX;
            const clientY = isTouchEvent ? event.touches[0].clientY : event.clientY;
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            let drawYOffset = 0;
            if (isTouchEvent) {
                drawYOffset = TOUCH_OFFSET_Y_DISPLAY * scaleY;
            }

            const x = (clientX - rect.left) * scaleX;
            const y = (clientY - rect.top) * scaleY + drawYOffset;
            return { x, y };
        }

        function drawPreview() {
            if (points.length < 2) return;
            ctx.save();
            ctx.strokeStyle = "red";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();
            ctx.restore();
        }

        applyBtn.addEventListener('click', () => {
            if (points.length < 3) return;

            // 最終処理時には赤い線がない状態（snapshot）をベースにする
            if (snapshot) {
                ctx.putImageData(snapshot, 0, 0);
            }

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const tCtx = tempCanvas.getContext('2d');
            tCtx.drawImage(canvas, 0, 0);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(tempCanvas, 0, 0);
            ctx.restore();
            
            // 完了したらsnapshotをクリア
            snapshot = null;
            resetLasso();
        });

        function resetLasso() {
            isLassoActive = false;
            isDrawing = false;
            // モード解除時に線が残っていたら消す
            if (snapshot && points.length > 0) {
                ctx.putImageData(snapshot, 0, 0);
            }
            points = [];
            snapshot = null;
            lassoBtn.style.backgroundColor = "";
            lassoBtn.style.color = "";
        }

        canvas.addEventListener('mousedown', handleStart, true);
        window.addEventListener('mousemove', handleMove, { passive: false });
        window.addEventListener('mouseup', handleEnd);
        canvas.addEventListener('touchstart', handleStart, { passive: false });
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('touchend', handleEnd);
    });
})();