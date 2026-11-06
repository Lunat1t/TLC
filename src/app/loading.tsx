export default function Loading() {
  return <main className="tlc-route-loading" role="status" aria-live="polite">
    <p>Загружаем страницу…</p>
    <div className="tlc-loading-placeholder" aria-hidden="true" />
    <div className="tlc-loading-placeholder" aria-hidden="true" />
  </main>
}
