/* Panning a strip of film: drag it, wheel it, arrow it, or use the prev/next
   buttons. Applies to every .sheet-film on the page, so the shelf and the roll
   permalink pages behave the same way. */
(function () {
    'use strict';

    var strips = Array.prototype.slice.call(document.querySelectorAll('.sheet-film'));
    if (!strips.length) return;

    strips.forEach(setup);

    function setup(container) {
        var strip = container.querySelector('.strip');
        if (!strip) return;

        var prev = container.querySelector('.film-prev');
        var next = container.querySelector('.film-next');

        // Exactly one frame per press. A "screenful" step lands on a different
        // amount every time depending on where the snap points fall, which makes
        // the buttons feel unpredictable.
        function step() {
            var frame = strip.querySelector('.frame');
            return frame ? frame.offsetWidth : 240;
        }

        function limit() {
            return strip.scrollWidth - strip.clientWidth;
        }

        // The film pans freely, so a press lands on the nearest frame boundary
        // in the direction of travel rather than adding a raw offset.
        function pan(direction, smooth) {
            var one = step();
            strip.scrollTo({
                left: Math.round(strip.scrollLeft / one + direction) * one,
                behavior: smooth === false ? 'auto' : 'smooth'
            });
        }

        // Disable rather than hide: a button that disappears under the cursor
        // makes the film feel like it is fighting back.
        function syncButtons() {
            var max = limit();
            if (prev) prev.disabled = strip.scrollLeft <= 2;
            if (next) next.disabled = max <= 2 || strip.scrollLeft >= max - 2;
        }

        if (prev) prev.addEventListener('click', function () { pan(-1); });
        if (next) next.addEventListener('click', function () { pan(1); });

        strip.addEventListener('scroll', syncButtons, { passive: true });
        window.addEventListener('resize', syncButtons);
        syncButtons();
        // The strip starts hidden on the shelf, so its width is only knowable
        // once it has been shown.
        setTimeout(syncButtons, 60);
        container.addEventListener('transitionend', syncButtons);

        strip.addEventListener('keydown', function (event) {
            if (event.key === 'ArrowRight') { event.preventDefault(); pan(1); }
            else if (event.key === 'ArrowLeft') { event.preventDefault(); pan(-1); }
            else if (event.key === 'Home') { event.preventDefault(); strip.scrollTo({ left: 0, behavior: 'smooth' }); }
            else if (event.key === 'End') { event.preventDefault(); strip.scrollTo({ left: limit(), behavior: 'smooth' }); }
        });

        // A vertical wheel over the film pushes it sideways — the strip has
        // nothing to scroll vertically, so the gesture would go to waste. Once
        // it reaches either end the event is left alone so the page can scroll.
        strip.addEventListener('wheel', function (event) {
            if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
            var max = limit();
            if (max <= 0) return;
            var target = strip.scrollLeft + event.deltaY;
            if ((target <= 0 && event.deltaY < 0) || (target >= max && event.deltaY > 0)) return;
            event.preventDefault();
            strip.scrollLeft = target;
        }, { passive: false });

        // Drag to pan. Only counts as a drag past a few pixels, so a click on a
        // frame still opens the lightbox.
        var dragging = false;
        var moved = false;
        var startX = 0;
        var startScroll = 0;

        strip.addEventListener('pointerdown', function (event) {
            if (event.button !== 0 || event.pointerType === 'touch') return;
            dragging = true;
            moved = false;
            startX = event.clientX;
            startScroll = strip.scrollLeft;
        });

        strip.addEventListener('pointermove', function (event) {
            if (!dragging) return;
            var delta = event.clientX - startX;
            if (!moved && Math.abs(delta) < 5) return;
            if (!moved) {
                moved = true;
                strip.classList.add('is-dragging');
                strip.setPointerCapture(event.pointerId);
            }
            strip.scrollLeft = startScroll - delta;
        });

        function endDrag(event) {
            if (!dragging) return;
            dragging = false;
            if (moved) {
                strip.classList.remove('is-dragging');
                if (event && event.pointerId !== undefined && strip.hasPointerCapture(event.pointerId)) {
                    strip.releasePointerCapture(event.pointerId);
                }
                // Swallow the click that follows the drag.
                strip.addEventListener('click', function swallow(e) {
                    e.stopPropagation();
                    e.preventDefault();
                }, { capture: true, once: true });
            }
        }

        strip.addEventListener('pointerup', endDrag);
        strip.addEventListener('pointercancel', endDrag);
        strip.addEventListener('pointerleave', endDrag);
    }
})();
