import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { SignInResult } from '@/data/auth'
import { strings } from '@/strings'

import { SignIn } from './SignIn'

const fill = async (email: string, password: string) => {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(strings.signIn.email), email)
  await user.type(screen.getByLabelText(strings.signIn.password), password)
  await user.click(screen.getByRole('button', { name: strings.signIn.submit }))
}

describe('SignIn', () => {
  it('sends the email and password', async () => {
    const onSignIn = vi.fn(async (): Promise<SignInResult> => ({ ok: true }))
    render(<SignIn onSignIn={onSignIn} />)

    await fill('seed.user@calorithm.test', 'secret-pass')

    expect(onSignIn).toHaveBeenCalledWith('seed.user@calorithm.test', 'secret-pass')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows why sign-in failed', async () => {
    const onSignIn = vi.fn(
      async (): Promise<SignInResult> => ({ ok: false, failure: 'invalid_credentials' }),
    )
    render(<SignIn onSignIn={onSignIn} />)

    await fill('seed.user@calorithm.test', 'wrong')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      strings.signIn.failures.invalid_credentials,
    )
  })

  it('disables the button while signing in', async () => {
    let finish: (result: SignInResult) => void = () => {}
    const onSignIn = vi.fn(
      () =>
        new Promise<SignInResult>((resolve) => {
          finish = resolve
        }),
    )
    render(<SignIn onSignIn={onSignIn} />)

    await fill('seed.user@calorithm.test', 'secret-pass')

    expect(screen.getByRole('button', { name: strings.signIn.submitting })).toBeDisabled()
    finish({ ok: true })
  })
})
