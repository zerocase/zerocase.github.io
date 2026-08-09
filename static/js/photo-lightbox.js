(function () {
    'use strict';

    var lightbox = document.getElementById('lightbox');
    var image = document.getElementById('lightbox-image');
    var counter = document.getElementById('lightbox-counter');
    var title = document.getElementById('lightbox-title');
    if (!lightbox || !image) return;

    var frames = [];      // the frames of the group currently being viewed
    var current = 0;
    var lastFocused = null;

    function show(index) {
        if (!frames.length) return;
        current = (index % frames.length + frames.length) % frames.length;
        var frame = frames[current];
        var created = frame.getAttribute('data-created');

        image.src = frame.getAttribute('data-full');
        image.alt = frame.getAttribute('data-name') || '';
        counter.textContent = (current + 1) + ' / ' + frames.length;
        title.textContent = created ? 'Created: ' + created : '';

        preload(current + 1);
        preload(current - 1);
    }

    function preload(index) {
        if (frames.length < 2) return;
        var frame = frames[(index % frames.length + frames.length) % frames.length];
        var src = frame && frame.getAttribute('data-full');
        if (src) new Image().src = src;
    }

    function open(frame) {
        var group = frame.closest('[data-lightbox-group]');
        frames = Array.prototype.slice.call(
            (group || document).querySelectorAll('[data-full]'));

        lastFocused = frame;
        lightbox.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        show(frames.indexOf(frame));
        lightbox.querySelector('.lightbox-close').focus();
    }

    function close() {
        lightbox.classList.remove('is-open');
        document.body.style.overflow = '';
        image.src = '';
        frames = [];
        if (lastFocused) {
            lastFocused.focus();
            lastFocused = null;
        }
    }

    function isOpen() {
        return lightbox.classList.contains('is-open');
    }

    document.addEventListener('click', function (event) {
        var frame = event.target.closest('[data-full]');
        if (frame && !isOpen()) {
            event.preventDefault();
            open(frame);
        }
    });

    lightbox.addEventListener('click', function (event) {
        var target = event.target;
        if (target.closest('.lightbox-prev')) {
            show(current - 1);
        } else if (target.closest('.lightbox-next')) {
            show(current + 1);
        } else if (target.closest('.lightbox-close') || target === lightbox ||
                   target.classList.contains('lightbox-content')) {
            close();
        }
    });

    document.addEventListener('keydown', function (event) {
        if (!isOpen()) return;
        if (event.key === 'Escape') {
            close();
        } else if (event.key === 'ArrowLeft') {
            show(current - 1);
        } else if (event.key === 'ArrowRight') {
            show(current + 1);
        } else if (event.key === 'Tab') {
            // Keep focus inside the dialog while it is open.
            var focusable = lightbox.querySelectorAll('button');
            var first = focusable[0];
            var last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });

    // Swipe between frames on touch devices.
    var touchStartX = null;
    lightbox.addEventListener('touchstart', function (event) {
        touchStartX = event.changedTouches[0].clientX;
    }, { passive: true });

    lightbox.addEventListener('touchend', function (event) {
        if (touchStartX === null) return;
        var delta = event.changedTouches[0].clientX - touchStartX;
        touchStartX = null;
        if (Math.abs(delta) > 50) show(current + (delta < 0 ? 1 : -1));
    }, { passive: true });
})();
