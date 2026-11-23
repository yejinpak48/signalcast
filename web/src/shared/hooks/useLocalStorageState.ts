import { useEffect, useState } from 'react'

/**
 * localStorage에 저장되는 상태. 이 브라우저 안에만 남고 서버로 보내지 않는다.
 * 저장소를 쓸 수 없는 환경(사파리 프라이빗 모드 등)에서는 메모리에만 둔다.
 * @param isValidValue 저장된 값이 현재 앱에서 쓸 수 있는 값인지 확인한다 (예: 없어진 코인 id).
 */
export function useLocalStorageState<Value>(
  storageKey: string,
  initialValue: Value,
  isValidValue: (storedValue: unknown) => storedValue is Value,
) {
  const [value, setValue] = useState<Value>(() => {
    try {
      const storedText = window.localStorage.getItem(storageKey)
      if (storedText === null) return initialValue
      const storedValue: unknown = JSON.parse(storedText)
      return isValidValue(storedValue) ? storedValue : initialValue
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      // 저장하지 못해도 화면은 계속 동작한다.
    }
  }, [storageKey, value])

  return [value, setValue] as const
}
