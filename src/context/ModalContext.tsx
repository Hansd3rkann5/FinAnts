import { createContext, useCallback, useContext, useRef, useState } from 'react'

interface ModalContextType {
  anyModalOpen: boolean
  registerModal: (id: string, isOpen: boolean) => void
}

const ModalContext = createContext<ModalContextType>({ anyModalOpen: false, registerModal: () => {} })

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const openModals = useRef(new Set<string>())
  const [anyModalOpen, setAnyModalOpen] = useState(false)

  const registerModal = useCallback((id: string, isOpen: boolean) => {
    if (isOpen) openModals.current.add(id)
    else openModals.current.delete(id)
    setAnyModalOpen(openModals.current.size > 0)
  }, [])

  return (
    <ModalContext.Provider value={{ anyModalOpen, registerModal }}>
      {children}
    </ModalContext.Provider>
  )
}

export const useModalContext = () => useContext(ModalContext)
