import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface DarkRingCandidate {
  /** 暗环序号（由中心向外，从 1 开始；中心暗斑不计入候选） */
  order: number
  /** 暗环半径，单位 m，直接取自强度极小值所在采样点，保证与图样一致 */
  radius: number
  /** 该极小值在 intensityData 中的采样下标 */
  index: number
}

export interface OpticsResult {
  fringe?: number
  centralWidth?: number
}

/** 选择意图：keep=沿用当前选择（参数微调）；default=进入牛顿环时的默认回退；none=显式清空；number=指定序号 */
type SelectionIntent = 'keep' | 'default' | 'none' | number

const SAMPLE_COUNT = 800
const PATTERN_HALF_WIDTH = 20e-3
/** 牛顿环采样的最大半径，单位 m（与径向 2D 图样共用） */
export const NEWTON_RADIUS_MAX_M = 5e-3
const NEWTON_RADIUS_MAX_MM = NEWTON_RADIUS_MAX_M * 1e3
const NEWTON_RADIUS_OF_CURVATURE = 1.0
/** 低于该强度的局部极小值才判定为暗环 */
const DARK_INTENSITY_MAX = 0.25
/** 同一暗环重复采到极小值时的合并间距（采样点） */
const MIN_DARK_RING_SAMPLE_GAP = 5
/** 数据完整的最小采样数，低于视为不完整数据 */
const MIN_PROFILE_SAMPLES = 100
/** 进入牛顿环实验时优先选择的暗环序号（不存在时走就近回退） */
const DEFAULT_DARK_RING_ORDER = 5

