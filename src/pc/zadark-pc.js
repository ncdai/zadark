const fs = require('fs-extra')
const path = require('path')
const crossSpawn = require('cross-spawn')
const asar = require('@electron/asar')
const HTMLParser = require('node-html-parser')
const glob = require('glob')

const { printDebug, printError, isDirectory, isFile } = require('./utils')

const { PLATFORM, IS_MAC, IS_WIN, OS_NAME, ZADARK_VERSION, ZADARK_TMP_PATH, ZALO_PROCESS_NAMES, ZADARK_API_DOMAIN, INSTALL_ON_NEW_ZALO_PC_URL } = require('./constants')

const psList = require('./packages/ps-list')

const getVersionFromPath = (str) => {
  const match = str.match(/Zalo-(\d+\.\d+\.\d+)/)
  return match ? match[1] : '0.0.0'
}

const parseVersion = (version) => version.split('.').map(Number)

const compareVersionPaths = (pathA, pathB) => {
  const versionA = parseVersion(getVersionFromPath(pathA))
  const versionB = parseVersion(getVersionFromPath(pathB))

  for (let i = 0; i < 3; i++) {
    if (versionA[i] !== versionB[i]) {
      return versionA[i] - versionB[i]
    }
  }

  return 0
}

/**
 * Get Zalo resources directory list
 * @param {string} customZaloPath - The custom Zalo path
 * @returns {string[]} - The Zalo resources directory list
 * @throws {Error} - Throws error if the platform is not supported
 * @throws {Error} - Throws error if the resources directory list is empty
 */
const getZaloResDirList = (customZaloPath) => {
  if (!['darwin', 'win32'].includes(PLATFORM)) {
    throw new Error(`Khong ho tro he dieu hanh "${PLATFORM}" (E006).`)
  }

  const resourcesPath = IS_MAC
    ? path.join(customZaloPath, './Contents/Resources')
    : path.join(customZaloPath, './Zalo-*/resources')

  const resources = glob.sync(resourcesPath)

  if (!Array.isArray(resources) || !resources.length) {
    return []
  }

  return resources.sort(compareVersionPaths)
}

/**
 * Get Zalo process IDs
 * @returns {Promise<number[]>} - The Zalo process IDs
 * @throws {Error} - Throws error if the Zalo process names are not found
 */
const getZaloProcessIds = async () => {
  try {
    const processes = await psList()

    const pids = processes
      .filter((process) => typeof process.name === 'string' && ZALO_PROCESS_NAMES.includes(process.name.toLowerCase()))
      .map((process) => process.pid)

    return pids
  } catch (error) {
    throw new Error('Vui long tat Zalo PC truoc khi cai dat ZaDark (E007).')
  }
}

/**
 * Removes all CSS and JavaScript files from the document that have filenames starting with "zadark".
 *
 * @param {Object} params - The parameters for the function.
 * @param {HTMLElement} params.headElement - The `<head>` element of the document, used to search for `<link>` elements.
 * @param {HTMLElement} params.bodyElement - The `<body>` element of the document, used to search for `<script>` elements.
 */
const removeZaDarkCSSAndJS = ({ headElement, bodyElement }) => {
  const elementsToRemove = [
    {
      selector: 'link[href^="zadark"]',
      htmlElement: headElement
    },
    {
      selector: 'script[src^="zadark"]',
      htmlElement: bodyElement
    }
  ]

  elementsToRemove.forEach(({ selector, htmlElement }) => {
    const elements = htmlElement.querySelectorAll(selector)
    elements.forEach((element) => {
      element.remove()
    })
  })
}

/**
 * Updates the Content-Security-Policy (CSP) meta tag in the provided HTML element.
 *
 * @param {HTMLElement} htmlElement - The HTML element to search for the Content-Security-Policy meta tag.
 *
 * @throws Will throw an error if `ZADARK_API_DOMAIN` is not defined in the scope.
 */
