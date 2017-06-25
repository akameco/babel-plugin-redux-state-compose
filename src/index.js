// @flow
import { dirname, normalize } from 'path'
import * as t from 'babel-types'
import flowSyntax from 'babel-plugin-syntax-flow'
import { loadFileSync } from 'babel-file-loader'
import { removeFlowComment } from 'babel-add-flow-comments'
import explodeModule from 'babel-explode-module'
import upperCamelCase from 'uppercamelcase'
import type { Path, State } from './types'
import { getImportPath } from './util'

const STATE = 'State'

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

// export type State = { app: AppState }
const createStateDeclaration = (states: Array<*>) => {
  const stateTypes = states.map(v => {
    return t.objectTypeProperty(
      t.identifier(v.name.replace(STATE, '')),
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

// import type {State as AppState} from './App/reducer'
const createNewImportStateDeclaration = (source: ?string) => {
  if (!source) {
    return null
  }

  const specifiers = [
    t.importSpecifier(t.identifier(getStateName(source)), t.identifier(STATE)),
  ]
  const newImportStateDeclaration = t.importDeclaration(
    specifiers,
    t.stringLiteral(source)
  )

  // $FlowFixMe
  newImportStateDeclaration.importKind = 'type'

  return newImportStateDeclaration
}

export default () => {
  return {
    inherits: flowSyntax,
    visitor: {
      Program: {
        // eslint-disable-next-line
        exit(path: Path, { file, opts: { input } }: State): boolean | void {
          if (!input) {
            return false
          }

          const { filename: from } = file.opts
          const importPath = getImportPath(from, input)

          try {
            const { path: loadPath } = loadFileSync(input)

            if (!haveStateType(loadPath)) {
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
          const typeDeclarations = Array.from(
            new Set([...thisImports, importPath])
          )
            .sort()
            .map(createNewImportStateDeclaration)

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
            createStateDeclaration(states),
          ]

          removeFlowComment(file.ast.comments)
          path.addComment('leading', ' @flow', true)
        },
      },
    },
  }
}
