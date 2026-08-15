import assert from 'node:assert'
import { afterEach, beforeEach } from 'node:test'
import {
  DefaultCopilotModel,
  type CopilotModelSelections,
  type CopilotQuotaSnapshots,
  type ICopilotQuotaSnapshot,
  getCopilotAccountCacheKey,
} from '../../../src/lib/stores/copilot-store'
import type { IBYOKProvider } from '../../../src/lib/copilot/byok'
import { Account } from '../../../src/models/account'
import type { Model } from '@github/copilot-sdk/dist/generated/rpc'
import { deriveApiType } from '../../../src/lib/api'
import { within } from './render'

// Shared fixtures for the copilot-preferences-*-test.tsx files, split out of
// what used to be one ~1500-line file. Node's test runner puts every test
// file in its own process, so splitting a single huge suite into several
// smaller ones bounds the peak memory any one process has to hold instead of
// accumulating ~50 renders' worth of jsdom/React state before that process
// exits — this is what kept OOMing CI (see script/test.mjs).

interface IAccountOptions {
  readonly isCopilotDesktopEnabled?: boolean
  readonly copilotLicenseType?: string
  readonly endpoint?: string
  readonly id?: number
  readonly login?: string
  readonly avatarURL?: string
  readonly name?: string
  readonly features?: ReadonlyArray<string>
}

export function makeAccount(options: IAccountOptions = {}): Account {
  const isCopilotDesktopEnabled =
    'isCopilotDesktopEnabled' in options
      ? options.isCopilotDesktopEnabled
      : true
  const copilotLicenseType =
    'copilotLicenseType' in options
      ? options.copilotLicenseType
      : 'COPILOT_INDIVIDUAL'

  return new Account(
    options.login ?? 'mona',
    options.endpoint ?? 'https://api.github.com',
    deriveApiType(options.endpoint ?? 'https://api.github.com'),
    'token',
    'refreshToken',
    0,
    [],
    options.avatarURL ?? 'https://avatars.githubusercontent.com/u/1',
    options.id ?? 1,
    options.name ?? 'Mona Lisa',
    'free',
    'https://copilot-proxy.githubusercontent.com',
    isCopilotDesktopEnabled,
    options.features ?? [
      'desktop_enable_copilot_sdk_commit_message_generation',
    ],
    copilotLicenseType
  )
}

export function makeModel(
  overrides: Partial<Model> & Pick<Model, 'id' | 'name'>
): Model {
  return {
    capabilities: {
      supports: { vision: false, reasoningEffort: false },
      limits: { max_context_window_tokens: 128000 },
    },
    ...overrides,
  }
}

export const defaultModel = makeModel({
  id: DefaultCopilotModel,
  name: 'Auto',
  billing: { multiplier: 1 },
})

export const otherModel = makeModel({
  id: 'claude-sonnet',
  name: 'Claude Sonnet',
  billing: { multiplier: 2 },
})

export const usageBilledModel = makeModel({
  id: 'usage-billed-model',
  name: 'Usage Billed Model',
  capabilities: {
    supports: { vision: false, reasoningEffort: true },
    limits: { max_output_tokens: 64000 },
  },
  supportedReasoningEfforts: ['low', 'medium', 'high'],
  modelPickerCategory: 'lightweight',
  modelPickerPriceCategory: 'low',
  billing: {
    tokenPrices: {
      batchSize: 1500000,
      cachePrice: 20,
      contextMax: 1436000,
      inputPrice: 200,
      outputPrice: 1200,
    },
  },
})

export const partiallyPricedModel = makeModel({
  id: 'partially-priced-model',
  name: 'Partially Priced Model',
  modelPickerCategory: 'lightweight',
  modelPickerPriceCategory: 'low',
  billing: {
    tokenPrices: {
      batchSize: 1000000,
      inputPrice: 200,
    },
  },
})

export const missingBatchSizeModel = makeModel({
  id: 'missing-batch-size-model',
  name: 'Missing Batch Size Model',
  modelPickerCategory: 'lightweight',
  modelPickerPriceCategory: 'low',
  billing: {
    tokenPrices: {
      inputPrice: 200,
      outputPrice: 1200,
    },
  },
})

export const models: ReadonlyArray<Model> = [
  defaultModel,
  otherModel,
  usageBilledModel,
]

export function makeQuotaSnapshot(
  overrides: Partial<ICopilotQuotaSnapshot> = {}
): ICopilotQuotaSnapshot {
  return {
    isUnlimitedEntitlement: false,
    entitlementRequests: 100,
    usedRequests: 25,
    usageAllowedWithExhaustedQuota: false,
    remainingPercentage: 75,
    overage: 0,
    overageAllowedWithExhaustedQuota: false,
    tokenBasedBilling: false,
    ...overrides,
  }
}

export const quotaSnapshots = new Map<string, ICopilotQuotaSnapshot>([
  ['chat', makeQuotaSnapshot()],
  [
    'premium_interactions',
    makeQuotaSnapshot({
      entitlementRequests: 300,
      usedRequests: 90,
      remainingPercentage: 70,
    }),
  ],
])