const updateMetaContentSecurityPolicyTag = (htmlElement) => {
  const metaTag = htmlElement.querySelector('meta[http-equiv="Content-Security-Policy"]')

  if (!metaTag) {
    printError('- updateContentSecurityPolicy:', 'skip: metaTag not found.')
    return
  }

  let contentValue = metaTag.getAttribute('content')

  if (contentValue.indexOf('https://fonts.googleapis.com') === -1) {
    const regex = /style-src[^;]*/
    contentValue = contentValue.replace(regex, '$& https://fonts.googleapis.com')
  }

  if (contentValue.indexOf(ZADARK_API_DOMAIN) === -1) {
    const regexConnect = /connect-src[^;]*/
    contentValue = contentValue.replace(regexConnect, `$& ${ZADARK_API_DOMAIN}`)
  }

  printDebug('- updateContentSecurityPolicy')
  metaTag.setAttribute('content', contentValue)
}

/**
 * Modifies the `index.html` file located in the specified Zalo directory by adding necessary CSS,
 * JavaScript files, and attributes required for the ZaDark theme.
 *
 * @param {string} zaloDir - The directory where the Zalo application is located.
 *                           This is the base path for the `index.html` file.
 *
 * @throws {Error} If the `index.html` file does not exist at the expected path.
 */
const writeIndexFile = (zaloDir) => {
  const src = 'pc-dist/index.html'
  const srcPath = path.join(zaloDir, `app/${src}`)

  if (!isFile(srcPath)) {
    throw new Error(srcPath + ' khong ton tai (E005).')
  }

  const indexHTMLContent = fs.readFileSync(srcPath, 'utf8')
  const root = HTMLParser.parse(indexHTMLContent)

  const htmlElement = root.getElementsByTagName('html')[0]
  const headElement = root.getElementsByTagName('head')[0]
  const bodyElement = root.getElementsByTagName('body')[0]

  removeZaDarkCSSAndJS({ headElement, bodyElement })

  // Required fonts, stylesheets and scripts
  const elements = [
    // Required fonts
    {
      where: 'beforeend',
      html: '<link rel="stylesheet" href="zadark/css/zadark-fonts.min.css">',
      htmlElement: headElement
    },
    // Required stylesheets
    {
      where: 'beforeend',
      html: '<link rel="stylesheet" href="zadark/css/zadark.min.css">',
      htmlElement: headElement
    },
    {
      where: 'beforeend',
      html: '<link rel="stylesheet" href="zadark/css/zadark-popup.min.css">',
      htmlElement: headElement
    },
    // Required scripts
    {
      where: 'beforeend',
      html: '<script src="zadark/libs/zadark-jquery.min.js"></script>',
      htmlElement: bodyElement
    },
    {
      where: 'beforeend',
      html: '<script src="zadark/libs/zadark-popper.min.js"></script>',
      htmlElement: bodyElement
    },
    {
      where: 'beforeend',
      html: '<script src="zadark/libs/zadark-tippy.min.js"></script>',
      htmlElement: bodyElement
    },
    {
      where: 'beforeend',
      html: '<script src="zadark/libs/zadark-hotkeys-js.min.js"></script>',
      htmlElement: bodyElement
    },
    {
      where: 'beforeend',
      html: '<script src="zadark/libs/zadark-toastify.min.js"></script>',
      htmlElement: bodyElement
    },
    {
      where: 'beforeend',
      html: '<script src="zadark/libs/zadark-webfont.min.js"></script>',
      htmlElement: bodyElement
    },
    {
      where: 'beforeend',
      html: '<script src="zadark/libs/zadark-introjs.min.js"></script>',
      htmlElement: bodyElement
    },
    {
      where: 'beforeend',
      html: '<script src="zadark/libs/zadark-localforage.min.js"></script>',
      htmlElement: bodyElement
    },
    {
      where: 'beforeend',
      html: '<script src="zadark/js/zadark-shared.min.js"></script>',
      htmlElement: bodyElement
    },
    {
      where: 'beforeend',
      html: '<script src="zadark/js/zadark-translate.min.js"></script>',
      htmlElement: bodyElement
    },
    {
      where: 'beforeend',
      html: '<script src="zadark/js/zadark-zconv.min.js"></script>',
      htmlElement: bodyElement
    },
    {
      where: 'beforeend',
      html: '<script src="zadark/js/zadark-reaction.min.js"></script>',
      htmlElement: bodyElement
    },
    {
      where: 'beforeend',
      html: '<script src="zadark/js/zadark.min.js"></script>',
      htmlElement: bodyElement
    }
  ]
  elements.forEach((element) => {
    const { where, html, htmlElement } = element
    htmlElement.insertAdjacentHTML(where, html)
  })

  // Required themeAttributes
  htmlElement.setAttribute('data-zadark-version', ZADARK_VERSION)
  htmlElement.setAttribute('data-zadark-os', OS_NAME)

  updateMetaContentSecurityPolicyTag(headElement)

  // Required classNames
  const zaDarkClassNames = ['zadark', 'zadark-pc', `zadark-${PLATFORM}`]
  zaDarkClassNames.forEach((className) => {
    bodyElement.classList.add(className)
  })

  printDebug('- writeFile:', srcPath)
  fs.writeFileSync(srcPath, root.toString())
}

