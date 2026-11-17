import { useState } from 'react'
import { newRequestId } from '@/shared/lib/request-id'
import { createSubmitGuard } from '../domain/submit-guard'

/** See `createSubmitGuard`: one in-flight write and one request id per payload. */
export const useSubmitGuard = () => useState(() => createSubmitGuard(newRequestId))[0]
