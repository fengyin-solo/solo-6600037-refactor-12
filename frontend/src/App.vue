<template>
  <div class="min-h-screen bg-slate-900 text-slate-200">
    <header class="border-b border-slate-700 px-6 py-4">
      <h1 class="text-2xl font-bold text-cyan-400">光学干涉衍射仿真实验台</h1>
      <p class="text-sm text-slate-500 mt-1">双缝干涉 · 单缝衍射 · 牛顿环 · 波长调节 · 光强热力图</p>
    </header>
    <div class="flex flex-col lg:flex-row gap-4 p-4">
      <div class="lg:w-1/4 space-y-4">
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">实验类型</h3>
          <div class="space-y-1">
            <button v-for="exp in experiments" :key="exp.id" @click="store.setExperiment(exp.id)"
              :class="['w-full text-left p-2 rounded border text-sm transition-all', store.currentExperiment === exp.id ? 'border-cyan-500 bg-cyan-900/30 text-cyan-400' : 'border-slate-700 text-slate-300 hover:border-slate-500']">
              {{ exp.name }}
            </button>
          </div>
        </div>
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700 space-y-4">
          <h3 class="text-sm font-bold text-slate-400">参数调节</h3>
          <div>
            <label class="text-xs text-slate-500">波长 λ = {{ store.params.wavelength }} nm</label>
            <input type="range" min="380" max="780" step="5" v-model.number="store.params.wavelength" @input="store.compute" class="w-full accent-cyan-500" />
            <div class="flex justify-between text-xs mt-0.5">
              <span style="color:#8b5cf6">380</span><span style="color:#06b6d4">500</span><span style="color:#22c55e">550</span><span style="color:#eab308">600</span><span style="color:#dc2626">780</span>
            </div>
          </div>
          <div v-if="store.currentExperiment !== 'newton'">
            <label class="text-xs text-slate-500">缝宽/间距 d = {{ store.params.slitWidth }} μm</label>
            <input type="range" min="10" max="200" step="5" v-model.number="store.params.slitWidth" @input="store.compute" class="w-full accent-purple-500" />
          </div>
          <div v-if="store.currentExperiment === 'double'">
            <label class="text-xs text-slate-500">缝间距 D = {{ store.params.slitSeparation }} μm</label>
            <input type="range" min="50" max="500" step="10" v-model.number="store.params.slitSeparation" @input="store.compute" class="w-full accent-green-500" />
          </div>
          <div>
            <label class="text-xs text-slate-500">屏幕距离 L = {{ store.params.screenDistance }} mm</label>
            <input type="range" min="100" max="2000" step="50" v-model.number="store.params.screenDistance" @input="store.compute" class="w-full accent-orange-500" />
          </div>
        </div>
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700 text-sm">
          <h3 class="text-sm font-bold text-slate-400 mb-3">理论公式</h3>
          <div class="space-y-2 text-xs text-slate-400">
            <div v-if="store.currentExperiment === 'double'" class="bg-slate-900 rounded p-2">
              <div class="text-cyan-400 font-bold">双缝干涉</div>
              <div>亮纹: y = kλL/d (k=0,±1,±2...)</div>
              <div>条纹间距: Δy = λL/d</div>
              <div class="text-yellow-400 mt-1">Δy = {{ store.result.fringe?.toFixed(2) }} mm</div>
            </div>
            <div v-if="store.currentExperiment === 'single'" class="bg-slate-900 rounded p-2">
              <div class="text-cyan-400 font-bold">单缝衍射</div>
              <div>暗纹: a·sinθ = kλ</div>
              <div>中央亮纹宽: 2λL/a</div>
              <div class="text-yellow-400 mt-1">中央宽 = {{ store.result.centralWidth?.toFixed(2) }} mm</div>
            </div>
            <div v-if="store.currentExperiment === 'newton'" class="bg-slate-900 rounded p-2">
              <div class="text-cyan-400 font-bold">牛顿环</div>
              <div>暗环半径: r = √(nλR)</div>
              <div>R: 曲率半径</div>
            </div>
          </div>
        </div>
        <div v-if="store.currentExperiment === 'newton'" class="bg-slate-800 rounded-lg p-4 border border-slate-700 text-sm space-y-3">
          <h3 class="text-sm font-bold text-slate-400">暗环候选与测量</h3>
          <div v-if="!store.newtonCandidates.length" class="text-xs text-slate-500 bg-slate-900 rounded p-3">
            当前参数下无暗环候选，请调整参数后重新测量
          </div>
          <template v-else>
            <div class="flex items-center justify-between">
              <span class="text-xs text-slate-500">共 {{ store.newtonCandidates.length }} 个候选（点击选择）</span>
              <div class="space-x-2">
                <button @click="store.recordRing()"
                  class="text-xs px-2 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-white disabled:opacity-40"
                  :disabled="store.selectedRingN === null">记录当前暗环</button>
                <button @click="store.clearRecords()"
                  class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-40"
                  :disabled="!store.ringRecords.length">清空记录</button>
              </div>
            </div>
            <div class="flex flex-wrap gap-1 max-h-28 overflow-y-auto bg-slate-900 rounded p-2">
              <button v-for="c in store.newtonCandidates" :key="c.n" @click="store.selectRing(c.n)"
                :class="['text-xs px-2 py-0.5 rounded border transition-all',
                  store.selectedRingN === c.n
                    ? 'border-yellow-400 bg-yellow-400/20 text-yellow-400'
                    : store.ringRecords.some(rec => rec.n === c.n)
                      ? 'border-yellow-700 text-yellow-600 hover:border-yellow-500'
                      : 'border-slate-700 text-slate-300 hover:border-slate-500']">
                n={{ c.n }} · {{ c.radius.toFixed(2) }}
              </button>
            </div>
            <div v-if="store.notice" class="text-xs text-yellow-400">{{ store.notice }}</div>
            <div class="bg-slate-900 rounded p-2 text-xs space-y-1">
              <template v-if="store.newtonResult.measuredRadius !== undefined">
                <div class="text-slate-400">当前暗环 n={{ store.selectedRingN }} 半径:
                  <span class="text-yellow-400">r = {{ store.newtonResult.measuredRadius.toFixed(2) }} mm</span>
                </div>
                <div class="text-slate-500">已记录 {{ store.ringRecords.length }} 个暗环
                  <template v-if="store.ringRecords.length < 2">（至少 2 个可拟合 R）</template>
                </div>
                <div v-if="store.newtonResult.R !== undefined">
                  拟合曲率半径: <span class="text-yellow-400">R = {{ store.newtonResult.R.toFixed(3) }} m</span>
                </div>
              </template>
              <div v-else class="text-slate-500">未选择暗环，二维图样与结果处于空态</div>
            </div>
          </template>
        </div>
      </div>
      <div class="lg:w-3/4 space-y-4">
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">干涉/衍射图样</h3>
          <canvas ref="patternRef" class="w-full rounded" style="height: 200px; background: black;"></canvas>
        </div>
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">光强分布曲线</h3>
          <canvas ref="intensityRef" class="w-full rounded" style="height: 200px; background: #0f172a;"></canvas>
        </div>
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">2D 热力图</h3>
          <canvas ref="heatmapRef" class="w-full rounded" style="height: 200px; background: black;"></canvas>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useOpticsStore, NEWTON_RADIUS_MAX_MM } from './store/optics'