/**
 * Modifies the `bootstrap.js` file located in the specified Zalo directory by inserting a
 * required `zadark-main.min` module if it doesn't already exist.
 *
 * @param {string} zaloDir - The directory where the Zalo application is located.
 *                           This is the base path for the `bootstrap.js` file.
 */
const writeBootstrapFile = (zaloDir) => {
  const src = 'bootstrap.js'
  const srcPath = path.join(zaloDir, `app/${src}`)

  if (!isFile(srcPath)) {
    printError('- writeFile:', srcPath, 'skip: file does not exist.')
    return
  }

  const bootstrapContent = fs.readFileSync(srcPath, 'utf8')
  const contentToInsert = "require('./pc-dist/zadark/js/zadark-main.min');"

  if (bootstrapContent.includes(contentToInsert)) {
    printDebug('- writeFile:', srcPath, 'skip: content already exists.')
    return
  }

  const contentToFind = "require('./main-dist/main');"
  const insertionIndex = bootstrapContent.indexOf(contentToFind) + contentToFind.length
  const insertedContent = `${bootstrapContent.slice(0, insertionIndex)}\n    ${contentToInsert}${bootstrapContent.slice(insertionIndex)}`

  printDebug('- writeFile:', srcPath)
  fs.writeFileSync(srcPath, insertedContent)
}

/**
 * Modifies the `znotification.html` file located in the specified Zalo directory by adding necessary
 * CSS, JavaScript files, and class names required for the ZaDark theme.
 *
 * @param {string} zaloDir - The directory where the Zalo application is located.
 *                           This is the base path for the `znotification.html` file.
 */
const writeZNotificationFile = (zaloDir) => {
  const src = 'pc-dist/znotification.html'
  const srcPath = path.join(zaloDir, `app/${src}`)

  if (!isFile(srcPath)) {
    printError('- writeFile:', srcPath, 'skip: file does not exist.')
    return
  }

  const htmlContent = fs.readFileSync(srcPath, 'utf8')
  const root = HTMLParser.parse(htmlContent)

  const headElement = root.getElementsByTagName('head')[0]
  const bodyElement = root.getElementsByTagName('body')[0]

  removeZaDarkCSSAndJS({ headElement, bodyElement })

  // Required stylesheets and scripts
  const elements = [
    {
      where: 'beforeend',
      html: '<link rel="stylesheet" href="zadark/css/zadark-znotification.min.css">',
      htmlElement: headElement
    },
    {
      where: 'beforeend',
      html: '<script src="zadark/libs/zadark-webfont.min.js"></script>',
      htmlElement: bodyElement
    },
    {
      where: 'beforeend',
      html: '<script src="zadark/js/zadark-znotification.min.js"></script>',
      htmlElement: bodyElement
    }
  ]
  elements.forEach((element) => {
    const { where, html, htmlElement } = element
    htmlElement.insertAdjacentHTML(where, html)
  })

  // Required classNames
  const zaDarkClassNames = ['zadark', 'zadark-pc', `zadark-${PLATFORM}`]
  zaDarkClassNames.forEach((className) => {
    bodyElement.classList.add(className)
  })

  printDebug('- writeFile:', srcPath)
  fs.writeFileSync(srcPath, root.toString())
}

/**
 * @param {string} zaloDir - The directory where the Zalo application is located.
 *                           This is the base path for the `popup-viewer.html` file.
 */
