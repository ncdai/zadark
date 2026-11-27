const os = require('os')
const path = require('path')
const packageJSON = require('./package.json')

const PLATFORM = os.platform()
const OS_NAME = PLATFORM === 'darwin' ? 'macOS' : 'Windows'
const IS_MAC = PLATFORM === 'darwin'
const IS_WIN = PLATFORM === 'win32'

const ZADARK_VERSION = packageJSON.version

const ZADARK_TMP_PATH = path.join(os.homedir(), 'zadark-tmp')

const ZADARK_API_DOMAIN = process.env.NODE_ENV === 'development'
  ? 'http://localhost:5555'
  : 'https://api.zadark.com'

const ZALO_PROCESS_NAMES = IS_MAC
  ? ['zalo']
  : ['zalo.exe']

const DEFAULT_ZALO_PATH = IS_MAC
  ? '/Applications/Zalo.app' // ! Can't be changed
  : os.homedir() + '/AppData/Local/Programs/Zalo' // ! Can't be changed

const EXAMPLE_CUSTOM_ZALO_PATH = IS_MAC
  ? '/ThuMucDaCaiZalo/Zalo.app'
  : 'D:\\ThuMucDaCaiZalo\\Zalo'

const COMMON_ERRORS_URL = IS_MAC
  ? 'https://zadark.com/pc/macos#common-errors'
  : 'https://zadark.com/pc/windows#common-errors'

const DOCS_URL = IS_MAC
  ? 'https://zadark.com/pc/macos'
  : 'https://zadark.com/pc/windows'

const INSTALL_ON_NEW_ZALO_PC_URL = IS_MAC
  ? 'https://zadark.com/pc/macos#install-zadark-on-new-zalo-pc'
  : 'https://zadark.com/pc/windows#install-zadark-on-new-zalo-pc'

const CONTACT_URL = 'https://zadark.com/contact'

module.exports = {
  PLATFORM,
  OS_NAME,
  IS_MAC,
  IS_WIN,

  ZADARK_VERSION,
  ZADARK_TMP_PATH,
  ZADARK_API_DOMAIN,

  ZALO_PROCESS_NAMES,
  DEFAULT_ZALO_PATH,
  EXAMPLE_CUSTOM_ZALO_PATH,

  COMMON_ERRORS_URL,
  DOCS_URL,
  INSTALL_ON_NEW_ZALO_PC_URL,
  CONTACT_URL
}
