// @flow
import { relative, dirname, extname } from 'path'

export function getImportPath(from: string, to: string): string {
  const relativePath = relative(dirname(from), to)
  const fomattedPath = extname(relativePath) === '.js'
    ? relativePath.replace('.js', '')
    : relativePath
  if (!/^\.\.?/.test(fomattedPath)) {
    return `./${fomattedPath}`
  }
  return fomattedPath
}