const writePopupViewerFile = (zaloDir) => {
  const src = 'pc-dist/popup-viewer.html'
  const srcPath = path.join(zaloDir, `app/${src}`)

  if (!isFile(srcPath)) {
    printError('- writeFile:', srcPath, 'skip: file does not exist.')
    return
  }

  const htmlContent = fs.readFileSync(srcPath, 'utf8')
  const root = HTMLParser.parse(htmlContent)

  const headElement = root.getElementsByTagName('head')[0]
  const bodyElement = root.getElementsByTagName('body')[0]

  removeZaDarkCSSAndJS({ headElement, bodyElement })

  // Required scripts
  const elements = [
    {
      where: 'beforeend',
      html: '<script src="zadark/js/zadark-popup-viewer.min.js"></script>',
      htmlElement: bodyElement
    }
  ]
  elements.forEach((element) => {
    const { where, html, htmlElement } = element
    htmlElement.insertAdjacentHTML(where, html)
  })

  updateMetaContentSecurityPolicyTag(headElement)

  // Required classNames
  const zaDarkClassNames = ['zadark', 'zadark-pc', `zadark-${PLATFORM}`]
  zaDarkClassNames.forEach((className) => {
    bodyElement.classList.add(className)
  })

  printDebug('- writeFile:', srcPath)
  fs.writeFileSync(srcPath, root.toString())
}

/**
  * Copies the ZaDark assets to the specified Zalo directory.
  * @param {string} zaloDir - The directory where the Zalo application is located.
 */
const copyZaDarkAssets = (zaloDir) => {
  const src = path.join(__dirname, './assets')
  const dest = path.join(zaloDir, 'app/pc-dist/zadark')
  printDebug('- copyDir:', src, '>', dest)
  fs.copySync(src, dest)
}

/**
 * Builds an `unpack` glob pattern for `asar.createPackageWithOptions` that matches the files
 * stored in `app.asar.unpacked` by the original archive, so the repacked archive keeps them unpacked.
 *
 * @param {string} archivePath - The path to the original `app.asar` file.
 * @param {string} srcDir - The directory the archive was extracted to (and will be packed from).
 *
 * @returns {string|undefined} The glob pattern, or `undefined` if the archive has no unpacked files.
 */
const getUnpackPattern = (archivePath, srcDir) => {
  const { header } = asar.getRawHeader(archivePath)

  // Collapse directories whose files are all unpacked into a single "dir/**" pattern.
  // "**" does not match dotfiles, so `dotPatterns` keeps the patterns still needed for them.
  const collect = (node, segments) => {
    if (!node.files) {
      return { isAllUnpacked: !!node.unpacked, patterns: node.unpacked ? [segments] : [], dotPatterns: [] }
    }

    const results = Object.entries(node.files).map(([name, child]) => ({ name, ...collect(child, [...segments, name]) }))
    const isAllUnpacked = results.length > 0 && results.every((result) => result.isAllUnpacked)

    if (!isAllUnpacked) {
      return { isAllUnpacked, patterns: results.flatMap((result) => result.patterns), dotPatterns: [] }
    }

    const dotPatterns = results.flatMap((result) => result.name.startsWith('.') ? result.patterns : result.dotPatterns)
    return { isAllUnpacked, patterns: [[...segments, '**'], ...dotPatterns], dotPatterns }
  }

  const { patterns } = collect(header, [])
  if (!patterns.length) {
    return undefined
  }

  // minimatch converts "\" to "/" on Windows, so glob characters cannot be escaped.
  // Replace them with "?" (any single character) instead.
  const toGlobSegment = (segment) => segment.replace(/[*?[\]{}()!+@,|\\]/g, '?')
  const srcSegments = path.resolve(srcDir).split(path.sep).map(toGlobSegment)

  const globs = patterns.map((segments) => {
    return [...srcSegments, ...segments.map((segment) => segment === '**' ? segment : toGlobSegment(segment))].join('/')
  })

  return globs.length === 1 ? globs[0] : `{${globs.join(',')}}`
}

// Electron stores the state of its "fuses" as a wire of bytes that follows a fixed
// sentinel string inside the main binary. See https://www.electronjs.org/docs/latest/tutorial/fuses
const FUSE_SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX')
const FUSE_STATE = { DISABLE: 0x30, ENABLE: 0x31 } // '0' / '1'
// Position of "EnableEmbeddedAsarIntegrityValidation" in the FuseV1 wire (0-indexed)
const ASAR_INTEGRITY_FUSE_INDEX = 4

