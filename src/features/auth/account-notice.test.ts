import { describe, expect, it } from 'vitest'
import { noticeCopy, noticeFor } from './account-notice'

describe('noticeCopy', () => {
  it('sends nobody to a dead end when no contact address is published', () => {
    expect(noticeCopy('disabled', undefined)).toEqual({
      text: 'account.done.disabled',
      contact: null,
    })
    expect(noticeCopy('kept', '  ')).toEqual({ text: 'account.done.kept', contact: null })
  })

  it('offers the address once one is configured', () => {
    expect(noticeCopy('disabled', 'owner@example.org')).toEqual({
      text: 'account.done.disabledContact',
      contact: 'owner@example.org',
    })
    expect(noticeCopy('kept', 'owner@example.org').text).toBe('account.done.keptContact')
  })

  it('a fully deleted account never asks for contact', () => {
    expect(noticeCopy('deleted', 'owner@example.org')).toEqual({
      text: 'account.done.deleted',
      contact: null,
    })
    expect(noticeFor('shared')).toBe('kept')
  })
})
