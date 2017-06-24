// @flow
import { dirname, normalize } from 'path'
import * as t from 'babel-types'
import flowSyntax from 'babel-plugin-syntax-flow'
import { loadFileSync } from 'babel-file-loader'
import explodeModule from 'babel-explode-module'
import upperCamelCase from 'uppercamelcase'
import type { Path, State } from './types'
import { getImportPath } from './util'

const STATE = 'State'

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

function haveStateType(path: Path): boolean {
  let isType = false
  path.traverse({
    TypeAlias(path: Path) {
      if (hasType(path)) {
        isType = true
      }
    }
  })
  return isType
}

export default () => {
  const createStateDeclaration = (states: Array<*>) => {
    const stateTypes = states.map(v => {
      return t.objectTypeProperty(
        t.identifier(v.name.replace(STATE, '').toLowerCase()),
        t.genericTypeAnnotation(t.identifier(v.name))
      )
    })

    return t.exportNamedDeclaration(
      t.typeAlias(
        t.identifier(STATE),
        null,
        t.objectTypeAnnotation(stateTypes, null, null)
      ),
      [],
      null
    )
  }

  const createNewImportStateDeclaration = (source: ?string) => {
    if (!source) {
      return null
    }

    const specifiers = [
      t.importSpecifier(t.identifier(stateName(source)), t.identifier(STATE))
    ]
    const newImportStateDeclaration = t.importDeclaration(
      specifiers,
      t.stringLiteral(source)
    )

    // $FlowFixMe
    newImportStateDeclaration.importKind = 'type'

    return newImportStateDeclaration
  }

  return {
    inherits: flowSyntax,
    visitor: {
      Program: {
        // eslint-disable-next-line
        exit(path: Path, { file, opts: { inputPath } }: State): boolean | void {
          if (!inputPath) {
            return false
          }

          const { filename: from } = file.opts
          const importPath = getImportPath(from, inputPath)

          try {
            const inputFile = loadFileSync(inputPath)
            if (!haveStateType(inputFile.path)) {
              return false
            }
          } catch (err) {
            if (err.code !== 'ENOENT') {
              throw err
            }
            for (const item of path.get('body')) {
              if (
                t.isImportDeclaration(item) &&
                item.node.source.value === importPath
              ) {
                item.remove()
              }
            }
            return false
          }

          const exploded = explodeModule(path.node)

          const thisImports = exploded.imports.length > 0
            ? exploded.imports.map(v => v.source)
            : []

          // import
          const importStates = Array.from(
            new Set([...thisImports, importPath])
          ).sort()

          const declarations = importStates.map(createNewImportStateDeclaration)

          // すでにあるimport typeを取得
          const stateNames = exploded.imports
            .filter(v => v.kind === 'type')
            .map(v => v.local)

          // 重複を除去
          const states = Array.from(
            new Set([...stateNames, stateName(importPath)].sort())
          ).map(v => t.identifier(v))

          path.node.body = [
            ...declarations,
            t.noop(),
            createStateDeclaration(states)
          ]

          path.addComment('leading', ' @flow', true)
        }
      }
    }
  }
}
