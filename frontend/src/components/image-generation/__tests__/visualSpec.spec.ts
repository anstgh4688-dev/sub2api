import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const componentDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readComponent(name: string): string {
  return readFileSync(resolve(componentDir, `${name}.vue`), 'utf8')
}

const stageSource = readComponent('ImageResultStage')
const dockSource = readComponent('ImagePromptDock')
const settingsSource = readComponent('ImageSettingsPopover')

describe('ImageResultStage 视觉/控件规范 (规格 5.3)', () => {
  it('图标按钮提供 tooltip（title）', () => {
    expect(stageSource).toContain(':title="t(\'imageGeneration.result.download\')"')
    expect(stageSource).toContain(':title="t(\'imageGeneration.result.fullscreen\')"')
  })

  it('多图翻页按钮提供 aria-label 可达性标注', () => {
    expect(stageSource).toContain(":aria-label=\"t('imageGeneration.result.prev')\"")
    expect(stageSource).toContain(":aria-label=\"t('imageGeneration.result.next')\"")
  })

  it('生成阶段展示与目标比例一致的骨架（不撑开画布）', () => {
    // stage 容器有明确 aspect-ratio 类，骨架是内部绝对定位元素
    expect(stageSource).toMatch(/aspect-1\\:1/)
    expect(stageSource).toContain('stage-skeleton')
  })
})

describe('ImagePromptDock 视觉/控件规范 (规格 5.3)', () => {
  it('使用 TextArea 承载多行提示词', () => {
    expect(dockSource).toContain('TextArea')
    expect(dockSource).toContain(':rows="3"')
  })

  it('生成/停止按钮语义分离', () => {
    expect(dockSource).toContain("generating ? 'prompt-submit-stop' : 'prompt-submit-go'")
    expect(dockSource).toContain('footer.stop')
    expect(dockSource).toContain('footer.generate')
  })
})

describe('ImageSettingsPopover 视觉/控件规范 (规格 5.3)', () => {
  it('枚举类参数全部使用 Select，不把设置做成文本按钮', () => {
    // 每个枚举参数都有 Select 实例
    expect(settingsSource).toContain('<Select :model-value="settings.size"')
    expect(settingsSource).toContain('<Select :model-value="settings.quality"')
    expect(settingsSource).toContain('<Select :model-value="settings.aspect_ratio"')
    expect(settingsSource).toContain('<Select :model-value="settings.resolution"')
    expect(settingsSource).toContain('<Select :model-value="settings.output_format"')
    // 数量用下拉（1..maxImages），符合"数量用 stepper/input 或 Select"的语义
    expect(settingsSource).toContain('<Select :model-value="settings.n ?? 1"')
  })

  it('参数随模型能力渲染，不支持的能力不出现（依赖 modelProfiles 单源）', () => {
    // 每个字段都包在 profile 能力判断里
    expect(settingsSource).toContain('v-if="sizeOptions.length"')
    expect(settingsSource).toContain('v-if="qualityOptions.length"')
    expect(settingsSource).toContain('v-if="aspectOptions.length"')
    expect(settingsSource).toContain('v-if="resolutionOptions.length"')
  })

  it('圆角不超过 8px，不卡片套卡片', () => {
    expect(settingsSource).toMatch(/border-radius:\s*8px/)
    expect(settingsSource).not.toContain('border-radius: 12px')
    expect(settingsSource).not.toContain('border-radius: 16px')
  })
})
