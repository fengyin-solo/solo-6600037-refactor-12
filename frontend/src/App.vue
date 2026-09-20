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
          <div v-if="store.currentExperiment === 'newton'">
            <label class="text-xs text-slate-500">暗环候选</label>
            <select
              :disabled="!store.darkRings.length"
              :value="store.selectedRingOrder ?? ''"
              @change="onRingChange(($event.target as HTMLSelectElement).value)"
              class="w-full mt-1 bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 disabled:text-slate-500"
            >
              <option value="">{{ store.darkRings.length ? '未选择暗环（空态）' : '无暗环候选' }}</option>
              <option v-for="ring in store.darkRings" :key="ring.order" :value="ring.order">
                第 {{ ring.order }} 暗环 · r = {{ (ring.radius * 1e3).toFixed(3) }} mm
              </option>
            </select>
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
              <div class="text-yellow-400 mt-1">
                <template v-if="!store.darkRings.length">无暗环候选</template>
                <template v-else-if="!store.selectedRing">未选择暗环（空态）</template>
                <template v-else>
                  第 {{ store.selectedRing.order }} 暗环 r = {{ (store.selectedRing.radius * 1e3).toFixed(3) }} mm
                </template>
              </div>
            </div>
          </div>
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
          <h3 class="text-sm font-bold text-slate-400 mb-3">
            2D 热力图<span v-if="store.currentExperiment === 'newton'" class="text-xs font-normal text-slate-500 ml-2">点击环纹选择最近暗环</span>
          </h3>
          <canvas
            ref="heatmapRef"
            class="w-full rounded"
            style="height: 200px; background: black;"
            :class="store.currentExperiment === 'newton' ? 'cursor-crosshair' : ''"
            @click="onHeatmapClick"
          ></canvas>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useOpticsStore } from './store/optics'

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

function drawPattern() {
  const canvas = patternRef.value
  if (!canvas) return
  canvas.width = canvas.clientWidth
  canvas.height = 200
  const ctx = canvas.getContext('2d')!
  // 空态：清空上一帧，不保留旧图样
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const data = store.intensityData
  if (!data.length) return
  const W = canvas.width, H = canvas.height
  const [r, g, b] = wavelengthToRGB(store.params.wavelength)
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
  // 空态：清空上一帧，不保留旧曲线
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, W, H)
  const data = store.intensityData
  if (!data.length) return
  const [r, g, b] = wavelengthToRGB(store.params.wavelength)
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
}

function drawHeatmap() {
  const canvas = heatmapRef.value
  if (!canvas) return
  canvas.width = canvas.clientWidth
  canvas.height = 200
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  // 空态：清空上一帧，不保留旧图样（含暗环标记）
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, W, H)
  const data = store.intensityData
  if (!data.length) return
  const [r, g, b] = wavelengthToRGB(store.params.wavelength)

  if (store.currentExperiment === 'newton') {
    // 径向同心环：与一维剖面共用同一份强度数据和波长配色
    const cx = W / 2, cy = H / 2
    const scale = cy / store.NEWTON_RADIUS_MAX_MM
    const imgData = ctx.createImageData(W, H)
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const rho = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
        const idx = Math.min(data.length - 1, Math.round(rho / scale / store.NEWTON_RADIUS_MAX_MM * (data.length - 1)))
        const intensity = Math.min(1, data[idx] || 0)
        const pos = (py * W + px) * 4
        imgData.data[pos] = r
        imgData.data[pos + 1] = g
        imgData.data[pos + 2] = b
        imgData.data[pos + 3] = intensity * 255
      }
    }
    ctx.putImageData(imgData, 0, 0)

    // 当前选择的暗环标记：选择、图样、结果同源（selectedRing）
    if (store.selectedRing) {
      ctx.beginPath()
      ctx.strokeStyle = '#22d3ee'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.arc(cx, cy, store.selectedRing.radius * 1e3 * scale, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
    return
  }

  const imgData = ctx.createImageData(W, H)
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

/** 点击 2D 同心环：以点击点到中心的物理半径就近选择暗环 */
function onHeatmapClick(event: MouseEvent) {
  if (store.currentExperiment !== 'newton' || !store.darkRings.length) return
  const canvas = heatmapRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const cx = rect.width / 2, cy = rect.height / 2
  const scale = cy / store.NEWTON_RADIUS_MAX_MM
  const radiusMm = Math.sqrt(((event.clientX - rect.left) - cx) ** 2 / scale ** 2
    + ((event.clientY - rect.top) - cy) ** 2 / scale ** 2)
  store.selectRingAtRadius(radiusMm)
}

function onRingChange(value: string) {
  store.selectRing(value === '' ? null : Number(value))
}

function renderAll() { drawPattern(); drawIntensity(); drawHeatmap() }

onMounted(() => { store.compute(); setTimeout(renderAll, 100) })
// 数据或当前暗环选择变化都需重绘，保证选择、二维图样与结果一致
watch(
  () => [store.intensityData, store.selectedRingOrder, store.currentExperiment],
  () => renderAll(),
)
</script>