// Opt-in flag (env var ZADARK_DISABLE_ASAR_INTEGRITY=1). When set, ZaDark disables Zalo's ASAR
// integrity validation so the patched `app.asar` can load on versions that enforce it.
// It is OFF by default on purpose: ZaDark never disables Zalo's protection unless the user
// deliberately opts in, having accepted the risks (see the docs linked from the E011 error).
const isAsarIntegrityBypassEnabled = () => process.env.ZADARK_DISABLE_ASAR_INTEGRITY === '1'

/**
 * Resolves the path to Zalo's main Electron binary, which carries the Electron fuses.
 *
 * @param {string} zaloDir - The Zalo "resources" directory (`.../Contents/Resources` on macOS,
 *   `.../Zalo-<version>/resources` on Windows).
 *
 * @returns {string} The path to the Electron binary.
 */
const getElectronBinaryPath = (zaloDir) => {
  return IS_MAC
    ? path.join(zaloDir, '../Frameworks/Electron Framework.framework/Electron Framework')
    : path.join(zaloDir, '../Zalo.exe')
}

/**
 * Finds every offset of the Electron fuse sentinel in a binary, scanning in chunks so the whole
 * file (the Windows binary is ~240MB) never has to be read into memory at once.
 *
 * @param {number} fd - An open file descriptor.
 * @param {number} fileSize - The size of the file in bytes.
 *
 * @returns {number[]} The sentinel offsets (universal macOS binaries contain one per architecture).
 */
const findFuseSentinels = (fd, fileSize) => {
  const CHUNK_SIZE = 1 << 20
  const overlap = FUSE_SENTINEL.length - 1
  const buf = Buffer.alloc(CHUNK_SIZE)
  const offsets = []

  let filePos = 0
  let tail = Buffer.alloc(0)

  while (filePos < fileSize) {
    const bytesRead = fs.readSync(fd, buf, 0, CHUNK_SIZE, filePos)
    if (bytesRead <= 0) break

    const haystack = Buffer.concat([tail, buf.subarray(0, bytesRead)])
    let from = 0
    let index
    while ((index = haystack.indexOf(FUSE_SENTINEL, from)) !== -1) {
      offsets.push(filePos - tail.length + index)
      from = index + 1
    }

    tail = Buffer.from(haystack.subarray(Math.max(0, haystack.length - overlap)))
    filePos += bytesRead
  }

  return offsets
}

const getAsarIntegrityFusePos = (sentinelOffset) => sentinelOffset + FUSE_SENTINEL.length + 2 + ASAR_INTEGRITY_FUSE_INDEX

/**
 * Reads the state of Zalo's ASAR integrity validation fuse.
 *
 * @param {string} zaloDir - The Zalo "resources" directory.
 *
 * @returns {'enabled'|'disabled'|null} The fuse state, or `null` when the binary is missing or has
 *   no fuse wire (older Electron builds).
 */