const store = useOpticsStore()
const patternRef = ref<HTMLCanvasElement | null>(null)
const intensityRef = ref<HTMLCanvasElement | null>(null)
const heatmapRef = ref<HTMLCanvasElement | null>(null)

const experiments = [
  { id: 'double', name: '双缝干涉 (Young实验)' },
  { id: 'single', name: '单缝衍射 (Fraunhofer)' },
  { id: 'newton', name: '牛顿环干涉' },
]

function wavelengthToRGB(nm: number): [number, number, number] {
  let r = 0, g = 0, b = 0
  if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1.0 }
  else if (nm >= 440 && nm < 490) { g = (nm - 440) / 50; b = 1.0 }
  else if (nm >= 490 && nm < 510) { g = 1.0; b = -(nm - 510) / 20 }
  else if (nm >= 510 && nm < 580) { r = (nm - 510) / 70; g = 1.0 }
  else if (nm >= 580 && nm < 645) { r = 1.0; g = -(nm - 645) / 65 }
  else if (nm >= 645 && nm <= 780) { r = 1.0 }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

// 牛顿环径向数据索引：数据覆盖 r ∈ [0, NEWTON_RADIUS_MAX_MM]
function newtonIntensityAt(px: number, rMaxPx: number, data: number[]) {
  if (px > rMaxPx) return null // 数据窗口之外不绘制
  const idx = Math.round(px / rMaxPx * (data.length - 1))
  const v = data[Math.min(data.length - 1, Math.max(0, idx))]
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null
}

