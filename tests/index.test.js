// @flow
import fs from 'fs'
import { join } from 'path'
import glob from 'glob'
import { transform } from 'babel-core'
import plugin from '../src'

const fixturePath = join(__dirname, 'fixtures')

for (const dir of fs.readdirSync(fixturePath)) {
  test(`snapshot ${dir}`, () => {
    const cwd = join(fixturePath, dir)
    const input =
      glob.sync(`**/App/reducer.js`, {
        cwd,
        realpath: true
      })[0] || `${cwd}/App/reducer.js`

    const filename = join(fixturePath, dir, 'state.js')
    const code = fs.readFileSync(filename, 'utf8').trim()

    const result = transform(code, {
      filename,
      babelrc: false,
      plugins: [[plugin, { input }]]
    }).code.trim()

    const separator = '\n\n      ↓ ↓ ↓ ↓ ↓ ↓\n\n'
    const formattedOutput = [code, separator, result].join('')

    expect(`\n${formattedOutput}\n`).toMatchSnapshot()
  })
}
