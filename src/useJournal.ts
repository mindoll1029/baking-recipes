import { useEffect, useState, useSyncExternalStore } from 'react'
import { JournalController } from './journal-controller'
import { SharedClient } from './shared-client'
import { createJournalPersistence } from './storage'

export function useJournal() {
  const [controller] = useState(() => new JournalController(createJournalPersistence(), new SharedClient()))
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  useEffect(() => {
    void controller.start()
    const resume = () => {
      if (document.visibilityState !== 'hidden' && navigator.onLine) void controller.synchronize()
    }
    const interval = setInterval(resume, 5000)
    window.addEventListener('online', resume)
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      controller.stop()
      clearInterval(interval)
      window.removeEventListener('online', resume)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [controller])
  return { ...view, setRecipes: controller.setRecipes, synchronize: controller.synchronize,
    sharePrivate: controller.sharePrivate, dismissSyncNotice: controller.dismissNotice }
}
