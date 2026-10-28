import { describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'
describe('PRE ETL command guard', () => {
  it('preserves SQL dollar quoting when adding API exposure before commit', () => {
    const sql = 'do $$ begin perform 1; end $$;'
    expect(withExposureSql(etlCommand(['--apply']).query, sql)).toContain(`${sql}\ncommit;`)
  })
  it('plans in a read-only stable transaction by default', () => {
    expect(etlCommand([]).apply).toBe(false)
    expect(etlCommand([]).query).toContain('repeatable read read only')
    expect(etlCommand([]).query).toContain('pre_admin.refresh(false,true)')
  })
  it('requires explicit apply and refuses arbitrary schema targets', () => {
    for (const args of [
      ['--replace-pre'],
      ['--restore', 'bad'],
      ['--target', 'public'],
      ['--source', 'private'],
    ])
      expect(() => etlCommand(args)).toThrow()
    expect(etlCommand(['--apply']).query).toContain('pre_admin.refresh(false,false)')
    expect(etlCommand(['--apply', '--replace-pre']).query).toContain(
      'pre_admin.refresh(true,false)',
    )
    expect(
      etlCommand(['--apply', '--restore', '10000000-0000-4000-8000-000000000001']).query,
    ).toContain('pre_admin.restore(')
  })
})
