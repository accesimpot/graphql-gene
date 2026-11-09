import { afterAll, describe, expect, it } from 'vitest'
import { getDirectiveConfigsOfField, getGloballyExtendedTypes } from './index'

const extended = getGloballyExtendedTypes()
const snapshot = { config: { ...extended.config }, geneConfig: { ...extended.geneConfig } }

afterAll(() => {
  extended.config = snapshot.config as typeof extended.config
  extended.geneConfig = snapshot.geneConfig as typeof extended.geneConfig
})

const directive = (name: string) => ({ name, handler: () => {} })

describe('getDirectiveConfigsOfField', () => {
  it('returns type, alias, then field directives in declaration order', () => {
    extended.geneConfig['DirProject' as never] = {
      directives: [directive('typeA'), directive('typeB')],
      aliases: { DirProject: { directives: () => [directive('alias')] } },
    } as never
    extended.config['DirQuery' as never] = {
      project: {
        returnType: 'DirProject',
        resolver: () => ({}),
        directives: [directive('field')],
      },
    } as never

    const result = getDirectiveConfigsOfField({
      type: 'DirProject',
      parentType: 'DirQuery',
      field: 'project',
    })
    expect(result.typeDirectives.map(d => d.name)).toEqual(['typeA', 'typeB', 'alias'])
    expect(result.fieldDirectives.map(d => d.name)).toEqual(['field'])
  })

  it('resolves field directives declared as a getter', () => {
    extended.config['DirQuery' as never] = {
      lazy: {
        returnType: 'Int',
        resolver: () => 1,
        directives: () => [directive('lazyField')],
      },
    } as never

    const result = getDirectiveConfigsOfField({
      type: 'Int',
      parentType: 'DirQuery',
      field: 'lazy',
    })
    expect(result.fieldDirectives.map(d => d.name)).toEqual(['lazyField'])
  })

  it('returns empty lists for unconfigured fields', () => {
    expect(
      getDirectiveConfigsOfField({ type: 'Nope', parentType: 'NopeParent', field: 'x' })
    ).toEqual({ typeDirectives: [], fieldDirectives: [] })
  })
})
