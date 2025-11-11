jQuery(function($) {
    let copyCount = 0;
    let popupTimer;
    $('.copy_code').click(function() {
        let clipboard = $('<textarea></textarea>');
        clipboard.addClass('clipboard');
        clipboard.html( $(this).prev('code').html() );
        $(this).append(clipboard);
        clipboard.select();
        document.execCommand('copy');
        clipboard.remove();
        
        $('.popup').addClass('js_active');
        $('.popup_adsense').addClass('js_active');
/*
        if(copyCount % 2 == 0) {
            $('.popup_adsense').addClass('js_active');
            $('.popup_amazon').removeClass('js_active');
        }
        else {
            $('.popup_adsense').removeClass('js_active');
            $('.popup_amazon').addClass('js_active');
        }
*/
        clearInterval(popupTimer);
        popupTimer = setTimeout(function() {
            $('.popup').removeClass('js_active');
        }, 3000);

        copyCount++;
    });
    
    $('.popup').click(function() {
        $(this).removeClass('js_active');
    });

    $('.popup').hover(function() {
        clearInterval(popupTimer);
    },
    function() {
        $(this).removeClass('js_active');
    });
});

jQuery(function($) {
    function playVideos(videos) {
        const startPosition = $(window).scrollTop() + $(window).height();
        videos.each(function(index) {
            if(startPosition > $(this).offset().top) {
                $(this).get(0).play();
            }
        });
    }
    $(window).on('load', function() {
        const videos = $('.video_wrapper > video');
        if(videos.length) {
            playVideos(videos);
            $(window).on('scroll', function() {
                playVideos(videos);
            });
        }
    });
});

jQuery(function($) {
    if($('.index_link')) {
        $('h2').each(function(index) {
            if(!$(this).hasClass('no_anker')) {
                const anker = 'anker_' + index;
                $(this).attr('id', anker);
                $('.index_link').append('<li><a href="#' + anker + '">' + $(this).text() + '</a></li>');
            }
        });
    }
});

window.addEventListener('load', function() {
    const bgForm = document.getElementById('bg_inline_form');
    if(bgForm) {
        const openFormButton = document.getElementsByClassName('open_inline_form')[0];
        openFormButton.addEventListener('click', function(event) {
            bgForm.classList.add('js_active');
        }, false);

        // オーバーレイエリアと×アイコンがクリックされたら、オーバーレイとウインドウをクローズ
        function closeForm(event) {
            bgForm.classList.remove('js_active');
        }
        bgForm.addEventListener('click', closeForm, false);
        document.getElementById('close_inline_form').addEventListener('click', closeForm, false);

        // ウインドウ内の要素をクリックしたときにクローズされないようバブリングを停止
        document.getElementById('inline_form').addEventListener('click', function(event) {
            event.stopPropagation();
        }, false);
    }
}, false);