export const useOpticsStore = defineStore('optics', () => {
  const currentExperiment = ref('double')
  const params = ref({ wavelength: 550, slitWidth: 50, slitSeparation: 200, screenDistance: 1000 })
  const intensityData = ref<number[]>([])
  const result = ref<OpticsResult>({})
  /** 牛顿环暗环候选（已按序号去重）；非牛顿环实验或空态时为 [] */
  const darkRings = ref<DarkRingCandidate[]>([])
  /** 当前选中的暗环序号；null 表示空态（未选择/无候选） */
  const selectedRingOrder = ref<number | null>(null)
  /** 用户显式选择了空态（下拉“未选择暗环”）；与非法参数导致的强制空态相区分 */
  const userDeselected = ref(false)

  /** 当前选中的暗环候选，选择、二维图样标记、结果文案均以此为唯一来源 */
  const selectedRing = computed<DarkRingCandidate | null>(
    () => darkRings.value.find((ring) => ring.order === selectedRingOrder.value) ?? null,
  )

  function setExperiment(id: string) {
    currentExperiment.value = id
    // 切实验时用户空态意图不跨实验继承
    userDeselected.value = false
    // 进入牛顿环走默认回退；进入其它实验时 compute 会原子清空暗环状态
    compute(id === 'newton' ? 'default' : 'none')
  }

  /** 显式选择暗环；order 为 null 表示清空。序号越界时就近回退，无候选时进入空态 */
  function selectRing(order: number | null) {
    if (order === null) {
      userDeselected.value = true
      selectedRingOrder.value = null
      return
    }
    userDeselected.value = false
    selectedRingOrder.value = resolveRingOrder(darkRings.value, order)
  }

  /** 按 2D 图样上的半径（mm）选择最近暗环；无候选或半径非法时忽略，不改动当前选择 */
  function selectRingAtRadius(radiusMm: number) {
    const rings = darkRings.value
    if (!rings.length || !Number.isFinite(radiusMm) || radiusMm < 0) return
    let nearest = rings[0]
    for (const ring of rings) {
      if (Math.abs(ring.radius * 1e3 - radiusMm) < Math.abs(nearest.radius * 1e3 - radiusMm)) {
        nearest = ring
      }
    }
    userDeselected.value = false
    selectedRingOrder.value = nearest.order
  }

  /**
   * 统一的选择回退顺序：
   * 1. 无候选（或显式 none）→ null（空态，绝不保留旧暗环）
   * 2. 命中目标序号 → 该序号
   * 3. 目标序号越界 → 序号最接近的候选（并列时取序号较小者）
   * 4. keep 且当前本就为空态 → 维持空态
   */
  function resolveRingOrder(rings: DarkRingCandidate[], intent: SelectionIntent): number | null {
    if (!rings.length || intent === 'none') return null

    let target: number | null
    if (intent === 'default') {
      target = DEFAULT_DARK_RING_ORDER
    } else if (intent === 'keep') {
      // 用户显式空态时维持空态；若是强制空态（如非法参数）后数据恢复，则走默认回退
      if (selectedRingOrder.value === null) {
        return userDeselected.value ? null : resolveRingOrder(rings, 'default')
      }
      target = selectedRingOrder.value
    } else if (Number.isFinite(intent)) {
      target = intent
    } else {
      target = rings[0].order
    }

    const exact = rings.find((ring) => ring.order === target)
    if (exact) return exact.order

    return rings.reduce((best, ring) => {
      const bestGap = Math.abs(best.order - (target as number))
      const gap = Math.abs(ring.order - (target as number))
      return gap < bestGap || (gap === bestGap && ring.order < best.order) ? ring : best
    }).order
  }

  /**
   * 从一维强度数据中检测暗环候选：
   * 仅认可低于阈值的局部极小值；同一暗环被重复记录（平台/相邻采样）时合并、保留最暗点；
   * 最后按序号再做一次去重，保证候选序号唯一。
   */
  function detectDarkRings(data: number[]): DarkRingCandidate[] {
    const minima: { index: number; value: number }[] = []
    for (let i = 1; i < data.length - 1; i++) {
      const value = data[i]
      if (value > DARK_INTENSITY_MAX) continue
      if (value > data[i - 1] || value > data[i + 1]) continue
      const previous = minima[minima.length - 1]
      if (previous && i - previous.index < MIN_DARK_RING_SAMPLE_GAP) {
        if (value < previous.value) previous.index = i
        previous.value = Math.min(previous.value, value)
      } else {
        minima.push({ index: i, value })
      }
    }

    const byOrder = new Map<number, DarkRingCandidate>()
    minima.forEach((min, i) => {
      const order = i + 1
      if (byOrder.has(order)) return
      byOrder.set(order, {
        order,
        index: min.index,
        radius: (min.index / SAMPLE_COUNT) * NEWTON_RADIUS_MAX_M,
      })
    })
    return [...byOrder.values()].sort((a, b) => a.order - b.order)
  }

  /** 数据必须是长度充足、数值有限且落在合法光强区间内的完整剖面 */
  function isCompleteProfile(data: number[]): boolean {
    if (data.length < MIN_PROFILE_SAMPLES) return false
    return data.every((v) => Number.isFinite(v) && v >= 0 && v <= 1 + 1e-6)
  }

  function isValidParams(): boolean {
    const { wavelength: lam, slitWidth: a, slitSeparation: d, screenDistance: L } = params.value
    return [lam, a, d, L].every((v) => Number.isFinite(v) && v > 0)
  }

  /** 空态原子提交：数据、候选、选择、结果同时清空，杜绝残留错误暗环 */
  function commitEmpty(nextResult: OpticsResult) {
    intensityData.value = []
    darkRings.value = []
    selectedRingOrder.value = null
    userDeselected.value = false
    result.value = nextResult
  }

  function compute(intent: SelectionIntent = 'keep') {
    if (!isValidParams()) {
      commitEmpty({})
      return
    }

    const { wavelength: lam, slitWidth: a, slitSeparation: d, screenDistance: L } = params.value
    const lambda = lam * 1e-9
    const aM = a * 1e-6
    const dM = d * 1e-6
    const LM = L * 1e-3
    const data: number[] = []
    let nextResult: OpticsResult = {}

    if (currentExperiment.value === 'double') {
      nextResult.fringe = Math.round((lambda * LM) / dM * 1e3 * 100) / 100
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const x = (i / SAMPLE_COUNT - 0.5) * PATTERN_HALF_WIDTH * 2
        const delta = (Math.PI * dM * x) / (lambda * LM)
        const beta = (Math.PI * aM * x) / (lambda * LM) || 1e-10
        const single = Math.sin(beta) / beta
        data.push(Math.max(0, Math.cos(delta) ** 2 * single ** 2))
      }
    } else if (currentExperiment.value === 'single') {
      nextResult.centralWidth = Math.round((2 * lambda * LM) / aM * 1e3 * 100) / 100
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const x = (i / SAMPLE_COUNT - 0.5) * PATTERN_HALF_WIDTH * 2
        const beta = (Math.PI * aM * x) / (lambda * LM) || 1e-10
        data.push(Math.max(0, (Math.sin(beta) / beta) ** 2))
      }
    } else if (currentExperiment.value === 'newton') {
      const R = NEWTON_RADIUS_OF_CURVATURE
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const r = (i / SAMPLE_COUNT) * NEWTON_RADIUS_MAX_M
        const path = (r * r) / (2 * R)
        const phi = (2 * Math.PI * path) / lambda + Math.PI
        data.push(Math.max(0, 0.5 * (1 - Math.cos(phi))))
      }
    } else {
      // 未知实验类型：一律进入空态
      commitEmpty({})
      return
    }

    // 空数据 / 返回后数据不完整：不允许保留任何旧暗环或旧画面
    if (!isCompleteProfile(data)) {
      commitEmpty({})
      return
    }

    if (currentExperiment.value === 'newton') {
      const rings = detectDarkRings(data)
      // 候选、回退后的选择、一维数据在同一同步流程内提交，保持三者一致
      darkRings.value = rings
      selectedRingOrder.value = resolveRingOrder(rings, intent)
    } else {
      darkRings.value = []
      selectedRingOrder.value = null
      userDeselected.value = false
    }
    result.value = nextResult
    intensityData.value = data
  }

  return {
    currentExperiment,
    params,
    intensityData,
    result,
    darkRings,
    selectedRingOrder,
    selectedRing,
    setExperiment,
    selectRing,
    selectRingAtRadius,
    compute,
    NEWTON_RADIUS_MAX_MM,
  }
})
