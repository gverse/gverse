import log from "./debug-logger"

const MaxRetries = 5 // times to retry pending/aborted transactions

/** Returns true if the error is retry-able and we have retries remaining */
export function shouldRetry(error: Error, retries: number): boolean {
  if (!error) return false
  log("Should retry", retries, ";error: ", error)
  return error.message.includes("retry") && retries < MaxRetries
}

/** Returns an promise with timeout. Used for retries. */
export function waitPromise(
  purpose = "unknown",
  time: number = 15
): Promise<void> {
  log("Waiting for", time, "ms", "for", purpose)
  return new Promise(
    (resolve: (value?: void | PromiseLike<void>) => void): void => {
      const id = setTimeout(() => {
        clearTimeout(id)
        resolve()
      }, time)
    }
  )
}
