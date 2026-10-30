/** Sidebar account launcher with sign-in access while signed out. */
import { useEffect, useRef, useState } from 'react'
import {
  Menu, IconEllipsisOutlineMedium, IconSettingsOutlineMedium, IconUserOutlineMedium,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountSectionInjected } from './AccountSection.tsx'
import { AccountAvatar } from './AccountAvatar.tsx'
import { SignInDialog } from './SignInDialog.tsx'
import css from './AccountMenu.module.css'

/** Account launcher composed by the settings shell. */
export type AccountMenuProps = PropsRuntime<'settings.launcher'> & PropsLocale<'settings.account'> & InjectFace<AccountSectionInjected>

/** The signed-in label stays empty while the profile loads.
 * @param props - sidebar geometry, settings navigation and account operations.
 * @returns account menu launcher.
 */
export function AccountMenu({
  wide, settingsShortcut, openSettings, settingsOpen,
  useAccount, useTheme, refreshAccount, showLogin, start, cancel,
  avatarFailed, t,
}: AccountMenuProps) {
  const anchor = useRef<HTMLDivElement>(null)
  // The launcher outlives the panel, so a false-to-true edge is one Settings entry:
  // re-renders, section switches and tab switches inside one open must not read again.
  const settingsWasOpen = useRef(false)
  useEffect(() => {
    if (settingsOpen && !settingsWasOpen.current) void refreshAccount()
    settingsWasOpen.current = settingsOpen
  }, [refreshAccount, settingsOpen])
  const account = useAccount(state => state)
  const colorScheme = useTheme(snapshot => snapshot.active.colorScheme)
  const signedIn = account.view?.status === 'credential-stored'
  const profile = account.details?.profile
  const label = profile === undefined ? null : profile.status === 'ready'
    ? profile.value.name ?? profile.value.contact ?? t('signedIn') : t('signedIn')
  const [open, setOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginRequestDismissed, setLoginRequestDismissed] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!account.loginVisible) {
      setLoginOpen(false)
      setLoginRequestDismissed(false)
    }
  }, [account.loginVisible])
  return <div ref={anchor} className={css.root}>
    <Menu open={open} side="top" portal autoFocus className={css.anchor} listClassName={signedIn ? undefined : css.signedOutMenu}
      anchor={<button ref={trigger} type="button" className={css.trigger} data-collapsed={!wide} data-signed-out={!signedIn} aria-label={t('menu')}
        aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
        {signedIn
          ? <span className={css.avatar} data-avatar-status={account.avatar?.status}>
            <AccountAvatar avatar={account.avatar} avatarFailed={avatarFailed} />
          </span>
          : <IconEllipsisOutlineMedium size={14} />}
        {wide && <span className={css.label}>{signedIn ? label : t('more')}</span>}
      </button>}
      items={[
        ...signedIn ? [] : [{ id: 'signIn', label: t('signIn'), icon: <IconUserOutlineMedium size={16} /> }],
        { id: 'settings', label: t('settings'), icon: <IconSettingsOutlineMedium size={16} />,
          ...(settingsShortcut === undefined ? {} : { shortcut: settingsShortcut }) },
      ]}
      onClose={() => { setOpen(false) }}
      onSelect={(id) => {
        if (id === 'signIn' && !signedIn) { setOpen(false); showLogin(true); setLoginOpen(true) }
        if (id === 'settings') { setOpen(false); trigger.current?.focus(); openSettings() }
      }} />
    {(loginOpen || account.loginVisible && !loginRequestDismissed) && <SignInDialog
      account={account} colorScheme={colorScheme} start={start} cancel={cancel}
      close={() => { showLogin(false); setLoginOpen(false); setLoginRequestDismissed(true) }}
      useApiKey={() => { showLogin(false); setLoginOpen(false); setLoginRequestDismissed(true); openSettings() }} t={t} />}
  </div>
}
