import { useWeekPlan } from '@/data/checkinHooks'
import { useProfileView, useSaveProfile } from '@/data/profileHooks'
import { strings } from '@/strings'

import { useToday } from '../useToday'
import { ProfileForm } from './ProfileForm'

// Loaded on demand from the settings screen, keeping the form out of the first-load bundle.
export const ProfileSettingsScreen = ({ locale }: { locale: string }) => {
  const today = useToday()
  const state = useProfileView()
  const save = useSaveProfile()
  const plan = useWeekPlan()
  switch (state.kind) {
    case 'loading':
      return <p className="text-muted">{strings.loading}</p>
    case 'unavailable':
      return (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{strings.profile.title}</h2>
          <p role="alert">
            {state.reason === 'offline' ? strings.profile.unavailable : strings.sync.signedOut}
          </p>
          <button
            type="button"
            onClick={state.retry}
            className="min-h-11 self-start rounded-lg border border-border px-4 font-semibold"
          >
            {strings.profile.retry}
          </button>
        </section>
      )
    case 'ready':
      // A unit change remounts the form, so text typed in the old unit is dropped.
      return (
        <ProfileForm
          key={state.view.unit}
          settings={state.view.settings}
          unit={state.view.unit}
          today={today}
          locale={locale}
          plan={plan ?? null}
          onSave={save}
        />
      )
  }
}
