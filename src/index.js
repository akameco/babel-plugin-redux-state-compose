// @flow
import { dirname, normalize } from 'path'
import * as t from 'babel-types'
import flowSyntax from 'babel-plugin-syntax-flow'
import { loadFileSync } from 'babel-file-loader'
import explodeModule from 'babel-explode-module'
import camelCase from 'camelcase'
import upperCamelCase from 'uppercamelcase'
import type { Path, State } from './types'
import { getImportPath } from './util'

const STATE = 'State'
const INITIAL_STATE = 'initialState'

function getStateName(path: string) {
  const parentPath = normalize(dirname(path)).split('/')
  return parentPath[parentPath.length - 1] + STATE
}

function isExport(path: Path, target: string): boolean {
  const { exports: ex } = explodeModule(path.node)
  if (ex.length === 0) {
    return false
  }

  return ex.some(v => v.external === target)
}

function haveStateType(path: Path): boolean {
  return isExport(path, STATE)
}

function haveInitialState(path: Path): boolean {
  return isExport(path, INITIAL_STATE)
}

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
    t.importSpecifier(t.identifier(getStateName(source)), t.identifier(STATE))
  ]
  const newImportStateDeclaration = t.importDeclaration(
    specifiers,
    t.stringLiteral(source)
  )

  // $FlowFixMe
  newImportStateDeclaration.importKind = 'type'

  return newImportStateDeclaration
}

const createInitStateDeclaration = (source: ?string) => {
  if (!source) {
    return null
  }

  const specifiers = [
    t.importSpecifier(
      t.identifier(camelCase(getStateName(source))),
      t.identifier(INITIAL_STATE)
    )
  ]
  const newImportStateDeclaration = t.importDeclaration(
    specifiers,
    t.stringLiteral(source)
  )

  return newImportStateDeclaration
}

export default () => {
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
            const { path: loadPath } = loadFileSync(inputPath)

            if (!(haveStateType(loadPath) && haveInitialState(loadPath))) {
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

          // import type
          const importStates = Array.from(
            new Set([...thisImports, importPath])
          ).sort()

          const typeDeclarations = importStates.map(
            createNewImportStateDeclaration
          )

          const declarations = importStates.map(createInitStateDeclaration)

          // すでにあるimport typeを取得
          const stateNames = exploded.imports
            .filter(v => v.kind === 'type')
            .map(v => v.local)

          // 重複を除去
          const states = Array.from(
            new Set(
              [...stateNames, upperCamelCase(getStateName(importPath))].sort()
            )
          ).map(v => t.identifier(v))

          path.node.body = [
            ...typeDeclarations,
            t.noop(),
            ...declarations,
            t.noop(),
            createStateDeclaration(states),
            t.noop()
          ]

          path.addComment('leading', ' @flow', true)
        }
      }
    }
  }
}
