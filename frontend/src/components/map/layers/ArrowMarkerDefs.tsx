/** Arrowheads for order arrows: a valid move, a warning, an error, and a simulated success or bounce. */
export function ArrowMarkerDefs() {
  return (
    <>
      <marker
        id="arrow-valid"
        viewBox="0 0 10 10"
        refX="7"
        refY="5"
        markerWidth="5.5"
        markerHeight="5.5"
        orient="auto-start-reverse"
      >
        <path d="M 0 1.2 L 9 5 L 0 8.8 L 2.2 5 z" fill="#1e293b" />
      </marker>

      <marker
        id="arrow-warning"
        viewBox="0 0 10 10"
        refX="7"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 1 L 9.5 5 L 0 9 L 2.2 5 z" fill="#d97706" />
      </marker>

      <marker
        id="arrow-error"
        viewBox="0 0 10 10"
        refX="7"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 1 L 9.5 5 L 0 9 L 2.2 5 z" fill="#dc2626" />
      </marker>

      <marker
        id="arrow-sim-ok"
        viewBox="0 0 10 10"
        refX="7"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 1 L 9.5 5 L 0 9 L 2.2 5 z" fill="#059669" />
      </marker>

      <marker
        id="arrow-sim-bounce"
        viewBox="0 0 10 10"
        refX="7"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 1 L 9.5 5 L 0 9 L 2.2 5 z" fill="#e11d48" />
      </marker>
    </>
  );
}
