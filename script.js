(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var volParam = params.get("vol");
  var volId = "vol" + volParam;
  var config = (window.VOLUMES || []).filter(function (v) {
    return v.id === volId;
  })[0];

  var stageEl = document.getElementById("stage");
  var loadingEl = document.getElementById("loading");
  var prevBtn = document.getElementById("prev-btn");
  var nextBtn = document.getElementById("next-btn");
  var indicatorEl = document.getElementById("page-indicator");
  var titleEl = document.getElementById("title");
  var videoOverlayEl = document.getElementById("video-overlay");
  var hotspotVideoEl = document.getElementById("hotspot-video");
  var videoCloseBtn = document.getElementById("video-close-btn");
  var videoOverlayOpen = false;
  var zoomOverlayEl = document.getElementById("zoom-overlay");
  var zoomFrameEl = document.getElementById("zoom-frame");
  var zoomCloseBtn = document.getElementById("zoom-close-btn");
  var zoomOpen = false;

  // Progressive zoom state. Steps match the fit->150%->200%->250% ladder
  // requested for click-to-zoom; the scroll-wheel instead zooms
  // continuously between the same 1x/2.5x bounds.
  var ZOOM_STEPS = [1, 1.5, 2, 2.5];
  var ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];
  var zoomScale = 1;
  var zoomPanX = 0;
  var zoomPanY = 0;
  var zoomDrag = null;
  var lastTapTime = 0;
  var lastTapX = 0;
  var lastTapY = 0;

  if (!config) {
    loadingEl.innerHTML = '<div>Book not found. <a href="index.html" style="color:#e8e6e1;">Return to Main Menu</a></div>';
    return;
  }

  document.title = config.title;
  titleEl.textContent = config.title;

  var PAGE_WIDTH = config.width;
  var PAGE_HEIGHT = config.height;
  var PAGE_RATIO = PAGE_WIDTH / PAGE_HEIGHT;

  // Fits the artwork's true aspect ratio into the viewport, then uses it to
  // size the zoom frame's background image (no separate cropped image files
  // exist - the enlarged view always shows the whole page image).
  function positionZoomFrame() {
    var availW = window.innerWidth;
    var availH = window.innerHeight;
    var totalW, totalH;
    if (availW / availH > PAGE_RATIO) {
      totalH = availH;
      totalW = totalH * PAGE_RATIO;
    } else {
      totalW = availW;
      totalH = totalW / PAGE_RATIO;
    }
    zoomFrameEl.style.width = Math.round(totalW) + "px";
    zoomFrameEl.style.height = Math.round(totalH) + "px";
    zoomFrameEl.style.backgroundSize = "100% 100%";
  }

  // Keeps panning inside the enlarged image's own edges: at the current
  // scale, the frame can only slide far enough that its scaled edge still
  // meets the viewport edge, never further (no blank margin, no infinite
  // drift).
  function clampPan(scale, panX, panY) {
    var baseW = zoomFrameEl.offsetWidth;
    var baseH = zoomFrameEl.offsetHeight;
    var maxX = Math.max(0, (baseW * scale - window.innerWidth) / 2);
    var maxY = Math.max(0, (baseH * scale - window.innerHeight) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, panX)),
      y: Math.max(-maxY, Math.min(maxY, panY))
    };
  }

  function applyZoomTransform() {
    zoomFrameEl.style.transform =
      "translate(" + zoomPanX + "px, " + zoomPanY + "px) scale(" + zoomScale + ")";
    zoomFrameEl.classList.toggle("zoomed-in", zoomScale > 1);
  }

  function setZoom(newScale, panX, panY, animated) {
    newScale = Math.max(1, Math.min(ZOOM_MAX, newScale));
    var clamped = clampPan(newScale, panX, panY);
    zoomScale = newScale;
    zoomPanX = clamped.x;
    zoomPanY = clamped.y;
    zoomFrameEl.style.transition = animated ? "transform 0.2s ease" : "none";
    applyZoomTransform();
  }

  // Zooms toward a specific viewport point (the click/tap/wheel position)
  // so that point stays visually fixed instead of the image re-centering
  // underneath the pointer.
  function zoomTowardPoint(clientX, clientY, newScale, animated) {
    var vcx = window.innerWidth / 2;
    var vcy = window.innerHeight / 2;
    var ratio = newScale / zoomScale;
    var targetPanX = (clientX - vcx) * (1 - ratio) + zoomPanX * ratio;
    var targetPanY = (clientY - vcy) * (1 - ratio) + zoomPanY * ratio;
    setZoom(newScale, targetPanX, targetPanY, animated);
  }

  function resetZoom(animated) {
    setZoom(1, 0, 0, animated !== false);
  }

  function stepZoomIn(clientX, clientY) {
    var next = zoomScale;
    for (var i = 0; i < ZOOM_STEPS.length; i++) {
      if (ZOOM_STEPS[i] > zoomScale + 0.001) {
        next = ZOOM_STEPS[i];
        break;
      }
    }
    if (next === zoomScale) return;
    zoomTowardPoint(clientX, clientY, next, true);
  }

  function beginZoomDrag(clientX, clientY) {
    zoomDrag = {
      startX: clientX,
      startY: clientY,
      startPanX: zoomPanX,
      startPanY: zoomPanY,
      moved: false
    };
    zoomFrameEl.classList.add("dragging");
  }

  function updateZoomDrag(clientX, clientY) {
    if (!zoomDrag) return;
    var dx = clientX - zoomDrag.startX;
    var dy = clientY - zoomDrag.startY;
    if (!zoomDrag.moved && Math.abs(dx) + Math.abs(dy) > 6) {
      zoomDrag.moved = true;
    }
    if (zoomScale > 1) {
      var clamped = clampPan(zoomScale, zoomDrag.startPanX + dx, zoomDrag.startPanY + dy);
      zoomPanX = clamped.x;
      zoomPanY = clamped.y;
      applyZoomTransform();
    }
  }

  // Returns whether the gesture that just ended was a drag (as opposed to a
  // stationary click/tap), so callers can decide whether to also treat it
  // as a zoom-step click.
  function endZoomDrag() {
    if (!zoomDrag) return false;
    var wasMoved = zoomDrag.moved;
    zoomDrag = null;
    zoomFrameEl.classList.remove("dragging");
    return wasMoved;
  }

  function openZoom(src) {
    zoomFrameEl.style.backgroundImage = "url(" + src + ")";
    positionZoomFrame();
    zoomScale = 1;
    zoomPanX = 0;
    zoomPanY = 0;
    zoomFrameEl.style.transition = "none";
    applyZoomTransform();
    zoomOverlayEl.classList.add("visible");
    zoomOverlayEl.setAttribute("aria-hidden", "false");
    zoomOpen = true;
  }

  function closeZoom() {
    zoomOpen = false;
    zoomOverlayEl.classList.remove("visible");
    zoomOverlayEl.setAttribute("aria-hidden", "true");
    endZoomDrag();
    zoomScale = 1;
    zoomPanX = 0;
    zoomPanY = 0;
    zoomFrameEl.style.transition = "none";
    applyZoomTransform();
  }

  // Page definitions: cover (no number) -> content pages (numbered from 1,
  // overlaid at render time) -> generated instructions page (no number).
  var pageDefs = [];
  pageDefs.push({
    kind: "cover",
    src: config.dir + "/" + config.cover,
    alt: config.title + " cover"
  });
  config.pages.forEach(function (filename, i) {
    pageDefs.push({
      kind: "content",
      src: config.dir + "/" + filename,
      alt: config.title + " page " + (i + 1),
      number: i + 1
    });
  });
  pageDefs.push({
    kind: "instructions",
    text: "Turn the page to return to the Main Menu."
  });

  var TOTAL_PAGES = pageDefs.length;
  var LAST_INDEX = TOTAL_PAGES - 1;

  var pageFlip = null;
  var lastLayout = null;
  var resizeTimer = null;

  // Compute the largest single-page box that fits inside #stage's
  // available space without exceeding it in either dimension, while
  // preserving each volume's true page aspect ratio (no cropping,
  // no stretching). Every page - cover, content, instructions - is
  // shown one at a time; there is never a two-page spread.
  function computeLayout() {
    var cs = getComputedStyle(stageEl);
    var padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    var padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    var availW = Math.max(stageEl.clientWidth - padX, 50);
    var availH = Math.max(stageEl.clientHeight - padY, 50);

    var totalW, totalH;
    if (availW / availH > PAGE_RATIO) {
      totalH = availH;
      totalW = totalH * PAGE_RATIO;
    } else {
      totalW = availW;
      totalH = totalW / PAGE_RATIO;
    }

    return {
      pageWidth: Math.max(180, Math.round(totalW)),
      pageHeight: Math.max(130, Math.round(totalH)),
      totalWidth: Math.round(totalW),
      totalHeight: Math.round(totalH)
    };
  }

  function buildPageEl(def) {
    var div = document.createElement("div");

    if (def.kind === "cover") {
      div.className = "page";
      div.setAttribute("data-density", "hard");
      var coverSurface = document.createElement("div");
      coverSurface.className = "page-surface";
      var coverImg = document.createElement("img");
      coverImg.src = def.src;
      coverImg.alt = def.alt;
      coverImg.draggable = false;
      coverSurface.appendChild(coverImg);
      div.appendChild(coverSurface);
    } else if (def.kind === "content") {
      div.className = "page";
      var surface = document.createElement("div");
      surface.className = "page-surface";
      var img = document.createElement("img");
      img.src = def.src;
      img.alt = def.alt;
      img.draggable = false;
      surface.appendChild(img);
      var num = document.createElement("div");
      num.className = "page-number";
      num.textContent = String(def.number);
      surface.appendChild(num);

      var hotspots = config.hotspots && config.hotspots[def.number];
      // A page with a video hotspot supports only that video interaction -
      // no image enlargement, so the two overlays can't fight over the
      // same click (e.g. Volume 4, page 14, but detected generically from
      // the volume's hotspot config rather than hard-coded).
      var isVideoPage = !!(hotspots && hotspots.some(function (hs) {
        return !!hs.video;
      }));

      if (!isVideoPage) {
        // Covers the whole artwork so clicking/tapping it opens the enlarged
        // view. Uses the same stopPropagation pattern as the video hotspots
        // below (StPageFlip listens for mousedown/touchstart on the book to
        // start a click-to-turn-page gesture, so all of these need to be
        // stopped here, not just "click").
        var zoomHotspot = document.createElement("div");
        zoomHotspot.className = "artwork-zoom-hotspot";
        zoomHotspot.style.left = "0%";
        zoomHotspot.style.top = "0%";
        zoomHotspot.style.width = "100%";
        zoomHotspot.style.height = "100%";
        zoomHotspot.setAttribute("role", "button");
        zoomHotspot.setAttribute("tabindex", "0");
        zoomHotspot.setAttribute("aria-label", "View enlarged artwork");
        var zoomTouchActivated = false;
        zoomHotspot.addEventListener("mousedown", function (e) {
          e.stopPropagation();
        });
        zoomHotspot.addEventListener("mouseup", function (e) {
          e.stopPropagation();
        });
        zoomHotspot.addEventListener("touchstart", function (e) {
          e.stopPropagation();
        });
        zoomHotspot.addEventListener("touchend", function (e) {
          e.stopPropagation();
          e.preventDefault();
          zoomTouchActivated = true;
          openZoom(def.src);
        });
        zoomHotspot.addEventListener("click", function (e) {
          e.stopPropagation();
          if (zoomTouchActivated) {
            zoomTouchActivated = false;
            return;
          }
          openZoom(def.src);
        });
        zoomHotspot.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            openZoom(def.src);
          }
        });
        surface.appendChild(zoomHotspot);
      }

      if (hotspots) {
        hotspots.forEach(function (hs) {
          var spot = document.createElement("div");
          spot.className = "page-hotspot";
          spot.style.left = hs.left + "%";
          spot.style.top = hs.top + "%";
          spot.style.width = hs.width + "%";
          spot.style.height = hs.height + "%";
          spot.setAttribute("role", "button");
          spot.setAttribute("tabindex", "0");
          spot.setAttribute("aria-label", hs.label || "Play video");
          // StPageFlip listens for mousedown/touchstart on the book (to
          // start a click-to-turn-page gesture) and for mouseup/touchend
          // on window (to finish it), so all four need to be stopped here
          // - stopping only "click" is too late and lets the page turn
          // silently underneath the video overlay.
          var touchActivated = false;
          spot.addEventListener("mousedown", function (e) {
            e.stopPropagation();
          });
          spot.addEventListener("mouseup", function (e) {
            e.stopPropagation();
          });
          spot.addEventListener("touchstart", function (e) {
            e.stopPropagation();
          });
          spot.addEventListener("touchend", function (e) {
            // preventDefault here (rather than relying on the browser's
            // synthetic click that normally follows a tap) because
            // stopping propagation on touch events suppresses that
            // synthetic click in some browsers, silently swallowing taps.
            e.stopPropagation();
            e.preventDefault();
            touchActivated = true;
            openVideo(hs.video);
          });
          spot.addEventListener("click", function (e) {
            e.stopPropagation();
            if (touchActivated) {
              touchActivated = false;
              return;
            }
            openVideo(hs.video);
          });
          spot.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              openVideo(hs.video);
            }
          });
          surface.appendChild(spot);
        });
      }

      div.appendChild(surface);
    } else if (def.kind === "instructions") {
      div.className = "page page-instructions";
      div.setAttribute("data-density", "hard");
      var text = document.createElement("div");
      text.className = "instructions-text";
      text.textContent = def.text;
      div.appendChild(text);
      div.addEventListener("click", goToMenu);
    }

    return div;
  }

  function goToMenu() {
    window.location.href = "index.html";
  }

  function openVideo(src) {
    hotspotVideoEl.src = src;
    hotspotVideoEl.loop = true;
    videoOverlayEl.classList.remove("hidden");
    videoOverlayOpen = true;
    hotspotVideoEl.currentTime = 0;
    hotspotVideoEl.play().catch(function () {
      /* ignore autoplay rejection */
    });
  }

  function closeVideo() {
    videoOverlayEl.classList.add("hidden");
    videoOverlayOpen = false;
    hotspotVideoEl.pause();
    hotspotVideoEl.removeAttribute("src");
    hotspotVideoEl.load();
  }

  videoCloseBtn.addEventListener("click", closeVideo);

  function updateIndicator() {
    if (!pageFlip) return;
    var current = pageFlip.getCurrentPageIndex() + 1;
    indicatorEl.textContent = current + " / " + TOTAL_PAGES;
    prevBtn.disabled = false;
    nextBtn.disabled = false;
  }

  function goNext() {
    if (!pageFlip || videoOverlayOpen || zoomOpen) return;
    if (pageFlip.getCurrentPageIndex() >= LAST_INDEX) {
      goToMenu();
      return;
    }
    pageFlip.flipNext();
  }

  function goPrev() {
    if (!pageFlip || videoOverlayOpen || zoomOpen) return;
    if (pageFlip.getCurrentPageIndex() <= 0) {
      goToMenu();
      return;
    }
    pageFlip.flipPrev();
  }

  function mount(layout, restoreIndex) {
    if (pageFlip) {
      try {
        pageFlip.destroy();
      } catch (e) {
        /* ignore */
      }
      pageFlip = null;
    }

    var oldBook = document.getElementById("book");
    if (oldBook && oldBook.parentNode) {
      oldBook.parentNode.removeChild(oldBook);
    }

    var bookEl = document.createElement("div");
    bookEl.id = "book";
    bookEl.style.width = layout.totalWidth + "px";
    bookEl.style.height = layout.totalHeight + "px";
    stageEl.insertBefore(bookEl, prevBtn);

    pageDefs.forEach(function (def) {
      bookEl.appendChild(buildPageEl(def));
    });

    pageFlip = new St.PageFlip(bookEl, {
      width: layout.pageWidth,
      height: layout.pageHeight,
      size: "fixed",
      minWidth: layout.pageWidth,
      maxWidth: layout.pageWidth,
      minHeight: layout.pageHeight,
      maxHeight: layout.pageHeight,
      maxShadowOpacity: 0.5,
      showCover: true,
      mobileScrollSupport: false,
      usePortrait: true,
      autoSize: false,
      clickEventForward: true,
      useMouseEvents: true,
      swipeDistance: 20,
      flippingTime: 700,
      drawShadow: true
    });

    pageFlip.loadFromHTML(bookEl.querySelectorAll(".page"));

    pageFlip.on("init", function () {
      if (restoreIndex > 0) {
        pageFlip.turnToPage(restoreIndex);
      }
      updateIndicator();
      loadingEl.classList.add("hidden");
    });

    pageFlip.on("flip", updateIndicator);
    pageFlip.on("changeState", updateIndicator);
  }

  function handleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var layout = computeLayout();
      if (
        lastLayout &&
        lastLayout.pageWidth === layout.pageWidth &&
        lastLayout.pageHeight === layout.pageHeight
      ) {
        return;
      }
      lastLayout = layout;
      var idx = pageFlip ? pageFlip.getCurrentPageIndex() : 0;
      mount(layout, idx);
    }, 150);
  }

  lastLayout = computeLayout();
  mount(lastLayout, 0);

  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", handleResize);

  prevBtn.addEventListener("click", goPrev);

  nextBtn.addEventListener("click", goNext);

  document.addEventListener("keydown", function (e) {
    if (videoOverlayOpen) {
      if (e.key === "Escape") {
        closeVideo();
      }
      return;
    }
    if (zoomOpen) {
      if (e.key === "Escape") {
        closeZoom();
      }
      return;
    }
    if (!pageFlip) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") {
      goNext();
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      goPrev();
    } else if (e.key === "Home") {
      pageFlip.turnToPage(0);
    } else if (e.key === "End") {
      pageFlip.turnToPage(LAST_INDEX);
    }
  });

  window.addEventListener("resize", function () {
    if (!zoomOpen) return;
    positionZoomFrame();
    zoomScale = 1;
    zoomPanX = 0;
    zoomPanY = 0;
    zoomFrameEl.style.transition = "none";
    applyZoomTransform();
  });

  // Clicking the backdrop (i.e. any click that reaches the overlay itself
  // rather than being stopped by the frame/close-button handlers below)
  // closes the zoom view.
  zoomOverlayEl.addEventListener("click", closeZoom);

  zoomCloseBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    closeZoom();
  });

  // A stationary click/tap on the image steps the zoom in (toward the
  // click point); a drag pans instead. Disambiguated in the mouseup/
  // touchend handlers below via endZoomDrag()'s "moved" flag - a plain
  // click listener would fire for both and can't tell them apart.
  zoomFrameEl.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  zoomFrameEl.addEventListener("dblclick", function (e) {
    e.stopPropagation();
    e.preventDefault();
    resetZoom(true);
  });

  function onZoomMouseMove(e) {
    updateZoomDrag(e.clientX, e.clientY);
  }

  function onZoomMouseUp(e) {
    window.removeEventListener("mousemove", onZoomMouseMove);
    window.removeEventListener("mouseup", onZoomMouseUp);
    var moved = endZoomDrag();
    if (!moved) {
      stepZoomIn(e.clientX, e.clientY);
    }
  }

  zoomFrameEl.addEventListener("mousedown", function (e) {
    e.stopPropagation();
    beginZoomDrag(e.clientX, e.clientY);
    window.addEventListener("mousemove", onZoomMouseMove);
    window.addEventListener("mouseup", onZoomMouseUp);
  });

  zoomFrameEl.addEventListener(
    "touchstart",
    function (e) {
      e.stopPropagation();
      if (e.touches.length !== 1) {
        endZoomDrag();
        return;
      }
      var t = e.touches[0];
      beginZoomDrag(t.clientX, t.clientY);
    },
    { passive: true }
  );

  zoomFrameEl.addEventListener(
    "touchmove",
    function (e) {
      if (!zoomDrag || e.touches.length !== 1) return;
      var t = e.touches[0];
      updateZoomDrag(t.clientX, t.clientY);
      // Only swallow the native scroll/zoom gesture once actually panning a
      // zoomed-in image - at scale 1 there's nothing to pan, so leave the
      // page's own touch handling (StPageFlip's swipe-to-turn) alone.
      if (zoomScale > 1) e.preventDefault();
    },
    { passive: false }
  );

  zoomFrameEl.addEventListener("touchend", function (e) {
    e.stopPropagation();
    e.preventDefault();
    var moved = endZoomDrag();
    if (moved) return;
    var t = e.changedTouches[0];
    var now = Date.now();
    var isDoubleTap =
      now - lastTapTime < 350 &&
      Math.abs(t.clientX - lastTapX) < 30 &&
      Math.abs(t.clientY - lastTapY) < 30;
    lastTapTime = isDoubleTap ? 0 : now;
    lastTapX = t.clientX;
    lastTapY = t.clientY;
    if (isDoubleTap) {
      resetZoom(true);
    } else {
      stepZoomIn(t.clientX, t.clientY);
    }
  });

  // Scroll-wheel / trackpad zoom, anchored under the cursor, continuous
  // between the same 1x-2.5x bounds the click steps use.
  zoomOverlayEl.addEventListener(
    "wheel",
    function (e) {
      if (!zoomOpen) return;
      e.preventDefault();
      var factor = Math.pow(1.0015, -e.deltaY);
      zoomTowardPoint(e.clientX, e.clientY, zoomScale * factor, false);
    },
    { passive: false }
  );

})();
