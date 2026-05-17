"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react"

interface HeaderLink {
  href: string
  label: string
  icon: ReactNode
}

const AuthHeaderLinkCtx = createContext<{
  link: HeaderLink | null
  set: (link: HeaderLink | null) => void
}>({ link: null, set: () => {} })

export function AuthHeaderLinkProvider({ children }: { children: ReactNode }) {
  const [link, set] = useState<HeaderLink | null>(null)
  return (
    <AuthHeaderLinkCtx.Provider value={{ link, set }}>
      {children}
    </AuthHeaderLinkCtx.Provider>
  )
}

export function useAuthHeaderLink() {
  return useContext(AuthHeaderLinkCtx)
}

export function AuthHeaderLinkOverride({ href, label, icon }: HeaderLink) {
  const { set } = useContext(AuthHeaderLinkCtx)
  useEffect(() => {
    set({ href, label, icon })
    return () => set(null)
  }, [href, label, icon, set])
  return null
}
