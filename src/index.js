// @flow
import { relative, dirname, extname, normalize } from 'path'
import * as t from 'babel-types'
import flowSyntax from 'babel-plugin-syntax-flow'
import { loadFileSync } from 'babel-file-loader'
import { addFlowComment, removeFlowComment } from 'babel-add-flow-comments'
import explodeModule from 'babel-explode-module'
import upperCamelCase from 'uppercamelcase'
import type { Path, State } from './types'

const STATE = 'State'

function getImportPath(from: string, to: string): string {
  const relativePath = relative(dirname(from), to)
  const fomattedPath = extname(relativePath) === '.js'
    ? relativePath.replace('.js', '')
    : relativePath
  if (!/^\.\.?/.test(fomattedPath)) {
    return `./${fomattedPath}`
  }
  return fomattedPath
}

function stateName(path: string) {
  const parentPath = normalize(dirname(path)).split('/')
  return upperCamelCase(parentPath[parentPath.length - 1]) + STATE
}

function hasType(path: Path) {
  const name = path.get('id').get('name').node
  if (name !== STATE) {
    return false
  }
  if (!t.isExportNamedDeclaration(path.parentPath)) {
    return false
  }
  return true
}

function isStateFile(path: Path): boolean {
  let isType = false
  path.traverse({
    TypeAlias(path: Path) {
      if (hasType(path)) {
        isType = true
      }
    },
  })
  return isType
}

export default () => {
  return {
    inherits: flowSyntax,
    visitor: {
      // eslint-disable-next-line
      Program(path: Path, { file, opts }: State): boolean | void {
        if (!opts.inputPath) {
          return false
        }

        const { filename: from } = file.opts
        const to = opts.inputPath
        const importPath = getImportPath(from, to)

        try {
          const inputFile = loadFileSync(to)
          if (!isStateFile(inputFile.path)) {
            return false
          }

          // already imported?
          const exploded = explodeModule(path.node)
          const hasState = exploded.imports.some(v => {
            return v.kind === 'type' && v.source === importPath
          })

          if (!hasState) {
            const specifiers = [
              t.importSpecifier(
                t.identifier(stateName(importPath)),
                t.identifier(STATE)
              ),
            ]
            const importStateType = t.importDeclaration(
              specifiers,
              t.stringLiteral(importPath)
            )

            // $FlowFixMe
            importStateType.importKind = 'type'

            path.pushContainer('body', importStateType, [], null)
          }
        } catch (err) {
          if (err.code !== 'ENOENT') {
            throw err
          }

          // remove `import type notFound from 'path not found'`
          for (const item of path.get('body')) {
            if (
              t.isImportDeclaration(item) &&
              item.node.source.value === importPath
            ) {
              item.remove()
            }
          }
        }

        if (path.node.body.length > 0) {
          const exploded = explodeModule(path.node)
          // babelLog(path.node)
          const states = exploded.imports
            .filter(v => v.kind === 'type')
            .map(v => t.identifier(v.local))

          // remove `type State`
          path.traverse({
            TypeAlias(path: Path) {
              if (path.node.id.name === STATE) {
                path.remove()
              }
            },
          })

          if (states.length === 0) {
            return false
          }

          const stateTypes = states.map(v => {
            return t.objectTypeProperty(
              t.identifier(v.name.replace(STATE, '').toLowerCase()),
              t.genericTypeAnnotation(t.identifier(v.name))
            )
          })

          path.pushContainer('body', t.noop())
          path.pushContainer(
            'body',
            t.exportNamedDeclaration(
              t.typeAlias(
                t.identifier(STATE),
                null,
                t.objectTypeAnnotation(stateTypes, null, null)
              ),
              [],
              null
            )
          )
        }

        // add @flow comments
        removeFlowComment(file.ast.comments)
        addFlowComment(path)
      },
    },
  }
}
