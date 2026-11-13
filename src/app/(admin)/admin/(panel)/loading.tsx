// Instant skeleton while a dynamic admin page renders (same geometry as the real header + KPI row + card).
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="h">
        <div>
          <div className="sk" style={{ width: 160, height: 26 }} />
          <div className="sk" style={{ width: 260, height: 14, marginTop: 10 }} />
        </div>
      </div>
      <div className="kpis">
        {[0, 1, 2, 3].map((i) => (
          <div className="k" key={i}>
            <div className="sk" style={{ width: "55%", height: 12 }} />
            <div className="sk" style={{ width: "40%", height: 28, marginTop: 12 }} />
            <div className="sk" style={{ width: "45%", height: 12, marginTop: 10 }} />
          </div>
        ))}
      </div>
      <div className="card mt16">
        <div className="sk" style={{ width: 140, height: 16 }} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div className="sk" key={i} style={{ height: 18, marginTop: 22, opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    </div>
  );
}
