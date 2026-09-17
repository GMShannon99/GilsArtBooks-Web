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
  var printBtn = document.getElementById("print-btn");
  var printFrameEl = document.getElementById("print-frame");
  var printStatusEl = document.getElementById("print-status");
  var currentPrintBlob = null;
  var printStatusTimer = null;
  var zoomOpen = false;

  // Visible, on-screen confirmation of each step of a print/share attempt -
  // window.print()'s mobile behavior is inconsistent enough (silent no-ops
  // on some Android builds and in standalone/home-screen mode) that console
  // logs alone aren't enough to diagnose from a phone that isn't attached
  // to a debugger.
  function showPrintStatus(msg) {
    console.log("[print]", msg);
    printStatusEl.textContent = msg;
    printStatusEl.classList.add("visible");
    clearTimeout(printStatusTimer);
    printStatusTimer = setTimeout(function () {
      printStatusEl.classList.remove("visible");
    }, 4000);
  }

  // Feature-detects whether navigator.share() can share an image file (Web
  // Share API level 2).
  function canShareFiles() {
    if (!window.navigator || !navigator.share || !navigator.canShare) return false;
    try {
      var probe = new File([new Blob(["x"], { type: "image/jpeg" })], "probe.jpg", {
        type: "image/jpeg"
      });
      return navigator.canShare({ files: [probe] });
    } catch (e) {
      return false;
    }
  }

  // Desktop Chrome/Edge on Windows also implements navigator.share() (it
  // opens the Windows Share flyout), but that flyout has no "Print" entry
  // and would silently replace the desktop print flow that's already known
  // to work with a worse one. So the share-first path is gated to actual
  // mobile devices, not just feature support.
  function isMobileDevice() {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
      return navigator.userAgentData.mobile;
    }
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
    // iPadOS Safari reports a desktop Mac user agent by default; tell it
    // apart from a real Mac by touch support (Macs aren't multi-touch).
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
    return false;
  }

  var SHARE_CAPABLE = isMobileDevice() && canShareFiles();

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

  // Renders the artwork into an offscreen canvas so it can be printed as a
  // real <img>. Browsers print background images only if the user opts in
  // via the print dialog's "Background graphics" toggle (off by default in
  // Chrome, Firefox, and Safari), so printing the on-screen zoom-frame
  // directly would silently come out blank for most people.
  function preparePrintImage(src, onReady) {
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      canvas.toBlob(
        function (blob) {
          onReady(canvas.toDataURL("image/jpeg", 0.92), blob);
        },
        "image/jpeg",
        0.92
      );
    };
    img.src = src;
  }

  function openZoom(src) {
    zoomFrameEl.style.backgroundImage = "url(" + src + ")";
    positionZoomFrame();
    zoomOverlayEl.classList.add("visible");
    zoomOverlayEl.setAttribute("aria-hidden", "false");
    zoomOpen = true;
    printBtn.disabled = true;
    preparePrintImage(src, function (dataUrl, blob) {
      printFrameEl.src = dataUrl;
      currentPrintBlob = blob;
      printBtn.disabled = false;
    });
  }

  function closeZoom() {
    zoomOpen = false;
    zoomOverlayEl.classList.remove("visible");
    zoomOverlayEl.setAttribute("aria-hidden", "true");
    printBtn.disabled = true;
    printFrameEl.removeAttribute("src");
    currentPrintBlob = null;
    printStatusEl.classList.remove("visible");
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
      // no image enlargement/print, so the two overlays can't fight over
      // the same click (e.g. Volume 4, page 14, but detected generically
      // from the volume's hotspot config rather than hard-coded).
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
    if (zoomOpen || !pageFlip) return;
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
    if (zoomOpen) positionZoomFrame();
  });

  zoomOverlayEl.addEventListener("click", closeZoom);

  // Confirms window.print() actually opened/closed a dialog, as opposed to
  // the call silently no-op'ing (which happens in some Android WebViews and
  // in some "added to home screen" standalone contexts with no browser
  // chrome to host the print UI).
  window.addEventListener("beforeprint", function () {
    showPrintStatus("Print dialog opened.");
  });
  window.addEventListener("afterprint", function () {
    showPrintStatus("Print dialog closed.");
  });

  printBtn.addEventListener("click", function (e) {
    // Stop the click from bubbling to zoomOverlayEl's own listener, which
    // would otherwise treat this click as "close the zoom" (same pattern
    // used for the artwork hotspot itself).
    e.stopPropagation();
    showPrintStatus("Tap registered…");

    // Prefer the share sheet where it can actually share a file: far more
    // reliable on mobile (Save Image / AirPrint / send-to-printer-app all
    // live there) than window.print(), whose in-page print support is
    // inconsistent across Android builds and doesn't work at all inside
    // browser chrome-less contexts. Both calls happen synchronously inside
    // this click handler (not after an await or a timeout) because both
    // require an active user gesture to be allowed to run at all.
    if (SHARE_CAPABLE && currentPrintBlob) {
      try {
        var file = new File([currentPrintBlob], "artwork.jpg", { type: "image/jpeg" });
        if (navigator.canShare({ files: [file] })) {
          showPrintStatus("Opening share sheet…");
          navigator
            .share({ files: [file], title: config.title })
            .then(function () {
              showPrintStatus("Shared.");
            })
            .catch(function (err) {
              if (err && err.name === "AbortError") {
                // The user dismissed the share sheet themselves - not a failure.
                showPrintStatus("Share cancelled.");
              } else {
                console.error("[print] share failed, falling back to print", err);
                showPrintStatus("Share failed, trying print…");
                window.print();
              }
            });
          return;
        }
      } catch (err) {
        // Fall through to window.print() below rather than aborting silently.
        console.error("[print] share setup threw, falling back to print", err);
      }
    }

    showPrintStatus("Opening print dialog…");
    try {
      window.print();
    } catch (err) {
      console.error("[print] window.print() threw", err);
      showPrintStatus("Print failed: " + (err && err.message ? err.message : "unknown error"));
    }
  });
})();
