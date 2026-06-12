import { useEffect, useRef } from 'react'
import { useModalContext } from '@/context/ModalContext'

export function useModalRegistration(isOpen: boolean) {
  const { registerModal } = useModalContext()
  const id = useRef(`modal-${Math.random()}`)

  useEffect(() => {
    registerModal(id.current, isOpen)
    return () => registerModal(id.current, false)
  }, [isOpen, registerModal])
}
