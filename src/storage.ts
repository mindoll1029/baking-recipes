import { makeBackup, parseBackup } from './model'
import type { Recipe } from './model'
import type { JournalPersistence, PendingEdit, SyncState } from './sync-state'

let connection: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open('oven-note', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('journal')
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close()
          connection = null
        }
        resolve(request.result)
      }
      request.onerror = () => {
        connection = null
        reject(request.error)
      }
      request.onblocked = () => {
        connection = null
        reject(new Error('다른 오븐 노트 탭을 닫고 다시 열어 주세요.'))
      }
    })
  }
  return connection
}

export async function loadRecipes(): Promise<Recipe[] | null> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('journal', 'readwrite')
    const journal = transaction.objectStore('journal')
    const request = journal.get('recipes')
    let recipes: Recipe[] | null = null
    request.onsuccess = () => {
      try {
        recipes = request.result === undefined ? null : parseBackup(request.result)
        if (request.result?.version === 1) {
          // Preserve the original journal before the first automatic save in the new format.
          const original = request.result
          const backup = journal.get('legacy-backup-v1')
          backup.onsuccess = () => {
            if (backup.result === undefined) journal.put(original, 'legacy-backup-v1')
          }
        }
      } catch (error) {
        reject(error)
        transaction.abort()
      }
    }
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => resolve(recipes)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function saveRecipes(recipes: Recipe[]): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('journal', 'readwrite')
    transaction.objectStore('journal').put(makeBackup(recipes), 'recipes')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

async function readJournalValue(key: string): Promise<unknown> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('journal', 'readonly')
    const request = transaction.objectStore('journal').get(key)
    transaction.oncomplete = () => resolve(request.result)
    transaction.onerror = () => reject(transaction.error)
  })
}
export function createJournalPersistence(): JournalPersistence {
  let seenOperations = new Set<string>()
  return {
    async load() {
      const recipes = await loadRecipes()
      const value = await readJournalValue('shared-sync-v1') as SyncState | undefined
      if (value && (value.version !== 1 || !Array.isArray(value.pending) || !Array.isArray(value.records) || !Array.isArray(value.privateRecipes)))
        throw new Error('기기 동기화 기록을 확인하지 못했어요. 백업을 보관하고 다시 시도해 주세요.')
      if (value) {
        const database = await openDatabase()
        const edits = await new Promise<PendingEdit[]>((resolve, reject) => {
          const transaction = database.transaction('journal', 'readonly')
          const request = transaction.objectStore('journal').getAll(IDBKeyRange.bound('shared-edit:', 'shared-edit:\uffff'))
          transaction.oncomplete = () => resolve(request.result as PendingEdit[])
          transaction.onerror = () => reject(transaction.error)
        })
        value.pending = edits.sort((a, b) => a.queuedAt - b.queuedAt || a.operationId.localeCompare(b.operationId))
        seenOperations = new Set(value.pending.map(edit => edit.operationId))
      }
      return { recipes, sync: value ?? null }
    },
    async save(recipes, state) {
      const database = await openDatabase()
      return new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('journal', 'readwrite')
        const journal = transaction.objectStore('journal')
        journal.put(makeBackup(recipes), 'recipes')
        const active = new Set(state?.pending.map(edit => edit.operationId) ?? [])
        if (state) {
          journal.put(state, 'shared-sync-v1')
          for (const operation of seenOperations) if (!active.has(operation)) journal.delete('shared-edit:' + operation)
          for (const edit of state.pending) journal.put(edit, 'shared-edit:' + edit.operationId)
        }
        transaction.oncomplete = () => { seenOperations = active; resolve() }
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
    },
    async preservePrivate(recipes) {
      const database = await openDatabase()
      return new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('journal', 'readwrite')
        const journal = transaction.objectStore('journal')
        const request = journal.get('before-shared-v1')
        request.onsuccess = () => {
          if (request.result === undefined) journal.put(makeBackup(recipes), 'before-shared-v1')
        }
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
    },
  }

}

export async function readPhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('JPG, PNG 또는 WebP 사진을 선택해 주세요.')
  if (file.size > 10 * 1024 * 1024) throw new Error('사진 한 장은 10MB 이하로 선택해 주세요.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('사진을 읽을 수 없어요. 다른 사진으로 다시 시도해 주세요.')
  }
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('이 브라우저에서는 사진을 처리할 수 없어요.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    bitmap.close()
  }
}
