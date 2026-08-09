(function () {
    'use strict';

    var xmb = document.getElementById('rollfilm');
    var column = document.getElementById('shelf-rail');
    if (!xmb || !column) return;

    var rail = xmb.querySelector('.xmb-rail');          // the scroller
    var canisters = Array.prototype.slice.call(column.querySelectorAll('.canister'));
    var sheets = Array.prototype.slice.call(xmb.querySelectorAll('.sheet'));
    if (!rail || !canisters.length) return;

    var bySlug = {};
    sheets.forEach(function (sheet) { bySlug[sheet.getAttribute('data-roll')] = sheet; });

    var activeIndex = -1;
    var settleTimer = null;

    function slugAt(index) {
        return canisters[index] && canisters[index].getAttribute('data-roll');
    }

    function select(index, options) {
        options = options || {};
        index = Math.min(canisters.length - 1, Math.max(0, index));
        var slug = slugAt(index);
        if (!slug || index === activeIndex) {
            if (options.scrollIntoView) centre(index);
            return;
        }
        activeIndex = index;
        xmb.style.setProperty('--active', index);

        canisters.forEach(function (canister, i) {
            var on = i === index;
            canister.setAttribute('aria-selected', on ? 'true' : 'false');
            canister.tabIndex = on ? 0 : -1;
        });

        sheets.forEach(function (sheet) {
            var on = sheet.getAttribute('data-roll') === slug;
            if (on) {
                sheet.hidden = false;
                // Restart the unroll each time a roll is picked.
                sheet.classList.remove('is-unrolling');
                void sheet.offsetWidth;
                sheet.classList.add('is-unrolling');
                var strip = sheet.querySelector('.strip');
                if (strip) strip.scrollLeft = 0;
            } else {
                sheet.hidden = true;
                sheet.classList.remove('is-unrolling');
            }
        });

        if (options.scrollIntoView) centre(index);
        if (options.focus) canisters[index].focus({ preventScroll: true });
        if (history.replaceState) history.replaceState(null, '', '#' + slug);
    }

    // The rail is a vertical column on wide screens and a horizontal row on
    // narrow ones, so every measurement has to pick its axis first.
    function isVertical() {
        return rail.clientHeight > rail.clientWidth;
    }

    var centring = null;

    function centre(index) {
        var canister = canisters[index];
        if (!canister) return;
        clearTimeout(centring);
        centring = setTimeout(function () { centring = null; }, 500);
        // scrollIntoView would also scroll the page; move the rail directly.
        if (isVertical()) {
            rail.scrollTo({
                top: canister.offsetTop - (rail.clientHeight - canister.offsetHeight) / 2,
                behavior: 'smooth'
            });
        } else {
            rail.scrollTo({
                left: canister.offsetLeft - (rail.clientWidth - canister.offsetWidth) / 2,
                behavior: 'smooth'
            });
        }
    }

    // Whichever canister sits closest to the axis is the selected roll. Waiting
    // for the scroll to settle avoids flicking through every roll on the way
    // past, and keeps hidden strips from loading images they never show.
    function nearestToAxis() {
        var box = rail.getBoundingClientRect();
        var vertical = isVertical();
        var axis = vertical ? box.top + box.height / 2 : box.left + box.width / 2;
        var best = 0;
        var bestDistance = Infinity;

        canisters.forEach(function (canister, i) {
            var b = canister.getBoundingClientRect();
            var mid = vertical ? b.top + b.height / 2 : b.left + b.width / 2;
            var distance = Math.abs(mid - axis);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = i;
            }
        });
        return best;
    }

    rail.addEventListener('scroll', function () {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(function () {
            if (centring) return;   // our own smooth scroll, not the user's
            select(nearestToAxis());
        }, 110);
    }, { passive: true });

    // One wheel gesture = one roll. Left to the browser, a single notch (~100px)
    // falls short of the snap threshold between cassettes and springs back,
    // so scrolling appears to do nothing at all.
    var WHEEL_STEP = 40;
    var wheelAccum = 0;
    var wheelLock = false;
    var wheelReset = null;

    function wheelDelta(event) {
        var raw = isVertical() ? event.deltaY : (event.deltaX || event.deltaY);
        if (event.deltaMode === 1) return raw * 16;        // lines
        if (event.deltaMode === 2) return raw * rail.clientHeight;   // pages
        return raw;
    }

    rail.addEventListener('wheel', function (event) {
        var delta = wheelDelta(event);
        if (!delta) return;

        // At either end let the page have the gesture rather than trapping it.
        var heading = activeIndex + (delta > 0 ? 1 : -1);
        if (heading < 0 || heading > canisters.length - 1) return;

        event.preventDefault();
        if (wheelLock) return;

        wheelAccum += delta;
        clearTimeout(wheelReset);
        wheelReset = setTimeout(function () { wheelAccum = 0; }, 200);

        if (Math.abs(wheelAccum) < WHEEL_STEP) return;

        var direction = wheelAccum > 0 ? 1 : -1;
        wheelAccum = 0;
        wheelLock = true;
        setTimeout(function () { wheelLock = false; }, 300);
        select(activeIndex + direction, { scrollIntoView: true });
    }, { passive: false });

    // A swipe shorter than half the gap between cassettes snaps straight back,
    // so the gesture reads as broken. If the rail ends up exactly where it
    // started and the finger clearly travelled, move one roll deliberately.
    var SWIPE_MIN = 24;      // px of travel before we call it a swipe
    var SETTLED_SLOP = 8;    // px within which the rail counts as unmoved
    var touchStart = null;

    rail.addEventListener('touchstart', function (event) {
        if (event.touches.length !== 1) { touchStart = null; return; }
        var touch = event.touches[0];
        touchStart = {
            x: touch.clientX,
            y: touch.clientY,
            index: activeIndex,
            scroll: isVertical() ? rail.scrollTop : rail.scrollLeft
        };
    }, { passive: true });

    rail.addEventListener('touchend', function (event) {
        var start = touchStart;
        touchStart = null;
        if (!start || !event.changedTouches.length) return;

        var touch = event.changedTouches[0];
        var vertical = isVertical();
        var travel = vertical ? touch.clientY - start.y : touch.clientX - start.x;
        var across = vertical ? touch.clientX - start.x : touch.clientY - start.y;
        // Ignore gestures that were mostly across the rail — those are the page
        // being scrolled, not a roll being chosen.
        if (Math.abs(travel) < SWIPE_MIN || Math.abs(across) > Math.abs(travel)) return;

        // Let any momentum and the snap finish before deciding it did nothing.
        setTimeout(function () {
            var now = vertical ? rail.scrollTop : rail.scrollLeft;
            if (activeIndex !== start.index) return;                    // it moved on its own
            if (Math.abs(now - start.scroll) > SETTLED_SLOP) return;     // still settling
            select(start.index + (travel < 0 ? 1 : -1), { scrollIntoView: true });
        }, 320);
    }, { passive: true });

    rail.addEventListener('click', function (event) {
        var canister = event.target.closest('.canister');
        if (!canister) return;
        select(canisters.indexOf(canister), { scrollIntoView: true });
    });

    column.addEventListener('keydown', function (event) {
        var step = 0;
        if (event.key === 'ArrowDown') step = 1;
        else if (event.key === 'ArrowUp') step = -1;
        else if (event.key === 'Home') step = -canisters.length;
        else if (event.key === 'End') step = canisters.length;
        else return;

        event.preventDefault();
        select(activeIndex + step, { scrollIntoView: true, focus: true });
    });

    // Deep link: /photography/#roll-12 opens that roll.
    var initial = decodeURIComponent(location.hash.replace('#', ''));
    var start = canisters.findIndex(function (c) {
        return c.getAttribute('data-roll') === initial;
    });
    select(start >= 0 ? start : 0, { scrollIntoView: true });

    // The rail flips between a column and a row at the layout breakpoint, so a
    // resize has to put the selected cassette back on the axis.
    var resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            if (activeIndex >= 0) centre(activeIndex);
        }, 150);
    });

    window.addEventListener('hashchange', function () {
        var slug = decodeURIComponent(location.hash.replace('#', ''));
        var index = canisters.findIndex(function (c) {
            return c.getAttribute('data-roll') === slug;
        });
        if (index >= 0) select(index, { scrollIntoView: true });
    });
})();