export const ollamaProvider: IBYOKProvider = {
  id: 'ollama-id',
  name: 'Ollama',
  type: 'openai',
  baseUrl: 'http://localhost:11434/v1',
  authKind: 'none',
  models: [
    { id: 'llama3', name: 'Llama 3' },
    { id: 'phi-4', name: 'Phi 4' },
  ],
}

class TestListResizeObserver implements ResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    Object.defineProperty(target, 'offsetWidth', {
      configurable: true,
      value: 365,
    })
    Object.defineProperty(target, 'offsetHeight', {
      configurable: true,
      value: 360,
    })

    const contentRect = {
      x: 0,
      y: 0,
      width: 365,
      height: 360,
      top: 0,
      right: 365,
      bottom: 360,
      left: 0,
      toJSON: () => ({}),
    }

    this.callback(
      [
        {
          target,
          contentRect,
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this
    )
  }

  public unobserve() {}

  public disconnect() {}
}

let hadGlobalResizeObserver = false
let originalGlobalResizeObserver: typeof ResizeObserver | undefined
let hadWindowResizeObserver = false
let originalWindowResizeObserver: typeof ResizeObserver | undefined

// Registered as a side effect of importing this module — every
// copilot-preferences-*-test.tsx file needs the same list-sizing mock, and
// node:test hooks registered at module-evaluation time apply to that file's
// whole implicit top-level suite, the same pattern app/test/helpers/ui/setup
// already relies on for the global RTL cleanup hook.
beforeEach(() => {
  hadGlobalResizeObserver = 'ResizeObserver' in globalThis
  originalGlobalResizeObserver = globalThis.ResizeObserver
  hadWindowResizeObserver =
    typeof window !== 'undefined' && 'ResizeObserver' in window
  originalWindowResizeObserver =
    typeof window !== 'undefined' ? window.ResizeObserver : undefined

  Object.assign(globalThis, { ResizeObserver: TestListResizeObserver })

  if (typeof window !== 'undefined') {
    Object.assign(window, { ResizeObserver: TestListResizeObserver })
  }
})

afterEach(() => {
  if (hadGlobalResizeObserver) {
    Object.assign(globalThis, { ResizeObserver: originalGlobalResizeObserver })
  } else {
    Reflect.deleteProperty(globalThis, 'ResizeObserver')
  }

  if (typeof window !== 'undefined') {
    if (hadWindowResizeObserver) {
      Object.assign(window, { ResizeObserver: originalWindowResizeObserver })
    } else {
      Reflect.deleteProperty(window, 'ResizeObserver')
    }
  }
})

export function defaults() {
  return {
    selectedCopilotModelsByAccount: new Map(),
    copilotModelsByAccount: modelsForDefaultAccount(models),
    copilotQuotaSnapshotsByAccount:
      quotaSnapshotsForDefaultAccount(quotaSnapshots),
    accounts: [makeAccount()],
    byokProviders: [],
    showBYOKSettings: false,
    onSignIn: () => {},
    onOpenCopilotPlans: () => {},
    onOpenCopilotFeatureSettings: () => {},
    alwaysUseCopilotForConflictResolution: false,
    onSelectedCopilotModelChanged: () => {},
    onAlwaysUseCopilotForConflictResolutionChanged: () => {},
    onConfigureCustomProviders: () => {},
    onConfigureModels: () => {},
  }
}

export function selectionsForDefaultAccount(
  selections: CopilotModelSelections
) {
  return new Map([[getCopilotAccountCacheKey(makeAccount()), selections]])
}

export function modelsForDefaultAccount(models: ReadonlyArray<Model> | null) {
  return new Map([[getCopilotAccountCacheKey(makeAccount()), models]])
}

export function quotaSnapshotsForDefaultAccount(
  snapshots: CopilotQuotaSnapshots | null
) {
  return new Map([[getCopilotAccountCacheKey(makeAccount()), snapshots]])
}

export function getModelPickerButton(
  container: HTMLElement
): HTMLButtonElement {
  const button = getModelPickerButtons(container)[0]

  assert.ok(button instanceof HTMLButtonElement)

  return button
}

export function getModelPickerButtons(
  container: HTMLElement
): ReadonlyArray<HTMLButtonElement> {
  const buttons = container.querySelectorAll(
    '.copilot-model-picker > .button-component'
  )

  return Array.from(buttons).filter(
    (button): button is HTMLButtonElement => button instanceof HTMLButtonElement
  )
}

export function getModelPickerButtonText(container: HTMLElement): string {
  return getModelPickerButton(container).textContent ?? ''
}

export function getListItemHeight(element: HTMLElement): string {
  const row = element.closest('.list-item')
  assert.ok(row instanceof HTMLElement)

  return row.style.height
}

export function assertElementTextContent(
  container: HTMLElement,
  selector: string,
  textContent: string
) {
  const element = Array.from(container.querySelectorAll(selector)).find(
    candidateElement => candidateElement.textContent === textContent
  )

  assert.ok(element instanceof HTMLElement)
}

export function getCostDetailsValue(
  container: HTMLElement,
  label: string
): string {
  const labelElement = within(container).getByText(label)
  const row = labelElement.closest('.copilot-model-picker-cost-details-row')
  assert.ok(row instanceof HTMLElement)

  const valueElement = row.querySelector('dd')
  assert.ok(valueElement instanceof HTMLElement)

  return valueElement.textContent ?? ''
}
