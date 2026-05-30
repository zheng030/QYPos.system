import type { PosOrder, PosOrderEntry, PosOrderLine } from '@/features/pos-kernel/types'

export type PosGroupedOrderLine = {
  groupId: string
  main: PosOrderLine
  children: PosOrderLine[]
  lines: PosOrderLine[]
}

function sortGroupLines(lines: PosOrderLine[]) {
  return [...lines].sort((left, right) => {
    if (!left.parentLineId && right.parentLineId) return -1
    if (left.parentLineId && !right.parentLineId) return 1
    return left.lineId.localeCompare(right.lineId)
  })
}

export function flattenOrderEntries(entries: PosOrderEntry[] | undefined) {
  return (entries || []).flatMap((entry) => entry.lines || [])
}

export function groupOrderLines(lines: PosOrderLine[] | undefined): PosGroupedOrderLine[] {
  const ordered = lines || []
  const groups = new Map<
    string,
    {
      groupId: string
      order: number
      lines: PosOrderLine[]
    }
  >()

  ordered.forEach((line, index) => {
    const groupId = line.groupId || line.lineId
    const current = groups.get(groupId)
    if (current) {
      current.lines.push(line)
      return
    }
    groups.set(groupId, {
      groupId,
      order: index,
      lines: [line],
    })
  })

  return [...groups.values()]
    .sort((left, right) => left.order - right.order)
    .map((group) => {
      const linesInGroup = sortGroupLines(group.lines)
      const main = linesInGroup.find((line) => !line.parentLineId) || linesInGroup[0]
      return {
        groupId: group.groupId,
        main,
        children: linesInGroup.filter((line) => line.parentLineId),
        lines: linesInGroup,
      }
    })
}

export function getGroupedOrderLines(order: Pick<PosOrder, 'entries' | 'lines'> | null | undefined) {
  if (!order) {
    return []
  }

  if (Array.isArray(order.entries) && order.entries.length > 0) {
    return order.entries
      .map((entry) => groupOrderLines(entry.lines)[0])
      .filter((group): group is PosGroupedOrderLine => Boolean(group))
  }

  return groupOrderLines(order.lines)
}

export function getGroupedOrderSummary(groups: PosGroupedOrderLine[]) {
  return groups.map(({ main }) => `${main.shortName}${main.quantity > 1 ? ` x${main.quantity}` : ''}`).join('、')
}