// 记录 / 选中暗环叠加在牛顿环二维图样上，保证选择、图样、结果一致
function drawNewtonRings(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const rMaxPx = Math.min(W, H) / 2
  const cx = W / 2, cy = H / 2
  for (const rec of store.ringRecords) {
    const pr = rec.radius / NEWTON_RADIUS_MAX_MM * rMaxPx
    ctx.strokeStyle = 'rgba(250,204,21,0.45)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.setLineDash([])
  const selected = store.newtonCandidates.find(c => c.n === store.selectedRingN)
  if (selected) {
    const pr = selected.radius / NEWTON_RADIUS_MAX_MM * rMaxPx
    ctx.strokeStyle = '#facc15'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#facc15'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left'
    ctx.fillText(`n=${selected.n}`, cx + pr + 4, cy - pr + 4)
  }
}

function drawPattern() {
  const canvas = patternRef.value
  if (!canvas) return
  canvas.width = canvas.clientWidth
  canvas.height = 200
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  // 空态：清空上一帧，绝不残留错误暗环 / 旧图样
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, W, H)
  if (!store.intensityData.length) return
  const [r, g, b] = wavelengthToRGB(store.params.wavelength)
  const data = store.intensityData
  if (store.currentExperiment === 'newton') {
    // 同心环：由径向光强逐像素生成，与热力图使用同一数据源
    const imgData = ctx.createImageData(W, H)
    const rMaxPx = Math.min(W, H) / 2
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const px = Math.hypot(x - W / 2, y - H / 2)
        const intensity = newtonIntensityAt(px, rMaxPx, data)
        const pos = (y * W + x) * 4
        if (intensity !== null) {
          imgData.data[pos] = r; imgData.data[pos + 1] = g; imgData.data[pos + 2] = b
          imgData.data[pos + 3] = Math.round(intensity * 255)
        }
      }
    }
    ctx.putImageData(imgData, 0, 0)
    drawNewtonRings(ctx, W, H)
    return
  }
  for (let x = 0; x < W; x++) {
    const idx = Math.round(x / W * (data.length - 1))
    const intensity = data[idx] || 0
    const alpha = Math.min(1, intensity)
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
    ctx.fillRect(x, 0, 1, H)
  }
}

function drawIntensity() {
  const canvas = intensityRef.value
  if (!canvas) return
  canvas.width = canvas.clientWidth
  canvas.height = 200
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, W, H)
  if (!store.intensityData.length) return
  const [r, g, b] = wavelengthToRGB(store.params.wavelength)
  const data = store.intensityData
  ctx.beginPath()
  ctx.strokeStyle = `rgb(${r},${g},${b})`
  ctx.lineWidth = 2
  data.forEach((v, i) => {
    const x = i / (data.length - 1) * W
    const y = H - v * (H - 10) - 5
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.stroke()
  // Fill
  ctx.fillStyle = `rgba(${r},${g},${b},0.15)`
  ctx.lineTo(W, H); ctx.lineTo(0, H)
  ctx.closePath(); ctx.fill()
  // Axes
  ctx.strokeStyle = '#475569'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#94a3b8'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
  ctx.fillText('0', W / 2, H - 2); ctx.fillText('光强 I', 30, 12); ctx.fillText('位置 x', W - 20, H - 2)
  // 牛顿环当前选中暗环：在径向曲线上同步标记，空态不绘制
  if (store.currentExperiment === 'newton') {
    const selected = store.newtonCandidates.find(c => c.n === store.selectedRingN)
    if (selected) {
      const idx = Math.round(selected.radius / NEWTON_RADIUS_MAX_MM * (data.length - 1))
      const x = idx / (data.length - 1) * W
      const y = H - (data[idx] ?? 0) * (H - 10) - 5
      ctx.fillStyle = '#facc15'
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill()
      ctx.font = '11px monospace'; ctx.textAlign = 'center'
      ctx.fillText(`n=${selected.n}`, x, y - 8)
    }
  }
}

function drawHeatmap() {
  const canvas = heatmapRef.value
  if (!canvas) return
  canvas.width = canvas.clientWidth
  canvas.height = 200
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  // 空态：清空上一帧，避免保留与当前数据不一致的图样
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, W, H)
  if (!store.intensityData.length) return
  const [r, g, b] = wavelengthToRGB(store.params.wavelength)
  const data = store.intensityData
  const imgData = ctx.createImageData(W, H)
  if (store.currentExperiment === 'newton') {
    // 牛顿环热力图与图样一致：同心环径向映射同一数据
    const rMaxPx = Math.min(W, H) / 2
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const px = Math.hypot(x - W / 2, y - H / 2)
        const intensity = newtonIntensityAt(px, rMaxPx, data)
        const pos = (y * W + x) * 4
        if (intensity !== null) {
          imgData.data[pos] = r; imgData.data[pos + 1] = g; imgData.data[pos + 2] = b
          imgData.data[pos + 3] = Math.round(intensity * 255)
        }
      }
    }
    ctx.putImageData(imgData, 0, 0)
    drawNewtonRings(ctx, W, H)
    return
  }
  for (let x = 0; x < W; x++) {
    const idx = Math.round(x / W * (data.length - 1))
    const intensity = Math.min(1, data[idx] || 0)
    for (let y = 0; y < H; y++) {
      const dist = Math.abs(y - H / 2) / (H / 2)
      const alpha = intensity * (1 - dist * 0.8) * 255
      const pos = (y * W + x) * 4
      imgData.data[pos] = r; imgData.data[pos + 1] = g; imgData.data[pos + 2] = b; imgData.data[pos + 3] = alpha
    }
  }
  ctx.putImageData(imgData, 0, 0)
}

function renderAll() { drawPattern(); drawIntensity(); drawHeatmap() }

onMounted(() => { store.compute(); setTimeout(renderAll, 100) })
watch(
  () => [store.intensityData, store.selectedRingN, store.ringRecords, store.currentExperiment, store.params.wavelength],
  () => renderAll(),
  { deep: true },
)
</script>
