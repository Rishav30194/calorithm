import { type FormEvent, useId, useState } from 'react'

import type { SignInFailure, SignInResult } from '@/data/auth'
import { strings } from '@/strings'

type Props = {
  onSignIn: (email: string, password: string) => Promise<SignInResult>
}

export const SignIn = ({ onSignIn }: Props) => {
  const emailId = useId()
  const passwordId = useId()
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<SignInFailure | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setFailure(null)
    const result = await onSignIn(String(form.get('email')), String(form.get('password')))
    setPending(false)
    if (!result.ok) setFailure(result.failure)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-8">
      <h1 className="mb-1 text-3xl font-semibold">{strings.appName}</h1>
      <h2 className="mb-6 text-lg text-muted">{strings.signIn.title}</h2>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex flex-col gap-1">
          <label htmlFor={emailId} className="font-medium">
            {strings.signIn.email}
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            autoComplete="username"
            required
            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={passwordId} className="font-medium">
            {strings.signIn.password}
          </label>
          <input
            id={passwordId}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base"
          />
        </div>
        {failure && (
          <p role="alert" className="text-danger">
            {strings.signIn.failures[failure]}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text disabled:opacity-60"
        >
          {pending ? strings.signIn.submitting : strings.signIn.submit}
        </button>
      </form>
    </main>
  )
}
