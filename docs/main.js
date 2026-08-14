/* Desktop Claw website — the small amount of behaviour the page needs. */

(function () {
  'use strict'

  /* ------------------------------------------------------ platform tabs -- */

  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab[data-tab]'))
  var panels = Array.prototype.slice.call(document.querySelectorAll('.panel[data-panel]'))

  function selectPlatform(name) {
    var known = tabs.some(function (tab) {
      return tab.dataset.tab === name
    })

    if (!known) {
      return
    }

    tabs.forEach(function (tab) {
      tab.setAttribute('aria-selected', String(tab.dataset.tab === name))
    })

    panels.forEach(function (panel) {
      panel.hidden = panel.dataset.panel !== name
    })
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      selectPlatform(tab.dataset.tab)
    })
  })

  // Pre-select the visitor's platform, falling back to the Windows panel that
  // the markup already has open when detection is inconclusive.
  function detectPlatform(haystack) {
    if (/android/.test(haystack)) {
      return null // the app isn't for Android
    }
    if (/win/.test(haystack)) {
      return 'windows'
    }
    if (/mac|iphone|ipad|ipod/.test(haystack)) {
      return 'macos'
    }
    if (/linux|x11|cros/.test(haystack)) {
      return 'linux'
    }
    return null
  }

  if (tabs.length > 0) {
    var uaData = navigator.userAgentData
    var platform = ((uaData && uaData.platform) || navigator.platform || '').toLowerCase()
    var detected = detectPlatform(navigator.userAgent.toLowerCase() + ' ' + platform)

    if (detected !== null) {
      selectPlatform(detected)
    }
  }

  /* --------------------------------------------------- screenshot viewer -- */

  var lightbox = document.getElementById('lightbox')
  var lightboxImg = document.getElementById('lightbox-img')

  function openLightbox(img) {
    if (lightbox === null || lightboxImg === null) {
      return
    }
    lightboxImg.src = img.currentSrc || img.src
    lightboxImg.alt = img.alt
    lightbox.classList.add('is-open')
    document.body.style.overflow = 'hidden'
  }

  function closeLightbox() {
    if (lightbox === null || lightboxImg === null) {
      return
    }
    lightbox.classList.remove('is-open')
    lightboxImg.src = ''
    document.body.style.overflow = ''
  }

  document.querySelectorAll('.js-shot').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      var img = trigger.querySelector('img')
      if (img !== null) {
        openLightbox(img)
      }
    })
  })

  // Clicking the backdrop (anything but the image itself) closes the viewer.
  if (lightbox !== null) {
    lightbox.addEventListener('click', function (event) {
      if (event.target !== lightboxImg) {
        closeLightbox()
      }
    })
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && lightbox !== null && lightbox.classList.contains('is-open')) {
      closeLightbox()
    }
  })

  /* ------------------------------------------------------------ footer -- */

  var year = document.getElementById('year')
  if (year !== null) {
    year.textContent = String(new Date().getFullYear())
  }
})()
