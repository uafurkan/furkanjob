export default function Loading() {
  return (
    <div className="stack gap-6" aria-busy="true" aria-label="Loading">
      <div className="skeleton-line" style={{ width: "40%", height: 34 }} />
      <div className="skeleton-line" style={{ width: "60%", height: 18 }} />
      <div className="glass card" style={{ height: 120 }} />
      <div className="glass card" style={{ height: 200 }} />
    </div>
  );
}
