import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface DarkRingCandidate {
  n: number // 暗环阶数，对应公式 r = √(nλR)
  radius: number // 暗环半径 mm
  intensity: number // 采样光强
}

export interface RingRecord {
  n: number
  radius: number // mm，记录时从候选快照取值
}

export interface NewtonResult {
  measuredRadius?: number // 当前选中暗环半径 mm
  R?: number // 由已记录暗环拟合的曲率半径 m
}

// 牛顿环径向数据窗口：r ∈ [0, 5mm]，曲率半径 R = 1.0 m
export const NEWTON_RADIUS_MAX_MM = 5
const NEWTON_R = 1.0
const DATA_N = 800

export const useOpticsStore = defineStore('optics', () => {
  const currentExperiment = ref('double')
  const params = ref({ wavelength: 550, slitWidth: 50, slitSeparation: 200, screenDistance: 1000 })
  const intensityData = ref<number[]>([])
  const result = ref<{ fringe?: number; centralWidth?: number }>({})

  // 牛顿环暗环候选 / 当前选择 / 记录 / 结果，四者始终按同一顺序对齐
  const newtonCandidates = ref<DarkRingCandidate[]>([])
  const selectedRingN = ref<number | null>(null)
  const ringRecords = ref<RingRecord[]>([])
  const newtonResult = ref<NewtonResult>({})
  const notice = ref('')

  function setExperiment(id: string) {
    currentExperiment.value = id
    if (id !== 'newton') resetNewtonState()
    compute()
  }

  // 统一空态：候选、选择、记录、结果、提示一并清空
  function resetNewtonState() {
    newtonCandidates.value = []
    selectedRingN.value = null
    ringRecords.value = []
    newtonResult.value = {}
    notice.value = ''
  }

  // 参数边界校验：无效参数不产出任何数据，也不保留上一次的暗环
  function paramsValid() {
    const p = params.value
    if (!Number.isFinite(p.wavelength) || p.wavelength <= 0) return false
    if (!Number.isFinite(p.screenDistance) || p.screenDistance <= 0) return false
    if (currentExperiment.value !== 'newton') {
      if (!Number.isFinite(p.slitWidth) || p.slitWidth <= 0) return false
    }
    if (currentExperiment.value === 'double') {
      if (!Number.isFinite(p.slitSeparation) || p.slitSeparation <= 0) return false
    }
    return true
  }

  function enterEmptyState() {
    intensityData.value = []
    result.value = {}
    resetNewtonState()
    if (currentExperiment.value === 'newton') notice.value = '参数无效或数据不完整，暗环候选已清空'
  }

  function compute() {
    if (!paramsValid()) {
      enterEmptyState()
      return
    }

    const { wavelength: lam, slitWidth: a, slitSeparation: d, screenDistance: L } = params.value
    const lambda = lam * 1e-9
    const aM = a * 1e-6
    const dM = d * 1e-6
    const LM = L * 1e-3
    const data: number[] = []
    const xMax = 20e-3

    result.value = {}
    if (currentExperiment.value === 'double') {
      result.value.fringe = Math.round(lambda * LM / dM * 1e3 * 100) / 100
      for (let i = 0; i < DATA_N; i++) {
        const x = (i / DATA_N - 0.5) * xMax * 2
        const delta = Math.PI * dM * x / (lambda * LM)
        const beta = Math.PI * aM * x / (lambda * LM) || 1e-10
        const single = Math.sin(beta) / beta
        const intensity = Math.cos(delta) ** 2 * single ** 2
        data.push(Math.max(0, intensity))
      }
    } else if (currentExperiment.value === 'single') {
      result.value.centralWidth = Math.round(2 * lambda * LM / aM * 1e3 * 100) / 100
      for (let i = 0; i < DATA_N; i++) {
        const x = (i / DATA_N - 0.5) * xMax * 2
        const beta = Math.PI * aM * x / (lambda * LM) || 1e-10
        const intensity = (Math.sin(beta) / beta) ** 2
        data.push(Math.max(0, intensity))
      }
    } else { // newton
      for (let i = 0; i < DATA_N; i++) {
        const r = (i / DATA_N) * NEWTON_RADIUS_MAX_MM * 1e-3
        const path = r * r / (2 * NEWTON_R)
        const phi = 2 * Math.PI * path / lambda + Math.PI
        const intensity = 0.5 * (1 - Math.cos(phi))
        data.push(Math.max(0, intensity))
      }
    }

    // 返回后数据不完整 / 含非法值时进入空态，绝不保留旧暗环
    const dataOk = data.length === DATA_N &&
      data.every(v => Number.isFinite(v) && v >= 0 && v <= 1 + 1e-9)
    if (!dataOk) {
      enterEmptyState()
      return
    }

    intensityData.value = data
    if (currentExperiment.value === 'newton') applyNewtonData(data)
  }

  // 从径向光强中提取暗环（局部极小），相邻平台只保留一个最深点
  function detectDarkRings(data: number[], wavelengthNm: number): DarkRingCandidate[] {
    const lambda = wavelengthNm * 1e-9
    const rawIdx: number[] = []
    for (let i = 1; i < data.length - 1; i++) {
      if (data[i] < 0.02 && data[i] < data[i - 1] && data[i] <= data[i + 1]) {
        const last = rawIdx[rawIdx.length - 1]
        if (last !== undefined && i - last < 10) {
          if (data[i] < data[last]) rawIdx[rawIdx.length - 1] = i
        } else {
          rawIdx.push(i)
        }
      }
    }
    const candidates: DarkRingCandidate[] = []
    for (const idx of rawIdx) {
      const rM = (idx / data.length) * NEWTON_RADIUS_MAX_MM * 1e-3
      const n = Math.round((rM * rM) / (lambda * NEWTON_R))
      if (n <= 0) continue
      candidates.push({
        n,
        radius: Math.round(rM * 1e3 * 100) / 100,
        intensity: data[idx],
      })
    }
    return candidates
  }

  function closestCandidate(n: number): DarkRingCandidate | null {
    const list = newtonCandidates.value
    if (!list.length) return null
    let best = list[0]
    for (const c of list) {
      const dc = Math.abs(c.n - n)
      const db = Math.abs(best.n - n)
      // 越界回退：取阶数最接近的候选，并列时取较小阶数
      if (dc < db || (dc === db && c.n < best.n)) best = c
    }
    return best
  }

  // 新数据到达后的统一对齐顺序：候选 → 空态/选择回退 → 记录失效 → 结果
  function applyNewtonData(data: number[]) {
    const candidates = detectDarkRings(data, params.value.wavelength)
    newtonCandidates.value = candidates

    if (!candidates.length) {
      selectedRingN.value = null
      ringRecords.value = []
      newtonResult.value = {}
      notice.value = '当前参数下未检测到暗环候选'
      return
    }

    if (selectedRingN.value !== null &&
      !candidates.some(c => c.n === selectedRingN.value)) {
      const fallback = closestCandidate(selectedRingN.value)
      if (fallback) {
        notice.value = `暗环 n=${selectedRingN.value} 已超出候选范围，回退至 n=${fallback.n}`
        selectedRingN.value = fallback.n
      } else {
        selectedRingN.value = null
      }
    } else {
      // 选择仍然有效：清掉上一轮可能残留的提示
      notice.value = ''
    }

    // 参数变化后旧测量与新数据不再一致，统一清空，避免错误暗环残留
    ringRecords.value = []
    recomputeNewtonResult()
  }

  function selectRing(n: number | null) {
    if (!newtonCandidates.value.length) {
      selectedRingN.value = null
      ringRecords.value = []
      newtonResult.value = {}
      notice.value = '当前无暗环候选，无法选择'
      return
    }
    if (n === null) {
      selectedRingN.value = null
      notice.value = ''
      recomputeNewtonResult()
      return
    }
    if (newtonCandidates.value.some(c => c.n === n)) {
      selectedRingN.value = n
      notice.value = ''
    } else {
      // 越界选择：钳制到最接近的候选，绝不保留不存在的选择
      const fallback = closestCandidate(n)
      selectedRingN.value = fallback ? fallback.n : null
      notice.value = fallback
        ? `暗环 n=${n} 超出候选范围，已回退至 n=${fallback.n}`
        : '当前无暗环候选，无法选择'
    }
    recomputeNewtonResult()
  }

  function recordRing() {
    const n = selectedRingN.value
    if (n === null || !newtonCandidates.value.length) {
      notice.value = '请先选择一个暗环候选'
      return
    }
    const candidate = newtonCandidates.value.find(c => c.n === n)
    if (!candidate) {
      // 候选已失效：先按回退顺序修正选择，不留错误记录
      const fallback = closestCandidate(n)
      selectedRingN.value = fallback ? fallback.n : null
      ringRecords.value = ringRecords.value.filter(r =>
        newtonCandidates.value.some(c => c.n === r.n))
      recomputeNewtonResult()
      notice.value = '所选暗环已不在候选中，已回退选择'
      return
    }
    // 重复记录：同一阶数只保留一条
    if (ringRecords.value.some(r => r.n === n)) {
      notice.value = `暗环 n=${n} 已记录，请勿重复记录`
      return
    }
    ringRecords.value = [...ringRecords.value, { n: candidate.n, radius: candidate.radius }]
    notice.value = `已记录暗环 n=${n}（r=${candidate.radius.toFixed(2)} mm）`
    recomputeNewtonResult()
  }

  function clearRecords() {
    ringRecords.value = []
    notice.value = ''
    recomputeNewtonResult()
  }

  // 结果只从当前候选 / 记录派生：r² = Rλn 过原点最小二乘
  function recomputeNewtonResult() {
    const out: NewtonResult = {}
    const n = selectedRingN.value
    if (n !== null) {
      const candidate = newtonCandidates.value.find(c => c.n === n)
      if (candidate) {
        out.measuredRadius = candidate.radius
      } else {
        // 防御性对齐：选择与候选不一致时作废选择
        selectedRingN.value = null
      }
    }

    const validRecords = ringRecords.value.filter(r =>
      newtonCandidates.value.some(c => c.n === r.n && Number.isFinite(r.radius) && r.radius > 0))
    if (validRecords.length !== ringRecords.value.length) ringRecords.value = validRecords

    if (validRecords.length >= 2) {
      const lambda = params.value.wavelength * 1e-9
      let num = 0
      let den = 0
      for (const rec of validRecords) {
        const rm = rec.radius * 1e-3
        num += rec.n * rm * rm
        den += rec.n * rec.n * lambda
      }
      const R = num / den
      if (den > 0 && Number.isFinite(R)) out.R = Math.round(R * 100) / 100
    }
    newtonResult.value = out
  }

  return {
    currentExperiment,
    params,
    intensityData,
    result,
    newtonCandidates,
    selectedRingN,
    ringRecords,
    newtonResult,
    notice,
    setExperiment,
    compute,
    selectRing,
    recordRing,
    clearRecords,
  }
})