const readAsarIntegrityFuseState = (zaloDir) => {
  const binaryPath = getElectronBinaryPath(zaloDir)
  if (!isFile(binaryPath)) {
    return null
  }

  const fd = fs.openSync(binaryPath, 'r')
  try {
    const { size } = fs.fstatSync(fd)
    const [sentinelOffset] = findFuseSentinels(fd, size)
    if (sentinelOffset === undefined) {
      return null
    }

    const state = Buffer.alloc(1)
    fs.readSync(fd, state, 0, 1, getAsarIntegrityFusePos(sentinelOffset))
    return state[0] === FUSE_STATE.ENABLE ? 'enabled' : 'disabled'
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * @param {string} zaloDir - The Zalo "resources" directory.
 * @returns {boolean} `true` if the ASAR integrity validation fuse exists and is enabled.
 */
const isAsarIntegrityEnabled = (zaloDir) => readAsarIntegrityFuseState(zaloDir) === 'enabled'

/**
 * Flips Zalo's ASAR integrity validation fuse, so the patched `app.asar` is accepted. On macOS this
 * invalidates Zalo's code signature, so the app bundle is re-signed ad-hoc; be aware that this
 * breaks Keychain access and the user will have to sign in to Zalo again.
 *
 * @param {string} zaloDir - The Zalo "resources" directory.
 * @param {boolean} enable - `true` to re-enable the fuse (restore protection), `false` to disable it.
 *
 * @throws {Error} If the fuse cannot be changed or the macOS re-signing fails.
 *
 * @returns {void}
 */
const setZaloAsarIntegrity = (zaloDir, enable) => {
  const binaryPath = getElectronBinaryPath(zaloDir)
  if (!isFile(binaryPath)) {
    return
  }

  const fd = fs.openSync(binaryPath, 'r+')
  let sentinelCount = 0
  try {
    const { size } = fs.fstatSync(fd)
    const offsets = findFuseSentinels(fd, size)
    sentinelCount = offsets.length

    const value = Buffer.from([enable ? FUSE_STATE.ENABLE : FUSE_STATE.DISABLE])
    for (const offset of offsets) {
      fs.writeSync(fd, value, 0, 1, getAsarIntegrityFusePos(offset))
    }
  } finally {
    fs.closeSync(fd)
  }

  printDebug('- setZaloAsarIntegrity:', binaryPath, '>', enable ? 'enabled' : 'disabled', `(${sentinelCount})`)

  if (sentinelCount === 0) {
    throw new Error('Khong tim thay Electron fuses trong Zalo (E010).')
  }

  // Changing the fuse wire breaks the binary's code signature, so an arm64 macOS build will not
  // launch until it is re-signed (ad-hoc is enough).
  if (IS_MAC) {
    // Keep only `entitlements` (camera, microphone, ...); preserving `requirements` would keep
    // Zalo's original designated requirement, which an ad-hoc signature cannot satisfy, and the
    // signature would fail to verify.
    const appPath = path.resolve(zaloDir, '../..')
    const result = crossSpawn.sync('codesign', [
      '--force',
      '--deep',
      '--sign', '-',
      '--preserve-metadata=entitlements',
      appPath
    ])

    if (result.status !== 0) {
      throw new Error('Khong the ky lai Zalo.app sau khi chinh ASAR integrity (E010).')
    }
  }
}

/**
 * Installs ZaDark by updating the `app.asar` file in the specified Zalo directory with the ZaDark theme.
 *
 * @param {string} zaloDir - The directory where the Zalo application is located.
 *
 * @throws {Error} If the specified directory does not exist or if required files are missing.
 *
 * @returns {Promise<void>} A promise that resolves when the installation process is complete.
 */
const installZaDark = async (zaloDir) => {
  if (!isDirectory(zaloDir)) {
    throw new Error(zaloDir + ' khong ton tai (E001).')
  }

  const appAsarPath = path.join(zaloDir, 'app.asar')
  const appAsarBakPath = path.join(zaloDir, 'app.asar.bak')
  const appDirTmpPath = path.join(ZADARK_TMP_PATH, 'app')

  if (!isFile(appAsarPath) && !isFile(appAsarBakPath)) {
    throw new Error(zaloDir + ' khong co tap tin "app.asar" hoac "app.asar.bak" (E002).')
  }

  // Newer Zalo versions enable Electron's ASAR integrity validation and will not start once
  // `app.asar` is patched. On these versions ZaDark refuses to install, unless the user explicitly
  // opts in to disabling that protection (see isAsarIntegrityBypassEnabled).
  const isIntegrityEnabled = isAsarIntegrityEnabled(zaloDir)
  const shouldBypassIntegrity = isIntegrityEnabled && isAsarIntegrityBypassEnabled()

  if (isIntegrityEnabled && !shouldBypassIntegrity) {
    const error = new Error(
      'Zalo PC phien ban nay da bat che do bao ve (ASAR integrity) nen ZaDark chua the cai dat (E011).\n' +
      'Xem huong dan cai dat nang cao: ' + INSTALL_ON_NEW_ZALO_PC_URL
    )
    error.code = 'E011'
    throw error
  }

  if (fs.existsSync(ZADARK_TMP_PATH)) {
    printDebug('- deleteDir:', ZADARK_TMP_PATH)
    fs.rmSync(ZADARK_TMP_PATH, { recursive: true })
  }

  if (isDirectory(appAsarPath)) {
    printDebug('- deleteDir:', appAsarPath)
    fs.rmSync(appAsarPath, { recursive: true })
  }

  if (isFile(appAsarPath) && isFile(appAsarBakPath)) {
    printDebug('- deleteFile:', appAsarPath)
    fs.rmSync(appAsarPath, { recursive: true })

    printDebug('- renameFile:', appAsarBakPath, '>', appAsarPath)
    fs.renameSync(appAsarBakPath, appAsarPath)
  }

  printDebug('- createDir:', ZADARK_TMP_PATH)
  fs.mkdirSync(ZADARK_TMP_PATH, { recursive: true })

  // When reinstalling, app.asar was the extracted folder (deleted above), so restore it from the backup
  if (!fs.existsSync(appAsarPath) && isFile(appAsarBakPath)) {
    printDebug('- renameFile:', appAsarBakPath, '>', appAsarPath)
    fs.renameSync(appAsarBakPath, appAsarPath)
  }

  printDebug('- extractAsar:', appAsarPath, '>', appDirTmpPath)
  asar.uncacheAll()
  asar.extractAll(appAsarPath, appDirTmpPath)

  const unpackPattern = getUnpackPattern(appAsarPath, appDirTmpPath)

  copyZaDarkAssets(ZADARK_TMP_PATH)
  writeIndexFile(ZADARK_TMP_PATH)
  writeBootstrapFile(ZADARK_TMP_PATH)
  writePopupViewerFile(ZADARK_TMP_PATH)

  if (IS_WIN) {
    writeZNotificationFile(ZADARK_TMP_PATH)
  }

  if (!isFile(appAsarBakPath)) {
    printDebug('- renameFile:', appAsarPath, '>', appAsarBakPath)
    fs.renameSync(appAsarPath, appAsarBakPath)
  }

  // Keep the original unpacked files (native modules, dylibs, etc.) outside the archive,
  // otherwise sending images from the clipboard fails (https://github.com/ncdai/zadark/issues/190, https://github.com/ncdai/zadark/issues/199).
  printDebug('- createAsar:', appDirTmpPath, '>', appAsarPath)
  printDebug('- unpackPattern:', unpackPattern)
  await asar.createPackageWithOptions(appDirTmpPath, appAsarPath, { unpack: unpackPattern })

  if (shouldBypassIntegrity) {
    setZaloAsarIntegrity(zaloDir, false)
  }

  printDebug('- deleteDir:', ZADARK_TMP_PATH)
  fs.rmSync(ZADARK_TMP_PATH, { recursive: true })
}

/**
 * Uninstalls ZaDark by restoring the original `app.asar` file in the specified Zalo directory.
 *
 * @param {string} zaloDir - The directory where the Zalo application is located.
 *
 * @throws {Error} If the backup file `app.asar.bak` does not exist, indicating that ZaDark installation was not successful.
 *
 * @returns {Promise<void>} A promise that resolves when the uninstallation process is complete.
 */
const uninstallZaDark = (zaloDir) => {
  const appAsarPath = path.join(zaloDir, 'app.asar')
  const appAsarBakPath = path.join(zaloDir, 'app.asar.bak')

  if (!isFile(appAsarBakPath)) {
    throw new Error('Go cai dat ZaDark khong thanh cong. Vui long cai lai Zalo PC (KHONG DUOC GO ZALO PC vi se mat du lieu).')
  }

  if (fs.existsSync(appAsarPath)) {
    fs.rmSync(appAsarPath, { recursive: true })
  }

  printDebug('- renameFile:', appAsarBakPath, '>', appAsarPath)
  fs.renameSync(appAsarBakPath, appAsarPath)

  // Restore Zalo's protection if we disabled it during install (the original `app.asar` is back,
  // so integrity validation will pass again).
  if (isAsarIntegrityBypassEnabled() && readAsarIntegrityFuseState(zaloDir) === 'disabled') {
    setZaloAsarIntegrity(zaloDir, true)
  }
}

module.exports = {
  getZaloResDirList,
  getZaloProcessIds,

  installZaDark,
  uninstallZaDark
}
