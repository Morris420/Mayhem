import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ActivityChart from '../ActivityChart.vue'

const data = Array.from({ length: 14 }, (_, i) => ({
  date: `2026-11-${String(i + 1).padStart(2, '0')}`,
  completed: i === 13 ? 3 : 0,
  xp: i === 13 ? 150 : 0,
}))

describe('ActivityChart', () => {
  it('draws one slot per day and labels the busy day', () => {
    const wrapper = mount(ActivityChart, { props: { data } })
    expect(wrapper.findAll('title')).toHaveLength(14)
    expect(wrapper.text()).toContain('3 QUESTS')
  })

  it('switches to XP', async () => {
    const wrapper = mount(ActivityChart, { props: { data } })
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.text()).toContain('150')
    expect(wrapper.text()).toContain('XP')
  })
})
