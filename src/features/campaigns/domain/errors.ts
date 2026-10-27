export class CampaignAccessError extends Error {
  readonly code: 'sign-in' | 'unavailable'
  constructor(code: 'sign-in' | 'unavailable') {
    super(code)
    this.code = code
  }
}
