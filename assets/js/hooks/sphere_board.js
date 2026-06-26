// Renderer skeleton for the MineSweeperWorld board.
//
// Receives derived geometry (unit-sphere cell centres + adjacency edges) from
// the server via the "board" event and draws it on a <canvas> using a simple
// orthographic projection with drag-to-rotate. Intentionally dependency-free
// (plain Canvas 2D); swap in WebGL/Three.js later without touching the server.
export default {
  mounted() {
    this.canvas = this.el.querySelector("canvas")
    this.ctx = this.canvas.getContext("2d")
    this.board = {cells: [], edges: []}
    this.rotation = {x: -0.35, y: 0}
    this.dragging = false
    this.last = null
    this.autoSpin = 0.0025

    this.handleEvent("board", (board) => {
      this.board = board
    })

    this.resize()
    this.onResize = () => this.resize()
    window.addEventListener("resize", this.onResize)

    this.el.addEventListener("pointerdown", (e) => {
      this.dragging = true
      this.last = {x: e.clientX, y: e.clientY}
      this.el.setPointerCapture(e.pointerId)
    })
    this.el.addEventListener("pointermove", (e) => {
      if (!this.dragging) return
      this.rotation.y += (e.clientX - this.last.x) * 0.01
      this.rotation.x += (e.clientY - this.last.y) * 0.01
      this.last = {x: e.clientX, y: e.clientY}
    })
    const stop = () => (this.dragging = false)
    this.el.addEventListener("pointerup", stop)
    this.el.addEventListener("pointercancel", stop)

    this.running = true
    const loop = () => {
      if (!this.running) return
      this.draw()
      this.raf = requestAnimationFrame(loop)
    }
    loop()
  },

  destroyed() {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    window.removeEventListener("resize", this.onResize)
  },

  resize() {
    const rect = this.el.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    this.width = rect.width
    this.height = rect.height
    this.canvas.width = Math.round(rect.width * dpr)
    this.canvas.height = Math.round(rect.height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  },

  // Rotate a unit vector around the Y axis then the X axis.
  rotate({x, y, z}) {
    const cy = Math.cos(this.rotation.y), sy = Math.sin(this.rotation.y)
    const cx = Math.cos(this.rotation.x), sx = Math.sin(this.rotation.x)
    let rx = x * cy - z * sy
    let rz = x * sy + z * cy
    let ry = y * cx - rz * sx
    rz = y * sx + rz * cx
    return {x: rx, y: ry, z: rz}
  },

  draw() {
    const ctx = this.ctx
    if (!this.width) this.resize()
    if (!this.dragging) this.rotation.y += this.autoSpin

    ctx.clearRect(0, 0, this.width, this.height)

    const radius = Math.min(this.width, this.height) * 0.42
    const cx = this.width / 2
    const cy = this.height / 2

    // Project every cell centre. `points` is indexed by cell.index.
    const points = []
    for (const cell of this.board.cells) {
      const r = this.rotate(cell)
      points[cell.index] = {
        sx: cx + r.x * radius,
        sy: cy - r.y * radius,
        z: r.z,
        kind: cell.kind
      }
    }

    // Adjacency edges, faded by depth so the back of the sphere recedes.
    ctx.lineWidth = 1
    for (const [a, b] of this.board.edges) {
      const pa = points[a]
      const pb = points[b]
      if (!pa || !pb) continue
      const depth = (pa.z + pb.z) / 2
      ctx.strokeStyle = `rgba(100,116,139,${0.12 + 0.4 * (depth + 1) / 2})`
      ctx.beginPath()
      ctx.moveTo(pa.sx, pa.sy)
      ctx.lineTo(pb.sx, pb.sy)
      ctx.stroke()
    }

    // Cell centres, painted back-to-front so near cells sit on top.
    const order = []
    points.forEach((p, i) => p && order.push(i))
    order.sort((i, j) => points[i].z - points[j].z)

    for (const i of order) {
      const p = points[i]
      const front = (p.z + 1) / 2
      const pentagon = p.kind === "pentagon"
      const size = (pentagon ? 5 : 3.5) * (0.55 + 0.45 * front)
      ctx.beginPath()
      ctx.arc(p.sx, p.sy, size, 0, Math.PI * 2)
      ctx.fillStyle = pentagon
        ? `rgba(244,114,182,${0.45 + 0.55 * front})`
        : `rgba(56,189,248,${0.3 + 0.6 * front})`
      ctx.fill()
    }
  }
}
